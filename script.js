import { supabase } from './supabase/sbapi.js';
import { addCartItem } from './cart-data.js';

const searchForm = document.querySelector('.search');
const searchInput = document.querySelector('#site-search');
const heroSlides = document.querySelector('#hero-carousel-slides');
const categoryCardGrid = document.querySelector('#category-card-grid');
const featuredProductGrid = document.querySelector('#featured-product-grid');
const carouselArrows = document.querySelector('#carousel-arrows');
const carouselPrev = document.querySelector('#carousel-prev');
const carouselNext = document.querySelector('#carousel-next');
const STORAGE_BUCKET = 'storefront-images';
const STORE_CATEGORIES = [
  { label: 'Honey', key: 'honey' },
  { label: 'Dry Food', key: 'dry_food' },
  { label: 'Mix Food', key: 'mix_food' },
  { label: 'Nuts & Seeds', key: 'nuts_seeds' },
  { label: 'Pickle (আচার)', key: 'pickle' },
  { label: 'Dates (খেজুর)', key: 'dates' },
  { label: 'Masala (মসলা কষে)', key: 'masala' },
  { label: 'Tea', key: 'tea' },
];

const utilityBar = document.querySelector('.utility-bar');
function updateUtilityBarOffset() {
  if (utilityBar) {
    document.documentElement.style.setProperty('--utility-bar-height', `${utilityBar.offsetHeight}px`);
  }
}
updateUtilityBarOffset();
window.addEventListener('resize', updateUtilityBarOffset);
if (utilityBar && 'ResizeObserver' in window) {
  new ResizeObserver(updateUtilityBarOffset).observe(utilityBar);
}

function categoryImagePath(label) {
  const name = String(label).toLowerCase();
  if (name.includes('date') || name.includes('খেজুর')) return 'assets/categories/dates.png';
  if (name.includes('dry')) return 'assets/categories/dry-food.png';
  if (name.includes('masala') || name.includes('spice')) return 'assets/categories/masala.png';
  if (name.includes('honey')) return 'assets/categories/honey.png';
  if (name.includes('mix')) return 'assets/categories/mix-food.png';
  if (name.includes('nut') || name.includes('seed')) return 'assets/categories/nuts-seeds.png';
  if (name.includes('tea')) return 'assets/categories/tea.png';
  if (name.includes('pickle') || name.includes('আচার')) return 'assets/categories/pickle.png';
  return 'assets/categories/dry-food.png';
}

function renderCategoryCards(items = STORE_CATEGORIES) {
  if (!categoryCardGrid) return;
  categoryCardGrid.replaceChildren();
  items.forEach((item) => {
    const card = document.createElement('a');
    card.className = 'category-card';
    card.href = `shop/index.html?category=${encodeURIComponent(item.key)}`;
    const art = document.createElement('span');
    art.className = 'category-card-art';
    art.setAttribute('aria-hidden', 'true');
    const image = document.createElement('img');
    image.src = categoryImagePath(item.label);
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    art.append(image);
    const label = document.createElement('span');
    label.className = 'category-card-label';
    label.textContent = item.label;
    card.append(art, label);
    categoryCardGrid.append(card);
  });
  categoryCardGrid.setAttribute('aria-busy', 'false');
}

renderCategoryCards();

const formatMoney = (value) => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

function productQuantityTiers(product) {
  return Array.isArray(product.quantity_prices)
    ? product.quantity_prices.filter((tier) => tier && String(tier.quantity ?? '').trim() && Number(tier.regular_price ?? tier.price) > 0)
    : [];
}

function quantityRegularPrice(tier) {
  return Number(tier.regular_price ?? tier.price ?? 0);
}

function quantityCurrentPrice(tier) {
  const regular = quantityRegularPrice(tier);
  const special = Number(tier.special_price ?? 0);
  return special > 0 && special < regular ? special : regular;
}

function featuredDiscount(product) {
  const tiers = productQuantityTiers(product);
  const prices = tiers.length ? tiers : [{ regular_price: product.regular_price ?? product.price, special_price: product.special_price }];
  return Math.max(0, ...prices.map((tier) => {
    const regular = quantityRegularPrice(tier);
    const special = Number(tier.special_price ?? 0);
    return regular > 0 && special > 0 && special < regular ? Math.round((1 - special / regular) * 100) : 0;
  }));
}

