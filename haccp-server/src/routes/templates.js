import { Router } from 'express';

export default function templateRoutes(db, broadcastEvent) {
  const router = Router();

  // Middleware для проверки токена (упрощенная версия)
  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      // Для локальной сети разрешаем доступ без авторизации
      req.user = { id: 'system', username: 'local', role: 'user' };
      return next();
    }

    // Здесь можно добавить полноценную проверку JWT
    req.user = { id: 'system', username: 'local', role: 'user' };
    next();
  };

  // Получить все шаблоны
  router.get('/', authenticateToken, (req, res) => {
    try {
      const { category, type, search } = req.query;
      let templates = db.getAllTemplates();

      if (category) {
        templates = templates.filter(t => t.category === category);
      }

      if (type) {
        templates = templates.filter(t => t.type === type);
      }

      if (search) {
        const searchLower = search.toLowerCase();
        templates = templates.filter(t => 
          t.name.toLowerCase().includes(searchLower) ||
          (t.description && t.description.toLowerCase().includes(searchLower))
        );
      }

      res.json({ templates });
    } catch (error) {
      console.error('Ошибка получения шаблонов:', error);
      res.status(500).json({ error: 'Ошибка при получении шаблонов' });
    }
  });

  // Получить шаблон по ID
  router.get('/:id', authenticateToken, (req, res) => {
    try {
      const template = db.getTemplateById(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Шаблон не найден' });
      }

      // Увеличиваем счетчик использования
      db.incrementTemplateUsage(template.id);

      res.json({ template });
    } catch (error) {
      console.error('Ошибка получения шаблона:', error);
      res.status(500).json({ error: 'Ошибка при получении шаблона' });
    }
  });

  // Создать новый шаблон
  router.post('/', authenticateToken, (req, res) => {
    try {
      const { name, description, category, type, config, isPublic, tags } = req.body;

      if (!name || !config) {
        return res.status(400).json({ error: 'Необходимо указать название и конфигурацию' });
      }

      const template = db.createTemplate(
        name,
        description || '',
        category || 'general',
        type || 'sheet',
        config,
        req.user.id,
        isPublic ? 1 : 0,
        tags || ''
      );

      broadcastEvent('template_created', { template });
      db.logAudit(req.user.id, 'CREATE_TEMPLATE', 'template', template.id, { name }, req.ip);

      res.status(201).json({ message: 'Шаблон успешно создан', template });
    } catch (error) {
      console.error('Ошибка создания шаблона:', error);
      res.status(500).json({ error: 'Ошибка при создании шаблона' });
    }
  });

  // Обновить шаблон
  router.put('/:id', authenticateToken, (req, res) => {
    try {
      const template = db.getTemplateById(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Шаблон не найден' });
      }

      const updates = {};
      const allowedFields = ['name', 'description', 'category', 'type', 'config', 'isPublic', 'tags'];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field === 'config' ? 'config_json' : field] = req.body[field];
        }
      }

      const updatedTemplate = db.updateTemplate(req.params.id, updates);

      broadcastEvent('template_updated', { template: updatedTemplate });
      db.logAudit(req.user.id, 'UPDATE_TEMPLATE', 'template', req.params.id, updates, req.ip);

      res.json({ message: 'Шаблон успешно обновлен', template: updatedTemplate });
    } catch (error) {
      console.error('Ошибка обновления шаблона:', error);
      res.status(500).json({ error: 'Ошибка при обновлении шаблона' });
    }
  });

  // Удалить шаблон
  router.delete('/:id', authenticateToken, (req, res) => {
    try {
      const template = db.getTemplateById(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Шаблон не найден' });
      }

      db.deleteTemplate(req.params.id);

      broadcastEvent('template_deleted', { templateId: req.params.id });
      db.logAudit(req.user.id, 'DELETE_TEMPLATE', 'template', req.params.id, { name: template.name }, req.ip);

      res.json({ message: 'Шаблон успешно удален' });
    } catch (error) {
      console.error('Ошибка удаления шаблона:', error);
      res.status(500).json({ error: 'Ошибка при удалении шаблона' });
    }
  });

  // Дублировать шаблон
  router.post('/:id/duplicate', authenticateToken, (req, res) => {
    try {
      const template = db.getTemplateById(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Шаблон не найден' });
      }

      const config = JSON.parse(template.config_json);
      const newTemplate = db.createTemplate(
        `${template.name} (Копия)`,
        template.description,
        template.category,
        template.type,
        config,
        req.user.id,
        0,
        template.tags
      );

      broadcastEvent('template_created', { template: newTemplate });
      db.logAudit(req.user.id, 'DUPLICATE_TEMPLATE', 'template', newTemplate.id, { sourceId: template.id }, req.ip);

      res.status(201).json({ message: 'Шаблон дублирован', template: newTemplate });
    } catch (error) {
      console.error('Ошибка дублирования шаблона:', error);
      res.status(500).json({ error: 'Ошибка при дублировании шаблона' });
    }
  });

  // Получить категории шаблонов
  router.get('/categories/list', authenticateToken, (req, res) => {
    try {
      const categories = db.getAllCategories();
      res.json({ categories });
    } catch (error) {
      console.error('Ошибка получения категорий:', error);
      res.status(500).json({ error: 'Ошибка при получении категорий' });
    }
  });

  // Экспорт шаблона в JSON файл
  router.get('/:id/export', authenticateToken, (req, res) => {
    try {
      const template = db.getTemplateById(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: 'Шаблон не найден' });
      }

      const exportData = {
        version: '6.0',
        exportedAt: new Date().toISOString(),
        template: {
          ...template,
          config_json: JSON.parse(template.config_json)
        }
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${template.name.replace(/[^a-z0-9]/gi, '_')}.json`);
      res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
      console.error('Ошибка экспорта шаблона:', error);
      res.status(500).json({ error: 'Ошибка при экспорте шаблона' });
    }
  });

  // Импорт шаблона из JSON
  router.post('/import', authenticateToken, (req, res) => {
    try {
      const { templateData } = req.body;

      if (!templateData || !templateData.template) {
        return res.status(400).json({ error: 'Неверный формат данных импорта' });
      }

      const tpl = templateData.template;
      const config = tpl.config_json || tpl.config;

      const newTemplate = db.createTemplate(
        tpl.name,
        tpl.description || '',
        tpl.category || 'general',
        tpl.type || 'sheet',
        config,
        req.user.id,
        tpl.is_public || 0,
        tpl.tags || ''
      );

      broadcastEvent('template_imported', { template: newTemplate });
      db.logAudit(req.user.id, 'IMPORT_TEMPLATE', 'template', newTemplate.id, { source: 'json_import' }, req.ip);

      res.status(201).json({ message: 'Шаблон успешно импортирован', template: newTemplate });
    } catch (error) {
      console.error('Ошибка импорта шаблона:', error);
      res.status(500).json({ error: 'Ошибка при импорте шаблона' });
    }
  });

  return router;
}
