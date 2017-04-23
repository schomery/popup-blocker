'use strict';

var iframe;

chrome.runtime.onMessage.addListener(request => {
  if (request.cmd === 'popup-request') {
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('data/ui/ui.html');
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
      iframe.onload = () => {
        request.cmd = 'popup-request-bounced';
        chrome.runtime.sendMessage(request);
        iframe.onload = null;
      };
      document.body.appendChild(iframe);
    }
  }
  else if (request.cmd === 'popup-number') {
    if (iframe) {
      if (request.number) {
        iframe.style.height = (request.number * (85 + 8 + 5)) + 'px';
      }
      else {
        document.body.removeChild(iframe);
        iframe = null;
      }
    }
  }
});
