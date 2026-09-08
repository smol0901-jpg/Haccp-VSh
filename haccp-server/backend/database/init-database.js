/**
 * Database Initialization Module
 * Creates SQLite database with all required tables for HACCP system
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Ensure database directory exists
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'haccp.db');

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
function initializeDatabase() {
    console.log('📦 Initializing database...');

    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            email TEXT,
            role TEXT DEFAULT 'operator' CHECK(role IN ('admin', 'technologist', 'operator', 'viewer')),
            department TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    `);

    // Templates table - stores document templates
    db.exec(`
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'general',
            type TEXT DEFAULT 'sheet' CHECK(type IN ('sheet', 'journal', 'report')),
            configuration JSON NOT NULL,
            created_by INTEGER,
            is_preset BOOLEAN DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            version INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Documents table - instances of filled documents
    db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'completed', 'approved', 'archived')),
            data JSON,
            created_by INTEGER,
            approved_by INTEGER,
            period_start DATE,
            period_end DATE,
            qr_code_hash TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Document history/audit log
    db.exec(`
        CREATE TABLE IF NOT EXISTS document_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            user_id INTEGER,
            action TEXT NOT NULL CHECK(action IN ('create', 'update', 'approve', 'export', 'delete')),
            changes JSON,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Template categories for organization
    db.exec(`
        CREATE TABLE IF NOT EXISTS template_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            parent_id INTEGER,
            sort_order INTEGER DEFAULT 0,
            icon TEXT,
            color TEXT,
            FOREIGN KEY (parent_id) REFERENCES template_categories(id) ON DELETE SET NULL
        )
    `);

    // Signature profiles for quick access
    db.exec(`
        CREATE TABLE IF NOT EXISTS signature_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            role_title TEXT NOT NULL,
            full_name TEXT NOT NULL,
            position TEXT,
            is_default BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // System settings
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value JSON NOT NULL,
            description TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_by INTEGER,
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Sessions table for JWT token management
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Create indexes for performance
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
        CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
        CREATE INDEX IF NOT EXISTS idx_documents_template ON documents(template_id);
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
        CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);
        CREATE INDEX IF NOT EXISTS idx_document_history_doc ON document_history(document_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `);

    // Insert default admin user if not exists
    const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin');
    if (adminExists.count === 0) {
        const passwordHash = bcrypt.hashSync('admin123', parseInt(process.env.BCRYPT_ROUNDS) || 10);
        db.prepare(`
            INSERT INTO users (username, password_hash, full_name, role, department)
            VALUES (?, ?, ?, ?, ?)
        `).run('admin', passwordHash, 'Системный Администратор', 'admin', 'IT Отдел');
        console.log('✅ Default admin user created (username: admin, password: admin123)');
    }

    // Insert preset template categories
    const categories = [
        { name: 'temperature', description: 'Температурные журналы', icon: '🌡️', color: '#ef4444' },
        { name: 'sanitation', description: 'Санитарный контроль', icon: '🧼', color: '#10b981' },
        { name: 'brakerazh', description: 'Бракераж продукции', icon: '🍽️', color: '#f59e0b' },
        { name: 'storage', description: 'Контроль хранения', icon: '📦', color: '#3b82f6' },
        { name: 'production', description: 'Производственный контроль', icon: '🏭', color: '#8b5cf6' },
        { name: 'delivery', description: 'Входной контроль сырья', icon: '🚚', color: '#06b6d4' }
    ];

    categories.forEach(cat => {
        const exists = db.prepare('SELECT COUNT(*) as count FROM template_categories WHERE name = ?').get(cat.name);
        if (exists.count === 0) {
            db.prepare(`
                INSERT INTO template_categories (name, description, icon, color)
                VALUES (?, ?, ?, ?)
            `).run(cat.name, cat.description, cat.icon, cat.color);
        }
    });

    // Insert default system settings
    const defaultSettings = {
        app_name: 'HACCP Control Server v6.0',
        company_name: '',
        company_address: '',
        company_inn: '',
        logo_url: '',
        default_orientation: 'portrait',
        default_font_size: 10,
        default_row_height: 13,
        enable_qr_codes: true,
        enable_auto_fill: true,
        session_timeout_minutes: 480,
        max_upload_size_mb: 10,
        allowed_file_types: ['jpg', 'jpeg', 'png', 'pdf', 'xlsx', 'doc', 'docx'],
        backup_enabled: true,
        backup_interval_hours: 24
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
        const exists = db.prepare('SELECT COUNT(*) as count FROM settings WHERE key = ?').get(key);
        if (exists.count === 0) {
            db.prepare(`
                INSERT INTO settings (key, value, description)
                VALUES (?, ?, ?)
            `).run(key, JSON.stringify(value), `Setting: ${key}`);
        }
    }

    // Insert preset templates
    insertPresetTemplates();

    console.log('✅ Database initialized successfully!');
    return db;
}

function insertPresetTemplates() {
    const presets = [
        {
            name: '⭐ Пресет: Фритюрные масла (ККТ)',
            description: 'Журнал мониторинга критической контрольной точки: фритюрные масла',
            category: 'temperature',
            type: 'sheet',
            configuration: {
                mode: "sheet",
                orientation: "portrait",
                fontSizeTable: "10",
                rowHeight: "13",
                marginLeft: "25",
                org: "ООО \"ПРОДОВОЛЬСТВЕННЫЙ АЛЬЯНС\"",
                systemTag: "СИСТЕМА КАЧЕСТВА И БЕЗОПАСНОСТИ НА ОСНОВЕ ПРИНЦИПОВ ХАССП",
                title: "ЖУРНАЛ МОНИТОРИНГА КРИТИЧЕСКОЙ КОНТРОЛЬНОЙ ТОЧКИ (ККТ): ФРИТЮРНЫЕ МАСЛА",
                metaFields: [
                    { label: "Предприятие/Филиал", val: "Цех №2 Овощной" },
                    { label: "Номер ККТ / Емкости", val: "Фритюрница Куб №4" },
                    { label: "Период (Месяц/Год)", val: "Май 2026" }
                ],
                columns: [
                    { name: "№ п/п", width: "8" },
                    { name: "Контролируемый параметр ККТ / Операция", width: "50" },
                    { name: "Фактический показатель", width: "24" },
                    { name: "Подпись отв. лица", width: "18" }
                ],
                rowLabels: [
                    "Приемка смены: Фактический объем масла на начало (л)",
                    "Мониторинг ККТ: Температура фритюра (°C) перед началом жарки",
                    "Мониторинг ККТ: Органолептическая оценка (вкус, запах, цвет)",
                    "Пополнение: Объем добавленного свежего масла (л)",
                    "Слив партии: Объем и дата слива отработанного масла (л)",
                    "Сдача смен: Фактический объем масла на конец смены (л)"
                ],
                limitsText: "Критические пределы (Требования ТР ТС 021/2011):\n1. Запрещается использование масел при наличии горького вкуса или запаха гари.\n2. Предельная степень распада масла — не более 1% измененных триглицеридов.",
                signatures: [
                    { role: "Дежурный повар", name: "Иванов И.И." },
                    { role: "Санитарный врач", name: "Петрова А.К." }
                ]
            }
        },
        {
            name: '⭐ Пресет: Температура оборудования',
            description: 'Журнал учета температурного режима холодильного оборудования',
            category: 'temperature',
            type: 'journal',
            configuration: {
                mode: "journal",
                orientation: "landscape",
                fontSizeTable: "9",
                rowHeight: "10",
                marginLeft: "25",
                org: "ООО \"ПИЩЕПРОМ-СЕРВИС\"",
                systemTag: "ТР ТС 021/2011 | ПРОГРАММА ПРОИЗВОДСТВЕННОГО КОНТРОЛЯ ХАССП",
                title: "ЖУРНАЛ УЧЕТА ТЕМПЕРАТУРНОГО РЕЖИМА ХОЛОДИЛЬНОГО ОБОРУДОВАНИЯ",
                journalPages: 3,
                journalRowsPerPage: 15,
                metaFields: [
                    { label: "Производственный цех", val: "Мясной цех №1" },
                    { label: "Наименование/номер оборудования", val: "Холодильный шкаф Polair №3" }
                ],
                columns: [
                    { name: "Дата", width: "10" },
                    { name: "t° по паспорту (°C)", width: "15" },
                    { name: "t° факт. (Утро)", width: "15" },
                    { name: "t° факт. (Вечер)", width: "15" },
                    { name: "Влажность воздуха %", width: "15" },
                    { name: "Отклонения / Меры", width: "20" },
                    { name: "Подпись", width: "10" }
                ],
                rowLabels: [],
                limitsText: "Критические пределы:\nДля среднетемпературного оборудования: 0°C ... +6°C.\nДля низкотемпературного оборудования: -18°C и ниже.",
                signatures: [
                    { role: "Ответственный за мониторинг", name: "Сидоров Н.П." }
                ]
            }
        },
        {
            name: '⭐ Пресет: Санитарный контроль емкостей',
            description: 'Лист контроля санитарного состояния и мойки оборудования',
            category: 'sanitation',
            type: 'sheet',
            configuration: {
                mode: "sheet",
                orientation: "portrait",
                fontSizeTable: "10",
                rowHeight: "12",
                marginLeft: "30",
                org: "ГК \"ФУД-МАСТЕР\"",
                systemTag: "САНПИН 2.3/2.4.3590-20 | САНИТАРНЫЙ РЕГЛАМЕНТ",
                title: "ЛИСТ КОНТРОЛЯ САНИТАРНОГО СОСТОЯНИЯ И МОЙКИ ОБОРУДОВАНИЯ",
                metaFields: [
                    { label: "Оборудование", val: "Ленточный транспортер линии №2" },
                    { label: "Ответственный за цех", val: "Смирнов В.П." }
                ],
                columns: [
                    { name: "№", width: "6" },
                    { name: "Объект / Элемент санобработки", width: "45" },
                    { name: "Метод и средство очистки", width: "25" },
                    { name: "Качество (смыв/визуал)", width: "24" }
                ],
                rowLabels: [
                    "Рабочая поверхность транспортерной ленты",
                    "Защитные кожухи и направляющие металлические элементы",
                    "Приводной вал и натяжной механизм",
                    "Кнопки управления и пульт аварийной остановки",
                    "Очистка подпольного пространства под конвейером"
                ],
                limitsText: "Контроль чистоты:\nВизуальная чистота — полное отсутствие следов сырья, органики и моющих средств.\nИнструментальный контроль — экспресс-тесты на АТФ (норма < 30 RLU).",
                signatures: [
                    { role: "Исполнитель (мойщик)", name: "Козлов К.М." },
                    { role: "Проверил (мастер смены)", name: "Смирнов В.П." }
                ]
            }
        },
        {
            name: '⭐ Пресет: Бракеражный журнал',
            description: 'Журнал бракеража готовой кулинарной продукции',
            category: 'brakerazh',
            type: 'journal',
            configuration: {
                mode: "journal",
                orientation: "landscape",
                fontSizeTable: "9",
                rowHeight: "10",
                marginLeft: "25",
                org: "ООО \"ОБЩЕПИТ-СЕРВИС\"",
                systemTag: "СП 2.3/2.4.3590-20 | БРАКЕРАЖ ГОТОВОЙ ПРОДУКЦИИ",
                title: "ЖУРНАЛ БРАКЕРАЖА ГОТОВОЙ КУЛИНАРНОЙ ПРОДУКЦИИ",
                journalPages: 5,
                journalRowsPerPage: 20,
                metaFields: [
                    { label: "Столовая/Цех", val: "Столовая №1" },
                    { label: "Период контроля", val: "__________ 20___ г." }
                ],
                columns: [
                    { name: "№ п/п", width: "6" },
                    { name: "Дата и время", width: "12" },
                    { name: "Наименование блюда", width: "25" },
                    { name: "Выход (г)", width: "10" },
                    { name: "Органолептика", width: "15" },
                    { name: "Готовность", width: "12" },
                    { name: "Разрешение к реализации", width: "15" },
                    { name: "Подпись бракера", width: "10" }
                ],
                rowLabels: [],
                limitsText: "Требования к качеству:\n1. Внешний вид - соответствует наименованию\n2. Цвет - характерный для данного вида продукта\n3. Запах - приятный, без посторонних оттенков\n4. Консистенция - однородная\n5. Температура подачи - согласно технологической карте",
                signatures: [
                    { role: "Председатель бракеражной комиссии", name: "" },
                    { role: "Член комиссии", name: "" },
                    { role: "Ответственный повар", name: "" }
                ]
            }
        }
    ];

    presets.forEach(preset => {
        const exists = db.prepare('SELECT COUNT(*) as count FROM templates WHERE name = ?').get(preset.name);
        if (exists.count === 0) {
            db.prepare(`
                INSERT INTO templates (name, description, category, type, configuration, is_preset)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(
                preset.name,
                preset.description,
                preset.category,
                preset.type,
                JSON.stringify(preset.configuration)
            );
        }
    });

    console.log(`✅ Inserted ${presets.length} preset templates`);
}

// Export database instance and initialization function
module.exports = db;
module.exports.initializeDatabase = initializeDatabase;

// Run initialization on module load
initializeDatabase();
