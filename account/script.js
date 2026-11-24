import { customerSupabase as supabase } from '../supabase/customer-client.js';
import { loadCartItems } from '../cart-data.js';

const utilityBar = document.querySelector('.utility-bar');
const loginForm = document.querySelector('#login-panel');
const registerForm = document.querySelector('#register-panel');
const loginTab = document.querySelector('#login-tab');
const registerTab = document.querySelector('#register-tab');
const signedInPanel = document.querySelector('#signed-in-panel');

function updateHeaderOffset() {
  if (utilityBar) document.documentElement.style.setProperty('--utility-bar-height', `${utilityBar.offsetHeight}px`);
}
updateHeaderOffset();
window.addEventListener('resize', updateHeaderOffset);
if (utilityBar && 'ResizeObserver' in window) new ResizeObserver(updateHeaderOffset).observe(utilityBar);


document.querySelector('.search')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = document.querySelector('#site-search').value.trim();
  if (query) window.location.href = `../index.html?q=${encodeURIComponent(query)}#shop`;
});

function setMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle('is-success', success);
}

function canUseCustomerAccount(user) {
  return user?.app_metadata?.role !== 'admin';
}

function showMode(mode) {
  const loginActive = mode === 'login';
  loginForm.hidden = !loginActive;
  registerForm.hidden = loginActive;
  loginTab.classList.toggle('is-active', loginActive);
  registerTab.classList.toggle('is-active', !loginActive);
  loginTab.setAttribute('aria-selected', String(loginActive));
  registerTab.setAttribute('aria-selected', String(!loginActive));
}

loginTab.addEventListener('click', () => showMode('login'));
registerTab.addEventListener('click', () => showMode('register'));

function renderSession(user) {
  document.querySelector('.account-card').classList.add('is-signed-in');
  document.querySelector('.account-tabs').hidden = true;
  loginForm.hidden = true;
  registerForm.hidden = true;
  loginTab.hidden = true;
  registerTab.hidden = true;
  signedInPanel.hidden = false;
  document.querySelector('#signed-in-email').textContent = user.email || '';
  loadAccountData(user);
}

function renderSignedOut() {
  document.querySelector('.account-card').classList.remove('is-signed-in');
  document.querySelector('.account-tabs').hidden = false;
  loginTab.hidden = false;
  registerTab.hidden = false;
  signedInPanel.hidden = true;
  showMode('login');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('.account-submit');
  const message = document.querySelector('#login-message');
  setMessage(message, '');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginForm.elements.email.value.trim(),
      password: loginForm.elements.password.value,
    });
    if (error) throw error;
    if (!canUseCustomerAccount(data.user)) {
      await supabase.auth.signOut();
      renderSignedOut();
      setMessage(message, 'Unable to sign in to a customer account. Check your email and password.');
    } else if (data.user) renderSession(data.user);
  } catch (error) {
    setMessage(message, error.message || 'Could not sign in. Check your email and password.');
  } finally {
    button.disabled = false;
    button.textContent = 'Login';
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = registerForm.querySelector('.account-submit');
  const message = document.querySelector('#register-message');
  setMessage(message, '');
  button.disabled = true;
  button.textContent = 'Creating account…';
  try {
    const { data, error } = await supabase.auth.signUp({
      email: registerForm.elements.email.value.trim(),
      password: registerForm.elements.password.value,
      options: {
        data: {
          full_name: registerForm.elements.full_name.value.trim(),
          phone: registerForm.elements.phone.value.trim(),
        },
        emailRedirectTo: window.location.href,
      },
    });
    if (error) throw error;
    if (data.session && data.user) renderSession(data.user);
    else setMessage(message, 'Account created. Check your email to confirm your address, then sign in.', true);
  } catch (error) {
    setMessage(message, error.message || 'Could not create your account. Please try again.');
  } finally {
    button.disabled = false;
    button.textContent = 'Create account';
  }
});

