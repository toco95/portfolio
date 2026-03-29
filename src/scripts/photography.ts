let currentAlbum = 0;
let totalAlbums = 0;

export function initPhotography() {
  const slides = document.querySelectorAll('.photo-slide');
  const details = document.querySelectorAll('.photo-album-detail');
  const albumName = document.getElementById('photo-album-name');
  const prevBtn = document.getElementById('photo-prev');
  const nextBtn = document.getElementById('photo-next');

  totalAlbums = slides.length;
  if (totalAlbums === 0) return;

  function showAlbum(index: number) {
    // Wrap around
    if (index < 0) index = totalAlbums - 1;
    if (index >= totalAlbums) index = 0;
    currentAlbum = index;

    // Crossfade covers
    slides.forEach((slide, i) => {
      (slide as HTMLElement).classList.toggle('active', i === index);
    });

    // Update album name + year
    if (albumName) {
      const name = (slides[index] as HTMLElement).dataset.albumName ?? '';
      const year = (slides[index] as HTMLElement).dataset.albumYear ?? '';
      const titleEl = albumName.querySelector('.photo-album-title');
      const yearEl = albumName.querySelector('.photo-album-year');
      if (titleEl) titleEl.textContent = name;
      if (yearEl) yearEl.textContent = year;
    }

    // Show/hide details
    details.forEach((detail, i) => {
      (detail as HTMLElement).classList.toggle('active', i === index);
    });

    // Scroll to top when switching albums
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Init first album
  showAlbum(0);

  // Arrow buttons
  prevBtn?.addEventListener('click', () => showAlbum(currentAlbum - 1));
  nextBtn?.addEventListener('click', () => showAlbum(currentAlbum + 1));

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showAlbum(currentAlbum - 1);
    if (e.key === 'ArrowRight') showAlbum(currentAlbum + 1);
    if (e.key === 'Enter') {
      const detail = document.getElementById('photo-detail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Click album name to scroll to detail
  albumName?.addEventListener('click', () => {
    const detail = document.getElementById('photo-detail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth' });
  });

  // Swipe support on hero
  const heroEl = document.getElementById('photo-hero');
  if (heroEl) {
    let touchStartX = 0;
    heroEl.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    heroEl.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        dx > 0 ? showAlbum(currentAlbum - 1) : showAlbum(currentAlbum + 1);
      }
    });
  }

  // Sticky nav + back to top: toggle based on scroll position
  const hero = document.getElementById('photo-hero');
  const bottom = document.querySelector('.photo-bottom');
  const backToTop = document.getElementById('back-to-top');

  if (hero && bottom) {
    bottom.classList.add('at-hero');

    window.addEventListener('scroll', () => {
      const heroBottom = hero.getBoundingClientRect().bottom;
      const pastHero = heroBottom <= 80;

      bottom.classList.toggle('at-hero', !pastHero);
      backToTop?.classList.toggle('visible', pastHero);
    }, { passive: true });
  }

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
