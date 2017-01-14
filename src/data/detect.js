'use strict';
/* globals cloneInto */

var requests = {};
var commands = {};
var active = true;

window.cloneInto = typeof cloneInto  === 'undefined' ? function (a) {
  return a;
} : cloneInto;

function post (name, value) {
  window.dispatchEvent(new CustomEvent(name, {
    detail: cloneInto(value, document.defaultView),
    bubbles: false,
    cancelable: false
  }));
}

var redirect = {
  id: null,
  active: false
};

window.addEventListener('ppp-blocker-create', (e) => {
  let request = e.detail;
  // prevent unprotected script from issuing any other commands
  if (!request || request.cmd !== 'popup-request') {
    return;
  }
  redirect.active = true;
  window.clearTimeout(redirect.id);
  window.setTimeout(() => redirect.active = false, 10000);

  // passing over the minimal needed details
  chrome.runtime.sendMessage({
    cmd: 'popup-request',
    type: request.type,
    url: request.url,
    id: request.id,
    tag: request.tag
  });
  requests[request.id] = request;
  commands[request.id] = commands[request.id] || [];
});
window.addEventListener('ppp-blocker-append', e => {
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
// prevent ad page redirection when popup displaying is unsuccessful
window.addEventListener('beforeunload', () => {
  if (window.top === window && redirect.active) {
    return `Popup Blocker (strict):

Page is trying to redirect after a popup request.
Sometimes when popup ads are blocked, page redirection to ads is replaced. Do you want to allow this?`;
  }
});

var script = document.createElement('script');
script.textContent = `
(function (
  wPointer = window.open, // pointers -> window
  createElement = document.createElement, write = document.write, documentElement = document.documentElement, // pointers -> document
  preventDefault = MouseEvent.prototype.preventDefault, stopPropagation = MouseEvent.prototype.stopPropagation,  stopImmediatePropagation = MouseEvent.prototype.stopImmediatePropagation, // pointers -> MouseEvent
  dispatchEvent = Node.prototype.dispatchEvent, // pointers -> Node
  isEnabled = true, isDomain = false, isTarget = true, whitelist = [], sendToTop = false, // configurations
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
  let post  = (name, detail) => dispatchEvent.call(sendToTop ? window.parent : window, new CustomEvent(name, {
    detail,
    bubbles: false,
    cancelable: false
  }));
  protect(window, 'dispatchEvent', function (e) {
    if (e.type.startsWith('ppp-blocker-')) {
      return false;
    }
    return dispatchEvent.apply(this, arguments);
  })
  // is this URL valid
  function permit (url = '') {
    // tags are allowed
    if (url.startsWith('#') || url.startsWith(document.location.href + '#')) {
      return true;
    }
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
        });
      },
    };
  });
  /* protection #2; link[target=_blank] or form[target=_blank] */
  let onclick = (e, target) => {
    activeElement = target = target || e.target;
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
          arguments: [a.href || a.action],
          id: Math.random()
        });
        preventDefault.apply(e);
        return true;
      }
    }
  };
  /* protection #3; dynamic "a" creation; click is not propagation */
  protect(document, 'createElement', function (tagName) {
    let target = createElement.apply(document, arguments);
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
    else if (tagName.toLowerCase() === 'form') {
      let submit = target.submit;
      protect(target, 'submit', function () {
        if (onclick(event, target)) {
          return false;
        }
        return submit.apply(this, arguments);
      });
    }
    return target;
  });
  /* protection #4; when stopPropagation or stopImmediatePropagation is emitted, our listener will not be called anymore */
  protect(MouseEvent.prototype, 'stopPropagation', function () {
    if (this.type === 'click') {
      onclick(this);
    }
    return stopPropagation.apply(this, arguments);
  });
  protect(MouseEvent.prototype, 'stopImmediatePropagation', function () {
    if (this.type === 'click') {
      onclick(this);
    }
    return stopImmediatePropagation.apply(this, arguments);
  });
  /* protection #5; document.write; when document.open is called, old listeners are wiped out */
  protect(document, 'write', function () {
    let rtn = write.apply(this, arguments);
    if (document.documentElement !== documentElement) {
      document.addEventListener('click', onclick); // we need to register event listener one more time on new document creation
      documentElement = document.documentElement;
      sendToTop = true;
    }
    return rtn;
  });
  /* protection #6; Node.prototype.dispatchEvent; directly dispatching "click" event over a "a" element */
  protect(Node.prototype, 'dispatchEvent', function (e) {
    if (e.type === 'click' && onclick(e, this)) {
      return false;
    }
    return dispatchEvent.apply(this, arguments);
  });
  // install listener
  document.addEventListener('click', onclick);
  // configurations
  window.addEventListener('ppp-blocker-configure-enabled', e => isEnabled = e.detail.value);
  window.addEventListener('ppp-blocker-configure-target', e => {
    isTarget = e.detail.value;
    if (!isTarget) {
      document.removeEventListener('click', onclick);
    }
  });
  window.addEventListener('ppp-blocker-configure-domain', e => isDomain = e.detail.value);
  window.addEventListener('ppp-blocker-configure-whitelist', e => whitelist = e.detail.value);
  // execute
  window.addEventListener('ppp-blocker-exe', e => {
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
  'popup-hosts': ['google.com', 'bing.com', 't.co'],
  'block-page-redirection': false
}, prefs => {
  post('ppp-blocker-configure-enabled', {value: prefs.enabled});
  post('ppp-blocker-configure-target', {value: prefs.target});
  post('ppp-blocker-configure-domain', {value: prefs.domain});
  post('ppp-blocker-configure-whitelist', {value: prefs['popup-hosts']});
  redirect.active = prefs['block-page-redirection'];
});

chrome.storage.onChanged.addListener(obj => {
  if (obj.enabled && active) {
    post('ppp-blocker-configure-enabled', {value: obj.enabled.newValue});
  }
  if (obj.target) {
    post('ppp-blocker-configure-target', {value: obj.target.newValue});
  }
  if (obj.domain) {
    post('ppp-blocker-configure-domain', {value: obj.domain.newValue});
  }
  if (obj['popup-hosts']) {
    post('ppp-blocker-configure-whitelist', {value: obj['popup-hosts'].newValue});
  }
  if (obj['block-page-redirection']) {
    redirect.active = obj['block-page-redirection'].newValue;
  }
});
// is top domain white-listed.
chrome.runtime.sendMessage({
  cmd: 'validate'
}, (response) => {
  if (response && response.valid) {
    active = false;
    post('ppp-blocker-configure-enabled', {value: false});
  }
});
