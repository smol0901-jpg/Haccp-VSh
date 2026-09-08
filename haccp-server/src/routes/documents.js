import { Router } from 'express';

export default function documentRoutes(db, broadcastEvent) {
  const router = Router();

  const authenticateToken = (req, res, next) => {
    req.user = { id: 'system', username: 'local', role: 'user' };
    next();
  };

  // Получить все документы
  router.get('/', authenticateToken, (req, res) => {
    try {
      const { status, templateId, search } = req.query;
      let documents = db.getAllDocuments();

      if (status) {
        documents = documents.filter(d => d.status === status);
      }

      if (templateId) {
        documents = documents.filter(d => d.template_id === templateId);
      }

      if (search) {
        const searchLower = search.toLowerCase();
        documents = documents.filter(d => 
          d.title.toLowerCase().includes(searchLower) ||
          (d.tags && d.tags.toLowerCase().includes(searchLower))
        );
      }

      res.json({ documents });
    } catch (error) {
      console.error('Ошибка получения документов:', error);
      res.status(500).json({ error: 'Ошибка при получении документов' });
    }
  });

  // Получить документ по ID
  router.get('/:id', authenticateToken, (req, res) => {
    try {
      const document = db.getDocumentById(req.params.id);
      
      if (!document) {
        return res.status(404).json({ error: 'Документ не найден' });
      }

      res.json({ document });
    } catch (error) {
      console.error('Ошибка получения документа:', error);
      res.status(500).json({ error: 'Ошибка при получении документа' });
    }
  });

  // Создать новый документ
  router.post('/', authenticateToken, (req, res) => {
    try {
      const { title, templateId, data, status, tags } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Необходимо указать название документа' });
      }

      const document = db.createDocument(
        title,
        templateId || null,
        data || {},
        req.user.id,
        status || 'draft',
        tags || ''
      );

      broadcastEvent('document_created', { document });
      db.logAudit(req.user.id, 'CREATE_DOCUMENT', 'document', document.id, { title }, req.ip);

      res.status(201).json({ message: 'Документ успешно создан', document });
    } catch (error) {
      console.error('Ошибка создания документа:', error);
      res.status(500).json({ error: 'Ошибка при создании документа' });
    }
  });

  // Обновить документ
  router.put('/:id', authenticateToken, (req, res) => {
    try {
      const document = db.getDocumentById(req.params.id);
      
      if (!document) {
        return res.status(404).json({ error: 'Документ не найден' });
      }

      const updates = {};
      const allowedFields = ['title', 'status', 'data', 'approved_by', 'approved_at', 'expires_at', 'tags'];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const updatedDocument = db.updateDocument(req.params.id, updates);

      broadcastEvent('document_updated', { document: updatedDocument });
      db.logAudit(req.user.id, 'UPDATE_DOCUMENT', 'document', req.params.id, updates, req.ip);

      res.json({ message: 'Документ успешно обновлен', document: updatedDocument });
    } catch (error) {
      console.error('Ошибка обновления документа:', error);
      res.status(500).json({ error: 'Ошибка при обновлении документа' });
    }
  });

  // Удалить документ
  router.delete('/:id', authenticateToken, (req, res) => {
    try {
      const document = db.getDocumentById(req.params.id);
      
      if (!document) {
        return res.status(404).json({ error: 'Документ не найден' });
      }

      db.deleteDocument(req.params.id);

      broadcastEvent('document_deleted', { documentId: req.params.id });
      db.logAudit(req.user.id, 'DELETE_DOCUMENT', 'document', req.params.id, { title: document.title }, req.ip);

      res.json({ message: 'Документ успешно удален' });
    } catch (error) {
      console.error('Ошибка удаления документа:', error);
      res.status(500).json({ error: 'Ошибка при удалении документа' });
    }
  });

  // Утвердить документ
  router.post('/:id/approve', authenticateToken, (req, res) => {
    try {
      const document = db.getDocumentById(req.params.id);
      
      if (!document) {
        return res.status(404).json({ error: 'Документ не найден' });
      }

      const updatedDocument = db.updateDocument(req.params.id, {
        status: 'approved',
        approved_by: req.user.id,
        approved_at: new Date().toISOString()
      });

      broadcastEvent('document_approved', { document: updatedDocument });
      db.logAudit(req.user.id, 'APPROVE_DOCUMENT', 'document', req.params.id, {}, req.ip);

      res.json({ message: 'Документ утвержден', document: updatedDocument });
    } catch (error) {
      console.error('Ошибка утверждения документа:', error);
      res.status(500).json({ error: 'Ошибка при утверждении документа' });
    }
  });

  // Архивировать документ
  router.post('/:id/archive', authenticateToken, (req, res) => {
    try {
      const document = db.getDocumentById(req.params.id);
      
      if (!document) {
        return res.status(404).json({ error: 'Документ не найден' });
      }

      const updatedDocument = db.updateDocument(req.params.id, {
        status: 'archived'
      });

      broadcastEvent('document_archived', { document: updatedDocument });
      db.logAudit(req.user.id, 'ARCHIVE_DOCUMENT', 'document', req.params.id, {}, req.ip);

      res.json({ message: 'Документ архивирован', document: updatedDocument });
    } catch (error) {
      console.error('Ошибка архивирования документа:', error);
      res.status(500).json({ error: 'Ошибка при архивировании документа' });
    }
  });

  // Дублировать документ
  router.post('/:id/duplicate', authenticateToken, (req, res) => {
    try {
      const document = db.getDocumentById(req.params.id);
      
      if (!document) {
        return res.status(404).json({ error: 'Документ не найден' });
      }

      const data = JSON.parse(document.data_json);
      const newDocument = db.createDocument(
        `${document.title} (Копия)`,
        document.template_id,
        data,
        req.user.id,
        'draft',
        document.tags
      );

      broadcastEvent('document_created', { document: newDocument });
      db.logAudit(req.user.id, 'DUPLICATE_DOCUMENT', 'document', newDocument.id, { sourceId: document.id }, req.ip);

      res.status(201).json({ message: 'Документ дублирован', document: newDocument });
    } catch (error) {
      console.error('Ошибка дублирования документа:', error);
      res.status(500).json({ error: 'Ошибка при дублировании документа' });
    }
  });

  // Получить статистику документов
  router.get('/stats/overview', authenticateToken, (req, res) => {
    try {
      const allDocs = db.getAllDocuments();
      
      const stats = {
        total: allDocs.length,
        draft: allDocs.filter(d => d.status === 'draft').length,
        approved: allDocs.filter(d => d.status === 'approved').length,
        archived: allDocs.filter(d => d.status === 'archived').length,
        expired: allDocs.filter(d => {
          if (!d.expires_at) return false;
          return new Date(d.expires_at) < new Date();
        }).length
      };

      res.json({ stats });
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      res.status(500).json({ error: 'Ошибка при получении статистики' });
    }
  });

  return router;
}
