// Smooth scroll for anchor links
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

// Reveal on scroll (with fallback: show content even if observer not supported)
function initRevealAnimations() {
  const revealEls = Array.from(document.querySelectorAll('.reveal'));

  // Fallback for older browsers or any weird env: just show everything
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

const projectSkeletonCard = `
  <div class="project-card skeleton">
    <div class="project-media"></div>
    <div class="project-content">
      <div class="line title"></div>
      <div class="line"></div>
      <div class="line short"></div>
    </div>
  </div>
`;

function renderProjectSkeletons(container, count = 4) {
  container.innerHTML = Array.from({ length: count })
    .map(() => projectSkeletonCard)
    .join('');
}

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
  combined.forEach(item => {
    if (item && !unique.includes(item)) unique.push(item);
  });

  return unique.slice(0, 6);
}

async function fetchLanguages(languagesUrl) {
  if (!languagesUrl) return [];
  try {
    const res = await fetch(languagesUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Object.keys(data).sort((a, b) => data[b] - data[a]);
  } catch (error) {
    console.error(error);
    return [];
  }
}

// Fetch more than you need, then filter down
async function fetchRepos(username, perPage = 30) {
  const url = `https://api.github.com/users/${username}/repos?sort=updated&per_page=${perPage}&type=owner`;
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
  });

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
  card.classList.add('project-card', 'reveal');

  const owner = repo.owner || 'Aaron-2005';
  const liveLink = repo.homepage && repo.homepage.trim() !== '' ? repo.homepage : null;
  const updatedLabel = formatUpdatedLabel(repo.updated_at);
  const previewImage = repo.image || `https://opengraph.githubassets.com/1/${owner}/${repo.name}`;
  const tags = (repo.languages && repo.languages.length ? repo.languages : [repo.language || 'Multi-lang']).slice(0, 6);
  const tagsMarkup = tags.map(tag => `<span class="tag-chip">${tag}</span>`).join('');

  card.innerHTML = `
    <div class="project-media">
      <img src="${previewImage}" alt="${repo.name} preview" loading="lazy">
    </div>
    <div class="project-content">
      <div class="project-header">
        <h3>${repo.name}</h3>
        <span class="project-updated">Updated ${updatedLabel}</span>
      </div>
      <p class="project-desc">${repo.description || 'No description available yet.'}</p>
      <div class="project-tags">
        ${tagsMarkup}
      </div>
      <div class="project-actions">
        <a href="${repo.html_url}" target="_blank" class="btn ghost" rel="noreferrer">View repo</a>
        ${liveLink ? `<a href="${liveLink}" target="_blank" class="btn primary" rel="noreferrer">Live link</a>` : ''}
      </div>
    </div>
  `;
  return card;
}

async function loadGitHubProjects(revealObserver) {
  const container = document.getElementById('projects-list');
  if (!container) return;

  renderProjectSkeletons(container, 4);

  try {
    const username = 'Aaron-2005';

    // 👇 Put your favourite repos here (exact names), in the order you want them shown.
    // If you leave it empty, it will just show your 4 most recently updated repos.
    const featured = [
      // 'PortfolioWebsite',
      // 'your-platformer-repo',
      // 'your-hpc-repo',
      // 'another-repo'
    ];

    const raw = await fetchRepos(username, 50);

    let selected;
    if (featured.length) {
      const byName = new Map(raw.map(r => [r.name.toLowerCase(), r]));
      selected = featured
        .map(name => byName.get(String(name).toLowerCase()))
        .filter(Boolean);
    } else {
      selected = raw.slice(0, 4);
    }

    // Limit to 4 cards
    selected = selected.slice(0, 4);

    // Enrich (languages, image, etc.)
    const repos = await Promise.all(selected.map(repo => enrichRepo(repo, username)));

    if (!repos.length) {
      container.innerHTML = '<p class="muted">No projects to show right now.</p>';
      return;
    }

    container.innerHTML = '';
    repos.forEach(repo => {
      const card = createProjectCard(repo);
      container.appendChild(card);
      if (revealObserver) revealObserver.observe(card);
      else card.classList.add('visible'); // fallback show
    });
  } catch (error) {
    container.innerHTML = `
      <div class="project-card error-card">
        <h3>Could not load recent projects</h3>
        <p class="muted">Please check your connection or GitHub rate limits and try again.</p>
      </div>
    `;
    console.error(error);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initSmoothScroll();
  const revealObserver = initRevealAnimations();
  loadGitHubProjects(revealObserver);
});
