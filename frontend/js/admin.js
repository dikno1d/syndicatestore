// ===================== SYNDICATE ADMIN DASHBOARD CONTROLLER =====================
'use strict';

const API_BASE = '';
const _origFetch = window.fetch;
window.fetch = function(url, opts) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    url = API_BASE + url;
  }
  opts = opts || {};
  opts.headers = opts.headers || {};
  const stored = localStorage.getItem('admin_token');
  if (stored && !opts.headers.Authorization) {
    opts.headers.Authorization = 'Bearer ' + stored;
  }
  return _origFetch.call(this, url, opts);
};

let productsList = [];
let categoriesList = [];
let invoicesList = [];
let currentInvoiceItems = [];

const fallbackImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23111928'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%234b5563' font-size='10'%3ENo Image%3C/text%3E%3C/svg%3E";

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth();
  if (!authed) return;

  document.getElementById('admin-loading').style.display = 'none';
  const wrapper = document.querySelector('.admin-wrapper');
  if (wrapper) wrapper.style.display = '';

  setupSidebar();
  setupAlerts();
  loadProducts();
  loadCategories();
  loadSettings();
  setupProductDrawer();
  setupInvoiceDrawer();
  setupSettingsForm();
  setupSecurityForm();
  setupMultiAdmin();
  setupLogout();
  setupPrintModal();
  setupOrderDrawer();
  setupSidebarToggle();
  setupPaymentSearch();
  setupEventDelegation();
});

// ===== AUTH CHECK =====
async function checkAuth() {
  try {
    const res = await fetch('/api/admin/check');
    const data = await res.json();
    if (!data.authenticated) {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin-login';
      return false;
    }
    try {
      const stored = localStorage.getItem('admin_token');
      if (stored) {
        const base64 = stored.split('.')[1];
        const payload = JSON.parse(atob(base64));
        if (payload.username) {
          document.getElementById('admin-username-display').textContent = payload.username;
          document.getElementById('header-username').textContent = payload.username;
        }
      }
    } catch (_) {}
    return true;
  } catch (err) {
    window.location.href = '/admin-login';
    return false;
  }
}

// ===== SIDEBAR NAVIGATION =====
function setupSidebar() {
  const menuBtns = document.querySelectorAll('.menu-btn[data-target]');
  const sections = document.querySelectorAll('.dashboard-section');
  const titles = {
    'section-products': 'Products Manager',
    'section-customers': 'Customer Management',
    'section-customer-orders': 'Customer Orders',
    'section-invoices': 'Invoice Manager',
    'section-payments': 'Payment Transactions',
    'section-chats': 'Customer Chats',
    'section-settings': 'Contact Settings',
    'section-security': 'Admin Security'
  };

  menuBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      menuBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-target');
      sections.forEach(s => s.classList.toggle('active', s.id === target));
      document.getElementById('dashboard-title').textContent = titles[target] || 'Dashboard';

      // Load data when specific tabs are opened
      if (target === 'section-invoices') loadInvoices();
      if (target === 'section-customers') loadCustomers();
      if (target === 'section-customer-orders') loadOrders();
      if (target === 'section-payments') loadPayments();
      if (target === 'section-chats') loadChatRooms();

      // Close mobile sidebar if open
      document.getElementById('sidebar').classList.remove('mobile-open');
    });
  });
}

function setupSidebarToggle() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
  }
}

// ===== GLOBAL ALERT =====
let alertTimer;
function showAlert(text, type = 'success') {
  clearTimeout(alertTimer);
  const banner = document.getElementById('status-alert');
  document.getElementById('alert-text').textContent = text;
  banner.className = `alert-banner ${type}`;
  banner.style.display = 'flex';
  alertTimer = setTimeout(() => { banner.style.display = 'none'; }, 4500);
}

function setupAlerts() {
  document.getElementById('alert-close').addEventListener('click', () => {
    document.getElementById('status-alert').style.display = 'none';
  });
}

// ===== LOGOUT =====
function setupLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin-login';
    }
  });
}

// ===================== PRODUCTS =====================

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error();
    productsList = await res.json();
    renderProductsTable();
    refreshCategoryCounts();
  } catch {
    showAlert('Failed to load products.', 'error');
    document.getElementById('products-table-body').innerHTML = `<tr><td colspan="6" class="loading-td">Failed to load products.</td></tr>`;
  }
}

