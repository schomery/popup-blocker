/* global prefs */

if (!('enabled' in window)) { // in case disabled.js is called first
  window.enabled = true;
}

if (typeof prefs === 'object') {
  prefs.enabled = window.enabled;
}
