// index.js
import dotenv from 'dotenv';
import { initTwitterOAuth2 } from './twitter-oauth2.js';
import { initGemini } from './gemini.js';
import { initSupabase, processSocialQueue } from './database.js';
import { scheduleCampaigns } from './campaigns.js';

dotenv.config();

console.log('🎭 MoniBot VP of Growth Starting...');

// 1️⃣ Initialize Supabase first so twitter-oauth2 can use it safely
initSupabase();
console.log('✅ Supabase initialized');

// 2️⃣ Initialize Twitter client (requires Supabase for refresh token)
initTwitterOAuth2();
console.log('✅ Twitter client initialized');

// 3️⃣ Initialize Gemini
initGemini();
console.log('✅ Gemini initialized');

// 4️⃣ VP Social Agent fully initialized
console.log('✅ VP Social Agent is now live and polling...');

// === Main Loop: Process social queue every 30 seconds ===
setInterval(async () => {
  try {
    await processSocialQueue();
  } catch (error) {
    console.error('❌ Error processing social queue:', error);
  }
}, 30000);

// === Start autonomous campaign scheduler ===
scheduleCampaigns();
console.log('✅ Campaign scheduler active');

