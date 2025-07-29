'use strict';

const config = {
  'enabled': true,
  'numbers': 5,
  'timeout': 30,
  'countdown': 5,
  'default-action': 'ignore',
  'immediate-action': false,
  'simulate-allow': true,
  'focus-popup': false,
  'aggressive': false,
  'wot': false,
  'domain': false, // allow popups from the same domain
  'badge': true,
  'badge-color': '#6e6e6e',
  'whitelist-mode': 'popup-hosts',
  'placement': 'tr',
  // the following hostnames can issue popup on every website
  'popup-hosts': [
    'google.com', 'bing.com', 't.co', 'twitter.com', 'disqus.com', 'login.yahoo.com',
    'mail.google.com', 'doubleclick.net'
  ],
  // popup blocker is disabled in the following hostname tabs
  'top-hosts': ['github.com', 'twitter.com', 'webextension.org', 'google.com', 'paypal.com'],
  // these protocols are accepted
  'protocols': ['magnet:'],
  'silent': [],
  'rules': {},
  'issue': true,
  'block-page-redirection': false,
  'block-page-redirection-hostnames': [],
  'block-page-redirection-same-origin': true,
  'target': true,
  'version': null,
  'faqs': true,
  'last-update': 0,
  'scope': ['*://*/*'],
  'width': 420 // popup width in px
};

{
  // get the list of preferences that need to be read from chrome.sync storage
  config.sync = async () => {
    if ('synced' in config) {
      return;
    }
    const prefs = await chrome.storage.local.get({
      synced: []
    });
    config.synced = prefs.synced;
  };

  config.get = async keys => {
    await config.sync();

    if (keys.length) {
      const ps = {};

      for (const key of keys) {
        if (config.synced.includes(key)) {
          ps.sync = ps.sync || {};
          ps.sync[key] = config[key];
        }
        else {
          ps.local = ps.local || {};
          ps.local[key] = config[key];
        }
      }

      const prefs = {};
      if ('local' in ps) {
        const one = await chrome.storage.local.get(ps.local);
        Object.assign(prefs, one);
      }
      if ('sync' in ps) {
        const two = await chrome.storage.sync.get(ps.sync);
        Object.assign(prefs, two);
      }
      return prefs;
    }
    // get all stored preference
    else {
      const one = await chrome.storage.local.get(null);
      const two = await chrome.storage.sync.get(null);

      for (const key of config.synced) {
        one[key] = two[key] || one[key];
      }

      return one;
    }
  };
  config.update = async prefs => {
    await config.sync();

    const ps = {};

    for (const [key, value] of Object.entries(prefs)) {
      if (config.synced.includes(key)) {
        ps.sync = ps.sync || {};
        ps.sync[key] = value;
      }
      else {
        ps.local = ps.local || {};
        ps.local[key] = value;
      }
    }
    if ('local' in ps) {
      const one = await chrome.storage.local.get(ps.local);
      Object.assign(prefs, one);
    }
    if ('sync' in ps) {
      const two = await chrome.storage.sync.get(ps.sync);
      Object.assign(prefs, two);
    }
  };
  config.set = async prefs => {
    await config.sync();

    const ps = {};

    for (const [key, value] of Object.entries(prefs)) {
      if (config.synced.includes(key)) {
        ps.sync = ps.sync || {};
        ps.sync[key] = value;
      }
      else {
        ps.local = ps.local || {};
        ps.local[key] = value;
      }
    }

    if ('local' in ps) {
      await chrome.storage.local.set(ps.local);
    }
    if ('sync' in ps) {
      await chrome.storage.sync.set(ps.sync);
    }

    return;
  };
}

config.changed = c => chrome.storage.onChanged.addListener(c);
