import { Router } from 'express';
import ExcelJS from 'exceljs';

export default function exportRoutes(db) {
  const router = Router();

  const authenticateToken = (req, res, next) => {
    req.user = { id: 'system', username: 'local', role: 'user' };
    next();
  };

  // Экспорт документа в Excel
  router.get('/document/:id/excel', authenticateToken, async (req, res) => {
    try {
      const document = db.getDocumentById(req.params.id);
      
      if (!document) {
        return res.status(404).json({ error: 'Документ не найден' });
      }

      const data = JSON.parse(document.data_json);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(document.title || 'Документ HACCP');

      // Настройка столбцов
      const columns = data.columns || [];
      worksheet.columns = columns.map(col => ({
        header: col.name,
        key: col.name.replace(/\s+/g, '_').toLowerCase(),
        width: parseInt(col.width) || 15
      }));

      // Добавление метаданных
      let rowIndex = 1;
      if (data.metaFields) {
        data.metaFields.forEach(field => {
          worksheet.getCell(`A${rowIndex}`).value = field.label;
          worksheet.getCell(`B${rowIndex}`).value = field.val;
          rowIndex++;
        });
        rowIndex++;
      }

      // Добавление заголовков таблицы
      const headerRow = worksheet.getRow(rowIndex);
      columns.forEach((col, idx) => {
        headerRow.getCell(idx + 1).value = col.name;
        headerRow.getCell(idx + 1).font = { bold: true };
        headerRow.getCell(idx + 1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
        headerRow.getCell(idx + 1).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      rowIndex++;

      // Добавление строк данных
      if (data.rowLabels) {
        data.rowLabels.forEach((label, labelIdx) => {
          const row = worksheet.getRow(rowIndex);
          row.getCell(1).value = labelIdx + 1;
          row.getCell(2).value = label;
          
          // Заполнение данными если есть
          if (data.autoFilledData) {
            for (let c = 2; c < columns.length; c++) {
              const cellId = `cell_sheet_${labelIdx}_${c}`;
              if (data.autoFilledData[cellId]) {
                row.getCell(c + 1).value = data.autoFilledData[cellId];
              }
            }
          }

          // Границы ячеек
          row.eachCell(cell => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });

          rowIndex++;
        });
      }

      // Добавление подписей
      if (data.signatures) {
        rowIndex += 2;
        data.signatures.forEach(sig => {
          worksheet.getCell(`A${rowIndex}`).value = sig.role;
          worksheet.getCell(`C${rowIndex}`).value = '_________________';
          worksheet.getCell(`D${rowIndex}`).value = sig.name;
          rowIndex++;
        });
      }

      // Установка имени файла
      const filename = `${(document.title || 'document').replace(/[^a-z0-9]/gi, '_')}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Ошибка экспорта в Excel:', error);
      res.status(500).json({ error: 'Ошибка при экспорте в Excel' });
    }
  });

  // Экспорт всех шаблонов в JSON
  router.get('/templates/json', authenticateToken, (req, res) => {
    try {
      const templates = db.getAllTemplates();
      
      const exportData = {
        version: '6.0',
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.username,
        templates: templates.map(t => ({
          ...t,
          config_json: JSON.parse(t.config_json)
        }))
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="haccp_templates_export.json"');
      res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
      console.error('Ошибка экспорта шаблонов:', error);
      res.status(500).json({ error: 'Ошибка при экспорте шаблонов' });
    }
  });

  // Экспорт всех документов в JSON
  router.get('/documents/json', authenticateToken, (req, res) => {
    try {
      const documents = db.getAllDocuments();
      
      const exportData = {
        version: '6.0',
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.username,
        documents: documents.map(d => ({
          ...d,
          data_json: JSON.parse(d.data_json)
        }))
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="haccp_documents_export.json"');
      res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
      console.error('Ошибка экспорта документов:', error);
      res.status(500).json({ error: 'Ошибка при экспорте документов' });
    }
  });

  // Экспорт аудита в CSV
  router.get('/audit/csv', authenticateToken, (req, res) => {
    try {
      const logs = db.getAuditLogs(1000);
      
      let csv = 'ID,User,Action,Entity Type,Entity ID,IP Address,Timestamp\n';
      logs.forEach(log => {
        csv += `"${log.id}","${log.username || 'N/A'}","${log.action}","${log.entity_type}","${log.entity_id}","${log.ip_address}","${log.created_at}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="haccp_audit_log.csv"');
      res.send(csv);
    } catch (error) {
      console.error('Ошибка экспорта аудита:', error);
      res.status(500).json({ error: 'Ошибка при экспорте аудита' });
    }
  });

  // Массовый экспорт данных
  router.get('/backup/full', authenticateToken, (req, res) => {
    try {
      const templates = db.getAllTemplates();
      const documents = db.getAllDocuments();
      const settings = db.getAllSettings();
      const categories = db.getAllCategories();

      const backupData = {
        version: '6.0',
        backupDate: new Date().toISOString(),
        system: {
          name: 'HACCP Control Enterprise',
          database_version: '1.0'
        },
        templates: templates.map(t => ({ ...t, config_json: JSON.parse(t.config_json) })),
        documents: documents.map(d => ({ ...d, data_json: JSON.parse(d.data_json) })),
        settings: settings,
        categories: categories
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="haccp_full_backup.json"');
      res.send(JSON.stringify(backupData, null, 2));
    } catch (error) {
      console.error('Ошибка создания резервной копии:', error);
      res.status(500).json({ error: 'Ошибка при создании резервной копии' });
    }
  });

  return router;
}
