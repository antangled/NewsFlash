const API_BASE = 'http://localhost:3000';
const API_KEY = 'dev-key';

// Fallback stories so users NEVER see an empty state
const SEED_STORIES = [
  {
    rank: 1,
    headline: 'OpenAI launches GPT-5 with real-time reasoning capabilities',
    detail: 'The new model demonstrates significant improvements in multi-step reasoning and can process real-time data streams. OpenAI claims a 3x improvement in complex task completion over GPT-4o.',
    sources: [{ handle: 'sama' }, { handle: 'OpenAI' }, { handle: 'rowancheung' }],
  },
  {
    rank: 2,
    headline: 'Anthropic raises $5B Series D at $60B valuation',
    detail: 'The round was led by Lightspeed Venture Partners with participation from Google and Spark Capital. The funding will accelerate Claude model development and enterprise deployment.',
    sources: [{ handle: 'DarioAmodei' }, { handle: 'AnthropicAI' }],
  },
  {
    rank: 3,
    headline: 'NVIDIA unveils Blackwell Ultra GPU with 2x inference throughput',
    detail: 'Jensen Huang announced the next-generation chip at GTC, promising dramatic cost reductions for AI inference workloads.',
    sources: [{ handle: 'JensenHuang' }, { handle: 'nvidia' }],
  },
  {
    rank: 4,
    headline: 'Apple acquires AI startup for $2B to boost Siri intelligence',
    detail: 'The acquisition targets on-device language model capabilities for iOS 20. Sources say the deal will integrate 200 ML engineers into Apple\'s AI division.',
    sources: [{ handle: 'markgurman' }, { handle: 'Apple' }],
  },
  {
    rank: 5,
    headline: 'Stripe launches AI-powered fraud detection reducing false declines 40%',
    detail: 'The new system uses transaction graph neural networks trained on Stripe\'s massive payment dataset.',
    sources: [{ handle: 'patrickc' }, { handle: 'stripe' }],
  },
];

