import { supabase, supabaseUrl } from '../supabase/sbapi.js';

const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const loginButton = document.querySelector('#login-button');
const adminApp = document.querySelector('#admin-app');
const dashboardMessage = document.querySelector('#dashboard-message');
const adminViewButtons = document.querySelectorAll('[data-admin-view]');
const adminPageTitle = document.querySelector('#admin-page-title');
const orderList = document.querySelector('#order-list');
const orderCount = document.querySelector('#order-count');
const orderStatusNav = document.querySelector('#order-status-nav');
const ordersAdminMessage = document.querySelector('#orders-admin-message');
const blogPostForm = document.querySelector('#blog-post-form');
const blogPostList = document.querySelector('#blog-post-list');
const blogAdminMessage = document.querySelector('#blog-admin-message');
const blogPostCount = document.querySelector('#blog-post-count');
const blogSubmitButton = document.querySelector('#blog-submit-button');
const blogCancelEdit = document.querySelector('#blog-cancel-edit');
const blogPostType = document.querySelector('#blog-post-type');
const blogDescriptionField = document.querySelector('#blog-description-field');
const productForm = document.querySelector('#product-form');
const productList = document.querySelector('#product-list');
const productMessage = document.querySelector('#products-admin-message');
const productCount = document.querySelector('#product-count');
const productSubmitButton = document.querySelector('#product-submit-button');
const productCancelEdit = document.querySelector('#product-cancel-edit');
const quantityPriceRows = document.querySelector('#quantity-price-rows');
const addQuantityPriceButton = document.querySelector('#add-quantity-price');
const productImagePreview = document.querySelector('#product-image-preview');
const imageManagerMessage = document.querySelector('#image-manager-message');
const heroUploadForm = document.querySelector('#hero-image-upload');
const heroImageLinkForm = document.querySelector('#hero-image-link');
const heroImageList = document.querySelector('#hero-image-list');
const IMAGE_BUCKET = 'storefront-images';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
let storefrontImages = [];
let blogPosts = [];
let products = [];
let orders = [];
let activeOrderFilter = 'all';
let productPreviewObjectUrls = [];

function isAdmin(user) {
  return user?.app_metadata?.role === 'admin';
}

async function getVerifiedAdmin() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !isAdmin(user)) return null;
  return user;
}

if (loginForm) {
  const existingAdmin = await getVerifiedAdmin();
  if (existingAdmin) window.location.replace('dashboard.html');

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginMessage.textContent = '';
    loginButton.disabled = true;
    loginButton.textContent = 'Signing in…';

    const formData = new FormData(loginForm);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(formData.get('email')).trim(),
      password: String(formData.get('password')),
    });

    if (error) {
      loginMessage.textContent = 'Sign in failed. Check your email and password.';
    } else if (!isAdmin(data.user)) {
      await supabase.auth.signOut();
      loginMessage.textContent = 'This account does not have administrator access.';
    } else {
      window.location.replace('dashboard.html');
      return;
    }

    loginButton.disabled = false;
    loginButton.textContent = 'Sign in';
  });
}

if (adminApp) {
  const admin = await getVerifiedAdmin();
  if (!admin) {
    window.location.replace('index.html');
  } else {
    document.querySelector('#admin-email').textContent = admin.email ?? '';
    adminApp.hidden = false;
  }

  document.querySelector('#signout-button').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      dashboardMessage.textContent = 'Could not sign out. Please try again.';
      return;
    }
    window.location.replace('index.html');
  });

  adminViewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setAdminView(button.dataset.adminView);
      if (button.dataset.adminView === 'orders') loadOrders();
    });
  });
  orderStatusNav?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-order-filter]');
    if (!button) return;
    activeOrderFilter = button.dataset.orderFilter;
    orderStatusNav.querySelectorAll('[data-order-filter]').forEach((filterButton) => {
      const active = filterButton === button;
      filterButton.classList.toggle('is-active', active);
      filterButton.setAttribute('aria-pressed', String(active));
    });
    renderOrders();
  });
  setAdminView('overview');

  if (blogPostForm) {
    await loadBlogPosts();
    blogPostType.addEventListener('change', updateBlogPostTypeFields);
    updateBlogPostTypeFields();
    blogPostForm.addEventListener('submit', saveBlogPost);
    blogCancelEdit.addEventListener('click', resetBlogPostForm);
  }

  if (productForm) {
    await loadProducts();
    productForm.addEventListener('submit', saveProduct);
    productCancelEdit.addEventListener('click', resetProductForm);
    addQuantityPriceButton.addEventListener('click', () => appendQuantityPriceRow());
    productForm.elements.image_files.addEventListener('change', renderProductImagePreviews);
    productForm.elements.image_urls.addEventListener('input', renderProductImagePreviews);
    appendQuantityPriceRow();
    renderProductImagePreviews();
    window.addEventListener('beforeunload', revokeProductPreviewUrls);
  }

  if (heroUploadForm) {
    await loadStorefrontImages();
    heroUploadForm.addEventListener('submit', uploadHeroImages);
    heroImageLinkForm.addEventListener('submit', (event) => addImageLink(event, 'hero'));
    document.querySelector('#side-one-upload').addEventListener('submit', (event) => uploadSingleImage(event, 'side_one'));
    document.querySelector('#side-two-upload').addEventListener('submit', (event) => uploadSingleImage(event, 'side_two'));
    document.querySelector('#side-one-link').addEventListener('submit', (event) => addImageLink(event, 'side_one'));
    document.querySelector('#side-two-link').addEventListener('submit', (event) => addImageLink(event, 'side_two'));
    document.querySelector('#delete-side-one').addEventListener('click', () => deleteSingleImage('side_one'));
    document.querySelector('#delete-side-two').addEventListener('click', () => deleteSingleImage('side_two'));
  }
}

