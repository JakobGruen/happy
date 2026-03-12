import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaClient } from '@prisma/client';

const execPromise = promisify(exec);

let container: string;
let prisma: PrismaClient;

export async function setup() {
  console.log('🐘 Starting Docker Postgres container...');

  try {
    // Start Postgres container on random port
    const { stdout } = await execPromise(`docker run -d \
      -e POSTGRES_PASSWORD=password \
      -e POSTGRES_DB=happy_test \
      -p 0:5432 \
      --health-cmd="pg_isready -U postgres" \
      --health-interval=10s \
      --health-timeout=5s \
      --health-retries=5 \
      postgres:15-alpine`);

    container = stdout.trim();
    console.log(`✅ Container started: ${container.substring(0, 12)}`);

    // Get mapped port (docker port outputs multiple lines for dual-stack)
    const { stdout: portOutput } = await execPromise(
      `docker port ${container} 5432/tcp`
    );
    // Extract from first line like "127.0.0.1:32771"
    const firstLine = portOutput.trim().split('\n')[0];
    const port = firstLine.split(':')[1];

    // Wait for container to be ready
    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 30) {
      try {
        const { stdout: healthStatus } = await execPromise(
          `docker inspect --format='{{.State.Health.Status}}' ${container}`
        );
        if (healthStatus.trim() === 'healthy') {
          ready = true;
        }
      } catch {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!ready) {
      throw new Error('Container failed health check');
    }

    console.log(`✅ Database ready on port ${port}`);

    // Set DATABASE_URL for tests
    process.env.DATABASE_URL = `postgresql://postgres:password@localhost:${port}/happy_test`;

    // Run migrations from current Prisma package directory
    console.log('🔄 Running Prisma migrations...');
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`SELECT 1`); // Test connection
    // Use local prisma binary via bash — works under both Node and Bun
    // Resolves paths relative to the current directory, avoiding npx/bunx
    await execPromise(
      `bash -c 'cd "${__dirname}" && DATABASE_URL="${process.env.DATABASE_URL}" node ../../node_modules/prisma/build/index.js migrate deploy'`
    );

    console.log('✅ Migrations complete');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  }

  // Return teardown function
  return async () => {
    console.log('🧹 Cleaning up...');

    try {
      if (prisma) {
        await prisma.$disconnect();
      }

      if (container) {
        try {
          await execPromise(`docker kill ${container}`);
          await execPromise(`docker rm ${container}`);
          console.log('✅ Container removed');
        } catch (error) {
          console.error('Warning: Could not remove container:', error);
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  };
}
