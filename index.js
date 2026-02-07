/**
 * MoniBot VP-Social - Entry Point
 * 
 * The personality layer of MoniBot that handles all Twitter interactions.
 * Polls the social queue (monibot_transactions) and scheduled jobs
 * to post replies, campaigns, and winner announcements.
 * 
 * Architecture:
 * - Worker Bot handles blockchain transactions (silent)
 * - VP-Social handles Twitter posting (personality-driven)
 * - Handshake via monibot_transactions and scheduled_jobs tables
 */

import dotenv from 'dotenv';
import { initTwitterOAuth2 } from './twitter-oauth2.js';
import { initGemini } from './gemini.js';
import { initSupabase, processSocialQueue, processScheduledJobs } from './database.js';
import { scheduleCampaigns } from './campaigns.js';

dotenv.config();

// ============ Configuration ============

const SOCIAL_QUEUE_INTERVAL_MS = parseInt(process.env.SOCIAL_QUEUE_INTERVAL_MS) || 30000;
const SCHEDULED_JOBS_INTERVAL_MS = parseInt(process.env.SCHEDULED_JOBS_INTERVAL_MS) || 15000;

// ============ Startup ============

console.log('┌─────────────────────────────────────────────────┐');
console.log('│          MoniBot VP-Social v2.0                │');
console.log('│        Personality & Social Layer              │');
console.log('└─────────────────────────────────────────────────┘\n');

console.log('🎭 MoniBot VP of Growth Starting...\n');

// 1️⃣ Initialize Supabase first
initSupabase();

// 2️⃣ Initialize Twitter client (requires Supabase for refresh token)
await initTwitterOAuth2();

// 3️⃣ Initialize Gemini
initGemini();

console.log('\n📋 Configuration:');
console.log(`   Social Queue Interval:    ${SOCIAL_QUEUE_INTERVAL_MS}ms`);
console.log(`   Scheduled Jobs Interval:  ${SCHEDULED_JOBS_INTERVAL_MS}ms`);
console.log('');

// ============ Main Loops ============

let socialQueueCycle = 0;
let scheduledJobsCycle = 0;

/**
 * Process social queue (transaction replies)
 */
async function socialQueueLoop() {
  socialQueueCycle++;
  try {
    await processSocialQueue();
  } catch (error) {
    console.error('❌ Error processing social queue:', error);
  }
}

/**
 * Process scheduled jobs (campaign posts, winner announcements)
 */
async function scheduledJobsLoop() {
  scheduledJobsCycle++;
  try {
    await processScheduledJobs();
  } catch (error) {
    console.error('❌ Error processing scheduled jobs:', error);
  }
}

// ============ Graceful Shutdown ============

process.on('SIGINT', () => {
  console.log('\n\n🛑 Received SIGINT. Shutting down gracefully...');
  console.log(`📊 Completed ${socialQueueCycle} social queue cycles, ${scheduledJobsCycle} scheduled job cycles.`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Received SIGTERM. Shutting down gracefully...');
  console.log(`📊 Completed ${socialQueueCycle} social queue cycles, ${scheduledJobsCycle} scheduled job cycles.`);
  process.exit(0);
});

// ============ Start ============

console.log('🚀 VP-Social is now live!\n');

// Start cron-based campaign scheduler (9am, 4pm EST)
scheduleCampaigns();

// Run immediately, then on intervals
socialQueueLoop();
scheduledJobsLoop();

setInterval(socialQueueLoop, SOCIAL_QUEUE_INTERVAL_MS);
setInterval(scheduledJobsLoop, SCHEDULED_JOBS_INTERVAL_MS);

console.log('   Press Ctrl+C to stop.\n');
