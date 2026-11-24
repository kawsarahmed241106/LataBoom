import { supabase } from '../supabase/sbapi.js';

const searchForm = document.querySelector('.search');
const searchInput = document.querySelector('#site-search');
const utilityBar = document.querySelector('.utility-bar');
const blogPostsContainer = document.querySelector('#blog-posts');
const newsletterForm = document.querySelector('#newsletter-form');
const newsletterStatus = document.querySelector('#newsletter-status');

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


async function loadBlogPosts() {
  if (!blogPostsContainer) return;
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, image_url, title, description, post_type, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    showBlogStatus('Articles will appear here once the blog is set up.');
    return;
  }
  renderBlogPosts(data ?? []);
}

function showBlogStatus(message) {
  blogPostsContainer.replaceChildren();
  const status = document.createElement('p');
  status.className = 'blog-feed-status';
  status.textContent = message;
  blogPostsContainer.append(status);
  blogPostsContainer.setAttribute('aria-busy', 'false');
}

function validBlogImageUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function blogReadTime(post) {
  const words = `${post.title} ${post.description}`.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 220))} min read`;
}

function formattedBlogDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('en-BD', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
}

function createBlogCard(post, featured, index) {
  const card = document.createElement('article');
  card.className = featured ? 'blog-post-card blog-post-featured' : 'blog-post-card blog-post-small';
  const image = document.createElement('img');
  image.src = validBlogImageUrl(post.image_url) || 'data:,';
  image.alt = '';
  image.loading = index === 0 ? 'eager' : 'lazy';
  image.decoding = 'async';

  const content = document.createElement('div');
  content.className = 'blog-post-content';
  const title = document.createElement(featured ? 'h2' : 'h3');
  title.textContent = post.title;
  if (!featured) {
    const category = document.createElement('span');
    category.className = 'blog-badge category';
    category.textContent = 'General';
    const footer = document.createElement('footer');
    footer.className = 'blog-small-footer';
    const authorRow = document.createElement('div');
    authorRow.className = 'blog-small-author-row';
    const mark = document.createElement('span');
    mark.className = 'blog-author-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'B';
    const author = document.createElement('strong');
    author.className = 'blog-post-author';
    author.textContent = 'By LataBoom';
    authorRow.append(mark, author);

    const metaRow = document.createElement('div');
    metaRow.className = 'blog-small-meta-row';
    const readTime = document.createElement('span');
    readTime.append(createBlogMetaIcon('clock'), document.createTextNode(blogReadTime(post)));
    metaRow.append(readTime);
    const dateText = formattedBlogDate(post.created_at);
    if (dateText) {
      const date = document.createElement('time');
      date.append(createBlogMetaIcon('calendar'), document.createTextNode(dateText));
      metaRow.append(date);
    }
    footer.append(authorRow, metaRow);
    content.append(category, title, footer);
    card.append(image, content);
    return card;
  }

  const badges = document.createElement('div');
  badges.className = 'blog-post-badges';
  if (featured) {
    const latest = document.createElement('span');
    latest.className = 'blog-badge latest';
    latest.textContent = 'Latest';
    badges.append(latest);
  }
  const category = document.createElement('span');
  category.className = 'blog-badge category';
  category.textContent = 'General';
  badges.append(category);

  const description = document.createElement('p');
  description.className = 'blog-post-description';
  description.textContent = post.description;
  const footer = document.createElement('footer');
  footer.className = 'blog-post-footer';
  const authorWrap = document.createElement('span');
  authorWrap.className = 'blog-post-author-wrap';
  const mark = document.createElement('span');
  mark.className = 'blog-author-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = 'B';
  const author = document.createElement('strong');
  author.className = 'blog-post-author';
  author.textContent = 'By LataBoom';
  authorWrap.append(mark, author);
  const meta = document.createElement('span');
  meta.className = 'blog-post-meta';
  meta.textContent = `${blogReadTime(post)}${formattedBlogDate(post.created_at) ? ` · ${formattedBlogDate(post.created_at)}` : ''}`;
  footer.append(authorWrap, meta);
  content.append(badges, title, description, footer);
  card.append(image, content);
  return card;
}

function createBlogMetaIcon(type) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', type === 'clock' ? 'circle' : 'rect');
  if (type === 'clock') {
    shape.setAttribute('cx', '12');
    shape.setAttribute('cy', '12');
    shape.setAttribute('r', '8');
    const hands = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hands.setAttribute('d', 'M12 7v5l3 2');
    icon.append(shape, hands);
  } else {
    shape.setAttribute('x', '4');
    shape.setAttribute('y', '5');
    shape.setAttribute('width', '16');
    shape.setAttribute('height', '15');
    shape.setAttribute('rx', '2');
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    lines.setAttribute('d', 'M8 3v4m8-4v4M4 10h16');
    icon.append(shape, lines);
  }
  return icon;
}

function renderBlogPosts(posts) {
  blogPostsContainer.replaceChildren();
  const bigPost = posts.find((post) => post.post_type === 'big');
  const smallPosts = posts.filter((post) => post.post_type !== 'big');
  if (!bigPost && !smallPosts.length) {
    showBlogStatus('No articles published yet.');
    return;
  }
  if (bigPost) blogPostsContainer.append(createBlogCard(bigPost, true, 0));
  if (smallPosts.length) {
    const grid = document.createElement('div');
    grid.className = 'blog-post-grid';
    smallPosts.forEach((post, index) => grid.append(createBlogCard(post, false, index + 1)));
    blogPostsContainer.append(grid);
  }
  blogPostsContainer.setAttribute('aria-busy', 'false');
}

loadBlogPosts();

newsletterForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  newsletterStatus.textContent = 'Newsletter sign-up is not connected yet.';
});

searchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return searchInput.focus();
  window.location.href = `../index.html?q=${encodeURIComponent(query)}#shop`;
});

