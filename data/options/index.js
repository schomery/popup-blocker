'use strict';

function save_options() {
  var numbers = document.getElementById('numbers').value;
  var timeout = document.getElementById('timeout').value;

  chrome.storage.local.set({
    numbers,
    timeout
  }, () => {
    let status = document.getElementById('status');
    status.textContent = 'Options are saved.';
    setTimeout(() => status.textContent = '', 750);
  });
}

function restore_options() {
  chrome.storage.local.get({
    numbers: 5,
    timeout: 30
  }, (obj) => {
    document.getElementById('numbers').value = obj.numbers;
    document.getElementById('timeout').value = obj.timeout;
  });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click',
    save_options);
