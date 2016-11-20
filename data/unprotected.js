'use strict';
console.error(2)
(function (wPointer, dPointer, isEnabled, isDomain, whitelist, activeElement) {
  let keys = JSON.parse(document.currentScript.dataset.keys);
  let configurable = document.currentScript.dataset.configurable === 'false' ? false : true;

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
    configurable,
    value: function (url, name, specs, replace) {
      console.error(isEnabled , !permit(url))
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
  var onclick = function (e, dynamic) {
    activeElement = e.target;
    if (isEnabled) {
      let a = e.target.closest('a');
      let base = Array.from(document.querySelectorAll('base')).reduce((p, c) => p || c.target.toLowerCase() === '_blank' || c.target.toLowerCase() === '_parent', false);

      if (a && (a.target.toLowerCase() === '_blank' || a.target.toLowerCase() === '_parent' || base || dynamic) && e.button === 0 && !e.metaKey) {
        if (!permit(a.href)) {
          let id = Math.random();
          window.postMessage({
            cmd: 'popup-request',
            type: 'target._blank',
            url: a.href,
            arguments: [a.href],
            id
          }, '*');
          if ('stopImmediatePropagation' in e) {
            e.stopImmediatePropagation();
          }
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }
  };
  window.addEventListener('click', onclick, false);
  // dynamic "a" elements
  Object.defineProperty(document, 'createElement', {
    writable: false,
    configurable,
    value: function (tagName) {
      let target = dPointer.apply(document, arguments);
      if (tagName.toLowerCase() === 'a') {
        target.addEventListener('click', (e) => onclick({
          target,
          button: e.button,
          preventDefault: () => e.preventDefault(),
          stopPropagation: () => e.stopPropagation()
        }, true), false);
      }
      return target;
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
})(window.open, document.createElement, true, false, []);
