// MoniBot AI Integration - Uses Lovable AI via Edge Function
// This eliminates rate limiting issues with direct Gemini API calls

const MONIBOT_AI_URL = process.env.SUPABASE_URL 
  ? `${process.env.SUPABASE_URL}/functions/v1/monibot-ai`
  : 'https://vdaeojxonqmzejwiioaq.supabase.co/functions/v1/monibot-ai';

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkYWVvanhvbnFtemVqd2lpb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3Mzk0NjksImV4cCI6MjA4NDMxNTQ2OX0.mzda_ZFMjtOybd47jTIwHlwWpDtv0LCdh4X5WaqjDKM';

// Backoff state for rate limiting
let lastQuotaError = 0;
let backoffMs = 0;

// NOTE: No silent skip codes - VP-Social replies to EVERYTHING once, then moves on

export function initGemini() {
  // No longer using Gemini directly - using Lovable AI via Edge Function
  console.log('✅ MoniBot AI initialized (using Lovable AI Edge Function)');
}

// ============ Complete Fallback Templates (v3.0) ============

const FALLBACK_TEMPLATES = {
  // Successful transaction
  success: [
    "✅ Transfer complete! Welcome to the MoniPay fam 🔵⚡",
    "Done! Your USDC just landed. Based move 🔵💰",
    "Transfer confirmed ⚡ You're officially onchain with MoniPay!",
    "Sent! 💸 Another successful transaction on Base 🔵",
    "USDC delivered! 🎯 That's how we do it on Base",
  ],
  
  // Insufficient allowance
  error_allowance: [
    "⚠️ Need to set up your MoniBot allowance first! Check your MoniPay account settings 🔧",
    "Looks like you need to approve spending first. Check your MoniBot settings in your MoniPay account! 🔵",
    "Set up your allowance in MoniPay Settings → MoniBot to enable social payments 💰",
  ],
  
  // Insufficient balance
  error_balance: [
    "📉 Not enough USDC! Fund your MoniPay account first 💰",
    "Insufficient balance! Top up your MoniPay wallet and try again 🔵",
    "Need more USDC fren! Fund your wallet and come back 💸",
  ],
  
  // Target monitag not found
  error_target: [
    "🔍 Monitag not found! Double-check and try again",
    "Monitag not found! Make sure they have a MoniPay account 🔵",
    "Hmm, can't find that monitag. Are they on MoniPay? 🤔",
  ],
  
  // Campaign limit reached (funny "too late" replies)
  limit_reached: [
    "😅 Too late fren! Campaign's full. Next time be faster! 🏃‍♂️💨",
    "Campaign's done! You missed it by *this* much 💀 Follow for the next one!",
    "All slots taken! You'll catch the next wave 🌊🔵",
    "Bruh you just missed it 😭 Set alerts for next time!",
    "The early bird gets the USDC... and you're not a bird rn 🐦💤",
    "RIP to your timing 💀 Campaign filled up! Better luck next drop",
    "Oof, campaign's at max capacity! But hey, stick around 👀",
    "You snooze you lose fren 😴 But there's always more!",
  ],
  
  // Blockchain/network error
  error_blockchain: [
    "⚠️ Blockchain hiccup! Our engineers are on it. Try again in a bit 🔧",
    "Network congestion atm. Give it 5 and retry 🔵",
    "Tech gremlins struck 🔧 We're on it! Try again shortly",
    "Temporary network issue - should clear up soon! ⚡",
  ],
  
  // Duplicate grant attempt
  error_duplicate_grant: [
    "You already claimed this one fren! One per campaign 🎯",
    "Nice try but you already got yours! 😎",
    "Already in your wallet from this campaign! Check your balance 💰",
  ],
  
  // Treasury empty
  error_treasury_empty: [
    "🏦 Campaign funds are depleted! Check back for the next one",
    "Treasury's empty for this campaign - you'll catch the next drop! 🔵",
    "Campaign budget exhausted! More coming soon 💰",
  ],
  
  // Max retries exceeded
  max_retries: [
    "We had trouble processing this one. Check your MoniPay account for details! 🔵",
    "Something went sideways, but your account will show the status 💰",
  ],
  
  // ============ Reply-All Templates (every tweet gets a response) ============
  
  // No valid monitag mentioned in the reply
  skip_no_paytag: [
    "Drop your @monitag to claim! Create a MoniPay account if you don't have one 🔵",
    "Need your @monitag to send you USDC! Set one up at MoniPay ⚡",
    "Reply with your @monitag to claim! 💰",
  ],
  
  // Campaign inactive
  skip_campaign_inactive: [
    "This campaign has ended! Follow @MoniBot for the next one 🔵",
    "Campaign's wrapped up! Stay tuned for more drops ⚡",
  ],
  
  // Already granted (DB or on-chain)
  skip_duplicate: [
    "You already got yours from this campaign! Check your MoniPay account 💰",
    "One per person fren! You've already claimed 🎯",
    "Already sent to you earlier! Check your balance 🔵",
  ],
  
  // Invalid P2P syntax (couldn't parse amount or target)
  skip_invalid_syntax: [
    "Couldn't parse that command! Format: @MoniBot send $5 to @monitag 🔵",
    "Hmm, didn't catch that. Try: send $X to @monitag ⚡",
  ],
  
  // Sender not registered in MoniPay (P2P)
  skip_sender_not_found: [
    "You need a MoniPay account first! Create your @monitag to send USDC 🔵",
    "Create your MoniPay account to use social payments! ⚡",
  ],
  
  // Default fallback
  default: [
    "Processing... check your MoniPay account for details! 🔵",
    "Transaction processed! Check your MoniPay account for the full story 💰",
  ]
};

