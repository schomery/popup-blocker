if (!('enabled' in window)) { // in case disabled.js is called first
  window.enabled = document.contentType === 'text/html';
}
