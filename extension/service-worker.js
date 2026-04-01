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
  chrome.alarms.create('daily-fetch', { periodInMinutes: 360 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-fetch') {
    fetchAndStoreStories();
  }
});

async function fetchAndStoreStories() {
  try {
    const res = await fetch(`${API_BASE}/api/stories/today`, {
      headers: { 'X-NewsFlash-Key': API_KEY },
    });

    if (!res.ok) {
      console.error('[NewsFlash] API returned', res.status);
      return;
    }

    const data = await res.json();
    const stories = data.stories || [];

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
