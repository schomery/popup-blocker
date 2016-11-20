'use strict';

// Firefox does not allow to define non-configurable property over the "window" object.
var configurable = navigator.userAgent.indexOf('Firefox') !== -1;

var requests = {};
var commands = {};

// Generating 40 onetime random numbers
var oneTimeKeys = [];
for (let i = 0; i < 40; i++) {
  oneTimeKeys.push(Math.random());
}

window.addEventListener('message', e => {
  let request = e.data;
  if (request.cmd === 'popup-request') {
    chrome.runtime.sendMessage(e.data);
    requests[request.id] = e.data;
    commands[request.id] = commands[request.id] || [];
  }
  else if (request.cmd === 'popup-request-additional') {
    commands[request.id] = commands[request.id] || [];
    commands[request.id].push(e.data);
  }
});

chrome.runtime.onMessage.addListener((request) => {
  let id = request.id;

  // apply popup accept on the context where it is originally requested
  if (request.cmd === 'popup-accepted' && requests[id]) {
    let win = window.open.apply(window, requests[id].arguments);
    commands[id].forEach(obj => {
      try {
        if (obj.name === 'focus') {
          win.focus();
        }
        else {
          win.document[obj.name].apply(win.document, obj.arguments);
        }
      }
      catch (e) {}
    });
  }
  // clean up
  if (
    request.cmd === 'popup.accepted' ||
    request.cmd === 'open-tab' ||
    request.cmd === 'popup-redirect' ||
    request.cmd === 'popup-denied'
  ) {
    delete commands[id];
    delete requests[id];
  }
});