function setAdminView(viewName) {
  document.querySelector('.dashboard-main')?.classList.toggle('is-orders-view', viewName === 'orders');
  document.querySelectorAll('.admin-view').forEach((view) => {
    view.hidden = view.id !== `${viewName}-view`;
  });
  adminViewButtons.forEach((button) => {
    const active = button.dataset.adminView === viewName;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (adminPageTitle) {
    const titles = { orders: 'Orders', products: 'Products', offers: 'Offers', blog: 'Blog', overview: 'Dashboard' };
    adminPageTitle.textContent = titles[viewName] ?? 'Dashboard';
  }
}

function setOrdersMessage(message, isError = false) {
  if (!ordersAdminMessage) return;
  ordersAdminMessage.textContent = message;
  ordersAdminMessage.classList.toggle('is-success', Boolean(message) && !isError);
}

async function loadOrders() {
  if (!orderList) return;
  orderList.setAttribute('aria-busy', 'true');
  setOrdersMessage('');
  const { data, error } = await supabase.from('orders')
    .select('id, order_number, customer_name, customer_email, phone, delivery_address, delivery_area, delivery_charge, status, status_note, total_amount, created_at, order_items(id, item_name, image_url, tier_quantity, unit_price, quantity)')
    .order('created_at', { ascending: false });
  orderList.setAttribute('aria-busy', 'false');
  if (error) {
    orderCount.textContent = 'Setup required';
    orderList.replaceChildren();
    setOrdersMessage('Could not load orders. Run supabase/orders.sql as postgres, then refresh.', true);
    return;
  }
  orders = data ?? [];
  renderOrders();
}

function renderOrders() {
  orderStatusNav?.querySelectorAll('[data-order-count]').forEach((count) => {
    const status = count.dataset.orderCount;
    const amount = status === 'all' ? orders.length : orders.filter((order) => order.status === status).length;
    count.textContent = String(amount);
  });
  const visibleOrders = activeOrderFilter === 'all'
    ? orders
    : orders.filter((order) => order.status === activeOrderFilter);
  orderCount.textContent = activeOrderFilter === 'all'
    ? `${orders.length} order${orders.length === 1 ? '' : 's'}`
    : `${visibleOrders.length} of ${orders.length} orders`;
  orderList.replaceChildren();
  if (!visibleOrders.length) {
    const empty = document.createElement('p');
    empty.className = 'order-admin-empty';
    empty.textContent = orders.length
      ? `No ${activeOrderFilter} orders right now.`
      : 'No customer orders yet. New checkout submissions will appear here.';
    orderList.append(empty);
    return;
  }

  const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  visibleOrders.forEach((order) => {
    const card = document.createElement('article');
    card.className = 'order-admin-card';
    const heading = document.createElement('div');
    heading.className = 'order-admin-heading';
    const orderTitle = document.createElement('div');
    const number = document.createElement('h3');
    number.textContent = `Order ${order.order_number}`;
    const date = document.createElement('time');
    date.dateTime = order.created_at;
    date.textContent = new Date(order.created_at).toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' });
    orderTitle.append(number, date);
    const statusBadge = document.createElement('span');
    statusBadge.className = `order-status-badge status-${order.status}`;
    statusBadge.textContent = order.status.replaceAll('_', ' ');
    heading.append(orderTitle, statusBadge);

    const info = document.createElement('div');
    info.className = 'order-admin-info';
    const customer = document.createElement('section');
    const customerHeading = document.createElement('h4');
    customerHeading.textContent = 'Customer';
    const customerName = document.createElement('p');
    customerName.textContent = order.customer_name || 'Name not provided';
    const email = document.createElement('a');
    email.href = `mailto:${order.customer_email}`;
    email.textContent = order.customer_email || 'Email not provided';
    const phone = document.createElement('a');
    phone.href = `tel:${String(order.phone || '').replace(/[^+\d]/g, '')}`;
    phone.textContent = order.phone || 'Phone not provided';
    customer.append(customerHeading, customerName, email, phone);

    const delivery = document.createElement('section');
    const deliveryHeading = document.createElement('h4');
    deliveryHeading.textContent = 'Delivery';
    const address = document.createElement('p');
    address.textContent = order.delivery_address || 'Address not provided';
    const area = document.createElement('span');
    area.textContent = `${({ inside_dhaka: 'Inside Dhaka', sub_dhaka: 'Sub Dhaka', outside_dhaka: 'Outside Dhaka' })[order.delivery_area] || order.delivery_area || 'Area not set'} · ${moneyAdmin(order.delivery_charge)}`;
    delivery.append(deliveryHeading, address, area);
    info.append(customer, delivery);

    const items = document.createElement('div');
    items.className = 'order-admin-items';
    (order.order_items || []).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'order-admin-item';
      const details = document.createElement('span');
      details.textContent = `${item.item_name}${item.tier_quantity ? ` · ${item.tier_quantity}` : ''} × ${item.quantity}`;
      const amount = document.createElement('strong');
      amount.textContent = moneyAdmin(Number(item.unit_price) * Number(item.quantity));
      row.append(details, amount);
      items.append(row);
    });

    const controls = document.createElement('div');
    controls.className = 'order-admin-controls';
    const total = document.createElement('strong');
    total.className = 'order-admin-total';
    total.textContent = `Total ${moneyAdmin(order.total_amount)}`;
    const statusSelect = document.createElement('select');
    statusSelect.setAttribute('aria-label', `Update status for order ${order.order_number}`);
    statuses.forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
      option.selected = status === order.status;
      statusSelect.append(option);
    });
    const saveStatus = document.createElement('button');
    saveStatus.type = 'button';
    saveStatus.className = 'order-status-save';
    const statusActionLabel = () => statusSelect.value === 'confirmed' && order.status === 'pending' ? 'Confirm order' : 'Update status';
    saveStatus.textContent = statusActionLabel();
    statusSelect.addEventListener('change', () => { saveStatus.textContent = statusActionLabel(); });
    saveStatus.addEventListener('click', async () => {
      saveStatus.disabled = true;
      saveStatus.textContent = 'Saving…';
      const { error: updateError } = await supabase.from('orders').update({ status: statusSelect.value }).eq('id', order.id);
      if (updateError) {
        setOrdersMessage(updateError.message || 'Could not update this order.', true);
        saveStatus.disabled = false;
        saveStatus.textContent = statusActionLabel();
        return;
      }
      await loadOrders();
      setOrdersMessage(`Order ${order.order_number} updated.`);
    });
    controls.append(total, statusSelect, saveStatus);
    card.append(heading, info, items, controls);
    orderList.append(card);
  });
}

