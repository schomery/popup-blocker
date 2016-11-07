'use strict';
// Firefox does not allow to define non-configurable property over the "window" object.
var configurable = navigator.userAgent.indexOf('Firefox') !== -1;
var port = {
  key: Math.random(),
  send: (obj) => {
    let script = document.createElement('script');
    script.textContent = `window.fTfgYeds('${obj.cmd}', '${obj.id}', ${obj.value}, ${port.key});`;
    document.documentElement.appendChild(script);
    // To prevent malicious scripts from reading the "key" value, the script tag is removed
    document.documentElement.removeChild(script);
  }
};

window.addEventListener('message', e => {
  if (e.data.cmd === 'popup-request') {
    chrome.runtime.sendMessage(e.data);
  }
});
chrome.runtime.onMessage.addListener(request => {
  if (
    request.cmd === 'popup-accepted' ||
    request.cmd === 'popup-status'
  ) {
    port.send(request);
  }
});

var script = document.createElement('script');
script.textContent = `
(function (ipblocker, ipcallbacks, ipenabled, key, activeElement) {
  Object.defineProperty(window, 'open', {
    writable: false,
    configurable: ${configurable},
    value: function (url, name, specs, replace) {
      if (ipenabled) {
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
            name,
            specs,
            replace,
            id,
            tag: selected.dataset.popupblocker
          }, '*');
        }, 100);

        ipcallbacks[id] = {
          arguments,
          cmds: []
        };

        return {
          document: {
            open: function () {
              ipcallbacks[id].cmds.push({
                cmd: 'open',
                arguments
              });
            },
            write: function () {
              ipcallbacks[id].cmds.push({
                cmd: 'write',
                arguments
              });
            },
            close: function () {
              ipcallbacks[id].cmds.push({
                cmd: 'close',
                arguments
              });
            }
          }
        }
      }
      else {
        return ipblocker.apply(window, arguments);
      }
    }
  });
  // link[target=_blank]
  window.addEventListener('click', function (e) {
    activeElement = e.target;
    if (ipenabled) {
      let a = e.target.closest('a');
      if (a && a.target === '_blank' && (e.button === 0 && !e.metaKey)) {
        let id = Math.random();
        window.postMessage({
          cmd: 'popup-request',
          type: 'target._blank',
          url: a.href,
          id,
        }, '*');
        ipcallbacks[id] = {
          arguments: [a.href],
          cmds: []
        };
        e.preventDefault();
        e.stopPropagation();
      }
    }
  });

  Object.defineProperty(window, 'fTfgYeds', {
    writable:false,
    configurable: ${configurable},
    value: function (cmd, id, value, ukey) {
      if (ukey !== key) {
        return;
      }

      if (cmd === 'popup-accepted' && ipcallbacks[id]) {
        let win = ipblocker.apply(window, ipcallbacks[id].arguments);
        ipcallbacks[id].cmds.forEach(obj => {
          try {
            win.document[obj.cmd].apply(win.document, obj.arguments);
          }
          catch (e) {}
        });
      }
      else if (cmd === 'popup-status') {
        ipenabled = value;
      }
    }
  });
  ipblocker.dd = function () {};
})(window.open, {}, true, ${port.key});
`;
document.documentElement.appendChild(script);
// To prevent malicious scripts from reading the "key" value, the script tag is removed
document.documentElement.removeChild(script);

chrome.storage.local.get({
  'enabled': true
}, prefs => port.send({
  cmd: 'popup-status',
  value: prefs.enabled
}));
