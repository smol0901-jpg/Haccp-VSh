/**
 * Documents Routes
 * CRUD operations for filled documents
 */

const express = require('express');
const db = require('../database/init-database');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Prepare statements
const getAllDocuments = db.prepare(`
    SELECT d.*, t.name as template_name, t.type as template_type,
           u.username as created_by_username,
           a.username as approved_by_username
    FROM documents d
    LEFT JOIN templates t ON d.template_id = t.id
    LEFT JOIN users u ON d.created_by = u.id
    LEFT JOIN users a ON d.approved_by = a.id
    ORDER BY d.updated_at DESC
`);

const getDocumentById = db.prepare(`
    SELECT d.*, t.name as template_name, t.type as template_type, t.configuration as template_configuration,
           u.username as created_by_username,
           a.username as approved_by_username
    FROM documents d
    LEFT JOIN templates t ON d.template_id = t.id
    LEFT JOIN users u ON d.created_by = u.id
    LEFT JOIN users a ON d.approved_by = a.id
    WHERE d.id = ?
`);

const getDocumentsByStatus = db.prepare(`
    SELECT d.*, t.name as template_name
    FROM documents d
    LEFT JOIN templates t ON d.template_id = t.id
    WHERE d.status = ?
    ORDER BY d.updated_at DESC
`);

