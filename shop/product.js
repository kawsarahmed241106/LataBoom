import { supabase } from '../supabase/sbapi.js';
import { addCartItem } from '../cart-data.js';

const $ = (selector) => document.querySelector(selector);
const checkoutUrl = new URL('../checkout/index.html', import.meta.url).href;
const utilityBar = $('.utility-bar');
const status = $('#product-page-status');
const detail = $('#product-detail');
const mainImage = $('#product-main-image');
const thumbnails = $('#product-image-thumbnails');
const actionStatus = $('#product-action-status');
const descriptionPanel = $('#product-description-panel');
const descriptionContent = $('#product-description-content');
const descriptionToggle = $('#toggle-description');
const categoryLinks = document.querySelectorAll('.category-nav a');
let product;
let imageUrls = [];
let imageIndex = 0;
let selectedPrice = 0;
let selectedTier = null;
let quantity = 1;

const money = (value) => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

function updateHeaderOffset() {
  if (utilityBar) document.documentElement.style.setProperty('--utility-bar-height', `${utilityBar.offsetHeight}px`);
}
updateHeaderOffset();
window.addEventListener('resize', updateHeaderOffset);
if (utilityBar && 'ResizeObserver' in window) new ResizeObserver(updateHeaderOffset).observe(utilityBar);

$('.search')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = $('#site-search').value.trim();
  if (query) window.location.href = `../index.html?q=${encodeURIComponent(query)}#shop`;
});

function validImageUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function showError(message) {
  status.textContent = message;
  status.classList.add('is-error');
  detail.hidden = true;
}

function setImage(index) {
  if (!imageUrls.length) return;
  imageIndex = (index + imageUrls.length) % imageUrls.length;
  mainImage.src = imageUrls[imageIndex];
  mainImage.alt = product.name;
  thumbnails.querySelectorAll('.product-image-thumbnail').forEach((button, current) => {
    button.classList.toggle('is-active', current === imageIndex);
    button.setAttribute('aria-pressed', current === imageIndex ? 'true' : 'false');
  });
}

function renderGallery() {
  const candidates = Array.isArray(product.images) && product.images.length ? product.images : [product.image_url];
  imageUrls = [...new Set(candidates.map(validImageUrl).filter(Boolean))];
  if (!imageUrls.length) {
    showError('This product does not have a valid image yet.');
    return false;
  }
  thumbnails.replaceChildren();
  imageUrls.forEach((src, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `product-image-thumbnail${index === 0 ? ' is-active' : ''}`;
    button.setAttribute('aria-label', `Show product image ${index + 1}`);
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    image.loading = 'lazy';
    button.append(image);
    button.addEventListener('click', () => setImage(index));
    thumbnails.append(button);
  });
  $('.gallery-arrow.prev').hidden = imageUrls.length < 2;
  $('.gallery-arrow.next').hidden = imageUrls.length < 2;
  setImage(0);
  return true;
}

