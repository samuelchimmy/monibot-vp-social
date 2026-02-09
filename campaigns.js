import { postTweet } from './twitter-oauth2.js';
import { supabase } from './database.js';
import { generateCampaignAnnouncement } from './gemini.js';

// ============ Campaign Tweet Templates (15+ unique structures) ============
// Each template communicates: grant amount, participant count, call-to-action
// Variables: {amount}, {count}

const CAMPAIGN_TEMPLATES = [
  `USDC drop alert. First {count} monitags in the replies get ${'{amount}'} each. MoniPay account required.`,
  `Giving away ${'{amount}'} USDC to {count} people right now. Drop your monitag below if you want in.`,
  `{count} grants of ${'{amount}'} USDC are up for grabs. Reply with your monitag. First come, first served.`,
  `Today's challenge: be one of the first {count} to reply with a monitag and claim ${'{amount}'} USDC.`,
  `${'{amount}'} USDC waiting for {count} people. All you need is a MoniPay monitag. Go.`,
  `Quick drop. {count} spots. ${'{amount}'} USDC each. Monitag in the replies. No catch.`,
  `Looking for {count} monitags. Each one gets ${'{amount}'} USDC sent straight to their MoniPay wallet.`,
  `Free money is real when you're onchain. ${'{amount}'} USDC for the next {count} monitags I see.`,
  `This is not a drill. {count} people are about to get ${'{amount}'} USDC. Drop your monitag.`,
  `Round {round}: ${'{amount}'} USDC x {count} recipients. Reply with your MoniPay monitag to claim.`,
  `Onchain generosity hour. First {count} monitags below receive ${'{amount}'} USDC each.`,
  `{count} slots open. ${'{amount}'} USDC per slot. Your monitag is your ticket.`,
  `Campaign #{id4}: sending ${'{amount}'} USDC to {count} monitags. Be fast.`,
  `Who wants ${'{amount}'} USDC? {count} grants available. Monitag required. Simple as that.`,
  `The bot has budget and the bot must spend. ${'{amount}'} USDC for {count} monitags. Reply now.`,
  `Another day, another drop. ${'{amount}'} USDC each for the first {count} monitags.`,
  `MoniPay users: ${'{amount}'} USDC is yours if you're among the first {count} to reply with your monitag.`,
  `Distributing ${'{amount}'} USDC to {count} people. No gimmicks. Just drop your monitag.`,
  `Budget unlocked. {count} monitags get ${'{amount}'} USDC each. Clock is ticking.`,
  `Social payments in action. ${'{amount}'} USDC going to the next {count} monitag replies.`,
];

// Track which templates were recently used to avoid repetition
let recentTemplateIndices = [];

/**
 * Pick a unique template and fill in variables.
 * Appends a short unique suffix to guarantee Twitter doesn't flag as duplicate.
 */
function buildUniqueCampaignTweet(grantAmount, maxParticipants) {
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
export async function generateUniqueCampaignTweet({ budget, grantAmount, maxParticipants }) {
  try {
    return buildUniqueCampaignTweet(grantAmount, maxParticipants);
  } catch (err) {
    console.error('Template generation failed, falling back to AI:', err.message);
    // AI fallback (will still risk duplicates but better than nothing)
    return generateCampaignAnnouncement({ budget, grantAmount, maxParticipants });
  }
}

/**
 * Executes the logic to post a new campaign tweet and log it to the DB.
 */
export async function postCampaign(timeSlot, maxGrants, grantAmount) {
  try {
    console.log(`\n📢 Posting ${timeSlot} campaign (Target: ${maxGrants} Grants @ $${grantAmount})...`);
    
    const campaignText = buildUniqueCampaignTweet(grantAmount, maxGrants);
    
    const tweetId = await postTweet(campaignText);
    
    console.log(`  ✅ Campaign posted: ${tweetId}`);
    
    // Log campaign to database
    await supabase.from('campaigns').insert({
      tweet_id: tweetId,
      message: campaignText,
      type: 'grant',
      status: 'active',
      grant_amount: grantAmount,
      max_participants: maxGrants,
      budget_allocated: maxGrants * grantAmount,
      posted_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Campaign posting error:', error.message);
  }
}
