// Global Storefront Logic
const API_BASE = '';
const _origFetch = window.fetch;
window.fetch = function(url, opts) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    url = API_BASE + url;
  }
  return _origFetch.call(this, url, opts);
};

let allProducts = [];
let currentUser = null;
let cartItems = [];
let pendingAction = null;

// DOM - User Account
const userAccountWrap = document.getElementById('user-account-wrap');
const googleBtnContainer = document.getElementById('google-button-container');
const googleBtnMobileContainer = document.getElementById('google-button-mobile-container');
const userProfileBtn = document.getElementById('user-profile-btn');
const userAvatarImg = document.getElementById('user-avatar-img');
const userNameDisplay = document.getElementById('user-name-display');
const userProfileTrigger = document.getElementById('user-profile-trigger');
const userDropdownMenu = document.getElementById('user-dropdown-menu');
const dropdownUserName = document.getElementById('dropdown-user-name');
const dropdownUserEmail = document.getElementById('dropdown-user-email');
const logoutButton = document.getElementById('logout-button');
const ordersButton = document.getElementById('orders-button');
const ordersModal = document.getElementById('orders-modal');
const ordersModalClose = document.getElementById('orders-modal-close');
const ordersLoading = document.getElementById('orders-loading');
const ordersEmpty = document.getElementById('orders-empty');
const ordersList = document.getElementById('orders-list');
const drawerUserSection = document.getElementById('drawer-user-section');
const drawerUserInfo = document.getElementById('drawer-user-info');
const drawerUserAvatar = document.getElementById('drawer-user-avatar');
const drawerUserName = document.getElementById('drawer-user-name');
const drawerUserEmail = document.getElementById('drawer-user-email');
const drawerLogoutBtn = document.getElementById('drawer-logout-btn');
const cartButton = document.getElementById('cart-button');
const cartIconNav = document.getElementById('cart-icon-nav');
const cartCountBadge = document.getElementById('cart-count-badge');
const cartIconWrap = document.getElementById('cart-icon-wrap');
let contactSettings = {
  whatsapp: '+9779800000000',
  discord: 'https://discord.gg/syndicatestore',
  instagram: 'syndicate_store',
  customMessage: 'Hello! I would like to buy: {product_name} priced at {product_price}. Is it available?',
  qrCode: ''
};

let selectedCategory = 'all';
let searchQuery = '';

// Slider state
let sliderProducts = [];
let currentSlide = 0;
let slideInterval = null;
let isSliderPaused = false;

// DOM Elements
const productsGrid = document.getElementById('products-grid');
const searchInput = document.getElementById('store-search-input');
const mobileSearchInput = document.getElementById('mobile-search-input');
const searchFeedback = document.getElementById('search-feedback-text');
const categoryFilters = document.querySelectorAll('.filter-btn');

// Modal Elements
const purchaseModal = document.getElementById('purchase-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalProductImg = document.getElementById('modal-product-img');
const modalProductCategory = document.getElementById('modal-product-category');
const modalProductName = document.getElementById('modal-product-name');
const modalProductDesc = document.getElementById('modal-product-desc');
const modalProductPrice = document.getElementById('modal-product-price');
const modalProductOriginalPrice = document.getElementById('modal-product-original-price');
const contactWhatsapp = document.getElementById('contact-whatsapp');
const contactInstagram = document.getElementById('contact-instagram');
const contactDiscord = document.getElementById('contact-discord');
const btnAddToCart = document.getElementById('btn-add-to-cart');
const btnBuyNow = document.getElementById('btn-buy-now');

// Navigation & Drawer Elements
const navbar = document.getElementById('navbar');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileDrawer = document.getElementById('mobile-drawer');
const drawerCloseBtn = document.getElementById('drawer-close-btn');

// Sign-in Prompt
const signinPromptModal = document.getElementById('signin-prompt-modal');
const signinPromptClose = document.getElementById('signin-prompt-close');
const signinPromptGoogleBtn = document.getElementById('signin-prompt-google-btn');

// Cart Modal
const cartModal = document.getElementById('cart-modal');
const cartModalClose = document.getElementById('cart-modal-close');
const cartLoading = document.getElementById('cart-loading');
const cartEmpty = document.getElementById('cart-empty');
const cartItemsList = document.getElementById('cart-items-list');
const cartSummary = document.getElementById('cart-summary');
const cartTotalAmount = document.getElementById('cart-total-amount');
const btnProceedCheckout = document.getElementById('btn-proceed-checkout');

// Checkout Modal
const checkoutModal = document.getElementById('checkout-modal');
const checkoutModalClose = document.getElementById('checkout-modal-close');
const checkoutForm = document.getElementById('checkout-form');
const checkoutName = document.getElementById('checkout-name');
const checkoutEmail = document.getElementById('checkout-email');
const checkoutCity = document.getElementById('checkout-city');
const checkoutAddress = document.getElementById('checkout-address');
const checkoutItemsPreview = document.getElementById('checkout-items-preview');
const checkoutTotalAmount = document.getElementById('checkout-total-amount');
const checkoutEsewaFields = document.getElementById('checkout-esewa-fields');
let checkoutCashFields = document.getElementById('checkout-cash-fields');
const btnPlaceOrder = document.getElementById('btn-place-order');

// Initialize Google Sign-In
function initGoogleSignIn() {
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(initGoogleSignIn, 500);
    return;
  }
  google.accounts.id.initialize({
    client_id: '226982067584-6ks34tah493p0vqpioa194mtvjkus18f.apps.googleusercontent.com',
    callback: handleGoogleCredential,
    cancel_on_tap_outside: false
  });
  if (!currentUser) {
    const btnContainers = [googleBtnContainer, googleBtnMobileContainer, signinPromptGoogleBtn].filter(Boolean);
    btnContainers.forEach(container => {
      if (container && container.children.length === 0) {
        google.accounts.id.renderButton(container, {
          type: 'standard',
          shape: container === signinPromptGoogleBtn ? 'rectangular' : 'circle',
          theme: 'outline',
          size: 'large',
          text: container === signinPromptGoogleBtn ? 'signin_with' : 'signin_with',
          logo_alignment: 'left',
          width: container === signinPromptGoogleBtn ? '280' : undefined
        });
      }
    });
  }
}

