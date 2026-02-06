import { createClient } from '@supabase/supabase-js';
import { generateReply } from './gemini.js';
import { replyToTweet } from './twitter-oauth2.js';

// FIX: Export supabase so other modules (like campaigns.js) can import it
export let supabase;

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
      .limit(5); // Process fewer at a time to keep the agent responsive
    
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

/**
 * Updates the monibot_mission_stats table based on transaction outcome.
 */
async function updateMissionStats(tx) {
  // Only update stats for successful transfers (identified by a tx hash)
  if (!tx.tx_hash.startsWith('0x')) return;
  
  // Use RPC (Remote Procedure Call) for safe, atomic updates (preferred method)
  try {
    const { error } = await supabase.rpc('increment_mission_stats', {
        amount_spent: tx.amount + tx.fee,
        user_id: tx.receiver_id // Assuming every successful grant/p2p is a user interaction
    });

    if (error) throw error;

  } catch (rpcError) {
    // Fallback: Use the logic provided, but ensure floating point accuracy
    console.warn('RPC call failed (likely missing function). Falling back to direct query...');

    const { data: stats } = await supabase
      .from('monibot_mission_stats')
      .select('spent_budget, users_onboarded')
      .single();

    if (!stats) {
      // Create initial stats
      await supabase.from('monibot_mission_stats').insert({
        spent_budget: tx.amount + tx.fee,
        users_onboarded: 1,
      });
    } else {
      // Update stats
      await supabase
        .from('monibot_mission_stats')
        .update({
          spent_budget: stats.spent_budget + tx.amount + tx.fee,
          users_onboarded: stats.users_onboarded + 1
        })
        .limit(1); // Ensure only one row is updated
    }
  }
}
