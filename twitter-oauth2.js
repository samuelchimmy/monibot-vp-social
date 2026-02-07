import { TwitterApi } from 'twitter-api-v2';
import { supabase } from './database.js';

let twitterClient;

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
    return result.data.id;
  } catch (error) {
    console.error('Twitter Post Error:', error.message);
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
    return result.data.id;
  } catch (error) {
    console.error('Twitter Reply Error:', error.message);
    throw error;
  }
}

export { twitterClient };
