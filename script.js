const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });

document.querySelectorAll('.section, .cards article, .steps div').forEach(el => {
  el.classList.add('reveal');
  observer.observe(el);
});
