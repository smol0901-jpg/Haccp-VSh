/**
 * Authentication Middleware
 * JWT token verification and user authorization
 */

const jwt = require('jsonwebtoken');
const db = require('../database/init-database');

// Prepare statements for efficiency
const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1');
const getUserById = db.prepare('SELECT id, username, full_name, email, role, department, created_at, last_login FROM users WHERE id = ? AND is_active = 1');

/**
 * Authenticate JWT token
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Требуется аутентификация' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'haccp_enterprise_secret_key_change_in_production_2024');
        
        // Get fresh user data from database
        const user = getUserById.get(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Срок действия токена истек' });
        }
        return res.status(403).json({ error: 'Неверный токен' });
    }
}

/**
 * Check if user has required role
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Требуется аутентификация' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Недостаточно прав',
                required: roles,
                current: req.user.role
            });
        }

        next();
    };
}

/**
 * Check if user is admin
 */
function requireAdmin(req, res, next) {
    return requireRole('admin')(req, res, next);
}

/**
 * Optional authentication - attaches user if token present
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'haccp_enterprise_secret_key_change_in_production_2024');
            const user = getUserById.get(decoded.userId);
            if (user) {
                req.user = user;
            }
        } catch (err) {
            // Token invalid, continue without user
        }
    }
    next();
}

/**
 * Rate limiting helper (simple in-memory implementation)
 * For production, use Redis or similar
 */
const rateLimitStore = new Map();

function rateLimit(options = {}) {
    const windowMs = options.windowMs || 60000; // 1 minute default
    const maxRequests = options.maxRequests || 10;

    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
        } else {
            const record = rateLimitStore.get(key);
            if (now > record.resetTime) {
                record.count = 1;
                record.resetTime = now + windowMs;
            } else {
                record.count++;
                if (record.count > maxRequests) {
                    return res.status(429).json({ 
                        error: 'Слишком много запросов',
                        retryAfter: Math.ceil((record.resetTime - now) / 1000)
                    });
                }
            }
        }
        
        next();
    };
}

module.exports = {
    authenticateToken,
    requireRole,
    requireAdmin,
    optionalAuth,
    rateLimit,
    getUserByUsername,
    getUserById
};
