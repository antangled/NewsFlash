document.addEventListener('DOMContentLoaded', () => {
  const storiesEl = document.getElementById('stories');
  const dateEl = document.getElementById('date');
  const toggleEl = document.getElementById('toggle');
  const onboardingEl = document.getElementById('onboarding');
  const onboardingBtn = document.getElementById('onboarding-btn');
  const mainContent = document.getElementById('main-content');
  const tierBadge = document.getElementById('tier-badge');
  const upsellEl = document.getElementById('upsell');
  const seedNotice = document.getElementById('seed-notice');
  const refreshBtn = document.getElementById('refresh-btn');
  const footerInfo = document.getElementById('footer-info');
  const archiveContent = document.getElementById('archive-content');
  const archiveUpgrade = document.getElementById('archive-upgrade');

  // Tab switching
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Check onboarding state
  chrome.storage.local.get(['onboardingShown', 'tier', 'barEnabled'], (data) => {
    if (!data.onboardingShown) {
      onboardingEl.classList.remove('hidden');
      mainContent.style.display = 'none';
    } else {
      onboardingEl.classList.add('hidden');
      mainContent.style.display = 'block';
    }

    // Set toggle state
    toggleEl.checked = data.barEnabled !== false;

    // Set tier UI
    updateTierUI(data.tier || 'free');
  });

  // Onboarding complete
  onboardingBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ONBOARDING_COMPLETE' });
    onboardingEl.classList.add('hidden');
    mainContent.style.display = 'block';
  });

  // Toggle bar
  toggleEl.addEventListener('change', () => {
    chrome.storage.local.set({ barEnabled: toggleEl.checked });
  });

  // Refresh
  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spinning');
    chrome.runtime.sendMessage({ type: 'REFRESH_STORIES' }, () => {
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
        loadStories();
      }, 800);
    });
  });

  // Upsell click
  upsellEl.addEventListener('click', () => {
    // For MVP: toggle to pro for demo purposes
    chrome.runtime.sendMessage({ type: 'SET_TIER', tier: 'pro' }, () => {
      updateTierUI('pro');
      loadStories();
    });
  });

  // Archive upgrade link
  if (archiveUpgrade) {
    archiveUpgrade.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SET_TIER', tier: 'pro' }, () => {
        updateTierUI('pro');
      });
    });
  }

  function updateTierUI(tier) {
    if (tier === 'pro') {
      tierBadge.textContent = 'PRO';
      tierBadge.classList.add('pro');
      upsellEl.classList.add('hidden');
      footerInfo.textContent = '10 stories/day';

      // Unlock archive
      if (archiveContent) {
        archiveContent.innerHTML = `
          <div style="text-align:center; padding:24px; color:#666; font-size:12px;">
            <div style="font-size:20px; margin-bottom:8px; opacity:0.5;">&#128197;</div>
            <div>Archive shows past 30 days of stories.</div>
            <div style="margin-top:6px; color:#888;">Coming soon with full backend integration.</div>
          </div>
        `;
      }
    } else {
      tierBadge.textContent = 'FREE';
      tierBadge.classList.remove('pro');
      upsellEl.classList.remove('hidden');
      footerInfo.textContent = '5 stories/day';
    }
  }

  // Load stories
  function loadStories() {
    chrome.runtime.sendMessage({ type: 'GET_STORIES' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        storiesEl.innerHTML = `
          <div class="empty">
            <div class="empty-icon">&#128225;</div>
            <div class="empty-title">Could not load stories</div>
            <div class="empty-desc">Check your connection and try refreshing.</div>
          </div>
        `;
        return;
      }

      // Show seed notice if using fallback data
      if (response.isSeedData) {
        seedNotice.classList.add('visible');
      } else {
        seedNotice.classList.remove('visible');
      }

      // Format date
      if (response.storiesDate) {
        const d = new Date(response.storiesDate + 'T00:00:00');
        dateEl.textContent = d.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      }

      const stories = response.stories;
      if (!stories || stories.length === 0) {
        storiesEl.innerHTML = `
          <div class="empty">
            <div class="empty-icon">&#9889;</div>
            <div class="empty-title">No stories yet today</div>
            <div class="empty-desc">Headlines will appear when the next digest runs.</div>
          </div>
        `;
        return;
      }

      // Clear badge when popup opens
      chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' });

      storiesEl.innerHTML = '';

      stories.forEach((story, index) => {
        const div = document.createElement('div');
        div.className = 'story';
        div.style.opacity = '0';

        const sourcesHtml = story.sources
          ? story.sources
              .map((s) => `<span class="source-tag">@${escapeHtml(s.handle)}</span>`)
              .join('')
          : '';

        div.innerHTML = `
          <div class="story-header">
            <span class="story-rank">${story.rank}</span>
            <span class="story-headline">${escapeHtml(story.headline)}</span>
          </div>
          <span class="story-expand-indicator">&#9660;</span>
          <div class="story-body">
            <div class="story-detail">${escapeHtml(story.detail || '')}</div>
            <div class="story-sources">${sourcesHtml}</div>
          </div>
        `;

        div.addEventListener('click', () => {
          div.classList.toggle('open');
        });

        storiesEl.appendChild(div);

        if (index < stories.length - 1) {
          const divider = document.createElement('div');
          divider.className = 'story-divider';
          storiesEl.appendChild(divider);
        }
      });
    });
  }

  // ── Admin: Trigger Test Flash ──
  const testFlashBtn = document.getElementById('admin-test-flash');
  const flashStatus = document.getElementById('admin-flash-status');

  testFlashBtn.addEventListener('click', () => {
    flashStatus.textContent = 'Injecting test stories...';
    flashStatus.className = 'admin-status';

    chrome.runtime.sendMessage({ type: 'TRIGGER_TEST_FLASH' }, (res) => {
      if (chrome.runtime.lastError) {
        flashStatus.textContent = 'Error: ' + chrome.runtime.lastError.message;
        flashStatus.className = 'admin-status err';
        return;
      }
      flashStatus.textContent = `Done — ${res.count} stories injected. Opening test tab...`;
      flashStatus.className = 'admin-status ok';
      loadStories();

      // Open a fresh tab so the content script loads with the test stories
      chrome.tabs.create({ url: 'https://www.google.com' });
    });
  });

  // ── Admin: Reset Dismissal ──
  const resetDismissBtn = document.getElementById('admin-reset-dismiss');
  const resetStatus = document.getElementById('admin-reset-status');

  resetDismissBtn.addEventListener('click', () => {
    chrome.storage.local.set({ dismissedDate: null }, () => {
      resetStatus.textContent = 'Dismissal cleared. Bar will reappear on page load.';
      resetStatus.className = 'admin-status ok';
    });
  });

  loadStories();
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
