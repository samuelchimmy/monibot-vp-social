import { createClient } from '@supabase/supabase-js';
import { generateReply, generateCampaignAnnouncement, generateWinnerAnnouncement } from './gemini.js';
import { replyToTweet, postTweet } from './twitter-oauth2.js';

export let supabase;

export function initSupabase() {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  console.log('✅ Supabase initialized');
}

// ============ Social Queue Processing ============

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

// ============ Scheduled Jobs Processing ============

/**
 * Process completed scheduled jobs that need social posting.
 * This is the handshake from Worker Bot → VP-Social.
 */
export async function processScheduledJobs() {
  try {
    console.log('⏰ Checking Scheduled Jobs...');
    
    // Get completed jobs that haven't been socially processed yet
    const { data: jobs, error } = await supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('status', 'completed')
      .order('completed_at', { ascending: true })
      .limit(5);
    
    if (error) throw error;
    
    if (!jobs || jobs.length === 0) {
      console.log('  No pending social jobs');
      return;
    }
    
    console.log(`  Found ${jobs.length} job(s) ready for social`);
    
    for (const job of jobs) {
      // Check if job result indicates it's ready for social posting
      const result = job.result || {};
      
      if (result.ready_for_social) {
        await processScheduledJob(job);
      }
    }
    
  } catch (error) {
    console.error('Error processing scheduled jobs:', error);
  }
}

async function processScheduledJob(job) {
  try {
    console.log(`\n📢 Processing scheduled job: ${job.type} (${job.id})`);
    
    let tweetId = null;
    
    switch (job.type) {
      case 'campaign_post':
        tweetId = await handleCampaignPost(job);
        break;
      
      case 'random_pick':
        tweetId = await handleRandomPickAnnouncement(job);
        break;
      
      default:
        console.log(`  ⏭️ Unknown job type: ${job.type}`);
        return;
    }
    
    // Mark job as socially processed by updating result
    await supabase
      .from('scheduled_jobs')
      .update({
        result: {
          ...job.result,
          social_posted: true,
          social_tweet_id: tweetId,
          social_posted_at: new Date().toISOString()
        }
      })
      .eq('id', job.id);
    
    console.log(`  ✅ Job ${job.id} socially processed`);
    
  } catch (error) {
    console.error(`  ❌ Error processing job ${job.id}:`, error);
    
    // Log error but don't fail - will retry on next cycle
    await supabase
      .from('scheduled_jobs')
      .update({
        result: {
          ...job.result,
          social_error: error.message,
          social_error_at: new Date().toISOString()
        }
      })
      .eq('id', job.id);
  }
}

/**
 * Handle posting a scheduled campaign tweet
 */
async function handleCampaignPost(job) {
  const { payload } = job;
  const { message, budget, grant_amount, max_participants } = payload;
  
  // Generate campaign tweet (use provided message or generate one)
  let tweetText = message;
  
  if (!tweetText) {
    tweetText = await generateCampaignAnnouncement({
      budget,
      grantAmount: grant_amount,
      maxParticipants: max_participants
    });
  }
  
  // Post the campaign tweet
  const tweetId = await postTweet(tweetText);
  console.log(`  ✅ Campaign posted: ${tweetId}`);
  
  // Log to campaigns table
  await supabase.from('campaigns').insert({
    tweet_id: tweetId,
    message: tweetText,
    type: 'grant',
    status: 'active',
    grant_amount: grant_amount || 1.00,
    max_participants: max_participants || 5,
    budget_allocated: budget || (max_participants * grant_amount),
    posted_at: new Date().toISOString()
  });
  
  return tweetId;
}

/**
 * Handle announcing random pick winners
 */
async function handleRandomPickAnnouncement(job) {
  const { result, source_tweet_id, source_author_username } = job;
  const { winners = [], count, grant_amount } = result;
  
  if (winners.length === 0) {
    console.log('  ⚠️ No winners to announce');
    return null;
  }
  
  // Generate winner announcement
  const announcementText = await generateWinnerAnnouncement({
    winners,
    count,
    grantAmount: grant_amount,
    originalAuthor: source_author_username,
    originalTweetId: source_tweet_id
  });
  
  // Post as reply to original tweet or as new tweet
  let tweetId;
  if (source_tweet_id) {
    tweetId = await replyToTweet(source_tweet_id, announcementText);
    console.log(`  ✅ Winner announcement replied: ${tweetId}`);
  } else {
    tweetId = await postTweet(announcementText);
    console.log(`  ✅ Winner announcement posted: ${tweetId}`);
  }
  
  return tweetId;
}

// ============ Mission Stats ============

async function updateMissionStats(tx) {
  // Only update stats for successful transfers
  if (!tx.tx_hash.startsWith('0x')) return;
  
  try {
    // Try RPC first (atomic update)
    const { error } = await supabase.rpc('increment_mission_stats', {
      amount_spent: tx.amount + tx.fee,
      user_id: tx.receiver_id
    });

    if (error) throw error;

  } catch (rpcError) {
    // Fallback to direct query
    console.warn('RPC call failed. Falling back to direct query...');

    const { data: stats } = await supabase
      .from('monibot_mission_stats')
      .select('spent_budget, current_users')
      .single();

    if (!stats) {
      await supabase.from('monibot_mission_stats').insert({
        spent_budget: tx.amount + tx.fee,
        current_users: 1,
      });
    } else {
      await supabase
        .from('monibot_mission_stats')
        .update({
          spent_budget: stats.spent_budget + tx.amount + tx.fee,
          current_users: stats.current_users + 1
        })
        .eq('id', 1);
    }
  }
}
