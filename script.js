const app = document.querySelector('#app');
const navButtons = document.querySelectorAll('.nav-button[data-page]');
const validPages = [
  'accueil',
  'fonctionnalites',
  'comparaison',
  'configuration',
  'prix',
  'licence',
  'securite',
  'telechargement',
  'apropos'
];

function normalizePageName(pageName) {
  return String(pageName || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function setActiveButton(pageName) {
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.page === pageName);
  });
}

function renderPage(pageName) {
  const normalizedPageName = normalizePageName(pageName);
  const safePageName = validPages.includes(normalizedPageName) ? normalizedPageName : 'accueil';
  const template = document.querySelector(`#page-${safePageName}`);

  if (!template || !app) return;

  app.replaceChildren(template.content.cloneNode(true));
  setActiveButton(safePageName);
  window.history.replaceState(null, '', `#${safePageName}`);

  const title = app.querySelector('h1');
  if (title) {
    title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }
}

function handleNavigation(event) {
  const button = event.target.closest('.nav-button[data-page]');
  if (!button) return;

  event.preventDefault();
  renderPage(button.dataset.page);
}

document.addEventListener('click', handleNavigation);

window.addEventListener('popstate', () => {
  renderPage(window.location.hash.replace('#', '') || 'accueil');
});

renderPage(window.location.hash.replace('#', '') || 'accueil');