chrome.runtime.onInstalled.addListener(() => {
  console.log('[NewsFlash] Extension installed');

  // Set defaults
  chrome.storage.local.get(['tier', 'onboardingShown'], (data) => {
    if (!data.tier) {
      chrome.storage.local.set({
        tier: 'free',
        onboardingShown: false,
        barEnabled: true,
        installedAt: Date.now(),
      });
    }
  });

  // Pre-load seed stories immediately so there's never an empty state
  chrome.storage.local.get(['stories'], (data) => {
    if (!data.stories || data.stories.length === 0) {
      chrome.storage.local.set({
        stories: SEED_STORIES,
        storiesDate: new Date().toISOString().split('T')[0],
        fetchedAt: Date.now(),
        isSeedData: true,
      });
    }
  });

  // Then try to fetch real stories
  fetchAndStoreStories();
  chrome.alarms.create('periodic-fetch', { periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodic-fetch') {
    fetchAndStoreStories();
  }
});

async function fetchAndStoreStories() {
  try {
    // Read the user's tier and feed source from storage
    const storage = await chrome.storage.local.get(['tier', 'feedSource', 'twitterAccessToken']);
    const userTier = storage.tier || 'free';
    const feedSource = storage.feedSource || 'curated';

    let res;
    if (feedSource === 'personal' && storage.twitterAccessToken) {
      // Fetch personal stories using Twitter access token
      res = await fetch(`${API_BASE}/api/stories/personal`, {
        headers: { Authorization: `Bearer ${storage.twitterAccessToken}` },
      });
    } else {
      // Default: fetch curated stories
      res = await fetch(`${API_BASE}/api/stories/today`, {
        headers: {
          'X-NewsFlash-Key': API_KEY,
          'X-NewsFlash-Tier': userTier,
        },
      });
    }

    if (!res.ok) {
      console.error('[NewsFlash] API returned', res.status);
      return;
    }

    const data = await res.json();
    const stories = data.stories || [];

    // If personal feed returned a fallback, log it
    if (data.fallback) {
      console.warn('[NewsFlash] Personal feed fallback:', data.reason);
    }

    if (stories.length > 0) {
      await chrome.storage.local.set({
        stories: stories,
        storiesDate: data.date,
        fetchedAt: Date.now(),
        isSeedData: false,
      });
      console.log('[NewsFlash] Stories updated:', stories.length);

      // Check for breaking news (score > 0.95) and notify pro users
      checkBreakingNews(stories);
    }
  } catch (err) {
    console.error('[NewsFlash] Fetch failed:', err);
  }
}

function checkBreakingNews(stories) {
  chrome.storage.local.get(['tier', 'lastBreakingAlert'], (data) => {
    if (data.tier !== 'pro') return;

    const breaking = stories.find(
      (s) => s.cluster_score > 0.95 || s.rank === 1
    );
    if (!breaking) return;

    const alertKey = breaking.headline;
    if (data.lastBreakingAlert === alertKey) return;

    // Set badge for breaking news
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#7b68ee' });

    chrome.storage.local.set({ lastBreakingAlert: alertKey });
  });
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STORIES') {
    chrome.storage.local.get(
      ['stories', 'storiesDate', 'dismissedDate', 'tier', 'isSeedData'],
      (data) => {
        sendResponse(data);
      }
    );
    return true;
  }

  if (msg.type === 'DISMISS_TODAY') {
    const today = new Date().toISOString().split('T')[0];
    chrome.storage.local.set({ dismissedDate: today });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'REFRESH_STORIES') {
    fetchAndStoreStories().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'GET_TIER') {
    chrome.storage.local.get(['tier', 'installedAt'], (data) => {
      sendResponse(data);
    });
    return true;
  }

  if (msg.type === 'SET_TIER') {
    chrome.storage.local.set({ tier: msg.tier });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'CLEAR_BADGE') {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'ONBOARDING_COMPLETE') {
    chrome.storage.local.set({ onboardingShown: true });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'START_TWITTER_OAUTH') {
    (async () => {
      try {
        // 1. Get the auth URL from backend
        const res = await fetch(`${API_BASE}/api/auth/twitter`);
        if (!res.ok) {
          sendResponse({ ok: false, error: 'Failed to get auth URL' });
          return;
        }
        const { url } = await res.json();

        // 2. Open the auth URL in a new tab
        const authTab = await chrome.tabs.create({ url });

        // 3. Listen for the callback tab to redirect with nf_callback param
        const listener = async (tabId, changeInfo, tab) => {
          if (tabId !== authTab.id || changeInfo.status !== 'complete') return;
          if (!tab.url) return;

          let tabUrl;
          try { tabUrl = new URL(tab.url); } catch { return; }

          const code = tabUrl.searchParams.get('code');
          const state = tabUrl.searchParams.get('state');
          const nfCallback = tabUrl.searchParams.get('nf_callback');

          if (!nfCallback || !code || !state) return;

          // Remove the listener
          chrome.tabs.onUpdated.removeListener(listener);

          try {
            // 4. Exchange the code for tokens
            const tokenRes = await fetch(`${API_BASE}/api/auth/twitter/token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code, state }),
            });

            if (!tokenRes.ok) {
              sendResponse({ ok: false, error: 'Token exchange failed' });
              chrome.tabs.remove(tabId).catch(() => {});
              return;
            }

            const tokenData = await tokenRes.json();

            // 5. Store twitter credentials
            await chrome.storage.local.set({
              twitterConnected: true,
              twitterHandle: tokenData.handle,
              twitterAccessToken: tokenData.accessToken,
              twitterRefreshToken: tokenData.refreshToken,
            });

            // 6. Close the auth tab
            chrome.tabs.remove(tabId).catch(() => {});

            sendResponse({ ok: true, handle: tokenData.handle });
          } catch (err) {
            console.error('[NewsFlash] OAuth token exchange error:', err);
            sendResponse({ ok: false, error: 'Token exchange failed' });
            chrome.tabs.remove(tabId).catch(() => {});
          }
        };

        chrome.tabs.onUpdated.addListener(listener);

        // Safety: remove listener after 5 minutes to prevent leaks
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
        }, 5 * 60 * 1000);
      } catch (err) {
        console.error('[NewsFlash] OAuth start error:', err);
        sendResponse({ ok: false, error: 'Failed to start OAuth' });
      }
    })();
    return true;
  }

  if (msg.type === 'DISCONNECT_TWITTER') {
    (async () => {
      try {
        await fetch(`${API_BASE}/api/auth/twitter/disconnect`, { method: 'POST' });
      } catch (err) {
        console.error('[NewsFlash] Disconnect API error:', err);
      }
      await chrome.storage.local.set({
        twitterConnected: false,
        twitterHandle: null,
        twitterAccessToken: null,
        twitterRefreshToken: null,
        feedSource: 'curated',
      });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'TRIGGER_TEST_FLASH') {
    const testStories = [
      {
        rank: 1,
        headline: '[TEST] Breaking: Major AI breakthrough announced at surprise keynote',
        detail: 'This is a test story injected by the NewsFlash test harness. If you can see this in the bottom bar, the extension is working correctly.',
        sources: [{ handle: 'test' }, { handle: 'newsflash' }],
        cluster_score: 0.99,
      },
      {
        rank: 2,
        headline: '[TEST] Startup raises record seed round for quantum computing OS',
        detail: 'Another test story. The bottom bar should cycle through these every 6 seconds. Click a headline to expand details.',
        sources: [{ handle: 'demo' }],
        cluster_score: 0.85,
      },
      {
        rank: 3,
        headline: '[TEST] New open-source model tops benchmarks, available today',
        detail: 'Third test story. You can dismiss the bar with the X button or press Escape. It will reappear next time you trigger the test.',
        sources: [{ handle: 'sample' }, { handle: 'oss' }],
        cluster_score: 0.78,
      },
    ];

    chrome.storage.local.set({
      stories: testStories,
      storiesDate: new Date().toISOString().split('T')[0],
      fetchedAt: Date.now(),
      isSeedData: false,
      dismissedDate: null,
    }, () => {
      // Broadcast to all tabs to refresh the bar
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_BAR' }).catch(() => {});
          }
        }
      });
      sendResponse({ ok: true, count: testStories.length });
    });
    return true;
  }
});