function renderTiers() {
  const tiers = Array.isArray(product.quantity_prices) ? product.quantity_prices : [];
  const validTiers = tiers.filter((tier) => tier && String(tier.quantity ?? '').trim() && tierRegularPrice(tier) > 0);
  const section = $('#quantity-options-section');
  const container = $('#product-quantity-options');
  container.replaceChildren();
  section.hidden = validTiers.length < 2;
  if (!validTiers.length) return;
  const initialIndex = Math.max(0, validTiers.findIndex((tier) => tier.in_stock !== false));
  if (validTiers.length > 1) validTiers.forEach((tier, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `product-quantity-option${index === initialIndex ? ' is-selected' : ''}`;
    button.disabled = tier.in_stock === false;
    button.setAttribute('aria-pressed', index === initialIndex ? 'true' : 'false');
    const weight = document.createElement('span');
    weight.textContent = String(tier.quantity);
    const price = document.createElement('span');
    price.textContent = money(tierCurrentPrice(tier));
    button.append(weight, price);
    button.addEventListener('click', () => {
      selectedTier = tier;
      selectedPrice = tierCurrentPrice(tier);
      container.querySelectorAll('.product-quantity-option').forEach((item) => {
        item.classList.remove('is-selected');
        item.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('is-selected');
      button.setAttribute('aria-pressed', 'true');
      updateDisplayedPrice();
      updateProductAvailability();
      updateSubtotal();
    });
    container.append(button);
  });
  selectedTier = validTiers[initialIndex];
  selectedPrice = tierCurrentPrice(selectedTier);
}

function tierRegularPrice(tier) {
  return Number(tier.regular_price ?? tier.price ?? 0);
}

function tierSpecialPrice(tier) {
  const value = Number(tier.special_price ?? 0);
  return value > 0 && value < tierRegularPrice(tier) ? value : null;
}

function tierCurrentPrice(tier) {
  return tierSpecialPrice(tier) ?? tierRegularPrice(tier);
}

function updateDisplayedPrice() {
  $('#product-special-price').textContent = money(selectedPrice);
  const regular = selectedTier ? tierRegularPrice(selectedTier) : Number(product.regular_price ?? product.price ?? 0);
  const special = selectedTier ? tierSpecialPrice(selectedTier) : Number(product.special_price ?? 0);
  const hasDiscount = special && special < regular;
  $('#product-regular-price').textContent = money(regular);
  $('#product-regular-price').hidden = !hasDiscount;
  const discount = hasDiscount ? Math.round((1 - special / regular) * 100) : 0;
  $('#product-discount').textContent = discount ? `${discount}% OFF` : '';
  $('#product-discount').hidden = !discount;
}

function updateProductAvailability() {
  const inStock = selectedTier ? selectedTier.in_stock !== false : Boolean(product?.in_stock);
  const stock = $('#product-stock-label');
  stock.textContent = inStock ? 'In stock' : 'Out of stock';
  stock.classList.toggle('out-of-stock', !inStock);
  $('#add-to-cart').disabled = !inStock;
  $('#buy-now').disabled = !inStock;
}

function updateSubtotal() {
  $('#product-quantity').textContent = String(quantity);
  $('#product-subtotal').textContent = money(selectedPrice * quantity);
}

function renderProduct() {
  $('#product-title').textContent = product.name || 'Product';
  $('#product-short-description').textContent = product.short_description || '';
  $('#product-short-description').hidden = !product.short_description;
  $('#product-description-title').textContent = product.name || 'Product details';
  const description = $('#product-description');
  description.replaceChildren();
  const descriptionText = String(product.description || 'More information about this product will be added soon.').trim();
  const paragraphs = descriptionText.split(/\n\s*\n/).filter(Boolean);
  for (const paragraphText of (paragraphs.length ? paragraphs : [descriptionText])) {
    const paragraph = document.createElement('p');
    paragraph.textContent = paragraphText;
    description.append(paragraph);
  }
  descriptionPanel.hidden = false;
  const regular = Number(product.regular_price ?? product.price ?? 0);
  const special = Number(product.special_price ?? 0);
  const current = special > 0 ? special : regular;
  $('#product-special-price').textContent = money(current);
  $('#product-regular-price').textContent = money(regular);
  $('#product-regular-price').hidden = !(special > 0 && special < regular);
  const discount = special > 0 && special < regular ? Math.round((1 - special / regular) * 100) : 0;
  $('#product-discount').textContent = discount ? `${discount}% OFF` : '';
  $('#product-discount').hidden = !discount;

  renderTiers();
  if (!selectedTier) selectedPrice = current;
  updateDisplayedPrice();
  updateProductAvailability();
  quantity = 1;
  updateSubtotal();
  if (!renderGallery()) return;
  document.title = `${product.name || 'Product'} | LataBoom`;
  status.hidden = true;
  detail.hidden = false;
  requestAnimationFrame(() => {
    const collapsedHeight = 300;
    descriptionContent.classList.remove('is-expanded');
    descriptionContent.style.maxHeight = `${collapsedHeight}px`;
    const shouldCollapse = descriptionContent.scrollHeight > collapsedHeight + 8;
    descriptionToggle.hidden = !shouldCollapse;
    descriptionToggle.setAttribute('aria-expanded', 'false');
    descriptionToggle.innerHTML = 'Show more <span aria-hidden="true">⌄</span>';
  });
}

async function loadProduct() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return showError('Choose a product from the shop to see its details.');
  const { data, error } = await supabase.from('products')
    .select('id, image_url, images, name, short_description, description, price, regular_price, special_price, quantity_prices, is_on_sale, in_stock')
    .eq('id', id)
    .maybeSingle();
  if (error) return showError('Could not load this product. Please return to the shop and try again.');
  if (!data) return showError('This product was not found. It may have been removed.');
  product = data;
  recordProductView(product.id);
  const selectedCategory = new URLSearchParams(window.location.search).get('category') || product.category;
  categoryLinks.forEach((link) => {
    if (new URL(link.href, window.location.href).searchParams.get('category') !== selectedCategory) return;
    link.classList.add('is-active');
    link.setAttribute('aria-current', 'page');
  });
  renderProduct();
}

function recordProductView(productId) {
  const key = `lataboom-product-view:${productId}`;
  const now = Date.now();
  try {
    const lastView = Number(window.localStorage.getItem(key) || 0);
    if (now - lastView < 30 * 60 * 1000) return;
    window.localStorage.setItem(key, String(now));
  } catch {
    // Count the visit even when browser storage is unavailable.
  }
  supabase.rpc('record_product_view', { target_product_id: productId })
    .then(({ error }) => { if (error) console.warn('Could not record product view.', error.message); })
    .catch((error) => console.warn('Could not record product view.', error));
}

async function addToCart({ checkout = false } = {}) {
  if (!product?.in_stock || (selectedTier && selectedTier.in_stock === false)) return;
  const tierQuantity = selectedTier ? String(selectedTier.quantity) : '';
  try {
    await addCartItem({ productId: product.id, name: product.name, image: imageUrls[0], unitPrice: selectedPrice, tierQuantity, quantity }, quantity);
    if (checkout) {
      window.location.assign(checkoutUrl);
      return;
    }
    actionStatus.textContent = 'Added to your cart.';
  } catch {
    actionStatus.textContent = 'Could not save your cart in this browser.';
  }
}

$('#product-image-prev').addEventListener('click', () => setImage(imageIndex - 1));
$('#product-image-next').addEventListener('click', () => setImage(imageIndex + 1));
$('#quantity-minus').addEventListener('click', () => { quantity = Math.max(1, quantity - 1); updateSubtotal(); });
$('#quantity-plus').addEventListener('click', () => { quantity += 1; updateSubtotal(); });
$('#add-to-cart').addEventListener('click', () => addToCart());
$('#buy-now').addEventListener('click', () => addToCart({ checkout: true }));
descriptionToggle.addEventListener('click', () => {
  const expanded = descriptionToggle.getAttribute('aria-expanded') === 'true';
  descriptionToggle.setAttribute('aria-expanded', String(!expanded));
  descriptionContent.classList.toggle('is-expanded', !expanded);
  descriptionContent.style.maxHeight = expanded ? '300px' : `${descriptionContent.scrollHeight}px`;
  descriptionToggle.innerHTML = expanded
    ? 'Show more <span aria-hidden="true">⌄</span>'
    : 'Show less <span aria-hidden="true">⌃</span>';
});

const lightbox = $('#product-image-lightbox');
$('#product-image-zoom').addEventListener('click', () => {
  $('#lightbox-image').src = imageUrls[imageIndex] || '';
  $('#lightbox-image').alt = product?.name || 'Product image';
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
});
function closeLightbox() { lightbox.hidden = true; document.body.style.overflow = ''; }
$('#close-product-lightbox').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (event) => { if (event.target === lightbox) closeLightbox(); });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !lightbox.hidden) closeLightbox(); });

loadProduct();
