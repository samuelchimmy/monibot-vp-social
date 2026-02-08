import { createClient } from '@supabase/supabase-js';
import { generateReplyWithBackoff, generateCampaignAnnouncement, generateWinnerAnnouncement } from './gemini.js';
import { replyToTweet, postTweet } from './twitter-oauth2.js';

export let supabase;

// Maximum retry attempts before skipping a transaction
const MAX_RETRY_COUNT = 3;

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
    
    // Get unreplied transactions that haven't exceeded retry limit
    const { data: queue, error } = await supabase
      .from('monibot_transactions')
      .select('*')
      .eq('replied', false)
      .lt('retry_count', MAX_RETRY_COUNT) // Only get transactions under retry limit
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
    
    // Also clean up any transactions that exceeded retry limit
    await cleanupExceededRetries();
    
  } catch (error) {
    console.error('Error processing queue:', error);
  }
}

async function processQueueItem(tx) {
  try {
    console.log(`\n💬 Processing: ${tx.id.substring(0, 8)} | ${tx.type} | ${tx.tx_hash.substring(0, 20)}...`);
    console.log(`   Retry count: ${tx.retry_count || 0}/${MAX_RETRY_COUNT}`);
    
    // Generate reply for ALL transaction types (no silent skips)
    const replyText = await generateReplyWithBackoff(tx);
    
    console.log(`   Reply: ${replyText.substring(0, 100)}...`);
    
    // Post reply to Twitter
    if (tx.tweet_id) {
      try {
        await replyToTweet(tx.tweet_id, replyText);
        console.log(`   ✅ Replied to tweet ${tx.tweet_id}`);
      } catch (twitterError) {
        // Check for 403 - tweet deleted/not visible
        if (twitterError.code === 403 || 
            twitterError.data?.status === 403 ||
            twitterError.message?.includes('403')) {
          console.log(`   ⚠️ 403 Error: Tweet ${tx.tweet_id} is deleted/not visible. Skipping & marking done.`);
          await markAsReplied(tx.id, 'SKIPPED_403_TWEET_UNAVAILABLE');
          return;
        }
        
        // Increment retry count and re-throw
        await incrementRetryCount(tx.id);
        throw twitterError;
      }
    }
    
    // Mark as replied
    await markAsReplied(tx.id);
    console.log(`   ✅ Marked as replied`);
    
    // Update mission stats
    await updateMissionStats(tx);
    
  } catch (error) {
    console.error(`   ❌ Error processing ${tx.id}:`, error.message);
    
    // Check if we should skip this transaction
    if (shouldSkipTransaction(error)) {
      console.log(`   ⚠️ Skipping transaction due to unrecoverable error`);
      await markAsReplied(tx.id, `SKIPPED_ERROR: ${error.message?.substring(0, 50)}`);
    } else {
      // Increment retry count for recoverable errors
      await incrementRetryCount(tx.id);
    }
  }
}

/**
 * Increment the retry count for a transaction
 */
async function incrementRetryCount(transactionId) {
  const { error } = await supabase
    .from('monibot_transactions')
    .update({ retry_count: supabase.raw('retry_count + 1') })
    .eq('id', transactionId);
  
  if (error) {
    // Fallback to manual increment
    const { data: tx } = await supabase
      .from('monibot_transactions')
      .select('retry_count')
      .eq('id', transactionId)
      .single();
    
    if (tx) {
      await supabase
        .from('monibot_transactions')
        .update({ retry_count: (tx.retry_count || 0) + 1 })
        .eq('id', transactionId);
    }
  }
}

/**
 * Clean up transactions that have exceeded retry limit
 */
async function cleanupExceededRetries() {
  const { data: exceededTx, error } = await supabase
    .from('monibot_transactions')
    .select('id')
    .eq('replied', false)
    .gte('retry_count', MAX_RETRY_COUNT)
    .limit(10);
  
  if (error || !exceededTx || exceededTx.length === 0) return;
  
  console.log(`   🧹 Cleaning up ${exceededTx.length} transaction(s) that exceeded retry limit`);
  
  for (const tx of exceededTx) {
    await markAsReplied(tx.id, 'MAX_RETRIES_EXCEEDED');
  }
}

