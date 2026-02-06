import { TwitterApi } from 'twitter-api-v2';

let twitterClient;

export function initTwitterOAuth2() {
  twitterClient = new TwitterApi(process.env.TWITTER_OAUTH2_ACCESS_TOKEN);
  console.log('✅ Twitter OAuth 2.0 initialized');
}

export async function postTweet(text) {
  const result = await twitterClient.v2.tweet(text);
  return result.data.id;
}

export async function replyToTweet(tweetId, text) {
  const result = await twitterClient.v2.tweet(text, { reply: { in_reply_to_tweet_id: tweetId } });
  return result.data.id;
}

export { twitterClient };
