import { clearCartItems, loadCartItems } from '../cart-data.js';
import { customerSupabase } from '../supabase/customer-client.js';

const checkoutForm = document.querySelector('#checkout-form');
const checkoutItems = document.querySelector('#checkout-items');
const subtotalOutput = document.querySelector('#checkout-subtotal');
const totalOutput = document.querySelector('#checkout-total');
const checkoutStatus = document.querySelector('#checkout-status');
const placeOrderButton = document.querySelector('.place-order-button');
const utilityBar = document.querySelector('.utility-bar');
const deliveryOutput = document.querySelector('#checkout-delivery');
const deliveryOptions = [...document.querySelectorAll('[name="delivery_area"]')];
let cartSubtotal = 0;
let hasCartItems = false;
let orderPlaced = false;

function updateUtilityBarOffset() {
  if (utilityBar) document.documentElement.style.setProperty('--utility-bar-height', `${utilityBar.offsetHeight}px`);
}

updateUtilityBarOffset();
window.addEventListener('resize', updateUtilityBarOffset);
if (utilityBar && 'ResizeObserver' in window) new ResizeObserver(updateUtilityBarOffset).observe(utilityBar);

const money = (amount) => `৳${Number(amount || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

async function prefillCustomerDetails() {
  try {
    const { data: { user } } = await customerSupabase.auth.getUser();
    if (!user || user.app_metadata?.role === 'admin') return;
    const { data: profile } = await customerSupabase.from('customer_profiles')
      .select('full_name, phone, delivery_address, delivery_area')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile) return;
    for (const [field, value] of [
      ['name', profile.full_name],
      ['phone', profile.phone],
      ['email', user.email],
      ['address', profile.delivery_address],
    ]) {
      const input = checkoutForm.elements.namedItem(field);
      if (input && !input.value && value) input.value = value;
    }
    const deliveryOption = deliveryOptions.find((option) => option.value === profile.delivery_area);
    if (deliveryOption && deliveryOptions.every((option) => !option.dataset.userSelected)) deliveryOption.checked = true;
  } catch { /* Checkout remains usable if the customer profile is unavailable. */ }
}

function updateCheckoutTotals() {
  const delivery = Number(deliveryOptions.find((option) => option.checked)?.dataset.charge || 0);
  deliveryOutput.textContent = money(delivery);
  subtotalOutput.textContent = money(cartSubtotal);
  totalOutput.textContent = money(cartSubtotal + (hasCartItems ? delivery : 0));
}

async function renderOrderSummary() {
  let items;
  try {
    items = await loadCartItems();
  } catch {
    checkoutItems.replaceChildren();
    const error = document.createElement('p');
    error.className = 'checkout-empty';
    error.textContent = 'Could not load your cart. Please reload and try again.';
    checkoutItems.append(error);
    placeOrderButton.disabled = true;
    return;
  }
  checkoutItems.replaceChildren();
  hasCartItems = items.length > 0;
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'checkout-empty';
    empty.textContent = 'Your cart is empty.';
    checkoutItems.append(empty);
    cartSubtotal = 0;
    updateCheckoutTotals();
    placeOrderButton.disabled = true;
    return;
  }
  placeOrderButton.disabled = orderPlaced;

  cartSubtotal = 0;
  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const lineTotal = Number(item.unitPrice || 0) * quantity;
    cartSubtotal += lineTotal;
    const row = document.createElement('article');
    row.className = 'checkout-item';
    const image = document.createElement('img');
    image.src = item.image || 'data:,';
    image.alt = '';
    const copy = document.createElement('div');
    copy.className = 'checkout-item-copy';
    const name = document.createElement('strong');
    name.textContent = item.name || 'Product';
    const option = document.createElement('span');
    option.textContent = [item.tierQuantity, `Qty ${quantity}`].filter(Boolean).join(' · ');
    copy.append(name, option);
    const price = document.createElement('strong');
    price.className = 'checkout-item-total';
    price.textContent = money(lineTotal);
    row.append(image, copy, price);
    checkoutItems.append(row);
  }
  updateCheckoutTotals();
}

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  checkoutStatus.textContent = '';
  checkoutStatus.classList.remove('is-success');
  if (!checkoutForm.reportValidity()) return;
  placeOrderButton.disabled = true;
  placeOrderButton.textContent = 'Submitting order…';
  try {
    const items = await loadCartItems();
    if (!items.length) throw new Error('Your cart is empty. Add a product before placing an order.');
    const formData = new FormData(checkoutForm);
    const selectedDelivery = deliveryOptions.find((option) => option.checked);
    const { data, error } = await customerSupabase.rpc('place_customer_order', {
      p_customer_name: String(formData.get('name') || '').trim(),
      p_customer_email: String(formData.get('email') || '').trim(),
      p_customer_phone: String(formData.get('phone') || '').trim(),
      p_delivery_address: String(formData.get('address') || '').trim(),
      p_delivery_area: selectedDelivery?.value || '',
      p_items: items.map((item) => ({
        product_id: item.productId,
        tier_quantity: item.tierQuantity || '',
        quantity: item.quantity,
      })),
    });
    if (error) throw error;
    const order = Array.isArray(data) ? data[0] : data;
    if (!order?.order_number) throw new Error('The order was saved, but its confirmation number was not returned. Contact LataBoom before placing it again.');

    let cartCleared = true;
    try { await clearCartItems(); } catch { cartCleared = false; }
    orderPlaced = true;
    checkoutStatus.classList.add('is-success');
    checkoutStatus.textContent = cartCleared
      ? `Order ${order.order_number} placed successfully. It has been sent to LataBoom for confirmation.`
      : `Order ${order.order_number} placed successfully. Your cart could not be cleared automatically.`;
    placeOrderButton.textContent = 'Order placed';
    checkoutForm.querySelectorAll('input, textarea, button').forEach((control) => { control.disabled = true; });
    await renderOrderSummary();
  } catch (error) {
    checkoutStatus.textContent = error.message || 'Could not place your order. Please try again.';
    placeOrderButton.disabled = false;
    placeOrderButton.textContent = 'Place order';
  }
});

window.addEventListener('brand:cart-updated', () => renderOrderSummary());
deliveryOptions.forEach((option) => option.addEventListener('change', () => {
  option.dataset.userSelected = 'true';
  updateCheckoutTotals();
}));
updateCheckoutTotals();
renderOrderSummary();
prefillCustomerDetails();
