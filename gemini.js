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
    "Transfer complete. USDC delivered to your MoniPay wallet.",
    "Done. Your USDC just landed. Welcome onchain.",
    "Transfer confirmed. You're officially on Base with MoniPay.",
    "Sent. Another successful transaction on Base.",
    "USDC delivered. That's how it works on MoniPay.",
  ],
  
  // Insufficient allowance
  error_allowance: [
    "You need to approve your MoniBot spending allowance first. Open MoniPay → Settings → MoniBot and set your allowance.",
    "Your allowance isn't set up yet. Go to MoniPay → Settings → MoniBot to approve spending.",
    "Can't process this: no spending allowance found. Set it up in MoniPay under Settings → MoniBot.",
  ],
  
  // Insufficient balance
  error_balance: [
    "Not enough USDC in your wallet. Fund your MoniPay account and try again.",
    "Insufficient balance. Top up your MoniPay wallet first, then resend.",
    "Your wallet balance is too low for this transfer. Add USDC to your MoniPay account.",
  ],
  
  // Target monitag not found
  error_target: [
    "That monitag doesn't exist. Double-check the spelling or ask the recipient to create a MoniPay account.",
    "Monitag not found. The recipient needs a MoniPay account before you can send to them.",
    "Can't find that monitag. Make sure they've registered on MoniPay.",
  ],
  
  // Campaign limit reached
  limit_reached: [
    "Campaign is full. All spots have been claimed. Follow MoniBot for the next one.",
    "Too late — this campaign already hit its participant limit. Stay tuned for the next drop.",
    "All slots taken. You'll catch the next campaign.",
    "Campaign's at capacity. Better luck next time.",
  ],
  
  // Blockchain/network error
  error_blockchain: [
    "Transaction failed due to a network issue. Try again in a few minutes.",
    "Temporary blockchain hiccup. Our team is aware. Please retry shortly.",
    "Network congestion caused this to fail. Wait a moment and try again.",
  ],
  
  // Duplicate grant attempt
  error_duplicate_grant: [
    "You've already claimed from this campaign. One per person.",
    "Already sent to you for this campaign. Check your MoniPay balance.",
  ],
  
  // Treasury empty
  error_treasury_empty: [
    "Campaign funds are depleted. Check back for the next one.",
    "This campaign's budget is exhausted. More drops coming soon.",
  ],
  
  // Max retries exceeded
  max_retries: [
    "We couldn't process this after multiple attempts. Check your MoniPay account for status.",
  ],
  
  // No valid monitag mentioned in the reply
  skip_no_paytag: [
    "Drop your monitag to claim. Need a MoniPay account? Create one first.",
    "Reply with your monitag to receive. No monitag = no transfer.",
  ],
  
  // Campaign inactive
  skip_campaign_inactive: [
    "This campaign has ended. Follow MoniBot for future drops.",
    "Campaign's closed. Stay tuned for the next one.",
  ],
  
  // Already granted (DB or on-chain)
  skip_duplicate: [
    "You already received from this campaign. Check your MoniPay balance.",
    "One per person. You've already been sent USDC for this campaign.",
  ],
  
  // Invalid P2P syntax
  skip_invalid_syntax: [
    "Couldn't parse that. Use: @monibot send $5 to monitag",
    "Invalid format. Try: @monibot send $X to monitag",
  ],
  
  // Sender not registered
  skip_sender_not_found: [
    "You need a MoniPay account first. Create your monitag to use social payments.",
    "No MoniPay account found for you. Sign up and link your X account to send USDC.",
  ],
  
  // Multi-recipient batch
  multi_success: [
    "Batch transfer complete. All recipients received their USDC.",
  ],
  multi_partial: [
    "Batch partially completed. See details above.",
  ],
  multi_failed: [
    "Batch transfer failed. Check error details above.",
  ],
  
  // Default fallback
  default: [
    "Check your MoniPay account for transaction details.",
    "Transaction processed. See your MoniPay account for the full receipt.",
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
  const templateType = getTemplateTypeFromTx(tx);
  
  // For error/skip cases, use curated fallback templates directly — they are
  // more specific and actionable than generic AI responses.
  if (templateType !== 'success' && templateType !== 'default') {
    console.log(`  📝 Using curated template for: ${templateType}`);
    const baseText = getRandomFallback(templateType);

    if (tx?.tx_hash && String(tx.tx_hash).startsWith('0x')) {
      const recipientLabel = tx.recipient_pay_tag ? `monitag: ${tx.recipient_pay_tag}` : '';
      const shortHash = tx.tx_hash.substring(0, 18) + '...';
      const suffix = recipientLabel ? ` → ${recipientLabel}` : '';
      return `${baseText}${suffix}\n\nTx: ${shortHash}`;
    }

    return baseText;
  }

  // For success cases, try AI for a more personalized reply
  const context = {
    ...tx,
    recipient_tag: tx.recipient_pay_tag || 'unknown',
    payer_tag: tx.payer_pay_tag || 'MoniBot',
    type: tx.type || 'p2p_command',
    status: tx.status || 'completed',
    template_type: templateType
  };
  
  const result = await callMoniBotAI('generate-reply', context);
  const baseText = result || getRandomFallback(templateType);

  // Include shortened tx hash on success - no URLs, no @ mentions
  if (tx?.tx_hash && String(tx.tx_hash).startsWith('0x')) {
    const recipientLabel = tx.recipient_pay_tag ? `monitag: ${tx.recipient_pay_tag}` : '';
    const shortHash = tx.tx_hash.substring(0, 18) + '...';
    const suffix = recipientLabel ? ` → ${recipientLabel}` : '';
    return `${baseText}${suffix}\n\nTx: ${shortHash}`;
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
  
  // Use fallback - no @ mentions
  return `🔵 GM Base!\n\nFirst ${maxParticipants} to drop their monitag below get $${grantAmount} USDC!\n\nCreate your MoniPay account to claim! ⚡`;
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
