/* global config, browser */
'use strict';

let contentScript = {
  unregister() {}
};

// top-level exception
const exception = async () => {
  const prefs = await config.get(['blacklist', 'top-hosts', 'enabled']);
  const fOptions = {
    js: [{
      file: '/data/inject/stop.js'
    }],
    allFrames: true,
    matchAboutBlank: true,
    matches: ['<all_urls>'],
    runAt: 'document_start'
  };
  let cAction;
  let cCondition;

  if (typeof browser !== 'undefined' && browser.contentScripts) {
    contentScript.unregister();
  }
  else if (chrome.declarativeContent) {
    await new Promise(resolve => chrome.declarativeContent.onPageChanged.removeRules(undefined, resolve));
    cAction = new chrome.declarativeContent.RequestContentScript({
      js: ['/data/inject/stop.js'],
      allFrames: true,
      matchAboutBlank: true
    });
    cCondition = new chrome.declarativeContent.PageStateMatcher({});
  }

  if (prefs.enabled === false) {
    if (typeof browser !== 'undefined' && browser.contentScripts) {
      contentScript = await browser.contentScripts.register(fOptions);
    }
    else if (chrome.declarativeContent) {
      chrome.declarativeContent.onPageChanged.addRules([{
        conditions: [cCondition],
        actions: [cAction]
      }]);
    }
  }
  // popup blocker is disabled on all hosts except the following
  else if (prefs.blacklist.length) {
    if (typeof browser !== 'undefined' && browser.contentScripts) {
      contentScript = await browser.contentScripts.register({
        ...fOptions,
        exclude_matches: prefs['blacklist'].map(hostname => '*://' + hostname + '/*')
      });
    }
    else if (chrome.declarativeContent) {
      chrome.declarativeContent.onPageChanged.addRules([{
        conditions: [cCondition],
        actions: [cAction]
      }, {
        conditions: prefs['blacklist'].map(host => new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            hostEquals: host
          }
        })),
        actions: [new chrome.declarativeContent.RequestContentScript({
          js: ['/data/inject/start.js'],
          allFrames: true,
          matchAboutBlank: true
        })]
      }]);
    }
  }
  else if (prefs['top-hosts'].length) {
    if (typeof browser !== 'undefined' && browser.contentScripts) {
      contentScript = await browser.contentScripts.register({
        ...fOptions,
        matches: prefs['top-hosts'].map(hostname => '*://' + hostname + '/*')
      });
    }
    else if (chrome.declarativeContent) {
      chrome.declarativeContent.onPageChanged.addRules([{
        conditions: prefs['top-hosts'].map(host => new chrome.declarativeContent.PageStateMatcher({
          pageUrl: {
            hostEquals: host
          }
        })),
        actions: [cAction]
      }]);
    }
  }
};
exception();

chrome.storage.onChanged.addListener(ps => {
  if (ps.enabled || ps['top-hosts'] || ps.blacklist) {
    exception();
  }
});
