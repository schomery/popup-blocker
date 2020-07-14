/* global prefs */
'use strict';

console.log('stop.js');

window.disableByPolicy = true;
if (typeof prefs !== 'undefined') {
  prefs.enabled = false;
}