const createDocument = db.prepare(`
    INSERT INTO documents (template_id, title, status, data, created_by, period_start, period_end, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateDocument = db.prepare(`
    UPDATE documents 
    SET title = ?, data = ?, status = ?, period_start = ?, period_end = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
`);

const deleteDocument = db.prepare(`
    DELETE FROM documents WHERE id = ?
`);

const approveDocument = db.prepare(`
    UPDATE documents 
    SET status = 'approved', approved_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
`);

const logHistory = db.prepare(`
    INSERT INTO document_history (document_id, user_id, action, changes)
    VALUES (?, ?, ?, ?)
`);

/**
 * GET /api/documents
 * Get all documents with filters
 */
router.get('/', authenticateToken, (req, res) => {
    try {
        const { status, templateId, createdBy, search, page = 1, limit = 20 } = req.query;
        
        let documents;
        
        if (status) {
            documents = getDocumentsByStatus.all(status);
        } else {
            documents = getAllDocuments.all();
        }

        // Filter by template
        if (templateId) {
            documents = documents.filter(d => d.template_id == templateId);
        }

        // Filter by creator
        if (createdBy) {
            documents = documents.filter(d => d.created_by == createdBy);
        }

        // Search filter
        if (search) {
            const searchTerm = search.toLowerCase();
            documents = documents.filter(d => 
                d.title.toLowerCase().includes(searchTerm) ||
                (d.notes && d.notes.toLowerCase().includes(searchTerm))
            );
        }

        // Pagination
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedDocs = documents.slice(startIndex, endIndex);

        // Parse data JSON
        const result = paginatedDocs.map(d => ({
            ...d,
            data: d.data ? JSON.parse(d.data) : null,
            template_configuration: d.template_configuration ? JSON.parse(d.template_configuration) : null
        }));

        res.json({
            documents: result,
            total: documents.length,
            page: parseInt(page),
            totalPages: Math.ceil(documents.length / parseInt(limit))
        });
    } catch (err) {
        console.error('Get documents error:', err);
        res.status(500).json({ error: 'Ошибка получения документов' });
    }
});

/**
 * GET /api/documents/:id
 * Get single document by ID
 */
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const document = getDocumentById.get(req.params.id);
        
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        document.data = document.data ? JSON.parse(document.data) : null;
        document.template_configuration = document.template_configuration ? JSON.parse(document.template_configuration) : null;

        // Get history
        const history = db.prepare(`
            SELECT h.*, u.username as user_name
            FROM document_history h
            LEFT JOIN users u ON h.user_id = u.id
            WHERE h.document_id = ?
            ORDER BY h.created_at DESC
            LIMIT 50
        `).all(req.params.id);

        res.json({ document, history });
    } catch (err) {
        console.error('Get document error:', err);
        res.status(500).json({ error: 'Ошибка получения документа' });
    }
});

/**
 * POST /api/documents
 * Create new document from template
 */
router.post('/', authenticateToken, requireRole('admin', 'technologist', 'operator'), (req, res) => {
    try {
        const { templateId, title, data, periodStart, periodEnd, notes } = req.body;

        if (!templateId) {
            return res.status(400).json({ error: 'ID шаблона обязателен' });
        }

        // Get template
        const template = db.prepare('SELECT * FROM templates WHERE id = ? AND is_active = 1').get(templateId);
        if (!template) {
            return res.status(404).json({ error: 'Шаблон не найден' });
        }

        // Generate QR hash for document verification
        const qrHash = crypto.createHash('sha256')
            .update(`${templateId}-${Date.now()}-${req.user.id}`)
            .digest('hex')
            .substring(0, 16);

        const result = createDocument.run(
            templateId,
            title || template.name,
            'draft',
            JSON.stringify(data || {}),
            req.user.id,
            periodStart || null,
            periodEnd || null,
            notes || ''
        );

        // Log creation
        logHistory.run(result.lastInsertRowid, req.user.id, 'create', JSON.stringify({ title, templateId }));

        res.status(201).json({
            message: 'Документ успешно создан',
            documentId: result.lastInsertRowid,
            qrHash
        });
    } catch (err) {
        console.error('Create document error:', err);
        res.status(500).json({ error: 'Ошибка создания документа' });
    }
});

/**
 * PUT /api/documents/:id
 * Update existing document
 */
router.put('/:id', authenticateToken, requireRole('admin', 'technologist', 'operator'), (req, res) => {
    try {
        const { id } = req.params;
        const { title, data, status, periodStart, periodEnd, notes } = req.body;

        const existing = getDocumentById.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        // Permission check - only creator or higher roles can edit
        if (existing.created_by !== req.user.id && req.user.role === 'operator') {
            return res.status(403).json({ error: 'Нет прав для редактирования этого документа' });
        }

        // Prevent editing approved documents unless admin
        if (existing.status === 'approved' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Утвержденный документ нельзя редактировать' });
        }

        updateDocument.run(
            title || existing.title,
            data !== undefined ? JSON.stringify(data) : existing.data,
            status || existing.status,
            periodStart !== undefined ? periodStart : existing.period_start,
            periodEnd !== undefined ? periodEnd : existing.period_end,
            notes !== undefined ? notes : existing.notes,
            id
        );

        // Log update
        logHistory.run(id, req.user.id, 'update', JSON.stringify({ title, status }));

        res.json({ message: 'Документ успешно обновлен' });
    } catch (err) {
        console.error('Update document error:', err);
        res.status(500).json({ error: 'Ошибка обновления документа' });
    }
});

/**
 * POST /api/documents/:id/approve
 * Approve document (admin or technologist)
 */
router.post('/:id/approve', authenticateToken, requireRole('admin', 'technologist'), (req, res) => {
    try {
        const { id } = req.params;

        const existing = getDocumentById.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        if (existing.status === 'approved') {
            return res.status(400).json({ error: 'Документ уже утвержден' });
        }

        approveDocument.run(req.user.id, id);

        // Log approval
        logHistory.run(id, req.user.id, 'approve', JSON.stringify({ approvedBy: req.user.username }));

        res.json({ message: 'Документ успешно утвержден' });
    } catch (err) {
        console.error('Approve document error:', err);
        res.status(500).json({ error: 'Ошибка утверждения документа' });
    }
});

/**
 * DELETE /api/documents/:id
 * Delete document
 */
router.delete('/:id', authenticateToken, requireRole('admin', 'technologist'), (req, res) => {
    try {
        const { id } = req.params;

        const existing = getDocumentById.get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        // Prevent deleting approved documents unless admin
        if (existing.status === 'approved' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Удаление утвержденных документов запрещено' });
        }

        // Log before deletion
        logHistory.run(id, req.user.id, 'delete', JSON.stringify({ title: existing.title }));

        deleteDocument.run(id);

        res.json({ message: 'Документ успешно удален' });
    } catch (err) {
        console.error('Delete document error:', err);
        res.status(500).json({ error: 'Ошибка удаления документа' });
    }
});

/**
 * GET /api/documents/:id/export-history
 * Get export history for document
 */
router.get('/:id/export-history', authenticateToken, (req, res) => {
    try {
        const history = db.prepare(`
            SELECT * FROM document_history
            WHERE document_id = ? AND action = 'export'
            ORDER BY created_at DESC
            LIMIT 20
        `).all(req.params.id);

        res.json({ history });
    } catch (err) {
        console.error('Get export history error:', err);
        res.status(500).json({ error: 'Ошибка получения истории экспорта' });
    }
});

module.exports = router;
