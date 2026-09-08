/**
 * HACCP Control Server v6.0 - Frontend Application
 * Enterprise Edition for Local Network
 */

const App = {
    // Application state
    state: {
        mode: "sheet",
        orientation: "portrait",
        fontSizeTable: "10",
        rowHeight: "13",
        marginLeft: "25",
        org: "ООО \"ПРОДОВОЛЬСТВЕННЫЙ АЛЬЯНС\"",
        systemTag: "СИСТЕМА КАЧЕСТВА И БЕЗОПАСНОСТИ НА ОСНОВЕ ПРИНЦИПОВ ХАССП",
        title: "ЖУРНАЛ МОНИТОРИНГА КРИТИЧЕСКОЙ КОНТРОЛЬНОЙ ТОЧКИ (ККТ): ФРИТЮРНЫЕ МАСЛА",
        journalPages: 5,
        journalRowsPerPage: 20,
        metaFields: [
            { label: "Предприятие/Филиал", val: "Цех №2 Овощной" },
            { label: "Номер ККТ / Емкости", val: "Фритюрница Куб №4" },
            { label: "Период (Месяц/Год)", val: "Май 2026" }
        ],
        columns: [
            { name: "№ п/п", width: "8" },
            { name: "Контролируемый параметр ККТ / Технологическая операция", width: "50" },
            { name: "Фактический показатель контроля", width: "24" },
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
        limitsText: "Критические пределы (Требования ТР ТС 021/2011):\n1. Категорически запрещается использование масел при наличии горького вкуса или запаха гари.\n2. Предельная степень распада масла — не более 1% измененных триглицеридов.",
        signatures: [
            { role: "Дежурный оператор / Повар", name: "Иванов И.И." },
            { role: "Санитарный врач / Технолог", name: "Петрова А.К." }
        ],
        autoFilledData: {}
    },

    // User session
    user: null,
    token: null,
    templates: [],

    // API base URL
    API_URL: window.location.origin + '/api',

    /**
     * Initialize application
     */
    init: function() {
        this.checkAuth();
        this.setupEventListeners();
        this.registerServiceWorker();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners: function() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login();
            });
        }
    },

    /**
     * Check authentication status
     */
    checkAuth: function() {
        const savedToken = localStorage.getItem('haccp_token');
        const savedUser = localStorage.getItem('haccp_user');

        if (savedToken && savedUser) {
            this.token = savedToken;
            this.user = JSON.parse(savedUser);
            this.showApp();
        } else {
            this.showLogin();
        }
    },

    /**
     * Show login screen
     */
    showLogin: function() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    },

    /**
     * Show main application
     */
    showApp: function() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        
        // Update user info
        if (this.user) {
            document.getElementById('userName').textContent = this.user.fullName || this.user.username;
            document.getElementById('userRole').textContent = this.getRoleName(this.user.role);
            document.getElementById('userAvatar').textContent = (this.user.fullName || this.user.username)[0].toUpperCase();
        }

        // Initialize app
        this.syncInputsFromState();
        this.renderControlUI();
        this.renderDocument();
        this.loadTemplates();
    },

    /**
     * Get role name in Russian
     */
    getRoleName: function(role) {
        const roles = {
            'admin': 'Администратор',
            'technologist': 'Технолог',
            'operator': 'Оператор',
            'viewer': 'Наблюдатель'
        };
        return roles[role] || role;
    },

    /**
     * Login to server
     */
    login: async function() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        try {
            const response = await fetch(`${this.API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка входа');
            }

            // Save auth data
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('haccp_token', data.token);
            localStorage.setItem('haccp_user', JSON.stringify(data.user));

            this.showToast('Успешный вход!', 'success');
            this.showApp();
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
        }
    },

    /**
     * Logout
     */
    logout: function() {
        localStorage.removeItem('haccp_token');
        localStorage.removeItem('haccp_user');
        this.token = null;
        this.user = null;
        this.showLogin();
        this.showToast('Вы вышли из системы', 'warning');
    },

    /**
     * Toggle sidebar collapse
     */
    toggleSidebar: function() {
        document.getElementById('sidebar').classList.toggle('collapsed');
    },

    /**
     * Toggle theme (dark/light)
     */
    toggleTheme: function() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('haccp_theme', newTheme);
    },

    /**
     * Switch between sheet and journal modes
     */
    switchMode: function(targetMode) {
        this.state.mode = targetMode;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tab${targetMode.charAt(0).toUpperCase() + targetMode.slice(1)}`)?.classList.add('active');

        // Show/hide relevant sections
        document.getElementById('uiLimitsBlock').style.display = targetMode === 'sheet' ? 'block' : 'none';
        document.getElementById('uiRowsConfigSection').style.display = targetMode === 'sheet' ? 'block' : 'none';
        document.getElementById('uiJournalPagesBlock').style.display = targetMode === 'journal' ? 'block' : 'none';

        // Adjust row height for journal
        if (targetMode === 'journal') {
            this.state.rowHeight = "9";
        } else {
            this.state.rowHeight = "13";
        }
        document.getElementById('uiRowHeight').value = this.state.rowHeight;
        document.getElementById('rowHeightVal').innerText = this.state.rowHeight + 'мм';

        this.renderDocument();
    },

    /**
     * Sync input fields from state
     */
    syncInputsFromState: function() {
        document.getElementById('uiOrgName').value = this.state.org;
        document.getElementById('uiSystemTag').value = this.state.systemTag;
        document.getElementById('uiJournalPages').value = this.state.journalPages;
        document.getElementById('uiJournalRowsPerPage').value = this.state.journalRowsPerPage;
        document.getElementById('uiLimitsText').value = this.state.limitsText;
        document.getElementById('uiOrientation').value = this.state.orientation;
        document.getElementById('uiFontSizeTable').value = this.state.fontSizeTable;
        document.getElementById('fontSizeVal').innerText = this.state.fontSizeTable + 'pt';
        document.getElementById('uiRowHeight').value = this.state.rowHeight;
        document.getElementById('rowHeightVal').innerText = this.state.rowHeight + 'мм';
        document.getElementById('uiMarginLeft').value = this.state.marginLeft;
        document.getElementById('marginLeftVal').innerText = this.state.marginLeft + 'мм';
    },

    /**
     * Render control UI elements
     */
    renderControlUI: function() {
        // Meta fields
        const metaContainer = document.getElementById('uiMetaContainer');
        metaContainer.innerHTML = '';
        this.state.metaFields.forEach((field, idx) => {
            const div = document.createElement('div');
            div.className = 'builder-row';
            div.innerHTML = `
                <div class="move-btns">
                    <button class="btn-move" onclick="App.moveItem('meta', ${idx}, -1)">▲</button>
                    <button class="btn-move" onclick="App.moveItem('meta', ${idx}, 1)">▼</button>
                </div>
                <input type="text" value="${field.label}" oninput="App.state.metaFields[${idx}].label=this.value; App.renderDocument();">
                <input type="text" value="${field.val}" oninput="App.state.metaFields[${idx}].val=this.value; App.renderDocument();" placeholder="Значение">
                <button class="btn-delete" onclick="App.state.metaFields.splice(${idx},1); App.renderControlUI(); App.renderDocument();">×</button>
            `;
            metaContainer.appendChild(div);
        });

        // Columns
        const colsContainer = document.getElementById('uiColumnsContainer');
        colsContainer.innerHTML = '';
        this.state.columns.forEach((col, idx) => {
            const div = document.createElement('div');
            div.className = 'builder-row';
            div.innerHTML = `
                <div class="move-btns">
                    <button class="btn-move" onclick="App.moveItem('column', ${idx}, -1)">▲</button>
                    <button class="btn-move" onclick="App.moveItem('column', ${idx}, 1)">▼</button>
                </div>
                <input type="text" value="${col.name}" oninput="App.state.columns[${idx}].name=this.value; App.renderDocument();">
                <input type="text" style="width: 50px; text-align: center;" value="${col.width}" oninput="App.state.columns[${idx}].width=this.value; App.renderDocument();">
                <button class="btn-delete" onclick="App.state.columns.splice(${idx},1); App.renderControlUI(); App.renderDocument();">×</button>
            `;
            colsContainer.appendChild(div);
        });

        // Row labels
        const rowsContainer = document.getElementById('uiRowsContainer');
        rowsContainer.innerHTML = '';
        this.state.rowLabels.forEach((label, idx) => {
            const div = document.createElement('div');
            div.className = 'builder-row';
            div.innerHTML = `
                <div class="move-btns">
                    <button class="btn-move" onclick="App.moveItem('row', ${idx}, -1)">▲</button>
                    <button class="btn-move" onclick="App.moveItem('row', ${idx}, 1)">▼</button>
                </div>
                <span style="font-size:0.8rem; color:var(--ui-accent); font-weight:bold; min-width:20px; text-align:center;">${idx+1}</span>
                <input type="text" value="${label}" oninput="App.state.rowLabels[${idx}]=this.value; App.renderDocument();">
                <button class="btn-delete" onclick="App.state.rowLabels.splice(${idx},1); App.renderControlUI(); App.renderDocument();">×</button>
            `;
            rowsContainer.appendChild(div);
        });

        // Signatures
        const sigContainer = document.getElementById('uiSignaturesContainer');
        sigContainer.innerHTML = '';
        this.state.signatures.forEach((sig, idx) => {
            const div = document.createElement('div');
            div.className = 'builder-row';
            div.innerHTML = `
                <div class="move-btns">
                    <button class="btn-move" onclick="App.moveItem('sig', ${idx}, -1)">▲</button>
                    <button class="btn-move" onclick="App.moveItem('sig', ${idx}, 1)">▼</button>
                </div>
                <input type="text" value="${sig.role}" oninput="App.state.signatures[${idx}].role=this.value; App.renderDocument();">
                <input type="text" value="${sig.name}" oninput="App.state.signatures[${idx}].name=this.value; App.renderDocument();" placeholder="ФИО">
                <button class="btn-delete" onclick="App.state.signatures.splice(${idx},1); App.renderControlUI(); App.renderDocument();">×</button>
            `;
            sigContainer.appendChild(div);
        });
    },

    /**
     * Move item in array
     */
    moveItem: function(type, index, direction) {
        let arr = null;
        if (type === 'meta') arr = this.state.metaFields;
        if (type === 'column') arr = this.state.columns;
        if (type === 'row') arr = this.state.rowLabels;
        if (type === 'sig') arr = this.state.signatures;

        if (!arr) return;
        let targetIdx = index + direction;
        if (targetIdx < 0 || targetIdx >= arr.length) return;

        let temp = arr[index];
        arr[index] = arr[targetIdx];
        arr[targetIdx] = temp;

        this.renderControlUI();
        this.renderDocument();
    },

    /**
     * Add items
     */
    addMetaItem: function() { 
        this.state.metaFields.push({ label: "Новый реквизит", val: "" }); 
        this.renderControlUI(); 
        this.renderDocument(); 
    },
    addColumnItem: function() { 
        this.state.columns.push({ name: "Новая графа", width: "15" }); 
        this.renderControlUI(); 
        this.renderDocument(); 
    },
    addRowItem: function() { 
        this.state.rowLabels.push("Новый контролируемый параметр"); 
        this.renderControlUI(); 
        this.renderDocument(); 
    },
    addSignatureItem: function() { 
        this.state.signatures.push({ role: "Должность", name: "" }); 
        this.renderControlUI(); 
        this.renderDocument(); 
    },

    /**
     * Render document preview
     */
    renderDocument: function() {
        const viewport = document.getElementById('canvasViewport');
        viewport.innerHTML = '';

        if (this.state.mode === 'sheet') {
            const page = this.createBaseA4Page();

            // QR Code container
            page.innerHTML += `
                <div class="haccp-qr-container" style="position: absolute; top: 8mm; right: 15mm; display: flex; flex-direction: column; align-items: center; gap: 2px;">
                    <div class="haccp-qr-code" id="haccp-qrcode-sheet" style="width: 55px; height: 55px;"></div>
                    <div class="haccp-qr-label" style="font-size: 6pt; color: #475569; font-family: monospace;">HACCP SECURE</div>
                </div>
            `;
            
            page.innerHTML += `<div class="haccp-header-tag" style="font-size: 8.5pt; font-weight: bold; text-transform: uppercase; text-align: center; letter-spacing: 0.5px; color: #333; margin-bottom: 4px;" contenteditable="true" onblur="App.state.systemTag=this.innerText">${this.state.systemTag}</div>`;
            page.innerHTML += `<h2 class="haccp-main-title" style="font-size: 13pt; font-weight: bold; text-transform: uppercase; text-align: center; margin: 0 0 15px 0; border-bottom: 2px solid #000; padding-bottom: 5px;" contenteditable="true" onblur="App.state.title=this.innerText">${this.state.title}</h2>`;
            
            page.appendChild(this.compileMetaGridHTML());
            page.appendChild(this.compileTableHTML(1, this.state.rowLabels.length));
            page.appendChild(this.compileLimitsHTML());
            page.appendChild(this.compileSignaturesHTML());
            
            viewport.appendChild(page);

            // Generate QR code
            setTimeout(() => this.injectQRCode('haccp-qrcode-sheet', 'sheet'), 100);
        } else {
            // Cover page
            const coverPage = this.createBaseA4Page();
            coverPage.innerHTML = `
                <div class="cover-framework" style="border: 3px double #000000; height: 100%; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 25px; box-sizing: border-box; text-align: center;">
                    <div class="cover-organization" style="font-size: 14pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; width: 90%; padding-bottom: 5px;" contenteditable="true" onblur="App.state.org=this.innerText">${this.state.org}</div>
                    <div class="cover-title-block" style="width: 100%; ${this.state.orientation === 'portrait' ? 'margin-top: 50mm;' : 'margin-top: 20mm;'}">
                        <h2 style="font-size: 22pt; font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase; line-height: 1.2;" contenteditable="true" onblur="App.state.title=this.innerText">${this.state.title}</h2>
                        <p style="font-size: 12pt; font-style: italic; color: #333; margin: 0;">Программа производственного контроля безопасности по принципам ХАССП</p>
                    </div>
                    <div class="cover-meta-block" style="width: 85%; text-align: left; font-size: 12pt; ${this.state.orientation === 'portrait' ? 'margin-bottom: 30mm;' : 'margin-bottom: 10mm;'}">
                        <div class="cover-meta-line" style="display: flex; margin-bottom: 12px; border-bottom: 1px solid #000; padding-bottom: 2px;"><span style="font-weight: bold; padding-right: 8px; white-space: nowrap;">Номер журнала по реестру:</span> <div style="display:inline-block; min-width:50px;" contenteditable="true">№ ____</div></div>
                        <div class="cover-meta-line" style="display: flex; margin-bottom: 12px; border-bottom: 1px solid #000; padding-bottom: 2px;"><span style="font-weight: bold; padding-right: 8px; white-space: nowrap;">Дата начала ведения:</span> <div style="display:inline-block; min-width:150px;" contenteditable="true">"____" ____________ 20___ г.</div></div>
                        <div class="cover-meta-line" style="display: flex; margin-bottom: 12px; border-bottom: 1px solid #000; padding-bottom: 2px;"><span style="font-weight: bold; padding-right: 8px; white-space: nowrap;">Дата окончания ведения:</span> <div style="display:inline-block; min-width:150px;" contenteditable="true">"____" ____________ 20___ г.</div></div>
                    </div>
                </div>
            `;
            viewport.appendChild(coverPage);

            // Journal pages
            for (let p = 1; p <= this.state.journalPages; p++) {
                const innerPage = this.createBaseA4Page();
                innerPage.innerHTML = `
                    <div class="page-header-identity" style="position: absolute; top: 10mm; font-size: 8pt; color: #555; font-style: italic; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; text-align: left; ${this.state.orientation === 'landscape' ? 'left: 25mm; width: 252mm;' : 'left: 25mm; width: 170mm;'}">${this.state.title}</div>
                    <div class="haccp-qr-container" style="position: absolute; top: 8mm; right: 15mm; display: flex; flex-direction: column; align-items: center; gap: 2px;">
                        <div class="haccp-qr-code" id="haccp-qrcode-journal-${p}" style="width: 55px; height: 55px;"></div>
                        <div class="haccp-qr-label" style="font-size: 6pt; color: #475569; font-family: monospace;">PAGE ${p}</div>
                    </div>
                    <div style="text-align: right; font-size: 10pt; font-weight: bold; margin-bottom: 5px; margin-top: 5mm;">Лист № ${p}</div>
                `;
                
                innerPage.appendChild(this.compileTableHTML(p, this.state.journalRowsPerPage));
                innerPage.innerHTML += `
                    <div style="margin-top: 15px; font-size: 9.5pt; text-align: left; font-style: italic;">
                        Подпись контролирующего лица по закрытию страницы: <span contenteditable="true">____________________</span>
                    </div>
                    <div class="page-footer-number" style="position: absolute; bottom: 10mm; font-size: 10pt; font-weight: bold; ${this.state.orientation === 'landscape' ? 'right: 20mm;' : 'right: 15mm;'}">стр. ${p}</div>
                `;
                
                viewport.appendChild(innerPage);
                setTimeout(() => this.injectQRCode(`haccp-qrcode-journal-${p}`, `journal-${p}`), 100);
            }

            // Final verification page
            const finalPage = this.createBaseA4Page();
            finalPage.innerHTML = `
                <div style="height: 100%; display: flex; flex-direction: column; justify-content: center;">
                    <div class="verification-sheet-container" style="border: 1px solid #000000; padding: 30px; width: 140mm; margin: 0 auto; text-align: center; font-size: 12pt; line-height: 1.6; ${this.state.orientation === 'portrait' ? 'margin-top: 40mm;' : 'margin-top: 15mm;'}">
                        В настоящем журнале производственного контроля пронумеровано,<br>
                        прошнуровано и скреплено печатью предприятия<br>
                        <span style="font-size: 16pt; font-weight: bold; text-decoration: underline;">
                            &nbsp;&nbsp;&nbsp;&nbsp; ${this.state.journalPages} &nbsp;&nbsp;&nbsp;&nbsp;
                        </span> листов.
                        <br><br>
                        Руководитель предприятия: <span contenteditable="true">___________ / _______________</span>
                        <div class="stamp-box" style="border: 1px dashed #777; width: 110px; height: 110px; margin: 25px auto; display: flex; align-items: center; justify-content: center; color: #666; font-size: 9pt; font-weight: bold;">М.П.<br>Место оттиска<br>печати</div>
                        Дата сдачи в архив: "____" ____________ 20___ г.
                    </div>
                </div>
            `;
            viewport.appendChild(finalPage);
        }
    },

    /**
     * Create base A4 page element
     */
    createBaseA4Page: function() {
        const page = document.createElement('div');
        page.className = `a4-document-page ${this.state.orientation}`;

        if (this.state.orientation === 'landscape') {
            page.style.width = '297mm';
            page.style.minHeight = '210mm';
            page.style.padding = `15mm 20mm 15mm ${this.state.marginLeft}mm`;
        } else {
            page.style.width = '210mm';
            page.style.minHeight = '297mm';
            page.style.padding = `20mm 15mm 20mm ${this.state.marginLeft}mm`;
        }
        return page;
    },

    /**
     * Compile meta grid HTML
     */
    compileMetaGridHTML: function() {
        const container = document.createElement('div');
        container.className = 'haccp-meta-table';
        container.style.cssText = 'display: table; width: 100%; margin-bottom: 15px; font-size: 10.5pt;';

        let rowElement = null;

        this.state.metaFields.forEach((field, idx) => {
            if (idx % 2 === 0) {
                rowElement = document.createElement('div');
                rowElement.className = 'haccp-meta-row';
                rowElement.style.cssText = 'display: table-row;';
                container.appendChild(rowElement);
            } else {
                const spacer = document.createElement('div');
                spacer.className = 'haccp-meta-cell spacer-cell';
                spacer.style.cssText = 'display: table-cell; width: 5%;';
                rowElement.appendChild(spacer);
            }

            const lblCell = document.createElement('div');
            lblCell.className = 'haccp-meta-cell label-cell';
            lblCell.style.cssText = 'display: table-cell; font-weight: bold; padding-right: 6px; white-space: nowrap; width: 1%;';
            lblCell.innerText = field.label + ':';

            const valCell = document.createElement('div');
            valCell.className = 'haccp-meta-cell value-cell';
            valCell.style.cssText = 'display: table-cell; border-bottom: 1px solid #000; font-style: italic; color: #333; padding-left: 4px;';
            valCell.tabIndex = 0;
            valCell.contentEditable = "true";
            valCell.innerText = field.val || "_______________________";
            valCell.onblur = (e) => { this.state.metaFields[idx].val = e.target.innerText; };

            rowElement.appendChild(lblCell);
            rowElement.appendChild(valCell);
        });
        return container;
    },

    /**
     * Compile table HTML
     */
    compileTableHTML: function(pageIndex, limitRows) {
        const table = document.createElement('table');
        table.className = 'haccp-main-table';
        table.style.cssText = `width: 100%; border-collapse: collapse; margin-bottom: 15px; table-layout: fixed; font-size: ${this.state.fontSizeTable}pt;`;

        let headerHTML = '<thead><tr>';
        this.state.columns.forEach(col => {
            headerHTML += `<th style="width: ${col.width}%; font-size: ${Math.max(8, this.state.fontSizeTable - 1)}pt; background: #f2f2f2; font-weight: bold; text-transform: uppercase; border: 1px solid #000000; padding: 4px;">${col.name}</th>`;
        });
        headerHTML += '</tr></thead>';
        table.innerHTML = headerHTML;

        const tbody = document.createElement('tbody');

        for (let i = 0; i < limitRows; i++) {
            const tr = document.createElement('tr');
            tr.style.height = `${this.state.rowHeight}mm`;

            this.state.columns.forEach((col, cIndex) => {
                const td = document.createElement('td');
                td.contentEditable = "true";
                td.style.cssText = `border: 1px solid #000000; padding: 4px 4px; text-align: center; vertical-align: middle; word-wrap: break-word; overflow: hidden; font-size: ${this.state.fontSizeTable}pt;`;

                let cellKey = this.state.mode === 'sheet' ? `cell_sheet_${i}_${cIndex}` : `cell_journal_${pageIndex}_${i}_${cIndex}`;

                if (cIndex === 0) {
                    td.contentEditable = "false";
                    td.innerText = this.state.mode === 'sheet' ? (i + 1) : ((pageIndex - 1) * limitRows + (i + 1));
                } else if (cIndex === 1 && this.state.mode === 'sheet') {
                    td.innerText = this.state.rowLabels[i] || "";
                    td.style.textAlign = 'left';
                    td.style.paddingLeft = '6px';
                    td.onblur = (e) => {
                        this.state.rowLabels[i] = e.target.innerText;
                        this.renderControlUI();
                    };
                } else {
                    td.innerText = this.state.autoFilledData[cellKey] || "";
                    td.onblur = (e) => {
                        this.state.autoFilledData[cellKey] = e.target.innerText;
                    };
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        return table;
    },

    /**
     * Compile limits HTML
     */
    compileLimitsHTML: function() {
        const div = document.createElement('div');
        div.className = 'haccp-limits-box';
        div.style.cssText = 'border: 1px dashed #000000; background: #fafafa; padding: 10px; margin-top: 15px; font-size: 9pt; text-align: left;';
        div.innerHTML = `
            <h4 style="margin: 0 0 4px 0; font-size: 9.5pt; font-weight: bold; text-transform: uppercase;">Справочно-нормативные сведения ККТ:</h4>
            <div class="haccp-limits-text" style="font-style: italic; white-space: pre-line; line-height: 1.2;" contenteditable="true" onblur="App.state.limitsText=this.innerText">${this.state.limitsText}</div>
        `;
        return div;
    },

    /**
     * Compile signatures HTML
     */
    compileSignaturesHTML: function() {
        const container = document.createElement('div');
        container.className = 'haccp-signatures-block';
        container.style.cssText = 'display: table; width: 100%; margin-top: 20px; font-size: 10.5pt;';

        this.state.signatures.forEach((sig, idx) => {
            const row = document.createElement('div');
            row.className = 'haccp-sig-row';
            row.style.cssText = 'display: table-row;';
            row.innerHTML = `
                <div class="haccp-sig-cell role" style="display: table-cell; font-weight: bold; width: 35%; text-align: left; padding: 6px 0; vertical-align: bottom;" contenteditable="true" onblur="App.state.signatures[${idx}].role=this.innerText">${sig.role}:</div>
                <div class="haccp-sig-cell line" style="display: table-cell; border-bottom: 1px solid #000; width: 25%; text-align: center; font-size: 8pt; color: #666; padding: 6px 0; vertical-align: bottom;">подпись</div>
                <div class="haccp-sig-cell spacer" style="display: table-cell; width: 5%;"></div>
                <div class="haccp-sig-cell name" style="display: table-cell; border-bottom: 1px solid #000; width: 35%; padding-left: 6px; text-align: left; padding: 6px 0; vertical-align: bottom;">ФИО: <span style="display:inline-block; min-width:120px;" contenteditable="true" onblur="App.state.signatures[${idx}].name=this.innerText">${sig.name}</span></div>
            `;
            container.appendChild(row);
        });
        return container;
    },

    /**
     * Inject QR code
     */
    injectQRCode: function(elementId, idSuffix) {
        const targetNode = document.getElementById(elementId);
        if (!targetNode || typeof QRCode === 'undefined') return;

        targetNode.innerHTML = '';

        const payloadString = `${this.state.org}|${this.state.mode}|${this.state.systemTag.substring(0,10)}`;
        let hash = 0;
        for (let i = 0; i < payloadString.length; i++) {
            hash = (hash << 5) - hash + payloadString.charCodeAt(i);
            hash |= 0;
        }

        const qrData = `HACCP COMPLIANCE SECURE\nORG: ${this.state.org}\nVALIDATION ID: CC-${Math.abs(hash)}\nDATE: ${new Date().toLocaleDateString('ru-RU')}`;

        new QRCode(targetNode, {
            text: qrData,
            width: 55,
            height: 55,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    },

    /**
     * Auto-fill data rows
     */
    autoFillDataRows: function() {
        const min = parseFloat(document.getElementById('uiFillMin').value) || 18;
        const max = parseFloat(document.getElementById('uiFillMax').value) || 24;
        this.state.autoFilledData = {};

        const getInitials = (name) => {
            if (!name) return "Отв.";
            let parts = name.split(' ');
            return parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '');
        };

        const signaturesList = this.state.signatures.map(s => getInitials(s.name));

        if (this.state.mode === 'sheet') {
            for (let i = 0; i < this.state.rowLabels.length; i++) {
                for (let c = 2; c < this.state.columns.length; c++) {
                    let cellId = `cell_sheet_${i}_${c}`;
                    if (c === this.state.columns.length - 1 && signaturesList.length > 0) {
                        this.state.autoFilledData[cellId] = signaturesList[Math.floor(Math.random() * signaturesList.length)];
                    } else {
                        let randomVal = (Math.random() * (max - min) + min).toFixed(1);
                        this.state.autoFilledData[cellId] = randomVal;
                    }
                }
            }
        } else {
            for (let p = 1; p <= this.state.journalPages; p++) {
                for (let i = 0; i < this.state.journalRowsPerPage; i++) {
                    let dateCellId = `cell_journal_${p}_${i}_1`;
                    this.state.autoFilledData[dateCellId] = `${String(i+1).padStart(2,'0')}.${String(new Date().getMonth()+1).padStart(2,'0')}`;

                    for (let c = 2; c < this.state.columns.length; c++) {
                        let cellId = `cell_journal_${p}_${i}_${c}`;
                        if (c === this.state.columns.length - 1 && signaturesList.length > 0) {
                            this.state.autoFilledData[cellId] = signaturesList[Math.floor(Math.random() * signaturesList.length)];
                        } else {
                            let randomVal = (Math.random() * (max - min) + min).toFixed(1);
                            this.state.autoFilledData[cellId] = randomVal;
                        }
                    }
                }
            }
        }
        this.renderDocument();
        this.showToast('Данные успешно сгенерированы', 'success');
    },

    /**
     * Load templates from server
     */
    loadTemplates: async function() {
        try {
            const response = await fetch(`${this.API_URL}/templates/presets`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (data.presets) {
                this.templates = data.presets;
                this.updateTemplateSelect();
            }
        } catch (err) {
            console.error('Failed to load templates:', err);
        }
    },

    /**
     * Update template select dropdown
     */
    updateTemplateSelect: function() {
        const select = document.getElementById('dbTemplateSelect');
        if (!select) return;
        select.innerHTML = '';

        this.templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = t.name;
            select.appendChild(opt);
        });
    },

    /**
     * Save current configuration as template
     */
    saveAsTemplate: async function() {
        const nameInput = document.getElementById('dbTemplateName');
        const name = nameInput.value.trim();
        if (!name) {
            this.showToast('Введите название шаблона', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.API_URL}/templates`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    name: name,
                    description: 'Пользовательский шаблон',
                    category: 'general',
                    type: this.state.mode,
                    configuration: JSON.parse(JSON.stringify(this.state))
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                this.showToast(`Шаблон "${name}" сохранен`, 'success');
                nameInput.value = '';
                this.loadTemplates();
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            this.showToast('Ошибка сохранения: ' + err.message, 'error');
        }
    },

    /**
     * Load template
     */
    loadTemplate: function() {
        const select = document.getElementById('dbTemplateSelect');
        if (!select || !select.value) return;

        const template = this.templates.find(t => t.id == select.value);
        if (template) {
            const config = template.configuration;
            this.state = JSON.parse(JSON.stringify(config));
            this.syncInputsFromState();
            this.renderControlUI();
            this.switchMode(this.state.mode);
            this.showToast(`Шаблон "${template.name}" загружен`, 'success');
        }
    },

    /**
     * Delete template
     */
    deleteTemplate: async function() {
        const select = document.getElementById('dbTemplateSelect');
        if (!select || !select.value) return;

        const template = this.templates.find(t => t.id == select.value);
        if (template && template.is_preset) {
            this.showToast('Системные шаблоны нельзя удалить', 'warning');
            return;
        }

        if (!confirm(`Удалить шаблон "${template.name}"?`)) return;

        try {
            const response = await fetch(`${this.API_URL}/templates/${select.value}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                this.showToast('Шаблон удален', 'success');
                this.loadTemplates();
            } else {
                throw new Error('Ошибка удаления');
            }
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    /**
     * Export project as JSON
     */
    exportProjectJSON: function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 4));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `haccp_project_${this.state.mode}_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        this.showToast('Проект экспортирован в JSON', 'success');
    },

    /**
     * Import project from JSON
     */
    importProjectJSON: function(event) {
        const fileReader = new FileReader();
        fileReader.onload = (e) => {
            try {
                this.state = JSON.parse(e.target.result);
                this.syncInputsFromState();
                this.renderControlUI();
                this.switchMode(this.state.mode);
                this.showToast('Проект успешно импортирован', 'success');
            } catch (err) {
                this.showToast('Ошибка чтения файла', 'error');
            }
        };
        fileReader.readAsText(event.target.files[0]);
    },

    /**
     * Export to Excel
     */
    exportToExcel: function() {
        const workbook = XLSX.utils.book_new();
        const matrix = [];

        matrix.push([this.state.systemTag]);
        matrix.push([this.state.title]);
        matrix.push([]);
        this.state.metaFields.forEach(f => matrix.push([f.label + ':', f.val]));
        matrix.push([]);
        matrix.push(this.state.columns.map(c => c.name));

        if (this.state.mode === 'sheet') {
            this.state.rowLabels.forEach((label, i) => {
                const rowData = [i + 1, label];
                for(let c=2; c<this.state.columns.length; c++) {
                    let cellKey = `cell_sheet_${i}_${c}`;
                    rowData.push(this.state.autoFilledData[cellKey] || '');
                }
                matrix.push(rowData);
            });
        } else {
            const totalJournalRows = this.state.journalPages * this.state.journalRowsPerPage;
            let currentRowIndex = 0;
            for (let p = 1; p <= this.state.journalPages; p++) {
                for (let i = 0; i < this.state.journalRowsPerPage; i++) {
                    const rowData = [currentRowIndex + 1];
                    for(let c=1; c<this.state.columns.length; c++) {
                        let cellKey = `cell_journal_${p}_${i}_${c}`;
                        rowData.push(this.state.autoFilledData[cellKey] || '');
                    }
                    matrix.push(rowData);
                    currentRowIndex++;
                }
            }
        }

        const worksheet = XLSX.utils.aoa_to_sheet(matrix);
        worksheet['!cols'] = this.state.columns.map(col => ({ wch: Math.round(parseInt(col.width) * 1.2) + 5 }));
        XLSX.utils.book_append_sheet(workbook, worksheet, "HACCP_Export");
        XLSX.writeFile(workbook, `haccp_export_${this.state.mode}_${Date.now()}.xlsx`);
        this.showToast('Экспорт в Excel выполнен', 'success');
    },

    /**
     * Export to Word
     */
    exportToWord: function() {
        const markup = document.getElementById('canvasViewport').innerHTML;
        const isLandscape = this.state.orientation === 'landscape';

        const wordContainerHTML = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <title>HACCP Document</title>
                <style>
                    @page { size: ${isLandscape ? '297mm 210mm' : '210mm 297mm'}; margin: 20mm 15mm 20mm ${this.state.marginLeft}mm; }
                    body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.3; }
                    .a4-document-page { page-break-after: always; margin-bottom: 30px; }
                    table.haccp-main-table { width: 100%; border-collapse: collapse; }
                    table.haccp-main-table th, table.haccp-main-table td { border: 1px solid #000; padding: 6px; }
                    table.haccp-main-table tr { height: ${this.state.rowHeight}mm; }
                </style>
            </head>
            <body><div class="Section1">${markup}</div></body>
            </html>
        `;

        const blob = new Blob(['\ufeff' + wordContainerHTML], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `haccp_document_${this.state.mode}_${Date.now()}.doc`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        this.showToast('Экспорт в Word выполнен', 'success');
    },

    /**
     * Show toast notification
     */
    showToast: function(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * Register service worker for PWA
     */
    registerServiceWorker: function() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('SW registered:', registration);
                })
                .catch(error => {
                    console.log('SW registration failed:', error);
                });
        }
    },

    /**
     * Show templates view (placeholder)
     */
    showTemplatesView: function() {
        this.showToast('Раздел шаблонов в разработке', 'warning');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
