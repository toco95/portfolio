let currentAlbum = 0;
let totalAlbums = 0;
let controller: AbortController;

export function initPhotography() {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  const slides = document.querySelectorAll('.photo-slide');
  const details = document.querySelectorAll('.photo-album-detail');
  const albumName = document.getElementById('photo-album-name');
  const prevBtn = document.getElementById('photo-prev');
  const nextBtn = document.getElementById('photo-next');

  totalAlbums = slides.length;
  if (totalAlbums === 0) return;

  function showAlbum(index: number) {
    if (index < 0) index = totalAlbums - 1;
    if (index >= totalAlbums) index = 0;
    currentAlbum = index;

    slides.forEach((slide, i) => {
      (slide as HTMLElement).classList.toggle('active', i === index);
    });

    if (albumName) {
      const name = (slides[index] as HTMLElement).dataset.albumName ?? '';
      const year = (slides[index] as HTMLElement).dataset.albumYear ?? '';
      const titleEl = albumName.querySelector('.photo-album-title');
      const yearEl = albumName.querySelector('.photo-album-year');
      if (titleEl) titleEl.textContent = name;
      if (yearEl) yearEl.textContent = year;
    }

    details.forEach((detail, i) => {
      (detail as HTMLElement).classList.toggle('active', i === index);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showAlbum(0);

  prevBtn?.addEventListener('click', () => showAlbum(currentAlbum - 1), { signal });
  nextBtn?.addEventListener('click', () => showAlbum(currentAlbum + 1), { signal });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'ArrowLeft') showAlbum(currentAlbum - 1);
    if (e.key === 'ArrowRight') showAlbum(currentAlbum + 1);
    if (e.key === 'Enter') {
      const detail = document.getElementById('photo-detail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth' });
    }
  }, { signal });

  albumName?.addEventListener('click', () => {
    const detail = document.getElementById('photo-detail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth' });
  }, { signal });

  // Swipe support
  const heroEl = document.getElementById('photo-hero');
  if (heroEl) {
    let touchStartX = 0;
    heroEl.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true, signal });
    heroEl.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        dx > 0 ? showAlbum(currentAlbum - 1) : showAlbum(currentAlbum + 1);
      }
    }, { signal });
  }

  // Sticky nav + back to top (throttled with RAF)
  const hero = document.getElementById('photo-hero');
  const bottom = document.querySelector('.photo-bottom');
  const backToTop = document.getElementById('back-to-top');

  if (hero && bottom) {
    bottom.classList.add('at-hero');
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const heroBottom = hero.getBoundingClientRect().bottom;
          const pastHero = heroBottom <= 80;
          bottom.classList.toggle('at-hero', !pastHero);
          backToTop?.classList.toggle('visible', pastHero);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true, signal });
  }

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, { signal });
}
