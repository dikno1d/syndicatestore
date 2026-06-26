(function() {
  const loading = document.getElementById('product-loading');
  const error = document.getElementById('product-error');
  const content = document.getElementById('product-content');

  const detailImage = document.getElementById('detail-image');
  const detailCategory = document.getElementById('detail-category');
  const detailTitle = document.getElementById('detail-title');
  const detailPrice = document.getElementById('detail-price');
  const detailOriginalPrice = document.getElementById('detail-original-price');
  const detailBadgeWrap = document.getElementById('detail-badge-wrap');
  const detailBadge = document.getElementById('detail-badge');
  const detailDesc = document.getElementById('detail-desc');
  const detailVideoWrap = document.getElementById('detail-video-wrap');
  const detailVideoSource = document.getElementById('detail-video-source');
  const detailVideo = document.getElementById('detail-video');
  const detailVideoEmbed = document.getElementById('detail-video-embed');
  const detailVideoIframe = document.getElementById('detail-video-iframe');
  const detailGalleryWrap = document.getElementById('detail-gallery-wrap');
  const detailGalleryThumbs = document.getElementById('detail-gallery-thumbs');

  const detailWhatsapp = document.getElementById('detail-whatsapp');
  const detailInstagram = document.getElementById('detail-instagram');
  const detailDiscord = document.getElementById('detail-discord');
  const detailYoutube = document.getElementById('detail-youtube');
  const detailAddCart = document.getElementById('detail-add-cart');
  const detailBuyNow = document.getElementById('detail-buy-now');

  // Determine if we have an ID from query param or slug from path
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  const pathParts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const productSlug = (!productId && pathParts.length === 1) ? pathParts[0] : null;

  if (!productId && !productSlug) {
    loading.style.display = 'none';
    error.style.display = 'block';
    return;
  }

  function getYouTubeId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  async function loadProduct() {
    try {
      const url = productId
        ? `/api/products/${productId}`
        : `/api/products/slug/${encodeURIComponent(productSlug)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Not found');
      const product = await res.json();
      renderProduct(product);
    } catch (err) {
      loading.style.display = 'none';
      error.style.display = 'block';
    }
  }

  function renderProduct(product) {
    loading.style.display = 'none';
    content.style.display = 'grid';

    detailImage.src = product.image;
    detailImage.alt = product.name;
    detailCategory.textContent = product.category;
    detailTitle.textContent = product.name;
    detailPrice.textContent = `Rs. ${Number(product.price).toLocaleString()}`;

    if (product.originalPrice) {
      detailOriginalPrice.style.display = 'inline';
      detailOriginalPrice.textContent = `Rs. ${Number(product.originalPrice).toLocaleString()}`;
    } else {
      detailOriginalPrice.style.display = 'none';
    }

    if (product.badge) {
      detailBadgeWrap.style.display = 'flex';
      detailBadge.textContent = product.badge;
    } else {
      detailBadgeWrap.style.display = 'none';
    }

    detailDesc.textContent = product.description;

    // Video
    if (product.video) {
      detailVideoWrap.style.display = 'block';
      const youtubeId = getYouTubeId(product.video);
      if (youtubeId) {
        detailVideo.style.display = 'none';
        detailVideoEmbed.style.display = 'block';
        detailVideoIframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=0&rel=0`;
      } else {
        detailVideoEmbed.style.display = 'none';
        detailVideo.style.display = 'block';
        detailVideoSource.src = product.video;
        detailVideo.load();
      }
    } else {
      detailVideoWrap.style.display = 'none';
    }

    // Gallery thumbnails (main image + extra gallery images)
    {
      const allImages = [product.image, ...(product.gallery || [])].filter(Boolean);
      const uniqueImages = [...new Set(allImages)];
      if (uniqueImages.length > 1) {
        detailGalleryWrap.style.display = 'block';
        detailGalleryThumbs.innerHTML = uniqueImages.map(url =>
          `<img src="${url}" alt="" class="gallery-thumb${url === product.image ? ' active' : ''}" onclick="document.getElementById('detail-image').src=this.src">`
        ).join('');
      } else {
        detailGalleryWrap.style.display = 'none';
      }
    }

    // Contact links
    const msgTemplate = (typeof contactSettings !== 'undefined' && contactSettings.customMessage
      ? contactSettings.customMessage
      : "Hello! I would like to buy: {product_name} priced at {product_price}. Is it available?")
      .replace('{product_name}', product.name)
      .replace('{product_price}', `Rs. ${Number(product.price).toLocaleString()}`);
    const encodedMsg = encodeURIComponent(msgTemplate);
    const cleanWhatsapp = (typeof contactSettings !== 'undefined' && contactSettings.whatsapp || '').replace(/[^0-9+]/g, '');
    if (detailWhatsapp) {
      detailWhatsapp.href = `https://wa.me/${cleanWhatsapp}?text=${encodedMsg}`;
      detailWhatsapp.style.display = (typeof contactSettings !== 'undefined' && contactSettings.showWhatsapp !== false) ? '' : 'none';
    }
    if (detailInstagram) {
      detailInstagram.href = `https://instagram.com/${((typeof contactSettings !== 'undefined' && contactSettings.instagram) || '').replace('@', '')}`;
      detailInstagram.style.display = (typeof contactSettings !== 'undefined' && contactSettings.showInstagram !== false) ? '' : 'none';
    }
    if (detailDiscord) {
      detailDiscord.href = (typeof contactSettings !== 'undefined' && contactSettings.discord) || 'https://discord.gg/syndicatestore';
      detailDiscord.style.display = (typeof contactSettings !== 'undefined' && contactSettings.showDiscord !== false) ? '' : 'none';
    }
    if (detailYoutube) {
      detailYoutube.href = (typeof contactSettings !== 'undefined' && contactSettings.youtube) || 'https://www.youtube.com/@syndicatestore07';
      detailYoutube.style.display = (typeof contactSettings !== 'undefined' && contactSettings.showYoutube !== false) ? '' : 'none';
    }

    // Purchase buttons
    if (detailAddCart) {
      detailAddCart.dataset.productId = product._id;
      detailAddCart.onclick = async () => {
        if (typeof addToCart === 'function') {
          await addToCart(product._id);
        }
      };
    }
    if (detailBuyNow) {
      detailBuyNow.dataset.productId = product._id;
      detailBuyNow.onclick = async () => {
        if (typeof buyNow === 'function') {
          await buyNow(product._id);
        } else {
          showToast('Please sign in to buy now.', 'info');
        }
      };
    }
  }

  function showToast(msg, type) {
    const toast = document.getElementById('payment-toast');
    if (!toast) return;
    const icon = document.getElementById('payment-toast-icon');
    const title = document.getElementById('payment-toast-title');
    const msgEl = document.getElementById('payment-toast-msg');
    if (type === 'success') {
      icon.className = 'fa-solid fa-check-circle';
      icon.style.color = '#22d3ee';
    } else {
      icon.className = 'fa-solid fa-info-circle';
      icon.style.color = '#a855f7';
    }
    title.textContent = type === 'success' ? 'Success' : 'Info';
    msgEl.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
    document.getElementById('payment-toast-close').onclick = () => { toast.style.display = 'none'; };
  }

  loadProduct();
})();