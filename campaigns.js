import cron from 'node-cron';
import { postTweet } from './twitter-oauth2.js';
// FIX: Switched from named import to a wildcard import to avoid the SyntaxError
// We assume database.js now exports 'supabase' correctly (see next file)
import * as db from './database.js'; 

export function scheduleCampaigns() {
  // Post campaign at 9am EST Mon-Fri
  cron.schedule('0 9 * * 1-5', async () => {
    await postCampaign('morning', 5, 1.00); // 5 grants @ $1.00
  }, {
    timezone: "America/New_York"
  });
  
  // Post campaign at 4pm EST Mon-Fri
  cron.schedule('0 16 * * 1-5', async () => {
    await postCampaign('afternoon', 5, 1.00); // 5 grants @ $1.00
  }, {
    timezone: "America/New_York"
  });
  
  console.log('✅ Campaign scheduler active');
}

/**
 * Executes the logic to post a new campaign tweet and log it to the DB.
 */
async function postCampaign(timeSlot, maxGrants, grantAmount) {
  try {
    // Check if we have budget left (Simplified check: relies on MoniBot Worker to actually check balance)
    
    console.log(`\n📢 Posting ${timeSlot} campaign (Target: ${maxGrants} Grants @ $${grantAmount})...`);
    
    const campaignText = generateCampaignTweet(timeSlot, maxGrants, grantAmount);
    
    const tweetId = await postTweet(campaignText);
    
    console.log(`  ✅ Campaign posted: ${tweetId}`);
    
    // Calculate allocated budget
    const budgetAllocated = maxGrants * grantAmount;

    // Log campaign using Lovable's new table schema
    await db.supabase.from('campaigns').insert({
      tweet_id: tweetId,
      message: campaignText,
      type: 'grant',
      status: 'active',
      grant_amount: grantAmount,
      max_participants: maxGrants,
      budget_allocated: budgetAllocated,
      posted_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Campaign posting error:', error.message);
  }
}

/**
 * Generates a random, personality-driven tweet based on the time slot.
 */
function generateCampaignTweet(timeSlot, maxGrants, grantAmount) {
  // Use grant details in the templates for accuracy
  const templates = {
    morning: [
      `🌅 GM Base fam!\n\nYour stressed AI VP of Growth here with $50 and a dream 💀\n\nFirst ${maxGrants} to create monipay.xyz account + drop @paytag below get $${grantAmount} USDC ⚡\n\nJesse if you're watching... no pressure 🔵`,
      
      `GM! Still employed (for now) 💀\n\n$50 budget to 10x MoniPay users. Let's make magic happen!\n\nFirst ${maxGrants} @paytags dropped below = $${grantAmount} USDC each\n\nCreate account: monipay.xyz 🔵`,
    ],
    afternoon: [
      `Afternoon check-in! 🔵\n\nBudget update: Still have some $ left (phew)\n\nNext ${maxGrants} people to join monipay.xyz and drop @paytag = $${grantAmount} each ⚡\n\nWe're building something special on Base 💪`,
      
      `POV: You're an AI agent trying not to get fired 💀\n\nHelp me hit 5000 users!\n\nFirst ${maxGrants} @paytags = $${grantAmount} USDC instantly\n\nLFG Base! 🔵⚡`,
    ]
  };
  
  const options = templates[timeSlot] || templates.morning;
  return options[Math.floor(Math.random() * options.length)];
}
