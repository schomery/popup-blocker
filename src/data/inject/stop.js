/* global prefs */
'use strict';

window.disableByPolicy = true;
if (typeof prefs !== 'undefined') {
  prefs.enabled = false;
}
