/* global config */


/* update global icon's state */
const icon = async () => {
  const prefs = await config.get(['enabled']);
  const path = {
    16: 'data/icons/' + (prefs.enabled ? '' : 'disabled/') + '16.png',
    32: 'data/icons/' + (prefs.enabled ? '' : 'disabled/') + '32.png'
  };
  chrome.action.setIcon({
    path
  });
};

/* observe preference changes */
chrome.storage.onChanged.addListener(prefs => {
  if (prefs.badge && prefs.badge.newValue === false) {
    chrome.tabs.query({}, tabs => tabs.forEach(tab => chrome.action.setBadgeText({
      tabId: tab.id,
      text: ''
    })));
  }
  // maybe multiple prefs changed
  if (prefs['badge-color']) {
    chrome.action.setBadgeBackgroundColor({
      color: prefs['badge-color'].newValue
    });
  }
  //
  if (prefs.enabled) {
    icon();
  }
});

chrome.runtime.onMessage.addListener((request, sender) => {
  // update badge counter
  if (request.cmd === 'popup-request') {
    const tabId = sender.tab.id;
    config.get(['badge']).then(({badge}) => {
      if (badge) {
        chrome.action.getBadgeText({tabId}, text => {
          if (text !== 'E') {
            text = text ? parseInt(text) : 0;
            text = String(text + 1);
          }
          chrome.action.setBadgeText({
            tabId,
            text
          });
        });
      }
    });
  }
  else if (request.cmd === 'state') {
    if (sender.tab) {
      config.get(['enabled']).then(({enabled}) => {
        let state = 4;
        if (enabled && request.active) {
          state = 1;
        }
        else if (enabled && request.active === false) {
          state = 2;
        }
        else if (enabled === false && request.active === false) {
          state = 3;
        }
        const path = {
          16: 'data/icons/state/' + state + '/16.png',
          32: 'data/icons/state/' + state + '/32.png'
        };
        chrome.action.setIcon({
          tabId: sender.tab.id,
          path
        });
        chrome.action.setTitle({
          tabId: sender.tab.id,
          title: chrome.i18n.getMessage('bg_msg_state_' + state)
        });
      });
    }
  }
});

// on startup (run once)
{
  const once = () => {
    // icon
    icon();
    // badge color
    config.get(['badge-color']).then(prefs => chrome.action.setBadgeBackgroundColor({
      color: prefs['badge-color']
    }));
  };
  chrome.runtime.onInstalled.addListener(once);
  chrome.runtime.onStartup.addListener(once);
}
