'use strict';

var urls = {};

function remove (div) {
  delete urls[div.dataset.url];
  try {
    document.body.removeChild(div);
  }
  catch (e) {}
  chrome.runtime.sendMessage({
    cmd: 'popup-number',
    number: Object.keys(urls).length
  });
}

document.addEventListener('click', e => {
  let target = e.target;
  let cmd = target.dataset.cmd;
  if (cmd) {
    let div = target.parentNode.parentNode;
    if (div) {
      let url = div.dataset.url;
      let id = div.dataset.id;
      remove(div);
      chrome.runtime.sendMessage({cmd, id, url});
    }
  }
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.cmd === 'popup-request' || request.cmd === 'popup-request-bounced') {
    let tag  = request.url && request.url !== 'about:blank' ? request.url : request.tag;
    if (urls[tag]) {
      let obj = urls[tag];
      let div = obj.div;
      div.dataset.badge = +div.dataset.badge + 1;
      window.clearTimeout(obj.id);
      obj.id = window.setTimeout(remove, obj.prefs.timeout * 1000, div);
      obj.timestamp = (new Date()).getTime();
    }
    else {
      chrome.storage.local.get({
        numbers: 5,
        timeout: 30
      }, (prefs) => {
        let div = document.createElement('div');
        div.setAttribute('class', 'ppblocker-div');
        div.dataset.badge = 1;
        div.dataset.id = request.id;
        let buttons = document.createElement('div');

        let ok = document.createElement('input');
        ok.type = 'button';
        ok.value = 'allow';
        ok.title = 'Allow the page to open this popup';
        ok.dataset.cmd = 'popup-accepted';
        let redirect = document.createElement('input');
        redirect.type = 'button';
        redirect.value = 'redirect';
        redirect.title = 'Redirect current page to the new destination instead of opening it in a new tab/popup';
        redirect.dataset.cmd = 'popup-redirect';
        let background = document.createElement('input');
        background.type = 'button';
        background.value = 'background';
        background.title = 'Open link in a background tab';
        background.dataset.cmd = 'open-tab';
        let cancel = document.createElement('input');
        cancel.type = 'button';
        cancel.value = 'deny';
        cancel.title = 'Decline the popup/tab opening';
        cancel.dataset.cmd = 'popup-denied';

        let p1 = document.createElement('p');

        p1.textContent = 'Popup is requested for';
        let p2 = document.createElement('p');
        div.dataset.url = tag;
        p2.title = p2.textContent = '↝ ' + (request.url || 'about:blank');

        div.appendChild(p1);
        div.appendChild(p2);
        buttons.appendChild(cancel);
        buttons.appendChild(ok);
        if (request.url.indexOf('://') !== -1) {
          buttons.appendChild(redirect);
          buttons.appendChild(background);
        }
        div.appendChild(buttons);
        document.body.appendChild(div);
        // timeout
        urls[tag] = {
          div,
          id: window.setTimeout(remove, prefs.timeout * 1000, div),
          prefs,
          timestamp: (new Date()).getTime()
        };
        //
        chrome.runtime.sendMessage({
          cmd: 'popup-number',
          number: Object.keys(urls).length
        });
        // remove extra
        let keys = Object.keys(urls);
        if (keys.length > prefs.numbers) {
          let key = keys.sort((a, b) => urls[a].timestamp - urls[b].timestamp)[0];
          if (key) {
            remove(urls[key].div);
          }
        }
      });
    }
  }
});
