'use strict';
// Firefox does not allow to define non-configurable property over the "window" object.
var configurable = navigator.userAgent.indexOf('Firefox') !== -1;

var requests = {};
var commands = {};

// Generating 20 onetime random numbers
var oneTimeKeys = [];
for (let i = 0; i < 20; i++) {
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
(function (pointer, isEnabled, keys, activeElement) {
  Object.defineProperty(window, 'open', {
    writable: false,
    configurable: ${configurable},
    value: function (url, name, specs, replace) {
      if (isEnabled) {
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
          }
        }
      }
      else {
        return pointer.apply(window, arguments);
      }
    }
  });
  // link[target=_blank]
  window.addEventListener('click', function (e) {
    activeElement = e.target;
    if (isEnabled) {
      let a = e.target.closest('a');
      if (a && a.target === '_blank' && (e.button === 0 && !e.metaKey)) {
        let id = Math.random();
        window.postMessage({
          cmd: 'popup-request',
          type: 'target._blank',
          url: a.href,
          arguments: [a.href],
          id
        }, '*');
        e.preventDefault();
        e.stopPropagation();
      }
    }
  });

  window.addEventListener('message', e => {
    if (e.data.cmd === 'change-status') {
      let key = e.data.key;
      let index = keys.indexOf(key);
      if (index !== -1) {
        // if key is valid remove it from the list of valid keys
        keys.splice(index, 1);
        isEnabled = e.data.value;
      }
    }
  });

})(window.open, true, [${oneTimeKeys}]);
`;
document.documentElement.appendChild(script);
document.documentElement.removeChild(script);

/* Enabling and disabling the popup-blocker
 * The extension uses insecure window.postMessage to enable/disable the popup blocker;
 * To protect against malicious scripts from disabling the blocker, we are passing onetime keys along with the command
*/
chrome.storage.local.get({
  'enabled': true
}, prefs => {
  // by default the popup-blocker is enabled; only send the "change-status" signal if it is disabled
  if (!prefs.enabled) {
    window.postMessage({
      cmd: 'change-status',
      value: false,
      key: oneTimeKeys.shift()
    }, '*');
  }
});
chrome.storage.onChanged.addListener(obj => {
  if (obj.enabled) {
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
