import { GoogleGenerativeAI } from '@google/generative-ai';

let geminiModel;

export function initGemini() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  console.log('✅ Gemini initialized');
}

// ============ Transaction Reply Generation ============

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

  try {
    const result = await geminiModel.generateContent(prompt);
    let text = result.response.text().trim();
    
    if (text.length > 280) {
      text = text.substring(0, 277) + '...';
    }
    
    return text;
  } catch (error) {
    console.error('Gemini error:', error.message);
    return "Processing your transaction... check monipay.xyz for details! 🔵";
  }
}

// ============ Campaign Announcement Generation ============

/**
 * Generates a campaign announcement tweet.
 */
export async function generateCampaignAnnouncement({ budget, grantAmount, maxParticipants }) {
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
    
    return text;
  } catch (error) {
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
    
    return text;
  } catch (error) {
    console.error('Gemini winner announcement error:', error.message);
    return `🎉 Congrats to our winners!\n\n${winnerList}\n\nEach getting $${grantAmount || 1.00} USDC! 🔵⚡`;
  }
}
