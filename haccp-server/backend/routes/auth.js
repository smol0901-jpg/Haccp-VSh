/**
 * Authentication Routes
 * Login, logout, registration, password management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/init-database');
const { authenticateToken, requireRole, rateLimit, getUserByUsername } = require('../middleware/auth');

const router = express.Router();

// Prepare statements
const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, email, role, department)
    VALUES (?, ?, ?, ?, ?, ?)
`);

const updateUserLastLogin = db.prepare(`
    UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
`);

const insertSession = db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?)
`);

const deleteSession = db.prepare(`
    DELETE FROM sessions WHERE token_hash = ?
`);

const cleanExpiredSessions = db.prepare(`
    DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP
`);

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', rateLimit({ windowMs: 60000, maxRequests: 10 }), async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }

        // Get user from database
        const user = getUserByUsername.get(username.trim());
        
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'haccp_enterprise_secret_key_change_in_production_2024',
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        // Update last login
        updateUserLastLogin.run(user.id);

        // Store session (hash the token for storage)
        const crypto = require('crypto');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
        
        insertSession.run(
            user.id,
            tokenHash,
            expiresAt,
            req.ip,
            req.headers['user-agent']
        );

        // Clean expired sessions periodically
        cleanExpiredSessions.run();

        res.json({
            message: 'Успешный вход',
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                department: user.department
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка сервера при входе' });
    }
});

/**
 * POST /api/auth/logout
 * Invalidate current session
 */
router.post('/logout', authenticateToken, (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (token) {
            const crypto = require('crypto');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            deleteSession.run(tokenHash);
        }

        res.json({ message: 'Успешный выход' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ error: 'Ошибка при выходе' });
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            username: req.user.username,
            fullName: req.user.full_name,
            email: req.user.email,
            role: req.user.role,
            department: req.user.department,
            createdAt: req.user.created_at,
            lastLogin: req.user.last_login
        }
    });
});

/**
 * POST /api/auth/register
 * Register new user (admin only or self-registration disabled by default)
 */
router.post('/register', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { username, password, fullName, email, role, department } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Логин должен быть не менее 3 символов' });
        }

        // Check if user exists
        const existing = getUserByUsername.get(username);
        if (existing) {
            return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
        }

        // Validate role
        const validRoles = ['admin', 'technologist', 'operator', 'viewer'];
        const userRole = role && validRoles.includes(role) ? role : 'operator';

        // Hash password
        const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);

        // Create user
        const result = insertUser.run(username, passwordHash, fullName || '', email || '', userRole, department || '');

        res.status(201).json({
            message: 'Пользователь успешно создан',
            userId: result.lastInsertRowid
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }
});

/**
 * PUT /api/auth/password
 * Change own password
 */
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
        }

        // Get current user with password hash
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

        // Verify current password
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Неверный текущий пароль' });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 10);

        // Update password
        db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newPasswordHash, req.user.id);

        res.json({ message: 'Пароль успешно изменен' });
    } catch (err) {
        console.error('Password change error:', err);
        res.status(500).json({ error: 'Ошибка при смене пароля' });
    }
});

/**
 * GET /api/auth/users
 * List all users (admin only)
 */
router.get('/users', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, username, full_name, email, role, department, is_active, created_at, last_login
            FROM users
            ORDER BY created_at DESC
        `).all();

        res.json({ users });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Ошибка получения списка пользователей' });
    }
});

/**
 * PUT /api/auth/users/:id/activate
 * Activate/deactivate user (admin only)
 */
router.put('/users/:id/activate', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (id == req.user.id) {
            return res.status(400).json({ error: 'Нельзя деактивировать самого себя' });
        }

        db.prepare('UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(isActive ? 1 : 0, id);

        res.json({ message: `Пользователь ${isActive ? 'активирован' : 'деактивирован'}` });
    } catch (err) {
        console.error('User activation error:', err);
        res.status(500).json({ error: 'Ошибка изменения статуса пользователя' });
    }
});

module.exports = router;
