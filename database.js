// database.js
import { createClient } from '@supabase/supabase-js';
import { generateReply } from './gemini.js';
import { replyToTweet } from './twitter-oauth2.js';

// Immediately create and export Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('✅ Supabase client ready');

// Process social queue
export async function processSocialQueue() {
  try {
    console.log('📬 Checking Social Queue...');

    // Get unreplied transactions
    const { data: queue, error } = await supabase
      .from('monibot_transactions')
      .select('*')
      .eq('replied', false)
      .order('created_at', { ascending: true })
      .limit(5);

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
    console.error('❌ Error processing queue:', error);
  }
}

// Process a single queue item
async function processQueueItem(tx) {
  try {
    console.log(`\n💬 Processing: ${tx.id}`);

    // Generate reply
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

// Update mission stats
async function updateMissionStats(tx) {
  if (!tx.tx_hash.startsWith('0x')) return;

  try {
    const { error } = await supabase.rpc('increment_mission_stats', {
      amount_spent: tx.amount + tx.fee,
      user_id: tx.receiver_id,
    });

    if (error) throw error;
  } catch (rpcError) {
    console.warn(
      'RPC call failed. Falling back to direct query for mission stats...'
    );

    const { data: stats } = await supabase
      .from('monibot_mission_stats')
      .select('spent_budget, users_onboarded')
      .single();

    if (!stats) {
      await supabase.from('monibot_mission_stats').insert({
        spent_budget: tx.amount + tx.fee,
        users_onboarded: 1,
      });
    } else {
      await supabase
        .from('monibot_mission_stats')
        .update({
          spent_budget: stats.spent_budget + tx.amount + tx.fee,
          users_onboarded: stats.users_onboarded + 1,
        })
        .limit(1);
    }
  }
}
