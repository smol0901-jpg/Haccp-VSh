# 🚀 Установка HACCP Control Server v6.0 на Windows 10

## 📋 Системные требования
✅ **Твой ПК:** HP Laptop 15-dw1xxx (Intel Celeron N4120, 8GB RAM, Windows 10 Pro)  
✅ **Node.js:** v22.20.0 (уже установлен)  
✅ **Python:** 3.14.4 (уже установлен)  
✅ **Git:** установлен  

---

## 🔧 БЫСТРАЯ УСТАНОВКА (5 минут)

### Шаг 1: Открой PowerShell от имени администратора

```powershell
# Проверка установленных компонентов
node --version
npm --version
python --version
git --version
```

### Шаг 2: Перейди в папку проекта

```powershell
cd C:\project\haccp-control_v6
```

*Или создай новую папку:*
```powershell
mkdir C:\project\haccp-control_v6
cd C:\project\haccp-control_v6
```

### Шаг 3: Клонируй репозиторий (если еще не клонирован)

```powershell
git clone https://github.com/smol0901-jpg/haccp-control_v6.git .
```

### Шаг 4: Установка зависимостей

```powershell
# Установка backend зависимостей
cd haccp-server
npm install

# Если есть frontend
cd ..
cd haccp-client
npm install
```

### Шаг 5: Настройка базы данных

```powershell
cd ..\haccp-server

# Инициализация БД (создаст haccp.db)
node src/database.js --init
```

### Шаг 6: Запуск сервера

```powershell
# Обычный запуск
node src/server.js

# ИЛИ с nodemon (авто-перезагрузка при изменениях)
npx nodemon src/server.js
```

---

## 🌐 Доступ к серверу

### На этом компьютере:
- Открой браузер: `http://localhost:3000`

### В локальной сети (с других устройств):
1. Узнай свой IP:
   ```powershell
   ipconfig
   ```
   Найди строку `IPv4-адрес` (например, `192.168.1.100`)

2. Открой на другом устройстве:
   ```
   http://192.168.1.100:3000
   ```

---

## 🔐 Учетные данные по умолчанию

```
Логин: admin
Пароль: admin123
```

**⚠️ Смените пароль после первого входа!**

---

## ⚙️ Конфигурация для твоего ПК

### Оптимизация под Intel Celeron N4120 (4 ядра, 8GB RAM):

Создай файл `.env` в папке `haccp-server`:

```env
# Порт сервера
PORT=3000

# База данных
DB_PATH=./haccp.db

# JWT секрет (сгенерируйте свой!)
JWT_SECRET=haccp_super_secret_key_2026_change_this

# Максимум подключений (оптимизировано для 8GB RAM)
MAX_CONNECTIONS=50

# Размер пула БД
DB_POOL_SIZE=10

# Лимит памяти для Node.js (MB)
NODE_OPTIONS=--max-old-space-size=2048

# Путь для загрузок
UPLOAD_PATH=./uploads

# Путь для экспорта
EXPORT_PATH=./exports

# Время жизни JWT токена (часы)
JWT_EXPIRES_IN=24

# Логирование
LOG_LEVEL=info
LOG_FILE=./server.log

# CORS (разрешить локальную сеть)
CORS_ORIGIN=*

# Rate limiting (защита от перегрузки CPU)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 🛡️ Настройка брандмауэра Windows

Разрешить доступ к порту 3000 в локальной сети:

```powershell
# Открой PowerShell от имени администратора

New-NetFirewallRule -DisplayName "HACCP Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

**ИЛИ через интерфейс:**
1. Панель управления → Брандмауэр Защитника Windows
2. Дополнительные параметры
3. Правила для входящих подключений
4. Создать правило → Для порта → TCP 3000
5. Разрешить подключение

---

## 🔄 Автозапуск сервера

### Вариант 1: Через планировщик заданий Windows

1. Открой **Планировщик заданий**
2. Создайте простую задачу
3. Название: `HACCP Server`
4. Триггер: При входе в систему
5. Действие: Запустить программу
   - Программа: `C:\Program Files\nodejs\node.exe`
   - Аргументы: `C:\project\haccp-control_v6\haccp-server\src\server.js`
   - Рабочая папка: `C:\project\haccp-control_v6\haccp-server`

### Вариант 2: BAT-файл для быстрого запуска

Создай файл `start-haccp.bat` в папке проекта:

