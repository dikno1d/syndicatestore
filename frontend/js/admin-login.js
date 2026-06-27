(function() {
  'use strict';

  const API_BASE = '';
  const _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      url = API_BASE + url;
    }
    return _origFetch.call(this, url, opts);
  };

  const loadingEl = document.getElementById('login-loading');
  const loginWrap = document.querySelector('.login-wrap');
  const form = document.getElementById('login-form');
  const usernameInput = document.getElementById('admin-username');
  const passwordInput = document.getElementById('admin-password');
  const errorBox = document.getElementById('error-box');
  const errorMsg = document.getElementById('error-msg');
  const submitBtn = document.getElementById('submit-btn');
  const togglePw = document.getElementById('toggle-pw');

  function sanitize(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  togglePw.addEventListener('click', function() {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePw.className = isHidden ? 'fa-solid fa-eye-slash toggle-pass' : 'fa-solid fa-eye toggle-pass';
  });

  // Check auth on load - redirect if already logged in
  fetch('/api/admin/check').then(function(r) { return r.json(); }).then(function(d) {
    if (d.authenticated) {
      window.location.href = '/admin';
      return;
    }
    // Not authenticated - show the login form
    if (loadingEl) loadingEl.style.display = 'none';
    if (loginWrap) loginWrap.style.display = '';
  }).catch(function() {
    // Server unavailable - still show form
    if (loadingEl) loadingEl.style.display = 'none';
    if (loginWrap) loginWrap.style.display = '';
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

    var payload = JSON.stringify({
      username: sanitize(usernameInput.value.trim()),
      password: passwordInput.value
    });

    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    }).then(function(res) {
      return res.json().then(function(data) { return { ok: res.ok, data: data }; });
    }).then(function(result) {
      if (result.ok && result.data.success) {
        localStorage.setItem('admin_token', result.data.token);
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Access Granted!';
        setTimeout(function() { window.location.href = '/admin'; }, 500);
      } else {
        errorMsg.textContent = result.data.error || 'Authentication failed.';
        errorBox.style.display = 'flex';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Authenticate & Enter';
      }
    }).catch(function() {
      errorMsg.textContent = 'Server connection error. Please check if the server is running.';
      errorBox.style.display = 'flex';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Authenticate & Enter';
    });
  });
})();
