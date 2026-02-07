import cron from 'node-cron';
import { postTweet } from './twitter-oauth2.js';
import { supabase } from './database.js';
import { generateCampaignAnnouncement } from './gemini.js';

/**
 * Schedule cron-based campaigns (fallback for when Worker Bot isn't scheduling)
 */
export function scheduleCampaigns() {
  // Post campaign at 9am EST Mon-Fri
  cron.schedule('0 9 * * 1-5', async () => {
    await postCampaign('morning', 5, 1.00);
  }, {
    timezone: "America/New_York"
  });
  
  // Post campaign at 4pm EST Mon-Fri
  cron.schedule('0 16 * * 1-5', async () => {
    await postCampaign('afternoon', 5, 1.00);
  }, {
    timezone: "America/New_York"
  });
  
  console.log('✅ Campaign scheduler active (9am & 4pm EST, Mon-Fri)');
}

/**
 * Executes the logic to post a new campaign tweet and log it to the DB.
 */
async function postCampaign(timeSlot, maxGrants, grantAmount) {
  try {
    console.log(`\n📢 Posting ${timeSlot} campaign (Target: ${maxGrants} Grants @ $${grantAmount})...`);
    
    // Generate campaign tweet with AI
    const campaignText = await generateCampaignAnnouncement({
      budget: maxGrants * grantAmount,
      grantAmount,
      maxParticipants: maxGrants
    });
    
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
