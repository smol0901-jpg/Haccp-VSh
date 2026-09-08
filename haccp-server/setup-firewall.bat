@echo off
chcp 65001 >nul
echo ========================================
echo   Настройка брандмауэра Windows
echo   для HACCP Control Server v6.0
echo ========================================
echo.

REM Проверка прав администратора
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ОШИБКА] Запустите от имени администратора!
    echo Щелкните правой кнопкой мыши и выберите "Запуск от имени администратора"
    pause
    exit /b 1
)

echo [INFO] Создание правила брандмауэра...
echo.

REM Удаление существующего правила (если есть)
netsh advfirewall firewall delete rule name="HACCP Server HTTP" >nul 2>&1
netsh advfirewall firewall delete rule name="HACCP Server WebSocket" >nul 2>&1

REM Создание нового правила для порта 3000
netsh advfirewall firewall add rule ^
    name="HACCP Server HTTP" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=3000 ^
    profile=any ^
    description="Разрешить входящие подключения к HACCP Control Server на порт 3000"

if %ERRORLEVEL% EQU 0 (
    echo [OK] Правило брандмауэра создано успешно!
    echo.
    echo Теперь сервер доступен в локальной сети на порту 3000
) else (
    echo [ОШИБКА] Не удалось создать правило брандмауэра
    echo Попробуйте настроить вручную через Панель управления
)

echo.
echo ========================================
echo   Готово!
echo ========================================
pause
