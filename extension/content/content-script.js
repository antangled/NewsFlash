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
    host.style.cssText = 'all:initial; position:fixed; bottom:0; left:0; right:0; z-index:2147483647; pointer-events:none;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getStyles();
    shadow.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'nf-bar';
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

    // Left accent
    const accent = el('div', 'nf-accent');
    inner.appendChild(accent);

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

    // Dismiss
    dismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      bar.classList.remove('nf-visible');
      setTimeout(() => host.remove(), 400);
      chrome.runtime.sendMessage({ type: 'DISMISS_TODAY' });
    });

    // Keyboard: Escape to dismiss
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('newsflash-host')) {
        bar.classList.remove('nf-visible');
        setTimeout(() => host.remove(), 400);
        chrome.runtime.sendMessage({ type: 'DISMISS_TODAY' });
      }
    });

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
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  pointer-events: auto;
  transform: translateY(100%);
  opacity: 0;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.4s ease;
  z-index: 2147483647;
}

.nf-bar.nf-visible {
  transform: translateY(0);
  opacity: 1;
}

/* ── Inner bar ────────────────────────────── */
.nf-inner {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 16px 0 0;
  background: rgba(12, 12, 20, 0.88);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-top: 1px solid rgba(123, 104, 238, 0.15);
  color: #d0cfe0;
  gap: 10px;
}

/* ── Accent line ──────────────────────────── */
.nf-accent {
  width: 3px;
  height: 100%;
  background: linear-gradient(180deg, #7b68ee 0%, #a78bfa 50%, #7b68ee 100%);
  flex-shrink: 0;
  border-radius: 0 2px 2px 0;
}

/* ── Brand ────────────────────────────────── */
.nf-brand {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 3px 8px;
  background: rgba(123, 104, 238, 0.12);
  border-radius: 6px;
  margin-left: 10px;
}

.nf-brand-icon {
  font-size: 11px;
  line-height: 1;
}

.nf-brand-text {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: #7b68ee;
  text-transform: uppercase;
}

/* ── Counter ──────────────────────────────── */
.nf-counter {
  font-size: 11px;
  color: #555;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  min-width: 28px;
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
  font-weight: 500;
  font-size: 13px;
  color: #e2e0f0;
  opacity: 1;
  transition: opacity 0.3s ease;
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
  gap: 4px;
  flex-shrink: 0;
  padding: 0 4px;
}

.nf-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  transition: background 0.3s ease, transform 0.3s ease;
  cursor: pointer;
}

.nf-dot.active {
  background: #7b68ee;
  transform: scale(1.3);
}

.nf-dot:hover {
  background: rgba(123, 104, 238, 0.5);
}

/* ── Dismiss ──────────────────────────────── */
.nf-dismiss {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  font-size: 11px;
  color: #555;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
}

.nf-dismiss:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #aaa;
}

/* ── Expanded panel ───────────────────────── */
.nf-expand {
  max-height: 0;
  overflow: hidden;
  background: rgba(12, 12, 20, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 0 16px 0 52px;
  transition: max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1),
              padding 0.35s ease;
}

.nf-bar.nf-expanded .nf-expand {
  max-height: 120px;
  padding: 8px 16px 12px 52px;
}

.nf-detail {
  font-size: 12px;
  color: #999;
  line-height: 1.6;
  margin-bottom: 4px;
}

.nf-sources {
  font-size: 11px;
  color: #6b68a8;
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
