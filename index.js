import dotenv from 'dotenv';
import { initTwitterOAuth2 } from './twitter-oauth2.js';
import { initGemini } from './gemini.js';
import { initSupabase, processSocialQueue } from './database.js';
import { scheduleCampaigns } from './campaigns.js';

dotenv.config();

console.log('🎭 MoniBot VP of Growth Starting...');

initTwitterOAuth2();
initGemini();
initSupabase();

console.log('✅ VP Social Agent initialized!');

// Process social queue every 30 seconds
setInterval(async () => {
  await processSocialQueue();
}, 30000);

// Schedule campaigns
scheduleCampaigns();

console.log('🚀 VP Social Agent is live!');
