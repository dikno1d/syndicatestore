// Profile Page Logic
(function() {
  const API_BASE = '';

  // DOM refs
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const profileJoined = document.getElementById('profile-joined');
  const profileCartCount = document.getElementById('profile-cart-count');
  const profileOrderCount = document.getElementById('profile-order-count');
  const profileTotalSpent = document.getElementById('profile-total-spent');
  const ordersLoading = document.getElementById('profile-orders-loading');
  const ordersEmpty = document.getElementById('profile-orders-empty');
  const ordersList = document.getElementById('profile-orders-list');
  const cartLoading = document.getElementById('profile-cart-loading');
  const cartEmpty = document.getElementById('profile-cart-empty');
  const cartList = document.getElementById('profile-cart-list');
  const cartSummary = document.getElementById('profile-cart-summary');
  const cartTotal = document.getElementById('profile-cart-total');
  const checkoutBtn = document.getElementById('profile-checkout-btn');

  let currentFilter = 'all';
  let ordersData = [];
  let cartData = [];

  function getToken() {
    return localStorage.getItem('user_token');
  }

  async function checkAuth() {
    const token = getToken();
    if (!token) {
      window.location.href = '/';
      return;
    }
    try {
      const res = await fetch(API_BASE + '/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Not authenticated');
      return await res.json();
    } catch {
      localStorage.removeItem('user_token');
      window.location.href = '/';
      return null;
    }
  }

  async function loadProfile() {
    const user = await checkAuth();
    if (!user) return;
    profileAvatar.src = user.profilePicture || '';
    profileName.textContent = user.name;
    profileEmail.textContent = user.email;
    if (user.createdAt) {
      const d = new Date(user.createdAt);
      profileJoined.textContent = `Joined ${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    }
  }

  async function loadOrders() {
    ordersLoading.style.display = 'block';
    ordersEmpty.style.display = 'none';
    ordersList.style.display = 'none';

    try {
      const res = await fetch(API_BASE + '/api/orders/my', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Failed');
      ordersData = await res.json();
      renderOrders();
    } catch {
      ordersLoading.style.display = 'none';
      ordersEmpty.style.display = 'block';
      ordersEmpty.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load orders.</p>';
    }
  }

  function filterOrders() {
    if (currentFilter === 'all') return ordersData;
    if (currentFilter === 'pending') return ordersData.filter(o => o.paymentStatus === 'pending');
    if (currentFilter === 'paid') return ordersData.filter(o => o.paymentStatus === 'paid');
    if (currentFilter === 'shipped') return ordersData.filter(o => o.shippingStatus === 'shipped' || o.shippingStatus === 'packed');
    if (currentFilter === 'delivered') return ordersData.filter(o => o.shippingStatus === 'delivered');
    return ordersData;
  }

  function renderOrders() {
    ordersLoading.style.display = 'none';
    const filtered = filterOrders();
    profileOrderCount.textContent = ordersData.length;

    if (!filtered.length) {
      ordersEmpty.style.display = 'block';
      ordersEmpty.innerHTML = `<i class="fa-solid fa-box-open"></i><p>${currentFilter === 'all' ? 'No orders yet.' : 'No orders match this filter.'}</p>`;
      ordersList.style.display = 'none';
      return;
    }
    ordersEmpty.style.display = 'none';
    ordersList.style.display = 'block';

    const shippingLabels = {
      'yet_to_pack': 'Yet to Pack', 'packed': 'Packed',
      'shipped': 'Shipped', 'delivered': 'Delivered'
    };

    let totalSpent = 0;

    ordersList.innerHTML = filtered.map(o => {
      const date = new Date(o.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const products = o.items.map(i => `${i.productName} x${i.quantity}`).join(', ');
      const shippingLabel = shippingLabels[o.shippingStatus] || 'Yet to Pack';
      const trackingHtml = o.trackingNumber ? `<span class="order-tracking"><i class="fa-solid fa-truck"></i> ${o.trackingNumber}</span>` : '';
      const addressHtml = o.shippingAddress ? `<span class="order-address"><i class="fa-solid fa-location-dot"></i> ${o.shippingCity || ''}, ${o.shippingAddress}</span>` : '';

      let statusLabel, statusClass;
      if (o.paymentMethod === 'Cash') {
        statusLabel = 'Cash on Delivery'; statusClass = 'cash';
      } else if (o.paymentStatus === 'paid') {
        statusLabel = 'Paid'; statusClass = 'paid';
      } else if (o.paymentStatus === 'failed') {
        statusLabel = 'Failed'; statusClass = 'failed';
      } else if (o.paymentMethod === 'eSewa' && o.paymentStatus === 'pending') {
        if (o.paymentDeadline && new Date(o.paymentDeadline) < new Date()) {
          statusLabel = 'Payment Pending'; statusClass = 'pending';
        } else if (o.paymentDeadline) {
          const minsLeft = Math.round((new Date(o.paymentDeadline) - new Date()) / 60000);
          statusLabel = `Pay within ${minsLeft}m`; statusClass = 'pending';
        } else {
          statusLabel = 'Pending'; statusClass = 'pending';
        }
      } else {
        statusLabel = 'Pending'; statusClass = 'pending';
      }

      const refHtml = o.transactionId ? `<div class="order-ref-id">Ref: ${o.transactionId}</div>` : '';

      let payNowHtml = '';
      if (o.paymentMethod === 'eSewa' && o.paymentStatus === 'pending') {
        if (o.paymentDeadline && new Date(o.paymentDeadline) > new Date()) {
          payNowHtml = `<button class="order-pay-now-btn" data-order-id="${o._id}"><i class="fa-solid fa-credit-card"></i> Pay Now</button>`;
        }
      }

      totalSpent += o.totalAmount;

      return `<div class="order-item">
        <div class="order-item-header">
          <span class="order-date">${date}</span>
          <span class="order-payment-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="order-products">${products}</div>
        <div class="order-meta">
          <span class="order-total">Rs. ${Number(o.totalAmount).toLocaleString()}</span>
          ${refHtml}
        </div>
        <div class="order-shipping-info">
          <span class="order-shipping-status"><i class="fa-solid fa-box"></i> ${shippingLabel}</span>
          ${trackingHtml}
          ${addressHtml}
        </div>
        ${payNowHtml ? `<div class="order-pay-now-wrap">${payNowHtml}</div>` : ''}
      </div>`;
    }).join('');

    profileTotalSpent.textContent = `Rs. ${Number(totalSpent).toLocaleString()}`;

    // Pay Now handlers
    ordersList.querySelectorAll('.order-pay-now-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.orderId;
        try {
          const res = await fetch(API_BASE + `/api/orders/pay-now/${orderId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          const data = await res.json();
          if (data.success) {
            const order = ordersData.find(o => o._id === orderId);
            if (order) initiateEsewaPaymentForOrder(order);
          } else {
            showToast('error', 'Payment Failed', data.error || 'Could not process payment.');
            loadOrders();
          }
        } catch {
          showToast('error', 'Error', 'Failed to initiate payment.');
        }
      });
    });
  }

  async function loadCart() {
    cartLoading.style.display = 'block';
    cartEmpty.style.display = 'none';
    cartList.style.display = 'none';
    cartSummary.style.display = 'none';

    try {
      const res = await fetch(API_BASE + '/api/cart', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      cartData = data.items || [];
      renderCart();
    } catch {
      cartLoading.style.display = 'none';
      cartEmpty.style.display = 'block';
      cartEmpty.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load cart.</p>';
    }
  }

  function renderCart() {
    cartLoading.style.display = 'none';
    profileCartCount.textContent = cartData.reduce((s, i) => s + i.quantity, 0);

    if (!cartData.length) {
      cartEmpty.style.display = 'block';
      cartList.style.display = 'none';
      cartSummary.style.display = 'none';
      return;
    }
    cartEmpty.style.display = 'none';
    cartList.style.display = 'block';
    cartSummary.style.display = 'flex';

    let total = 0;
    cartList.innerHTML = cartData.map(item => {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;
      return `<div class="profile-cart-item" data-product-id="${item.product}">
        <img src="${item.image || '/uploads/placeholder.jpg'}" alt="${item.productName}" class="profile-cart-item-img">
        <div class="profile-cart-item-info">
          <div class="profile-cart-item-name">${item.productName}</div>
          <div class="profile-cart-item-price">Rs. ${Number(item.price).toLocaleString()}</div>
          <div class="profile-cart-item-qty">
            <button class="profile-cart-qty-btn profile-cart-minus" data-product-id="${item.product}">-</button>
            <span>${item.quantity}</span>
            <button class="profile-cart-qty-btn profile-cart-plus" data-product-id="${item.product}">+</button>
          </div>
        </div>
        <div class="profile-cart-item-total">Rs. ${Number(itemTotal).toLocaleString()}</div>
        <button class="profile-cart-item-remove" data-product-id="${item.product}"><i class="fa-solid fa-trash-can"></i></button>
      </div>`;
    }).join('');
    cartTotal.textContent = `Rs. ${Number(total).toLocaleString()}`;
  }

  async function updateCartItemQty(productId, change) {
    const item = cartData.find(i => i.product === productId);
    if (!item) return;
    const newQty = item.quantity + change;
    if (newQty < 1) return;
    try {
      const res = await fetch(API_BASE + `/api/cart/item/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ quantity: newQty })
      });
      const data = await res.json();
      if (data.success) {
        cartData = data.cart.items || [];
        // Update global cartItems too
        if (typeof cartItems !== 'undefined') {
          cartItems = cartData;
          updateCartCount();
        }
        renderCart();
      }
    } catch {}
  }

  async function removeCartItem(productId) {
    try {
      const res = await fetch(API_BASE + `/api/cart/item/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        cartData = data.cart.items || [];
        if (typeof cartItems !== 'undefined') {
          cartItems = cartData;
          updateCartCount();
        }
        renderCart();
      }
    } catch {}
  }

  function initiateEsewaPaymentForOrder(order) {
    if (typeof window.initiateEsewaPaymentForOrder === 'function') {
      window.initiateEsewaPaymentForOrder(order);
    } else {
      // Fallback: redirect to store page for eSewa
      window.location.href = '/?checkout=' + order._id;
    }
  }

  function showToast(type, title, msg) {
    if (typeof showPaymentToast === 'function') {
      showPaymentToast(type, title, msg);
    } else {
      // Fallback toast
      const toast = document.getElementById('payment-toast');
      const icon = document.getElementById('payment-toast-icon');
      const titleEl = document.getElementById('payment-toast-title');
      const msgEl = document.getElementById('payment-toast-msg');
      if (type === 'success') {
        icon.className = 'fa-solid fa-circle-check';
        toast.style.borderLeftColor = 'var(--price-green)';
      } else {
        icon.className = 'fa-solid fa-circle-xmark';
        toast.style.borderLeftColor = 'var(--secondary-neon)';
      }
      titleEl.textContent = title;
      msgEl.textContent = msg;
      toast.style.display = 'flex';
      setTimeout(() => { toast.style.display = 'none'; }, 8000);
    }
  }

  // Event listeners
  document.addEventListener('DOMContentLoaded', async () => {
    await loadProfile();
    await Promise.all([loadOrders(), loadCart()]);

    // Scroll to orders section if hash is #orders
    if (window.location.hash === '#orders') {
      setTimeout(() => {
        const ordersSection = document.querySelector('.profile-section');
        if (ordersSection) ordersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }

    // Order filter buttons
    document.querySelectorAll('.profile-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.profile-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderOrders();
      });
    });

    // Cart event delegation
    if (cartList) {
      cartList.addEventListener('click', async (e) => {
        if (e.target.closest('.profile-cart-minus')) {
          await updateCartItemQty(e.target.closest('.profile-cart-minus').dataset.productId, -1);
        } else if (e.target.closest('.profile-cart-plus')) {
          await updateCartItemQty(e.target.closest('.profile-cart-plus').dataset.productId, 1);
        } else if (e.target.closest('.profile-cart-item-remove')) {
          await removeCartItem(e.target.closest('.profile-cart-item-remove').dataset.productId);
        }
      });
    }

    // Checkout button
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        window.location.href = '/';
        setTimeout(() => {
          if (typeof openCheckoutModal === 'function') openCheckoutModal();
        }, 500);
      });
    }

    // Toast close
    const toastClose = document.getElementById('payment-toast-close');
    if (toastClose) toastClose.addEventListener('click', () => {
      document.getElementById('payment-toast').style.display = 'none';
    });

    // Profile page chat
    const profileChatMessages = document.getElementById('profile-chat-messages');
    const profileChatInput = document.getElementById('profile-chat-input');
    const profileChatSendBtn = document.getElementById('profile-chat-send-btn');
    let profileChatRoomId = null;

    async function initProfileChat() {
      if (!profileChatMessages) return;
      try {
        const res = await fetch('/api/chat/create', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('user_token')}` }
        });
        const data = await res.json();
        if (data.success) {
          profileChatRoomId = data.room._id;
          await loadProfileChatMessages();
        }
      } catch (err) {
        profileChatMessages.innerHTML = '<p style="color:var(--secondary-neon);padding:20px">Failed to load chat.</p>';
      }
    }

    async function loadProfileChatMessages() {
      if (!profileChatRoomId) return;
      try {
        const res = await fetch(`/api/chat/messages/${profileChatRoomId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('user_token')}` }
        });
        if (!res.ok) throw new Error('Failed');
        const msgs = await res.json();
        if (!msgs.length) {
          profileChatMessages.innerHTML = '<div class="profile-chat-empty">Start a conversation with the admin! We typically respond within 5-15 minutes.</div>';
          return;
        }
        profileChatMessages.innerHTML = msgs.map(m => `
          <div class="chat-msg ${m.isAdmin ? 'admin' : 'customer'}">
            ${m.text}
            <div class="chat-msg-meta">${m.senderName} · ${new Date(m.createdAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
          </div>
        `).join('');
        profileChatMessages.scrollTop = profileChatMessages.scrollHeight;
      } catch (err) {
        profileChatMessages.innerHTML = '<p style="color:var(--secondary-neon);padding:20px">Failed to load messages.</p>';
      }
    }

    async function sendProfileChatMessage() {
      const text = profileChatInput.value.trim();
      if (!text || !profileChatRoomId) return;
      profileChatInput.value = '';
      try {
        const res = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('user_token')}` },
          body: JSON.stringify({ roomId: profileChatRoomId, text })
        });
        if (res.ok) await loadProfileChatMessages();
      } catch (err) { /* silent */ }
    }

    if (profileChatSendBtn) profileChatSendBtn.addEventListener('click', sendProfileChatMessage);
    if (profileChatInput) profileChatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendProfileChatMessage(); });

    initProfileChat();
  });
})();