function renderFeaturedProductPrice(product) {
  const price = document.createElement('div');
  price.className = 'featured-product-price';
  const tiers = productQuantityTiers(product);
  if (tiers.length) {
    const prices = [...new Set(tiers.map(quantityCurrentPrice))].sort((a, b) => a - b);
    price.textContent = prices.length > 1 ? `${formatMoney(prices[0])} – ${formatMoney(prices.at(-1))}` : formatMoney(prices[0]);
    return price;
  }
  const regular = Number(product.regular_price ?? product.price ?? 0);
  const special = Number(product.special_price ?? 0);
  if (special > 0 && special < regular) {
    const current = document.createElement('strong');
    current.textContent = formatMoney(special);
    const previous = document.createElement('del');
    previous.textContent = formatMoney(regular);
    price.append(current, previous);
  } else {
    price.textContent = formatMoney(regular);
  }
  return price;
}

function selectFeaturedProducts(products, limit = 8) {
  const newest = [...products].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const bestSelling = products.filter((product) => Number(product.sales_count) > 0)
    .sort((a, b) => Number(b.sales_count) - Number(a.sales_count));
  const mostVisited = products.filter((product) => Number(product.view_count) > 0)
    .sort((a, b) => Number(b.view_count) - Number(a.view_count));
  const onOffer = products.filter((product) => featuredDiscount(product) > 0)
    .sort((a, b) => featuredDiscount(b) - featuredDiscount(a));
  const groups = [
    ['New', newest],
    ['Bestseller', bestSelling],
    ['Popular', mostVisited],
    ['Offer', onOffer],
  ];
  const selected = [];
  const included = new Set();
  let added = true;
  while (selected.length < limit && added) {
    added = false;
    for (const [label, items] of groups) {
      const product = items.find((item) => !included.has(String(item.id)));
      if (!product) continue;
      included.add(String(product.id));
      selected.push({ product, label });
      added = true;
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

function renderFeaturedProducts(products) {
  if (!featuredProductGrid) return;
  featuredProductGrid.replaceChildren();
  featuredProductGrid.setAttribute('aria-busy', 'false');
  if (!products.length) {
    const empty = document.createElement('p');
    empty.className = 'featured-products-status';
    empty.textContent = 'Featured products will appear here.';
    featuredProductGrid.append(empty);
    return;
  }

  products.forEach(({ product, label }) => {
    const card = document.createElement('article');
    card.className = 'featured-product-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${product.name}. Open product details.`);
    const openDetails = () => { window.location.href = `shop/product.html?id=${encodeURIComponent(product.id)}`; };
    card.addEventListener('click', (event) => { if (!event.target.closest('button')) openDetails(); });
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openDetails();
    });

    const art = document.createElement('div');
    art.className = 'featured-product-art';
    const sourceBadge = document.createElement('span');
    sourceBadge.className = 'featured-source-badge';
    sourceBadge.textContent = label;
    art.append(sourceBadge);
    const images = Array.isArray(product.images) && product.images.length ? product.images : [product.image_url];
    const image = document.createElement('img');
    image.src = images.map((source) => storefrontImageUrl({ image_url: source })).find(Boolean) || 'data:,';
    image.alt = product.name || 'Featured product';
    image.loading = 'lazy';
    image.decoding = 'async';
    art.append(image);
    const discount = featuredDiscount(product);
    if (discount > 0) {
      const badge = document.createElement('span');
      badge.className = 'featured-discount';
      badge.textContent = `-${discount}%`;
      art.append(badge);
    }

    const body = document.createElement('div');
    body.className = 'featured-product-body';
    const title = document.createElement('h3');
    title.textContent = product.name || 'Product';
    const price = renderFeaturedProductPrice(product);
    const stock = document.createElement('span');
    stock.className = `featured-product-stock${product.in_stock ? '' : ' out-of-stock'}`;
    stock.textContent = product.in_stock ? 'In stock' : 'Out of stock';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'featured-product-action';
    const needsOption = productQuantityTiers(product).length > 1;
    action.disabled = !product.in_stock;
    action.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h8.5a2 2 0 0 0 1.9-1.4L21 9H6"/><circle cx="10" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/><path d="M13.5 5v7m-3.5-3.5h7"/></svg>';
    const actionLabel = document.createElement('span');
    actionLabel.textContent = needsOption ? 'Select Options' : 'Add to Cart';
    action.append(actionLabel);
    action.addEventListener('click', async () => {
      if (needsOption) {
        openDetails();
        return;
      }
      try {
        const currentPrice = Number(product.special_price ?? product.regular_price ?? product.price ?? 0);
        await addCartItem({ productId: product.id, name: product.name, image: image.src, unitPrice: currentPrice, tierQuantity: '', quantity: 1 });
        actionLabel.textContent = 'Added to Cart';
        window.setTimeout(() => { actionLabel.textContent = 'Add to Cart'; }, 1400);
      } catch {
        actionLabel.textContent = 'Could not add';
        window.setTimeout(() => { actionLabel.textContent = 'Add to Cart'; }, 1800);
      }
    });
    body.append(title, price, stock, action);
    card.append(art, body);
    featuredProductGrid.append(card);
  });
}

async function loadFeaturedProducts() {
  if (!featuredProductGrid) return;
  const { data, error } = await supabase.from('products')
    .select('id, image_url, images, name, price, regular_price, special_price, quantity_prices, is_on_sale, in_stock, sales_count, view_count, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    featuredProductGrid.replaceChildren();
    const message = document.createElement('p');
    message.className = 'featured-products-status';
    message.textContent = 'Featured products are temporarily unavailable. Check the product catalog setup.';
    featuredProductGrid.append(message);
    featuredProductGrid.setAttribute('aria-busy', 'false');
    return;
  }
  renderFeaturedProducts(selectFeaturedProducts(data ?? []));
}

loadFeaturedProducts();

let featuredImages = [];
let activeFeaturedIndex = 0;

function publicImageUrl(path) {
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function storefrontImageUrl(item) {
  const source = item.storage_path || item.image_url;
  if (source && /^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }
  return source ? publicImageUrl(source) : null;
}

function setPromoImage(target, item) {
  target.replaceChildren();
  if (!item) {
    const empty = document.createElement('p');
    empty.className = 'image-loading';
    empty.textContent = 'Image coming soon';
    target.append(empty);
    target.setAttribute('aria-busy', 'false');
    return;
  }
  const image = document.createElement('img');
  const src = storefrontImageUrl(item);
  if (!src) {
    const empty = document.createElement('p');
    empty.className = 'image-loading';
    empty.textContent = 'Image unavailable';
    target.append(empty);
    target.setAttribute('aria-busy', 'false');
    return;
  }
  image.src = src;
  image.alt = item.alt_text || '';
  image.loading = 'lazy';
  target.append(image);
  target.setAttribute('aria-busy', 'false');
}

function showFeaturedImage(index) {
  if (!featuredImages.length) return;
  activeFeaturedIndex = (index + featuredImages.length) % featuredImages.length;
  const slides = heroSlides.querySelectorAll('.hero-slide');
  slides.forEach((slide, slideIndex) => {
    slide.classList.toggle('is-active', slideIndex === activeFeaturedIndex);
    slide.setAttribute('aria-hidden', String(slideIndex !== activeFeaturedIndex));
  });
}

function renderFeaturedImages(items) {
  featuredImages = items.filter((item) => storefrontImageUrl(item));
  heroSlides.replaceChildren();
  if (!featuredImages.length) {
    const empty = document.createElement('p');
    empty.className = 'image-loading';
    empty.textContent = 'Featured images will appear here';
    heroSlides.append(empty);
    carouselArrows.hidden = true;
    return;
  }

  featuredImages.forEach((item, index) => {
    const slide = document.createElement('div');
    slide.className = 'hero-slide';
    const image = document.createElement('img');
    image.src = storefrontImageUrl(item);
    image.alt = item.alt_text || `Featured image ${index + 1}`;
    image.loading = index === 0 ? 'eager' : 'lazy';
    slide.append(image);
    heroSlides.append(slide);
  });

  carouselArrows.hidden = featuredImages.length < 2;
  showFeaturedImage(0);
  if (featuredImages.length > 1) {
    window.setInterval(() => showFeaturedImage(activeFeaturedIndex + 1), 10_000);
  }
}

async function loadStorefrontImages() {
  const { data, error } = await supabase
    .from('storefront_images')
    .select('id, slot, storage_path, alt_text, position')
    .order('position', { ascending: true });
  if (error) {
    renderFeaturedImages([]);
    heroSlides.firstElementChild.textContent = 'Featured images are temporarily unavailable';
    setPromoImage(document.querySelector('#promo-one'), null);
    setPromoImage(document.querySelector('#promo-two'), null);
    return;
  }

  const images = data ?? [];
  renderFeaturedImages(images.filter((item) => item.slot === 'hero'));
  setPromoImage(document.querySelector('#promo-one'), images.find((item) => item.slot === 'side_one'));
  setPromoImage(document.querySelector('#promo-two'), images.find((item) => item.slot === 'side_two'));
}

carouselPrev?.addEventListener('click', () => showFeaturedImage(activeFeaturedIndex - 1));
carouselNext?.addEventListener('click', () => showFeaturedImage(activeFeaturedIndex + 1));
loadStorefrontImages();

searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) {
    searchInput.focus();
    return;
  }

  // Product search can be connected to a products table once its schema exists.
  searchInput.value = '';
  searchInput.placeholder = `Searching for “${query}”`;
});

