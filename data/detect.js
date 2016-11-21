/* globals cloneInto */
'use strict';

// Firefox does not allow to define non-configurable property over the "window" object.
var configurable = navigator.userAgent.indexOf('Firefox') !== -1;

var requests = {};
var commands = {};
var active = true;

window.cloneInto = typeof cloneInto  === 'undefined' ? function (a) {
  return a;
} : cloneInto;

function post (name, value) {
  document.dispatchEvent(new CustomEvent(name, {
    detail: cloneInto(value, document.defaultView),
    bubbles: false,
    cancelable: false
  }));
}

document.addEventListener('ppp-blocker-create', e => {
  let request = e.detail;
  chrome.runtime.sendMessage(request);
  requests[request.id] = e.detail;
  commands[request.id] = commands[request.id] || [];
});
document.addEventListener('ppp-blocker-append', e => {
  let request = e.detail;
  commands[request.id] = commands[request.id] || [];
  commands[request.id].push(request);
});

chrome.runtime.onMessage.addListener(request => {
  let id = request.id;

  // apply popup accept on the context where it is originally requested
  if (request.cmd === 'popup-accepted' && requests[id]) {
    post('ppp-blocker-exe', {
      arguments: requests[id].arguments,
      commands: commands[id]
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
(function (ePointer, wPointer, dPointer, preventDefault, stopPropagation, stopImmediatePropagation, write, isEnabled, isDomain, whitelist, activeElement) {
  // protection channel; do not allow custom event generation with names starting with "ppp-blocker"
  Object.defineProperty(window, 'CustomEvent', {
    writable: false,
    configurable: ${configurable},
    value: function (name, prps) {
      if (name && !name.startsWith('ppp-blocker')) {
        return new ePointer(name, prps);
      }
      return new ePointer('blocked-request');
    }
  });
  // is this URL valid
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

  function post (name, value, top) {
    window[top ? 'top' : 'self'].document.dispatchEvent(new ePointer(name, {
      detail: value,
      bubbles: false,
      cancelable: false
    }));
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
          post('ppp-blocker-create', {
            cmd: 'popup-request',
            type: 'window.open',
            url,
            id,
            arguments: Array.from(arguments),
            tag: selected.dataset.popupblocker
          });
        }, 100);

        return {
          document: {
            open: function () {
              post('ppp-blocker-append', {
                name: 'open',
                arguments: Array.from(arguments),
                id
              });
            },
            write: function () {
              post('ppp-blocker-append', {
                name: 'write',
                arguments: Array.from(arguments),
                id
              });
            },
            close: function () {
              post('ppp-blocker-append', {
                name: 'close',
                arguments: Array.from(arguments),
                id
              });
            }
          },
          focus: function () {
            post('ppp-blocker-append', {
              name: 'focus',
              id
            });
          },
          close: function () {
            post('ppp-blocker-append', {
              name: 'close',
              arguments: Array.from(arguments),
              id
            });
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
          post('ppp-blocker-create', {
              cmd: 'popup-request',
              type: 'target._blank',
              url: a.href,
              arguments: [a.href],
              id
          }, child);

          e.preventDefault();
        }
      }
    }
  };
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

  // configurations
  document.addEventListener('ppp-blocker-status', e => isEnabled = e.detail.value);
  document.addEventListener('ppp-blocker-configure', e => {
    isEnabled = e.detail.enabled;
    isDomain = e.detail.domain;
    whitelist = e.detail.whitelist;
    if (!e.detail.target) {
      document.removeEventListener('click', onclick);
    }
  });
  // execute
  document.addEventListener('ppp-blocker-exe', e => {
    let request = e.detail;
    let win = wPointer.apply(window, request.arguments);
    request.commands.forEach(obj => {
      if (obj.name === 'focus') {
        win.focus();
      }
      else {
        win.document[obj.name].apply(win.document, obj.arguments);
      }
    });
  });
  console.error('installed');
})(
  window.CustomEvent,
  window.open,
  document.createElement,
  MouseEvent.prototype.preventDefault,
  MouseEvent.prototype.stopPropagation,
  MouseEvent.prototype.stopImmediatePropagation,
  document.write,
  true,
  false,
  []
);`;
document.documentElement.appendChild(script);
document.documentElement.removeChild(script);

chrome.storage.local.get({
  'enabled': true,
  'target': true,
  'domain': false,
  'popup-hosts': ['google.com', 'bing.com']
}, prefs => {
  post('ppp-blocker-configure', {
    cmd: 'configure',
    enabled: prefs.enabled,
    target: prefs.target,
    domain: prefs.domain,
    whitelist: prefs['popup-hosts']
  });
});

chrome.storage.onChanged.addListener(obj => {
  if (obj.enabled && active) {
    post('ppp-blocker-status', {value: obj.enabled.newValue});
  }
});
// is top domain white-listed.
chrome.runtime.sendMessage({
  cmd: 'validate'
}, (response) => {
  if (response && response.valid) {
    active = false;
    post('ppp-blocker-status', {vslue: false});
  }
});
