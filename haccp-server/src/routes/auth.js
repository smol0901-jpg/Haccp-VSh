import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'haccp-enterprise-secret-key-2026';

export default function authRoutes(db) {
  const router = Router();

  // Middleware для проверки токена
  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Неверный токен' });
      }
      req.user = user;
      next();
    });
  };

  // Регистрация нового пользователя
  router.post('/register', (req, res) => {
    try {
      const { username, email, password, fullName, department } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Необходимо указать username, email и пароль' });
      }

      const existingUser = db.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: 'Пользователь с таким именем уже существует' });
      }

      const user = db.createUser(username, email, password, 'user', fullName);
      
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      db.logAudit(user.id, 'REGISTER', 'user', user.id, { username }, req.ip);

      res.status(201).json({
        message: 'Пользователь успешно зарегистрирован',
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
        token
      });
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      res.status(500).json({ error: 'Ошибка при регистрации' });
    }
  });

  // Логин
  router.post('/login', (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Необходимо указать имя пользователя и пароль' });
      }

      const user = db.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
      }

      if (!user.is_active) {
        return res.status(403).json({ error: 'Учетная запись заблокирована' });
      }

      const validPassword = bcrypt.compareSync(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
      }

      db.updateUserLastLogin(user.id);

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      db.logAudit(user.id, 'LOGIN', 'user', user.id, { username }, req.ip);

      res.json({
        message: 'Успешная авторизация',
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email,
          role: user.role,
          fullName: user.full_name,
          department: user.department
        },
        token
      });
    } catch (error) {
      console.error('Ошибка входа:', error);
      res.status(500).json({ error: 'Ошибка при входе' });
    }
  });

  // Получение текущего пользователя
  router.get('/me', authenticateToken, (req, res) => {
    try {
      const user = db.getUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      res.json({ user });
    } catch (error) {
      console.error('Ошибка получения профиля:', error);
      res.status(500).json({ error: 'Ошибка при получении профиля' });
    }
  });

  // Обновление профиля
  router.put('/profile', authenticateToken, (req, res) => {
    try {
      const { fullName, department } = req.body;
      const userId = req.user.id;

      const stmt = db.db.prepare(`
        UPDATE users SET full_name = ?, department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `);
      stmt.run(fullName || '', department || '', userId);

      const updatedUser = db.getUserById(userId);

      db.logAudit(userId, 'UPDATE_PROFILE', 'user', userId, { fullName, department }, req.ip);

      res.json({ message: 'Профиль обновлен', user: updatedUser });
    } catch (error) {
      console.error('Ошибка обновления профиля:', error);
      res.status(500).json({ error: 'Ошибка при обновлении профиля' });
    }
  });

  // Смена пароля
  router.put('/change-password', authenticateToken, (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      const user = db.getUserById(userId);
      const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Текущий пароль неверен' });
      }

      const newHash = bcrypt.hashSync(newPassword, 10);
      db.db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newHash, userId);

      db.logAudit(userId, 'CHANGE_PASSWORD', 'user', userId, {}, req.ip);

      res.json({ message: 'Пароль успешно изменен' });
    } catch (error) {
      console.error('Ошибка смены пароля:', error);
      res.status(500).json({ error: 'Ошибка при смене пароля' });
    }
  });

  // Выход (для логирования)
  router.post('/logout', authenticateToken, (req, res) => {
    db.logAudit(req.user.id, 'LOGOUT', 'user', req.user.id, {}, req.ip);
    res.json({ message: 'Успешный выход' });
  });

  return router;
}
