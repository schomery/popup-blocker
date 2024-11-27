/* global config, URLPattern */
'use strict';

const args = new URLSearchParams(location.search);
let prefs = '';

const entry = document.getElementById('entry');
const urls = {};
const cookie = {
  get: host => {
    try { // error on incognito manifest v3
      return (localStorage.getItem(host) || '').split(';')[0];
    }
    catch (e) {
      return '';
    }
  },
  set: (host, cmd) => {
    try {
      localStorage.setItem(host, cmd + ';' + (Date.now() + 10 * 24 * 60 * 60 * 1000));
    }
    catch (e) {}
  },
  remove: host => {
    try {
      localStorage.removeItem(host);
    }
    catch (e) {}
  },
  clean() {
    const now = Date.now();
    try {
      for (const [key, value] of Object.entries(localStorage)) {
        if (value && value.includes(';')) {
          const date = Number(value.split(';')[1]);
          if (date < now) {
            localStorage.removeItem(key);
          }
        }
      }
    }
    catch (e) {}
  }
};
cookie.clean();

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
  const e = div.previousElementSibling?.closest('.ppblocker-div') ||
    div.nextElementSibling?.closest('.ppblocker-div');

  const hasFocus = div.querySelector(':focus');

  div.remove();
  // focus the previous one
  if (e && hasFocus) {
    e.querySelector('[data-cmd=popup-close]').focus();
  }
  // remove iframe if no more popups present
  if (Object.keys(urls).length === 0) {
    chrome.runtime.sendMessage({
      cmd: 'popup-terminate'
    });
  }
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
const onPopupRequest = async request => {
  const tag = request.href && request.href !== 'about:blank' ? request.href : request.id;

  // already listed
  if (urls[tag] && urls[tag].div) {
    const obj = urls[tag];
    const div = obj.div;

    div.dataset.badge = Number(div.dataset.badge || '1') + 1;
    obj.timer.reset();
    obj.timestamp = Date.now();
    if (prefs['focus-popup']) {
      div.querySelector('[data-cmd=popup-close]').focus();
    }
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
    div.title = p.textContent = (request.href || 'about:blank');
    // do we have an action for this popup

    if (page) {
      const action = cookie.get(div.dataset.hostname) || prefs['default-action'];
      // immediate action
      if (action && action !== 'ignore' && prefs['immediate-action']) {
        return onClick({
          target: div.querySelector(`[data-cmd="${action}"]`)
        });
      }
      // rules
      try {
        const matched = v => {
          const action = {
            'allow': 'popup-accepted',
            'deny': 'popup-denied',
            'background': 'open-tab',
            'redirect': 'popup-redirect',
            'close': 'popup-close'
          }[v];
          const target = div.querySelector(`[data-cmd="${action}"]`);
          if (target) {
            onClick({
              target
            });
          }
        };
        for (const [match, action] of Object.entries(prefs.rules)) {
          if (action === 'interface') {
            continue;
          }

          const prefix = match.includes(':') ? match.split(':')[0].slice(0, 2) : '';

          if (prefix) {
            const dest = prefix.includes('o') ? args.get('parent') : request.href;

            if (prefix.includes('p')) {
              const [p, o] = match.slice(prefix.length + 1).split('|||');

              if (typeof URLPattern !== 'undefined') {
                const pattern = new URLPattern(p, o || ('https://' + request.hostname));
                if (pattern.test(dest)) {
                  return matched(action);
                }
              }
              else {
                alert('"URLPattern" is not supported in this browser. Please use RegExp instead.\n\n: Rule: ' + p);
              }
            }
            else if (prefix.includes('r')) {
              const re = new RegExp(match.slice(prefix.length + 1));

              if (re.test(dest)) {
                return matched(action);
              }
            }
          }
          else if (request.href === match) {
            return matched(action);
          }
        }
      }
      catch (e) {
        console.error('failed to run rules', e);
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
    // hide on timeout
    urls[tag] = { // add before append so that observer detects it
      div,
      timer: new Timer(remove, prefs.timeout * 1000, div),
      prefs,
      timestamp: Date.now()
    };
    document.getElementById('container').appendChild(clone);
    if (prefs['focus-popup']) {
      div.querySelector('[data-cmd=popup-close]').focus();
    }

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
  }
};

/* prepare storage then run */
const prepare = async c => {
  prefs = prefs || await config.get([
    'numbers', 'timeout', 'countdown', 'default-action', 'immediate-action', 'simulate-allow', 'focus-popup', 'rules'
  ]);
  c();
};

/* resize */
const resizeObserver = new ResizeObserver(entries => {
  try {
    const height = entries[0].borderBoxSize[0].blockSize;
    chrome.runtime.sendMessage({
      cmd: 'popup-resize',
      height
    });
  }
  catch (e) {}
});
resizeObserver.observe(document.body);

const message = (request, sender, response) => {
  // only accept requests from bg page
  if (request.cmd === 'popup-request' && !sender.tab) {
    prepare(() => onPopupRequest(request));
    response(true);
  }
  else if ([
    'allow-last-request', 'deny-last-request', 'background-last-request', 'redirect-last-request', 'focus-last-request'
  ].includes(request.cmd)) {
    const value = Object.values(urls).sort((a, b) => b.timestamp - a.timestamp).shift();
    if (value) {
      const div = value.div;
      if (request.cmd === 'focus-last-request') {
        div.focus();
      }
      else {
        const cmd = {
          'allow-last-request': 'popup-accepted',
          'deny-last-request': 'popup-denied',
          'background-last-request': 'open-tab',
          'redirect-last-request': 'popup-redirect'
        }[request.cmd];

        const button = div.querySelector(`[data-cmd="${cmd}"]`);
        if (button) {
          button.click();
        }
      }
    }
  }
};
chrome.runtime.onMessage.addListener(message);
addEventListener('message', e => {
  if (e.data && e.data.requests) {
    prepare(() => {
      e.data.requests.forEach(r => onPopupRequest(r));
    });
  }
});

// keyboard support for Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    e.preventDefault();
    const d = document.activeElement.closest('.ppblocker-div') || document.querySelector('.ppblocker-div');
    if (d) {
      d.querySelector('[data-cmd=popup-close]').click();
    }
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const d = document.querySelector('.ppblocker-div:has(+ .ppblocker-div:focus-within)');
    if (d) {
      d.focus();
    }
  }
  else if (e.key === 'ArrowDown') {
    e.preventDefault();
    const d = document.querySelector('.ppblocker-div:focus-within + .ppblocker-div');
    if (d) {
      d.focus();
    }
  }
});

// user styling
{
  const css = localStorage.getItem('user-styling');
  if (css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
}
