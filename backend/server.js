import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// In-memory storage for events
const events = [];
const MAX_EVENTS = 100; // Keep last 100 events

// Environment variables
const HIRO_API_KEY = process.env.HIRO_API_KEY;
const CONTRACT_IDENTIFIER = process.env.CONTRACT_IDENTIFIER;
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL;

// Validate required environment variables
if (!HIRO_API_KEY || !CONTRACT_IDENTIFIER || !WEBHOOK_BASE_URL) {
    console.error("❌ Missing required environment variables:");
    if (!HIRO_API_KEY) console.error("  - HIRO_API_KEY");
    if (!CONTRACT_IDENTIFIER) console.error("  - CONTRACT_IDENTIFIER");
    if (!WEBHOOK_BASE_URL) console.error("  - WEBHOOK_BASE_URL");
    process.exit(1);
}

// Chainhook predicate for monitoring contract calls
const chainhookId = `contract-monitor-${uuidv4().slice(0, 8)}`;

const chainhookPredicate = {
    chain: "stacks",
    uuid: chainhookId,
    name: `Monitor ${CONTRACT_IDENTIFIER}`,
    version: 1,
    networks: {
        mainnet: {
            if_this: {
                scope: "contract_call",
                contract_identifier: CONTRACT_IDENTIFIER,
                method: "*" // Listen to ALL methods
            },
            then_that: {
                http_post: {
                    url: `${WEBHOOK_BASE_URL}/webhook`,
                    authorization_header: "Bearer chainhook-secret"
                }
            },
            start_block: 1, // Start from block 1 to catch all events
            expire_after_occurrence: null // Never expire
        }
    }
};

/**
 * Register Chainhook with Hiro Platform API
 */
async function registerChainhook() {
    console.log("🔗 Registering Chainhook...");
    console.log(`   Contract: ${CONTRACT_IDENTIFIER}`);
    console.log(`   Webhook URL: ${WEBHOOK_BASE_URL}/webhook`);

    try {
        const response = await fetch("https://api.hiro.so/v1/chainhooks", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": HIRO_API_KEY
            },
            body: JSON.stringify(chainhookPredicate)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log("✅ Chainhook registered successfully!");
        console.log(`   Chainhook ID: ${chainhookId}`);
        return result;
    } catch (error) {
        console.error("❌ Failed to register Chainhook:", error.message);
        // Don't exit - the server can still receive webhooks if already registered
        console.log("⚠️  Server will continue running. Chainhook may already be registered.");
    }
}

/**
 * Parse Chainhook event payload and extract transaction details
 */
function parseEventPayload(payload) {
    const parsedEvents = [];

    try {
        // Chainhook sends events in 'apply' array for new blocks
        const apply = payload.apply || [];

        for (const block of apply) {
            const blockHeight = block.block_identifier?.index || block.metadata?.block_height;
            const transactions = block.transactions || [];

            for (const tx of transactions) {
                const txDetails = tx.metadata || tx;

                parsedEvents.push({
                    id: uuidv4(),
                    txid: txDetails.tx_id || tx.transaction_identifier?.hash || "unknown",
                    sender: txDetails.sender || txDetails.sender_address || "unknown",
                    blockHeight: blockHeight || 0,
                    contractId: CONTRACT_IDENTIFIER,
                    method: txDetails.contract_call?.function_name || txDetails.kind?.data?.contract_call?.function_name || "unknown",
                    success: txDetails.success !== false,
                    timestamp: new Date().toISOString(),
                    raw: tx // Store raw data for debugging
                });
            }
        }
    } catch (error) {
        console.error("Error parsing event payload:", error);
        // Still create a basic event record
        parsedEvents.push({
            id: uuidv4(),
            txid: "parse-error",
            sender: "unknown",
            blockHeight: 0,
            contractId: CONTRACT_IDENTIFIER,
            method: "unknown",
            success: false,
            timestamp: new Date().toISOString(),
            raw: payload,
            parseError: error.message
        });
    }

    return parsedEvents;
}

// ===== API ROUTES =====

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        contract: CONTRACT_IDENTIFIER,
        eventsCount: events.length
    });
});

/**
 * Webhook endpoint - receives Chainhook events
 */
app.post("/webhook", (req, res) => {
    console.log("\n📥 Received Chainhook event at", new Date().toISOString());

    try {
        const payload = req.body;

        // Log the raw payload for debugging
        console.log("Payload type:", payload.chainhook?.is_streaming_blocks ? "streaming" : "standard");

        // Parse and store events
        const newEvents = parseEventPayload(payload);

        for (const event of newEvents) {
            console.log(`   📝 TX: ${event.txid.slice(0, 16)}... | Sender: ${event.sender.slice(0, 16)}... | Block: ${event.blockHeight}`);

            // Add to beginning of array (newest first)
            events.unshift(event);
        }

        // Trim to max events
        while (events.length > MAX_EVENTS) {
            events.pop();
        }

        console.log(`   ✅ Stored ${newEvents.length} event(s). Total: ${events.length}`);

        res.status(200).json({
            success: true,
            eventsProcessed: newEvents.length
        });
    } catch (error) {
        console.error("❌ Error processing webhook:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get events endpoint - returns stored events
 */
app.get("/events", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, MAX_EVENTS);

    res.json({
        success: true,
        contract: CONTRACT_IDENTIFIER,
        totalEvents: events.length,
        events: events.slice(0, limit).map(e => ({
            id: e.id,
            txid: e.txid,
            sender: e.sender,
            blockHeight: e.blockHeight,
            method: e.method,
            success: e.success,
            timestamp: e.timestamp
        }))
    });
});

/**
 * Get stats endpoint - returns summary statistics
 */
app.get("/stats", (req, res) => {
    const uniqueSenders = new Set(events.map(e => e.sender)).size;
    const successfulTxs = events.filter(e => e.success).length;
    const methods = {};

    for (const event of events) {
        methods[event.method] = (methods[event.method] || 0) + 1;
    }

    res.json({
        success: true,
        contract: CONTRACT_IDENTIFIER,
        stats: {
            totalInteractions: events.length,
            uniqueSenders,
            successfulTransactions: successfulTxs,
            failedTransactions: events.length - successfulTxs,
            methodBreakdown: methods
        }
    });
});

// ===== START SERVER =====

app.listen(PORT, async () => {
    console.log("\n🚀 Stacks Chainhook Server Started");
    console.log(`   Port: ${PORT}`);
    console.log(`   Contract: ${CONTRACT_IDENTIFIER}`);
    console.log(`   Webhook URL: ${WEBHOOK_BASE_URL}/webhook\n`);

    // Register Chainhook on startup
    await registerChainhook();

    console.log("\n📡 Server ready to receive events!\n");
});
