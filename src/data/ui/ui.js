'use strict';

var urls = {};

var wot = {
  check: obj => {
    if (!obj.url || !obj.url.startsWith('http')) {
      return Promise.reject();
    }
    const {hostname} = new URL(obj.url);
    return new Promise(resolve => chrome.runtime.sendMessage({
      cmd: 'wot',
      url: obj.url,
      hostname
    }, r => {
      try {
        // https://www.mywot.com/wiki/API
        resolve(r);
      }
      catch (e) {
        resolve(-1);
      }
    }));
  }
};

var cookie = {
  get: host => {
    const key = document.cookie.split(`${host}=`);
    if (key.length > 1) {
      return key[1].split(';')[0];
    }
  },
  set: (host, cmd) => {
    const days = 10;
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));

    document.cookie = `${host}=${cmd}; expires=${date.toGMTString()}`;
  },
  remove: (host) => {
    const cmd = cookie.get(host);
    if (cmd) {
      document.cookie = `${host}=${cmd}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
    }
  }
};

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
  try {
    document.body.removeChild(div);
  }
  catch (e) {}
  chrome.runtime.sendMessage({
    cmd: 'popup-number',
    number: Object.keys(urls).length
  });
}

function onClick(e) {
  const target = e.target;
  const cmd = target.dataset.cmd;
  if (cmd) {
    const div = target.parentNode.parentNode;
    if (div) {
      const {url, hostname, id, useNative} = div.dataset;
      remove(div, url, id, cmd);
      // on user-action use native method
      chrome.runtime.sendMessage({cmd, id, url,
        'use-native': useNative === 'true' || (e.isTrusted && navigator.userAgent.indexOf('Firefox') === -1)
      });
      // remember user action
      if (cmd === 'popup-close') {
        cookie.remove(hostname);
      }
      else if (hostname && cmd !== 'white-list') {
        cookie.set(hostname, cmd);
      }
    }
  }
}
document.addEventListener('click', onClick);

chrome.runtime.onMessage.addListener((request, sender) => {
  // make sure to ignore messages from page script
  if (sender.tab) {
    return;
  }
  if (request.cmd === 'popup-request' || request.cmd === 'popup-request-bounced') {
    const tag = request.url && request.url !== 'about:blank' ? request.url : request.tag;
    if (urls[tag]) {
      const obj = urls[tag];
      const div = obj.div;
      div.dataset.badge = Number(div.dataset.badge) + 1;
      obj.timer.reset();
      obj.timestamp = Date.now();
    }
    else {
      chrome.storage.local.get({
        'numbers': 5,
        'timeout': 30,
        'countdown': 5,
        'default-action': 'ignore',
        'immediate-action': false,
        'simulate-allow': true,
        'wot': true,
      }, prefs => {
        const div = document.createElement('div');
        div.setAttribute('class', 'ppblocker-div');
        div.dataset.badge = 1;
        div.dataset.id = request.id;
        div.dataset.useNative = request['use-native'];

        const buttons = document.createElement('div');

        const close = document.createElement('input');
        close.type = 'button';
        close.value = '✗';
        close.title = 'Close this notification';
        close.dataset.cmd = 'popup-close';
        const ok = document.createElement('input');
        ok.type = 'button';
        ok.value = 'allow';
        ok.title = 'Allow the page to open this popup';
        ok.dataset.cmd = 'popup-accepted';
        const redirect = document.createElement('input');
        redirect.type = 'button';
        redirect.value = 'redirect';
        redirect.title = 'Redirect current page to the new destination instead of opening it in a new tab/popup';
        redirect.dataset.cmd = 'popup-redirect';
        const background = document.createElement('input');
        background.type = 'button';
        background.value = 'background';
        background.title = 'Open link in a background tab';
        background.dataset.cmd = 'open-tab';
        const cancel = document.createElement('input');
        cancel.type = 'button';
        cancel.value = 'deny';
        cancel.title = 'Decline the popup/tab opening';
        cancel.dataset.cmd = 'popup-denied';
        const whitelist = document.createElement('input');
        whitelist.type = 'button';
        whitelist.value = 'trust';
        whitelist.title = 'White-list this domain to open popups';
        whitelist.dataset.cmd = 'white-list';

        const p1 = document.createElement('p');

        p1.textContent = 'Popup is requested for';
        const p2 = document.createElement('p');
        div.dataset.url = tag;
        div.title = p2.title = p2.textContent = '↝ ' + (request.url || 'about:blank');

        const ispage = request.url.startsWith('http') || request.url.startsWith('ftp');

        if (ispage) {
          buttons.appendChild(whitelist);
          const spacer = document.createElement('span');
          buttons.appendChild(spacer);
        }
        div.appendChild(p1);
        div.appendChild(p2);
        buttons.appendChild(cancel);
        buttons.appendChild(ok);
        buttons.appendChild(close);
        if (ispage) {
          buttons.appendChild(redirect);
          buttons.appendChild(background);
          div.dataset.hostname = (new URL(request.url)).hostname;
        }
        div.appendChild(buttons);
        const action = cookie.get(div.dataset.hostname) || prefs['default-action'];
        // immediate action
        if (action && action !== 'ignore' && prefs['immediate-action']) {
          const button = document.createElement('button');
          buttons.appendChild(button);
          button.dataset.cmd = action;

          return onClick({
            target: button
          });
        }
        document.body.appendChild(div);
        if (ispage) {
          const doTimer = button => {
            button.dataset.default = true;
            const label = button.value;
            let index = prefs.countdown;
            if (button) {
              const id = window.setInterval(() => {
                // skip when mouse is over
                if (div.dataset.hover === 'true') {
                  return;
                }

                index -= 1;
                if (index) {
                  button.value = label + ` (${index})`;
                }
                else {
                  window.clearInterval(id);
                  button.click();
                }
              }, 1000);
              button.value = label + ` (${index})`;
            }
          };
          const doWOT = () => {
            const sw = document.createElement('span');
            sw.textContent = 'Reputation Check';
            sw.classList.add('ppblocker-wot');
            div.appendChild(sw);
            wot.check(request).then(r => {
              if (r === -1) {
                sw.textContent = '[Unknown]';
              }
              else if (r >= 80) {
                sw.textContent = '[Excellent]';
              }
              else if (r >= 60) {
                sw.textContent = '[Good]';
              }
              else if (r >= 40) {
                sw.textContent = '[Unsatisfactory]';
              }
              else {
                sw.textContent = '[Poor]';
              }

              if (r >= 60) {
                const button = div.querySelector(
                  prefs['simulate-allow'] ? '[data-cmd="popup-accepted"]' : '[data-cmd="open-tab"]'
                );
                doTimer(button);
              }
            }).catch(() => {});
          };
          // only perform automatic action when there is no native request
          if (prefs.countdown && request['use-native'] === false) {
            if (action) {
              // to prevent internal popup blocker from rejecting the request
              if (action !== 'popup-accepted' || prefs['simulate-allow']) {
                const button = div.querySelector(`[data-cmd="${action}"`);
                if (button) {
                  doTimer(button);
                }
                else if (prefs.wot) {
                  doWOT();
                }
              }
            }
            else if (prefs.wot) {
              doWOT();
            }
          }
        }
        // timeout
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
        // remove extra
        const keys = Object.keys(urls);
        if (keys.length > prefs.numbers) {
          const key = keys.sort((a, b) => urls[a].timestamp - urls[b].timestamp)[0];
          if (key) {
            remove(urls[key].div);
          }
        }
        else {
          chrome.runtime.sendMessage({
            cmd: 'popup-number',
            number: Object.keys(urls).length
          });
        }
      });
    }
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
});
