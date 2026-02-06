import dotenv from 'dotenv';
import { initTwitterOAuth2 } from './twitter-oauth2.js';
import { initGemini } from './gemini.js';
import { initSupabase, processSocialQueue } from './database.js';
import { scheduleCampaigns } from './campaigns.js';

dotenv.config();

console.log('🎭 MoniBot VP of Growth Starting...');

// Initialize all the modules
initTwitterOAuth2();
initGemini();
initSupabase();

console.log('✅ VP Social Agent initialized!');

// Main loop: Check the database for tasks every 30 seconds
setInterval(async () => {
  await processSocialQueue();
}, 30000);

// Start the autonomous campaign scheduler
scheduleCampaigns();

console.log('🚀 VP Social Agent is now live and polling...');
