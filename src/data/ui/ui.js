'use strict';

var urls = {};

var cookie = {
  get: host => {
    let key = document.cookie.split(`${host}=`);
    if (key.length > 1) {
      return key[1].split(';')[0];
    }
  },
  set: (host, cmd) => {
    let days = 10;
    let date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));

    document.cookie = `${host}=${cmd}; expires=${date.toGMTString()}`;
  },
  remove: (host) => {
    let cmd = cookie.get(host);
    if (cmd) {
      document.cookie = `${host}=${cmd}; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
    }
  }
};

function Timer (callback, delay, ...args) {
  let timerId, start, remaining = delay;

  this.pause = function () {
    window.clearTimeout(timerId);
    remaining -= new Date() - start;
  };

  this.resume = function () {
    start = new Date();
    window.clearTimeout(timerId);
    timerId = window.setTimeout(callback, remaining, ...args);
    return timerId;
  };

  this.reset = function () {
    remaining = delay;
    this.resume();
  };

  return this.resume();
}

function remove (div) {
  delete urls[div.dataset.url];
  try {
    document.body.removeChild(div);
  }
  catch (e) {}
  chrome.runtime.sendMessage({
    cmd: 'popup-number',
    number: Object.keys(urls).length
  });
}

document.addEventListener('click', e => {
  let target = e.target;
  let cmd = target.dataset.cmd;
  if (cmd) {
    let div = target.parentNode.parentNode;
    if (div) {
      let url = div.dataset.url;
      let hostname = div.dataset.hostname;
      let id = div.dataset.id;
      remove(div);
      chrome.runtime.sendMessage({cmd, id, url});
      // remember user action
      if (cmd === 'popup-close') {
        cookie.remove(hostname);
      }
      else if (hostname && (cmd !== 'white-list' && cmd !== 'popup-accepted')) {
        cookie.set(hostname, cmd);
      }
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender) => {
  // make sure to ignore messages from page script
  if (sender.tab) {
    return;
  }
  if (request.cmd === 'popup-request' || request.cmd === 'popup-request-bounced') {
    let tag  = request.url && request.url !== 'about:blank' ? request.url : request.tag;
    if (urls[tag]) {
      let obj = urls[tag];
      let div = obj.div;
      div.dataset.badge = +div.dataset.badge + 1;
      obj.timer.reset();
      obj.timestamp = Date.now();
    }
    else {
      chrome.storage.local.get({
        'numbers': 5,
        'timeout': 30,
        'countdown': 5,
        'default-action': 'ignore'
      }, (prefs) => {
        let div = document.createElement('div');
        div.setAttribute('class', 'ppblocker-div');
        div.dataset.badge = 1;
        div.dataset.id = request.id;

        let buttons = document.createElement('div');

        let close = document.createElement('input');
        close.type = 'button';
        close.value =  '✗';
        close.title = 'Close this notification';
        close.dataset.cmd = 'popup-close';
        let ok = document.createElement('input');
        ok.type = 'button';
        ok.value = 'allow';
        ok.title = 'Allow the page to open this popup';
        ok.dataset.cmd = 'popup-accepted';
        let redirect = document.createElement('input');
        redirect.type = 'button';
        redirect.value = 'redirect';
        redirect.title = 'Redirect current page to the new destination instead of opening it in a new tab/popup';
        redirect.dataset.cmd = 'popup-redirect';
        let background = document.createElement('input');
        background.type = 'button';
        background.value = 'background';
        background.title = 'Open link in a background tab';
        background.dataset.cmd = 'open-tab';
        let cancel = document.createElement('input');
        cancel.type = 'button';
        cancel.value = 'deny';
        cancel.title = 'Decline the popup/tab opening';
        cancel.dataset.cmd = 'popup-denied';
        let whitelist = document.createElement('input');
        whitelist.type = 'button';
        whitelist.value = 'trust';
        whitelist.title = 'White-list this domain to open popups';
        whitelist.dataset.cmd = 'white-list';

        let p1 = document.createElement('p');

        p1.textContent = 'Popup is requested for';
        let p2 = document.createElement('p');
        div.dataset.url = tag;
        div.title = p2.title = p2.textContent = '↝ ' + (request.url || 'about:blank');

        let ispage = request.url.startsWith('http') || request.url.startsWith('ftp');

        if (ispage) {
          buttons.appendChild(whitelist);
          let spacer = document.createElement('span');
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
        }
        div.appendChild(buttons);
        document.body.appendChild(div);
        if (ispage && prefs.countdown) {
          div.dataset.hostname = (new URL(request.url)).hostname;
          let action = cookie.get(div.dataset.hostname) || prefs['default-action'];
          if (action) {
            let button = div.querySelector(`[data-cmd="${action}"`);
            if (button) {
              button.dataset.default = true;
              let label = button.value;
              let index = prefs.countdown;
              if (button) {
                let id = window.setInterval(() => {
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
        //
        // remove extra
        let keys = Object.keys(urls);
        if (keys.length > prefs.numbers) {
          let key = keys.sort((a, b) => urls[a].timestamp - urls[b].timestamp)[0];
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
});
