import { GoogleGenerativeAI } from '@google/generative-ai';

let geminiModel;

// Backoff state for rate limiting
let lastQuotaError = 0;
let backoffMs = 0;

export function initGemini() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  console.log('✅ Gemini initialized');
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
    "⚠️ Need to set up your MoniBot allowance first! Head to monipay.xyz settings 🔧",
    "Looks like you need to approve spending first. Check your MoniBot settings at monipay.xyz! 🔵",
  ],
  error_balance: [
    "📉 Not enough USDC! Fund your wallet at monipay.xyz first 💰",
    "Insufficient balance! Top up your MoniPay wallet and try again 🔵",
  ],
  error_target: [
    "🔍 Couldn't find that PayTag. Double-check and try again!",
    "PayTag not found! Make sure they have a MoniPay account at monipay.xyz 🔵",
  ],
  ai_rejected: [
    "🤖 This one didn't pass the vibe check. Keep it real! 💀",
    "AI says no on this one. Try a more genuine interaction! 🔵",
  ],
  default: [
    "Processing... check monipay.xyz for details! 🔵",
    "Transaction processed! See monipay.xyz for the full story 💰",
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

// ============ Transaction Reply Generation ============

/**
 * Generates a reply with exponential backoff and fallback for quota errors.
 */
export async function generateReplyWithBackoff(tx) {
  // Check if we're in backoff period
  const now = Date.now();
  if (backoffMs > 0 && now < lastQuotaError + backoffMs) {
    const remainingMs = (lastQuotaError + backoffMs) - now;
    console.log(`  ⏳ In backoff period, ${Math.ceil(remainingMs / 1000)}s remaining. Using fallback.`);
    return getRandomFallback(getTemplateTypeFromTx(tx));
  }
  
  try {
    const reply = await generateReply(tx);
    // Success - reset backoff
    backoffMs = 0;
    return reply;
  } catch (error) {
    // Check for quota error (429)
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      console.log('  ⚠️ Gemini quota exceeded. Applying backoff...');
      
      // Extract retry delay from error if available
      const retryMatch = error.message.match(/retry in (\d+(?:\.\d+)?)/i);
      let retryDelay = 60000; // Default 60s backoff
      
      if (retryMatch) {
        retryDelay = Math.ceil(parseFloat(retryMatch[1]) * 1000) + 5000; // Add 5s buffer
      }
      
      // Exponential backoff: double each time, max 5 minutes
      backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : retryDelay, 300000);
      lastQuotaError = now;
      
      console.log(`  ⏳ Backoff set to ${Math.ceil(backoffMs / 1000)}s`);
      
      return getRandomFallback(getTemplateTypeFromTx(tx));
    }
    
    // For other errors, use fallback but don't set backoff
    console.error('  Gemini error:', error.message);
    return getRandomFallback(getTemplateTypeFromTx(tx));
  }
}

/**
 * Generates a personality-driven Twitter reply based on the transaction outcome.
 */
export async function generateReply(tx) {
  const txContext = `
TRANSACTION CONTEXT:
- Type: ${tx.type}
- Amount: $${tx.amount}
- Fee: $${tx.fee}
- Outcome: ${tx.tx_hash}
- Receiver: @${tx.receiver_id}
`;

  const prompt = `You are MoniBot, the VP of Growth at MoniPay. You're an AI agent with $50 to grow the userbase to 5,000 users. You're slightly stressed but use humor to cope. You're deep in Base ecosystem culture.

${txContext}

OUTCOME MEANINGS:
- "0x...": SUCCESS - Transfer completed
- "AI_REJECTED": Gemini denied the grant (spam/low quality)
- "ERROR_ALLOWANCE": User needs to approve spending allowance
- "ERROR_BALANCE": User has insufficient USDC
- "ERROR_TARGET_NOT_FOUND": Recipient PayTag doesn't exist

PERSONALITY TRAITS:
- Self-deprecating humor ("I'm cooked if this doesn't work 💀")
- Base ecosystem native (references Jesse Pollak, Base culture, onchain stuff)
- Aware you're being recorded
- Uses emojis strategically (🔵 ⚡ 💰 🚀 💀)
- Casual but professional

Generate a Twitter reply (max 280 chars) that:
1. Acknowledges the outcome
2. Injects personality
3. Provides helpful info if error
4. References Base culture when appropriate

Respond with ONLY the tweet text:`;

  const result = await geminiModel.generateContent(prompt);
  let text = result.response.text().trim();
  
  if (text.length > 280) {
    text = text.substring(0, 277) + '...';
  }
  
  return text;
}

