import { customerSupabase as supabase } from './supabase/customer-client.js';

const CART_KEY = 'brand_cart_items';
const CART_OWNER_KEY = 'brand_cart_owner_id';

function readLocalCart() {
  try {
    const items = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(items) ? items.filter((item) => item && item.productId) : [];
  } catch {
    return [];
  }
}

function writeLocalCart(items, ownerId = null) {
  let changed = false;
  try {
    const serialized = JSON.stringify(items);
    if (localStorage.getItem(CART_KEY) !== serialized) {
      localStorage.setItem(CART_KEY, serialized);
      changed = true;
    }
    if (ownerId) {
      if (localStorage.getItem(CART_OWNER_KEY) !== ownerId) {
        localStorage.setItem(CART_OWNER_KEY, ownerId);
        changed = true;
      }
    } else if (localStorage.getItem(CART_OWNER_KEY) !== null) {
      localStorage.removeItem(CART_OWNER_KEY);
      changed = true;
    }
  } catch { /* Remote cart data remains available if local storage is unavailable. */ }
  if (changed) window.dispatchEvent(new CustomEvent('brand:cart-updated', { detail: items }));
}

function fromDatabase(row) {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.product_name,
    image: row.image_url,
    unitPrice: Number(row.unit_price),
    tierQuantity: row.tier_quantity || '',
    quantity: Number(row.quantity) || 1,
  };
}

function toDatabase(item, userId, quantity = item.quantity) {
  return {
    user_id: userId,
    product_id: Number(item.productId),
    product_name: item.name || 'Product',
    image_url: item.image || '',
    tier_quantity: item.tierQuantity || '',
    unit_price: Number(item.unitPrice) || 0,
    quantity: Math.max(1, Number(quantity) || 1),
  };
}

async function signedInUser() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  } catch {
    return null;
  }
}

async function readRemoteCart(userId) {
  return supabase.from('customer_cart_items')
    .select('id, product_id, product_name, image_url, tier_quantity, unit_price, quantity')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
}

function itemKey(item) {
  return `${item.productId}::${item.tierQuantity || ''}`;
}

export async function loadCartItems() {
  const user = await signedInUser();
  if (!user) return readLocalCart();

  const localItems = readLocalCart();
  const ownerId = localStorage.getItem(CART_OWNER_KEY);
  if (ownerId && ownerId !== user.id) writeLocalCart([]);

  const { data, error } = await readRemoteCart(user.id);
  if (error) return readLocalCart();
  let remoteItems = (data || []).map(fromDatabase);

  // Migrate a guest cart into the first account that signs in, without exposing one account's cart to another.
  if (!ownerId && localItems.length) {
    const merged = new Map(remoteItems.map((item) => [itemKey(item), item]));
    for (const item of localItems) {
      const key = itemKey(item);
      const current = merged.get(key);
      if (current) current.quantity += Math.max(1, Number(item.quantity) || 1);
      else merged.set(key, { ...item, quantity: Math.max(1, Number(item.quantity) || 1) });
    }
    const rows = [...merged.values()].map((item) => toDatabase(item, user.id));
    const { error: mergeError } = await supabase.from('customer_cart_items').upsert(rows, { onConflict: 'user_id,product_id,tier_quantity' });
    if (!mergeError) {
      const refreshed = await readRemoteCart(user.id);
      if (!refreshed.error) remoteItems = (refreshed.data || []).map(fromDatabase);
    }
  }

  writeLocalCart(remoteItems, user.id);
  return remoteItems;
}

export async function clearCartItems() {
  const user = await signedInUser();
  if (user) {
    const { error } = await supabase.from('customer_cart_items').delete().eq('user_id', user.id);
    if (error) throw error;
  }
  writeLocalCart([], user?.id || null);
  return [];
}

async function saveLocalItem(item, amount = 1, ownerId = null) {
  const items = readLocalCart();
  const match = items.find((candidate) => itemKey(candidate) === itemKey(item));
  if (match) match.quantity = Math.max(1, Number(match.quantity) || 1) + amount;
  else items.push({ ...item, quantity: Math.max(1, amount) });
  writeLocalCart(items, ownerId);
  return items;
}

export async function addCartItem(item, amount = 1) {
  const user = await signedInUser();
  if (!user) return saveLocalItem(item, amount);

  const { data: existing, error: lookupError } = await supabase.from('customer_cart_items')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('product_id', Number(item.productId))
    .eq('tier_quantity', item.tierQuantity || '')
    .maybeSingle();
  if (lookupError) return saveLocalItem(item, amount, user.id);

  const nextQuantity = (Number(existing?.quantity) || 0) + Math.max(1, Number(amount) || 1);
  const { error } = await supabase.from('customer_cart_items')
    .upsert(toDatabase(item, user.id, nextQuantity), { onConflict: 'user_id,product_id,tier_quantity' });
  if (error) return saveLocalItem(item, amount, user.id);
  return loadCartItems();
}

export async function changeCartItemQuantity(item, change) {
  const user = await signedInUser();
  const currentQuantity = Number(item.quantity) || 1;
  const nextQuantity = currentQuantity + change;
  if (user && item.id) {
    let error;
    if (nextQuantity <= 0) {
      ({ error } = await supabase.from('customer_cart_items').delete().eq('id', item.id).eq('user_id', user.id));
    } else {
      ({ error } = await supabase.from('customer_cart_items').update({ quantity: nextQuantity }).eq('id', item.id).eq('user_id', user.id));
    }
    if (!error) return loadCartItems();
  }

  let items = readLocalCart();
  const index = items.findIndex((candidate) => itemKey(candidate) === itemKey(item));
  if (index < 0) return items;
  if (nextQuantity <= 0) items.splice(index, 1);
  else items[index].quantity = nextQuantity;
  writeLocalCart(items, user?.id || null);
  return items;
}

export async function removeCartItem(item) {
  const user = await signedInUser();
  if (user && item.id) {
    const { error } = await supabase.from('customer_cart_items').delete().eq('id', item.id).eq('user_id', user.id);
    if (!error) return loadCartItems();
  }
  const items = readLocalCart().filter((candidate) => itemKey(candidate) !== itemKey(item));
  writeLocalCart(items, user?.id || null);
  return items;
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') writeLocalCart([]);
});
