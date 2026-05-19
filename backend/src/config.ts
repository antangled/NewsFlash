import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  newsflashApiKey: process.env.NEWSFLASH_API_KEY || '',
  rsshubBaseUrl: process.env.RSSHUB_BASE_URL || 'http://localhost:1200',
  dbPath: path.join(__dirname, '..', 'newsflash.db'),

  // Twitter OAuth 2.0
  twitterClientId: process.env.TWITTER_CLIENT_ID || '',
  twitterClientSecret: process.env.TWITTER_CLIENT_SECRET || '',
  twitterCallbackUrl: process.env.TWITTER_CALLBACK_URL || 'http://localhost:3000/api/auth/twitter/callback',
};
