/* globals config, wot */
'use strict';

const args = new URLSearchParams(location.search);
let prefs = '';

const entry = document.getElementById('entry');
const urls = {};
const cookie = {
  get: host => {
    const key = document.cookie.split(`${host}-action=`);
    if (key.length > 1) {
      return key[1].split(';')[0];
    }
  },
  set: (host, cmd) => {
    const days = 10;
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));

    document.cookie = `${host}-action=${cmd}; expires=${date.toGMTString()}`;
  },
  remove: host => {
    const cmd = cookie.get(host);
    if (cmd) {
      document.cookie = `${host}-action=${cmd}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
    }
  }
};

const resize = () => window.top.postMessage({
  method: 'ppp-resize',
  // Edge issue with document.documentElement.clientHeight
  height: document.documentElement.getBoundingClientRect().height,
  hide: Object.keys(urls).length === 0
}, '*');

function Timer(callback, delay, ...args) {
  let timerId;
  let start;
  let remaining = delay;

  this.pause = function() {
    window.clearTimeout(timerId);
    remaining -= new Date() - start;
  };

  this.resume = function() {
    start = new Date();
    window.clearTimeout(timerId);
    timerId = window.setTimeout(callback, remaining, ...args);
    return timerId;
  };

  this.reset = function() {
    remaining = delay;
    this.resume();
  };

  return this.resume();
}

function remove(div, url) {
  delete urls[url || div.dataset.url];
  div.remove();
  resize();
}

function onClick(e) {
  const target = e.target;
  const cmd = target.dataset.cmd;
  if (cmd) {
    const div = target.closest('.ppblocker-div');
    if (div) {
      const {url, hostname, id, frameId, sameContext} = div.dataset;
      remove(div, url, id, cmd);
      if (cmd !== 'popup-denied' && cmd !== 'popup-close') {
        // on user-action use native method
        const msg = {cmd, id, url,
          frameId: Number(frameId),
          sameContext: sameContext === 'true' || (e.isTrusted && navigator.userAgent.indexOf('Firefox') === -1)
        };
        msg.parent = args.get('parent');
        chrome.runtime.sendMessage(msg);
        // https://github.com/schomery/popup-blocker/issues/90
        if (cmd === 'white-list') {
          msg.cmd = 'popup-accepted';
          chrome.runtime.sendMessage(msg);
        }
      }
      // remember user action
      if (cmd === 'popup-close') {
        cookie.remove(hostname);
      }
      else if (hostname && ['popup-redirect', 'open-tab', 'popup-denied'].indexOf(cmd) !== -1) {
        cookie.set(hostname, cmd);
      }
    }
  }
}
document.addEventListener('click', onClick);

const doTimer = (div, button, countdown) => {
  button.dataset.default = true;
  const label = button.value;
  const id = window.setInterval(() => {
    // skip when mouse is over
    if (div.dataset.hover === 'true') {
      return;
    }
    countdown -= 1;
    if (countdown) {
      button.value = label + ` (${countdown})`;
    }
    else {
      window.clearInterval(id);
      button.click();
    }
  }, 1000);
  button.value = label + ` (${countdown})`;
};
const onPopupRequest = request => {
  const tag = request.href && request.href !== 'about:blank' ? request.href : request.id;
  // already listed
  if (urls[tag]) {
    const obj = urls[tag];
    const div = obj.div;
    div.dataset.badge = Number(div.dataset.badge || '1') + 1;
    obj.timer.reset();
    obj.timestamp = Date.now();
  }
  // new popup
  else {
    const clone = document.importNode(entry.content, true);
    const div = clone.querySelector('div');
    div.dataset.id = request.id;
    div.dataset.frameId = request.frameId;
    div.dataset.sameContext = request.sameContext;
    div.dataset.url = tag;
    const page = request.href.startsWith('http') || request.href.startsWith('ftp');
    div.dataset.page = page;
    div.dataset.hostname = request.hostname;

    const p = clone.querySelector('[data-id=info]');
    div.title = p.textContent = '↝ ' + (request.href || 'about:blank');
    // do we have an action for this popup

    if (page) {
      const action = cookie.get(div.dataset.hostname) || prefs['default-action'];
      // immediate action
      if (action && action !== 'ignore' && prefs['immediate-action']) {
        return onClick({
          target: div.querySelector(`[data-cmd="${action}"]`)
        });
      }
      // only perform automatic action when there is no native request
      // to prevent the native popup blocker catch our request
      if (prefs.countdown && request.sameContext !== true) {
        if (action) {
          // to prevent internal popup blocker from rejecting the request
          if (action !== 'popup-accepted' || prefs['simulate-allow']) {
            const button = div.querySelector(`[data-cmd="${action}"`);
            if (button) {
              doTimer(div, button, prefs.countdown);
            }
            else if (prefs.wot) {
              wot.perform(div, prefs, request.href, div.dataset.hostname, prefs.countdown);
            }
          }
        }
        else if (prefs.wot) {
          wot.perform(div, prefs, request.href, div.dataset.hostname, prefs.countdown);
        }
      }
    }
    // localization
    [...clone.querySelectorAll('[data-i18n]')].forEach(e => {
      e[e.dataset.i18nValue || 'title'] = chrome.i18n.getMessage(e.dataset.i18n);
      if (e.type === 'button') {
        e.value = chrome.i18n.getMessage(e.dataset.i18n + '_value');
      }
    });
    document.body.appendChild(clone);
    // hide on timeout
    urls[tag] = {
      div,
      timer: new Timer(remove, prefs.timeout * 1000, div),
      prefs,
      timestamp: Date.now()
    };
    div.addEventListener('mouseenter', () => {
      div.dataset.hover = true;
      urls[tag].timer.pause();
    });
    div.addEventListener('mouseleave', () => {
      div.dataset.hover = false;
      urls[tag].timer.resume();
    });
    // remove old entries
    const keys = Object.keys(urls);
    if (keys.length > prefs.numbers) {
      const key = keys.sort((a, b) => urls[a].timestamp - urls[b].timestamp)[0];
      if (key) {
        remove(urls[key].div);
      }
    }
    resize();
  }
};

const message = async (request, sender) => {
  prefs = prefs || await config.get([
    'numbers', 'timeout', 'countdown', 'default-action', 'immediate-action', 'simulate-allow', 'wot'
  ]);
  prefs.wot = false; // this API is deprecated

  // only accept requests from bg page
  if (request.cmd === 'popup-request' && !sender.tab) {
    onPopupRequest(request);
  }
  else if (request.cmd === 'allow-last-request' || request.cmd === 'deny-last-request') {
    const value = Object.values(urls).sort((a, b) => b.timestamp - a.timestamp).shift();
    if (value) {
      const div = value.div;
      const button = div.querySelector(
        request.cmd === 'allow-last-request' ? '[data-cmd="popup-accepted"]' : '[data-cmd="popup-denied"]'
      );
      if (button) {
        button.click();
      }
    }
  }
};
chrome.runtime.onMessage.addListener(message);

// initial requests from top
{
  const c = e => {
    const request = e.data;
    if (request && request.method === 'popup-caches') {
      window.removeEventListener('message', c);
      for (const o of request.requests) {
        message(o, {
          tab: false
        });
      }
    }
  };
  window.addEventListener('message', c);
}
