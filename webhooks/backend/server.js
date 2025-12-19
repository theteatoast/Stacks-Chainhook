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

// Chainhook predicate for monitoring contract calls (Chainhooks 2.0 API format)
const chainhookPredicate = {
    name: `Monitor ${CONTRACT_IDENTIFIER}`,
    version: "1",
    chain: "stacks",
    network: "mainnet",
    filters: {
        events: [
            {
                type: "contract_call",
                contract_identifier: CONTRACT_IDENTIFIER,
                method: "*" // Listen to ALL methods
            }
        ]
    },
    action: {
        type: "http_post",
        url: `${WEBHOOK_BASE_URL}/webhook`,
        authorization_header: `Bearer chainhook-secret`
    },
    options: {
        enable_on_registration: true
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
        // Hiro Chainhooks API endpoint for mainnet - /chainhooks/v1/me/ for user-scoped chainhooks
        const response = await fetch("https://api.mainnet.hiro.so/chainhooks/v1/me/", {
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
        console.log(`   Chainhook ID: ${result.id || result.uuid || 'N/A'}`);
        return result;
    } catch (error) {
        console.error("❌ Failed to register Chainhook:", error.message);
        // Don't exit - the server can still receive webhooks if already registered
        console.log("⚠️  Server will continue running. Chainhook may already be registered.");
    }
}

/**
 * Parse Chainhook event payload and extract transaction details
 * Handles multiple payload formats from Chainhooks API
 */
function parseEventPayload(payload) {
    const parsedEvents = [];

    try {
        // Log the payload structure for debugging
        console.log("   📦 Payload keys:", Object.keys(payload));

        // Try multiple payload formats

        // Format 1: Chainhooks 2.0 - events at top level or in 'data'
        const eventsArray = payload.events || payload.data?.events || [];
        if (eventsArray.length > 0) {
            console.log(`   Found ${eventsArray.length} events in events/data.events`);
            for (const event of eventsArray) {
                parsedEvents.push({
                    id: uuidv4(),
                    txid: event.tx_id || event.txid || event.transaction_id || "unknown",
                    sender: event.sender || event.sender_address || event.principal || "unknown",
                    blockHeight: event.block_height || event.block || 0,
                    contractId: event.contract_identifier || CONTRACT_IDENTIFIER,
                    method: event.method || event.function_name || "unknown",
                    success: event.success !== false,
                    timestamp: new Date().toISOString(),
                    raw: event
                });
            }
        }

        // Format 2: Chainhook - 'apply' array with blocks (check both payload.apply AND payload.event.apply)
        const apply = payload.apply || payload.event?.apply || [];
        if (apply.length > 0) {
            console.log(`   Found ${apply.length} blocks in apply array`);
            for (const block of apply) {
                const blockHeight = block.block_identifier?.index || block.block_height || block.metadata?.block_height || 0;
                const transactions = block.transactions || [];

                console.log(`   Block ${blockHeight}: ${transactions.length} transactions`);

                for (const tx of transactions) {
                    // Handle metadata structure - Hiro API nests details in metadata
                    const metadata = tx.metadata || {};
                    const txDetails = metadata || tx.operations?.[0] || tx;

                    // Extract sender from multiple possible locations
                    let sender = "unknown";
                    if (metadata.sender) sender = metadata.sender;
                    else if (metadata.sender_address) sender = metadata.sender_address;
                    else if (tx.operations?.[0]?.account?.address) sender = tx.operations[0].account.address;

                    // Extract method/function name
                    let method = "unknown";
                    if (metadata.kind?.data?.contract_call?.function_name) {
                        method = metadata.kind.data.contract_call.function_name;
                    } else if (metadata.contract_call?.function_name) {
                        method = metadata.contract_call.function_name;
                    } else if (txDetails.function_name) {
                        method = txDetails.function_name;
                    }

                    // Extract success status - check multiple indicators
                    let success = true; // Default to true
                    if (metadata.success === false) {
                        success = false;
                    } else if (metadata.receipt?.result) {
                        // Check if result contains (ok ...) or (err ...)
                        const result = metadata.receipt.result;
                        if (result.includes("(err") || result.startsWith("err")) {
                            success = false;
                        } else if (result.includes("(ok") || result.startsWith("ok")) {
                            success = true;
                        }
                    }

                    parsedEvents.push({
                        id: uuidv4(),
                        txid: tx.transaction_identifier?.hash || metadata.tx_id || txDetails.txid || "unknown",
                        sender: sender,
                        blockHeight: blockHeight,
                        contractId: CONTRACT_IDENTIFIER,
                        method: method,
                        success: success,
                        timestamp: new Date().toISOString(),
                        raw: tx
                    });
                }
            }
        }

        // Format 3: Direct transactions array
        const transactions = payload.transactions || [];
        if (transactions.length > 0) {
            console.log(`   Found ${transactions.length} direct transactions`);
            for (const tx of transactions) {
                parsedEvents.push({
                    id: uuidv4(),
                    txid: tx.tx_id || tx.txid || tx.transaction_id || "unknown",
                    sender: tx.sender || tx.sender_address || "unknown",
                    blockHeight: tx.block_height || payload.block_height || 0,
                    contractId: tx.contract_identifier || CONTRACT_IDENTIFIER,
                    method: tx.function_name || tx.method || "unknown",
                    success: tx.success !== false,
                    timestamp: new Date().toISOString(),
                    raw: tx
                });
            }
        }

        // If still no events, log the full payload for debugging
        if (parsedEvents.length === 0) {
            console.log("   ⚠️ No events parsed. Full payload:");
            console.log(JSON.stringify(payload, null, 2).slice(0, 1000));
        }

    } catch (error) {
        console.error("Error parsing event payload:", error);
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
