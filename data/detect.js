/* globals cloneInto */
'use strict';

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
'use strict';
(function (
  ePointer = window.CustomEvent, wPointer = window.open, dcPointer = document.createElement, snPointer = MouseEvent.prototype.stopPropagation, siPointer = MouseEvent.prototype.stopImmediatePropagation, dwPointer = document.write, ddPointer = document.documentElement, // pointers
  isEnabled = true, isDomain = false, isTarget = true, whitelist = [], tURL = '', // configurations
  activeElement // variables
) {
  // protect
  let protect = (parent, name, value) => Object.defineProperty(parent, name, {
    writable: false,
    // Firefox does not allow to define non-configurable property over the "window" object.
    configurable: ${navigator.userAgent.indexOf('Firefox') !== -1},
    value
  });
  let post  = (name, detail, top) => window[top ? 'top' : 'self'].document.dispatchEvent(new ePointer(name, {
    detail,
    bubbles: false,
    cancelable: false
  }));

  // protection channel; do not allow custom event generation with names starting with "ppp-blocker"
  protect(window, 'CustomEvent', function (name, prps) {
    if (name && !name.startsWith('ppp-blocker')) {
      return new ePointer(name, prps);
    }
    return new ePointer('blocked-request');
  });
  // is this URL valid
  function permit (url) {
    // white-list section
    let h;
    try {
      h = (new URL(url)).hostname;
    } catch (e) {}
    for (let i = 0; i < whitelist.length && h; i++) {
      let hostname = whitelist[i];
      if (h.endsWith(hostname) || hostname.endsWith(h)) {
        return true;
      }
    }
    // isDomain section
    if (!isDomain) {
      return false;
    }
    let hostname;
    try { // if they are not in the same origin
      hostname = tURL ? (new URL(tURL)).hostname : window.top.location.hostname;
    } catch (e) {}
    return h && hostname && (h.endsWith(hostname) || hostname.endsWith(h));
  }
  /* protection #1; window.open */
  protect(window, 'open', function (url = '') {
    if (!isEnabled || permit(url)) {
      return wPointer.apply(window, arguments);
    }

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
        arguments: [...arguments],
        tag: selected.dataset.popupblocker
      });
    }, 100);

    return {
      document: {
        open: function () {
          post('ppp-blocker-append', {
            name: 'open',
            arguments: [...arguments],
            id
          });
          return this;
        },
        write: function () {
          post('ppp-blocker-append', {
            name: 'write',
            arguments: [...arguments],
            id
          });
        },
        close: function () {
          post('ppp-blocker-append', {
            name: 'close',
            arguments: [...arguments],
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
          id
        })
      }
    };
  });
  // making the extension less visisble to external scripts
  window.open.toString = window.open.toLocaleString = () => 'function open() { [native code] }';
  /* protection #2; link[target=_blank] */
  let onclick = function (e, target, child) {
    activeElement = target = e.target || target;
    if (isEnabled) {
      let a = 'closest' in target ? target.closest('a') : null; // click after document.open
      if (!a) {
        return;
      }
      let base = [...document.querySelectorAll('base')].concat(a)
        .reduce((p, c) => p || ['_parent', '_tab', '_blank'].includes(c.target.toLowerCase()), false);

      if (base && e.button === 0 && !(e.metaKey && e.isTrusted) && !permit(a.href)) {
        post('ppp-blocker-create', {
          cmd: 'popup-request',
          type: 'target._blank',
          url: a.href,
          arguments: [a.href],
          id: Math.random()
        }, child);

        e.preventDefault();
        return true;
      }
    }
  };
  document.addEventListener('click', onclick);
  /* protection #3; dynamic "a" creation; click is not propagation */
  protect(document, 'createElement', function (tagName) {
    let target = dcPointer.apply(document, arguments);
    if (tagName.toLowerCase() === 'a') {
      target.addEventListener('click', e => onclick(e, target), false);
      // prevent dispatching click event
      let dispatchEvent = target.dispatchEvent;
      protect(target, 'dispatchEvent', function (e) {
        if (e.type === 'click' && onclick(e, target)) {
          return false;
        }
        return dispatchEvent.apply(this, arguments);
      });
    }
    return target;
  });
  /* protection #4; when stopPropagation or stopImmediatePropagation is emited, our listener will not be called anymore */
  protect(MouseEvent.prototype, 'stopPropagation', function () {
    onclick(this);
    return snPointer.apply(this, arguments);
  });
  protect(MouseEvent.prototype, 'stopImmediatePropagation', function () {
    onclick(this);
    return siPointer.apply(this, arguments);
  });
  /* protection #5; document.write; when document.open is called, old listeners are wiped out */
  protect(document, 'write', function () {
    let rtn = dwPointer.apply(this, arguments);
    if (document.documentElement !== ddPointer) {
      document.addEventListener('click', e => onclick(e, null, true));
      ddPointer = document.documentElement;
    }
    return rtn;
  });
  // configurations
  document.addEventListener('ppp-blocker-status', e => isEnabled = e.detail.value);
  document.addEventListener('ppp-blocker-top', e => tURL = e.detail.url);
  document.addEventListener('ppp-blocker-configure', e => {
    isEnabled = e.detail.enabled;
    isDomain = e.detail.domain;
    isTarget = e.detail.target;
    if (!isTarget) {
      document.removeEventListener('click', onclick);
    }
    whitelist = e.detail.whitelist;
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
})();
;`;
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
  if (response.valid) {
    active = false;
    post('ppp-blocker-status', {value: false});
  }
  post('ppp-blocker-top', {url: response.url});
});