function getRandomFallback(type) {
  const templates = FALLBACK_TEMPLATES[type] || FALLBACK_TEMPLATES.default;
  return templates[Math.floor(Math.random() * templates.length)];
}

function getTemplateTypeFromTx(tx) {
  const outcome = tx.tx_hash || '';
  const status = tx.status || '';
  
  // Check status first
  if (status === 'limit_reached') return 'limit_reached';
  
  // Check tx_hash for error/skip codes
  if (outcome.startsWith('0x')) return 'success';
  if (outcome === 'LIMIT_REACHED') return 'limit_reached';
  if (outcome === 'ERROR_ALLOWANCE') return 'error_allowance';
  if (outcome === 'ERROR_BALANCE') return 'error_balance';
  if (outcome === 'ERROR_TARGET_NOT_FOUND') return 'error_target';
  if (outcome === 'ERROR_DUPLICATE_GRANT') return 'error_duplicate_grant';
  if (outcome === 'ERROR_TREASURY_EMPTY') return 'error_treasury_empty';
  if (outcome.includes('ERROR_BLOCKCHAIN')) return 'error_blockchain';
  if (outcome.includes('MAX_RETRIES')) return 'max_retries';
  
  // Reply-All codes (these used to be silent, now they get replies)
  if (outcome === 'SKIP_NO_PAYTAG') return 'skip_no_paytag';
  if (outcome === 'SKIP_CAMPAIGN_INACTIVE') return 'skip_campaign_inactive';
  if (outcome === 'SKIP_DUPLICATE_GRANT_DB') return 'skip_duplicate';
  if (outcome === 'SKIP_DUPLICATE_GRANT_ONCHAIN') return 'skip_duplicate';
  if (outcome === 'SKIP_ALREADY_ONCHAIN') return 'skip_duplicate';
  if (outcome === 'SKIP_INVALID_SYNTAX') return 'skip_invalid_syntax';
  if (outcome === 'ERROR_SENDER_NOT_FOUND') return 'skip_sender_not_found';
  
  return 'default';
}

// ============ Edge Function Caller ============

async function callMoniBotAI(action, context) {
  // Check if we're in backoff period
  const now = Date.now();
  if (backoffMs > 0 && now < lastQuotaError + backoffMs) {
    const remainingMs = (lastQuotaError + backoffMs) - now;
    console.log(`  ⏳ In backoff period, ${Math.ceil(remainingMs / 1000)}s remaining.`);
    return null; // Signal to use fallback
  }

  try {
    const response = await fetch(MONIBOT_AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action, context }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ❌ MoniBot AI error (${response.status}):`, errorText);
      
      // Check for rate limiting
      if (response.status === 429 || response.status === 402) {
        console.log('  ⚠️ Rate limited. Applying backoff...');
        backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 60000, 300000);
        lastQuotaError = now;
        console.log(`  ⏳ Backoff set to ${Math.ceil(backoffMs / 1000)}s`);
      }
      
      return null;
    }

    const data = await response.json();
    
    // Reset backoff on success
    if (data.text && !data.fallback) {
      backoffMs = 0;
    }
    
    return data.text;
  } catch (error) {
    console.error('  ❌ MoniBot AI request failed:', error.message);
    return null;
  }
}

// ============ Transaction Reply Generation ============

/**
 * Generates a reply with fallback for errors.
 * Includes recipient info for personalization.
 */
export async function generateReplyWithBackoff(tx) {
  // Build context with both payer and recipient info
  const context = {
    ...tx,
    recipient_tag: tx.recipient_pay_tag || 'unknown',
    payer_tag: tx.payer_pay_tag || 'MoniBot',
    type: tx.type || 'grant',
    status: tx.status || 'completed'
  };
  
  const result = await callMoniBotAI('generate-reply', context);

  const baseText = result || getRandomFallback(getTemplateTypeFromTx(tx));

  // Include tx hash as plain text on success - users can verify at basescan.org
  if (tx?.tx_hash && String(tx.tx_hash).startsWith('0x')) {
    // Personalize with recipient if available
    const recipientMention = tx.recipient_pay_tag ? `@${tx.recipient_pay_tag}` : '';
    const prefix = recipientMention ? `${recipientMention} ` : '';
    return `${prefix}${baseText}\n\nVerify at basescan dot org:\n${tx.tx_hash}`;
  }

  return baseText;
}

/**
 * Generates a personality-driven Twitter reply based on the transaction outcome.
 */
export async function generateReply(tx) {
  return generateReplyWithBackoff(tx);
}

// ============ Campaign Announcement Generation ============

/**
 * Generates a campaign announcement tweet.
 */
export async function generateCampaignAnnouncement({ budget, grantAmount, maxParticipants }) {
  const result = await callMoniBotAI('generate-campaign', {
    budget,
    grantAmount,
    maxParticipants,
  });
  
  if (result) {
    return result;
  }
  
  // Use fallback
  return `🔵 GM Base!\n\nFirst ${maxParticipants} to drop their @monitag below get $${grantAmount} USDC!\n\nCreate your MoniPay account to claim! ⚡`;
}

// ============ Winner Announcement Generation ============

/**
 * Generates a winner announcement tweet for random picks.
 */
export async function generateWinnerAnnouncement({ winners, count, grantAmount, originalAuthor, originalTweetId }) {
  const result = await callMoniBotAI('generate-winner', {
    winners,
    count,
    grantAmount,
    originalAuthor,
  });
  
  if (result) {
    return result;
  }
  
  // Use fallback
  const winnerList = winners.map(w => `@${w.payTag || w.username}`).join(', ');
  return `🎉 Congrats to our winners!\n\n${winnerList}\n\nEach getting $${grantAmount || 1.00} USDC! 🔵⚡`;
}
