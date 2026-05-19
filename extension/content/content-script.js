(function () {
  // Prevent double-injection
  if (document.getElementById('newsflash-host')) return;

  // Listen for refresh signal from service worker (e.g., test flash trigger)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'REFRESH_BAR') {
      const existing = document.getElementById('newsflash-host');
      if (existing) existing.remove();

      chrome.runtime.sendMessage({ type: 'GET_STORIES' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (!response) return;
        const stories = response.stories;
        if (!stories || stories.length === 0) return;
        injectBar(stories, response.tier || 'free');
      });
    }
  });

  // Check if bar is enabled and not dismissed
  chrome.storage.local.get(['barEnabled'], (settings) => {
    console.log('[NewsFlash] barEnabled check:', settings, 'lastError:', chrome.runtime.lastError);
    if (chrome.runtime.lastError) return;
    if (settings.barEnabled === false) return;

    chrome.runtime.sendMessage({ type: 'GET_STORIES' }, (response) => {
      console.log('[NewsFlash] GET_STORIES response:', response, 'lastError:', chrome.runtime.lastError);
      if (chrome.runtime.lastError) return;
      if (!response) return;

      const today = new Date().toISOString().split('T')[0];
      console.log('[NewsFlash] dismissedDate:', response.dismissedDate, 'today:', today);
      if (response.dismissedDate === today) return;

      const stories = response.stories;
      console.log('[NewsFlash] stories count:', stories ? stories.length : 0);
      if (!stories || stories.length === 0) return;

      injectBar(stories, response.tier || 'free');
    });
  });

  function injectBar(stories, tier) {
    const host = document.createElement('div');
    host.id = 'newsflash-host';
    host.style.cssText = 'all:initial; position:fixed; bottom:16px; left:16px; right:16px; z-index:2147483647; pointer-events:none;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getStyles();
    shadow.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'nf-bar';
    bar.setAttribute('aria-label', 'NewsFlash news bar');
    shadow.appendChild(bar);

    // Slide-in animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.classList.add('nf-visible');
      });
    });

    initBar(bar, stories, tier, host);
  }

  function initBar(bar, stories, tier, host) {
    let currentIndex = 0;
    let cycleTimer = null;
    let isExpanded = false;
    const CYCLE_MS = 6000;
    // Limit free tier to 5 stories in the bar
    const maxStories = tier === 'pro' ? stories.length : Math.min(stories.length, 5);
    const displayStories = stories.slice(0, maxStories);

    // Build structure
    const inner = el('div', 'nf-inner');

    // Brand pill
    const brand = el('div', 'nf-brand');
    const brandIcon = el('span', 'nf-brand-icon', '\u26A1');
    const brandText = el('span', 'nf-brand-text', 'NF');
    brand.appendChild(brandIcon);
    brand.appendChild(brandText);
    inner.appendChild(brand);

    // Counter
    const counter = el('span', 'nf-counter');
    inner.appendChild(counter);

    // Headline area
    const headlineWrap = el('div', 'nf-headline-wrap');
    headlineWrap.setAttribute('aria-live', 'polite');
    headlineWrap.setAttribute('role', 'status');
    const headline = el('span', 'nf-headline');
    headlineWrap.appendChild(headline);
    inner.appendChild(headlineWrap);

    // Dots
    const dotsWrap = el('div', 'nf-dots');
    const dots = displayStories.map(() => {
      const dot = el('span', 'nf-dot');
      dotsWrap.appendChild(dot);
      return dot;
    });
    inner.appendChild(dotsWrap);

    // Dismiss X
    const dismiss = el('button', 'nf-dismiss');
    dismiss.innerHTML = '&#10005;';
    dismiss.title = 'Dismiss for today';
    dismiss.setAttribute('aria-label', 'Dismiss news bar');
    inner.appendChild(dismiss);

    bar.appendChild(inner);

    // Expanded detail panel
    const expandPanel = el('div', 'nf-expand');
    const detailText = el('div', 'nf-detail');
    const sourceText = el('div', 'nf-sources');
    expandPanel.appendChild(detailText);
    expandPanel.appendChild(sourceText);
    bar.appendChild(expandPanel);

    function showStory(index) {
      const story = displayStories[index];
      headline.classList.add('nf-fading');

      setTimeout(() => {
        counter.textContent = `${index + 1}/${displayStories.length}`;
        headline.textContent = story.headline;
        detailText.textContent = story.detail || '';
        sourceText.textContent = story.sources
          ? story.sources.map((s) => `@${s.handle}`).join('  \u00B7  ')
          : '';
        dots.forEach((d, i) => d.classList.toggle('active', i === index));
        headline.classList.remove('nf-fading');
      }, 300);
    }

    function startCycling() {
      stopCycling();
      cycleTimer = setInterval(() => {
        if (!isExpanded) {
          currentIndex = (currentIndex + 1) % displayStories.length;
          showStory(currentIndex);
        }
      }, CYCLE_MS);
    }

    function stopCycling() {
      if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
      }
    }

    // Click headline to expand
    headlineWrap.addEventListener('click', () => {
      isExpanded = !isExpanded;
      bar.classList.toggle('nf-expanded', isExpanded);
      if (isExpanded) stopCycling();
      else startCycling();
    });

    // Click dots to navigate
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        currentIndex = i;
        showStory(i);
      });
    });

    function dismissBar() {
      bar.classList.remove('nf-visible');
      setTimeout(() => host.remove(), 400);
      chrome.runtime.sendMessage({ type: 'DISMISS_TODAY' });
      document.removeEventListener('keydown', escapeHandler);
    }

    // Dismiss
    dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissBar();
    });

    // Keyboard: Escape to dismiss
    function escapeHandler(e) {
      if (e.key === 'Escape' && document.getElementById('newsflash-host')) {
        dismissBar();
      }
    }
    document.addEventListener('keydown', escapeHandler);

    showStory(0);
    startCycling();
  }

  function el(tag, className, text) {
    const e = document.createElement(tag);
    e.className = className;
    if (text) e.textContent = text;
    return e;
  }

  function getStyles() {
    return `
/* ── Base ─────────────────────────────────── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.nf-bar {
  position: relative;
  bottom: auto;
  left: auto;
  right: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  pointer-events: auto;
  transform: translateY(calc(100% + 32px));
  opacity: 0;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.4s ease;
  z-index: 2147483647;
}

.nf-bar.nf-visible {
  transform: translateY(0);
  opacity: 1;
}

/* ── Inner bar (frosted glass) ───────────── */
.nf-inner {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 20px;
  background: rgba(15, 15, 25, 0.65);
  backdrop-filter: blur(50px) saturate(1.8);
  -webkit-backdrop-filter: blur(50px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 18px;
  color: #fff;
  gap: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 2px 8px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

/* ── Brand ────────────────────────────────── */
.nf-brand {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 4px 10px;
  background: rgba(123, 104, 238, 0.22);
  border: 1px solid rgba(123, 104, 238, 0.18);
  border-radius: 9px;
}

.nf-brand-icon {
  font-size: 13px;
  line-height: 1;
}

.nf-brand-text {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: #b8a9ff;
  text-transform: uppercase;
}

/* ── Counter ──────────────────────────────── */
.nf-counter {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  min-width: 30px;
}

/* ── Headline ─────────────────────────────── */
.nf-headline-wrap {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  padding: 4px 0;
}

.nf-headline {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.1px;
  color: #fff;
  opacity: 1;
  transition: opacity 0.3s ease;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.nf-headline.nf-fading {
  opacity: 0;
}

.nf-headline-wrap:hover .nf-headline {
  color: #fff;
}

/* ── Dots ─────────────────────────────────── */
.nf-dots {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
  padding: 0 4px;
}

.nf-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  transition: background 0.3s ease, transform 0.3s ease;
  cursor: pointer;
}

.nf-dot.active {
  background: rgba(255, 255, 255, 0.85);
  transform: scale(1.3);
}

.nf-dot:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* ── Dismiss ──────────────────────────────── */
.nf-dismiss {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
}

.nf-dismiss:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);
}

/* ── Expanded panel ───────────────────────── */
.nf-expand {
  max-height: 0;
  overflow: hidden;
  padding: 0 16px 0 16px;
  transition: max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1),
              padding 0.35s ease;
}

.nf-bar.nf-expanded .nf-inner {
  border-radius: 16px 16px 0 0;
}

.nf-bar.nf-expanded .nf-expand {
  max-height: 120px;
  margin-top: -1px;
  padding: 8px 16px 14px 16px;
  background: rgba(15, 15, 25, 0.70);
  backdrop-filter: blur(50px) saturate(1.8);
  -webkit-backdrop-filter: blur(50px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-top: none;
  border-radius: 0 0 16px 16px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 2px 8px rgba(0, 0, 0, 0.2);
}

.nf-detail {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
  margin-bottom: 4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.nf-sources {
  font-size: 12px;
  color: rgba(180, 170, 255, 0.75);
  letter-spacing: 0.2px;
}

/* ── Responsive: hide on very narrow screens */
@media (max-width: 480px) {
  .nf-brand-text { display: none; }
  .nf-counter { display: none; }
  .nf-dots { display: none; }
}
`;
  }
})();