// Handle Google credential response
async function handleGoogleCredential(response) {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Auth failed');
    localStorage.setItem('user_token', data.token);
    currentUser = data.user;
    showUserProfile();
    const action = pendingAction;
    closeSigninPrompt();
    if (action) {
      if (action.type === 'addToCart') addToCart(action.productId);
      else if (action.type === 'buyNow') buyNow(action.productId);
      else if (action.type === 'checkout') window.location.href = '/checkout';
    }
  } catch (err) {
    console.error('Google login error:', err.message);
  }
}

// Auto-login check
async function checkUserAuth() {
  const token = localStorage.getItem('user_token');
  if (!token) return;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Not authenticated');
    currentUser = await res.json();
    showUserProfile();
    loadCartCount();
  } catch {
    localStorage.removeItem('user_token');
    currentUser = null;
    showLoginButton();
  }
}

// Show user profile in navbar
function showUserProfile() {
  if (!currentUser) return;
  if (googleBtnContainer) googleBtnContainer.style.display = 'none';
  if (googleBtnMobileContainer) googleBtnMobileContainer.style.display = 'none';
  if (cartIconWrap) cartIconWrap.style.display = 'flex';
  if (userProfileBtn) {
    userProfileBtn.style.display = 'flex';
    if (userAvatarImg) userAvatarImg.src = currentUser.profilePicture || '';
    if (userNameDisplay) userNameDisplay.textContent = currentUser.name;
    if (dropdownUserName) dropdownUserName.textContent = currentUser.name;
    if (dropdownUserEmail) dropdownUserEmail.textContent = currentUser.email;
  }
  if (drawerUserSection) drawerUserSection.style.display = 'block';
  if (drawerUserInfo) {
    drawerUserInfo.style.display = 'flex';
    if (drawerUserAvatar) drawerUserAvatar.src = currentUser.profilePicture || '';
    if (drawerUserName) drawerUserName.textContent = currentUser.name;
    if (drawerUserEmail) drawerUserEmail.textContent = currentUser.email;
  }
  if (drawerLogoutBtn) drawerLogoutBtn.style.display = 'flex';
  const drawerProfileLink = document.getElementById('drawer-profile-link');
  if (drawerProfileLink) drawerProfileLink.style.display = 'flex';
  const drawerChatLink = document.getElementById('drawer-chat-link');
  if (drawerChatLink) drawerChatLink.style.display = 'flex';
}

// Show Google sign-in button
function showLoginButton() {
  if (userProfileBtn) userProfileBtn.style.display = 'none';
  if (cartIconWrap) cartIconWrap.style.display = 'none';
  if (googleBtnContainer) googleBtnContainer.style.display = '';
  if (googleBtnMobileContainer) googleBtnMobileContainer.style.display = '';
  if (drawerUserInfo) drawerUserInfo.style.display = 'none';
  if (drawerLogoutBtn) drawerLogoutBtn.style.display = 'none';
  const drawerProfileLink = document.getElementById('drawer-profile-link');
  if (drawerProfileLink) drawerProfileLink.style.display = 'none';
  const drawerChatLink = document.getElementById('drawer-chat-link');
  if (drawerChatLink) drawerChatLink.style.display = 'none';
}

// Logout
function handleLogout() {
  localStorage.removeItem('user_token');
  currentUser = null;
  cartItems = [];
  updateCartCount();
  if (userDropdownMenu) userDropdownMenu.classList.remove('open');
  if (mobileDrawer) mobileDrawer.classList.remove('open');
  showLoginButton();
  initGoogleSignIn();
}

// Toggle user dropdown
function toggleUserDropdown(e) {
  if (userDropdownMenu) {
    userDropdownMenu.classList.toggle('open');
    e.stopPropagation();
  }
}

// ===================== CART FUNCTIONS =====================

function updateCartCount() {
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCountBadge) cartCountBadge.textContent = count;
  if (cartIconWrap) cartIconWrap.style.display = currentUser && count > 0 ? 'flex' : currentUser ? 'flex' : 'none';
}

async function loadCartCount() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/cart', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('user_token')}` }
    });
    if (res.ok) {
      const data = await res.json();
      cartItems = data.items || [];
      updateCartCount();
    }
  } catch (err) {
    console.error('Failed to load cart:', err);
  }
}

