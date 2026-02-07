// MoniBot AI Integration - Uses Lovable AI via Edge Function
// This eliminates rate limiting issues with direct Gemini API calls

const MONIBOT_AI_URL = process.env.SUPABASE_URL 
  ? `${process.env.SUPABASE_URL}/functions/v1/monibot-ai`
  : 'https://vdaeojxonqmzejwiioaq.supabase.co/functions/v1/monibot-ai';

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkYWVvanhvbnFtemVqd2lpb2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3Mzk0NjksImV4cCI6MjA4NDMxNTQ2OX0.mzda_ZFMjtOybd47jTIwHlwWpDtv0LCdh4X5WaqjDKM';

// Backoff state for rate limiting
let lastQuotaError = 0;
let backoffMs = 0;

export function initGemini() {
  // No longer using Gemini directly - using Lovable AI via Edge Function
  console.log('✅ MoniBot AI initialized (using Lovable AI Edge Function)');
}

// ============ Fallback Templates ============

const FALLBACK_TEMPLATES = {
  success: [
    "✅ Transfer complete! Welcome to the MoniPay fam 🔵⚡",
    "Done! Your USDC just landed. Based move 🔵💰",
    "Transfer confirmed ⚡ You're officially onchain with MoniPay!",
    "Sent! 💸 Another successful transaction on Base 🔵",
  ],
  error_allowance: [
    "⚠️ Need to set up your MoniBot allowance first! Check your MoniPay account settings 🔧",
    "Looks like you need to approve spending first. Check your MoniBot settings in your MoniPay account! 🔵",
  ],
  error_balance: [
    "📉 Not enough USDC! Fund your MoniPay account first 💰",
    "Insufficient balance! Top up your MoniPay wallet and try again 🔵",
  ],
  error_target: [
    "🔍 Couldn't find that PayTag. Double-check and try again!",
    "PayTag not found! Make sure they have a MoniPay account 🔵",
  ],
  ai_rejected: [
    "🤖 This one didn't pass the vibe check. Keep it real! 💀",
    "AI says no on this one. Try a more genuine interaction! 🔵",
  ],
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
  
  if (outcome.startsWith('0x')) return 'success';
  if (outcome.includes('AI_REJECTED')) return 'ai_rejected';
  if (outcome.includes('ERROR_ALLOWANCE')) return 'error_allowance';
  if (outcome.includes('ERROR_BALANCE')) return 'error_balance';
  if (outcome.includes('ERROR_TARGET')) return 'error_target';
  
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
 */
export async function generateReplyWithBackoff(tx) {
  const result = await callMoniBotAI('generate-reply', tx);

  const baseText = result || getRandomFallback(getTemplateTypeFromTx(tx));

  // Include tx hash as plain text on success - users can verify at basescan.org
  if (tx?.tx_hash && String(tx.tx_hash).startsWith('0x')) {
    return `${baseText}\n\nCheck your MoniPay account or scan this tx at basescan dot org:\n${tx.tx_hash}`;
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
  return `🔵 GM Base!\n\nFirst ${maxParticipants} to drop @paytag below get $${grantAmount} USDC!\n\nCreate your MoniPay account to claim! ⚡`;
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
