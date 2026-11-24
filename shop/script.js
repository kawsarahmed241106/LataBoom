import { supabase } from '../supabase/sbapi.js';
import { addCartItem } from '../cart-data.js';

const utilityBar = document.querySelector('.utility-bar');
const categoryNav = document.querySelector('.category-nav');
const searchForm = document.querySelector('.search');
const searchInput = document.querySelector('#site-search');
const filterForm = document.querySelector('#shop-filter-form');
const minRange = document.querySelector('#price-min-range');
const maxRange = document.querySelector('#price-max-range');
const minPrice = document.querySelector('#price-min');
const maxPrice = document.querySelector('#price-max');
const priceSlider = document.querySelector('#price-slider');
const productGrid = document.querySelector('#product-grid');
let PRICE_MIN = 320;
let PRICE_MAX = 7800;
let products = [];
const selectedCategory = new URLSearchParams(window.location.search).get('category');
document.querySelectorAll('.category-nav a').forEach((link) => {
  const category = new URL(link.href, window.location.href).searchParams.get('category');
  if (selectedCategory && category === selectedCategory) {
    link.classList.add('is-active');
    link.setAttribute('aria-current', 'page');
  }
});

function updateUtilityBarOffset() {
  if (utilityBar) {
    document.documentElement.style.setProperty('--utility-bar-height', `${utilityBar.offsetHeight}px`);
  }
  if (categoryNav) {
    document.documentElement.style.setProperty('--category-nav-height', `${categoryNav.offsetHeight}px`);
  }
}

updateUtilityBarOffset();
window.addEventListener('resize', updateUtilityBarOffset);
if (utilityBar && 'ResizeObserver' in window) {
  new ResizeObserver(updateUtilityBarOffset).observe(utilityBar);
}

async function loadProducts() {
  productGrid.setAttribute('aria-busy', 'true');
  const { data, error } = await supabase
    .from('products')
    .select('id, image_url, images, name, category, short_description, description, price, regular_price, special_price, quantity_prices, is_on_sale, in_stock')
    .order('created_at', { ascending: false });
  productGrid.setAttribute('aria-busy', 'false');
  if (error) {
    showProductStatus('Product catalog is not set up yet. Run supabase/products.sql as postgres.');
    return;
  }
  products = data ?? [];
  if (products.length) {
    const values = products.map(effectiveProductPrice).filter(Number.isFinite);
    PRICE_MIN = Math.floor(Math.min(...values) / 10) * 10;
    PRICE_MAX = Math.ceil(Math.max(...values) / 10) * 10;
    if (PRICE_MAX <= PRICE_MIN) PRICE_MAX = PRICE_MIN + 10;
    for (const input of [minRange, maxRange, minPrice, maxPrice]) {
      input.min = String(PRICE_MIN);
      input.max = String(PRICE_MAX);
    }
    minRange.value = minPrice.value = String(PRICE_MIN);
    maxRange.value = maxPrice.value = String(PRICE_MAX);
    updatePriceSlider();
  }
  renderProducts();
}

function showProductStatus(message) {
  productGrid.replaceChildren();
  const status = document.createElement('p');
  status.className = 'shop-empty-state';
  status.textContent = message;
  productGrid.append(status);
}

