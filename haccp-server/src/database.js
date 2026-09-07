import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export default class DatabaseManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  initialize() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    
    // Таблица пользователей
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        full_name TEXT,
        department TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Таблица шаблонов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        type TEXT DEFAULT 'sheet',
        orientation TEXT DEFAULT 'portrait',
        config_json TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_public INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        tags TEXT,
        usage_count INTEGER DEFAULT 0,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Таблица документов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        template_id TEXT,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        data_json TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        approved_by TEXT,
        approved_at TEXT,
        expires_at TEXT,
        tags TEXT,
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (approved_by) REFERENCES users(id)
      )
    `);

    // Таблица настроек системы
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        type TEXT DEFAULT 'string',
        description TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица аудита/логов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Таблица категорий шаблонов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        icon TEXT,
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (parent_id) REFERENCES categories(id)
      )
    `);

    // Индексы для производительности
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
      CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);
      CREATE INDEX IF NOT EXISTS idx_documents_template ON documents(template_id);
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
      CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    `);

    // Создаем администратора по умолчанию
    this.createDefaultAdmin();

    // Создаем категории по умолчанию
    this.createDefaultCategories();

    // Создаем настройки по умолчанию
    this.createDefaultSettings();

    console.log('✅ База данных инициализирована');
  }

  createDefaultAdmin() {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO users (id, username, email, password_hash, role, full_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const adminId = uuidv4();
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    stmt.run(adminId, 'admin', 'admin@haccp.local', hashedPassword, 'admin', 'Администратор Системы');
  }

  createDefaultCategories() {
    const categories = [
      { id: 'cat_temperature', name: 'Температурный контроль', icon: 'thermometer', color: '#ef4444' },
      { id: 'cat_humidity', name: 'Влажность', icon: 'droplet', color: '#3b82f6' },
      { id: 'cat_hygiene', name: 'Гигиена', icon: 'hand', color: '#10b981' },
      { id: 'cat_storage', name: 'Хранение', icon: 'package', color: '#f59e0b' },
      { id: 'cat_production', name: 'Производство', icon: 'factory', color: '#8b5cf6' },
      { id: 'cat_delivery', name: 'Доставка', icon: 'truck', color: '#06b6d4' }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO categories (id, name, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    categories.forEach((cat, index) => {
      stmt.run(cat.id, cat.name, cat.icon, cat.color, index);
    });
  }

  createDefaultSettings() {
    const settings = [
      { key: 'system_name', value: 'HACCP Control Enterprise', type: 'string', description: 'Название системы' },
      { key: 'default_orientation', value: 'portrait', type: 'string', description: 'Ориентация по умолчанию' },
      { key: 'max_upload_size', value: '52428800', type: 'number', description: 'Максимальный размер загрузки (байты)' },
      { key: 'session_timeout', value: '3600', type: 'number', description: 'Таймаут сессии (секунды)' },
      { key: 'backup_enabled', value: 'true', type: 'boolean', description: 'Автоматическое резервное копирование' },
      { key: 'audit_enabled', value: 'true', type: 'boolean', description: 'Ведение журнала аудита' }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, type, description)
      VALUES (?, ?, ?, ?)
    `);

    settings.forEach(setting => {
      stmt.run(setting.key, setting.value, setting.type, setting.description);
    });
  }

  // Пользователи
  getUserByUsername(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  getUserById(id) {
    return this.db.prepare('SELECT id, username, email, role, full_name, department, created_at, last_login, is_active FROM users WHERE id = ?').get(id);
  }

  createUser(username, email, password, role = 'user', fullName = '') {
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, full_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, username, email, passwordHash, role, fullName);
    return this.getUserById(id);
  }

  updateUserLastLogin(userId) {
    this.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
  }

  getUserCount() {
    return this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  }

  // Шаблоны
  getAllTemplates() {
    return this.db.prepare(`
      SELECT t.*, u.username as creator_name 
      FROM templates t 
      LEFT JOIN users u ON t.created_by = u.id 
      ORDER BY t.updated_at DESC
    `).all();
  }

  getTemplateById(id) {
    return this.db.prepare(`
      SELECT t.*, u.username as creator_name 
      FROM templates t 
      LEFT JOIN users u ON t.created_by = u.id 
      WHERE t.id = ?
    `).get(id);
  }

  getTemplatesByCategory(category) {
    return this.db.prepare('SELECT * FROM templates WHERE category = ? ORDER BY usage_count DESC').all(category);
  }

  createTemplate(name, description, category, type, configJson, createdBy, isPublic = 0, tags = '') {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO templates (id, name, description, category, type, config_json, created_by, is_public, tags)
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 'system'), ?, ?)
    `);
    stmt.run(id, name, description, category, type, JSON.stringify(configJson), createdBy, isPublic, tags);
    return this.getTemplateById(id);
  }

  updateTemplate(id, updates) {
    const allowedFields = ['name', 'description', 'category', 'type', 'config_json', 'is_public', 'tags'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'config_json' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getTemplateById(id);
  }

  deleteTemplate(id) {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  }

  incrementTemplateUsage(id) {
    this.db.prepare('UPDATE templates SET usage_count = usage_count + 1 WHERE id = ?').run(id);
  }

  getTemplateCount() {
    return this.db.prepare('SELECT COUNT(*) as count FROM templates').get().count;
  }

  // Документы
  getAllDocuments() {
    return this.db.prepare(`
      SELECT d.*, t.name as template_name, u.username as creator_name
      FROM documents d
      LEFT JOIN templates t ON d.template_id = t.id
      LEFT JOIN users u ON d.created_by = u.id
      ORDER BY d.updated_at DESC
    `).all();
  }

  getDocumentById(id) {
    return this.db.prepare(`
      SELECT d.*, t.name as template_name
      FROM documents d
      LEFT JOIN templates t ON d.template_id = t.id
      WHERE d.id = ?
    `).get(id);
  }

  getDocumentsByStatus(status) {
    return this.db.prepare('SELECT * FROM documents WHERE status = ? ORDER BY updated_at DESC').all(status);
  }

  createDocument(title, templateId, dataJson, createdBy, status = 'draft', tags = '') {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO documents (id, title, template_id, status, data_json, created_by, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, title, templateId, status, JSON.stringify(dataJson), createdBy, tags);
    return this.getDocumentById(id);
  }

  updateDocument(id, updates) {
    const allowedFields = ['title', 'status', 'data_json', 'approved_by', 'approved_at', 'expires_at', 'tags'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'data_json' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getDocumentById(id);
  }

  deleteDocument(id) {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  }

  getDocumentCount() {
    return this.db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
  }

  // Настройки
  getSetting(key) {
    return this.db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
  }

  getAllSettings() {
    return this.db.prepare('SELECT * FROM settings').all();
  }

  updateSetting(key, value) {
    this.db.prepare(`
      UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?
    `).run(value, key);
  }

  // Аудит
  logAudit(userId, action, entityType, entityId, details, ipAddress = '') {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, action, entityType, entityId, JSON.stringify(details), ipAddress);
  }

  getAuditLogs(limit = 100) {
    return this.db.prepare(`
      SELECT a.*, u.username 
      FROM audit_log a 
      LEFT JOIN users u ON a.user_id = u.id 
      ORDER BY a.created_at DESC 
      LIMIT ?
    `).all(limit);
  }

  // Категории
  getAllCategories() {
    return this.db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  }

  getCategoryById(id) {
    return this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
