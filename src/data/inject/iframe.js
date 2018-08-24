'use strict';

{
  let iframe;
  chrome.runtime.onMessage.addListener(request => {
    if (request.cmd === 'popup-request') {
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.src = chrome.runtime.getURL('data/ui/ui.html?request=' + encodeURIComponent(JSON.stringify(request)));
        iframe.setAttribute('style', `
          z-index: 2147483649;
          position: fixed;
          right: 10px;
          top: 10px;
          width: 350px;
          max-width: 80vw;
          height: 85px;
          border: none;
          background: transparent;
          border-radius: 0;
        `);
        // do not attach to body to make sure the notification is visible
        document.documentElement.appendChild(iframe);
      }
      // always reattach to make sure the iframe is accessible
      if (document.elementsFromPoint) { // Edge does not support elementsFromPoint
        const es = document.elementsFromPoint(iframe.offsetLeft, iframe.offsetTop);
        const index = es.indexOf(iframe);
        if (index !== 0) {
          // this is going to refresh the iframe
          document.body.appendChild(iframe);
        }
      }
    }
  });
  window.addEventListener('message', e => {
    const request = e.data;
    if (request && request.method === 'ppp-resize') {
      e.preventDefault();
      e.stopPropagation();
      if (request.hide) {
        iframe.remove();
        iframe = null;
      }
      else {
        iframe.style.height = request.height + 'px';
      }
    }
  });
}
