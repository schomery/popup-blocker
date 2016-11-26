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
(function (
  wPointer = window.open, // pointers -> window
  dcPointer = document.createElement, dwPointer = document.write, ddPointer = document.documentElement, // pointers -> document
  pdPointer = MouseEvent.prototype.preventDefault, snPointer = MouseEvent.prototype.stopPropagation, siPointer = MouseEvent.prototype.stopImmediatePropagation, // pointers -> MouseEvent
  cPointer = CustomEvent, cpiPointer = CustomEvent.prototype.initCustomEvent, // pointers -> CustomEvent
  ndPointer = Node.prototype.dispatchEvent, // pointers -> Node
  isEnabled = true, isDomain = false, isTarget = true, whitelist = [], sendToParent = false, // configurations
  activeElement = null // variables
) {
  // protection
  let protect = (parent, name, value) =>  Object.defineProperty(parent, name, {
    writable: true, // writable = false will cause issues with TamperMonkey
    // Firefox does not allow to define non-configurable property over the "window" object.
    configurable: ${navigator.userAgent.indexOf('Firefox') !== -1},
    value
  });
  // communication channel
  let post  = (name, detail) => window[sendToParent ? 'parent' : 'self'].document.dispatchEvent(new cPointer(name, {
    detail,
    bubbles: false,
    cancelable: false
  }));
  // protection communication channel; do not allow custom event generation with used names
  protect(CustomEvent.prototype, 'initCustomEvent', function (name = '') {
    if (name.startsWith('ppp-blocker')) {
      arguments[0] = 'blocked-request';
    }
    return cpiPointer.apply(this, arguments);
  });
  protect(window, 'CustomEvent', function (name = '', prps) {
    if (name.startsWith('ppp-blocker')) {
      arguments[0] = 'blocked-request';
    }
    return new (cPointer.bind(cPointer, [...arguments]))();
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
    if (isDomain) {
      let hostname;
      try { // if they are not in the same origin
        hostname = window.top.location.hostname;
      } catch (e) {}
      return h && hostname && (h.endsWith(hostname) || hostname.endsWith(h));
    }
    return false;
  }
  /* protection #1; window.open */
  protect(window, 'open', function (url = '') {
    if (!isEnabled || permit(url)) {
      return wPointer.apply(window, arguments);
    }
    let id = Math.random();
    window.setTimeout(() => { // in Firefox sometimes returns document.activeElement is document.body
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
        },
        toString: () => '[object HTMLDocument]'
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
        });
      },
      toString: () => '[object Window]'
    };
  });
  // making the extension less visible to external scripts
  window.open.toString = window.open.toLocaleString = () => 'function open() { [native code] }';
  /* protection #2; link[target=_blank] */
  let onclick = (e, target) => {
    activeElement = target = e.target || target;
    if (isEnabled) {
      let a = 'closest' in target ? (target.closest('[target]') || target.closest('a')) : null; // click after document.open
      if (!a) {
        return;
      }
      let base = [...document.querySelectorAll('base')].concat(a)
        .filter(a => a)
        .reduce((p, c) => p || ['_parent', '_tab', '_blank'].includes(c.target.toLowerCase()), false);
      // if element is not attached, a.click() opens a new tab
      if ((base || !e.target) && (e.button === 0 && !(e.metaKey && e.isTrusted) || (e.button === 1 && !e.isTrusted)) && !permit(a.href)) {
        post('ppp-blocker-create', {
          cmd: 'popup-request',
          type: 'target._blank',
          url: a.href || a.action,
          arguments: [a.href],
          id: Math.random()
        });

        pdPointer.apply(e);
        return true;
      }
    }
  };
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
  /* protection #4; when stopPropagation or stopImmediatePropagation is emitted, our listener will not be called anymore */
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
      register(); // we need to register all event listeners one more time on new document creation
      sendToParent = true;
      ddPointer = document.documentElement;
    }
    return rtn;
  });
  /* protection #6; Node.prototype.dispatchEvent; directly dispatching "click" event over a "a" element */
  protect(Node.prototype, 'dispatchEvent', function (e) {
    if (e.type === 'click' && onclick(e, this)) {
      return false;
    }
    return ndPointer.apply(this, arguments);
  });
  // configurations
  function register () {
    document.addEventListener('click', onclick);
    document.addEventListener('ppp-blocker-status', e => isEnabled = e.detail.value);
    document.addEventListener('ppp-blocker-configure', e => {
      isEnabled = e.detail.enabled;
      isDomain = e.detail.domain;
      isTarget = e.detail.target;
      if (!isTarget) {
        document.removeEventListener('click', onclick);
      }
      whitelist = e.detail.whitelist;
    });
  }
  register();
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
  'popup-hosts': ['google.com', 'bing.com', 't.co']
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
});
