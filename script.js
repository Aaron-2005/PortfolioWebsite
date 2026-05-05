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
  const track     = document.getElementById('projects-list');
  const viewport  = track?.closest('.carousel-viewport');
  const wrapper   = track?.closest('.carousel-wrapper');
  if (!track || !viewport || !wrapper) return;

  const VISIBLE   = 4;          // cards visible at once
  const GAP       = 16;         // px — must match CSS gap
  const DURATION  = 320;        // ms transition

  let isAnimating = false;

  function cardWidth() {
    return (viewport.offsetWidth - GAP * (VISIBLE - 1)) / VISIBLE;
  }

  function stepWidth() {
    return cardWidth() + GAP;
  }

  // Clone enough cards for seamless looping
  function buildClones() {
    // Remove old clones
    track.querySelectorAll('.clone').forEach(c => c.remove());

    const originals = Array.from(track.children);
    const count     = originals.length;
    if (!count) return;

    // Append VISIBLE clones of the start at the end, and of the end at the start
    for (let i = 0; i < VISIBLE; i++) {
      const head = originals[i % count].cloneNode(true);
      head.classList.add('clone');
      track.appendChild(head);

      const tail = originals[count - 1 - (i % count)].cloneNode(true);
      tail.classList.add('clone');
      track.insertBefore(tail, track.firstChild);
    }
  }

  // Jump to real start (after head clones) — no animation
  function resetToStart(noTransition = true) {
    if (noTransition) track.style.transition = 'none';
    currentIndex = VISIBLE;
    track.style.transform = `translateX(-${currentIndex * stepWidth()}px)`;
    if (noTransition) {
      // Force reflow so transition: none takes effect before re-enabling
      void track.offsetWidth;
      track.style.transition = '';
    }
  }

  let currentIndex = VISIBLE; // start after head clones

  function applyTransform(index, animate = true) {
    track.style.transition = animate ? `transform ${DURATION}ms cubic-bezier(0.4,0,0.2,1)` : 'none';
    track.style.transform  = `translateX(-${index * stepWidth()}px)`;
  }

  function slide(direction) {
    if (isAnimating) return;
    isAnimating = true;

    currentIndex += direction;
    applyTransform(currentIndex);

    track.addEventListener('transitionend', function onEnd() {
      track.removeEventListener('transitionend', onEnd);

      const origCount = track.children.length - VISIBLE * 2;

      // Jumped past real end → snap to real start
      if (currentIndex >= origCount + VISIBLE) {
        currentIndex = VISIBLE;
        applyTransform(currentIndex, false);
      }
      // Jumped before real start → snap to real end
      if (currentIndex < VISIBLE) {
        currentIndex = origCount + VISIBLE - 1;
        applyTransform(currentIndex, false);
      }

      isAnimating = false;
    });
  }

  // Build clones, set initial position, wire buttons
  buildClones();
  resetToStart();

  wrapper.querySelector('.carousel-btn.prev')?.addEventListener('click', () => slide(-1));
  wrapper.querySelector('.carousel-btn.next')?.addEventListener('click', () => slide(1));

  // Rebuild on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      buildClones();
      resetToStart();
    }, 200);
  });

  // Auto-advance every 5 s
  let autoplay = setInterval(() => slide(1), 5000);
  wrapper.addEventListener('mouseenter', () => clearInterval(autoplay));
  wrapper.addEventListener('mouseleave', () => { autoplay = setInterval(() => slide(1), 5000); });

  // Touch / swipe support
  let touchStartX = 0;
  viewport.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  viewport.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) slide(diff > 0 ? 1 : -1);
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

  // Carousel initialises on the static cards already in the DOM,
  // then optionally enriches with live GitHub data.
  initCarousel();

  // Optionally refresh cards from GitHub (uncomment + fill featured list to use)
  // loadGitHubProjects();
});