document.querySelector('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('.profile-save');
  const message = document.querySelector('#profile-message');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !canUseCustomerAccount(user)) return;
  const values = new FormData(form);
  setMessage(message, 'Saving your profile…', true);
  button.disabled = true;
  try {
    const { error } = await supabase.from('customer_profiles').upsert({
      user_id: user.id,
      full_name: String(values.get('full_name') || '').trim(),
      phone: String(values.get('phone') || '').trim(),
      delivery_address: String(values.get('delivery_address') || '').trim(),
      delivery_area: String(values.get('delivery_area') || ''),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    setMessage(message, 'Your profile has been saved.', true);
    const firstName = String(values.get('full_name') || '').trim().split(/\s+/)[0] || 'there';
    document.querySelector('#profile-avatar').textContent = firstName[0].toUpperCase();
  } catch (error) {
    setMessage(message, error.message?.includes('delivery_address') || error.message?.includes('delivery_area')
      ? 'Apply the latest supabase/customer-accounts.sql in the Supabase SQL Editor, then save again.'
      : error.message || 'Could not save your profile. Please try again.');
  } finally {
    button.disabled = false;
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session?.user && !canUseCustomerAccount(session.user)) {
  renderSignedOut();
  await supabase.auth.signOut();
  setMessage(document.querySelector('#login-message'), 'Unable to sign in to a customer account. Check your email and password.');
} else if (session?.user) renderSession(session.user);
else renderSignedOut();

const money = (amount) => `৳${Number(amount || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

function makeMessage(text) {
  const message = document.createElement('p');
  message.textContent = text;
  return message;
}

function readableStatus(status = 'pending') {
  return String(status).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(date) {
  if (!date) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-BD', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));
}

async function loadAccountData(user) {
  const accountStatus = document.querySelector('#account-data-status');
  accountStatus.textContent = '';
  const name = user.user_metadata?.full_name || '';
  document.querySelector('#profile-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'L';
  document.querySelector('#profile-email-input').value = user.email || '';
  document.querySelector('#profile-name-input').value = name;
  document.querySelector('#profile-phone-input').value = user.user_metadata?.phone || '';
  const ordersContainer = document.querySelector('#account-orders');
  const cartContainer = document.querySelector('#account-cart');

  const { data: profile, error: profileError } = await supabase.from('customer_profiles')
    .select('full_name, phone, delivery_address, delivery_area').eq('user_id', user.id).maybeSingle();
  if (profile) {
    document.querySelector('#profile-name-input').value = profile.full_name || name;
    document.querySelector('#profile-phone-input').value = profile.phone || user.user_metadata?.phone || '';
    document.querySelector('#profile-address-input').value = profile.delivery_address || '';
    document.querySelector('#profile-area-input').value = profile.delivery_area || '';
  }
  if (profileError) accountStatus.textContent = 'Apply the latest supabase/customer-accounts.sql to enable saved delivery details.';

  const { data: orders, error: orderError } = await supabase.from('orders')
    .select('id, order_number, status, total_amount, created_at, estimated_delivery, order_items(item_name, quantity, unit_price, tier_quantity)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  ordersContainer.replaceChildren();
  if (orderError) {
    ordersContainer.append(makeMessage('Order history will appear once the order database setup is applied.'));
  } else if (!orders?.length) {
    ordersContainer.append(makeMessage('No orders yet. Your completed purchases will appear here.'));
  } else {
    document.querySelector('#order-count').textContent = `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`;
    for (const order of orders) {
      const card = document.createElement('article');
      card.className = 'order-card';
      const top = document.createElement('div');
      top.className = 'order-card-top';
      const orderMeta = document.createElement('div');
      const orderNumber = document.createElement('strong');
      orderNumber.textContent = `Order #${order.order_number}`;
      const date = document.createElement('span');
      date.textContent = formatDate(order.created_at);
      orderMeta.append(orderNumber, date);
      const status = document.createElement('span');
      status.className = `order-status status-${String(order.status || 'pending').toLowerCase()}`;
      status.textContent = readableStatus(order.status);
      top.append(orderMeta, status);
      const itemList = document.createElement('ul');
      itemList.className = 'order-item-list';
      for (const item of order.order_items || []) {
        const row = document.createElement('li');
        const description = document.createElement('span');
        description.textContent = `${item.item_name}${item.tier_quantity ? ` · ${item.tier_quantity}` : ''} × ${item.quantity}`;
        const total = document.createElement('strong');
        total.textContent = money(Number(item.unit_price) * Number(item.quantity));
        row.append(description, total);
        itemList.append(row);
      }
      const totalLine = document.createElement('div');
      totalLine.className = 'order-total-line';
      const totalLabel = document.createElement('span');
      totalLabel.textContent = 'Order total';
      const totalValue = document.createElement('strong');
      totalValue.textContent = money(order.total_amount);
      totalLine.append(totalLabel, totalValue);
      card.append(top, itemList, totalLine);
      ordersContainer.append(card);
    }
  }

  const cartItems = await loadCartItems();
  cartContainer.replaceChildren();
  document.querySelector('#cart-item-count').textContent = `${cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} items`;
  document.querySelector('#order-count').textContent = `${orders?.length || 0} ${(orders?.length || 0) === 1 ? 'order' : 'orders'}`;
  if (!cartItems.length) {
    cartContainer.append(makeMessage('Your cart is empty. Browse the shop to find something you like.'));
  } else {
    let cartTotal = 0;
    for (const item of cartItems) {
      const row = document.createElement('article');
      row.className = 'cart-item-row';
      const image = document.createElement('img');
      image.src = item.image || '../assets/lataboom_logo_transparent.png';
      image.alt = '';
      image.loading = 'lazy';
      const copy = document.createElement('div');
      copy.className = 'cart-item-copy';
      const title = document.createElement('strong');
      title.textContent = item.name || 'Product';
      const option = document.createElement('span');
      option.textContent = [item.tierQuantity, `Qty ${item.quantity}`].filter(Boolean).join(' · ');
      copy.append(title, option);
      const lineTotal = Number(item.unitPrice) * Number(item.quantity);
      cartTotal += lineTotal;
      const price = document.createElement('strong');
      price.className = 'cart-line-total';
      price.textContent = money(lineTotal);
      row.append(image, copy, price);
      cartContainer.append(row);
    }
    document.querySelector('#account-cart-total').textContent = money(cartTotal);
  }
  if (!cartItems.length) document.querySelector('#account-cart-total').textContent = money(0);
}