async function addToCart(productId) {
  if (!currentUser) {
    pendingAction = { type: 'addToCart', productId };
    openSigninPrompt();
    return;
  }
  try {
    const res = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('user_token')}` },
      body: JSON.stringify({ productId, quantity: 1 })
    });
    const data = await res.json();
    if (data.success) {
      cartItems = data.cart.items || [];
      updateCartCount();
      showPaymentToast('success', 'Added to Cart', 'Product has been added to your cart.');
    } else {
      showPaymentToast('error', 'Failed', data.error || 'Could not add to cart.');
    }
  } catch (err) {
    showPaymentToast('error', 'Error', 'Failed to add to cart.');
  }
}

async function buyNow(productId) {
  if (!currentUser) {
    pendingAction = { type: 'buyNow', productId };
    openSigninPrompt();
    return;
  }
  try {
    const res = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('user_token')}` },
      body: JSON.stringify({ productId, quantity: 1 })
    });
    const data = await res.json();
    if (data.success) {
      cartItems = data.cart.items || [];
      updateCartCount();
      window.location.href = '/checkout';
    } else {
      showPaymentToast('error', 'Failed', data.error || 'Could not process.');
    }
  } catch (err) {
    showPaymentToast('error', 'Error', 'Failed to process.');
  }
}

async function addToCartAndCheckout(productId) {
  try {
    const res = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('user_token')}` },
      body: JSON.stringify({ productId, quantity: 1 })
    });
    const data = await res.json();
    if (data.success) {
      cartItems = data.cart.items || [];
      updateCartCount();
      // Open checkout with these items
      openCheckoutModal();
    } else {
      showPaymentToast('error', 'Failed', data.error || 'Could not process.');
    }
  } catch (err) {
    showPaymentToast('error', 'Error', 'Failed to process.');
  }
}

// ===================== CART MODAL =====================

function openCartModal() {
  if (!currentUser) {
    openSigninPrompt();
    return;
  }
  if (userDropdownMenu) userDropdownMenu.classList.remove('open');
  cartModal.classList.add('open');
  renderCartModal();
}

function closeCartModal() {
  cartModal.classList.remove('open');
}

async function renderCartModal() {
  if (!cartLoading || !cartEmpty || !cartItemsList || !cartSummary) return;
  cartLoading.style.display = 'block';
  cartEmpty.style.display = 'none';
  cartItemsList.style.display = 'none';
  cartSummary.style.display = 'none';

  try {
    const res = await fetch('/api/cart', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('user_token')}` }
    });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    cartItems = data.items || [];
    updateCartCount();

    cartLoading.style.display = 'none';
    if (!cartItems.length) {
      cartEmpty.style.display = 'block';
      return;
    }

    cartItemsList.style.display = 'block';
    cartSummary.style.display = 'flex';

    let total = 0;
    cartItemsList.innerHTML = cartItems.map(item => {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;
      return `<div class="cart-item" data-product-id="${item.product}">
        <img src="${item.image || '/uploads/placeholder.jpg'}" alt="${item.productName}" class="cart-item-img">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.productName}</div>
          <div class="cart-item-price">Rs. ${Number(item.price).toLocaleString()}</div>
          <div class="cart-item-qty-wrap">
            <button class="cart-qty-btn cart-qty-minus" data-product-id="${item.product}">-</button>
            <span class="cart-qty-value">${item.quantity}</span>
            <button class="cart-qty-btn cart-qty-plus" data-product-id="${item.product}">+</button>
          </div>
        </div>
        <div class="cart-item-total">Rs. ${Number(itemTotal).toLocaleString()}</div>
        <button class="cart-item-remove" data-product-id="${item.product}"><i class="fa-solid fa-trash-can"></i></button>
      </div>`;
    }).join('');
    cartTotalAmount.textContent = `Rs. ${Number(total).toLocaleString()}`;
  } catch (err) {
    cartLoading.style.display = 'none';
    cartEmpty.style.display = 'block';
    cartEmpty.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load cart.</p>';
  }
}

// ===================== SIGN-IN PROMPT =====================

function openSigninPrompt() {
  signinPromptModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(initGoogleSignIn, 300);
}

function closeSigninPrompt() {
  signinPromptModal.classList.remove('open');
  document.body.style.overflow = '';
  pendingAction = null;
}

// ===================== CHECKOUT MODAL =====================

function openCheckoutModal() {
  if (!currentUser) {
    openSigninPrompt();
    return;
  }
  closeCartModal();
  checkoutModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCheckoutSummary();
  // Set QR code and Discord link in checkout
  const qrImg = document.getElementById('checkout-qr-img');
  if (qrImg) qrImg.src = contactSettings.qrCode || '/images/qr.png';
  const discordLink = document.getElementById('checkout-discord-link');
  if (discordLink) discordLink.href = contactSettings.discord || 'https://discord.gg/syndicatestore';
}

