/**
 * Mainnet Deployment Script for STX Names
 * 
 * ⚠️  WARNING: This deploys to MAINNET - real STX will be spent!
 * 
 * Prerequisites:
 * 1. Set DEPLOYER_MNEMONIC environment variable with your mainnet wallet mnemonic
 * 2. Ensure your mainnet wallet has enough STX for deployment fees
 * 3. Double-check the contract code before deploying
 * 4. Run: node scripts/deploy-mainnet.js
 */

import {
    makeContractDeploy,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    ClarityVersion,
} from '@stacks/transactions';
import { StacksMainnet } from '@stacks/network';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const NETWORK = new StacksMainnet();
const CONTRACT_NAME = 'username-registry-v8';

async function getPrivateKey() {
    const mnemonic = process.env.DEPLOYER_MNEMONIC;
    if (!mnemonic) {
        throw new Error('DEPLOYER_MNEMONIC environment variable is required');
    }

    const { generateWallet } = await import('@stacks/wallet-sdk');
    const wallet = await generateWallet({
        secretKey: mnemonic,
        password: '',
    });

    return wallet.accounts[0].stxPrivateKey;
}

async function confirm(message) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(message, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        });
    });
}

async function deployContract() {
    console.log('');
    console.log('⚠️  Username Registry - MAINNET Deployment');
    console.log('='.repeat(50));
    console.log('');
    console.log('🔴 WARNING: This will deploy to MAINNET!');
    console.log('🔴 Real STX will be spent for transaction fees.');
    console.log('');

    const confirmed = await confirm('Are you sure you want to continue? (yes/no): ');
    if (!confirmed) {
        console.log('Deployment cancelled.');
        process.exit(0);
    }

    try {
        // Read contract source
        const contractPath = join(__dirname, '..', 'contracts', 'username-registry.clar');
        let codeBody = readFileSync(contractPath, 'utf8');

        // CRITICAL: Convert Windows line endings (CRLF) to Unix (LF)
        // Clarity contracts require Unix line endings
        codeBody = codeBody.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        console.log('✅ Contract source loaded');
        console.log(`   File: ${contractPath}`);
        console.log(`   Size: ${codeBody.length} bytes`);

        // Get private key from mnemonic
        const privateKey = await getPrivateKey();
        console.log('✅ Private key derived from mnemonic');

        // Create deploy transaction with Clarity 4 (strictly)
        const txOptions = {
            contractName: CONTRACT_NAME,
            codeBody,
            senderKey: privateKey,
            network: NETWORK,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
            clarityVersion: ClarityVersion.Clarity4, // Strictly Clarity 4
            fee: 500000n, // 0.5 STX fee for mainnet
        };

        console.log('📝 Creating deployment transaction...');
        const transaction = await makeContractDeploy(txOptions);

        // Final confirmation
        console.log('');
        const finalConfirm = await confirm('Transaction ready. Broadcast to mainnet? (yes/no): ');
        if (!finalConfirm) {
            console.log('Deployment cancelled.');
            process.exit(0);
        }

        // Broadcast transaction
        console.log('📡 Broadcasting transaction to mainnet...');
        const broadcastResponse = await broadcastTransaction(transaction, NETWORK);

        if ('error' in broadcastResponse) {
            throw new Error(`Broadcast failed: ${broadcastResponse.error} - ${broadcastResponse.reason}`);
        }

        const txId = broadcastResponse.txid;
        console.log('');
        console.log('✅ Contract deployment submitted to MAINNET!');
        console.log('='.repeat(50));
        console.log(`Transaction ID: ${txId}`);
        console.log(`Explorer: https://explorer.stacks.co/txid/${txId}?chain=mainnet`);
        console.log('');
        console.log('⏳ Wait for transaction to be confirmed (usually ~10 minutes on mainnet)');
        console.log('');

        return txId;
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        process.exit(1);
    }
}

// Run deployment
deployContract();
