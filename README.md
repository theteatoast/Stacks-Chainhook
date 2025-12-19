# Stacks Chainhook Monitor

A real-time monitoring dashboard for Stacks mainnet smart contract interactions using [Hiro Chainhooks](https://www.hiro.so/chainhooks).

![Stacks](https://img.shields.io/badge/Stacks-Mainnet-purple)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![React](https://img.shields.io/badge/React-18-blue)

## What are Hiro Chainhooks?

**Chainhooks** are a reorg-aware webhook service for the Stacks blockchain developed by [Hiro](https://www.hiro.so). They allow developers to:

- Subscribe to real-time blockchain activity (contract calls, transfers, events)
- Define precise filters using "predicates" to capture specific on-chain data
- Receive webhook notifications when matching transactions occur
- Build reactive applications without constantly polling the blockchain

**How it works:**
1. You define a **predicate** specifying what events to monitor (e.g., all calls to your contract)
2. Chainhooks watches the Stacks blockchain in real-time
3. When a matching event occurs, it sends a POST request to your webhook URL
4. Your server processes the event data

## How This App Uses Chainhooks

This application demonstrates a complete Chainhook integration:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Stacks        │────▶│  Hiro Chainhooks │────▶│  Backend    │
│   Blockchain    │     │  (monitors)      │     │  (webhook)  │
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
                                                        ▼
                                                 ┌─────────────┐
                                                 │  Frontend   │
                                                 │  Dashboard  │
                                                 └─────────────┘
```

1. **Backend server** registers a Chainhook predicate on startup to monitor ALL contract calls to your deployed contract
2. **Hiro Chainhooks** monitors the Stacks mainnet and sends events to the `/webhook` endpoint
3. **Backend** stores events in memory and exposes them via `/events` API
4. **Frontend** displays real-time statistics and transaction list

## Project Structure

```
Stacks-Chainhook/
├── backend/
│   ├── server.js        # Express server with Chainhook integration
│   ├── package.json     # Backend dependencies
│   └── .env.example     # Environment variables template
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # React dashboard component
│   │   ├── index.css    # Styling
│   │   └── main.jsx     # Entry point
│   ├── package.json     # Frontend dependencies
│   ├── vite.config.js   # Vite configuration
│   └── index.html       # HTML template
└── README.md
```

## Prerequisites

- **Node.js** 18+ and npm
- **Hiro API Key** from [Hiro Platform](https://platform.hiro.so)
- **Deployed Stacks contract** on mainnet
- **Public URL** for webhook delivery (ngrok for local dev)

## Local Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/Stacks-Chainhook.git
cd Stacks-Chainhook

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your values:

```env
HIRO_API_KEY=your_hiro_api_key_here
CONTRACT_IDENTIFIER=SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.my-contract
WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io
PORT=3001
```

### 3. Expose Local Server (for Chainhook delivery)

Chainhooks require a public URL to deliver events. Use [ngrok](https://ngrok.com):

```bash
ngrok http 3001
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) to `WEBHOOK_BASE_URL`.

### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Access the Dashboard

Open [http://localhost:5173](http://localhost:5173) in your browser.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with status |
| `/webhook` | POST | Receives Chainhook events |
| `/events` | GET | Returns recent events (supports `?limit=N`) |
| `/stats` | GET | Returns aggregated statistics |

## Deployment

### Deploy to Render

1. Create a new **Web Service** on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add environment variables in Render dashboard
5. Use the Render URL as `WEBHOOK_BASE_URL`

For the frontend, create a separate **Static Site**:
- **Root Directory:** `frontend`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`
- Add `VITE_API_URL` pointing to your backend URL

### Deploy to Railway

1. Create a new project on [Railway](https://railway.app)
2. Connect GitHub and select your repository
3. Add backend service:
   - Set root to `/backend`
   - Add environment variables
4. Add frontend service:
   - Set root to `/frontend`
   - Add `VITE_API_URL` environment variable

## Stacks Builder Challenge Qualification

This project qualifies for the **Stacks Builder Challenge** leaderboard points by demonstrating:

✅ **Real Chainhook Integration** - Uses `@hirosystems/chainhooks-client` to register and receive real-time blockchain events

✅ **Mainnet Usage** - Monitors actual Stacks mainnet contract interactions (no testnet or mock data)

✅ **Public GitHub Repository** - Open source and available for review

✅ **Real Contract Usage** - Connects to a deployed smart contract and tracks genuine user interactions

✅ **End-to-End Implementation** - Complete working application with backend webhook handler and frontend dashboard

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `HIRO_API_KEY` | API key from Hiro Platform | `abc123...` |
| `CONTRACT_IDENTIFIER` | Your Stacks contract address | `SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.my-contract` |
| `WEBHOOK_BASE_URL` | Public URL for webhook delivery | `https://your-app.onrender.com` |
| `PORT` | Backend server port | `3001` |
| `VITE_API_URL` | Backend URL for frontend (production) | `https://your-backend.onrender.com` |

## Troubleshooting

**Chainhook not registering:**
- Verify your `HIRO_API_KEY` is valid
- Check that `WEBHOOK_BASE_URL` is publicly accessible
- Ensure `CONTRACT_IDENTIFIER` is a valid mainnet contract

**No events appearing:**
- Events only appear when real transactions occur on mainnet
- Test with a manual webhook: `curl -X POST http://localhost:3001/webhook -H "Content-Type: application/json" -d '{"apply":[{"transactions":[{"metadata":{"tx_id":"0x123","sender":"SP123"}}]}]}'`

**Frontend not connecting:**
- Verify CORS is enabled (it is by default)
- Check the API URL in browser console
- Ensure backend is running on the expected port

## License

MIT License - feel free to use this code for your own projects!

---

Built with ❤️ for the Stacks ecosystem using [Hiro Chainhooks](https://www.hiro.so/chainhooks)