function closeCheckoutModal() {
  checkoutModal.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCheckoutSummary() {
  if (!checkoutItemsPreview || !checkoutTotalAmount) return;
  let total = 0;
  checkoutItemsPreview.innerHTML = cartItems.map(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    return `<div class="checkout-item-row">
      <span class="checkout-item-name">${item.productName} x${item.quantity}</span>
      <span class="checkout-item-price">Rs. ${Number(itemTotal).toLocaleString()}</span>
    </div>`;
  }).join('');
  checkoutTotalAmount.textContent = `Rs. ${Number(total).toLocaleString()}`;
}

// Payment method selection
const paymentRadios = document.querySelectorAll('input[name="paymentMethod"]');
const checkoutScanFields = document.getElementById('checkout-scan-fields');
checkoutCashFields = document.getElementById('checkout-cash-fields');
if (paymentRadios.length) {
  paymentRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (checkoutScanFields && checkoutCashFields) {
        if (radio.value === 'Cash') {
          checkoutScanFields.style.display = 'none';
          checkoutCashFields.style.display = 'block';
        } else {
          checkoutScanFields.style.display = 'block';
          checkoutCashFields.style.display = 'none';
        }
      }
    });
  });
}

// Place Order
async function handlePlaceOrder(e) {
  e.preventDefault();
  const name = checkoutName.value.trim();
  const email = checkoutEmail.value.trim();
  const city = checkoutCity.value.trim();
  const address = checkoutAddress.value.trim();
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'Scan';

  if (!name || !email || !city || !address) {
    showPaymentToast('error', 'Missing Fields', 'Please fill in all shipping details.');
    return;
  }

  btnPlaceOrder.disabled = true;
  btnPlaceOrder.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('user_token')}` },
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
      cartItems = [];
      updateCartCount();
      closeCheckoutModal();

      const order = data.order;

      if (paymentMethod === 'Scan') {
        showPaymentToast('success', 'Order Placed!', `Please scan the QR code and send the payment screenshot to our Discord server for verification.`);
      } else {
        showPaymentToast('success', 'Order Placed!', `Your order has been placed successfully. Payment method: Cash on Delivery. We will contact you at ${phone}.`);
      }
    } else {
      showPaymentToast('error', 'Checkout Failed', data.error || 'Please try again.');
    }
  } catch (err) {
    showPaymentToast('error', 'Error', 'Failed to place order.');
  } finally {
    btnPlaceOrder.disabled = false;
    btnPlaceOrder.innerHTML = '<i class="fa-solid fa-check"></i> Place Order';
  }
}

// ===================== PRODUCT ACTIONS =====================

// Page Load Initialization
document.addEventListener('DOMContentLoaded', () => {
  fetchSettings();
  fetchProducts();
  fetchFeaturedProducts();
  setupEventListeners();
  checkUserAuth();
  setTimeout(initGoogleSignIn, 1000);
  setTimeout(checkPaymentStatus, 500);
});

// Fetch products from backend api
async function fetchProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    allProducts = data.value || data;
    renderProducts();
  } catch (error) {
    console.error('Error fetching products:', error);
    productsGrid.innerHTML = `
      <div class="error-state" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--secondary-neon);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; margin-bottom: 15px;"></i>
        <h3>Failed to load products</h3>
        <p style="color: var(--text-gray); margin-top: 10px;">Please check your server connection and database setup.</p>
        <button data-action="retry-products" class="btn btn-secondary" style="margin-top: 20px;">Try Again</button>
      </div>`;
  }
}

// Fetch social contact settings from api
async function fetchSettings() {
  try {
    const response = await fetch('/api/settings');
    if (response.ok) {
      contactSettings = await response.json();
      updateStaticContactLinks();
    }
  } catch (error) {
    console.error('Error fetching contact settings:', error);
  }
}

// Update links in footer/social panels
function updateStaticContactLinks() {
  const footerWhatsapp = document.getElementById('footer-link-whatsapp');
  const footerInstagram = document.getElementById('footer-link-instagram');
  const footerDiscord = document.getElementById('footer-link-discord');
  const cleanWhatsapp = contactSettings.whatsapp.replace(/[^0-9+]/g, '');
  if (footerWhatsapp) footerWhatsapp.href = `https://wa.me/${cleanWhatsapp}`;
  if (footerInstagram) footerInstagram.href = `https://instagram.com/${contactSettings.instagram.replace('@', '')}`;
  if (footerDiscord) footerDiscord.href = contactSettings.discord || 'https://discord.gg/syndicatestore';
}

// ===================== HERO SLIDER =====================
async function fetchFeaturedProducts() {
  try {
    const response = await fetch('/api/products/featured');
    const data = await response.json();
    sliderProducts = data.value || data;
    renderHeroSlider();
  } catch (error) {
    console.error('Error fetching featured products:', error);
    const loader = document.getElementById('slider-loader');
    if (loader) loader.style.display = 'none';
    const empty = document.getElementById('slider-empty');
    if (empty) empty.style.display = 'flex';
  }
}