```batch
@echo off
chcp 65001 >nul
echo ========================================
echo   HACCP Control Server v6.0
echo   Запуск сервера...
echo ========================================
echo.

cd /d %~dp0haccp-server

REM Проверка Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Node.js не найден!
    echo Установите Node.js с https://nodejs.org
    pause
    exit /b 1
)

echo [OK] Node.js: 
node --version
echo.

REM Проверка наличия node_modules
if not exist "node_modules" (
    echo [INFO] Установка зависимостей...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ОШИБКА] Ошибка установки зависимостей!
        pause
        exit /b 1
    )
)

echo [OK] Зависимости установлены
echo.

REM Создание резервной копии БД
if exist "haccp.db" (
    echo [INFO] Создание резервной копии БД...
    copy /Y "haccp.db" "haccp.backup.db" >nul
    echo [OK] Резервная копия создана
)

echo.
echo ========================================
echo   Сервер запущен!
echo   Откройте: http://localhost:3000
echo   Нажмите Ctrl+C для остановки
echo ========================================
echo.

node src/server.js

pause
```

---

## 📊 Мониторинг ресурсов

### Проверка использования памяти:

```powershell
# В другом окне PowerShell
Get-Process node | Select-Object Name, CPU, WorkingSet, VirtualMemorySize
```

### Логи сервера:

```powershell
Get-Content .\haccp-server\server.log -Wait -Tail 50
```

---

## 🗄️ Резервное копирование базы данных

### Автоматическое ежедневное копирование:

Создай `backup-db.ps1`:

```powershell
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$source = "C:\project\haccp-control_v6\haccp-server\haccp.db"
$backup = "C:\project\haccp-backups\haccp_backup_$timestamp.db"

New-Item -ItemType Directory -Force -Path "C:\project\haccp-backups"
Copy-Item $source $backup

# Хранить только последние 7 копий
Get-ChildItem "C:\project\haccp-backups\haccp_backup_*.db" | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -Skip 7 | 
    Remove-Item

Write-Host "Резервная копия создана: $backup"
```

Запуск ежедневно в 23:00 через Планировщик заданий.

---

## 🐛 Решение проблем

### Ошибка: "Port 3000 already in use"

```powershell
# Найти процесс на порту 3000
netstat -ano | findstr :3000

# Убить процесс (замените PID на ваш)
taskkill /PID <PID> /F
```

### Ошибка: "Cannot find module 'better-sqlite3'"

```powershell
cd haccp-server
npm rebuild better-sqlite3
```

### Ошибка: "Database locked"

```powershell
# Закройте все подключения к БД
# Удалите файлы блокировки
del haccp.db-shm
del haccp.db-wal
```

### Сервер не виден в сети

1. Проверь брандмауэр (см. выше)
2. Убедись, что устройства в одной сети
3. Проверь IP: `ipconfig`
4. Попробуй `http://<твой-IP>:3000`

---

## 📦 Экспорт и импорт данных

### Экспорт всей базы в JSON:

```powershell
curl http://localhost:3000/api/export/all -o backup.json
```

### Импорт из JSON:

```powershell
curl -X POST http://localhost:3000/api/import ^
  -H "Content-Type: application/json" ^
  -d @backup.json
```

---

## 🎯 Производительность на твоем ПК

| Параметр | Значение | Рекомендация |
|----------|----------|--------------|
| CPU | Intel Celeron N4120 (4 ядра) | ✅ Достаточно |
| RAM | 8 GB | ✅ Оптимально |
| Свободно на C: | 50.21 GB | ✅ Много места |
| Max пользователей | 10-15 одновременных | Для большего увеличь RAM |
| Max документов | ~10,000 | Затем архивируй старые |

### Советы по оптимизации:

1. **Закрой лишние программы** (особенно браузер с множеством вкладок)
2. **Отключи OneDrive синхронизацию** папки проекта
3. **Используй SSD** (если есть) для БД
4. **Регулярно делай резервные копии**
5. **Архивируй старые документы** раз в месяц

---

## 📞 Поддержка

При возникновении проблем:

1. Проверь логи: `haccp-server/server.log`
2. Проверь версию Node.js: `node --version` (должна быть >= 18)
3. Переустанови зависимости: `npm install`
4. Пересоздай БД: удали `haccp.db` и запусти сервер заново

---

## 🎉 Готово!

Сервер готов к работе! Открой `http://localhost:3000` и начни работу.

**Следующие шаги:**
1. ✅ Войди как `admin` / `admin123`
2. ✅ Смени пароль администратора
3. ✅ Создай шаблоны документов
4. ✅ Добавь пользователей
5. ✅ Настрой категории и проверки

Успешной работы! 🚀
