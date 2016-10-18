'use strict';

var script = document.createElement('script');
script.textContent = `
  let ipblocker = window.open;
  let callbacks = {};
  // window open
  window.open = function (url, name, specs, replace) {
    let id = Math.random();
    window.top.postMessage({
      cmd: 'popup-request',
      type: 'window.open',
      url,
      name,
      specs,
      replace,
      id
    }, '*');
    callbacks[id] = Array.from(arguments);
  }
  // link[target=_blank]
  window.addEventListener('click', e => {
    let a = e.target.closest('a');
    if (a && a.target === '_blank' && e.button === 0) {
      let id = Math.random();
      window.top.postMessage({
        cmd: 'popup-request',
        type: 'target._blank',
        url: a.href,
        id
      }, '*');
      callbacks[id] = [a.href];
      e.preventDefault();
      e.stopPropagation();
    }
  });

  window.addEventListener('message', e => {
    if (e.data && e.data.cmd === 'popup-accepted' && callbacks[e.data.id]) {
      ipblocker.apply(null, callbacks[e.data.id]);
    }
  });
`;
document.documentElement.appendChild(script);

chrome.runtime.onMessage.addListener((request) => {
  if (request.cmd === 'popup-accepted') {
    window.postMessage(request, '*');
  }
});