function renderHeroSlider() {
  const track = document.getElementById('slider-track');
  const dotsContainer = document.getElementById('slider-dots');
  const loader = document.getElementById('slider-loader');
  const empty = document.getElementById('slider-empty');
  if (!track) return;
  if (loader) loader.classList.add('hidden');
  if (!sliderProducts.length) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';
  track.innerHTML = sliderProducts.map((product, index) => {
    const discount = product.originalPrice && product.originalPrice > product.price
      ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
    const discountHTML = discount > 0 ? `<span class="slider-discount-badge">-${discount}%</span>` : '';
    const originalPriceHTML = product.originalPrice ? `<span class="slider-original-price">Rs. ${Number(product.originalPrice).toLocaleString()}</span>` : '';
    return `
      <div class="slider-slide ${index === 0 ? 'active' : ''}" data-index="${index}" data-product-id="${product._id}" style="cursor:pointer">
        <img src="${product.image}" alt="${product.name}" loading="${index === 0 ? 'eager' : 'lazy'}">
        <div class="slider-overlay"></div>
        ${discountHTML}
        <div class="slider-indicator">${String(index + 1).padStart(2, '0')} / ${String(sliderProducts.length).padStart(2, '0')}</div>
        <div class="slider-info">
          <span class="slider-category">${product.category}</span>
          <h3 class="slider-name">${product.name}</h3>
          <div class="slider-price-row">
            <span class="slider-price">Rs. ${Number(product.price).toLocaleString()}</span>
            ${originalPriceHTML}
          </div>
        </div>
      </div>`;
  }).join('');
  dotsContainer.innerHTML = sliderProducts.map((_, index) => `
    <button class="slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Slide ${index + 1}"></button>
  `).join('');
  dotsContainer.querySelectorAll('.slider-dot').forEach(dot => {
    dot.addEventListener('click', () => { goToSlide(parseInt(dot.dataset.index)); resetSlideInterval(); });
  });
  const container = document.getElementById('hero-slider');
  container.addEventListener('mouseenter', () => { isSliderPaused = true; });
  container.addEventListener('mouseleave', () => { isSliderPaused = false; });
  startSlideInterval();
}

function goToSlide(index) {
  const slides = document.querySelectorAll('.slider-slide');
  const dots = document.querySelectorAll('.slider-dot');
  if (!slides.length) return;
  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;
  if (index === currentSlide) return;
  slides.forEach(s => { if (!s.classList.contains('active')) s.classList.remove('exit'); });
  const prevSlide = currentSlide;
  slides[prevSlide].classList.remove('active');
  slides[prevSlide].classList.add('exit');
  currentSlide = index;
  slides[currentSlide].classList.add('active');
  setTimeout(() => { slides[prevSlide].classList.remove('exit'); }, 800);
  dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
}

function startSlideInterval() {
  stopSlideInterval();
  slideInterval = setInterval(() => { if (!isSliderPaused) goToSlide(currentSlide + 1); }, 4000);
}
function stopSlideInterval() { if (slideInterval) { clearInterval(slideInterval); slideInterval = null; } }
function resetSlideInterval() { stopSlideInterval(); startSlideInterval(); }

// ===================== PRODUCT LIST =====================

