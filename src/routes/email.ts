import { Router, Request, Response } from 'express';
import { 
  addEmailSubscription, 
  unsubscribeEmail, 
  getSubscriptionStats 
} from '../services/database';

const router = Router();

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limiting helper (simple in-memory store)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 5; // Max 5 requests per IP per 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const clientData = rateLimitStore.get(ip);

  if (!clientData) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (now > clientData.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  clientData.count++;
  return false;
}

// Subscribe to email list
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    // Rate limiting
    if (isRateLimited(clientIP)) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: 900 // 15 minutes in seconds
      });
    }

    // Validate email
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Check for common disposable email domains
    const disposableDomains = [
      '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 
      'tempmail.org', 'yopmail.com', 'throwaway.email'
    ];
    
    const emailDomain = trimmedEmail.split('@')[1];
    if (disposableDomains.includes(emailDomain)) {
      return res.status(400).json({
        success: false,
        error: 'Disposable email addresses are not allowed'
      });
    }

    // Add to database
    const subscription = await addEmailSubscription(trimmedEmail, clientIP, userAgent);

    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to email list',
      data: {
        id: subscription.id,
        email: subscription.email,
        subscribed_at: subscription.subscribed_at
      }
    });

    // Log successful subscription
    console.log(`New email subscription: ${trimmedEmail} from ${clientIP}`);

  } catch (error: any) {
    console.error('Email subscription error:', error);
    
    if (error.message === 'Email already subscribed') {
      return res.status(409).json({
        success: false,
        error: 'This email is already subscribed'
      });
    }

    // Check if it's a database constraint error
    if (error.code === '23505') { // PostgreSQL unique constraint violation
      return res.status(409).json({
        success: false,
        error: 'This email is already subscribed'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again later.'
    });
  }
});

// Unsubscribe from email list
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Unsubscribe token is required'
      });
    }

    const success = await unsubscribeEmail(token.trim());

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired unsubscribe token'
      });
    }

    res.json({
      success: true,
      message: 'Successfully unsubscribed from email list'
    });

    console.log(`Email unsubscribed with token: ${token}`);

  } catch (error) {
    console.error('Email unsubscribe error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again later.'
    });
  }
});

// Get subscription statistics (admin endpoint)
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Simple authentication check (you can enhance this)
    const authHeader = req.get('Authorization');
    const expectedAuth = process.env.ADMIN_API_KEY || 'admin-secret-key';
    
    if (!authHeader || authHeader !== `Bearer ${expectedAuth}`) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const stats = await getSubscriptionStats();

    res.json({
      success: true,
      data: {
        totalSubscriptions: parseInt(stats.total_subscriptions),
        activeSubscriptions: parseInt(stats.active_subscriptions),
        unsubscribedCount: parseInt(stats.unsubscribed_count),
        lastWeekSubscriptions: parseInt(stats.last_week_subscriptions)
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Email API is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router; 