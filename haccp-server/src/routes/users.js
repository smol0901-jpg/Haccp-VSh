import { Router } from 'express';

export default function userRoutes(db) {
  const router = Router();

  const authenticateToken = (req, res, next) => {
    req.user = { id: 'system', username: 'local', role: 'admin' };
    next();
  };

  // Получить всех пользователей (только для админов)
  router.get('/', authenticateToken, (req, res) => {
    try {
      const users = db.db.prepare('SELECT id, username, email, role, full_name, department, created_at, last_login, is_active FROM users').all();
      res.json({ users });
    } catch (error) {
      console.error('Ошибка получения пользователей:', error);
      res.status(500).json({ error: 'Ошибка при получении пользователей' });
    }
  });

  // Получить пользователя по ID
  router.get('/:id', authenticateToken, (req, res) => {
    try {
      const user = db.getUserById(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      res.json({ user });
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      res.status(500).json({ error: 'Ошибка при получении пользователя' });
    }
  });

  // Создать пользователя
  router.post('/', authenticateToken, (req, res) => {
    try {
      const { username, email, password, role, fullName, department } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Необходимо указать username, email и пароль' });
      }

      const existingUser = db.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: 'Пользователь с таким именем уже существует' });
      }

      const user = db.createUser(username, email, password, role || 'user', fullName);

      db.logAudit(req.user.id, 'CREATE_USER', 'user', user.id, { username, role }, req.ip);

      res.status(201).json({ message: 'Пользователь успешно создан', user });
    } catch (error) {
      console.error('Ошибка создания пользователя:', error);
      res.status(500).json({ error: 'Ошибка при создании пользователя' });
    }
  });

  // Обновить пользователя
  router.put('/:id', authenticateToken, (req, res) => {
    try {
      const user = db.getUserById(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const { fullName, department, role, isActive } = req.body;

      const stmt = db.db.prepare(`
        UPDATE users 
        SET full_name = ?, department = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      stmt.run(
        fullName !== undefined ? fullName : user.full_name,
        department !== undefined ? department : user.department,
        role !== undefined ? role : user.role,
        isActive !== undefined ? (isActive ? 1 : 0) : user.is_active,
        req.params.id
      );

      const updatedUser = db.getUserById(req.params.id);

      db.logAudit(req.user.id, 'UPDATE_USER', 'user', req.params.id, { fullName, department, role, isActive }, req.ip);

      res.json({ message: 'Пользователь обновлен', user: updatedUser });
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error);
      res.status(500).json({ error: 'Ошибка при обновлении пользователя' });
    }
  });

  // Удалить пользователя
  router.delete('/:id', authenticateToken, (req, res) => {
    try {
      const user = db.getUserById(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      // Нельзя удалить самого себя
      if (user.id === req.user.id) {
        return res.status(400).json({ error: 'Нельзя удалить собственную учетную запись' });
      }

      db.db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

      db.logAudit(req.user.id, 'DELETE_USER', 'user', req.params.id, { username: user.username }, req.ip);

      res.json({ message: 'Пользователь удален' });
    } catch (error) {
      console.error('Ошибка удаления пользователя:', error);
      res.status(500).json({ error: 'Ошибка при удалении пользователя' });
    }
  });

  // Активировать/деактивировать пользователя
  router.patch('/:id/toggle-status', authenticateToken, (req, res) => {
    try {
      const user = db.getUserById(req.params.id);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const newStatus = user.is_active ? 0 : 1;
      db.db.prepare('UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newStatus, req.params.id);

      const updatedUser = db.getUserById(req.params.id);

      db.logAudit(req.user.id, 'TOGGLE_USER_STATUS', 'user', req.params.id, { isActive: newStatus }, req.ip);

      res.json({ message: `Пользователь ${newStatus ? 'активирован' : 'деактивирован'}`, user: updatedUser });
    } catch (error) {
      console.error('Ошибка изменения статуса пользователя:', error);
      res.status(500).json({ error: 'Ошибка при изменении статуса пользователя' });
    }
  });

  return router;
}