function renderProducts() {
  const filtered = allProducts.filter(product => {
    const matchCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const matchSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        product.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  if (filtered.length === 0) {
    productsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-gray);">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 3rem; color: rgba(255,255,255,0.1); margin-bottom: 15px;"></i>
        <h3>No items found</h3>
        <p style="margin-top: 8px;">Try adjusting your keywords or category filters.</p>
      </div>`;
    searchFeedback.innerText = searchQuery ? `Found 0 results for "${searchQuery}"` : '';
    return;
  }

  searchFeedback.innerText = searchQuery ? `Found ${filtered.length} result(s) for "${searchQuery}"` : '';

  productsGrid.innerHTML = filtered.map(product => {
    const badgeHTML = product.badge ? `<span class="product-badge ${product.badge.toLowerCase()}">${product.badge}</span>` : '';
    const formattedPrice = Number(product.price).toLocaleString();
    const originalPriceHTML = product.originalPrice ? `<span class="product-original-price">Rs. ${Number(product.originalPrice).toLocaleString()}</span>` : '';
    return `
      <article class="product-card" data-id="${product._id}" data-slug="${product.slug || ''}">
        <div class="product-img-wrapper">
          ${badgeHTML}
          <img src="${product.image}" alt="${product.name}" loading="lazy">
        </div>
        <div class="product-info-wrap">
          <span class="product-category-lbl">${product.category}</span>
          <h3 class="product-title">${product.name}</h3>
          <p class="product-desc">${product.description}</p>
          <div class="product-price-row">
            <span class="product-price">Rs. ${formattedPrice}</span>
            ${originalPriceHTML}
          </div>
          <div class="product-cta-row">
            <button class="product-cta-btn add-cart-btn" data-product-id="${product._id}">
              <i class="fa-solid fa-cart-plus"></i> Add to Cart
            </button>
            <button class="product-cta-btn buy-now-btn" data-product-id="${product._id}">
              <i class="fa-solid fa-bolt"></i> Buy Now
            </button>
          </div>
        </div>
      </article>`;
  }).join('');
}

// Open modal with dynamic product purchase links
function openPurchaseModal(productId) {
  let product = allProducts.find(p => p._id === productId);
  if (!product) product = sliderProducts.find(p => p._id === productId);
  if (!product) return;

  modalProductImg.src = product.image;
  modalProductImg.alt = product.name;
  modalProductCategory.innerText = product.category;
  modalProductName.innerText = product.name;
  modalProductDesc.innerText = product.description;
  modalProductPrice.innerText = `Rs. ${Number(product.price).toLocaleString()}`;

  if (product.originalPrice) {
    modalProductOriginalPrice.style.display = 'inline';
    modalProductOriginalPrice.innerText = `Rs. ${Number(product.originalPrice).toLocaleString()}`;
  } else {
    modalProductOriginalPrice.style.display = 'none';
  }

  // Format custom message templates
  let textTemplate = contactSettings.customMessage || "Hello! I would like to buy: {product_name} priced at {product_price}. Is it available?";
  let parsedMsg = textTemplate
    .replace('{product_name}', product.name)
    .replace('{product_price}', `Rs. ${product.price.toLocaleString()}`);
  const encodedMsg = encodeURIComponent(parsedMsg);
  const cleanWhatsapp = contactSettings.whatsapp.replace(/[^0-9+]/g, '');
  contactWhatsapp.href = `https://wa.me/${cleanWhatsapp}?text=${encodedMsg}`;
  contactInstagram.href = `https://instagram.com/${contactSettings.instagram.replace('@', '')}`;
  contactDiscord.href = contactSettings.discord || 'https://discord.gg/syndicatestore';

  // Set product for buttons
  btnAddToCart.dataset.productId = productId;
  btnBuyNow.dataset.productId = productId;

  purchaseModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePurchaseModal() {
  purchaseModal.classList.remove('open');
  document.body.style.overflow = '';
}

// Setup listeners
function setupEventListeners() {
  // Navigation scrolling effect
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  });

  // Search input listeners
  const handleSearch = (e) => {
    searchQuery = e.target.value;
    if (e.target === searchInput) mobileSearchInput.value = searchQuery;
    else searchInput.value = searchQuery;
    renderProducts();
  };
  searchInput.addEventListener('input', handleSearch);
  mobileSearchInput.addEventListener('input', handleSearch);

  // Category filter buttons
  categoryFilters.forEach(btn => {
    btn.addEventListener('click', (e) => {
      categoryFilters.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedCategory = e.target.getAttribute('data-category');
      renderProducts();
    });
  });

  // Mobile Drawer Toggle
  mobileMenuToggle.addEventListener('click', () => mobileDrawer.classList.add('open'));
  drawerCloseBtn.addEventListener('click', () => mobileDrawer.classList.remove('open'));

  // Product grid click delegation
  productsGrid.addEventListener('click', (e) => {
    const addCartBtn = e.target.closest('.add-cart-btn');
    const buyNowBtn = e.target.closest('.buy-now-btn');
    const card = e.target.closest('.product-card');
    const retryBtn = e.target.closest('[data-action="retry-products"]');

    if (addCartBtn) {
      e.stopPropagation();
      addToCart(addCartBtn.dataset.productId);
      return;
    }
    if (buyNowBtn) {
      e.stopPropagation();
      buyNow(buyNowBtn.dataset.productId);
      return;
    }
    if (card) {
      const slug = card.dataset.slug;
      const id = card.dataset.id;
      window.location.href = slug ? `/${slug}` : `/product.html?id=${id}`;
      return;
    }
    if (retryBtn) fetchProducts();
  });

  // Hero slider slide click delegation
  const heroSlider = document.getElementById('hero-slider');
  if (heroSlider) {
    heroSlider.addEventListener('click', (e) => {
      const slide = e.target.closest('.slider-slide');
      if (slide && slide.dataset.productId) {
        const product = sliderProducts.find(p => p._id === slide.dataset.productId);
        if (product) {
          window.location.href = product.slug ? `/${product.slug}` : `/product.html?id=${product._id}`;
        }
      }
    });
  }

  // Modal handlers
  modalCloseBtn.addEventListener('click', closePurchaseModal);
  purchaseModal.addEventListener('click', (e) => { if (e.target === purchaseModal) closePurchaseModal(); });

  // Add to Cart and Buy Now buttons in modal
  btnAddToCart.addEventListener('click', () => {
    const pid = btnAddToCart.dataset.productId;
    if (pid) { addToCart(pid); closePurchaseModal(); }
  });
  btnBuyNow.addEventListener('click', () => {
    const pid = btnBuyNow.dataset.productId;
    if (pid) { buyNow(pid); closePurchaseModal(); }
  });

  // FAQ Accordion Toggle
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(otherItem => {
        otherItem.classList.remove('active');
        otherItem.querySelector('.faq-answer').style.maxHeight = null;
      });
      if (!isActive) {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + "px";
      }
    });
  });

  // Smooth links drawer close
  document.querySelectorAll('.drawer-link').forEach(link => {
    link.addEventListener('click', () => mobileDrawer.classList.remove('open'));
  });

  // Payment Toast Close
  const toastClose = document.getElementById('payment-toast-close');
  if (toastClose) toastClose.addEventListener('click', () => { document.getElementById('payment-toast').style.display = 'none'; });

  // User profile dropdown toggle
  if (userProfileTrigger) userProfileTrigger.addEventListener('click', toggleUserDropdown);
  document.addEventListener('click', (e) => {
    if (userDropdownMenu && userDropdownMenu.classList.contains('open') && !userProfileTrigger?.contains(e.target)) {
      userDropdownMenu.classList.remove('open');
    }
  });

  // Cart button in dropdown
  if (cartButton) cartButton.addEventListener('click', openCartModal);

  // Cart icon in navbar
  if (cartIconNav) cartIconNav.addEventListener('click', openCartModal);

  // My Orders button - redirect to profile page
  if (ordersButton) ordersButton.addEventListener('click', () => {
    if (userDropdownMenu) userDropdownMenu.classList.remove('open');
    window.location.href = '/profile.html#orders';
  });

  // Orders modal close
  if (ordersModalClose) ordersModalClose.addEventListener('click', closeOrdersModal);
  if (ordersModal) ordersModal.addEventListener('click', (e) => { if (e.target === ordersModal) closeOrdersModal(); });

  // Sign-in prompt close
  if (signinPromptClose) signinPromptClose.addEventListener('click', closeSigninPrompt);
  if (signinPromptModal) signinPromptModal.addEventListener('click', (e) => { if (e.target === signinPromptModal) closeSigninPrompt(); });

  // Cart modal close
  if (cartModalClose) cartModalClose.addEventListener('click', closeCartModal);
  if (cartModal) cartModal.addEventListener('click', (e) => { if (e.target === cartModal) closeCartModal(); });

  // Cart item actions (event delegation)
  if (cartItemsList) {
    cartItemsList.addEventListener('click', async (e) => {
      if (e.target.closest('.cart-qty-minus')) {
        const productId = e.target.closest('.cart-qty-minus').dataset.productId;
        await updateCartItemQuantity(productId, -1);
      } else if (e.target.closest('.cart-qty-plus')) {
        const productId = e.target.closest('.cart-qty-plus').dataset.productId;
        await updateCartItemQuantity(productId, 1);
      } else if (e.target.closest('.cart-item-remove')) {
        const productId = e.target.closest('.cart-item-remove').dataset.productId;
        await removeCartItem(productId);
      }
    });
  }

  // Proceed to Checkout
  if (btnProceedCheckout) btnProceedCheckout.addEventListener('click', () => {
    if (!currentUser) {
      pendingAction = { type: 'checkout' };
      openSigninPrompt();
      return;
    }
    window.location.href = '/checkout';
  });

  // Checkout modal close
  if (checkoutModalClose) checkoutModalClose.addEventListener('click', closeCheckoutModal);
  if (checkoutModal) checkoutModal.addEventListener('click', (e) => { if (e.target === checkoutModal) closeCheckoutModal(); });

  // Place order
  if (checkoutForm) checkoutForm.addEventListener('submit', handlePlaceOrder);

  // Logout buttons
  if (logoutButton) logoutButton.addEventListener('click', handleLogout);
  if (drawerLogoutBtn) drawerLogoutBtn.addEventListener('click', handleLogout);
}

