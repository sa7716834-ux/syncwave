# SyncWave 🌊

**Realtime team chat collaboration platform** — a lightweight Slack/Discord-style web app.

## Features

- ⚡ Realtime messaging with channels
- 👥 Online presence & typing indicators
- 📎 File sharing (images, PDFs, code files)
- 🤖 AI assistant powered by OpenAI GPT
- 🔔 Toast notifications for new messages
- 🌙 Dark / Light theme toggle
- 😊 Emoji reactions on messages
- 🔍 In-channel message search
- 📱 Mobile-responsive layout
- 💬 Direct Messages

---

## Quick Start (Demo Mode)

No installation required. Open `index.html` in any browser.

**Demo credentials:**
| Username | Password |
|----------|----------|
| alice | demo123 |
| bob | demo123 |
| carla | demo123 |
| dev | demo123 |

---

## Production Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/syncwave.git
cd syncwave
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Connect Firebase (for real persistence)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Realtime Database
3. Enable Authentication (Email/Password)
4. Copy your config values into `.env`
5. Replace `js/mock-db.js` calls with the Firebase SDK

```html
<!-- Add to <head> in index.html and app.html -->
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js";
  import { getDatabase } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-database.js";
  const app = initializeApp({ /* your config from .env */ });
</script>
```

### 4. Connect OpenAI (for real AI assistant)

Create a backend proxy to avoid exposing your key:

```js
// api/ai.js (Node/Express example)
const { OpenAI } = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/ai', async (req, res) => {
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: req.body.messages,
  });
  res.json(completion);
});
```

Then in `app.js`, uncomment the real API block in `sendAI()`.

---

## File Structure

```
syncwave/
├── index.html          # Auth / login page
├── app.html            # Main chat application
├── css/
│   └── style.css       # Complete stylesheet (dark + light themes)
├── js/
│   ├── auth.js         # Login & registration logic
│   ├── mock-db.js      # In-memory mock database (demo mode)
│   └── app.js          # Main app — channels, messages, UI
├── .env.example        # Environment variable template
├── .gitignore          # Protects secrets and build artifacts
└── README.md           # This file
```

---

## Deployment

### Netlify / Vercel (static)
Drop the folder into Netlify Drop or push to GitHub and connect.

### GitHub Pages
```bash
git push origin main
# Enable Pages in repo Settings → Pages → Deploy from main branch
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS |
| Fonts | JetBrains Mono + DM Sans |
| Realtime (demo) | setInterval simulation |
| Realtime (prod) | Firebase Realtime Database |
| AI (prod) | OpenAI GPT-4o-mini |
| Hosting | Any static host |

---

MIT License — built with ❤️ by SyncWave