function moneyAdmin(value) {
  return `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
}

function setImageMessage(message, isError = false) {
  imageManagerMessage.textContent = message;
  imageManagerMessage.classList.toggle('is-success', Boolean(message) && !isError);
}

function imageUrl(item) {
  const source = item.storage_path || item.image_url;
  if (source && /^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }
  if (!source) return '';
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(source).data.publicUrl;
}

async function loadStorefrontImages() {
  const { data, error } = await supabase
    .from('storefront_images')
    .select('id, slot, storage_path, alt_text, position')
    .order('position', { ascending: true });
  if (error) {
    setImageMessage('Could not load images. Run supabase/storefront-images.sql in the Supabase SQL Editor, then reload.', true);
    return;
  }
  storefrontImages = data ?? [];
  renderImageManager();
}

function renderImageManager() {
  const heroItems = storefrontImages.filter((item) => item.slot === 'hero');
  heroImageList.replaceChildren();
  if (!heroItems.length) {
    const empty = document.createElement('p');
    empty.className = 'image-empty';
    empty.textContent = 'No carousel images uploaded yet.';
    heroImageList.append(empty);
  }
  heroItems.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'uploaded-image-card';
    const image = document.createElement('img');
    image.src = imageUrl(item) || 'data:,';
    image.alt = item.alt_text || `Carousel image ${index + 1}`;
    const meta = document.createElement('div');
    meta.className = 'uploaded-image-meta';
    const title = document.createElement('span');
    title.textContent = item.alt_text || `Carousel image ${index + 1}`;
    const actions = document.createElement('div');
    actions.className = 'uploaded-image-actions';
    const up = makeImageAction('Move image earlier', '↑', () => moveHeroImage(index, -1));
    const down = makeImageAction('Move image later', '↓', () => moveHeroImage(index, 1));
    up.disabled = index === 0;
    down.disabled = index === heroItems.length - 1;
    const remove = makeImageAction('Remove image', 'Remove', () => deleteImage(item));
    remove.classList.add('delete-image');
    actions.append(up, down, remove);
    meta.append(title, actions);
    card.append(image, meta);
    heroImageList.append(card);
  });

  renderSinglePreview('side_one', '#side-one-preview', '#delete-side-one');
  renderSinglePreview('side_two', '#side-two-preview', '#delete-side-two');
}

function renderSinglePreview(slot, previewSelector, removeSelector) {
  const preview = document.querySelector(previewSelector);
  const removeButton = document.querySelector(removeSelector);
  const item = storefrontImages.find((image) => image.slot === slot);
  preview.replaceChildren();
  removeButton.hidden = !item;
  if (!item) {
    preview.textContent = 'No image uploaded';
    return;
  }
  const image = document.createElement('img');
  const src = imageUrl(item);
  if (!src) {
    preview.textContent = 'Image link is invalid';
    return;
  }
  image.src = src;
  image.alt = item.alt_text || '';
  preview.append(image);
}

function makeImageAction(label, text, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = text;
  button.addEventListener('click', action);
  return button;
}

function safeFileName(name) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100) || 'image';
}

async function storeUploadedImage(file, slot, altText, position) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Each image must be 10 MB or smaller.');
  const path = `${slot}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: file.type,
  });
  if (uploadError) throw uploadError;
  return { storage_path: path, alt_text: (altText || file.name).trim().slice(0, 160), position };
}