// ===================== CART ITEM OPERATIONS =====================

async function updateCartItemQuantity(productId, change) {
  const item = cartItems.find(i => i.product === productId);
  if (!item) return;
  const newQty = item.quantity + change;
  if (newQty < 1) return;

  try {
    const token = localStorage.getItem('user_token');
    const res = await fetch(`/api/cart/item/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ quantity: newQty })
    });
    const data = await res.json();
    if (data.success) {
      cartItems = data.cart.items || [];
      updateCartCount();
      renderCartModal();
    }
  } catch (err) {
    console.error('Failed to update cart:', err);
  }
}

async function removeCartItem(productId) {
  try {
    const token = localStorage.getItem('user_token');
    const res = await fetch(`/api/cart/item/${productId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      cartItems = data.cart.items || [];
      updateCartCount();
      renderCartModal();
    }
  } catch (err) {
    console.error('Failed to remove item:', err);
  }
}

// ===================== MY ORDERS =====================

function openOrdersModal() {
  if (!ordersModal) return;
  if (userDropdownMenu) userDropdownMenu.classList.remove('open');
  ordersModal.classList.add('open');
  loadMyOrders();
}

function closeOrdersModal() {
  if (ordersModal) ordersModal.classList.remove('open');
}

async function loadMyOrders() {
  if (!ordersLoading || !ordersEmpty || !ordersList) return;
  ordersLoading.style.display = 'block';
  ordersEmpty.style.display = 'none';
  ordersList.style.display = 'none';
  ordersList.innerHTML = '';

  const token = localStorage.getItem('user_token');
  if (!token) {
    ordersLoading.style.display = 'none';
    ordersEmpty.style.display = 'block';
    ordersEmpty.innerHTML = '<i class="fa-solid fa-user-lock"></i><p>Please sign in to view your orders.</p>';
    return;
  }

  try {
    const res = await fetch('/api/orders/my', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load orders');
    const orders = await res.json();
    renderMyOrders(orders);
  } catch (err) {
    ordersLoading.style.display = 'none';
    ordersEmpty.style.display = 'block';
    ordersEmpty.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load orders. Please try again.</p>';
  }
}

function renderMyOrders(orders) {
  ordersLoading.style.display = 'none';
  if (!orders || !orders.length) {
    ordersEmpty.style.display = 'block';
    ordersEmpty.innerHTML = '<i class="fa-solid fa-box-open"></i><p>No orders yet. Make a purchase to see your orders here!</p>';
    return;
  }

  ordersEmpty.style.display = 'none';
  ordersList.style.display = 'block';

  ordersList.innerHTML = orders.map(o => {
    const date = new Date(o.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const products = o.items.map(i => `${i.productName} x${i.quantity}`).join(', ');
    
    // Payment status
    let statusLabel, statusClass;
    if (o.paymentMethod === 'Cash') {
      statusLabel = 'Cash on Delivery';
      statusClass = 'cash';
    } else if (o.paymentStatus === 'paid') {
      statusLabel = 'Paid';
      statusClass = 'paid';
    } else if (o.paymentStatus === 'failed') {
      statusLabel = 'Failed';
      statusClass = 'failed';
    } else if (o.paymentMethod === 'eSewa' && o.paymentStatus === 'pending') {
      // Check if payment deadline has passed
      if (o.paymentDeadline && new Date(o.paymentDeadline) < new Date()) {
        statusLabel = 'Payment Pending';
        statusClass = 'pending';
      } else if (o.paymentDeadline) {
        const minsLeft = Math.round((new Date(o.paymentDeadline) - new Date()) / 60000);
        statusLabel = `Pay within ${minsLeft}m`;
        statusClass = 'pending';
      } else {
        statusLabel = 'Pending';
        statusClass = 'pending';
      }
    } else {
      statusLabel = 'Pending';
      statusClass = 'pending';
    }

    // Shipping status
    const shippingLabels = {
      'yet_to_pack': 'Yet to Pack',
      'packed': 'Packed',
      'shipped': 'Shipped',
      'delivered': 'Delivered'
    };
    const shippingLabel = shippingLabels[o.shippingStatus] || 'Yet to Pack';

    // Tracking number
    const trackingHtml = o.trackingNumber ? `<div class="order-tracking"><i class="fa-solid fa-truck"></i> Tracking: ${o.trackingNumber}</div>` : '';

    // Shipping address
    const addressHtml = o.shippingAddress ? `<div class="order-address"><i class="fa-solid fa-location-dot"></i> ${o.shippingCity || ''}, ${o.shippingAddress}</div>` : '';

    // Pay Now button
    let payNowHtml = '';
    if (o.paymentMethod === 'eSewa' && o.paymentStatus === 'pending') {
      if (o.paymentDeadline && new Date(o.paymentDeadline) > new Date()) {
        payNowHtml = `<button class="order-pay-now-btn" data-order-id="${o._id}"><i class="fa-solid fa-credit-card"></i> Pay Now</button>`;
      } else {
        payNowHtml = `<span class="order-expired-label">Payment expired</span>`;
      }
    }

    const refHtml = o.transactionId ? `<div class="order-ref-id">Ref: ${o.transactionId}</div>` : '';

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

  // Pay Now button handlers
  ordersList.querySelectorAll('.order-pay-now-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.orderId;
      try {
        const res = await fetch(`/api/orders/pay-now/${orderId}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('user_token')}` }
        });
        const data = await res.json();
        if (data.success) {
          showPaymentToast('success', 'Order Ready', 'Please scan the QR code to pay and send the screenshot to our Discord server.');
          if (contactSettings.qrCode) {
            window.open(contactSettings.qrCode, '_blank');
          }
        } else {
          showPaymentToast('error', 'Payment Failed', data.error || 'Could not process payment.');
          loadMyOrders();
        }
      } catch (err) {
        showPaymentToast('error', 'Error', 'Failed to initiate payment.');
      }
    });
  });
}

