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
config.get(['immediate-action']).then(prefs => chrome.contextMenus.create({
  id: 'immediate-action',
  title: chrome.i18n.getMessage('context_item6'),
  contexts: ['browser_action'],
  type: 'checkbox',
  checked: prefs['immediate-action']
}));