function imageErrorMessage(error) {
  if (/bucket not found/i.test(error?.message ?? '')) {
    return 'Storage bucket not found. Run supabase/storefront-images.sql in Supabase, or use the image link field below.';
  }
  return error?.message || 'Image upload failed.';
}

async function addImageLink(event, slot) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  let url;
  try {
    url = new URL(String(data.get('image_url') ?? '').trim());
  } catch {
    setImageMessage('Enter a valid public image URL.', true);
    return;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    setImageMessage('Image links must start with http:// or https://.', true);
    return;
  }

  const oldItem = slot === 'hero' ? null : storefrontImages.find((item) => item.slot === slot);
  const position = slot === 'hero'
    ? Math.max(0, ...storefrontImages.filter((item) => item.slot === 'hero').map((item) => item.position)) + 1
    : 1;
  const record = {
    // Store direct URLs in the existing source column, even when Storage is unavailable.
    storage_path: url.href,
    alt_text: String(data.get('alt_text') ?? '').trim().slice(0, 160),
    position,
  };
  const result = oldItem
    ? await supabase.from('storefront_images').update(record).eq('id', oldItem.id)
    : await supabase.from('storefront_images').insert({ slot, ...record });
  if (result.error) {
    setImageMessage(result.error.message || 'Could not save this image link.', true);
    return;
  }
  if (oldItem?.storage_path && !/^https?:\/\//i.test(oldItem.storage_path)) {
    await supabase.storage.from(IMAGE_BUCKET).remove([oldItem.storage_path]);
  }
  form.reset();
  setImageMessage(slot === 'hero' ? 'Image link added to the carousel.' : `${slot === 'side_one' ? 'Image 2' : 'Image 3'} link saved.`);
  await loadStorefrontImages();
}