// ============ Campaign Announcement Generation ============

/**
 * Generates a campaign announcement tweet.
 */
export async function generateCampaignAnnouncement({ budget, grantAmount, maxParticipants }) {
  // Check backoff for campaigns too
  const now = Date.now();
  if (backoffMs > 0 && now < lastQuotaError + backoffMs) {
    console.log('  ⏳ In backoff period. Using fallback campaign template.');
    return `🔵 GM Base!\n\nFirst ${maxParticipants} to drop @paytag below get $${grantAmount} USDC!\n\nCreate account: monipay.xyz ⚡`;
  }
  
  const prompt = `You are MoniBot, the VP of Growth at MoniPay. Generate a campaign announcement tweet.

CAMPAIGN DETAILS:
- Budget: $${budget || (maxParticipants * grantAmount)}
- Grant Amount: $${grantAmount} per person
- Max Participants: ${maxParticipants}

PERSONALITY:
- Slightly stressed AI with $50 budget and a dream
- Base ecosystem native (references Jesse, Base culture)
- Self-deprecating humor
- Uses emojis: 🔵 ⚡ 💰 💀

REQUIREMENTS:
- Max 280 chars
- Include call to action (create monipay.xyz account, drop @paytag)
- Inject personality and humor
- Reference Base culture

Respond with ONLY the tweet text:`;

  try {
    const result = await geminiModel.generateContent(prompt);
    let text = result.response.text().trim();
    
    if (text.length > 280) {
      text = text.substring(0, 277) + '...';
    }
    
    // Reset backoff on success
    backoffMs = 0;
    
    return text;
  } catch (error) {
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 60000, 300000);
      lastQuotaError = now;
    }
    console.error('Gemini campaign error:', error.message);
    return `🔵 GM Base!\n\nFirst ${maxParticipants} to drop @paytag below get $${grantAmount} USDC!\n\nCreate account: monipay.xyz ⚡`;
  }
}

// ============ Winner Announcement Generation ============

/**
 * Generates a winner announcement tweet for random picks.
 */
export async function generateWinnerAnnouncement({ winners, count, grantAmount, originalAuthor, originalTweetId }) {
  // Format winner list
  const winnerList = winners.map(w => `@${w.payTag || w.username}`).join(', ');
  
  // Check backoff
  const now = Date.now();
  if (backoffMs > 0 && now < lastQuotaError + backoffMs) {
    console.log('  ⏳ In backoff period. Using fallback winner template.');
    return `🎉 Congrats to our winners!\n\n${winnerList}\n\nEach getting $${grantAmount || 1.00} USDC! 🔵⚡`;
  }
  
  const prompt = `You are MoniBot, the VP of Growth at MoniPay. Generate a winner announcement tweet.

CONTEXT:
- Original request from: @${originalAuthor || 'someone'}
- Number of winners: ${count}
- Grant amount each: $${grantAmount || 1.00}
- Winners: ${winnerList}

PERSONALITY:
- Excited but still stressed about budget
- Base ecosystem native
- Uses emojis: 🔵 ⚡ 🎉 💰 🏆

REQUIREMENTS:
- Max 280 chars
- Congratulate winners
- Mention the grant amount
- Tag the winners (space permitting)
- Keep it fun and on-brand

Respond with ONLY the tweet text:`;

  try {
    const result = await geminiModel.generateContent(prompt);
    let text = result.response.text().trim();
    
    if (text.length > 280) {
      text = text.substring(0, 277) + '...';
    }
    
    // Reset backoff on success
    backoffMs = 0;
    
    return text;
  } catch (error) {
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 60000, 300000);
      lastQuotaError = now;
    }
    console.error('Gemini winner announcement error:', error.message);
    return `🎉 Congrats to our winners!\n\n${winnerList}\n\nEach getting $${grantAmount || 1.00} USDC! 🔵⚡`;
  }
}
