/* global prefs */

window.enabled = false;

if (typeof prefs === 'object') {
  prefs.enabled = window.enabled;
}