function renderProductsTable() {
  const query = (document.getElementById('admin-search').value || '').toLowerCase();
  const filtered = productsList.filter(p =>
    p.name.toLowerCase().includes(query) ||
    p.category.toLowerCase().includes(query)
  );
  const tbody = document.getElementById('products-table-body');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-td">No products found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(p => {
    const badgeHtml = p.badge ? `<span class="pill pill-${p.badge.toLowerCase()}">${p.badge}</span>` : '—';
    const featuredHtml = p.featured ? `<span class="pill pill-featured" title="Featured in Hero Slider"><i class="fa-solid fa-star"></i></span>` : '—';
    return `<tr data-product-id="${p._id}">
      <td><img class="product-table-img" src="${p.image}" alt="${p.name}"></td>
      <td style="font-weight:600;max-width:180px">${p.name}</td>
      <td>${p.category}</td>
      <td style="color:var(--price-green);font-weight:700">Rs. ${Number(p.price).toLocaleString()}</td>
      <td>${badgeHtml}</td>
      <td><div class="action-btns-wrap" style="justify-content:center">${featuredHtml}</div></td>
      <td>
        <div class="action-btns-wrap">
          <button class="btn-action edit" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn-action delete" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('admin-search').addEventListener('input', renderProductsTable);

// ===== PRODUCT DRAWER =====
function setupProductDrawer() {
  const drawer = document.getElementById('product-drawer');
  const closeDrawer = () => drawer.classList.remove('open');

  document.getElementById('btn-add-product').addEventListener('click', () => {
    resetProductForm();
    document.getElementById('drawer-form-title').textContent = 'Add New Product';
    drawer.classList.add('open');
  });

  document.getElementById('product-drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('btn-cancel-drawer').addEventListener('click', closeDrawer);
  drawer.addEventListener('click', e => { if (e.target === drawer) closeDrawer(); });

  // Image tabs
  document.getElementById('tab-img-file').addEventListener('click', () => switchImgTab('file'));
  document.getElementById('tab-img-url').addEventListener('click', () => switchImgTab('url'));

  // URL preview
  document.getElementById('prod-image-url').addEventListener('input', e => {
    const url = e.target.value.trim();
    document.getElementById('prod-image-final').value = url;
    document.getElementById('img-preview-box').src = url || fallbackImg;
  });

  // File upload
  document.getElementById('prod-image-file').addEventListener('change', uploadProductImage);

  // Drop zone
  const dropZone = document.querySelector('.file-upload-zone');
  ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); }));
  dropZone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files.length) {
      document.getElementById('prod-image-file').files = files;
      document.getElementById('prod-image-file').dispatchEvent(new Event('change'));
    }
  });

  // Form submit
  document.getElementById('product-form').addEventListener('submit', saveProduct);
}

function switchImgTab(tab) {
  const isFile = tab === 'file';
  document.getElementById('tab-img-file').classList.toggle('active', isFile);
  document.getElementById('tab-img-url').classList.toggle('active', !isFile);
  document.getElementById('block-img-file').style.display = isFile ? 'block' : 'none';
  document.getElementById('block-img-url').style.display = isFile ? 'none' : 'block';
}

async function uploadProductImage() {
  const file = document.getElementById('prod-image-file').files[0];
  if (!file) return;
  document.getElementById('file-name-preview').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
  const formData = new FormData();
  formData.append('image', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok && data.url) {
      document.getElementById('prod-image-final').value = data.url;
      document.getElementById('img-preview-box').src = data.url;
      document.getElementById('file-name-preview').innerHTML = '<i class="fa-solid fa-check" style="color:var(--price-green)"></i> Uploaded!';
    } else {
      document.getElementById('file-name-preview').innerHTML = `<span style="color:#ff6688">${data.error || 'Upload failed'}</span>`;
    }
  } catch {
    document.getElementById('file-name-preview').innerHTML = '<span style="color:#ff6688">Connection error</span>';
  }
}

function resetProductForm() {
  document.getElementById('product-id').value = '';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-original-price').value = '';
  document.getElementById('prod-category').selectedIndex = 0;
  document.getElementById('prod-badge').selectedIndex = 0;
  document.getElementById('prod-featured').checked = false;
  document.getElementById('prod-description').value = '';
  document.getElementById('prod-image-final').value = '';
  document.getElementById('prod-image-url').value = '';
  document.getElementById('prod-image-file').value = '';
  document.getElementById('file-name-preview').textContent = 'No file selected';
  document.getElementById('img-preview-box').src = fallbackImg;
  document.getElementById('prod-video').value = '';
  document.getElementById('prod-gallery').value = '';
  switchImgTab('file');
}

async function saveProduct(e) {
  e.preventDefault();
  const image = document.getElementById('prod-image-final').value.trim();
  if (!image) { showAlert('Please upload or provide a product image URL.', 'error'); return; }

  const btn = document.getElementById('btn-save-product');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  const id = document.getElementById('product-id').value;
  const payload = {
    name: document.getElementById('prod-name').value.trim(),
    price: document.getElementById('prod-price').value,
    originalPrice: document.getElementById('prod-original-price').value,
    category: document.getElementById('prod-category').value,
    badge: document.getElementById('prod-badge').value,
    featured: document.getElementById('prod-featured').checked,
    description: document.getElementById('prod-description').value.trim(),
    image,
    video: document.getElementById('prod-video').value.trim(),
    gallery: document.getElementById('prod-gallery').value.split('\n').map(s => s.trim()).filter(Boolean)
  };

  try {
    const res = await fetch(id ? `/api/products/${id}` : '/api/products', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showAlert(id ? 'Product updated!' : 'Product created!', 'success');
      document.getElementById('product-drawer').classList.remove('open');
      loadProducts();
    } else {
      showAlert(data.error || 'Failed to save product.', 'error');
    }
  } catch {
    showAlert('Server error saving product.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Product';
  }
}

function editProduct(id) {
  const p = productsList.find(x => x._id === id);
  if (!p) return;
  resetProductForm();
  document.getElementById('drawer-form-title').textContent = 'Edit Product';
  document.getElementById('product-id').value = p._id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-price').value = p.price;
  document.getElementById('prod-original-price').value = p.originalPrice || '';
  document.getElementById('prod-category').value = p.category;
  document.getElementById('prod-badge').value = p.badge || '';
  document.getElementById('prod-featured').checked = p.featured || false;
  document.getElementById('prod-description').value = p.description;
  document.getElementById('prod-image-final').value = p.image;
  document.getElementById('img-preview-box').src = p.image;
  document.getElementById('prod-video').value = p.video || '';
  document.getElementById('prod-gallery').value = (p.gallery || []).join('\n');
  if (p.image.startsWith('/uploads/')) {
    switchImgTab('file');
    document.getElementById('file-name-preview').textContent = 'Currently: file stored';
  } else {
    switchImgTab('url');
    document.getElementById('prod-image-url').value = p.image;
  }
  document.getElementById('product-drawer').classList.add('open');
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This action cannot be undone.')) return;
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showAlert('Product deleted.', 'success');
      loadProducts();
    } else {
      showAlert(data.error || 'Failed to delete.', 'error');
    }
  } catch {
    showAlert('Server error.', 'error');
  }
}

// ===================== INVOICES =====================

async function loadInvoices() {
  try {
    const res = await fetch('/api/invoices');
    if (!res.ok) throw new Error();
    invoicesList = await res.json();
    renderInvoicesTable();
    renderInvoiceStats();
  } catch {
    showAlert('Failed to load invoices.', 'error');
    document.getElementById('invoices-table-body').innerHTML = `<tr><td colspan="7" class="loading-td">Failed to load invoices.</td></tr>`;
  }
}

function renderInvoiceStats() {
  const total = invoicesList.length;
  const revenue = invoicesList.filter(i => i.paymentMethod !== 'Pending').reduce((sum, i) => sum + i.grandTotal, 0);
  const pending = invoicesList.filter(i => i.status === 'Pending').length;
  const transit = invoicesList.filter(i => i.status === 'In Transit').length;
  document.getElementById('stat-total-inv').textContent = total;
  document.getElementById('stat-total-rev').textContent = `Rs. ${revenue.toLocaleString()}`;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-transit').textContent = transit;
}

function renderInvoicesTable() {
  const query = (document.getElementById('invoice-search').value || '').toLowerCase();
  const filtered = invoicesList.filter(inv =>
    inv.invoiceNumber.toLowerCase().includes(query) ||
    inv.customerName.toLowerCase().includes(query) ||
    inv.customerPhone.includes(query)
  );
  const tbody = document.getElementById('invoices-table-body');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-td">No invoices found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(inv => {
    const date = new Date(inv.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const payPill = getPaymentPill(inv.paymentMethod);
    const statusPill = getStatusPill(inv.status);
    return `<tr data-invoice-id="${inv._id}">
      <td style="font-weight:700;color:var(--primary-neon)">${inv.invoiceNumber}</td>
      <td style="font-size:0.85rem">${date}</td>
      <td>
        <div style="font-weight:600">${inv.customerName}</div>
        <div style="font-size:0.78rem;color:var(--text-gray)">${inv.customerPhone}</div>
      </td>
      <td style="font-weight:800;color:var(--price-green)">Rs. ${Number(inv.grandTotal).toLocaleString()}</td>
      <td>${payPill}</td>
      <td>${statusPill}</td>
      <td>
        <div class="action-btns-wrap">
          <button class="btn-action view" title="Quick Update"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn-action print" title="Print Invoice"><i class="fa-solid fa-print"></i></button>
          <button class="btn-action delete" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function getPaymentPill(method) {
  const map = { 'Pending': 'pill-pending', 'Cash': 'pill-cash', 'Online': 'pill-online' };
  return `<span class="pill ${map[method] || 'pill-pending'}">${method}</span>`;
}

function getStatusPill(status) {
  const map = { 'Pending': 'pill-pending', 'In Transit': 'pill-transit', 'Delivered': 'pill-delivered', 'Cancelled': 'pill-cancelled' };
  return `<span class="pill ${map[status] || 'pill-pending'}">${status}</span>`;
}

document.getElementById('invoice-search').addEventListener('input', renderInvoicesTable);

// ===== INVOICE DRAWER =====
function setupInvoiceDrawer() {
  const drawer = document.getElementById('invoice-drawer');
  const closeDrawer = () => { drawer.classList.remove('open'); resetInvoiceForm(); };

  document.getElementById('btn-create-invoice').addEventListener('click', () => {
    resetInvoiceForm();
    document.getElementById('invoice-drawer-title').textContent = 'Create New Invoice';
    addInvoiceItem(); // Add first item row
    drawer.classList.add('open');
  });

  document.getElementById('invoice-drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('btn-cancel-invoice').addEventListener('click', closeDrawer);
  drawer.addEventListener('click', e => { if (e.target === drawer) closeDrawer(); });

  document.getElementById('btn-add-item').addEventListener('click', addInvoiceItem);
  document.getElementById('inv-discount').addEventListener('input', recalcTotals);
  document.getElementById('invoice-form').addEventListener('submit', saveInvoice);
}

function resetInvoiceForm() {
  currentInvoiceItems = [];
  document.getElementById('invoice-id').value = '';
  document.getElementById('inv-customer-name').value = '';
  document.getElementById('inv-customer-phone').value = '';
  document.getElementById('inv-customer-email').value = '';
  document.getElementById('inv-customer-address').value = '';
  document.getElementById('inv-discount').value = '0';
  document.getElementById('inv-payment').value = 'Pending';
  document.getElementById('inv-status').value = 'Pending';
  document.getElementById('invoice-items-container').innerHTML = '';
  document.getElementById('inv-subtotal').textContent = 'Rs. 0';
  document.getElementById('inv-grand-total').textContent = 'Rs. 0';
}

let itemRowIndex = 0;
function addInvoiceItem(existingItem = null) {
  const idx = itemRowIndex++;
  const container = document.getElementById('invoice-items-container');

  const productOptions = productsList.map(p =>
    `<option value="${p._id}" data-price="${p.price}" ${existingItem && existingItem.product === p._id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  const div = document.createElement('div');
  div.className = 'invoice-item-row';
  div.dataset.idx = idx;
  div.innerHTML = `
    <select class="item-product" data-idx="${idx}">
      <option value="">-- Select product or type custom --</option>
      ${productOptions}
      <option value="custom">Custom Item...</option>
    </select>
    <input type="text" class="item-name" placeholder="Item name" value="${existingItem ? existingItem.name : ''}" style="${!existingItem ? 'display:none' : ''}">
    <input type="number" class="item-price" placeholder="Price" min="0" value="${existingItem ? existingItem.price : ''}">
    <input type="number" class="item-qty" placeholder="Qty" min="1" value="${existingItem ? existingItem.quantity : 1}">
    <button type="button" class="btn-remove-item"><i class="fa-solid fa-xmark"></i></button>
  `;
  container.appendChild(div);
  recalcTotals();
}

function onProductSelect(select, idx) {
  const row = document.querySelector(`.invoice-item-row[data-idx="${idx}"]`);
  const nameInput = row.querySelector('.item-name');
  const priceInput = row.querySelector('.item-price');

  if (select.value === 'custom') {
    nameInput.style.display = 'block';
    nameInput.value = '';
    priceInput.value = '';
  } else if (select.value) {
    const opt = select.options[select.selectedIndex];
    nameInput.style.display = 'none';
    nameInput.value = opt.text;
    priceInput.value = opt.getAttribute('data-price');
    recalcTotals();
  } else {
    nameInput.style.display = 'none';
    nameInput.value = '';
    priceInput.value = '';
    recalcTotals();
  }
}

function removeInvoiceItem(btn) {
  btn.closest('.invoice-item-row').remove();
  recalcTotals();
}

function recalcTotals() {
  const rows = document.querySelectorAll('.invoice-item-row');
  let subtotal = 0;
  rows.forEach(row => {
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const qty = parseInt(row.querySelector('.item-qty').value) || 0;
    subtotal += price * qty;
  });
  const discount = parseFloat(document.getElementById('inv-discount').value) || 0;
  const grand = Math.max(0, subtotal - discount);
  document.getElementById('inv-subtotal').textContent = `Rs. ${subtotal.toLocaleString()}`;
  document.getElementById('inv-grand-total').textContent = `Rs. ${grand.toLocaleString()}`;
}

function getInvoiceItemsFromDOM() {
  const rows = document.querySelectorAll('.invoice-item-row');
  const items = [];
  rows.forEach(row => {
    const productSelect = row.querySelector('.item-product');
    const nameInput = row.querySelector('.item-name');
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const qty = parseInt(row.querySelector('.item-qty').value) || 1;
    const productId = productSelect.value && productSelect.value !== 'custom' ? productSelect.value : null;
    const name = productId ? productSelect.options[productSelect.selectedIndex].text : nameInput.value.trim();
    if (name && price) items.push({ product: productId, name, price, quantity: qty, total: price * qty });
  });
  return items;
}

async function saveInvoice(e) {
  e.preventDefault();
  const items = getInvoiceItemsFromDOM();
  if (!items.length) { showAlert('Please add at least one item.', 'error'); return; }

  const btn = document.getElementById('btn-save-invoice');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  const id = document.getElementById('invoice-id').value;
  const payload = {
    customerName: document.getElementById('inv-customer-name').value.trim(),
    customerPhone: document.getElementById('inv-customer-phone').value.trim(),
    customerEmail: document.getElementById('inv-customer-email').value.trim(),
    customerAddress: document.getElementById('inv-customer-address').value.trim(),
    items,
    discount: parseFloat(document.getElementById('inv-discount').value) || 0,
    paymentMethod: document.getElementById('inv-payment').value,
    status: document.getElementById('inv-status').value
  };

  try {
    const res = await fetch(id ? `/api/invoices/${id}` : '/api/invoices', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showAlert(id ? `Invoice updated: ${data.invoice.invoiceNumber}` : `Invoice created: ${data.invoice.invoiceNumber}`, 'success');
      document.getElementById('invoice-drawer').classList.remove('open');
      resetInvoiceForm();
      loadInvoices();
    } else {
      showAlert(data.error || 'Failed to save invoice.', 'error');
    }
  } catch {
    showAlert('Server error saving invoice.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-file-invoice"></i> Save Invoice';
  }
}

// ===== QUICK UPDATE (open edit drawer) =====
function quickUpdateInvoice(id) {
  const inv = invoicesList.find(i => i._id === id);
  if (!inv) return;
  resetInvoiceForm();
  document.getElementById('invoice-drawer-title').textContent = `Edit: ${inv.invoiceNumber}`;
  document.getElementById('invoice-id').value = inv._id;
  document.getElementById('inv-customer-name').value = inv.customerName;
  document.getElementById('inv-customer-phone').value = inv.customerPhone;
  document.getElementById('inv-customer-email').value = inv.customerEmail || '';
  document.getElementById('inv-customer-address').value = inv.customerAddress;
  document.getElementById('inv-discount').value = inv.discount || 0;
  document.getElementById('inv-payment').value = inv.paymentMethod;
  document.getElementById('inv-status').value = inv.status;

  // Rebuild items
  inv.items.forEach(item => addInvoiceItemExisting(item));
  recalcTotals();
  document.getElementById('invoice-drawer').classList.add('open');
}

function addInvoiceItemExisting(item) {
  const idx = itemRowIndex++;
  const container = document.getElementById('invoice-items-container');
  const productOptions = productsList.map(p =>
    `<option value="${p._id}" data-price="${p.price}" ${item.product && item.product.toString() === p._id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  const div = document.createElement('div');
  div.className = 'invoice-item-row';
  div.dataset.idx = idx;
  const isCustom = !item.product || !productsList.find(p => p._id === item.product);

  div.innerHTML = `
    <select class="item-product" data-idx="${idx}">
      <option value="">-- Select product --</option>
      ${productOptions}
      <option value="custom" ${isCustom ? 'selected' : ''}>Custom Item...</option>
    </select>
    <input type="text" class="item-name" placeholder="Item name" value="${item.name}" style="${isCustom ? '' : 'display:none'}">
    <input type="number" class="item-price" placeholder="Price" min="0" value="${item.price}">
    <input type="number" class="item-qty" placeholder="Qty" min="1" value="${item.quantity}">
    <button type="button" class="btn-remove-item"><i class="fa-solid fa-xmark"></i></button>
  `;
  container.appendChild(div);
}

async function deleteInvoice(id) {
  if (!confirm('Delete this invoice permanently?')) return;
  try {
    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showAlert('Invoice deleted.', 'success');
      loadInvoices();
    } else {
      showAlert(data.error || 'Delete failed.', 'error');
    }
  } catch {
    showAlert('Server error.', 'error');
  }
}

// ===== PRINT INVOICE =====
function setupPrintModal() {
  document.getElementById('close-print-modal').addEventListener('click', () => {
    document.getElementById('print-modal').classList.remove('open');
  });
  document.getElementById('btn-print-invoice').addEventListener('click', () => {
    window.print();
  });
}

function printInvoice(id) {
  const inv = invoicesList.find(i => i._id === id);
  if (!inv) return;

  const date = new Date(inv.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('print-inv-number').textContent = inv.invoiceNumber;
  document.getElementById('print-inv-date').textContent = date;
  document.getElementById('print-cust-name').textContent = inv.customerName;
  document.getElementById('print-cust-phone').textContent = inv.customerPhone;
  document.getElementById('print-cust-email').textContent = inv.customerEmail || '';
  document.getElementById('print-cust-address').textContent = inv.customerAddress;

  // Payment badge
  const payBadge = document.getElementById('print-payment-badge');
  const payClass = { Pending: 'payment-pending', Cash: 'payment-cash', Online: 'payment-online' };
  payBadge.className = `status-tag ${payClass[inv.paymentMethod] || 'payment-pending'}`;
  payBadge.textContent = `Payment: ${inv.paymentMethod}`;

  // Status badge
  const stBadge = document.getElementById('print-status-badge');
  const stClass = { Pending: 'status-pending', 'In Transit': 'status-transit', Delivered: 'status-delivered', Cancelled: 'status-cancelled' };
  stBadge.className = `status-tag ${stClass[inv.status] || 'status-pending'}`;
  stBadge.textContent = `Status: ${inv.status}`;

  // Items table
  const tbody = document.getElementById('print-items-tbody');
  tbody.innerHTML = inv.items.map((item, i) =>
    `<tr>
      <td>${i + 1}</td>
      <td>${item.name}</td>
      <td>Rs. ${Number(item.price).toLocaleString()}</td>
      <td>${item.quantity}</td>
      <td>Rs. ${Number(item.total).toLocaleString()}</td>
    </tr>`
  ).join('');

  document.getElementById('print-subtotal').textContent = `Rs. ${Number(inv.subtotal).toLocaleString()}`;
  document.getElementById('print-discount').textContent = inv.discount > 0 ? `- Rs. ${Number(inv.discount).toLocaleString()}` : 'Rs. 0';
  document.getElementById('print-grand-total').textContent = `Rs. ${Number(inv.grandTotal).toLocaleString()}`;

  document.getElementById('print-modal').classList.add('open');
}

// ===================== PAYMENTS (eSewa) =====================

let paymentsList = [];

async function loadPayments() {
  try {
    const res = await fetch('/api/payments');
    if (!res.ok) throw new Error();
    paymentsList = await res.json();
    renderPaymentsTable();
  } catch {
    document.getElementById('payments-table-body').innerHTML =
      `<tr><td colspan="9" class="loading-td" style="color:var(--danger-red)">Failed to load payments.</td></tr>`;
  }
}

function renderPaymentsTable() {
  const query = (document.getElementById('payment-search').value || '').toLowerCase();
  const filtered = paymentsList.filter(p =>
    (p.paymentId && p.paymentId.toLowerCase().includes(query)) ||
    p.transactionId.toLowerCase().includes(query) ||
    (p.refId && p.refId.toLowerCase().includes(query)) ||
    p.productName.toLowerCase().includes(query) ||
    (p.customerName && p.customerName.toLowerCase().includes(query))
  );
  const tbody = document.getElementById('payments-table-body');
  if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="loading-td">No payments found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(p => {
    const date = new Date(p.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const statusPill = getPaymentStatusPill(p.status);
    const customer = p.customerName ? `${p.customerName}<br><span style="font-size:0.78rem;color:var(--text-gray)">${p.customerPhone || ''}</span>` : '—';
    const orderRef = p.orderId ? `<span style="font-size:0.75rem;color:var(--primary-neon)">${p.orderId}</span>` : '—';
    return `<tr>
      <td style="font-family:monospace;font-size:0.8rem;color:var(--primary-neon)">${p.paymentId || p.transactionId}</td>
      <td style="font-size:0.8rem">${date}</td>
      <td style="max-width:150px">${p.productName}</td>
      <td style="font-weight:700;color:var(--price-green)">Rs. ${Number(p.amount).toLocaleString()}</td>
      <td style="font-family:monospace;font-size:0.8rem;color:var(--text-gray)">${p.refId || '—'}</td>
      <td>${statusPill}</td>
      <td>${customer}</td>
      <td style="font-family:monospace;font-size:0.7rem;color:var(--text-gray)">${orderRef}</td>
    </tr>`;
  }).join('');
}

function getPaymentStatusPill(status) {
  const map = {
    'pending': 'pill-pending',
    'success': 'pill-delivered',
    'failed': 'pill-cancelled',
    'cancelled': 'pill-cancelled',
    'expired': 'pill-cancelled'
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="pill ${map[status] || 'pill-pending'}">${label}</span>`;
}

function setupPaymentSearch() {
  const searchInput = document.getElementById('payment-search');
  if (searchInput) {
    searchInput.addEventListener('input', renderPaymentsTable);
  }
}

// ===================== CUSTOMERS (Google Users) =====================

let customersList = [];

async function loadCustomers() {
  const search = document.getElementById('customers-search')?.value || '';
  const url = search ? `/api/admin/users?search=${encodeURIComponent(search)}` : '/api/admin/users';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    customersList = await res.json();
    renderCustomersTable();
  } catch {
    document.getElementById('customers-table-body').innerHTML =
      `<tr><td colspan="6" class="loading-td" style="color:var(--danger-red)">Failed to load customers.</td></tr>`;
  }
}

function renderCustomersTable() {
  const tbody = document.getElementById('customers-table-body');
  const countEl = document.getElementById('customers-count');
  if (!customersList.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-td">No customers found.</td></tr>`;
    if (countEl) countEl.textContent = '0 users';
    return;
  }
  if (countEl) countEl.textContent = `${customersList.length} user(s)`;
  tbody.innerHTML = customersList.map(u => {
    const joined = new Date(u.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    const rolePill = u.role === 'admin' ? '<span class="pill pill-transit">Admin</span>' : '<span class="pill pill-online">User</span>';
    return `<tr>
      <td style="font-weight:600">
        ${u.profilePicture ? `<img src="${u.profilePicture}" style="width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:8px;border:1px solid var(--border-color)">` : ''}
        ${u.name}
      </td>
      <td style="color:var(--text-gray)">${u.email}</td>
      <td style="font-family:monospace;font-size:0.78rem;color:var(--text-gray);max-width:120px;overflow:hidden;text-overflow:ellipsis">${u.googleId || '—'}</td>
      <td>${rolePill}</td>
      <td style="font-size:0.82rem;color:var(--text-gray)">${lastLogin}</td>
      <td style="font-size:0.82rem;color:var(--text-gray)">${joined}</td>
    </tr>`;
  }).join('');
}

document.getElementById('customers-search')?.addEventListener('input', () => {
  // Debounce server-side search
  clearTimeout(window._custSearchTimer);
  window._custSearchTimer = setTimeout(loadCustomers, 400);
});

// ===================== CUSTOMER ORDERS =====================

let ordersList = [];

async function loadOrders() {
  const search = document.getElementById('orders-search')?.value || '';
  const statusFilter = document.getElementById('orders-status-filter')?.value || '';
  const shippingFilter = document.getElementById('orders-shipping-filter')?.value || '';
  let url = '/api/admin/orders?';
  const params = [];
  if (statusFilter) params.push(`paymentStatus=${encodeURIComponent(statusFilter)}`);
  if (shippingFilter) params.push(`shippingStatus=${encodeURIComponent(shippingFilter)}`);
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  url += params.join('&');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    ordersList = await res.json();
    renderOrdersTable();
  } catch {
    document.getElementById('orders-table-body').innerHTML =
      `<tr><td colspan="11" class="loading-td" style="color:var(--danger-red)">Failed to load orders.</td></tr>`;
  }
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-table-body');
  const countEl = document.getElementById('orders-count');
  if (!ordersList.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="loading-td">No orders found.</td></tr>`;
    if (countEl) countEl.textContent = '0 orders';
    return;
  }
  if (countEl) countEl.textContent = `${ordersList.length} order(s)`;
  tbody.innerHTML = ordersList.map(o => {
    const date = new Date(o.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const statusPill = getOrderStatusPill(o.paymentStatus);
    const payMethod = o.paymentMethod;
    const customerName = o.customerName || o.userId?.name || 'Unknown';
    const customerEmail = o.userId?.email || '';
    const products = o.items.map(i => i.productName).join(', ');
    const refId = o.transactionId ? `<span style="font-family:monospace;font-size:0.78rem;color:var(--primary-neon)">${o.transactionId}</span>` : '<span style="color:var(--text-gray)">—</span>';
    const shippingPill = getShippingStatusPill(o.shippingStatus);
    const trackingNum = o.trackingNumber || '—';
    return `<tr data-order-id="${o._id}">
      <td style="font-weight:600">${customerName}</td>
      <td style="color:var(--text-gray);font-size:0.82rem">${customerEmail}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${products}">${products}</td>
      <td style="font-weight:700;color:var(--price-green)">Rs. ${Number(o.totalAmount).toLocaleString()}</td>
      <td><span class="pill ${payMethod === 'eSewa' ? 'pill-online' : payMethod === 'Cash' ? 'pill-cash' : 'pill-pending'}">${payMethod}</span></td>
      <td>${statusPill}</td>
      <td>${refId}</td>
      <td>${shippingPill}</td>
      <td style="font-family:monospace;font-size:0.78rem;color:var(--text-gray);max-width:100px;overflow:hidden;text-overflow:ellipsis">${trackingNum}</td>
      <td style="font-size:0.82rem;color:var(--text-gray)">${date}</td>
      <td>
        <div class="action-btns-wrap">
          <button class="btn-action edit" title="Edit Order"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn-action invoice" title="Generate Invoice"><i class="fa-solid fa-file-invoice-dollar"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function getOrderStatusPill(status) {
  const map = {
    'pending': '<span class="pill pill-delivered">Paid</span>',
    'paid': '<span class="pill pill-delivered">Paid</span>',
    'failed': '<span class="pill pill-cancelled">Failed</span>',
    'cash_on_delivery': '<span class="pill pill-cash">Cash on Delivery</span>'
  };
  return map[status] || `<span class="pill pill-pending">${status}</span>`;
}

function getShippingStatusPill(status) {
  const map = {
    'yet_to_pack': '<span class="pill pill-pending">Yet to Pack</span>',
    'packed': '<span class="pill pill-transit">Packed</span>',
    'shipped': '<span class="pill pill-online">Shipped</span>',
    'delivered': '<span class="pill pill-delivered">Delivered</span>'
  };
  return map[status] || '<span class="pill pill-pending">Yet to Pack</span>';
}

document.getElementById('orders-search')?.addEventListener('input', () => {
  clearTimeout(window._ordSearchTimer);
  window._ordSearchTimer = setTimeout(loadOrders, 400);
});
document.getElementById('orders-status-filter')?.addEventListener('change', loadOrders);
document.getElementById('orders-shipping-filter')?.addEventListener('change', loadOrders);

// ===== ORDER EDIT DRAWER =====

function setupOrderDrawer() {
  const drawer = document.getElementById('order-drawer');
  const closeDrawer = () => { drawer.classList.remove('open'); resetOrderForm(); };

  document.getElementById('order-drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('btn-cancel-order').addEventListener('click', closeDrawer);
  drawer.addEventListener('click', e => { if (e.target === drawer) closeDrawer(); });

  document.getElementById('order-form').addEventListener('submit', saveOrderUpdate);
}

function resetOrderForm() {
  document.getElementById('order-id').value = '';
  document.getElementById('order-tracking-number').value = '';
  document.getElementById('order-shipping-status').value = 'yet_to_pack';
  document.getElementById('order-payment-status').value = 'pending';
}

function openOrderDrawer(orderId) {
  const order = ordersList.find(o => o._id === orderId);
  if (!order) return;

  document.getElementById('order-drawer-title').textContent = 'Update Order';
  document.getElementById('order-id').value = order._id;
  document.getElementById('order-tracking-number').value = order.trackingNumber || '';
  document.getElementById('order-shipping-status').value = order.shippingStatus || 'yet_to_pack';
  document.getElementById('order-payment-status').value = order.paymentStatus || 'pending';

  // Fill detail info
  const customerName = order.customerName || order.userId?.name || 'Unknown';
  const orderEmail = order.customerEmail || order.userId?.email || '';
  const shippingAddr = [order.shippingCity, order.shippingAddress].filter(Boolean).join(', ') || 'N/A';
  const items = order.items.map(i => `${i.productName} x${i.quantity}`).join(', ');
  const payLabel = order.paymentMethod === 'Cash' ? 'Cash on Delivery' : order.paymentMethod;

  document.getElementById('order-detail-customer').textContent = customerName;
  document.getElementById('order-detail-email').textContent = orderEmail;
  document.getElementById('order-detail-phone').textContent = orderEmail;
  document.getElementById('order-detail-address').textContent = shippingAddr;
  document.getElementById('order-detail-amount').textContent = `Rs. ${Number(order.totalAmount).toLocaleString()}`;
  document.getElementById('order-detail-payment').textContent = payLabel;
  document.getElementById('order-detail-items').textContent = items;
  const refEl = document.getElementById('order-detail-refid');
  if (refEl) refEl.textContent = order.transactionId || '—';

  document.getElementById('order-drawer').classList.add('open');
}

function generateInvoiceFromOrder(orderId) {
  const order = ordersList.find(o => o._id === orderId);
  if (!order) return;

  resetInvoiceForm();
  document.getElementById('invoice-drawer-title').textContent = `Invoice from Order`;

  // Pre-fill customer details
  const customerName = order.customerName || order.userId?.name || 'Unknown';
  const orderEmail = order.customerEmail || order.userId?.email || '';
  document.getElementById('inv-customer-name').value = customerName;
  document.getElementById('inv-customer-phone').value = orderEmail;
  document.getElementById('inv-customer-email').value = orderEmail;
  document.getElementById('inv-customer-address').value = [order.shippingCity, order.shippingAddress].filter(Boolean).join(', ');

  // Pre-fill payment and status based on order
  const payMap = { 'cash_on_delivery': 'Cash', 'paid': 'Online', 'pending': 'Pending', 'failed': 'Pending' };
  document.getElementById('inv-payment').value = payMap[order.paymentStatus] || 'Pending';

  const statusMap = { 'delivered': 'Delivered', 'shipped': 'In Transit', 'packed': 'In Transit', 'yet_to_pack': 'Pending' };
  document.getElementById('inv-status').value = statusMap[order.shippingStatus] || 'Pending';

  // Add items from order
  if (order.items && order.items.length) {
    order.items.forEach(item => {
      const matchedProduct = productsList.find(p => p._id === item.product || p.name === item.productName);
      const idx = itemRowIndex++;
      const container = document.getElementById('invoice-items-container');
      const productOptions = productsList.map(p =>
        `<option value="${p._id}" data-price="${p.price}" ${matchedProduct && matchedProduct._id === p._id ? 'selected' : ''}>${p.name}</option>`
      ).join('');
      const div = document.createElement('div');
      div.className = 'invoice-item-row';
      div.dataset.idx = idx;
      div.innerHTML = `
        <select class="item-product" data-idx="${idx}">
          <option value="">-- Select product or type custom --</option>
          ${productOptions}
          <option value="custom">Custom Item...</option>
        </select>
        <input type="text" class="item-name" placeholder="Item name" value="${item.productName}" style="${matchedProduct ? 'display:none' : ''}">
        <input type="number" class="item-price" placeholder="Price" min="0" value="${item.price}">
        <input type="number" class="item-qty" placeholder="Qty" min="1" value="${item.quantity}">
        <button type="button" class="btn-remove-item"><i class="fa-solid fa-xmark"></i></button>
      `;
      container.appendChild(div);
    });
  }

  recalcTotals();
  document.getElementById('invoice-drawer').classList.add('open');
  showAlert('Invoice form pre-filled from order. Review and save.', 'success');
}

async function saveOrderUpdate(e) {
  e.preventDefault();
  const id = document.getElementById('order-id').value;
  if (!id) return;

  const btn = document.getElementById('btn-save-order');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  const payload = {
    trackingNumber: document.getElementById('order-tracking-number').value.trim(),
    shippingStatus: document.getElementById('order-shipping-status').value,
    paymentStatus: document.getElementById('order-payment-status').value
  };

  try {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showAlert('Order updated successfully!', 'success');
      document.getElementById('order-drawer').classList.remove('open');
      loadOrders();
    } else {
      showAlert(data.error || 'Failed to update order.', 'error');
    }
  } catch {
    showAlert('Server error updating order.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Update Order';
  }
}

// Hook into sidebar navigation to load payments
const origSidebarSetup = setupSidebar;
setupSidebar = function() {
  origSidebarSetup.call(this);
  const menuBtns = document.querySelectorAll('.menu-btn[data-target]');
  menuBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target === 'section-payments') {
        loadPayments();
      } else if (target === 'section-categories') {
        loadCategories();
      }
    });
  });
  const addBtn = document.getElementById('btn-add-category');
  if (addBtn) addBtn.addEventListener('click', addCategory);
  const catInput = document.getElementById('cat-name');
  if (catInput) catInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } });
};

