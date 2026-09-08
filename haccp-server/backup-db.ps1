# Скрипт резервного копирования базы данных HACCP
# Запускать через Планировщик заданий Windows ежедневно

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $scriptPath "haccp.db"
$backupDir = Join-Path $scriptPath "backups"
$backup = Join-Path $backupDir "haccp_backup_$timestamp.db"

# Создание папки для резервных копий
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Write-Host "[INFO] Папка резервных копий создана: $backupDir"
}

# Проверка существования БД
if (Test-Path $source) {
    # Копирование с блокировкой на чтение
    try {
        Copy-Item $source $backup -Force
        Write-Host "[OK] Резервная копия создана: $backup"
        
        # Сжатие копии для экономии места
        $compressedBackup = "$backup.zip"
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal
        [System.IO.Compression.ZipFile]::CreateFromDirectory($backupDir, $compressedBackup, $compressionLevel, $false)
        
        # Удаление несжатой копии
        Remove-Item $backup -Force
        
        Write-Host "[OK] Архив создан: $compressedBackup"
    }
    catch {
        Write-Host "[ОШИБКА] Не удалось создать резервную копию: $_"
        exit 1
    }
} else {
    Write-Host "[ОШИБКА] Файл БД не найден: $source"
    exit 1
}

# Удаление старых резервных копий (храним только последние 7)
try {
    $oldBackups = Get-ChildItem $backupDir -Filter "haccp_backup_*.db*" | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -Skip 7
    
    foreach ($oldBackup in $oldBackups) {
        Remove-Item $oldBackup.FullName -Force
        Write-Host "[INFO] Удалена старая копия: $($oldBackup.Name)"
    }
    
    if ($oldBackups.Count -eq 0) {
        Write-Host "[INFO] Старых копий для удаления нет"
    }
}
catch {
    Write-Host "[ПРЕДУПРЕЖДЕНИЕ] Ошибка при удалении старых копий: $_"
}

# Вывод информации о размере
$backupSize = (Get-ChildItem $backupDir -Filter "haccp_backup_*.db*" | 
    Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "[INFO] Общий размер резервных копий: $([math]::Round($backupSize, 2)) MB"

Write-Host ""
Write-Host "=========================================="
Write-Host "Резервное копирование завершено успешно!"
Write-Host "=========================================="

exit 0
