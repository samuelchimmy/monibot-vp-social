// twitter-oauth2.js
import { TwitterApi } from 'twitter-api-v2';

let twitterClient;

/**
 * Initializes Twitter client using environment variables.
 * No database dependency; uses static tokens in .env.
 */
export function initTwitterOAuth2() {
  if (
    !process.env.TWITTER_CLIENT_ID ||
    !process.env.TWITTER_CLIENT_SECRET
  ) {
    console.error('❌ Missing Twitter CLIENT_ID or CLIENT_SECRET in env!');
    return;
  }

  if (
    !process.env.TWITTER_OAUTH2_ACCESS_TOKEN ||
    !process.env.TWITTER_OAUTH2_REFRESH_TOKEN
  ) {
    console.error('❌ Missing Twitter OAuth2 tokens in env!');
    return;
  }

  twitterClient = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
    accessToken: process.env.TWITTER_OAUTH2_ACCESS_TOKEN,
    refreshToken: process.env.TWITTER_OAUTH2_REFRESH_TOKEN,
  });

  console.log('✅ Twitter client initialized with env tokens');
}

/**
 * Posts a new tweet.
 */
export async function postTweet(text) {
  if (!twitterClient) throw new Error('Twitter client not initialized');
  try {
    const result = await twitterClient.v2.tweet(text);
    return result.data.id;
  } catch (error) {
    console.error('❌ Twitter post error:', error.message);
    throw error;
  }
}

/**
 * Replies to an existing tweet.
 */
export async function replyToTweet(tweetId, text) {
  if (!twitterClient) throw new Error('Twitter client not initialized');
  try {
    const result = await twitterClient.v2.tweet(text, {
      reply: { in_reply_to_tweet_id: tweetId },
    });
    return result.data.id;
  } catch (error) {
    console.error('❌ Twitter reply error:', error.message);
    throw error;
  }
}

// Export client for other modules
export { twitterClient };
