'use strict';

chrome.storage.local.get({
  'enabled': true
}, prefs => {
  let script = document.createElement('script');
  script.textContent = `
    if (typeof ipblocker === 'undefined') {
      var ipblocker = window.open;
      var ipcallbacks = {};
      var ipenabled = ${prefs.enabled};
      // window open
      window.open = function (url, name, specs, replace) {
        if (ipenabled) {
          let id = Math.random();
          // handling about:blank cases
          if (!url || url.startsWith('about:')) {
            document.activeElement.dataset.popupblocker = document.activeElement.dataset.popupblocker || id;
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
            tag: document.activeElement.dataset.popupblocker
          }, '*');
          ipcallbacks[id] = {
            arguments: Array.from(arguments),
            cmds: []
          };

          return {
            document: {
              open: function () {
                ipcallbacks[id].cmds.push({
                  cmd: 'open',
                  arguments: Array.from(arguments)
                });
              },
              write: function () {
                ipcallbacks[id].cmds.push({
                  cmd: 'write',
                  arguments: Array.from(arguments)
                });
              },
              close: function () {
                ipcallbacks[id].cmds.push({
                  cmd: 'close',
                  arguments: Array.from(arguments)
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
      window.addEventListener('click', e => {
        if (ipenabled) {
          let a = e.target.closest('a');
          if (a && a.target === '_blank' && e.button === 0) {
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
        if (e.data && e.data.cmd === 'popup-accepted' && ipcallbacks[e.data.id]) {
          let win = ipblocker.apply(window, ipcallbacks[e.data.id].arguments);
          ipcallbacks[e.data.id].cmds.forEach(obj => {
            try {
              win.document[obj.cmd].apply(win.document, obj.arguments);
            }
            catch (e) {}
          });
        }
        else if (e.data && e.data.cmd === 'popup-status') {
          ipenabled = e.data.value;
        }
      });
    }
  `;
  document.documentElement.appendChild(script);
});

chrome.runtime.onMessage.addListener((request) => {
  window.postMessage(request, '*');
});
