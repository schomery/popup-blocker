/* global config, tld, URLPattern */

// Firefox
if (!self.URLPattern) {
  await import('/data/polyfill/urlpattern.js').then(o => {
    self.URLPattern = o.URLPattern;
  });
}

// links
for (const a of [...document.querySelectorAll('[data-href]')]) {
  if (a.hasAttribute('href') === false) {
    a.href = chrome.runtime.getManifest().homepage_url + '#' + a.dataset.href;
  }
}

// localization
[...document.querySelectorAll('[data-i18n]')].forEach(e => {
  if (e.tagName === 'INPUT') {
    e.value = chrome.i18n.getMessage(e.dataset.i18n);
  }
  else {
    e.textContent = chrome.i18n.getMessage(e.dataset.i18n);
  }
});

// Global
config.get(['enabled']).then(prefs => {
  document.getElementById('global').checked = prefs.enabled;
  if (prefs.enabled === false) {
    document.getElementById('page').disabled = true;
  }
});
document.getElementById('global').onchange = e => {
  chrome.storage.local.set({
    enabled: e.target.checked
  });
  document.getElementById('page').disabled = e.target.checked === false;
};

const page = {};

const match = (hostname, href) => {
  try {
    const v = new URLPattern({hostname});
    if (v.test(href)) {
      return true;
    }
  }
  catch (e) {}
  try {
    const v = new URLPattern({hostname: '*.' + hostname});
    if (v.test(href)) {
      return true;
    }
  }
  catch (e) {}
};

// Start Point
chrome.tabs.query({
  currentWindow: true,
  active: true
}, tabs => {
  if (tabs.length) {
    page.tabId = tabs[0].id;

    chrome.scripting.executeScript({
      target: {
        tabId: tabs[0].id
      },
      func: () => ({
        enabled: window.prefs?.enabled,
        hostname: location.hostname,
        href: location.href
      })
    }).then(async response => {
      const {enabled, hostname, href} = response[0].result;

      page.hostname = hostname;
      page.href = href;
      if (enabled === true || enabled === false) {
        document.getElementById('page').checked = enabled;
      }
      else {
        const prefs = await config.get(['top-hosts']);
        document.getElementById('page').checked =
          prefs['top-hosts'].some(h => match(h, page.href)) ? false : true;
      }
    }).catch(() => {
      document.getElementById('page').disabled = true;
      // force disabled
      document.getElementById('page').classList.add('disabled');
    });
  }
});

document.getElementById('page').onchange = async e => {
  const prefs = await config.get(['top-hosts']);

  const d = tld.getDomain(page.hostname) || page.hostname;

  if (e.target.checked) {
    const rms = new Set();
    rms.add(d);

    for (const hostname of prefs['top-hosts']) {
      if (match(hostname, page.href)) {
        rms.add(hostname);
      }
    }
    prefs['top-hosts'] = prefs['top-hosts'].filter(s => rms.has(s) === false);
  }
  else {
    prefs['top-hosts'].push(d);
    prefs['top-hosts'] = prefs['top-hosts'].filter((s, i, l) => s && l.indexOf(s) === i);
  }
  chrome.storage.local.set(prefs, () => chrome.tabs.reload());
};

config.get(['immediate-action']).then(prefs => {
  document.getElementById('immediate-action').checked = prefs['immediate-action'];
});
document.getElementById('immediate-action').onchange = e => chrome.storage.local.set({
  'immediate-action': e.target.checked
});

config.get(['block-page-redirection']).then(prefs => {
  document.getElementById('block-page-redirection').checked = prefs['block-page-redirection'];
});
document.getElementById('block-page-redirection').onchange = e => chrome.storage.local.set({
  'block-page-redirection': e.target.checked
});

config.get(['issue']).then(prefs => {
  document.getElementById('issue').checked = prefs.issue;
});
document.getElementById('issue').onchange = e => chrome.storage.local.set({
  'issue': e.target.checked
});

document.getElementById('test-page').onclick = () => chrome.tabs.create({
  url: 'https://webbrowsertools.com/popup-blocker/'
}, () => window.close());

document.getElementById('homepage').onclick = () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url
}, () => window.close());

document.getElementById('options').onclick = () => chrome.runtime.openOptionsPage(() => {
  window.close();
});

chrome.tabs.query({
  currentWindow: true,
  active: true
}, tabs => {
  if (tabs.length) {
    const tab = tabs[0];
    document.getElementById('use-shadow').onclick = () => chrome.tabs.sendMessage(tab.id, {
      cmd: 'use-shadow'
    }, () => window.close());

    document.getElementById('allow-last-request').onclick = () => chrome.tabs.sendMessage(tab.id, {
      cmd: 'allow-last-request'
    }, () => window.close());

    document.getElementById('deny-last-request').onclick = () => chrome.tabs.sendMessage(tab.id, {
      cmd: 'deny-last-request'
    }, () => window.close());
  }
});
