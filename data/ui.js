'use strict';

var container;
var urls = {};

function remove (div) {
  delete urls[div.dataset.url];
  container.removeChild(div);
}

window.addEventListener('message', e => {
  if (e.data && e.data.cmd === 'popup-request') {
    if (!container) {
      container = document.createElement('div');
      container.style = `
        position: fixed;
        top: 10px;
        right: 10px;
        font-size: 13px;
        font-family: arial,sans-serif;
        z-index: 100000000000000;
        direction: ltr;
      `;
      document.body.appendChild(container);
      let style = document.createElement('style');
      style.textContent = `
        .ppblocker-div {
          position: relative;
          text-shadow: none;
          box-sizing: content-box;
        }
        .ppblocker-div:before {
          content: attr(data-badge);
          position: absolute;
          top: -8px;
          right: -8px;
          border: solid 2px #fff;
          border-radius: 50%;
          background-color: #fc0d1b;
          color: #fff;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 80%;
        }
        .ppblocker-div[data-badge="1"]:before {
          display: none;
        }
      `;
      document.body.appendChild(style);
    }
    if (urls[e.data.url]) {
      let obj = urls[e.data.url];
      let div = obj.div;
      div.dataset.badge = +div.dataset.badge + 1;
      window.clearTimeout(obj.id);
      obj.id = window.setTimeout(remove, obj.prefs.timeout * 1000, div);
      obj.timestamp = (new Date()).getTime();
    }
    else {
      chrome.storage.local.get({
        numbers: 3,
        timeout: 30
      }, (prefs) => {
        let div = document.createElement('div');
        div.setAttribute('class', 'ppblocker-div');
        div.dataset.badge = 1;
        div.style = `
          border: solid 1px #cebc7d;
          width: 250px;
          height: 70px;
          background-color: #f4e1a7;
          color: #000;
          padding: 5px;
          display: flex;
          flex-direction: column;
          margin-bottom: 5px;
        `;
        let buttons = document.createElement('div');
        buttons.style = `
          display: flex;
          justify-content: flex-end;
        `;
        let ok = document.createElement('input');
        ok.type = 'button';
        ok.value = 'allow';
        ok.addEventListener('click', (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          chrome.runtime.sendMessage({
            cmd: 'popup-accepted',
            id: e.data.id
          });
          remove(div);
        }, true);
        let cancel = document.createElement('input');
        cancel.type = 'button';
        cancel.value = 'deny';
        cancel.addEventListener('click', (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          remove(div);
        }, true);
        cancel.style = ok.style = `
          border: solid 1px #999;
          background-color: #fff;
          margin: 0 3px;
          cursor: pointer;
          font-size: 12px;
          font-family: arial,sans-serif;
          padding: 2px 4px;
        `;
        let p1 = document.createElement('p');
        p1.style = `
          font-weight: bold;
          margin: 0;
          padding: 0;
        `;
        p1.textContent = 'Popup is requested for';
        let p2 = document.createElement('p');
        div.dataset.url = p2.title = p2.textContent = e.data.url;

        p2.style = `
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin: 0;
          padding: 0;
          line-height: 32px;
        `;

        div.appendChild(p1);
        div.appendChild(p2);
        buttons.appendChild(cancel);
        buttons.appendChild(ok);
        div.appendChild(buttons);
        container.appendChild(div);
        // timeout
        let id = window.setTimeout(remove, prefs.timeout * 1000, div);
        urls[e.data.url] = {
          div,
          id,
          prefs,
          timestamp: (new Date()).getTime()
        };
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
