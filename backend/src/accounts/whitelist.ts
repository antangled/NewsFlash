export interface TrackedAccount {
  handle: string;
  name: string;
  tier: 1 | 2 | 3;
  category: string;
}

export const TRACKED_ACCOUNTS: TrackedAccount[] = [
  // === TIER 1: Posts themselves are news ===
  { handle: 'sama', name: 'Sam Altman', tier: 1, category: 'ai' },
  { handle: 'elonmusk', name: 'Elon Musk', tier: 1, category: 'tech' },
  { handle: 'sataborasu', name: 'Satya Nadella', tier: 1, category: 'tech' },
  { handle: 'sundarpichai', name: 'Sundar Pichai', tier: 1, category: 'tech' },
  { handle: 'ylecun', name: 'Yann LeCun', tier: 1, category: 'ai' },
  { handle: 'DarioAmodei', name: 'Dario Amodei', tier: 1, category: 'ai' },
  { handle: 'tim_cook', name: 'Tim Cook', tier: 1, category: 'tech' },
  { handle: 'demaborasishassabis', name: 'Demis Hassabis', tier: 1, category: 'ai' },
  { handle: 'JensenHuang', name: 'Jensen Huang', tier: 1, category: 'chips' },
  { handle: 'karpathy', name: 'Andrej Karpathy', tier: 1, category: 'ai' },
  { handle: 'patrickc', name: 'Patrick Collison', tier: 1, category: 'fintech' },
  { handle: 'naval', name: 'Naval Ravikant', tier: 1, category: 'startups' },
  { handle: 'paulg', name: 'Paul Graham', tier: 1, category: 'startups' },

  // === TIER 2: Company/org accounts ===
  { handle: 'OpenAI', name: 'OpenAI', tier: 2, category: 'ai' },
  { handle: 'AnthropicAI', name: 'Anthropic', tier: 2, category: 'ai' },
  { handle: 'GoogleAI', name: 'Google AI', tier: 2, category: 'ai' },
  { handle: 'GoogleDeepMind', name: 'Google DeepMind', tier: 2, category: 'ai' },
  { handle: 'xaborasai', name: 'xAI', tier: 2, category: 'ai' },
  { handle: 'nvidia', name: 'NVIDIA', tier: 2, category: 'chips' },
  { handle: 'stripe', name: 'Stripe', tier: 2, category: 'fintech' },
  { handle: 'Meta', name: 'Meta', tier: 2, category: 'tech' },
  { handle: 'Microsoft', name: 'Microsoft', tier: 2, category: 'tech' },
  { handle: 'Apple', name: 'Apple', tier: 2, category: 'tech' },
  { handle: 'Tesla', name: 'Tesla', tier: 2, category: 'tech' },
  { handle: 'SpaceX', name: 'SpaceX', tier: 2, category: 'tech' },
  { handle: 'ycombinator', name: 'Y Combinator', tier: 2, category: 'startups' },
  { handle: 'a16z', name: 'a16z', tier: 2, category: 'vc' },
  { handle: 'sequoia', name: 'Sequoia Capital', tier: 2, category: 'vc' },
  { handle: 'huggingface', name: 'Hugging Face', tier: 2, category: 'ai' },
  { handle: 'StabilityAI', name: 'Stability AI', tier: 2, category: 'ai' },

  // === TIER 3: Journalists, analysts, commentators ===
  { handle: 'kylewiggers', name: 'Kyle Wiggers', tier: 3, category: 'ai' },
  { handle: 'ZoeSchiffer', name: 'Zoe Schiffer', tier: 3, category: 'tech' },
  { handle: 'alexheath', name: 'Alex Heath', tier: 3, category: 'tech' },
  { handle: 'markgurman', name: 'Mark Gurman', tier: 3, category: 'apple' },
  { handle: 'benedictevans', name: 'Benedict Evans', tier: 3, category: 'tech' },
  { handle: 'benthompson', name: 'Ben Thompson', tier: 3, category: 'tech' },
  { handle: 'levelsio', name: 'Pieter Levels', tier: 3, category: 'startups' },
  { handle: 'garrytan', name: 'Garry Tan', tier: 3, category: 'startups' },
  { handle: 'EMostaque', name: 'Emad Mostaque', tier: 3, category: 'ai' },
  { handle: 'bindureddy', name: 'Bindu Reddy', tier: 3, category: 'ai' },
  { handle: 'rowancheung', name: 'Rowan Cheung', tier: 3, category: 'ai' },
  { handle: 'theinformation', name: 'The Information', tier: 3, category: 'tech' },
  { handle: 'TechCrunch', name: 'TechCrunch', tier: 3, category: 'tech' },
];

export function getAccountByHandle(handle: string): TrackedAccount | undefined {
  return TRACKED_ACCOUNTS.find(a => a.handle.toLowerCase() === handle.toLowerCase());
}

export function getTierScore(tier: 1 | 2 | 3): number {
  const scores: Record<number, number> = { 1: 1.0, 2: 0.7, 3: 0.4 };
  return scores[tier];
}
