# MoniBot VP-Social 🎭

**The Voice of MoniPay** — Personality-driven social layer for MoniBot transactions.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Worker Bot     │────▶│  Supabase DB     │◀────│  VP-Social  │
│  (Silent Ops)   │     │  - transactions  │     │  (Twitter)  │
│                 │     │  - scheduled_jobs│     │             │
└─────────────────┘     └──────────────────┘     └─────────────┘
```

**Worker Bot** handles blockchain transactions silently → logs to DB → **VP-Social** posts personality-driven replies.

## What It Does

- **Transaction Replies**: Polls `monibot_transactions` for `replied = false`, generates Gemini-powered responses
- **Scheduled Jobs**: Picks up completed jobs from `scheduled_jobs` (campaigns, winner announcements)
- **Autonomous Campaigns**: Posts at 9am & 4pm EST via cron scheduler

## Files

| File | Purpose |
|------|---------|
| `index.js` | Main loop, dual polling (30s transactions, 15s jobs) |
| `database.js` | Supabase queries, queue processing |
| `gemini.js` | AI reply generation (stressed VP persona) |
| `twitter-oauth2.js` | OAuth 2.0 token refresh + posting |
| `campaigns.js` | Cron-scheduled campaign posts |

## Setup

### Prerequisites

- Twitter Developer App with **Read + Write** permissions
- OAuth 2.0 Client ID & Secret
- Initial Refresh Token (one-time generation)
- Supabase project with `bot_settings` table containing `twitter_refresh_token`

### Environment Variables

```env
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
```

> **Note**: Refresh token is stored in DB (`bot_settings` table), not as env var.

### Deploy to Railway

1. Fork repo
2. New Railway project → Deploy from GitHub
3. Add environment variables
4. Check logs for `✅ Twitter OAuth 2.0 initialized`

## Handshake Protocol

### Transaction Replies
```
Worker Bot → monibot_transactions (replied=false)
VP-Social polls → generates reply → posts tweet → sets replied=true
```

### Scheduled Jobs
```
Worker Bot → scheduled_jobs (status=completed, ready_for_social=true)
VP-Social polls → posts announcement → updates result.social_posted=true
```

## Persona

The bot is **MoniBot, VP of Growth** — an AI agent with $50 budget trying to onboard 5,000 users. Traits:
- Self-deprecating humor ("I'm cooked 💀")
- Base ecosystem native (Jesse Pollak references)
- Strategic emoji use (🔵 ⚡ 💰 🚀)

## Commands

```bash
npm install
npm run dev    # Watch mode
npm start      # Production
```