// ===================== PAYMENT TOAST =====================

function showPaymentToast(type, title, msg) {
  const toast = document.getElementById('payment-toast');
  const icon = document.getElementById('payment-toast-icon');
  const titleEl = document.getElementById('payment-toast-title');
  const msgEl = document.getElementById('payment-toast-msg');
  if (type === 'success') {
    icon.className = 'fa-solid fa-circle-check';
    toast.style.borderLeftColor = 'var(--price-green)';
  } else if (type === 'error') {
    icon.className = 'fa-solid fa-circle-xmark';
    toast.style.borderLeftColor = 'var(--secondary-neon)';
  } else {
    icon.className = 'fa-solid fa-circle-info';
    toast.style.borderLeftColor = 'var(--primary-neon)';
  }
  titleEl.textContent = title;
  msgEl.textContent = msg;
  toast.style.display = 'flex';
  setTimeout(() => { toast.style.display = 'none'; }, 8000);
}

// Check URL for payment status from eSewa redirect
function checkPaymentStatus() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  if (!payment) return;
  const cleanUrl = window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, cleanUrl);
  if (payment === 'success') {
    const refId = params.get('refId') || '';
    const pid = params.get('pid') || '';
    const msg = pid ? `Payment ${pid} completed. Ref: ${refId}.` : `Transaction reference: ${refId}.`;
    showPaymentToast('success', 'Payment Successful!', msg);
  } else if (payment === 'failed' || payment === 'error') {
    const msg = params.get('msg') || 'Payment could not be processed.';
    showPaymentToast('error', 'Payment Failed', decodeURIComponent(msg));
  } else if (payment === 'cancelled') {
    showPaymentToast('error', 'Payment Cancelled', 'You cancelled the payment.');
  }
}
