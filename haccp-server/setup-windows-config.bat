@echo off
chcp 65001 >nul
echo ========================================
echo   HACCP Control Server v6.0
echo   Настройка для Windows 10
echo ========================================
echo.

REM Проверка прав администратора
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ВНИМАНИЕ] Запустите от имени администратора для полной настройки!
    echo.
)

echo [1/4] Проверка Node.js...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Node.js не найден!
    echo Установите Node.js с https://nodejs.org
    pause
    exit /b 1
)
node --version
echo [OK] Node.js установлен
echo.

echo [2/4] Установка зависимостей...
if not exist "node_modules" (
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ОШИБКА] Ошибка установки зависимостей!
        pause
        exit /b 1
    )
) else (
    echo [INFO] Зависимости уже установлены
)
echo [OK] Зависимости готовы
echo.

echo [3/4] Создание папок...
if not exist "uploads" mkdir uploads
if not exist "exports" mkdir exports
if not exist "backups" mkdir backups
if not exist "logs" mkdir logs
echo [OK] Папки созданы
echo.

echo [4/4] Проверка базы данных...
if exist "haccp.db" (
    echo [INFO] База данных существует
) else (
    echo [INFO] База данных будет создана при первом запуске
)
echo.

echo ========================================
echo   Настройка завершена!
echo ========================================
echo.
echo Следующие шаги:
echo   1. Запустите start-haccp.bat
echo   2. Откройте http://localhost:3000
echo   3. Войдите как admin / admin123
echo.
pause
