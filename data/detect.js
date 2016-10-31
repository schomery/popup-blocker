'use strict';

chrome.storage.local.get({
  'enabled': true
}, prefs => {
  let script = document.createElement('script');
  script.textContent = `
  (function (ipblocker, ipcallbacks, ipenabled, ipactive) {
    window.open = function (url, name, specs, replace) {
      if (ipenabled) {
        let id = Math.random();

        window.setTimeout(() => {
          // handling about:blank cases
          // firefox sometimes reutens document.body for document.activeElement
          let activeElement = document.activeElement === document.body && ipactive ? ipactive : document.activeElement;
          if (!url || url.startsWith('about:')) {
            activeElement.dataset.popupblocker = activeElement.dataset.popupblocker || id;
          }
          //
          window.top.postMessage({
            cmd: 'popup-request',
            type: 'window.open',
            url,
            name,
            specs,
            replace,
            id,
            tag: activeElement.dataset.popupblocker
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
    // link[target=_blank]
    window.addEventListener('click', function (e) {
      ipactive = e.target;
      if (ipenabled) {
        let a = e.target.closest('a');
        if (a && a.target === '_blank' && (e.button === 0 && !e.metaKey)) {
          let id = Math.random();
          window.top.postMessage({
            cmd: 'popup-request',
            type: 'target._blank',
            url: a.href,
            id
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

    window.addEventListener('message', e => {
      let id = e.data.id;
      if (e.data && e.data.cmd === 'popup-accepted' && ipcallbacks[id]) {
        let win = ipblocker.apply(window, ipcallbacks[id].arguments);
        ipcallbacks[id].cmds.forEach(obj => {
          try {
            win.document[obj.cmd].apply(win.document, obj.arguments);
          }
          catch (e) {}
        });
      }
      else if (e.data && e.data.cmd === 'popup-redirect' && ipcallbacks[id]) {
        window.top.location = ipcallbacks[id].arguments[0];
      }
      else if (e.data && e.data.cmd === 'popup-status') {
        ipenabled = e.data.value;
      }
    });
  })(window.open, {}, ${prefs.enabled})
  `;
  document.documentElement.appendChild(script);
});

chrome.runtime.onMessage.addListener((request) => window.postMessage(request, '*'));
