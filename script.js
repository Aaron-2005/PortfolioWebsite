// ── Smooth scroll ────────────────────────────────────────────────────────────
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', event => {
      const targetId = anchor.getAttribute('href');
      if (targetId && targetId.length > 1) {
        event.preventDefault();
        const target = document.querySelector(targetId);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

// ── Reveal on scroll ─────────────────────────────────────────────────────────
function initRevealAnimations() {
  const revealEls = Array.from(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('visible'));
    return null;
  }
  const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
  );
  revealEls.forEach(el => observer.observe(el));
  return observer;
}

// ── Infinite Carousel ────────────────────────────────────────────────────────
function initCarousel() {
  const track    = document.getElementById('projects-list');
  const viewport = track?.closest('.carousel-viewport');
  const wrapper  = track?.closest('.carousel-wrapper');
  if (!track || !viewport || !wrapper) return;

  const GAP      = 16;   // must match CSS gap
  const DURATION = 320;  // ms

  let currentIndex = 0;
  let isAnimating  = false;
  let autoplayTimer = null;

  // How many cards should be visible — mirrors CSS breakpoints exactly
  function getVisible() {
    const w = window.innerWidth;
    if (w <= 540)  return 1;
    if (w <= 900)  return 2;
    return 4;
  }

  // Measure the actual rendered width of one card slot
  // We read it straight from the DOM so it always matches what CSS produces
  function getStepWidth() {
    const firstReal = track.querySelector('.project-card:not(.clone)');
    if (!firstReal) return 0;
    // offsetWidth + gap between cards
    return firstReal.offsetWidth + GAP;
  }

  // Store original cards (once, before any clones are added)
  let originals = null;

  function getOriginals() {
    if (!originals) {
      originals = Array.from(track.querySelectorAll('.project-card:not(.clone)'));
    }
    return originals;
  }

  function buildClones() {
    // Remove existing clones
    track.querySelectorAll('.clone').forEach(c => c.remove());

    const cards = getOriginals();
    const count = cards.length;
    if (!count) return;

    const visible = getVisible();

    // Add `visible` clones of the END before the first real card (prepend)
    for (let i = visible - 1; i >= 0; i--) {
      const clone = cards[((count - visible + i) % count + count) % count].cloneNode(true);
      clone.classList.add('clone');
      track.insertBefore(clone, track.firstChild);
    }

    // Add `visible` clones of the START after the last real card (append)
    for (let i = 0; i < visible; i++) {
      const clone = cards[i % count].cloneNode(true);
      clone.classList.add('clone');
      track.appendChild(clone);
    }
  }

  function setPosition(index, animate) {
    track.style.transition = animate
        ? `transform ${DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`
        : 'none';
    track.style.transform = `translateX(-${index * getStepWidth()}px)`;
    if (!animate) void track.offsetWidth; // force reflow
  }

  function resetPosition() {
    currentIndex = getVisible(); // skip past the prepended clones
    setPosition(currentIndex, false);
  }

  function slide(dir) {
    if (isAnimating) return;
    isAnimating = true;

    currentIndex += dir;
    setPosition(currentIndex, true);

    // Use both transitionend and a fallback timeout in case the event misfires
    let done = false;
    function onDone() {
      if (done) return;
      done = true;
      track.removeEventListener('transitionend', onDone);

      const visible  = getVisible();
      const realCount = getOriginals().length;
      const totalWithClones = track.children.length;

      // Snapped past the end? Jump back to the real start
      if (currentIndex >= realCount + visible) {
        currentIndex = visible;
        setPosition(currentIndex, false);
      }

      // Snapped before the start? Jump to the real end
      if (currentIndex < visible) {
        currentIndex = realCount + visible - 1;
        setPosition(currentIndex, false);
      }

      isAnimating = false;
    }

    track.addEventListener('transitionend', onDone);
    setTimeout(onDone, DURATION + 100); // fallback
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(() => slide(1), 5000);
  }

  function stopAutoplay() {
    if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  buildClones();
  resetPosition();

  wrapper.querySelector('.carousel-btn.prev')?.addEventListener('click', () => slide(-1));
  wrapper.querySelector('.carousel-btn.next')?.addEventListener('click', () => slide(1));

  // Pause autoplay on hover/focus
  wrapper.addEventListener('mouseenter', stopAutoplay);
  wrapper.addEventListener('mouseleave', startAutoplay);
  wrapper.addEventListener('focusin',    stopAutoplay);
  wrapper.addEventListener('focusout',   startAutoplay);

  startAutoplay();

  // Touch / swipe
  let touchStartX = 0;
  viewport.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    stopAutoplay();
  }, { passive: true });
  viewport.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) slide(diff > 0 ? 1 : -1);
    startAutoplay();
  });

  // Rebuild on resize (debounced)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      buildClones();
      resetPosition();
    }, 200);
  });
}

