const app = document.querySelector('#app');
const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-navigation');
const validPages = ['accueil','fonctionnalites','comparaison','configuration','prix','licence','securite','telechargement','apropos'];

function normalizePageName(pageName) {
  return String(pageName || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function setActiveButton(pageName) {
  document.querySelectorAll('.nav-button[data-page]').forEach(button => {
    button.classList.toggle('active', button.dataset.page === pageName);
  });
}

function closeMenu() {
  navigation?.classList.remove('open');
  menuToggle?.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}

function initRevealAnimations() {
  const elements = app.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach(element => element.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
  elements.forEach((element, index) => {
    element.style.transitionDelay = `${Math.min(index * 55, 220)}ms`;
    observer.observe(element);
  });
}

function renderPage(pageName, pushHistory = false) {
  const normalized = normalizePageName(pageName);
  const safePage = validPages.includes(normalized) ? normalized : 'accueil';
  const template = document.querySelector(`#page-${safePage}`);
  if (!template || !app) return;

  app.replaceChildren(template.content.cloneNode(true));
  setActiveButton(safePage);
  closeMenu();
  const url = `#${safePage}`;
  if (pushHistory) window.history.pushState({ page: safePage }, '', url);
  else window.history.replaceState({ page: safePage }, '', url);
  window.scrollTo({ top: 0, behavior: 'auto' });
  initRevealAnimations();
}

document.addEventListener('click', event => {
  const button = event.target.closest('.nav-button[data-page]');
  if (!button) return;
  event.preventDefault();
  renderPage(button.dataset.page, true);
});

menuToggle?.addEventListener('click', () => {
  const open = !navigation.classList.contains('open');
  navigation.classList.toggle('open', open);
  menuToggle.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
});

window.addEventListener('scroll', () => header?.classList.toggle('scrolled', window.scrollY > 12), { passive: true });
window.addEventListener('popstate', () => renderPage(window.location.hash.slice(1) || 'accueil'));
window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMenu(); });

renderPage(window.location.hash.slice(1) || 'accueil');
