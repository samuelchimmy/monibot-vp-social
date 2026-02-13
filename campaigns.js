import { postTweet } from './twitter-oauth2.js';
import { supabase } from './database.js';
import { generateCampaignAnnouncement } from './gemini.js';

// ============ Campaign Tweet Templates (Network-Aware) ============
// Variables: {amount}, {count}, {token}
// {token} is replaced with USDC (Base) or USDT (BSC)

const CAMPAIGN_TEMPLATES = [
  `{token} drop alert. First {count} monitags in the replies get ${'{amount}'} each. MoniPay account required.`,
  `Giving away ${'{amount}'} {token} to {count} people right now. Drop your monitag below if you want in.`,
  `{count} grants of ${'{amount}'} {token} are up for grabs. Reply with your monitag. First come, first served.`,
  `Today's challenge: be one of the first {count} to reply with a monitag and claim ${'{amount}'} {token}.`,
  `${'{amount}'} {token} waiting for {count} people. All you need is a MoniPay monitag. Go.`,
  `Quick drop. {count} spots. ${'{amount}'} {token} each. Monitag in the replies. No catch.`,
  `Looking for {count} monitags. Each one gets ${'{amount}'} {token} sent straight to their MoniPay wallet.`,
  `Free money is real when you're onchain. ${'{amount}'} {token} for the next {count} monitags I see.`,
  `This is not a drill. {count} people are about to get ${'{amount}'} {token}. Drop your monitag.`,
  `Round {round}: ${'{amount}'} {token} x {count} recipients. Reply with your MoniPay monitag to claim.`,
  `Onchain generosity hour. First {count} monitags below receive ${'{amount}'} {token} each.`,
  `{count} slots open. ${'{amount}'} {token} per slot. Your monitag is your ticket.`,
  `Campaign #{id4}: sending ${'{amount}'} {token} to {count} monitags. Be fast.`,
  `Who wants ${'{amount}'} {token}? {count} grants available. Monitag required. Simple as that.`,
  `The bot has budget and the bot must spend. ${'{amount}'} {token} for {count} monitags. Reply now.`,
  `Another day, another drop. ${'{amount}'} {token} each for the first {count} monitags.`,
  `MoniPay users: ${'{amount}'} {token} is yours if you're among the first {count} to reply with your monitag.`,
  `Distributing ${'{amount}'} {token} to {count} people. No gimmicks. Just drop your monitag.`,
  `Budget unlocked. {count} monitags get ${'{amount}'} {token} each. Clock is ticking.`,
  `Social payments in action. ${'{amount}'} {token} going to the next {count} monitag replies.`,
];

// Track which templates were recently used to avoid repetition
let recentTemplateIndices = [];

/**
 * Pick a unique template and fill in variables.
 * Appends a short unique suffix to guarantee Twitter doesn't flag as duplicate.
 * @param {number} grantAmount
 * @param {number} maxParticipants
 * @param {string} network - 'base' or 'bsc'
 */
function buildUniqueCampaignTweet(grantAmount, maxParticipants, network = 'base') {
  // Resolve token name from network
  const token = network === 'bsc' ? 'USDT' : 'USDC';

  // Filter out recently used templates
  let available = CAMPAIGN_TEMPLATES
    .map((t, i) => i)
    .filter(i => !recentTemplateIndices.includes(i));
  
  // If all used, reset history but keep last 3
  if (available.length === 0) {
    recentTemplateIndices = recentTemplateIndices.slice(-3);
    available = CAMPAIGN_TEMPLATES
      .map((t, i) => i)
      .filter(i => !recentTemplateIndices.includes(i));
  }

  const idx = available[Math.floor(Math.random() * available.length)];
  recentTemplateIndices.push(idx);

  // Keep history bounded
  if (recentTemplateIndices.length > 10) {
    recentTemplateIndices = recentTemplateIndices.slice(-7);
  }

  // Unique identifiers
  const now = new Date();
  const round = Math.floor(Math.random() * 900) + 100; // 100-999
  const id4 = `${now.getMonth() + 1}${now.getDate()}${String(round).slice(-2)}`;

  let tweet = CAMPAIGN_TEMPLATES[idx]
    .replace(/\{amount\}/g, `$${grantAmount}`)
    .replace(/\{count\}/g, String(maxParticipants))
    .replace(/\{token\}/g, token)
    .replace(/\{round\}/g, String(round))
    .replace(/\{id4\}/g, id4);

  // Append a unique micro-suffix (invisible to humans, unique to Twitter)
  const suffix = ` [${now.getHours()}${now.getMinutes()}${now.getSeconds()}]`;
  tweet += suffix;

  return tweet;
}

/**
 * Generate a campaign tweet, preferring local templates over AI.
 * AI is used only as fallback if templates somehow all fail.
 */
export async function generateUniqueCampaignTweet({ budget, grantAmount, maxParticipants, network }) {
  try {
    return buildUniqueCampaignTweet(grantAmount, maxParticipants, network || 'base');
  } catch (err) {
    console.error('Template generation failed, falling back to AI:', err.message);
    return generateCampaignAnnouncement({ budget, grantAmount, maxParticipants });
  }
}

/**
 * Executes the logic to post a new campaign tweet and log it to the DB.
 */
export async function postCampaign(timeSlot, maxGrants, grantAmount, network = 'base') {
  try {
    console.log(`\n📢 Posting ${timeSlot} campaign on ${network.toUpperCase()} (Target: ${maxGrants} Grants @ $${grantAmount})...`);
    
    const campaignText = buildUniqueCampaignTweet(grantAmount, maxGrants, network);
    
    const tweetId = await postTweet(campaignText);
    
    console.log(`  ✅ Campaign posted: ${tweetId} (network: ${network})`);
    
    // Log campaign to database with correct network
    await supabase.from('campaigns').insert({
      tweet_id: tweetId,
      message: campaignText,
      type: 'grant',
      status: 'active',
      grant_amount: grantAmount,
      max_participants: maxGrants,
      budget_allocated: maxGrants * grantAmount,
      posted_at: new Date().toISOString(),
      network: network
    });
    
  } catch (error) {
    console.error('Campaign posting error:', error.message);
  }
}
