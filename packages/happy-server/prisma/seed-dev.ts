/**
 * Seeds the dev database with a deterministic dev account and machine.
 *
 * Uses the same DEV_AUTH_SECRET_HEX as the app and CLI to produce a matching keypair.
 * The server's POST /v1/auth endpoint verifies signatures against Account.publicKey,
 * so the dev account must exist before the app or CLI can auto-authenticate.
 *
 * Idempotent — safe to run on every `bun dev` boot.
 */

import { PrismaClient } from '@prisma/client';
import tweetnacl from 'tweetnacl';
import { DEV_AUTH_SECRET_HEX } from '../sources/dev/devConstants';

const prisma = new PrismaClient();

async function main() {
    // Derive keypair from dev secret (same as CLI's authChallenge)
    const secretBytes = Buffer.from(DEV_AUTH_SECRET_HEX, 'hex');
    const keypair = tweetnacl.sign.keyPair.fromSeed(secretBytes);
    const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

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

    // Upsert dev machine (so daemon can connect)
    // Machine.metadata is a required non-nullable String (encrypted machine info).
    // For dev, we store a plaintext JSON placeholder — the daemon overwrites it on connect.
    const DEV_MACHINE_ID = 'dev-machine-00000000-0000-0000-0000-000000000000';
    const devMachineMetadata = JSON.stringify({ name: 'Dev Machine', os: 'dev', hostname: 'localhost' });
    await prisma.machine.upsert({
        where: { id: DEV_MACHINE_ID },
        update: { updatedAt: new Date() },
        create: {
            id: DEV_MACHINE_ID,
            accountId: account.id,
            metadata: devMachineMetadata,
        },
    });

    console.log(`✅ Dev machine ready: ${DEV_MACHINE_ID}`);
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
