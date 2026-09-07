/**
 * Templates Routes
 * CRUD operations for document templates
 */

const express = require('express');
const db = require('../database/init-database');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Prepare statements
const getAllTemplates = db.prepare(`
    SELECT t.*, u.username as created_by_username, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM templates t
    LEFT JOIN users u ON t.created_by = u.id
    LEFT JOIN template_categories c ON t.category = c.name
    WHERE t.is_active = 1
    ORDER BY t.is_preset DESC, t.updated_at DESC
`);

const getTemplateById = db.prepare(`
    SELECT t.*, u.username as created_by_username
    FROM templates t
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.id = ? AND t.is_active = 1
`);

const getTemplatesByCategory = db.prepare(`
    SELECT t.*, u.username as created_by_username
    FROM templates t
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.category = ? AND t.is_active = 1
    ORDER BY t.updated_at DESC
`);

const getTemplatesByType = db.prepare(`
    SELECT t.*, u.username as created_by_username
    FROM templates t
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.type = ? AND t.is_active = 1
    ORDER BY t.updated_at DESC
`);

const createTemplate = db.prepare(`
    INSERT INTO templates (name, description, category, type, configuration, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
`);

const updateTemplate = db.prepare(`
    UPDATE templates 
    SET name = ?, description = ?, category = ?, type = ?, configuration = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
`);

const deleteTemplate = db.prepare(`
    UPDATE templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
`);

const getCategories = db.prepare(`
    SELECT * FROM template_categories ORDER BY sort_order, name
`);

/**
 * GET /api/templates
 * Get all templates (with optional filters)
 */
router.get('/', optionalAuth, (req, res) => {
    try {
        const { category, type, search } = req.query;
        
        let templates;
        
        if (category) {
            templates = getTemplatesByCategory.all(category);
        } else if (type) {
            templates = getTemplatesByType.all(type);
        } else {
            templates = getAllTemplates.all();
        }

        // Filter by search term if provided
        if (search) {
            const searchTerm = search.toLowerCase();
            templates = templates.filter(t => 
                t.name.toLowerCase().includes(searchTerm) ||
                (t.description && t.description.toLowerCase().includes(searchTerm))
            );
        }

        // Parse configuration JSON
        templates = templates.map(t => ({
            ...t,
            configuration: JSON.parse(t.configuration)
        }));

        res.json({ templates });
    } catch (err) {
        console.error('Get templates error:', err);
        res.status(500).json({ error: 'Ошибка получения шаблонов' });
    }
});

/**
 * GET /api/templates/categories
 * Get all template categories
 */
router.get('/categories', (req, res) => {
    try {
        const categories = getCategories.all();
        res.json({ categories });
    } catch (err) {
        console.error('Get categories error:', err);
        res.status(500).json({ error: 'Ошибка получения категорий' });
    }
});

/**
 * GET /api/templates/:id
 * Get single template by ID
 */
router.get('/:id', optionalAuth, (req, res) => {
    try {
        const template = getTemplateById.get(req.params.id);
        
        if (!template) {
            return res.status(404).json({ error: 'Шаблон не найден' });
        }

        template.configuration = JSON.parse(template.configuration);
        res.json({ template });
    } catch (err) {
        console.error('Get template error:', err);
        res.status(500).json({ error: 'Ошибка получения шаблона' });
    }
});

/**
 * POST /api/templates
 * Create new template (technologist or admin)
 */
router.post('/', authenticateToken, requireRole('admin', 'technologist'), (req, res) => {
    try {
        const { name, description, category, type, configuration } = req.body;

        // Validation
        if (!name || !configuration) {
            return res.status(400).json({ error: 'Название и конфигурация обязательны' });
        }

        const validTypes = ['sheet', 'journal', 'report'];
        const templateType = type && validTypes.includes(type) ? type : 'sheet';

        const result = createTemplate.run(
            name,
            description || '',
            category || 'general',
            templateType,
            JSON.stringify(configuration),
            req.user.id
        );

        res.status(201).json({
            message: 'Шаблон успешно создан',
            templateId: result.lastInsertRowid
        });
    } catch (err) {
        console.error('Create template error:', err);
        res.status(500).json({ error: 'Ошибка создания шаблона' });
    }
});

/**
 * PUT /api/templates/:id
 * Update existing template (technologist or admin, or creator)
 */
router.put('/:id', authenticateToken, requireRole('admin', 'technologist'), (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category, type, configuration } = req.body;

        // Check if template exists and user has permission
        const existing = getTemplateById.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Шаблон не найден' });
        }

        // Prevent editing preset templates unless admin
        if (existing.is_preset && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Редактирование системных шаблонов запрещено. Создайте копию.' });
        }

        const validTypes = ['sheet', 'journal', 'report'];
        const templateType = type && validTypes.includes(type) ? type : existing.type;

        updateTemplate.run(
            name || existing.name,
            description !== undefined ? description : existing.description,
            category || existing.category,
            templateType,
            JSON.stringify(configuration || JSON.parse(existing.configuration)),
            id
        );

        res.json({ message: 'Шаблон успешно обновлен' });
    } catch (err) {
        console.error('Update template error:', err);
        res.status(500).json({ error: 'Ошибка обновления шаблона' });
    }
});

/**
 * POST /api/templates/:id/duplicate
 * Duplicate existing template
 */
router.post('/:id/duplicate', authenticateToken, requireRole('admin', 'technologist'), (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const existing = getTemplateById.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Шаблон не найден' });
        }

        const duplicateName = name || `${existing.name} (Копия)`;

        const result = createTemplate.run(
            duplicateName,
            existing.description,
            existing.category,
            existing.type,
            existing.configuration,
            req.user.id
        );

        res.status(201).json({
            message: 'Шаблон успешно дублирован',
            templateId: result.lastInsertRowid
        });
    } catch (err) {
        console.error('Duplicate template error:', err);
        res.status(500).json({ error: 'Ошибка дублирования шаблона' });
    }
});

/**
 * DELETE /api/templates/:id
 * Soft delete template (admin only for presets, creator/technologist for custom)
 */
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;

        const existing = getTemplateById.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Шаблон не найден' });
        }

        // Permission check
        if (existing.is_preset && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Удаление системных шаблонов запрещено' });
        }

        if (req.user.role === 'operator' || req.user.role === 'viewer') {
            return res.status(403).json({ error: 'Недостаточно прав для удаления' });
        }

        deleteTemplate.run(id);

        res.json({ message: 'Шаблон успешно удален' });
    } catch (err) {
        console.error('Delete template error:', err);
        res.status(500).json({ error: 'Ошибка удаления шаблона' });
    }
});

/**
 * GET /api/templates/presets
 * Get only preset templates
 */
router.get('/presets', (req, res) => {
    try {
        const presets = db.prepare(`
            SELECT t.*, c.icon as category_icon, c.color as category_color
            FROM templates t
            LEFT JOIN template_categories c ON t.category = c.name
            WHERE t.is_preset = 1 AND t.is_active = 1
            ORDER BY t.name
        `).all();

        res.json({ 
            presets: presets.map(p => ({
                ...p,
                configuration: JSON.parse(p.configuration)
            }))
        });
    } catch (err) {
        console.error('Get presets error:', err);
        res.status(500).json({ error: 'Ошибка получения пресетов' });
    }
});

module.exports = router;
