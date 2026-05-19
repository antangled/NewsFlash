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
  const sourceCurated = document.getElementById('source-curated');
  const sourcePersonal = document.getElementById('source-personal');
  const twitterConnectBtn = document.getElementById('twitter-connect-btn');
  const twitterStatus = document.getElementById('twitter-status');

  // Admin tab reveal: shift-click Settings tab 5 times
  let settingsShiftClickCount = 0;
  const settingsTab = document.getElementById('settings-tab');
  const adminTab = document.getElementById('admin-tab');

  // Tab switching
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      // Track shift-clicks on Settings tab for admin reveal
      if (tab === settingsTab && e.shiftKey) {
        settingsShiftClickCount++;
        if (settingsShiftClickCount >= 5 && adminTab) {
          adminTab.style.display = '';
          settingsShiftClickCount = 0;
        }
      } else if (tab === settingsTab) {
        settingsShiftClickCount = 0;
      }

      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
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
    loadStories();
  });

  // Toggle bar
  toggleEl.addEventListener('change', () => {
    const updates = { barEnabled: toggleEl.checked };
    if (toggleEl.checked) {
      updates.dismissedDate = null;
    }
    chrome.storage.local.set(updates);
  });

  // Refresh
  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spinning');
    chrome.runtime.sendMessage({ type: 'REFRESH_STORIES' }, (res) => {
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
        if (!res || !res.ok) {
          const origColor = refreshBtn.style.color;
          refreshBtn.style.color = '#f87171';
          setTimeout(() => { refreshBtn.style.color = origColor; }, 1000);
        }
        loadStories();
      }, 800);
    });
  });

  // Upsell click
  upsellEl.addEventListener('click', () => {
    if (!confirm('Demo mode: This will enable Pro features for free. Continue?')) return;
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

  // ── Source Picker Logic ──
  function selectSource(source, skipRefresh) {
    if (source === 'curated') {
      sourceCurated.classList.add('selected');
      sourcePersonal.classList.remove('selected');
    } else {
      sourcePersonal.classList.add('selected');
      sourceCurated.classList.remove('selected');
    }
    chrome.storage.local.set({ feedSource: source });
    if (!skipRefresh) {
      chrome.runtime.sendMessage({ type: 'REFRESH_STORIES' }, () => {
        loadStories();
      });
    }
  }

  function updateTwitterUI(connected, handle) {
    if (connected && handle) {
      twitterStatus.innerHTML = `
        <div class="twitter-connected">
          <span class="twitter-handle">@${escapeHtml(handle)} Connected &#10003;</span>
          <span class="twitter-disconnect" id="twitter-disconnect-link">Disconnect</span>
        </div>
      `;
      const disconnectLink = document.getElementById('twitter-disconnect-link');
      if (disconnectLink) {
        disconnectLink.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: 'DISCONNECT_TWITTER' }, () => {
            updateTwitterUI(false, null);
            selectSource('curated');
          });
        });
      }
    } else {
      twitterStatus.innerHTML = `
        <button class="twitter-connect-btn" id="twitter-connect-btn">
          <span class="twitter-icon" style="font-weight:900; font-size:14px;">X</span>
          Connect Twitter
        </button>
        <div id="twitter-error" style="color: #f87171; font-size: 11px; margin-top: 6px; display: none;"></div>
      `;
      const btn = document.getElementById('twitter-connect-btn');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const errEl = document.getElementById('twitter-error');
          if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
          btn.textContent = 'Connecting...';
          btn.disabled = true;
          chrome.runtime.sendMessage({ type: 'START_TWITTER_OAUTH' }, (res) => {
            if (res && res.ok) {
              updateTwitterUI(true, res.handle);
              selectSource('personal');
            } else {
              btn.innerHTML = '<span class="twitter-icon" style="font-weight:900; font-size:14px;">X</span> Connect Twitter';
              btn.disabled = false;
              const errEl2 = document.getElementById('twitter-error');
              if (errEl2) {
                errEl2.textContent = 'Connection failed. Make sure the backend is running.';
                errEl2.style.display = 'block';
              }
            }
          });
        });
      }
    }
  }

  sourceCurated.addEventListener('click', () => selectSource('curated'));
  sourcePersonal.addEventListener('click', () => {
    chrome.storage.local.get(['twitterConnected', 'twitterHandle'], (data) => {
      if (data.twitterConnected) {
        selectSource('personal');
      } else {
        // Pulse the connect button to draw attention
        const connectBtn = document.getElementById('twitter-connect-btn');
        if (connectBtn) {
          connectBtn.classList.remove('pulse');
          // Force reflow to restart animation
          void connectBtn.offsetWidth;
          connectBtn.classList.add('pulse');
          setTimeout(() => connectBtn.classList.remove('pulse'), 600);
        }
      }
    });
  });

  // Load saved source selection and Twitter state
  chrome.storage.local.get(['feedSource', 'twitterConnected', 'twitterHandle'], (data) => {
    const source = data.feedSource || 'curated';
    selectSource(source, true);
    updateTwitterUI(data.twitterConnected || false, data.twitterHandle || null);
  });

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

  // Set default date immediately
  dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Load stories
  function loadStories() {
    storiesEl.innerHTML = '<div style="padding: 24px; text-align: center; color: #555; font-size: 12px;">Loading stories...</div>';
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
        div.setAttribute('tabindex', '0');
        div.setAttribute('role', 'button');
        div.setAttribute('aria-expanded', 'false');

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

        function toggleStory() {
          div.classList.toggle('open');
          div.setAttribute('aria-expanded', div.classList.contains('open') ? 'true' : 'false');
        }

        div.addEventListener('click', toggleStory);
        div.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleStory();
          }
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
