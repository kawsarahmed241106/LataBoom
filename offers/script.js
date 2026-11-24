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

