import { loadCartItems, changeCartItemQuantity, removeCartItem } from './cart-data.js';

const shopUrl = new URL('./shop/index.html', import.meta.url).href;
const checkoutUrl = new URL('./checkout/index.html', import.meta.url).href;

const backdrop = document.createElement('div');
backdrop.className = 'cart-backdrop';
backdrop.hidden = true;
backdrop.setAttribute('aria-hidden', 'true');

const drawer = document.createElement('aside');
drawer.className = 'cart-drawer';
drawer.id = 'shopping-cart-drawer';
drawer.hidden = true;
drawer.setAttribute('role', 'dialog');
drawer.setAttribute('aria-modal', 'true');
drawer.setAttribute('aria-labelledby', 'cart-drawer-title');

const header = document.createElement('header');
header.className = 'cart-drawer-header';
header.innerHTML = '<h2 class="cart-drawer-title" id="cart-drawer-title"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>Shopping Cart</h2><button class="cart-close" type="button" aria-label="Close shopping cart">×</button>';
const content = document.createElement('div');
content.className = 'cart-content';
drawer.append(header, content);
document.body.append(backdrop, drawer);

const closeButton = header.querySelector('.cart-close');
let previouslyFocused = null;
const cartLinks = [...document.querySelectorAll('.utility-action[href*="#cart"]')];

function updateCartBadges(items) {
  const count = items.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);
  for (const link of cartLinks) {
    const icon = link.querySelector('.action-icon');
    if (!icon) continue;
    let badge = icon.querySelector('.cart-count-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'cart-count-badge';
      badge.setAttribute('aria-hidden', 'true');
      icon.append(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
    link.setAttribute('aria-label', count ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart, empty');
  }
}

async function refreshCartBadges(items) {
  updateCartBadges(items || await loadCartItems());
}

refreshCartBadges();

function formatMoney(value) {
  return `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
}

function makeReturnButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cart-return';
  button.textContent = 'RETURN TO SHOP';
  button.addEventListener('click', () => { window.location.href = shopUrl; });
  return button;
}

async function renderCart() {
  content.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'cart-empty cart-loading';
  loading.textContent = 'Loading cart…';
  content.append(loading);
  const items = await loadCartItems();
  updateCartBadges(items);
  content.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('section');
    empty.className = 'cart-empty';
    empty.innerHTML = '<svg class="cart-empty-icon" viewBox="0 0 80 80" aria-hidden="true"><path d="M15 23h50l-3 50H18l-3-50Z"/><path d="m15 23 10-13h30l10 13M27 37c0 7 5 12 13 12s13-5 13-12"/></svg>';
    const message = document.createElement('p');
    message.textContent = 'No products in the cart.';
    empty.append(message, makeReturnButton());
    content.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'cart-items';
  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'cart-item';
    const image = document.createElement('img');
    image.className = 'cart-item-image';
    image.src = typeof item.image === 'string' ? item.image : 'data:,';
    image.alt = '';
    const details = document.createElement('div');
    const name = document.createElement('h3');
    name.className = 'cart-item-name';
    name.textContent = item.name || 'Product';
    details.append(name);
    if (item.tierQuantity) {
      const option = document.createElement('p');
      option.className = 'cart-item-option';
      option.textContent = String(item.tierQuantity);
      details.append(option);
    }
    const price = document.createElement('strong');
    price.className = 'cart-item-price';
    price.textContent = formatMoney(item.unitPrice);
    const controls = document.createElement('div');
    controls.className = 'cart-item-quantity';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `Remove one ${item.name || 'product'}`);
    const amount = document.createElement('output');
    amount.textContent = String(Math.max(1, Number(item.quantity) || 1));
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `Add one ${item.name || 'product'}`);
    minus.addEventListener('click', async () => { await changeCartItemQuantity(item, -1); await renderCart(); });
    plus.addEventListener('click', async () => { await changeCartItemQuantity(item, 1); await renderCart(); });
    controls.append(minus, amount, plus);
    details.append(price, controls);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'cart-item-remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${item.name || 'product'} from cart`);
    remove.addEventListener('click', async () => { await removeCartItem(item); await renderCart(); });
    row.append(image, details, remove);
    list.append(row);
  });

  const total = items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Math.max(1, Number(item.quantity) || 1), 0);
  const summary = document.createElement('footer');
  summary.className = 'cart-summary';
  const subtotal = document.createElement('div');
  subtotal.className = 'cart-subtotal';
  subtotal.innerHTML = '<span>Subtotal</span>';
  const amount = document.createElement('strong');
  amount.textContent = formatMoney(total);
  subtotal.append(amount);
  const note = document.createElement('p');
  note.className = 'cart-checkout-note';
  note.textContent = 'Enter your delivery details and email to place your order.';
  const checkoutLink = document.createElement('a');
  checkoutLink.className = 'cart-checkout-button';
  checkoutLink.href = checkoutUrl;
  checkoutLink.textContent = 'PROCEED TO CHECKOUT';
  summary.append(subtotal, note, checkoutLink, makeReturnButton());
  content.append(list, summary);
}

function openCart(event) {
  event?.preventDefault();
  previouslyFocused = document.activeElement;
  renderCart();
  backdrop.hidden = false;
  drawer.hidden = false;
  document.body.classList.add('cart-is-open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    drawer.classList.add('is-open');
    closeButton.focus();
  });
}

function closeCart() {
  drawer.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  document.body.classList.remove('cart-is-open');
  document.body.style.overflow = '';
  window.setTimeout(() => {
    if (drawer.classList.contains('is-open')) return;
    drawer.hidden = true;
    backdrop.hidden = true;
    previouslyFocused?.focus?.();
  }, 260);
}

cartLinks.forEach((link) => link.addEventListener('click', openCart));
closeButton.addEventListener('click', closeCart);
backdrop.addEventListener('click', closeCart);
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !drawer.hidden) closeCart(); });
window.addEventListener('brand:cart-updated', (event) => {
  if (Array.isArray(event.detail)) updateCartBadges(event.detail);
});
window.addEventListener('storage', (event) => {
  if (event.key !== 'brand_cart_items') return;
  refreshCartBadges();
  if (!drawer.hidden) renderCart();
});
