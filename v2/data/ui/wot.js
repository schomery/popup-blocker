/* globals doTimer */
'use strict';

var wot = {
  check: (url, hostname) => {
    if (!url || !url.startsWith('http')) {
      return Promise.reject();
    }
    return new Promise(resolve => chrome.runtime.sendMessage({
      cmd: 'wot',
      url,
      hostname
    }, r => {
      try {
        // https://www.mywot.com/wiki/API
        resolve(r);
      }
      catch (e) {
        resolve(-1);
      }
    }));
  },
  perform: (div, prefs, url, hostname, countdown) => {
    const sw = document.createElement('span');
    sw.textContent = 'Reputation Check';
    sw.classList.add('ppblocker-wot');
    div.appendChild(sw);
    wot.check(url, hostname).then(r => {
      if (r === -1) {
        sw.textContent = '[Unknown]';
      }
      else if (r >= 80) {
        sw.textContent = '[Excellent]';
      }
      else if (r >= 60) {
        sw.textContent = '[Good]';
      }
      else if (r >= 40) {
        sw.textContent = '[Unsatisfactory]';
      }
      else {
        sw.textContent = '[Poor]';
      }

      if (r >= 60) {
        const button = div.querySelector(
          prefs['simulate-allow'] ? '[data-cmd="popup-accepted"]' : '[data-cmd="open-tab"]'
        );
        doTimer(div, button, countdown);
      }
    }).catch(() => {});
  }
};
