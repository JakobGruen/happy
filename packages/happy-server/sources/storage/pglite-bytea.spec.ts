import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('PGlite bytea serialization', () => {
    let pg: PGlite;

    beforeAll(async () => {
        pg = new PGlite(); // in-memory
        await pg.exec(`
            CREATE TABLE bytea_test (
                id TEXT PRIMARY KEY,
                data BYTEA
            );
        `);
    });

    afterAll(async () => {
        await pg.close();
    });

    // Test 1: Does PGlite handle raw Buffer params?
    it('should handle Buffer params in raw PGlite query', async () => {
        const buf = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
        await pg.query('INSERT INTO bytea_test (id, data) VALUES ($1, $2)', ['raw-buffer', buf]);
        const result = await pg.query('SELECT data FROM bytea_test WHERE id = $1', ['raw-buffer']);
        expect((result.rows[0] as any).data).toBeInstanceOf(Uint8Array);
        expect(Buffer.from((result.rows[0] as any).data as Uint8Array).toString('hex')).toBe('deadbeef');
    });

    // Test 2: PGlite rejects hex strings for bytea params (only accepts typed arrays)
    it('should reject hex string params for bytea', async () => {
        await expect(
            pg.query('INSERT INTO bytea_test (id, data) VALUES ($1, $2)', ['hex-string', '\\xDEADBEEF'])
        ).rejects.toThrow();
    });

    // Test 3: Does PGlite handle Uint8Array (non-Buffer)?
    it('should handle Uint8Array params', async () => {
        const arr = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
        await pg.query('INSERT INTO bytea_test (id, data) VALUES ($1, $2)', ['uint8array', arr]);
        const result = await pg.query('SELECT data FROM bytea_test WHERE id = $1', ['uint8array']);
        expect(Buffer.from((result.rows[0] as any).data as Uint8Array).toString('hex')).toBe('deadbeef');
    });

    // Test 4: Through the Prisma adapter
    it('should handle bytea through PrismaPGlite adapter + Prisma', async () => {
        const pg2 = new PGlite();
        // Match the actual Prisma schema for Machine
        await pg2.exec(`
            CREATE TABLE "Machine" (
                "id" TEXT PRIMARY KEY,
                "accountId" TEXT NOT NULL,
                "metadata" TEXT NOT NULL,
                "metadataVersion" INTEGER NOT NULL DEFAULT 0,
                "daemonState" TEXT,
                "daemonStateVersion" INTEGER NOT NULL DEFAULT 0,
                "dataEncryptionKey" BYTEA,
                "seq" INTEGER NOT NULL DEFAULT 0,
                "active" BOOLEAN NOT NULL DEFAULT true,
                "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE UNIQUE INDEX "Machine_accountId_id_key" ON "Machine"("accountId", "id");
            CREATE INDEX "Machine_accountId_idx" ON "Machine"("accountId");

            CREATE TABLE "Account" (
                "id" TEXT PRIMARY KEY,
                "email" TEXT,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE "AccessKey" (
                "id" TEXT PRIMARY KEY,
                "machineId" TEXT NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const adapter = new PrismaPGlite(pg2);
        const prisma = new PrismaClient({ adapter } as any);

        // Test with Uint8Array (not Buffer) — this is what privacyKit.decodeBase64 returns
        const testKey = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
        await prisma.machine.create({
            data: {
                id: 'test-machine-1',
                accountId: 'test-user-1',
                metadata: '{}',
                dataEncryptionKey: testKey as any,
            }
        });

        const machine = await prisma.machine.findFirst({
            where: { id: 'test-machine-1' }
        });

        expect(machine).not.toBeNull();
        expect(Buffer.from(machine!.dataEncryptionKey!).toString('hex')).toBe('deadbeef');

        await prisma.$disconnect();
        await pg2.close();
    });
});
