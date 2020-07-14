/* global prefs */
'use strict';

if (typeof prefs === 'undefined') {
  window.disableByPolicy = true;
}
else {
  prefs.enabled = false;
}
