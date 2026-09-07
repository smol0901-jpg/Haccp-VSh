/**
 * Export Routes
 * Document export to PDF, Excel, Word, JSON
 */

const express = require('express');
const db = require('../database/init-database');
const { authenticateToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Prepare statements
const getDocumentById = db.prepare(`
    SELECT d.*, t.name as template_name, t.type as template_type, t.configuration as template_configuration
    FROM documents d
    LEFT JOIN templates t ON d.template_id = t.id
    WHERE d.id = ?
`);

const logExport = db.prepare(`
    INSERT INTO document_history (document_id, user_id, action, changes)
    VALUES (?, ?, 'export', ?)
`);

/**
 * GET /api/export/:id/json
 * Export document as JSON
 */
router.get('/:id/json', authenticateToken, (req, res) => {
    try {
        const document = getDocumentById.get(req.params.id);
        
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        const exportData = {
            id: document.id,
            title: document.title,
            template: document.template_name,
            type: document.template_type,
            status: document.status,
            createdAt: document.created_at,
            createdBy: document.created_by_username,
            data: document.data ? JSON.parse(document.data) : null,
            configuration: document.template_configuration ? JSON.parse(document.template_configuration) : null
        };

        // Log export
        logExport.run(document.id, req.user.id, JSON.stringify({ format: 'json' }));

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${document.title.replace(/[^a-zа-яё0-9]/gi, '_')}_export.json"`);
        res.send(JSON.stringify(exportData, null, 2));
    } catch (err) {
        console.error('JSON export error:', err);
        res.status(500).json({ error: 'Ошибка экспорта в JSON' });
    }
});

/**
 * GET /api/export/:id/excel
 * Export document to Excel (.xlsx)
 */
router.get('/:id/excel', authenticateToken, async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const document = getDocumentById.get(req.params.id);
        
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        const config = document.template_configuration ? JSON.parse(document.template_configuration) : {};
        const data = document.data ? JSON.parse(document.data) : {};

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('HACCP Document');

        // Set page setup
        worksheet.properties.pageSetup = {
            orientation: config.orientation === 'landscape' ? 'landscape' : 'portrait',
            paperSize: 9, // A4
            margins: {
                left: 25 / 25.4, // mm to inches
                right: 15 / 25.4,
                top: 20 / 25.4,
                bottom: 20 / 25.4
            }
        };

        // Add header info
        let row = 1;
        worksheet.getCell(`A${row}`).value = config.systemTag || '';
        worksheet.getCell(`A${row}`).font = { bold: true, size: 9 };
        row++;

        worksheet.getCell(`A${row}`).value = config.title || document.title;
        worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
        row++;
        row++;

        // Add meta fields
        if (config.metaFields && config.metaFields.length > 0) {
            config.metaFields.forEach(field => {
                worksheet.getCell(`A${row}`).value = `${field.label}:`;
                worksheet.getCell(`A${row}`).font = { bold: true };
                worksheet.getCell(`B${row}`).value = field.val || '';
                row++;
            });
            row++;
        }

        // Add table headers
        if (config.columns && config.columns.length > 0) {
            const headerRow = worksheet.getRow(row);
            config.columns.forEach((col, idx) => {
                const cell = headerRow.getCell(idx + 1);
                cell.value = col.name;
                cell.font = { bold: true };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF2F2F2' }
                };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                worksheet.getColumn(idx + 1).width = parseInt(col.width) || 15;
            });
            row++;

            // Add data rows
            if (config.mode === 'sheet' && config.rowLabels) {
                config.rowLabels.forEach((label, i) => {
                    const dataRow = worksheet.getRow(row);
                    dataRow.getCell(1).value = i + 1;
                    dataRow.getCell(2).value = label;
                    
                    // Fill from auto-filled data if available
                    if (data.autoFilledData) {
                        for (let c = 2; c < config.columns.length; c++) {
                            const cellKey = `cell_sheet_${i}_${c}`;
                            if (data.autoFilledData[cellKey]) {
                                dataRow.getCell(c + 1).value = data.autoFilledData[cellKey];
                            }
                        }
                    }

                    // Apply borders
                    for (let c = 1; c <= config.columns.length; c++) {
                        dataRow.getCell(c).border = {
                            top: { style: 'thin' },
                            left: { style: 'thin' },
                            bottom: { style: 'thin' },
                            right: { style: 'thin' }
                        };
                    }
                    row++;
                });
            }
        }

        // Add limits text
        if (config.limitsText) {
            row++;
            worksheet.getCell(`A${row}`).value = 'Справочно-нормативные сведения:';
            worksheet.getCell(`A${row}`).font = { bold: true };
            row++;
            worksheet.getCell(`A${row}`).value = config.limitsText;
            worksheet.getCell(`A${row}`).alignment = { wrapText: true };
        }

        // Log export
        logExport.run(document.id, req.user.id, JSON.stringify({ format: 'excel' }));

        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${document.title.replace(/[^a-zа-яё0-9]/gi, '_')}.xlsx"`);
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Excel export error:', err);
        res.status(500).json({ error: 'Ошибка экспорта в Excel' });
    }
});