/**
 * Determine if we should skip a transaction due to unrecoverable error
 */
function shouldSkipTransaction(error) {
  const skipPatterns = [
    '403',
    'deleted',
    'not visible',
    'Tweet not found',
    'not authorized',
    'You are not allowed to reply',
    'blocked'
  ];
  
  const errorStr = JSON.stringify(error).toLowerCase();
  return skipPatterns.some(pattern => errorStr.includes(pattern.toLowerCase()));
}

/**
 * Mark transaction as replied with optional skip reason
 */
async function markAsReplied(transactionId, skipReason = null) {
  const updateData = { 
    replied: true 
  };
  
  // Store skip reason in error_reason column
  if (skipReason) {
    updateData.error_reason = skipReason;
    console.log(`   Skip reason: ${skipReason}`);
  }
  
  await supabase
    .from('monibot_transactions')
    .update(updateData)
    .eq('id', transactionId);
}

// ============ Scheduled Jobs Processing ============

/**
 * Process completed scheduled jobs that need social posting.
 * This is the handshake from Worker Bot → VP-Social.
 */
export async function processScheduledJobs() {
  try {
    console.log('⏰ Checking Scheduled Jobs...');
    
    // First, check for pending jobs that are now due
    await processReadyPendingJobs();
    
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
      
      if (result.ready_for_social && !result.social_posted) {
        await processScheduledJob(job);
      }
    }
    
  } catch (error) {
    console.error('Error processing scheduled jobs:', error);
  }
}

/**
 * Process pending jobs that are now due (scheduled_at <= now)
 */
async function processReadyPendingJobs() {
  const now = new Date().toISOString();
  
  const { data: pendingJobs, error } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .eq('status', 'pending')
    .eq('type', 'campaign_post')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(3);
  
  if (error) {
    console.error('Error fetching pending jobs:', error);
    return;
  }
  
  if (!pendingJobs || pendingJobs.length === 0) {
    return;
  }
  
  console.log(`  📅 Found ${pendingJobs.length} pending job(s) ready to execute`);
  
  for (const job of pendingJobs) {
    // Mark as started
    await supabase
      .from('scheduled_jobs')
      .update({ 
        status: 'completed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        result: {
          ready_for_social: true,
          triggered_by: 'scheduler'
        }
      })
      .eq('id', job.id);
    
    // Process immediately
    await processScheduledJob({
      ...job,
      result: { ready_for_social: true }
    });
  }
}

async function processScheduledJob(job) {
  try {
    console.log(`\n📢 Processing scheduled job: ${job.type} (${job.id.substring(0, 8)})`);
    
    let tweetId = null;
    
    switch (job.type) {
      case 'campaign_post':
        tweetId = await handleCampaignPost(job);
        break;
      
      case 'random_pick':
        tweetId = await handleRandomPickAnnouncement(job);
        break;
      
      default:
        console.log(`   ⏭️ Unknown job type: ${job.type}`);
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
    
    console.log(`   ✅ Job ${job.id.substring(0, 8)} socially processed`);
    
  } catch (error) {
    console.error(`   ❌ Error processing job ${job.id}:`, error);
    
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
  console.log(`   ✅ Campaign posted: ${tweetId}`);
  
  // Log campaign to database
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
    console.log('   ⚠️ No winners to announce');
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
    try {
      tweetId = await replyToTweet(source_tweet_id, announcementText);
      console.log(`   ✅ Winner announcement replied: ${tweetId}`);
    } catch (error) {
      // If reply fails (tweet deleted), post as standalone
      if (error.code === 403 || error.data?.status === 403) {
        console.log('   ⚠️ Original tweet unavailable, posting as standalone');
        tweetId = await postTweet(announcementText);
        console.log(`   ✅ Winner announcement posted: ${tweetId}`);
      } else {
        throw error;
      }
    }
  } else {
    tweetId = await postTweet(announcementText);
    console.log(`   ✅ Winner announcement posted: ${tweetId}`);
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
