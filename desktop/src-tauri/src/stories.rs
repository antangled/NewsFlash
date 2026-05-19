use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

const API_BASE: &str = "http://localhost:3000";
const API_KEY: &str = "dev-key";
const FETCH_INTERVAL_SECS: u64 = 3600; // 1 hour

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    pub handle: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Story {
    pub rank: u32,
    pub headline: String,
    pub detail: Option<String>,
    pub sources: Vec<Source>,
    #[serde(default)]
    pub cluster_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoriesResponse {
    pub date: String,
    #[serde(default)]
    pub tier: String,
    pub stories: Vec<Story>,
    #[serde(default)]
    pub total_available: Option<u32>,
    #[serde(default)]
    pub is_seed_data: bool,
    #[serde(default)]
    pub fallback: bool,
    #[serde(default)]
    pub reason: Option<String>,
}

/// Seed stories so the app never shows empty state on first launch.
pub fn seed_stories() -> Vec<Story> {
    vec![
        Story {
            rank: 1,
            headline: "OpenAI launches GPT-5 with real-time reasoning capabilities".into(),
            detail: Some("The new model demonstrates significant improvements in multi-step reasoning and can process real-time data streams.".into()),
            sources: vec![Source { handle: "sama".into() }, Source { handle: "OpenAI".into() }],
            cluster_score: 0.97,
        },
        Story {
            rank: 2,
            headline: "Anthropic raises $5B Series D at $60B valuation".into(),
            detail: Some("The round was led by Lightspeed Venture Partners with participation from Google and Spark Capital.".into()),
            sources: vec![Source { handle: "DarioAmodei".into() }, Source { handle: "AnthropicAI".into() }],
            cluster_score: 0.94,
        },
        Story {
            rank: 3,
            headline: "NVIDIA unveils Blackwell Ultra GPU with 2x inference throughput".into(),
            detail: Some("Jensen Huang announced the next-generation chip at GTC, promising dramatic cost reductions for AI inference workloads.".into()),
            sources: vec![Source { handle: "JensenHuang".into() }, Source { handle: "nvidia".into() }],
            cluster_score: 0.92,
        },
        Story {
            rank: 4,
            headline: "Apple acquires AI startup for $2B to boost Siri intelligence".into(),
            detail: Some("The acquisition targets on-device language model capabilities for iOS 20.".into()),
            sources: vec![Source { handle: "markgurman".into() }, Source { handle: "Apple".into() }],
            cluster_score: 0.89,
        },
        Story {
            rank: 5,
            headline: "Stripe launches AI-powered fraud detection reducing false declines 40%".into(),
            detail: Some("The new system uses transaction graph neural networks trained on Stripe's massive payment dataset.".into()),
            sources: vec![Source { handle: "patrickc".into() }, Source { handle: "stripe".into() }],
            cluster_score: 0.85,
        },
    ]
}

/// Fetches stories from the NewsFlash backend API.
pub async fn fetch_stories(tier: &str) -> Result<StoriesResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .get(format!("{}/api/stories/today", API_BASE))
        .header("X-NewsFlash-Key", API_KEY)
        .header("X-NewsFlash-Tier", tier)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("API returned {}", res.status()));
    }

    res.json::<StoriesResponse>()
        .await
        .map_err(|e| format!("Parse error: {}", e))
}

/// Periodically fetches stories and emits them to the frontend.
pub async fn start_fetch_loop(app: AppHandle) {
    loop {
        match fetch_stories("free").await {
            Ok(response) if !response.stories.is_empty() => {
                let _ = app.emit("stories-updated", &response);
            }
            Ok(_) => {
                // Empty response — emit seeds
                let seed = StoriesResponse {
                    date: chrono_today(),
                    tier: "free".into(),
                    stories: seed_stories(),
                    total_available: Some(5),
                    is_seed_data: true,
                    fallback: false,
                    reason: None,
                };
                let _ = app.emit("stories-updated", &seed);
            }
            Err(e) => {
                eprintln!("[NewsFlash] Fetch failed: {}", e);
                // On first failure, emit seeds so UI is never empty
                let seed = StoriesResponse {
                    date: chrono_today(),
                    tier: "free".into(),
                    stories: seed_stories(),
                    total_available: Some(5),
                    is_seed_data: true,
                    fallback: true,
                    reason: Some(e),
                };
                let _ = app.emit("stories-updated", &seed);
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(FETCH_INTERVAL_SECS)).await;
    }
}

fn chrono_today() -> String {
    // Simple date without pulling in chrono crate
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let days = now / 86400;
    // Good enough approximation for display
    let y = 1970 + (days / 365);
    // For a proper date, we rely on the backend; this is just a fallback
    format!("{}-01-01", y)
}
