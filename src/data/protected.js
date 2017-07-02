/* globals overwrites, config */
'use strict';

console.log(config.sendToTop)

/* overwrites */
{
  // communication channel
  const post = (name, detail) => {
    dispatchEvent.call(config.sendToTop ? window.parent : window, new CustomEvent(name, {
      detail,
      bubbles: false,
      cancelable: false
    }));
  };
  // is this a valid URL
  const permit = (url = '') => {
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
  //////
  overwrites['window.dispatchEvent'] = function (e) {
    return e.type.startsWith('ppp-blocker-') ? false : dispatchEvent.apply(this, arguments);
  };
  /* protection #1; window.open */
  overwrites['window.open'] = function (url = '') {
    if (!isEnabled || permit(url)) {
      return wPointer.apply(window, arguments);
    }
    let id = Math.random();
    post('ppp-blocker-redirect');
    window.setTimeout(() => { // in Firefox sometimes returned document.activeElement is document.body
      // handling about:blank cases
      let selected = document.activeElement === document.body && activeElement ? activeElement : document.activeElement;
      // convert relative URL to absolute URL
      if (url && url.indexOf(':') === -1) {
        let a = document.createElement('a');
        a.href = url;
        url = a.cloneNode(false).href;
      }
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

    let iframe = {};
    iframe.document = {};
    iframe.moveTo = iframe.resizeTo = function () {};
    iframe.location = {};
    (function (callback) {
      iframe.document.open = callback.bind(this, 'open');
      iframe.document.write = callback.bind(this, 'write');
      iframe.document.close = callback.bind(this, 'close');
      iframe.focus = callback.bind(this, 'focus');
      iframe.close = callback.bind(this, 'close');
    })(function (name) {
      post('ppp-blocker-append', {
        name,
        arguments: [...arguments],
        id
      });
      return this;
    });
    return iframe;
  };
  /* protection #3; dynamic "a" creation; click is not propagation */
  overwrites['document.createElement'] = function (tagName) {
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
      }, dispatchEvent);
    }
    else if (tagName.toLowerCase() === 'form') {
      let submit = target.submit;
      protect(target, 'submit', function () {
        if (onclick(typeof event === 'undefined' ? { // firefox does not support global events
          target,
          button: 0
        } : event, target)) {
          return false;
        }
        return submit.apply(this, arguments);
      }, submit);
    }
    return target;
  };
  /* protection #4; when stopPropagation or stopImmediatePropagation is emitted, our listener will not be called anymore */
  overwrites['MouseEvent.prototype.stopPropagation'] = function () {
    if (this.type === 'click') {
      onclick(this);
    }
    return stopPropagation.apply(this, arguments);
  };
  overwrites['MouseEvent.prototype.stopImmediatePropagation'] = function () {
    if (this.type === 'click') {
      onclick(this);
    }
    return stopImmediatePropagation.apply(this, arguments);
  };
  /* protection #5; document.write; when document.open is called, old listeners are wiped out */
  overwrites['document.write'] = function () {
    let rtn = write.apply(this, arguments);
    if (document.documentElement !== documentElement) {
      document.addEventListener('click', onclick); // we need to register event listener one more time on new document creation
      documentElement = document.documentElement;
      sendToTop = true;
    }
    return rtn;
  };
  /* protection #6; Node.prototype.dispatchEvent; directly dispatching "click" event over a "a" element */
  overwrites['Node.prototype.dispatchEvent'] = function (e) {
    if (e.type === 'click' && onclick(e, this)) {
      return false;
    }
    return dispatchEvent.apply(this, arguments);
  };
}
// setup
{
  window.addEventListener('ppp-blocker-configure-domain', e => isDomain = e.detail.value);
  window.addEventListener('ppp-blocker-configure-whitelist', e => whitelist = e.detail.value);

  // install listener
  document.addEventListener('click', onclick);
  // configurations
  window.addEventListener('ppp-blocker-configure-enabled', e => {
    isEnabled = e.detail.value;
    document[isEnabled ? 'addEventListener' : 'removeEventListener']('click', onclick);
  });
  window.addEventListener('ppp-blocker-configure-target', e => {
    isTarget = e.detail.value;
    if (!isTarget) {
      document.removeEventListener('click', onclick);
    }
  });

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
}


(function (
  wPointer = window.open, // pointers -> window
  createElement = document.createElement, write = document.write, documentElement = document.documentElement, // pointers -> document
  preventDefault = MouseEvent.prototype.preventDefault, stopPropagation = MouseEvent.prototype.stopPropagation,  stopImmediatePropagation = MouseEvent.prototype.stopImmediatePropagation, // pointers -> MouseEvent
  dispatchEvent = Node.prototype.dispatchEvent, // pointers -> Node
  isEnabled = true, isDomain = false, isTarget = true, whitelist = [], // configurations
  activeElement = null // variables
) {


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
        post('ppp-blocker-redirect');
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




})();
