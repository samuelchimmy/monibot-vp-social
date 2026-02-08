import { TwitterApi } from 'twitter-api-v2';
import { supabase } from './database.js';

let twitterClient;

// ============ Rate Limit Logging ============

/**
 * Logs Twitter API rate limit information
 */
function logRateLimits(endpoint, rateLimit) {
  if (!rateLimit) {
    console.log(`📊 [${endpoint}] Rate limit info not available`);
    return;
  }
  
  const remaining = rateLimit.remaining;
  const limit = rateLimit.limit;
  const resetTime = rateLimit.reset ? new Date(rateLimit.reset * 1000) : null;
  const resetIn = resetTime ? Math.round((resetTime - Date.now()) / 1000 / 60) : '?';
  
  const emoji = remaining <= 5 ? '🔴' : remaining <= 15 ? '🟡' : '🟢';
  
  console.log(`📊 [${endpoint}] Rate Limit: ${emoji} ${remaining}/${limit} remaining | Resets in ${resetIn} min`);
  
  if (remaining <= 5) {
    console.warn(`⚠️ WARNING: Very low rate limit on ${endpoint}! Only ${remaining} requests left.`);
  }
}

/**
 * Logs detailed Twitter API errors with rate limit context
 */
function logTwitterError(operation, error) {
  console.error(`\n❌ Twitter API Error in ${operation}:`);
  console.error(`   Message: ${error.message}`);
  
  // Log error code and data
  if (error.code) console.error(`   Code: ${error.code}`);
  if (error.data) {
    console.error(`   Data:`, JSON.stringify(error.data, null, 2));
  }
  
  // Check for rate limit errors (429)
  if (error.code === 429 || error.data?.status === 429 || error.message?.includes('429')) {
    console.error(`   🚫 RATE LIMITED! Too many requests.`);
    
    if (error.rateLimit) {
      const resetTime = error.rateLimit.reset ? new Date(error.rateLimit.reset * 1000) : null;
      const resetIn = resetTime ? Math.round((resetTime - Date.now()) / 1000 / 60) : '?';
      console.error(`   ⏰ Resets in: ${resetIn} minutes`);
      console.error(`   📈 Limit: ${error.rateLimit.limit}, Remaining: ${error.rateLimit.remaining}`);
    }
  }
  
  // Check for auth errors
  if (error.code === 401 || error.code === 403) {
    console.error(`   🔐 Authentication/Authorization issue. Check tokens.`);
  }
  
  // Log headers if available (contains rate limit info)
  if (error.headers) {
    const rateLimitHeaders = {
      limit: error.headers['x-rate-limit-limit'],
      remaining: error.headers['x-rate-limit-remaining'],
      reset: error.headers['x-rate-limit-reset'],
    };
    if (rateLimitHeaders.limit) {
      console.error(`   📊 Headers Rate Limit: ${rateLimitHeaders.remaining}/${rateLimitHeaders.limit}`);
    }
  }
}

/**
 * Retrieves the stored Refresh Token from the database.
 */
async function getStoredRefreshToken() {
  const { data } = await supabase
    .from('bot_settings')
    .select('value')
    .eq('key', 'twitter_refresh_token')
    .maybeSingle();
    
  return data?.value;
}

/**
 * Saves a new Refresh Token back to the database.
 */
async function updateStoredRefreshToken(newToken) {
  const { error } = await supabase
    .from('bot_settings')
    .upsert({ key: 'twitter_refresh_token', value: newToken }, { onConflict: 'key' });
  
  if (error) console.error('❌ Failed to update Twitter Refresh Token in DB:', error);
}

/**
 * Initializes the Twitter client and performs a token refresh if necessary.
 */
export async function initTwitterOAuth2() {
  const refreshToken = await getStoredRefreshToken();
  
  if (!refreshToken) {
    console.error('❌ ERROR: Twitter Refresh Token missing in bot_settings table. Cannot authenticate.');
    return;
  }

  const tempClient = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
  });

  try {
    const { client: refreshedClient, refreshToken: newRefreshToken } = await tempClient.refreshOAuth2Token(refreshToken);
    
    twitterClient = refreshedClient;
    await updateStoredRefreshToken(newRefreshToken);
    
    console.log('✅ Twitter OAuth 2.0 initialized and token refreshed.');
  } catch (error) {
    console.error('❌ ERROR: Failed to refresh Twitter token. Check credentials and token validity.', error.message);
  }
}

/**
 * Posts a new tweet.
 */
export async function postTweet(text) {
  if (!twitterClient) throw new Error('Twitter client not initialized or failed to authenticate.');
  
  try {
    const result = await twitterClient.v2.tweet(text);
    logRateLimits('POST /tweets', result.rateLimit);
    return result.data.id;
  } catch (error) {
    logTwitterError('postTweet', error);
    throw error;
  }
}

/**
 * Replies to an existing tweet.
 */
export async function replyToTweet(tweetId, text) {
  if (!twitterClient) throw new Error('Twitter client not initialized or failed to authenticate.');
  
  try {
    const result = await twitterClient.v2.tweet(text, { reply: { in_reply_to_tweet_id: tweetId } });
    logRateLimits('POST /tweets (reply)', result.rateLimit);
    return result.data.id;
  } catch (error) {
    logTwitterError('replyToTweet', error);
    throw error;
  }
}

export { twitterClient };