var script = document.createElement('script');
script.textContent = `
(function (wPointer, dPointer, preventDefault, stopPropagation, stopImmediatePropagation, write, isEnabled, isDomain, whitelist, keys, activeElement) {
  function permit (url) {
    // white-list section
    try {
      let h = (new URL(url)).hostname;
      for (let i = 0; i < whitelist.length; i++) {
        let hostname = whitelist[i];
        if (h && (h.endsWith(hostname) || hostname.endsWith(h))) {
          return true;
        }
      }
    }
    catch (e) {}
    // isDomain section
    if (!isDomain) {
      return false;
    }
    try {
      let hostname = window.top.location.hostname;
      let h = (new URL(url)).hostname;
      return h && (h.endsWith(hostname) || hostname.endsWith(h));
    }
    catch (e) {}
    return false;
  }

  Object.defineProperty(window, 'open', {
    writable: false,
    configurable: ${configurable},
    value: function (url, name, specs, replace) {
      if (isEnabled && !permit(url)) {
        let id = Math.random();

        // in Firefox sometimes returns document.activeElement is document.body
        window.setTimeout(() => {
          // handling about:blank cases
          let selected = document.activeElement === document.body && activeElement ? activeElement : document.activeElement;
          if (!url || url.startsWith('about:')) {
            selected.dataset.popupblocker = selected.dataset.popupblocker || id;
          }
          //
          window.postMessage({
            cmd: 'popup-request',
            type: 'window.open',
            url,
            id,
            arguments: Array.from(arguments),
            tag: selected.dataset.popupblocker
          }, '*');
        }, 100);

        return {
          document: {
            open: function () {
              window.postMessage({
                cmd: 'popup-request-additional',
                name: 'open',
                arguments: Array.from(arguments),
                id
              }, '*');
            },
            write: function () {
              window.postMessage({
                cmd: 'popup-request-additional',
                name: 'write',
                arguments: Array.from(arguments),
                id
              }, '*');
            },
            close: function () {
              window.postMessage({
                cmd: 'popup-request-additional',
                name: 'close',
                arguments: Array.from(arguments),
                id
              }, '*');
            }
          },
          focus: function () {
            window.postMessage({
              cmd: 'popup-request-additional',
              name: 'focus',
              id
            }, '*');
          },
          close: function () {
            window.postMessage({
              cmd: 'popup-request-additional',
              name: 'close',
              arguments: Array.from(arguments),
              id
            }, '*');
          }
        }
      }
      else {
        return wPointer.apply(window, arguments);
      }
    }
  });
  // link[target=_blank]
  var onclick = function (e, dynamic, child) {
    activeElement = e.target;
    if (isEnabled) {
      let a = e.target.closest('a');
      if (!a) {
        return;
      }
      let base = Array.from(document.querySelectorAll('base')).reduce((p, c) => p || c.target.toLowerCase() === '_blank' || c.target.toLowerCase() === '_parent', false);

      if ((a.target.toLowerCase() === '_blank' || a.target.toLowerCase() === '_parent' || base || dynamic) && e.button === 0 && !e.metaKey) {
        if (!permit(a.href)) {
          let id = Math.random();
          window[child ? 'top' : 'self'].postMessage({
            cmd: 'popup-request',
            type: 'target._blank',
            url: a.href,
            arguments: [a.href],
            id
          }, '*');

          e.preventDefault();
        }
      }
    }
  };
  /*
  document.addEventListener('DOMContentLoaded', () => {
    [...document.querySelectorAll('a')].forEach(a => {
      a.addEventListener('click', onclick);
    });
  });
  */
  document.addEventListener('click', onclick);

  // dynamic "a" elements
  Object.defineProperty(document, 'createElement', {
    writable: false,
    configurable: ${configurable},
    value: function (tagName) {
      let target = dPointer.apply(document, arguments);
      if (tagName.toLowerCase() === 'a') {
        target.addEventListener('click', (e) => onclick({
          target,
          button: e.button,
          preventDefault: () => e.preventDefault()
        }, true), false);
      }
      return target;
    }
  });
  // stopPropagation
  Object.defineProperty(MouseEvent.prototype, 'stopPropagation', {
    writable: false,
    configurable: ${configurable},
    value: function () {
      onclick(this);
      return stopPropagation.apply(this, arguments);
    }
  });
  // stopImmediatePropagation
  Object.defineProperty(MouseEvent.prototype, 'stopImmediatePropagation', {
    writable: false,
    configurable: ${configurable},
    value: function () {
      onclick(this);
      return stopImmediatePropagation.apply(this, arguments);
    }
  });
  // preventDefault
  Object.defineProperty(MouseEvent.prototype, 'preventDefault', {
    writable: false,
    configurable: ${configurable},
    value: function () {
      return preventDefault.apply(this, arguments);
    }
  });
  //document.write
  Object.defineProperty(document, 'write', {
    writable: false,
    configurable: ${configurable},
    value: function () {
      let rtn = write.apply(this, arguments);
      document.addEventListener('click', (e) => onclick(e, false, true));
      return rtn;
    }
  });

  window.addEventListener('message', e => {
    if (e.data.cmd === 'change-status' || e.data.cmd === 'configure') {
      let key = e.data.key;
      let index = keys.indexOf(key);
      if (index !== -1) {
        // if key is valid remove it from the list of valid keys
        keys.splice(index, 1);
      }
      else {
        return;
      }
    }
    if (e.data.cmd === 'change-status') {
        isEnabled = e.data.value;
    }
    else if (e.data.cmd === 'configure') {
      isEnabled = e.data.enabled;
      isDomain = e.data.domain;
      whitelist = e.data.whitelist;
      if (!e.data.target) {
        window.removeEventListener('click', onclick);
      }
    }
  });

})(
  window.open,
  document.createElement,
  MouseEvent.prototype.preventDefault,
  MouseEvent.prototype.stopPropagation,
  MouseEvent.prototype.stopImmediatePropagation,
  document.write,
  true,
  false,
  [],
  [${oneTimeKeys}]
);`;
document.documentElement.appendChild(script);
document.documentElement.removeChild(script);

/* Enabling and disabling the popup-blocker
 * The extension uses insecure window.postMessage to enable/disable the popup blocker;
 * To protect against malicious scripts from disabling the blocker, we are passing onetime keys along with the command
*/
var active = true;
chrome.storage.local.get({
  'enabled': true,
  'target': true,
  'domain': false,
  'popup-hosts': ['google.com', 'bing.com']
}, prefs => {
  window.postMessage({
    cmd: 'configure',
    enabled: prefs.enabled,
    target: prefs.target,
    domain: prefs.domain,
    whitelist: prefs['popup-hosts'],
    key: oneTimeKeys.shift()
  }, '*');
});
chrome.storage.onChanged.addListener(obj => {
  if (obj.enabled && active) {
    if (oneTimeKeys.length) {
      window.postMessage({
        cmd: 'change-status',
        value: obj.enabled.newValue,
        key: oneTimeKeys.shift()
      }, '*');
    }
    // only display warning once
    else if (window === window.top) {
      window.alert('Stack limit\n\nCannot change the popup-blocker status anymore. Please refresh this page.');
    }
  }
});
// is top domain white-listed
chrome.runtime.sendMessage({
  cmd: 'validate'
}, (response) => {
  if (response.valid) {
    active = false;
    window.postMessage({
      cmd: 'change-status',
      value: false,
      key: oneTimeKeys.shift()
    }, '*');
  }
});
