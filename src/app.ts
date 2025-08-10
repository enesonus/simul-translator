import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { createWebSocketServer } from './websocket-server';
import { initializeDatabase, testConnection, closePool } from './services/database';
import emailRoutes from './routes/email';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', true);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${req.ip}`);
  next();
});

// API Routes
app.use('/api/email', emailRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'simul-translator'
  });
});

// Serve static files and demo
app.get(['/', '/index.html', '/demo'], (req, res) => {
  const filePath = path.join(__dirname, '../demo', 'index.html');
  console.log(`Serving index.html from: ${filePath}`);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Error loading index.html');
    }
  });
});

// Serve CSS and JS files
app.get('*.css', (req, res) => {
  const fileName = req.url.startsWith('/') ? req.url.substring(1) : req.url;
  const filePath = path.join(__dirname, '../demo', fileName);
  console.log(`Serving CSS file: ${filePath}`);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('CSS file not found:', err);
      res.status(404).send('CSS file not found');
    }
  });
});

app.get('*.js', (req, res) => {
  const fileName = req.url.startsWith('/') ? req.url.substring(1) : req.url;
  const filePath = path.join(__dirname, '../demo', fileName);
  console.log(`Serving JS file: ${filePath}`);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('JS file not found:', err);
      res.status(404).send('JS file not found');
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });
});

// General 404 handler
app.use('*', (req, res) => {
  res.status(404).send('Page not found');
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Create HTTP server with Express app
const httpServer = http.createServer(app);

// Initialize WebSocket server
createWebSocketServer(httpServer);

// Initialize database
async function initializeApp() {
  try {
    console.log('Testing database connection...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    console.log('Initializing database schema...');
    await initializeDatabase();
    console.log('Database initialization complete');

    const PORT = process.env.PORT || 8080;
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📧 Email API available at http://localhost:${PORT}/api/email`);
      console.log(`🌐 Demo available at http://localhost:${PORT}/demo`);
      console.log(`🔌 WebSocket available at ws://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await closePool();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await closePool();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the application
initializeApp().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
}); 