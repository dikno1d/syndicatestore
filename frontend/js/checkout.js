(function() {
  const loading = document.getElementById('checkout-loading');
  const error = document.getElementById('checkout-error');
  const errorMsg = document.getElementById('checkout-error-msg');
  const layout = document.getElementById('checkout-layout');

  const checkoutName = document.getElementById('checkout-name');
  const checkoutEmail = document.getElementById('checkout-email');
  const checkoutCity = document.getElementById('checkout-city');
  const checkoutAddress = document.getElementById('checkout-address');
  const checkoutForm = document.getElementById('checkout-form');
  const btnPlaceOrder = document.getElementById('btn-place-order');

  const checkoutItemsPreview = document.getElementById('checkout-items-preview');
  const checkoutTotalAmount = document.getElementById('checkout-total-amount');
  const paymentRadios = document.querySelectorAll('input[name="paymentMethod"]');
  const checkoutScanFields = document.getElementById('checkout-scan-fields');
  const checkoutCashFields = document.getElementById('checkout-cash-fields');
  const qrImg = document.getElementById('checkout-qr-img');
  const discordLink = document.getElementById('checkout-discord-link');

  async function init() {
    try {
      // Fetch settings for QR and Discord
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (qrImg) qrImg.src = settings.qrCode || '/images/qr.png';
        if (discordLink) discordLink.href = settings.discord || 'https://discord.gg/syndicatestore';
      }

      // Fetch cart items via API
      const token = localStorage.getItem('user_token');
      if (!token) {
        showError('Please sign in to checkout.');
        return;
      }

      const cartRes = await fetch('/api/cart', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!cartRes.ok) throw new Error('Failed to load cart');
      const cartData = await cartRes.json();
      const items = cartData.items || cartData.cart?.items || [];
      if (!items.length) {
        showError('Your cart is empty. Please add items before checking out.');
        return;
      }

      renderSummary(items);
      loading.style.display = 'none';
      layout.style.display = 'grid';

      // Pre-fill user name if available
      if (currentUser && currentUser.name) {
        checkoutName.value = currentUser.name;
      }
    } catch (err) {
      showError('Failed to load checkout. Please try again.');
    }
  }

  function renderSummary(items) {
    let total = 0;
    checkoutItemsPreview.innerHTML = items.map(item => {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;
      return `<div class="checkout-item-row">
        <span class="checkout-item-name">${item.productName} x${item.quantity}</span>
        <span class="checkout-item-price">Rs. ${Number(itemTotal).toLocaleString()}</span>
      </div>`;
    }).join('');
    checkoutTotalAmount.textContent = `Rs. ${Number(total).toLocaleString()}`;
  }

  function showError(msg) {
    loading.style.display = 'none';
    errorMsg.textContent = msg;
    error.style.display = 'block';
  }

  // Payment method toggle
  if (paymentRadios.length) {
    paymentRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (checkoutScanFields && checkoutCashFields) {
          checkoutScanFields.style.display = radio.value === 'Scan' ? 'block' : 'none';
          checkoutCashFields.style.display = radio.value === 'Cash' ? 'block' : 'none';
        }
      });
    });
  }

  // Place Order
  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = checkoutName.value.trim();
    const email = checkoutEmail.value.trim();
    const city = checkoutCity.value.trim();
    const address = checkoutAddress.value.trim();
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Scan';

    if (!name || !email || !city || !address) {
      showToast('error', 'Missing Fields', 'Please fill in all shipping details.');
      return;
    }

    btnPlaceOrder.disabled = true;
    btnPlaceOrder.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user_token')}`
        },
        body: JSON.stringify({
          customerName: name,
          customerEmail: email,
          shippingCity: city,
          shippingAddress: address,
          paymentMethod
        })
      });
      const data = await res.json();
      if (data.success) {
        // Redirect back to store with success
        const params = new URLSearchParams({
          payment: 'success',
          method: paymentMethod
        });
        window.location.href = `/?${params}`;
      } else {
        showToast('error', 'Checkout Failed', data.error || 'Please try again.');
      }
    } catch (err) {
      showToast('error', 'Error', 'Failed to place order.');
    } finally {
      btnPlaceOrder.disabled = false;
      btnPlaceOrder.innerHTML = '<i class="fa-solid fa-check"></i> Place Order';
    }
  });

  function showToast(type, title, msg) {
    const toast = document.getElementById('payment-toast');
    if (!toast) return;
    const icon = document.getElementById('payment-toast-icon');
    const titleEl = document.getElementById('payment-toast-title');
    const msgEl = document.getElementById('payment-toast-msg');
    icon.className = type === 'success' ? 'fa-solid fa-check-circle' : 'fa-solid fa-exclamation-circle';
    icon.style.color = type === 'success' ? '#22d3ee' : '#f43f5e';
    titleEl.textContent = title;
    msgEl.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
    document.getElementById('payment-toast-close').onclick = () => { toast.style.display = 'none'; };
  }

  init();
})();
