/* global config */
'use strict';

const args = new URLSearchParams(location.search);
let prefs = '';

const entry = document.getElementById('entry');
const urls = {};
const cookie = {
  get: host => {
    return (localStorage.getItem(host) || '').split(';')[0];
  },
  set: (host, cmd) => {
    localStorage.setItem(host, cmd + ';' + (Date.now() + 10 * 24 * 60 * 60 * 1000));
  },
  remove: host => {
    localStorage.removeItem(host);
  },
  clean() {
    const now = Date.now();
    for (const [key, value] of Object.entries(localStorage)) {
      if (value && value.includes(';')) {
        const date = Number(value.split(';')[1]);
        if (date < now) {
          localStorage.removeItem(key);
        }
      }
    }
  }
};
cookie.clean();

const resize = () => chrome.scripting.executeScript({
  target: {
    tabId: Number(args.get('tabId'))
  },
  func: (hide, height) => {
    if (hide) {
      window.container.remove();
      window.container = null;
    }
    else {
      window.container.style.height = height + 'px';
    }
  },
  args: [
    Object.keys(urls).length === 0,
    document.documentElement.getBoundingClientRect().height
  ]
});

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
      if (cmd !== 'popup-denied' && cmd !== 'popup-close') {
        // on user-action use native method
        const msg = {cmd, id, url,
          frameId: Number(frameId),
          sameContext: sameContext === 'true' || (e.isTrusted && navigator.userAgent.indexOf('Firefox') === -1)
        };
        msg.parent = args.get('parent');

        // https://github.com/schomery/popup-blocker/issues/90
        if (cmd === 'white-list') {
          clearTimeout(target.timeout);
          if (target.confirm) {
            chrome.runtime.sendMessage(msg);
            msg.cmd = 'popup-accepted';
            chrome.runtime.sendMessage(msg);

            target.confirm = false;
            target.value = chrome.i18n.getMessage('ui_button_trust_value');
          }
          else {
            target.confirm = true;

            target.timeout = setTimeout(() => {
              target.confirm = false;
              target.value = chrome.i18n.getMessage('ui_button_trust_value');
            }, 3000);
            target.value = chrome.i18n.getMessage('ui_button_trust_confirm');

            return;
          }
        }
        else {
          chrome.runtime.sendMessage(msg);
        }
      }
      // remember user action
      if (cmd === 'popup-close') {
        cookie.remove(hostname);
      }
      else if (hostname && ['popup-redirect', 'open-tab', 'popup-denied'].includes(cmd)) {
        cookie.set(hostname, cmd);
      }

      setTimeout(() => remove(div, url, id, cmd), 100);
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
  if (urls[tag] && urls[tag].div) {
    const obj = urls[tag];
    const div = obj.div;

    console.log(div);

    div.dataset.badge = Number(div.dataset.badge || '1') + 1;
    obj.timer.reset();
    obj.timestamp = Date.now();
    div.querySelector('[data-cmd=popup-close]').focus();
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
          }
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
    div.querySelector('[data-cmd=popup-close]').focus();
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

/* prepare storage then run */
const prepare = async c => {
  prefs = prefs || await config.get([
    'numbers', 'timeout', 'countdown', 'default-action', 'immediate-action', 'simulate-allow'
  ]);
  c();
};

const message = (request, sender, response) => {
  // only accept requests from bg page
  if (request.cmd === 'popup-request' && !sender.tab) {
    prepare(() => onPopupRequest(request));
    response(true);
  }
  else if (request.cmd === 'cached-popup-requests' && request.tabId.toString() === args.get('tabId')) {
    prepare(() => {
      request.requests.forEach(r => onPopupRequest(r));
    });
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

// keyboard support for Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const d = document.activeElement.closest('.ppblocker-div') || document.querySelector('.ppblocker-div');
    if (d) {
      d.querySelector('[data-cmd=popup-close]').click();
    }
  }
});
