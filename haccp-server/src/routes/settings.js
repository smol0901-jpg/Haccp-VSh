import { Router } from 'express';

export default function settingsRoutes(db) {
  const router = Router();

  const authenticateToken = (req, res, next) => {
    req.user = { id: 'system', username: 'local', role: 'admin' };
    next();
  };

  // Получить все настройки
  router.get('/', authenticateToken, (req, res) => {
    try {
      const settings = db.getAllSettings();
      res.json({ settings });
    } catch (error) {
      console.error('Ошибка получения настроек:', error);
      res.status(500).json({ error: 'Ошибка при получении настроек' });
    }
  });

  // Получить настройку по ключу
  router.get('/:key', authenticateToken, (req, res) => {
    try {
      const setting = db.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: 'Настройка не найдена' });
      }

      res.json({ setting });
    } catch (error) {
      console.error('Ошибка получения настройки:', error);
      res.status(500).json({ error: 'Ошибка при получении настройки' });
    }
  });

  // Обновить настройку
  router.put('/:key', authenticateToken, (req, res) => {
    try {
      const { value } = req.body;

      if (value === undefined) {
        return res.status(400).json({ error: 'Необходимо указать значение' });
      }

      db.updateSetting(req.params.key, value);

      const updatedSetting = db.getSetting(req.params.key);

      db.logAudit(req.user.id, 'UPDATE_SETTING', 'setting', req.params.key, { value }, req.ip);

      res.json({ message: 'Настройка обновлена', setting: updatedSetting });
    } catch (error) {
      console.error('Ошибка обновления настройки:', error);
      res.status(500).json({ error: 'Ошибка при обновлении настройки' });
    }
  });

  // Получить журнал аудита
  router.get('/audit/logs', authenticateToken, (req, res) => {
    try {
      const { limit = 100, action, entityType } = req.query;
      let logs = db.getAuditLogs(parseInt(limit));

      if (action) {
        logs = logs.filter(log => log.action === action);
      }

      if (entityType) {
        logs = logs.filter(log => log.entity_type === entityType);
      }

      res.json({ logs });
    } catch (error) {
      console.error('Ошибка получения журнала аудита:', error);
      res.status(500).json({ error: 'Ошибка при получении журнала аудита' });
    }
  });

  // Получить статистику системы
  router.get('/stats/system', authenticateToken, (req, res) => {
    try {
      const stats = {
        templates: db.getTemplateCount(),
        documents: db.getDocumentCount(),
        users: db.getUserCount(),
        categories: db.getAllCategories().length,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        version: '6.0.0'
      };

      res.json({ stats });
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      res.status(500).json({ error: 'Ошибка при получении статистики' });
    }
  });

  // Сбросить настройки к значениям по умолчанию
  router.post('/reset-defaults', authenticateToken, (req, res) => {
    try {
      const defaultSettings = [
        { key: 'system_name', value: 'HACCP Control Enterprise' },
        { key: 'default_orientation', value: 'portrait' },
        { key: 'max_upload_size', value: '52428800' },
        { key: 'session_timeout', value: '3600' },
        { key: 'backup_enabled', value: 'true' },
        { key: 'audit_enabled', value: 'true' }
      ];

      defaultSettings.forEach(setting => {
        db.updateSetting(setting.key, setting.value);
      });

      db.logAudit(req.user.id, 'RESET_SETTINGS', 'system', null, {}, req.ip);

      res.json({ message: 'Настройки сброшены к значениям по умолчанию' });
    } catch (error) {
      console.error('Ошибка сброса настроек:', error);
      res.status(500).json({ error: 'Ошибка при сбросе настроек' });
    }
  });

  return router;
}
