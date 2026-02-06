import { createClient } from '@supabase/supabase-js';
import { generateReply } from './gemini.js';
import { replyToTweet } from './twitter-oauth2.js';

let supabase;

export function initSupabase() {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  console.log('✅ Supabase initialized');
}

export async function processSocialQueue() {
  try {
    console.log('📬 Checking Social Queue...');
    
    // Get unreplied transactions
    const { data: queue, error } = await supabase
      .from('monibot_transactions')
      .select('*')
      .eq('replied', false)
      .order('created_at', { ascending: true })
      .limit(10);
    
    if (error) throw error;
    
    if (!queue || queue.length === 0) {
      console.log('  Queue empty');
      return;
    }
    
    console.log(`  Found ${queue.length} unreplied transaction(s)`);
    
    for (const tx of queue) {
      await processQueueItem(tx);
    }
    
  } catch (error) {
    console.error('Error processing queue:', error);
  }
}

async function processQueueItem(tx) {
  try {
    console.log(`\n💬 Processing: ${tx.id}`);
    
    // Generate reply based on tx_hash outcome
    const replyText = await generateReply(tx);
    
    console.log(`  Reply: ${replyText}`);
    
    // Post reply to Twitter
    if (tx.tweet_id) {
      await replyToTweet(tx.tweet_id, replyText);
      console.log(`  ✅ Replied to tweet ${tx.tweet_id}`);
    }
    
    // Mark as replied
    await supabase
      .from('monibot_transactions')
      .update({ replied: true })
      .eq('id', tx.id);
    
    console.log(`  ✅ Marked as replied`);
    
    // Update mission stats
    await updateMissionStats(tx);
    
  } catch (error) {
    console.error(`  ❌ Error processing ${tx.id}:`, error);
  }
}

async function updateMissionStats(tx) {
  // Only count successful transfers
  if (!tx.tx_hash.startsWith('0x')) return;
  
  const { data: stats } = await supabase
    .from('monibot_mission_stats')
    .select('*')
    .single();
  
  if (!stats) {
    // Create initial stats
    await supabase.from('monibot_mission_stats').insert({
      total_budget: 50.00,
      spent_budget: tx.amount + tx.fee,
      users_onboarded: 1,
      target_users: 5000,
      campaigns_run: 0
    });
  } else {
    // Update stats
    await supabase
      .from('monibot_mission_stats')
      .update({
        spent_budget: stats.spent_budget + tx.amount + tx.fee,
        users_onboarded: stats.users_onboarded + 1
      })
      .eq('id', stats.id);
  }
}
