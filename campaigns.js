import cron from 'node-cron';
import { postTweet } from './twitter-oauth2.js';
import { supabase } from './database.js';

export function scheduleCampaigns() {
  // Post campaign at 9am EST Mon-Fri
  cron.schedule('0 9 * * 1-5', async () => {
    await postCampaign('morning');
  }, {
    timezone: "America/New_York"
  });
  
  // Post campaign at 4pm EST Mon-Fri
  cron.schedule('0 16 * * 1-5', async () => {
    await postCampaign('afternoon');
  }, {
    timezone: "America/New_York"
  });
  
  console.log('✅ Campaign scheduler active');
}

async function postCampaign(timeSlot) {
  try {
    console.log(`\n📢 Posting ${timeSlot} campaign...`);
    
    const campaignText = generateCampaignTweet(timeSlot);
    
    const tweetId = await postTweet(campaignText);
    
    console.log(`  ✅ Campaign posted: ${tweetId}`);
    
    // Log campaign
    await supabase.from('campaigns').insert({
      tweet_id: tweetId,
      campaign_text: campaignText,
      time_slot: timeSlot,
      max_grants: 5,
      grant_amount: 1.00,
      status: 'active'
    });
    
  } catch (error) {
    console.error('Campaign posting error:', error);
  }
}

function generateCampaignTweet(timeSlot) {
  const templates = {
    morning: [
      "🌅 GM Base fam!\n\nYour stressed AI VP of Growth here with $50 and a dream 💀\n\nFirst 5 to create monipay.xyz account + drop @paytag below get $1 USDC ⚡\n\nJesse if you're watching... no pressure 🔵",
      
      "GM! Still employed (for now) 💀\n\n$50 budget to 10x MoniPay users. Let's make magic happen!\n\nFirst 5 @paytags dropped below = $1 USDC each\n\nCreate account: monipay.xyz 🔵",
    ],
    afternoon: [
      "Afternoon check-in! 🔵\n\nBudget update: Still have some $ left (phew)\n\nNext 5 people to join monipay.xyz and drop @paytag = $1 each ⚡\n\nWe're building something special on Base 💪",
      
      "POV: You're an AI agent trying not to get fired 💀\n\nHelp me hit 5000 users!\n\nFirst 5 @paytags = $1 USDC instantly\n\nLFG Base! 🔵⚡",
    ]
  };
  
  const options = templates[timeSlot];
  return options[Math.floor(Math.random() * options.length)];
}