/**
 * GET /api/export/:id/word
 * Export document to Word (.doc)
 */
router.get('/:id/word', authenticateToken, (req, res) => {
    try {
        const document = getDocumentById.get(req.params.id);
        
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        const config = document.template_configuration ? JSON.parse(document.template_configuration) : {};
        const isLandscape = config.orientation === 'landscape';

        // Build HTML content for Word
        let htmlContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <title>${document.title}</title>
    <style>
        @page { size: ${isLandscape ? '297mm 210mm' : '210mm 297mm'}; margin: 20mm; }
        body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.3; }
        .header { text-align: center; margin-bottom: 20px; }
        .system-tag { font-size: 9pt; font-weight: bold; }
        .title { font-size: 14pt; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #000; padding: 6px; text-align: center; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .meta-table { margin-bottom: 15px; }
        .meta-row { display: flex; margin-bottom: 5px; }
        .meta-label { font-weight: bold; min-width: 150px; }
        .limits-box { border: 1px dashed #000; padding: 10px; margin-top: 15px; background: #fafafa; }
    </style>
</head>
<body>
    <div class="header">
        <div class="system-tag">${config.systemTag || ''}</div>
        <div class="title">${config.title || document.title}</div>
    </div>
`;

        // Meta fields
        if (config.metaFields && config.metaFields.length > 0) {
            htmlContent += '<div class="meta-table">';
            config.metaFields.forEach(field => {
                htmlContent += `<div class="meta-row"><span class="meta-label">${field.label}:</span> <span>${field.val || ''}</span></div>`;
            });
            htmlContent += '</div>';
        }

        // Table
        if (config.columns && config.columns.length > 0) {
            htmlContent += '<table><thead><tr>';
            config.columns.forEach(col => {
                htmlContent += `<th>${col.name}</th>`;
            });
            htmlContent += '</tr></thead><tbody>';

            if (config.mode === 'sheet' && config.rowLabels) {
                config.rowLabels.forEach((label, i) => {
                    htmlContent += '<tr>';
                    htmlContent += `<td>${i + 1}</td>`;
                    htmlContent += `<td style="text-align: left;">${label}</td>`;
                    for (let c = 2; c < config.columns.length; c++) {
                        htmlContent += '<td></td>';
                    }
                    htmlContent += '</tr>';
                });
            }

            htmlContent += '</tbody></table>';
        }

        // Limits text
        if (config.limitsText) {
            htmlContent += `<div class="limits-box"><strong>Справочно:</strong><br>${config.limitsText.replace(/\n/g, '<br>')}</div>`;
        }

        htmlContent += '</body></html>';

        // Log export
        logExport.run(document.id, req.user.id, JSON.stringify({ format: 'word' }));

        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', `attachment; filename="${document.title.replace(/[^a-zа-яё0-9]/gi, '_')}.doc"`);
        res.send('\ufeff' + htmlContent);
    } catch (err) {
        console.error('Word export error:', err);
        res.status(500).json({ error: 'Ошибка экспорта в Word' });
    }
});

/**
 * GET /api/export/templates/json
 * Export all templates as JSON backup
 */
router.get('/templates/json', authenticateToken, (req, res) => {
    try {
        const templates = db.prepare(`
            SELECT * FROM templates WHERE is_active = 1 ORDER BY name
        `).all();

        const exportData = {
            version: '6.0.0',
            exportedAt: new Date().toISOString(),
            exportedBy: req.user.username,
            templates: templates.map(t => ({
                ...t,
                configuration: JSON.parse(t.configuration)
            }))
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="haccp_templates_backup.json"');
        res.send(JSON.stringify(exportData, null, 2));
    } catch (err) {
        console.error('Templates export error:', err);
        res.status(500).json({ error: 'Ошибка экспорта шаблонов' });
    }
});

module.exports = router;
