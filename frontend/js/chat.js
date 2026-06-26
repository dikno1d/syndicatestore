(function() {
  const messagesEl = document.getElementById('chat-page-messages');
  const loadingEl = document.getElementById('chat-page-loading');
  const inputWrap = document.getElementById('chat-page-input-wrap');
  const loginPrompt = document.getElementById('chat-page-login');
  const input = document.getElementById('chat-page-input');
  const sendBtn = document.getElementById('chat-page-send-btn');
  let roomId = null;
  let chatUser = null;

  async function init() {
    if (!chatUser) {
      showLoginPrompt();
      initChatGoogleSignIn();
      return;
    }
    hideLoginPrompt();
    loadingEl.style.display = 'block';
    try {
      const res = await fetch('/api/chat/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('user_token')}` }
      });
      const data = await res.json();
      if (data.success) {
        roomId = data.room._id;
        await loadMessages();
      }
    } catch (err) {
      loadingEl.innerHTML = '<p style="color:var(--secondary-neon)">Failed to start chat. Please try again.</p>';
    }
  }

  function showLoginPrompt() {
    if (messagesEl) messagesEl.innerHTML = '';
    if (inputWrap) inputWrap.style.display = 'none';
    if (loginPrompt) loginPrompt.style.display = 'block';
    if (loadingEl) loadingEl.style.display = 'none';
  }

  function hideLoginPrompt() {
    if (loginPrompt) loginPrompt.style.display = 'none';
    if (inputWrap) inputWrap.style.display = 'flex';
  }

  async function loadMessages() {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/chat/messages/${roomId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('user_token')}` }
      });
      if (!res.ok) throw new Error('Failed');
      const msgs = await res.json();
      if (loadingEl) loadingEl.style.display = 'none';
      if (!msgs.length) {
        if (messagesEl) messagesEl.innerHTML = '<div class="chat-page-empty"><i class="fa-solid fa-comment-dots" style="font-size:2.5rem;color:var(--text-gray);margin-bottom:12px;opacity:0.5"></i><h3>Start a Conversation</h3><p style="color:var(--text-gray);font-size:0.9rem">Send a message to begin chatting with our support team. We typically respond within 5-15 minutes.</p></div>';
        return;
      }
      if (messagesEl) {
        messagesEl.innerHTML = msgs.map(m => `
          <div class="chat-msg ${m.isAdmin ? 'admin' : 'customer'}">
            ${escapeHtml(m.text)}
            <div class="chat-msg-meta">${m.senderName} · ${new Date(m.createdAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
          </div>
        `).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } catch (err) {
      if (loadingEl) loadingEl.innerHTML = '<p style="color:var(--secondary-neon)">Failed to load messages.</p>';
    }
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || !roomId) return;
    input.value = '';
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('user_token')}` },
        body: JSON.stringify({ roomId, text })
      });
      if (res.ok) await loadMessages();
    } catch (err) { /* silent */ }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Check auth
  async function checkChatAuth() {
    const token = localStorage.getItem('user_token');
    if (!token) {
      init();
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        chatUser = await res.json();
      }
    } catch (err) { /* not authenticated */ }
    init();
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  // Handle Google Sign-In callback
  window.handleChatGoogleCredential = async function(response) {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('user_token', data.token);
        chatUser = data.user;
        init();
      }
    } catch (err) { /* silent */ }
  };

  // Fetch Google config then init sign-in
  let chatGoogleClientId = '';
  async function fetchChatGoogleConfig() {
    try {
      const res = await fetch('/api/auth/config');
      if (res.ok) {
        const config = await res.json();
        chatGoogleClientId = config.googleClientId;
      }
    } catch (e) { /* silent */ }
  }

  // Initialize Google Sign-In for chat page
  function initChatGoogleSignIn() {
    if (!chatGoogleClientId) {
      setTimeout(initChatGoogleSignIn, 500);
      return;
    }
    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(initChatGoogleSignIn, 500);
      return;
    }
    const signinBtnContainer = document.getElementById('chat-google-btn');
    if (signinBtnContainer && signinBtnContainer.children.length === 0) {
      google.accounts.id.initialize({
        client_id: chatGoogleClientId,
        callback: window.handleChatGoogleCredential,
        cancel_on_tap_outside: false
      });
      google.accounts.id.renderButton(signinBtnContainer, {
        type: 'standard',
        shape: 'rectangular',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        logo_alignment: 'left',
        width: '280'
      });
    }
  }

  checkChatAuth();
  fetchChatGoogleConfig().then(() => setTimeout(initChatGoogleSignIn, 500));
})();
