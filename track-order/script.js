import { supabase } from '../supabase/sbapi.js';

const utilityBar = document.querySelector('.utility-bar');
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

const trackForm = document.querySelector('#track-form');
const formStatus = document.querySelector('#track-form-status');
const submitButton = trackForm.querySelector('.track-submit');
const resultPanel = document.querySelector('#track-result');
const statusLabels = {
  pending: 'Order received',
  confirmed: 'Confirmed',
  processing: 'Preparing',
  shipped: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const progressSteps = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en-BD', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function showTrackingResult(order) {
  const currentStatus = String(order.status || 'pending').toLowerCase();
  const cancelled = currentStatus === 'cancelled';
  const currentIndex = progressSteps.indexOf(currentStatus);
  document.querySelector('#result-order-number').textContent = order.order_number;
  const badge = document.querySelector('#result-status-badge');
  badge.textContent = statusLabels[currentStatus] || currentStatus.replaceAll('_', ' ');
  badge.className = `track-status-badge${currentStatus === 'delivered' ? ' is-delivered' : ''}${cancelled ? ' is-cancelled' : ''}`;
  const note = document.querySelector('#result-status-note');
  note.textContent = order.status_note || '';
  note.hidden = !order.status_note;

  const timeline = document.querySelector('#track-timeline');
  timeline.replaceChildren();
  timeline.classList.toggle('is-cancelled', cancelled);
  progressSteps.forEach((step, index) => {
    const item = document.createElement('li');
    item.textContent = statusLabels[step];
    if (!cancelled && currentIndex >= index) item.classList.add('is-complete');
    timeline.append(item);
  });

  document.querySelector('#result-created-at').textContent = displayDate(order.created_at);
  const deliveryRow = document.querySelector('#estimated-delivery-row');
  deliveryRow.hidden = !order.estimated_delivery;
  document.querySelector('#result-estimated-delivery').textContent = displayDate(order.estimated_delivery);
  resultPanel.hidden = false;
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

trackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.textContent = '';
  formStatus.classList.remove('is-success');
  resultPanel.hidden = true;
  const phone = trackForm.elements.phone.value.trim();
  const orderNumber = trackForm.elements.order_number.value.trim();
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15 || !orderNumber) {
    formStatus.textContent = 'Enter a valid phone number and order number.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'SEARCHING…';
  try {
    const { data, error } = await supabase.rpc('track_order_by_reference', {
      lookup_phone: phone,
      lookup_order_number: orderNumber,
    });
    if (error) throw error;
    const order = Array.isArray(data) ? data[0] : data;
    if (!order) {
      formStatus.textContent = 'We could not find an order matching those details. Check them and try again.';
      return;
    }
    showTrackingResult(order);
  } catch (error) {
    console.error('Order tracking lookup failed:', error);
    formStatus.textContent = 'Order tracking is not set up yet. Run supabase/orders.sql in the Supabase SQL Editor, then try again.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'TRACK ORDER';
  }
});
