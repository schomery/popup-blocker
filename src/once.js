/* globals config */
'use strict';

// badge color
config.get(['badge-color']).then(prefs => chrome.browserAction.setBadgeBackgroundColor({
  color: prefs['badge-color']
}));
// context menu
chrome.contextMenus.create({
  id: 'open-test-page',
  title: chrome.i18n.getMessage('context_item1'),
  contexts: ['browser_action']
});
chrome.contextMenus.create({
  id: 'allow-last-request',
  title: chrome.i18n.getMessage('context_item2'),
  contexts: ['browser_action']
});
chrome.contextMenus.create({
  id: 'deny-last-request',
  title: chrome.i18n.getMessage('context_item3'),
  contexts: ['browser_action']
});
chrome.contextMenus.create({
  id: 'use-shadow',
  title: chrome.i18n.getMessage('context_item4'),
  contexts: ['browser_action']
});
if (navigator.userAgent.indexOf('Firefox') !== -1) {
  chrome.contextMenus.create({
    id: 'open-options',
    title: chrome.i18n.getMessage('context_item5'),
    contexts: ['browser_action']
  });
}
// FAQs & Feedback
config.get(['version', 'faqs', 'last-update']).then(prefs => {
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    const now = Date.now();
    const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
    chrome.storage.local.set({
      version,
      'last-update': doUpdate ? Date.now() : prefs['last-update']
    }, () => {
      // do not display the FAQs page if last-update occurred less than 30 days ago.
      if (doUpdate) {
        const p = Boolean(prefs.version);
        chrome.tabs.create({
          url: chrome.runtime.getManifest().homepage_url + '?version=' + version +
            '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
          active: p === false
        });
      }
    });
  }
});

{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL(
    chrome.runtime.getManifest().homepage_url + '?rd=feedback&name=' + name + '&version=' + version
  );
}