async function uploadHeroImages(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const files = [...form.elements.images.files];
  if (!files.length) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Uploading…';
  try {
    let position = Math.max(0, ...storefrontImages.filter((item) => item.slot === 'hero').map((item) => item.position));
    const altText = String(new FormData(form).get('alt_text') ?? '');
    for (const file of files) {
      position += 1;
      const record = await storeUploadedImage(file, 'hero', altText, position);
      const { error } = await supabase.from('storefront_images').insert({ slot: 'hero', ...record });
      if (error) {
        await supabase.storage.from(IMAGE_BUCKET).remove([record.storage_path]);
        throw error;
      }
    }
    form.reset();
    setImageMessage(`${files.length} carousel image${files.length === 1 ? '' : 's'} uploaded.`);
    await loadStorefrontImages();
  } catch (error) {
    setImageMessage(imageErrorMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = 'Upload carousel images';
  }
}

async function uploadSingleImage(event, slot) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.elements.image.files[0];
  if (!file) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Uploading…';
  try {
    const oldItem = storefrontImages.find((item) => item.slot === slot);
    const record = await storeUploadedImage(file, slot, String(new FormData(form).get('alt_text') ?? ''), 1);
    const result = oldItem
      ? await supabase.from('storefront_images').update(record).eq('id', oldItem.id)
      : await supabase.from('storefront_images').insert({ slot, ...record });
    if (result.error) {
      await supabase.storage.from(IMAGE_BUCKET).remove([record.storage_path]);
      throw result.error;
    }
    if (oldItem?.storage_path && !/^https?:\/\//i.test(oldItem.storage_path)) {
      await supabase.storage.from(IMAGE_BUCKET).remove([oldItem.storage_path]);
    }
    form.reset();
    setImageMessage(`${slot === 'side_one' ? 'Image 2' : 'Image 3'} uploaded.`);
    await loadStorefrontImages();
  } catch (error) {
    setImageMessage(imageErrorMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = 'Upload / replace image';
  }
}

async function deleteImage(item) {
  if (!window.confirm('Remove this image from the storefront?')) return;
  const { error: rowError } = await supabase.from('storefront_images').delete().eq('id', item.id);
  if (rowError) {
    setImageMessage(rowError.message || 'Could not remove this image.', true);
    return;
  }
  const storageError = item.storage_path && !/^https?:\/\//i.test(item.storage_path)
    ? (await supabase.storage.from(IMAGE_BUCKET).remove([item.storage_path])).error
    : null;
  await normalizeHeroPositions(item.id);
  setImageMessage(storageError ? 'Image removed from the site. Its stored file could not be cleaned up.' : 'Image removed.');
  await loadStorefrontImages();
}

async function deleteSingleImage(slot) {
  const item = storefrontImages.find((image) => image.slot === slot);
  if (item) await deleteImage(item);
}

async function normalizeHeroPositions(excludeId) {
  const ids = storefrontImages.filter((item) => item.slot === 'hero' && item.id !== excludeId).map((item) => item.id);
  const { error } = await supabase.rpc('reorder_storefront_hero', { item_ids: ids });
  return error;
}

async function moveHeroImage(index, direction) {
  const heroItems = storefrontImages.filter((item) => item.slot === 'hero');
  const target = index + direction;
  if (target < 0 || target >= heroItems.length) return;
  [heroItems[index], heroItems[target]] = [heroItems[target], heroItems[index]];
  const { error } = await supabase.rpc('reorder_storefront_hero', {
    item_ids: heroItems.map((item) => item.id),
  });
  if (error) {
    setImageMessage(error.message || 'Could not reorder carousel images.', true);
    return;
  }
  setImageMessage('Carousel order updated.');
  await loadStorefrontImages();
}

function setBlogAdminMessage(message, isError = false) {
  blogAdminMessage.textContent = message;
  blogAdminMessage.classList.toggle('is-success', Boolean(message) && !isError);
}

function setProductMessage(message, isError = false) {
  productMessage.textContent = message;
  productMessage.classList.toggle('is-success', Boolean(message) && !isError);
}

function productCategoryLabel(value) {
  return ({
    honey: 'Honey',
    dry_food: 'Dry Food',
    mix_food: 'Mix Food',
    nuts_seeds: 'Nuts & Seeds',
    pickle: 'Pickle',
    dates: 'Dates',
    masala: 'Masala',
    tea: 'Tea',
  })[value] || '';
}

async function loadProducts() {
  productList.setAttribute('aria-busy', 'true');
  const { data, error } = await supabase
    .from('products')
    .select('id, image_url, images, name, category, description, short_description, price, regular_price, special_price, quantity_prices, is_on_sale, in_stock, sales_count, view_count, created_at')
    .order('created_at', { ascending: false });
  productList.setAttribute('aria-busy', 'false');
  if (error) {
    productCount.textContent = 'Setup required';
    productList.replaceChildren();
    setProductMessage('Could not load products. Run supabase/products.sql as postgres, then reload.', true);
    return;
  }
  products = data ?? [];
  renderProducts();
}

function renderProducts() {
  productCount.textContent = `${products.length} product${products.length === 1 ? '' : 's'}`;
  productList.replaceChildren();
  if (!products.length) {
    const empty = document.createElement('p');
    empty.className = 'blog-admin-empty';
    empty.textContent = 'No products yet. Add your first product above.';
    productList.append(empty);
    return;
  }
  for (const product of products) {
    const row = document.createElement('article');
    row.className = 'blog-admin-row';
    const image = document.createElement('img');
    image.src = safeBlogImageUrl(product.images?.[0] || product.image_url) || 'data:,';
    image.alt = '';
    image.loading = 'lazy';
    const details = document.createElement('div');
    details.className = 'blog-admin-details';
    const title = document.createElement('h4');
    title.textContent = product.name;
    const description = document.createElement('p');
    description.textContent = product.short_description || 'No short description';
    const status = document.createElement('span');
    status.className = 'blog-admin-type';
    status.textContent = [product.category ? productCategoryLabel(product.category) : 'Category not set', product.in_stock ? 'In stock' : 'Out of stock', product.is_on_sale ? 'On sale' : 'Regular price'].join(' · ');
    const price = document.createElement('time');
    const regularPrice = Number(product.regular_price ?? product.price);
    price.textContent = product.special_price
      ? `৳${Number(product.special_price).toLocaleString('en-BD', { maximumFractionDigits: 2 })} · Regular ৳${regularPrice.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`
      : `৳${regularPrice.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
    details.append(status, title, description, price);
    const actions = document.createElement('div');
    actions.className = 'blog-admin-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'blog-edit-button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editProduct(product));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'blog-delete-button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteProduct(product));
    actions.append(edit, remove);
    row.append(image, details, actions);
    productList.append(row);
  }
}

function editProduct(product) {
  productForm.elements.id.value = product.id;
  productForm.elements.image_files.value = '';
  productForm.elements.image_urls.value = (product.images?.length ? product.images : [product.image_url]).filter(Boolean).join('\n');
  productForm.elements.product_name.value = product.name;
  productForm.elements.category.value = product.category ?? '';
  productForm.elements.short_description.value = product.short_description ?? '';
  productForm.elements.description.value = product.description ?? '';
  quantityPriceRows.replaceChildren();
  const tiers = Array.isArray(product.quantity_prices) && product.quantity_prices.length
    ? product.quantity_prices
    : [{ quantity: 'Standard', regular_price: product.regular_price ?? product.price, special_price: product.special_price ?? '', in_stock: product.in_stock }];
  tiers.forEach((tier) => appendQuantityPriceRow({
    ...tier,
    regular_price: tier.regular_price ?? tier.price ?? (tiers.length === 1 ? product.regular_price ?? product.price : ''),
    special_price: tier.special_price ?? (tiers.length === 1 ? product.special_price ?? '' : ''),
    in_stock: tier.in_stock ?? product.in_stock,
  }));
  renderProductImagePreviews();
  productSubmitButton.textContent = 'Save product';
  productCancelEdit.hidden = false;
  setProductMessage(`Editing “${product.name}”.`);
  productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  productForm.elements.product_name.focus({ preventScroll: true });
}

function resetProductForm() {
  productForm.reset();
  productForm.elements.id.value = '';
  quantityPriceRows.replaceChildren();
  appendQuantityPriceRow();
  renderProductImagePreviews();
  productSubmitButton.textContent = 'Add product';
  productCancelEdit.hidden = true;
  setProductMessage('');
}

async function saveProduct(event) {
  event.preventDefault();
  const formData = new FormData(productForm);
  const imageFiles = formData.getAll('image_files').filter((file) => file?.size);
  const imageLinkValues = String(formData.get('image_urls') ?? '').split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
  const imageLinks = imageLinkValues.map(safeBlogImageUrl);
  const name = String(formData.get('product_name') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const shortDescription = String(formData.get('short_description') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const quantityPrices = [...quantityPriceRows.querySelectorAll('.quantity-price-row')].map((row) => {
    const regularValue = row.querySelector('[name="quantity_regular_price"]').value.trim();
    const specialValue = row.querySelector('[name="quantity_special_price"]').value.trim();
    return {
      quantity: row.querySelector('[name="quantity_label"]').value.trim(),
      regular_price: regularValue ? Number(regularValue) : null,
      special_price: specialValue ? Number(specialValue) : null,
      in_stock: row.querySelector('[name="quantity_in_stock"]').checked,
    };
  });
  const filledTiers = quantityPrices.filter((tier) => tier.quantity || tier.regular_price !== null || tier.special_price !== null);
  const validTiers = filledTiers.length > 0 && filledTiers.every((tier) => tier.quantity
    && Number.isFinite(tier.regular_price) && tier.regular_price > 0
    && (tier.special_price === null || (Number.isFinite(tier.special_price) && tier.special_price > 0 && tier.special_price < tier.regular_price)));
  if ((!imageFiles.length && !imageLinkValues.length) || imageLinks.some((url) => !url) || !name || !productCategoryLabel(category)) {
    setProductMessage('Choose product images, enter a title, and select a category.', true);
    return;
  }
  if (!validTiers) {
    setProductMessage('Add at least one quantity with a regular price. Any special price must be lower than its regular price.', true);
    return;
  }
  if (imageFiles.some((file) => !file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES)) {
    setProductMessage('Choose image files up to 10 MB each.', true);
    return;
  }

  const productId = String(formData.get('id') ?? '').trim();
  const previous = products.find((item) => String(item.id) === productId);
  productSubmitButton.disabled = true;
  const originalText = productSubmitButton.textContent;
  const uploadedPaths = [];
  try {
    const imageUrls = [...new Set(imageLinks.filter(Boolean))];
    for (const [index, imageFile] of imageFiles.entries()) {
      productSubmitButton.textContent = `Uploading image ${index + 1} of ${imageFiles.length}…`;
      const uploadedPath = `products/${crypto.randomUUID()}-${safeFileName(imageFile.name)}`;
      const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(uploadedPath, imageFile, {
        cacheControl: '31536000', upsert: false, contentType: imageFile.type,
      });
      if (error) throw error;
      uploadedPaths.push(uploadedPath);
      imageUrls.push(supabase.storage.from(IMAGE_BUCKET).getPublicUrl(uploadedPath).data.publicUrl);
    }
    const uniqueImageUrls = [...new Set(imageUrls)];
    const firstTier = filledTiers.find((tier) => tier.in_stock) ?? filledTiers[0];
    const product = {
      image_url: uniqueImageUrls[0],
      images: uniqueImageUrls,
      name,
      category,
      description,
      short_description: shortDescription,
      price: firstTier.regular_price,
      regular_price: firstTier.regular_price,
      special_price: firstTier.special_price,
      quantity_prices: filledTiers,
      is_on_sale: filledTiers.some((tier) => tier.special_price !== null),
      in_stock: filledTiers.some((tier) => tier.in_stock),
    };
    productSubmitButton.textContent = productId ? 'Saving…' : 'Adding…';
    const result = productId
      ? await supabase.from('products').update(product).eq('id', productId)
      : await supabase.from('products').insert(product);
    if (result.error) throw result.error;
    if (previous) {
      const oldImages = previous.images?.length ? previous.images : [previous.image_url];
      const obsoletePaths = oldImages.filter((url) => !uniqueImageUrls.includes(url)).map(blogStoragePath).filter(Boolean);
      if (obsoletePaths.length) await supabase.storage.from(IMAGE_BUCKET).remove(obsoletePaths);
    }
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from(IMAGE_BUCKET).remove(uploadedPaths);
    setProductMessage(error.message || 'Could not save this product.', true);
    return;
  } finally {
    productSubmitButton.disabled = false;
    productSubmitButton.textContent = originalText;
  }
  resetProductForm();
  setProductMessage(productId ? 'Product updated.' : 'Product added.');
  await loadProducts();
}

async function deleteProduct(product) {
  if (!window.confirm(`Delete “${product.name}”?`)) return;
  const { error } = await supabase.from('products').delete().eq('id', product.id);
  if (error) {
    setProductMessage(error.message || 'Could not delete this product.', true);
    return;
  }
  const imageUrls = product.images?.length ? product.images : [product.image_url];
  const storagePaths = imageUrls.map(blogStoragePath).filter(Boolean);
  if (storagePaths.length) await supabase.storage.from(IMAGE_BUCKET).remove(storagePaths);
  if (productForm.elements.id.value === String(product.id)) resetProductForm();
  setProductMessage('Product deleted.');
  await loadProducts();
}

function appendQuantityPriceRow(tier = {}) {
  const row = document.createElement('div');
  row.className = 'quantity-price-row';
  const quantity = document.createElement('input');
  quantity.name = 'quantity_label';
  quantity.type = 'text';
  quantity.maxLength = 60;
  quantity.placeholder = 'e.g. 500 g';
  quantity.value = tier.quantity ?? '';
  quantity.setAttribute('aria-label', 'Quantity option');
  const regular = document.createElement('input');
  regular.name = 'quantity_regular_price';
  regular.type = 'number';
  regular.min = '0.01';
  regular.step = '0.01';
  regular.placeholder = 'Regular price ৳';
  regular.value = tier.regular_price ?? tier.price ?? '';
  regular.setAttribute('aria-label', 'Regular price for this quantity');
  const special = document.createElement('input');
  special.name = 'quantity_special_price';
  special.type = 'number';
  special.min = '0.01';
  special.step = '0.01';
  special.placeholder = 'Special price ৳ (optional)';
  special.value = tier.special_price ?? '';
  special.setAttribute('aria-label', 'Optional special price for this quantity');
  const availability = document.createElement('label');
  availability.className = 'quantity-stock-toggle';
  const inStock = document.createElement('input');
  inStock.name = 'quantity_in_stock';
  inStock.type = 'checkbox';
  inStock.checked = tier.in_stock !== false;
  const stockText = document.createElement('span');
  stockText.textContent = 'In stock';
  availability.append(inStock, stockText);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-quantity-price';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => row.remove());
  row.append(quantity, regular, special, availability, remove);
  quantityPriceRows.append(row);
}

function revokeProductPreviewUrls() {
  productPreviewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  productPreviewObjectUrls = [];
}

function renderProductImagePreviews() {
  if (!productImagePreview || !productForm) return;
  revokeProductPreviewUrls();
  productImagePreview.replaceChildren();
  const selectedFiles = [...productForm.elements.image_files.files];
  const linkedImages = String(productForm.elements.image_urls.value ?? '')
    .split(/\r?\n/).map((url) => safeBlogImageUrl(url.trim())).filter(Boolean);
  const images = [
    ...selectedFiles.map((file) => {
      const url = URL.createObjectURL(file);
      productPreviewObjectUrls.push(url);
      return { url, label: file.name };
    }),
    ...linkedImages.map((url, index) => ({ url, label: `Image link ${index + 1}` })),
  ];
  if (!images.length) {
    const empty = document.createElement('p');
    empty.className = 'product-image-preview-empty';
    empty.textContent = 'Image previews will appear here.';
    productImagePreview.append(empty);
    return;
  }
  for (const [index, item] of images.entries()) {
    const figure = document.createElement('figure');
    figure.className = 'product-image-preview-item';
    const image = document.createElement('img');
    image.src = item.url;
    image.alt = `Product image preview ${index + 1}`;
    image.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.textContent = item.label;
    figure.append(image, caption);
    productImagePreview.append(figure);
  }
}

async function loadBlogPosts() {
  blogPostList.setAttribute('aria-busy', 'true');
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, image_url, title, description, post_type, created_at')
    .order('created_at', { ascending: false });
  blogPostList.setAttribute('aria-busy', 'false');
  if (error) {
    blogPostCount.textContent = 'Setup required';
    blogPostList.replaceChildren();
    setBlogAdminMessage('Could not load posts. Run supabase/blog-posts.sql as postgres, then reload.', true);
    return;
  }
  blogPosts = data ?? [];
  renderBlogPosts();
}

function safeBlogImageUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function renderBlogPosts() {
  const bigCount = blogPosts.filter((post) => post.post_type === 'big').length;
  const smallCount = blogPosts.length - bigCount;
  blogPostCount.textContent = `${bigCount} Big · ${smallCount} Small`;
  blogPostList.replaceChildren();
  if (!blogPosts.length) {
    const empty = document.createElement('p');
    empty.className = 'blog-admin-empty';
    empty.textContent = 'No blog posts yet. Publish your first post using the form above.';
    blogPostList.append(empty);
    return;
  }

  blogPosts.forEach((post) => {
    const row = document.createElement('article');
    row.className = 'blog-admin-row';
    const image = document.createElement('img');
    image.src = safeBlogImageUrl(post.image_url) || 'data:,';
    image.alt = '';
    image.loading = 'lazy';
    const details = document.createElement('div');
    details.className = 'blog-admin-details';
    const title = document.createElement('h4');
    title.textContent = post.title;
    const type = document.createElement('span');
    type.className = 'blog-admin-type';
    type.textContent = post.post_type === 'big' ? 'Big · featured' : 'Small';
    const description = document.createElement('p');
    description.textContent = post.description || 'No description';
    const date = document.createElement('time');
    date.textContent = new Date(post.created_at).toLocaleDateString();
    details.append(type, title, description, date);

    const actions = document.createElement('div');
    actions.className = 'blog-admin-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'blog-edit-button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editBlogPost(post));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'blog-delete-button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteBlogPost(post));
    actions.append(edit, remove);
    row.append(image, details, actions);
    blogPostList.append(row);
  });
}

function editBlogPost(post) {
  blogPostForm.elements.id.value = post.id;
  blogPostType.value = post.post_type || 'small';
  updateBlogPostTypeFields();
  blogPostForm.elements.image_url.value = post.image_url;
  blogPostForm.elements.image_file.value = '';
  blogPostForm.elements.title.value = post.title;
  blogPostForm.elements.description.value = post.description;
  blogSubmitButton.textContent = 'Save changes';
  blogCancelEdit.hidden = false;
  setBlogAdminMessage(`Editing “${post.title}”.`);
  blogPostForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  blogPostForm.elements.title.focus({ preventScroll: true });
}

function resetBlogPostForm() {
  blogPostForm.reset();
  blogPostForm.elements.id.value = '';
  blogPostType.value = 'small';
  updateBlogPostTypeFields();
  blogSubmitButton.textContent = 'Publish Small post';
  blogCancelEdit.hidden = true;
  setBlogAdminMessage('');
}

async function saveBlogPost(event) {
  event.preventDefault();
  const formData = new FormData(blogPostForm);
  const imageFile = formData.get('image_file');
  const imageLink = String(formData.get('image_url') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const postType = String(formData.get('post_type') ?? 'small');
  const description = postType === 'big' ? String(formData.get('description') ?? '').trim() : '';
  if ((!imageFile?.size && !safeBlogImageUrl(imageLink)) || !title || (postType === 'big' && !description)) {
    setBlogAdminMessage(postType === 'big'
      ? 'Choose an image, add a title, and write a description for the Big post.'
      : 'Choose an image and add a title for the Small post.', true);
    return;
  }

  const requestedPostId = String(formData.get('id') ?? '').trim();
  const existingBigPost = blogPosts.find((item) => item.post_type === 'big');
  const postId = requestedPostId || (postType === 'big' ? String(existingBigPost?.id ?? '') : '');
  const existingPost = blogPosts.find((item) => String(item.id) === postId);
  if (requestedPostId && postType === 'big' && existingBigPost && String(existingBigPost.id) !== requestedPostId) {
    setBlogAdminMessage('There is already a Big post. Edit it, or start a new Big post to replace it.', true);
    return;
  }
  blogSubmitButton.disabled = true;
  const originalButtonText = blogSubmitButton.textContent;
  let uploadedPath = '';
  let imageUrl = safeBlogImageUrl(imageLink);
  try {
    if (imageFile?.size) {
      if (!imageFile.type.startsWith('image/')) throw new Error('Choose an image file.');
      if (imageFile.size > MAX_IMAGE_BYTES) throw new Error('The image must be 10 MB or smaller.');
      blogSubmitButton.textContent = 'Uploading image…';
      uploadedPath = `blog/${crypto.randomUUID()}-${safeFileName(imageFile.name)}`;
      const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(uploadedPath, imageFile, {
        cacheControl: '31536000',
        upsert: false,
        contentType: imageFile.type,
      });
      if (uploadError) throw uploadError;
      imageUrl = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
    }

    const post = { image_url: imageUrl, title, description, post_type: postType };
    blogSubmitButton.textContent = postId ? 'Saving…' : 'Publishing…';
    const result = postId
      ? await supabase.from('blog_posts').update(post).eq('id', postId)
      : await supabase.from('blog_posts').insert(post);
    if (result.error) throw result.error;

    if (uploadedPath && existingPost?.image_url) {
      const oldPath = blogStoragePath(existingPost.image_url);
      if (oldPath) await supabase.storage.from(IMAGE_BUCKET).remove([oldPath]);
    }
  } catch (error) {
    if (uploadedPath) await supabase.storage.from(IMAGE_BUCKET).remove([uploadedPath]);
    setBlogAdminMessage(error.message || 'Could not save this post.', true);
    return;
  } finally {
    blogSubmitButton.disabled = false;
    blogSubmitButton.textContent = originalButtonText;
  }
  resetBlogPostForm();
  setBlogAdminMessage(postType === 'big' && existingPost && !requestedPostId
    ? 'The Big post was replaced.'
    : requestedPostId ? 'Blog post updated.' : 'Blog post published.');
  await loadBlogPosts();
}

function updateBlogPostTypeFields() {
  if (!blogPostType || !blogDescriptionField) return;
  const isBig = blogPostType.value === 'big';
  blogDescriptionField.hidden = !isBig;
  blogPostForm.elements.description.required = isBig;
  blogPostForm.elements.description.placeholder = isBig
    ? 'Write a description for the featured post'
    : 'Small posts do not use a description';
  if (!blogPostForm.elements.id.value) {
    blogSubmitButton.textContent = isBig ? 'Publish Big post' : 'Publish Small post';
  }
}

async function deleteBlogPost(post) {
  if (!window.confirm(`Delete “${post.title}”?`)) return;
  const { error } = await supabase.from('blog_posts').delete().eq('id', post.id);
  if (error) {
    setBlogAdminMessage(error.message || 'Could not delete this post.', true);
    return;
  }
  const storagePath = blogStoragePath(post.image_url);
  if (storagePath) await supabase.storage.from(IMAGE_BUCKET).remove([storagePath]);
  if (blogPostForm.elements.id.value === String(post.id)) resetBlogPostForm();
  setBlogAdminMessage('Blog post deleted.');
  await loadBlogPosts();
}

function blogStoragePath(value) {
  try {
    const url = new URL(value);
    const publicPrefix = '/storage/v1/object/public/storefront-images/';
    const prefixIndex = url.pathname.indexOf(publicPrefix);
    if (url.origin !== new URL(supabaseUrl).origin || prefixIndex < 0) return null;
    return decodeURIComponent(url.pathname.slice(prefixIndex + publicPrefix.length));
  } catch {
    return null;
  }
}