// ── GitHub helpers ────────────────────────────────────────────────────────────
function formatUpdatedLabel(dateString) {
  if (!dateString) return 'recently';
  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime())
      ? 'recently'
      : parsed.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function buildLanguageList(primaryLanguage, languages = []) {
  const combined = [...languages];
  if (primaryLanguage && !combined.includes(primaryLanguage)) combined.unshift(primaryLanguage);
  const unique = [];
  combined.forEach(item => { if (item && !unique.includes(item)) unique.push(item); });
  return unique.slice(0, 6);
}

async function fetchLanguages(languagesUrl) {
  if (!languagesUrl) return [];
  try {
    const res = await fetch(languagesUrl, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return Object.keys(data).sort((a, b) => data[b] - data[a]);
  } catch { return []; }
}

async function fetchRepos(username, perPage = 30) {
  const url = `https://api.github.com/users/${username}/repos?sort=updated&per_page=${perPage}&type=owner`;
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('Unable to fetch repos');
  const repos = await response.json();
  return repos.filter(repo => !repo.archived && !repo.fork);
}

async function enrichRepo(repo, username) {
  const languages = await fetchLanguages(repo.languages_url);
  return {
    name: repo.name,
    owner: repo.owner?.login || username,
    description: repo.description || 'No description available yet.',
    language: repo.language,
    updated_at: repo.updated_at || repo.pushed_at,
    html_url: repo.html_url,
    homepage: repo.homepage,
    image: `https://opengraph.githubassets.com/1/${repo.owner?.login || username}/${repo.name}`,
    languages: buildLanguageList(repo.language, languages),
  };
}

function createProjectCard(repo) {
  const card = document.createElement('div');
  card.classList.add('project-card');

  const owner        = repo.owner || 'Aaron-2005';
  const liveLink     = repo.homepage?.trim() || null;
  const updatedLabel = formatUpdatedLabel(repo.updated_at);
  const previewImage = repo.image || `https://opengraph.githubassets.com/1/${owner}/${repo.name}`;
  const tags         = (repo.languages?.length ? repo.languages : [repo.language || 'Multi-lang']).slice(0, 6);
  const tagsMarkup   = tags.map(tag => `<span class="tag-chip">${tag}</span>`).join('');

  card.innerHTML = `
    <div class="project-media">
      <img src="${previewImage}" alt="${repo.name} preview" loading="lazy">
    </div>
    <div class="project-content">
      <div class="project-header">
        <h3>${repo.name}</h3>
        <span class="project-updated">Updated ${updatedLabel}</span>
      </div>
      <p class="project-desc">${repo.description}</p>
      <div class="project-tags">${tagsMarkup}</div>
      <div class="project-actions">
        <a href="${repo.html_url}" target="_blank" class="btn ghost" rel="noreferrer">View repo</a>
        ${liveLink ? `<a href="${liveLink}" target="_blank" class="btn primary" rel="noreferrer">Live link</a>` : ''}
      </div>
    </div>
  `;
  return card;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initSmoothScroll();
  initRevealAnimations();
  initCarousel();
});