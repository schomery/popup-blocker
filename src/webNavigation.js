'use strict';

var onCommitted = ({frameId, tabId}) => chrome.tabs.executeScript(tabId, {
  runAt: 'document_start',
  frameId,
  matchAboutBlank: true,
  code: `
    console.log('onCommitted');
  `
});

chrome.webNavigation.onCommitted.addListener(onCommitted);
