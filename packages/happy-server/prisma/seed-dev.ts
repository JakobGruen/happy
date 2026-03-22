/**
 * Seeds the dev database with a deterministic dev account.
 *
 * Uses the same DEV_AUTH_SECRET_HEX as the app and CLI to produce a matching keypair.
 * The server's POST /v1/auth endpoint verifies signatures against Account.publicKey,
 * so the dev account must exist before the app or CLI can auto-authenticate.
 *
 * The dev machine is NOT seeded here — the daemon creates it on first connect
 * with properly encrypted metadata via POST /v1/machines.
 *
 * Idempotent — safe to run on every `bun dev` boot.
 */

import { PrismaClient } from '@prisma/client';
import tweetnacl from 'tweetnacl';
import * as privacyKit from 'privacy-kit';
import { DEV_AUTH_SECRET_HEX } from '../sources/dev/devConstants';

const prisma = new PrismaClient();

async function main() {
    // Derive keypair from dev secret (same as CLI's authChallenge)
    const secretBytes = Buffer.from(DEV_AUTH_SECRET_HEX, 'hex');
    const keypair = tweetnacl.sign.keyPair.fromSeed(secretBytes);
    // Must use privacyKit.encodeHex (uppercase) to match the server's auth route
    const publicKeyHex = privacyKit.encodeHex(keypair.publicKey);

    // Upsert dev account
    const account = await prisma.account.upsert({
        where: { publicKey: publicKeyHex },
        update: { updatedAt: new Date() },
        create: {
            publicKey: publicKeyHex,
            firstName: 'Dev',
            lastName: 'User',
            username: 'happy-dev-user',
        },
    });

    console.log(`✅ Dev account ready: ${account.id} (publicKey: ${publicKeyHex.substring(0, 16)}...)`);
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
