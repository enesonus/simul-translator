import { Pool, Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration using Neon credentials
const dbConfig = {
  host: process.env.PGHOST,
  database: process.env.PGDATABASE || 'neondb',
  user: process.env.PGUSER || 'neondb_owner',
  password: process.env.PGPASSWORD,
  ssl: {
    rejectUnauthorized: false,
  },
  port: 5432,
};

// Create connection pool for better performance
const pool = new Pool(dbConfig);

// Interface for email subscription
export interface EmailSubscription {
  id?: number;
  email: string;
  subscribed_at?: Date;
  ip_address?: string;
  user_agent?: string;
  is_active?: boolean;
}

// Initialize database and create tables
export async function initializeDatabase(): Promise<void> {
  try {
    const client = await pool.connect();
    
    // Create email_subscriptions table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_subscriptions (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address INET,
        user_agent TEXT,
        is_active BOOLEAN DEFAULT true,
        unsubscribe_token VARCHAR(255) UNIQUE DEFAULT gen_random_uuid()::text
      );
    `);

    // Create index on email for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_subscriptions_email 
      ON email_subscriptions(email);
    `);

    // Create index on is_active for filtering active subscriptions
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_email_subscriptions_active 
      ON email_subscriptions(is_active);
    `);

    client.release();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Add new email subscription
export async function addEmailSubscription(
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<EmailSubscription> {
  try {
    const client = await pool.connect();
    
    // Check if email already exists
    const existingQuery = 'SELECT * FROM email_subscriptions WHERE email = $1';
    const existingResult = await client.query(existingQuery, [email]);
    
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (!existing.is_active) {
        // Reactivate if previously unsubscribed
        const updateQuery = `
          UPDATE email_subscriptions 
          SET is_active = true, subscribed_at = CURRENT_TIMESTAMP 
          WHERE email = $1 
          RETURNING *
        `;
        const updateResult = await client.query(updateQuery, [email]);
        client.release();
        return updateResult.rows[0];
      } else {
        client.release();
        throw new Error('Email already subscribed');
      }
    }

    // Insert new subscription
    const insertQuery = `
      INSERT INTO email_subscriptions (email, ip_address, user_agent) 
      VALUES ($1, $2, $3) 
      RETURNING *
    `;
    const result = await client.query(insertQuery, [email, ipAddress, userAgent]);
    
    client.release();
    return result.rows[0];
  } catch (error) {
    console.error('Error adding email subscription:', error);
    throw error;
  }
}

// Get all active email subscriptions
export async function getActiveSubscriptions(): Promise<EmailSubscription[]> {
  try {
    const client = await pool.connect();
    const query = 'SELECT * FROM email_subscriptions WHERE is_active = true ORDER BY subscribed_at DESC';
    const result = await client.query(query);
    client.release();
    return result.rows;
  } catch (error) {
    console.error('Error fetching active subscriptions:', error);
    throw error;
  }
}

// Unsubscribe email (soft delete)
export async function unsubscribeEmail(token: string): Promise<boolean> {
  try {
    const client = await pool.connect();
    const query = `
      UPDATE email_subscriptions 
      SET is_active = false 
      WHERE unsubscribe_token = $1 AND is_active = true 
      RETURNING email
    `;
    const result = await client.query(query, [token]);
    client.release();
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error unsubscribing email:', error);
    throw error;
  }
}

// Get subscription stats
export async function getSubscriptionStats() {
  try {
    const client = await pool.connect();
    const query = `
      SELECT 
        COUNT(*) as total_subscriptions,
        COUNT(*) FILTER (WHERE is_active = true) as active_subscriptions,
        COUNT(*) FILTER (WHERE is_active = false) as unsubscribed_count,
        COUNT(*) FILTER (WHERE subscribed_at >= CURRENT_DATE - INTERVAL '7 days') as last_week_subscriptions
      FROM email_subscriptions
    `;
    const result = await client.query(query);
    client.release();
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching subscription stats:', error);
    throw error;
  }
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
} 