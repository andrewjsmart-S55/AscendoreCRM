import { Pool } from 'pg';

let pool: Pool | null = null;

export async function connectDatabase(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

  // SSL configuration for production
  const sslConfig = process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false,
  } : false;

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: sslConfig,
  });

  pool.on('error', (err) => {
    console.error('Unexpected database error', err);
  });

  // Test connection
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Database connection pool established');
  } catch (error) {
    console.error('Failed to connect to database', error);
    throw error;
  }

  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call connectDatabase() first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection pool closed');
  }
}
