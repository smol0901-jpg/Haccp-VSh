@echo off
chcp 65001 >nul
echo ========================================
echo   HACCP Control Server v6.0
echo   Запуск сервера...
echo ========================================
echo.

cd /d %~dp0

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
echo   В локальной сети: http://YOUR_IP:3000
echo   Нажмите Ctrl+C для остановки
echo ========================================
echo.

node src/server.js

pause
