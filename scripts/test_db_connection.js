/**
 * Test database connection to standalone AscendoreCRM database
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('='.repeat(60));
  console.log('Testing Standalone Database Connection');
  console.log('='.repeat(60));

  const connectionString =
    `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

  console.log(`\nConnecting to: ${process.env.DB_NAME}`);
  console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`User: ${process.env.DB_USER}`);

  const pool = new Pool({ connectionString });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('\n[OK] Database connection successful!');

    // Test query
    const result = await client.query('SELECT NOW()');
    console.log(`[OK] Current database time: ${result.rows[0].now}`);

    // List tables
    const tablesResult = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log(`\n[OK] Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

    client.release();
    await pool.end();

    console.log('\n' + '='.repeat(60));
    console.log('Database connection test PASSED!');
    console.log('='.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('\n[ERROR] Database connection failed:');
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();
