#!/usr/bin/env node
/**
 * Chainhook Management Script
 * Usage:
 *   node manage-chainhooks.js list     - List all registered chainhooks
 *   node manage-chainhooks.js delete <uuid>  - Delete a chainhook by UUID
 *   node manage-chainhooks.js delete-all     - Delete ALL chainhooks (use with caution!)
 */

import dotenv from 'dotenv';
dotenv.config();

const HIRO_API_KEY = process.env.HIRO_API_KEY;
const API_BASE = 'https://api.mainnet.hiro.so/chainhooks/v1/me';

async function listChainhooks() {
    const response = await fetch(`${API_BASE}/`, {
        headers: { 'x-api-key': HIRO_API_KEY }
    });
    const data = await response.json();

    console.log(`Total: ${data.total}/${data.limit} chainhooks`);
    console.log('\nUUIDs to delete:');

    if (data.results && data.results.length > 0) {
        data.results.forEach((hook, i) => {
            console.log(`${i + 1}. ${hook.uuid} - ${hook.name || 'Unnamed'}`);
        });
    }

    return data.results;
}

async function deleteChainhook(uuid) {
    console.log(`🗑️  Deleting chainhook: ${uuid}...`);

    const response = await fetch(`${API_BASE}/${uuid}`, {
        method: 'DELETE',
        headers: { 'x-api-key': HIRO_API_KEY }
    });

    if (response.ok) {
        console.log(`✅ Successfully deleted chainhook: ${uuid}`);
        return true;
    } else {
        const error = await response.text();
        console.error(`❌ Failed to delete: ${error}`);
        return false;
    }
}

async function deleteAllChainhooks() {
    const hooks = await listChainhooks();

    console.log(`\n⚠️  About to delete ALL ${hooks.length} chainhooks...\n`);

    for (const hook of hooks) {
        await deleteChainhook(hook.uuid);
    }

    console.log('\n✅ All chainhooks deleted!');
}

// Main CLI
const command = process.argv[2];
const arg = process.argv[3];

(async () => {
    try {
        switch (command) {
            case 'list':
                await listChainhooks();
                break;
            case 'delete':
                if (!arg) {
                    console.log('Usage: node manage-chainhooks.js delete <uuid>');
                    process.exit(1);
                }
                await deleteChainhook(arg);
                break;
            case 'delete-all':
                await deleteAllChainhooks();
                break;
            default:
                console.log('Chainhook Management Script');
                console.log('Usage:');
                console.log('  node manage-chainhooks.js list          - List all chainhooks');
                console.log('  node manage-chainhooks.js delete <uuid> - Delete a specific chainhook');
                console.log('  node manage-chainhooks.js delete-all    - Delete ALL chainhooks');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
})();
