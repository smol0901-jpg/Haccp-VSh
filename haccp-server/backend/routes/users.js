/**
 * Users Routes
 * User management (admin only)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/init-database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Prepare statements
const getUserById = db.prepare('SELECT id, username, full_name, email, role, department, is_active, created_at, last_login FROM users WHERE id = ?');
const getAllUsers = db.prepare('SELECT id, username, full_name, email, role, department, is_active, created_at, last_login FROM users ORDER BY created_at DESC');
const updateUser = db.prepare(`
    UPDATE users 
    SET full_name = ?, email = ?, role = ?, department = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
`);
const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get('/', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const users = getAllUsers.all();
        res.json({ users });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Ошибка получения списка пользователей' });
    }
});

/**
 * GET /api/users/:id
 * Get user by ID (admin only)
 */
router.get('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const user = getUserById.get(req.params.id);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ user });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: 'Ошибка получения пользователя' });
    }
});

/**
 * PUT /api/users/:id
 * Update user (admin only)
 */
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { fullName, email, role, department } = req.body;

        const existing = getUserById.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Validate role
        const validRoles = ['admin', 'technologist', 'operator', 'viewer'];
        const userRole = role && validRoles.includes(role) ? role : existing.role;

        updateUser.run(
            fullName !== undefined ? fullName : existing.full_name,
            email !== undefined ? email : existing.email,
            userRole,
            department !== undefined ? department : existing.department,
            id
        );

        res.json({ message: 'Пользователь успешно обновлен' });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Ошибка обновления пользователя' });
    }
});

/**
 * DELETE /api/users/:id
 * Delete user (admin only)
 */
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const { id } = req.params;

        if (id == req.user.id) {
            return res.status(400).json({ error: 'Нельзя удалить самого себя' });
        }

        const existing = getUserById.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        deleteUser.run(id);

        res.json({ message: 'Пользователь успешно удален' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Ошибка удаления пользователя' });
    }
});

/**
 * GET /api/users/stats
 * Get user statistics (admin only)
 */
router.get('/stats', authenticateToken, requireRole('admin'), (req, res) => {
    try {
        const stats = {
            total: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
            active: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count,
            byRole: db.prepare(`
                SELECT role, COUNT(*) as count 
                FROM users 
                GROUP BY role
            `).all()
        };

        res.json({ stats });
    } catch (err) {
        console.error('Get stats error:', err);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

module.exports = router;