// ===================== CATEGORIES =====================
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error();
    categoriesList = await res.json();
    renderCategoriesTable(categoriesList);
    populateCategoryDropdown(categoriesList);
  } catch {
    document.getElementById('categories-table-body').innerHTML = '<tr><td colspan="3" class="loading-td">Failed to load categories.</td></tr>';
  }
}

function refreshCategoryCounts() {
  renderCategoriesTable(categoriesList);
}

function renderCategoriesTable(categories) {
  const tbody = document.getElementById('categories-table-body');
  if (!categories.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="loading-td">No categories yet. Add one above.</td></tr>';
    return;
  }
  tbody.innerHTML = categories.map(c => {
    const count = productsList.filter(p => p.category === c.name).length;
    return `
    <tr data-cat-id="${c._id}">
      <td>${c.name}</td>
      <td>${count}</td>
      <td>
        <div class="action-btns-wrap">
          <button class="btn-action edit" title="Edit" onclick="editCategory('${c._id}')"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn-action delete" title="Delete" onclick="deleteCategory('${c._id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function populateCategoryDropdown(categories) {
  const sel = document.getElementById('prod-category');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select a category...</option>' +
    categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  sel.value = current;
}

async function addCategory() {
  const input = document.getElementById('cat-name');
  const name = input.value.trim();
  if (!name) { showAlert('Please enter a category name.', 'error'); return; }
  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      input.value = '';
      showAlert('Category created!', 'success');
      loadCategories();
    } else {
      showAlert(data.error || 'Failed to create category.', 'error');
    }
  } catch {
    showAlert('Server error.', 'error');
  }
}

function editCategory(id) {
  const row = document.querySelector(`tr[data-cat-id="${id}"]`);
  if (!row) return;
  const name = row.querySelector('td:first-child').textContent;
  const newName = prompt('Edit category name:', name);
  if (!newName || newName.trim() === name) return;
  fetch('/api/categories/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName.trim() })
  }).then(res => res.json()).then(data => {
    if (data.success) { showAlert('Category updated!', 'success'); loadCategories(); }
    else showAlert(data.error || 'Failed to update.', 'error');
  }).catch(() => showAlert('Server error.', 'error'));
}

async function deleteCategory(id) {
  if (!confirm('Delete this category? Products using it will keep the name but the filter will be removed.')) return;
  try {
    const res = await fetch('/api/categories/' + id, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showAlert('Category deleted.', 'success');
      loadCategories();
    } else {
      showAlert(data.error || 'Failed to delete.', 'error');
    }
  } catch {
    showAlert('Server error.', 'error');
  }
}

// ===================== SETTINGS =====================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('s-whatsapp').value = data.whatsapp || '';
    document.getElementById('s-discord').value = data.discord || '';
    document.getElementById('s-instagram').value = data.instagram || '';
    document.getElementById('s-youtube').value = data.youtube || '';
    document.getElementById('s-show-whatsapp').checked = data.showWhatsapp !== false;
    document.getElementById('s-show-instagram').checked = data.showInstagram !== false;
    document.getElementById('s-show-discord').checked = data.showDiscord !== false;
    document.getElementById('s-show-youtube').checked = data.showYoutube !== false;
    document.getElementById('s-message').value = data.customMessage || '';
    document.getElementById('s-qr-url').value = data.qrCode || '';
    document.getElementById('qr-preview-box').src = data.qrCode || '';
  } catch {
    showAlert('Failed to load contact settings.', 'error');
  }
}

// QR file preview
document.addEventListener('DOMContentLoaded', () => {
  const qrFileInput = document.getElementById('s-qr-file');
  if (qrFileInput) {
    qrFileInput.addEventListener('change', () => {
      if (qrFileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = (e) => {
          document.getElementById('qr-preview-box').src = e.target.result;
        };
        reader.readAsDataURL(qrFileInput.files[0]);
      }
    });
  }
});

function setupSettingsForm() {
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-settings');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
      const qrInput = document.getElementById('s-qr-file');
      let qrValue = document.getElementById('s-qr-url').value;
      if (qrInput.files.length > 0) {
        const formData = new FormData();
        formData.append('image', qrInput.files[0]);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.url) qrValue = uploadData.url;
      }
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp: document.getElementById('s-whatsapp').value,
          discord: document.getElementById('s-discord').value,
          instagram: document.getElementById('s-instagram').value,
          youtube: document.getElementById('s-youtube').value,
          showWhatsapp: document.getElementById('s-show-whatsapp').checked,
          showInstagram: document.getElementById('s-show-instagram').checked,
          showDiscord: document.getElementById('s-show-discord').checked,
          showYoutube: document.getElementById('s-show-youtube').checked,
          customMessage: document.getElementById('s-message').value,
          qrCode: qrValue
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showAlert('Contact settings saved!', 'success');
      } else {
        showAlert(data.error || 'Failed to save.', 'error');
      }
    } catch {
      showAlert('Server error.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Settings';
    }
  });
}

// ===================== SECURITY / CREDENTIALS =====================
function setupSecurityForm() {
  const form = document.getElementById('credentials-form');
  const warning = document.getElementById('cred-warning');
  const warningMsg = document.getElementById('cred-warning-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    warning.style.display = 'none';

    const currentPass = document.getElementById('cred-current-pass').value;
    const newUsername = document.getElementById('cred-new-username').value.trim();
    const newPass = document.getElementById('cred-new-pass').value;
    const confirmPass = document.getElementById('cred-confirm-pass').value;

    // Client-side validation
    if (newPass.length < 8) {
      warningMsg.textContent = 'New password must be at least 8 characters.';
      warning.style.display = 'flex';
      return;
    }
    if (newPass !== confirmPass) {
      warningMsg.textContent = 'New passwords do not match.';
      warning.style.display = 'flex';
      return;
    }
    if (newUsername.length < 3) {
      warningMsg.textContent = 'Username must be at least 3 characters.';
      warning.style.display = 'flex';
      return;
    }

    const btn = document.getElementById('btn-save-creds');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

    try {
      const res = await fetch('/api/admin/change-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPass, newUsername, newPassword: newPass })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showAlert('Credentials updated! Redirecting to login...', 'success');
        setTimeout(() => { window.location.href = '/admin-login'; }, 2000);
      } else {
        warningMsg.textContent = data.error || 'Update failed.';
        warning.style.display = 'flex';
      }
    } catch {
      warningMsg.textContent = 'Server connection error.';
      warning.style.display = 'flex';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Credentials & Re-login';
    }
  });
}

// ===================== MULTI-ADMIN ACCOUNTS MANAGEMENT =====================
async function loadAdminAccounts() {
  const tbody = document.getElementById('admin-accounts-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="loading-td"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const res = await fetch('/api/admin/accounts');
    if (!res.ok) throw new Error();
    const data = await res.json();
    const admins = data.admins || [];
    
    // Decode user from localStorage token
    let loggedInUser = '';
    try {
      const stored = localStorage.getItem('admin_token');
      if (stored) {
        const base64 = stored.split('.')[1];
        const payload = JSON.parse(atob(base64));
        loggedInUser = payload.username;
      }
    } catch (_) {}

    if (!admins.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="loading-td">No admin accounts found.</td></tr>`;
      return;
    }

    tbody.innerHTML = admins.map(adm => {
      const date = new Date(adm.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour: '2-digit', minute: '2-digit' });
      const isSelf = adm.username === loggedInUser;
      const deleteBtn = isSelf 
        ? `<span class="pill pill-online"><i class="fa-solid fa-user-check"></i> Current User</span>` 
        : `<button class="btn-action delete" data-admin-username="${adm.username}" title="Delete Account"><i class="fa-solid fa-trash-can"></i></button>`;

      return `<tr>
        <td style="font-weight:600;color:var(--text-white)">${adm.username}</td>
        <td><span class="pill pill-transit">${adm.role}</span></td>
        <td style="font-size:0.85rem;color:var(--text-gray)">${date}</td>
        <td>${deleteBtn}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-td" style="color:var(--danger-red)">Failed to load admin accounts.</td></tr>`;
  }
}

async function deleteAdminAccount(username) {
  if (!confirm(`Are you sure you want to delete admin account "${username}" permanently?`)) return;
  try {
    const res = await fetch(`/api/admin/accounts/${username}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showAlert(`Admin "${username}" deleted successfully.`, 'success');
      loadAdminAccounts();
    } else {
      showAlert(data.error || 'Failed to delete admin account.', 'error');
    }
  } catch {
    showAlert('Server error deleting admin account.', 'error');
  }
}

function setupMultiAdmin() {
  loadAdminAccounts();

  const form = document.getElementById('new-admin-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('new-admin-user');
    const passwordInput = document.getElementById('new-admin-pass');
    const btn = document.getElementById('btn-create-admin');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (username.length < 3) {
      showAlert('Username must be at least 3 characters.', 'error');
      return;
    }
    if (password.length < 8) {
      showAlert('Password must be at least 8 characters.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';

    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showAlert(`Admin account "${username}" created.`, 'success');
        usernameInput.value = '';
        passwordInput.value = '';
        loadAdminAccounts();
      } else {
        showAlert(data.error || 'Failed to create admin account.', 'error');
      }
    } catch {
      showAlert('Server error creating admin account.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Admin Account';
    }
  });
}

function setupEventDelegation() {
  // Image error fallback
  document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('product-table-img')) {
      e.target.src = fallbackImg;
    }
  }, true);

  // Product table actions
  const productTbody = document.getElementById('products-table-body');
  if (productTbody) {
    productTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const row = btn.closest('tr[data-product-id]');
      if (!row) return;
      const id = row.dataset.productId;
      if (btn.classList.contains('edit')) {
        editProduct(id);
      } else if (btn.classList.contains('delete')) {
        deleteProduct(id);
      }
    });
  }

  // Invoice table actions
  const invoiceTbody = document.getElementById('invoices-table-body');
  if (invoiceTbody) {
    invoiceTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const row = btn.closest('tr[data-invoice-id]');
      if (!row) return;
      const id = row.dataset.invoiceId;
      if (btn.classList.contains('view')) {
        quickUpdateInvoice(id);
      } else if (btn.classList.contains('print')) {
        printInvoice(id);
      } else if (btn.classList.contains('delete')) {
        deleteInvoice(id);
      }
    });
  }

  // Admin accounts table actions
  const adminTbody = document.getElementById('admin-accounts-tbody');
  if (adminTbody) {
    adminTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const username = btn.dataset.adminUsername;
      if (username && btn.classList.contains('delete')) {
        deleteAdminAccount(username);
      }
    });
  }

  // Orders table actions
  const ordersTbody = document.getElementById('orders-table-body');
  if (ordersTbody) {
    ordersTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const row = btn.closest('tr[data-order-id]');
      if (!row) return;
      const id = row.dataset.orderId;
      if (btn.classList.contains('edit')) {
        openOrderDrawer(id);
      } else if (btn.classList.contains('invoice')) {
        generateInvoiceFromOrder(id);
      }
    });
  }

  // Invoice items container event delegation
  const itemsContainer = document.getElementById('invoice-items-container');
  if (itemsContainer) {
    // Product select change
    itemsContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('item-product')) {
        const idx = parseInt(e.target.dataset.idx);
        onProductSelect(e.target, idx);
      }
    });

    // Price/qty input recalc
    itemsContainer.addEventListener('input', (e) => {
      if (e.target.classList.contains('item-price') || e.target.classList.contains('item-qty')) {
        recalcTotals();
      }
    });

    // Remove item button
    itemsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-remove-item');
      if (btn) {
        removeInvoiceItem(btn);
      }
    });
  }

}

window.deleteAdminAccount = deleteAdminAccount;

// ===================== CHAT SYSTEM =====================

let chatRooms = [];
let activeChatRoomId = null;

async function loadChatRooms() {
  const list = document.getElementById('chats-list');
  const sort = document.getElementById('chats-sort')?.value || 'newest';
  list.innerHTML = '<div class="chats-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading chats...</div>';
  try {
    const res = await fetch(`/api/admin/chat/rooms?sort=${sort}`);
    const rooms = await res.json();
    chatRooms = rooms;
    if (!rooms.length) {
      list.innerHTML = '<div class="chats-loading">No chats yet.</div>';
      return;
    }
    list.innerHTML = rooms.map(r => {
      const name = r.userId?.name || 'Unknown';
      const initial = name.charAt(0).toUpperCase();
      const time = r.lastMessageAt ? new Date(r.lastMessageAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
      const replied = r.repliedByAdmin
        ? '<div class="chat-room-replied"><i class="fa-solid fa-check-double"></i> Replied</div>'
        : '<div class="chat-room-unreplied"><i class="fa-solid fa-clock"></i> Awaiting reply</div>';
      return `<div class="chat-room-item" data-room-id="${r._id}">
        <div class="chat-room-avatar">${initial}</div>
        <div class="chat-room-info">
          <div class="chat-room-name">${name}</div>
          <div class="chat-room-preview">${r.lastMessage || ''}</div>
        </div>
        <div class="chat-room-meta">
          <div class="chat-room-time">${time}</div>
          ${replied}
        </div>
      </div>`;
    }).join('');

    // Attach click handlers
    list.querySelectorAll('.chat-room-item').forEach(item => {
      item.addEventListener('click', () => openChatConversation(item.dataset.roomId));
    });
  } catch (err) {
    list.innerHTML = '<div class="chats-loading" style="color:var(--secondary-neon)">Failed to load chats.</div>';
  }
}

async function openChatConversation(roomId) {
  activeChatRoomId = roomId;
  const room = chatRooms.find(r => r._id === roomId);
  if (!room) return;

  document.querySelectorAll('.chat-room-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.chat-room-item[data-room-id="${roomId}"]`)?.classList.add('active');

  document.getElementById('chats-conversation-empty').style.display = 'none';
  document.getElementById('chats-conversation-active').style.display = 'flex';
  document.getElementById('chats-customer-name').textContent = room.userId?.name || 'Customer';

  const messagesEl = document.getElementById('chats-conversation-messages');
  messagesEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-gray)"><i class="fa-solid fa-spinner fa-spin"></i></div>';

  try {
    const res = await fetch(`/api/admin/chat/messages/${roomId}`);
    const msgs = await res.json();
    if (!msgs.length) {
      messagesEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-gray)">No messages yet.</div>';
      return;
    }
    messagesEl.innerHTML = msgs.map(m => `
      <div class="chat-msg ${m.isAdmin ? 'admin' : 'customer'}">
        ${m.text}
        <div class="chat-msg-meta">${m.senderName} · ${new Date(m.createdAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
      </div>
    `).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    messagesEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--secondary-neon)">Failed to load messages.</div>';
  }
}

async function sendAdminChatMessage() {
  const input = document.getElementById('chats-admin-input');
  const text = input.value.trim();
  if (!text || !activeChatRoomId) return;
  input.value = '';
  try {
    const res = await fetch('/api/admin/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      body: JSON.stringify({ roomId: activeChatRoomId, text })
    });
    if (res.ok) {
      await openChatConversation(activeChatRoomId);
      await loadChatRooms();
    }
  } catch (err) { /* silent */ }
}

document.getElementById('chats-sort')?.addEventListener('change', loadChatRooms);
document.getElementById('chats-admin-send-btn')?.addEventListener('click', sendAdminChatMessage);
document.getElementById('chats-admin-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAdminChatMessage(); });