function renderProducts() {
  productGrid.replaceChildren();
  const minimum = Number(minPrice.value);
  const maximum = Number(maxPrice.value);
  const onSaleOnly = filterForm.elements.on_sale.checked;
  const inStockOnly = filterForm.elements.in_stock.checked;
  const visibleProducts = products.filter((product) =>
    (!selectedCategory || product.category === selectedCategory)
    && effectiveProductPrice(product) >= minimum
    && effectiveProductPrice(product) <= maximum
    && (!onSaleOnly || product.is_on_sale)
    && (!inStockOnly || product.in_stock));

  if (!visibleProducts.length) {
    showProductStatus(products.length ? 'No products match these filters.' : 'No products have been added yet.');
    return;
  }

  for (const product of visibleProducts) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${product.name}. Open product details or add it to your cart.`);
    const imageWrap = document.createElement('div');
    imageWrap.className = 'product-image-wrap';
    const image = document.createElement('img');
    const images = product.images?.length ? product.images : [product.image_url];
    image.src = safeProductImageUrl(images[0]) || 'data:,';
    image.alt = product.name;
    image.loading = 'lazy';
    image.decoding = 'async';
    imageWrap.append(image);
    if (product.is_on_sale) {
      const saleBadge = document.createElement('span');
      saleBadge.className = 'product-sale-badge';
      saleBadge.textContent = 'On sale';
      imageWrap.append(saleBadge);
    }
    const body = document.createElement('div');
    body.className = 'product-card-body';
    const name = document.createElement('h3');
    name.textContent = product.name;
    const footer = document.createElement('div');
    footer.className = 'product-card-footer';
    const price = document.createElement('span');
    price.className = 'product-price';
    const regularPrice = Number(product.regular_price ?? product.price);
    if (product.special_price) {
      const specialPrice = document.createElement('strong');
      specialPrice.textContent = `৳${Number(product.special_price).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
      const previousPrice = document.createElement('del');
      previousPrice.textContent = `৳${regularPrice.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
      price.append(specialPrice, previousPrice);
    } else {
      price.textContent = `৳${regularPrice.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
    }
    const stock = document.createElement('span');
    stock.className = `product-stock${product.in_stock ? '' : ' out-of-stock'}`;
    stock.textContent = product.in_stock ? 'In stock' : 'Out of stock';
    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'product-details-button';
    const requiresOption = hasQuantityOptions(product);
    detailsButton.textContent = requiresOption ? 'Select option' : 'Add to Cart';
    detailsButton.disabled = !product.in_stock;
    card.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      window.location.href = `product.html?id=${encodeURIComponent(product.id)}`;
    });
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      window.location.href = `product.html?id=${encodeURIComponent(product.id)}`;
    });
    detailsButton.addEventListener('click', () => {
      if (requiresOption) {
        window.location.href = `product.html?id=${encodeURIComponent(product.id)}`;
        return;
      }
      addProductToCart(product, detailsButton);
    });
    footer.append(price, stock);
    body.append(name, footer);
    body.append(detailsButton);
    card.append(imageWrap, body);
    productGrid.append(card);
  }
}

function safeProductImageUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function effectiveProductPrice(product) {
  return Number(product.special_price ?? product.regular_price ?? product.price);
}

function hasQuantityOptions(product) {
  return Array.isArray(product.quantity_prices)
    && product.quantity_prices.filter((tier) => tier && String(tier.quantity ?? '').trim() && Number(tier.regular_price ?? tier.price) > 0).length > 1;
}

async function addProductToCart(product, button) {
  if (!product.in_stock) return;
  try {
    const images = product.images?.length ? product.images : [product.image_url];
    await addCartItem({
      productId: product.id,
      name: product.name,
      image: safeProductImageUrl(images[0]),
      unitPrice: effectiveProductPrice(product),
      tierQuantity: '',
      quantity: 1,
    });
    button.textContent = 'Added to Cart';
    window.setTimeout(() => { button.textContent = 'Add to Cart'; }, 1400);
  } catch {
    button.textContent = 'Could not add';
    window.setTimeout(() => { button.textContent = 'Add to Cart'; }, 1800);
  }
}

loadProducts();

function clampPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return PRICE_MIN;
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(number / 10) * 10));
}

function updatePriceSlider(source) {
  let lower = clampPrice(minRange.value);
  let upper = clampPrice(maxRange.value);
  if (lower > upper - 10) {
    if (source === minRange) lower = upper - 10;
    else upper = lower + 10;
  }
  minRange.value = String(lower);
  maxRange.value = String(upper);
  minPrice.value = String(lower);
  maxPrice.value = String(upper);
  const span = PRICE_MAX - PRICE_MIN;
  priceSlider.style.setProperty('--range-start', `${((lower - PRICE_MIN) / span) * 100}%`);
  priceSlider.style.setProperty('--range-end', `${((upper - PRICE_MIN) / span) * 100}%`);
}

minRange.addEventListener('input', () => updatePriceSlider(minRange));
maxRange.addEventListener('input', () => updatePriceSlider(maxRange));
minPrice.addEventListener('change', () => {
  minRange.value = String(clampPrice(minPrice.value));
  updatePriceSlider(minRange);
});
maxPrice.addEventListener('change', () => {
  maxRange.value = String(clampPrice(maxPrice.value));
  updatePriceSlider(maxRange);
});

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  updatePriceSlider();
  renderProducts();
});

searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return searchInput.focus();
  window.location.href = `../index.html?q=${encodeURIComponent(query)}#shop`;
});

