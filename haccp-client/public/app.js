// HACCP Control Enterprise - Client Application v6.0

const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : '/api';

let currentUser = null;
let authToken = null;
let allTemplates = [];

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupEventListeners();
});

function setupEventListeners() {
  // Login form
  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  
  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
    });
  });
}

// Авторизация
async function checkAuth() {
  const token = localStorage.getItem('haccp_token');
  const user = localStorage.getItem('haccp_user');
  
  if (token && user) {
    authToken = token;
    currentUser = JSON.parse(user);
    showApp();
  } else {
    showLogin();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('haccp_token', data.token);
      localStorage.setItem('haccp_user', JSON.stringify(data.user));
      showToast('Успешная авторизация!', 'success');
      showApp();
      loadDashboard();
    } else {
      showToast(data.error || 'Ошибка входа', 'error');
    }
  } catch (error) {
    showToast('Ошибка соединения с сервером', 'error');
  }
}

function logout() {
  localStorage.removeItem('haccp_token');
  localStorage.removeItem('haccp_user');
  authToken = null;
  currentUser = null;
  showLogin();
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContainer').classList.remove('active');
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').classList.add('active');
  
  if (currentUser) {
    document.getElementById('userName').textContent = currentUser.fullName || currentUser.username;
    document.getElementById('userRole').textContent = currentUser.role;
  }
  
  loadDashboard();
}

// Навигация
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) {
    targetPage.style.display = 'block';
  }
  
  const activeLink = document.querySelector(`[data-page="${page}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }
  
  // Load page data
  switch(page) {
    case 'dashboard': loadDashboard(); break;
    case 'templates': loadAllTemplates(); break;
    case 'documents': loadDocuments(); break;
    case 'create': initBuilder(); break;
    case 'export': break;
    case 'settings': loadSettings(); break;
  }
}

// Загрузка данных
async function loadDashboard() {
  try {
    const [healthRes, templatesRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/templates`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
    ]);
    
    const health = await healthRes.json();
    const templatesData = await templatesRes.json();
    
    allTemplates = templatesData.templates || [];
    
    document.getElementById('statTemplates').textContent = health.templates || allTemplates.length;
    document.getElementById('statDocuments').textContent = health.documents || 0;
    document.getElementById('statUsers').textContent = health.users || 1;
    
    renderTemplatesGrid(allTemplates.slice(0, 6), 'templatesGrid');
  } catch (error) {
    console.error('Ошибка загрузки dashboard:', error);
  }
}

async function loadAllTemplates() {
  try {
    const response = await fetch(`${API_BASE}/templates`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    allTemplates = data.templates || [];
    renderTemplatesGrid(allTemplates, 'allTemplatesGrid');
  } catch (error) {
    showToast('Ошибка загрузки шаблонов', 'error');
  }
}

async function loadDocuments() {
  try {
    const response = await fetch(`${API_BASE}/documents`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    const documents = data.documents || [];
    
    const grid = document.getElementById('documentsGrid');
    if (documents.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="icon">📄</div>
          <h3>Нет документов</h3>
          <p>Создайте первый документ из шаблона</p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = documents.map(doc => `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${escapeHtml(doc.title)}</div>
          <span class="card-badge badge-${doc.status === 'approved' ? 'journal' : 'general'}">${doc.status}</span>
        </div>
        <div class="card-description">Шаблон: ${doc.template_name || 'Без шаблона'}</div>
        <div class="card-meta">
          <span>${new Date(doc.created_at).toLocaleDateString()}</span>
          <span>${doc.tags || ''}</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-secondary" onclick="viewDocument('${doc.id}')">Открыть</button>
          <button class="btn btn-sm btn-primary" onclick="exportDocumentExcel('${doc.id}')">Excel</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    showToast('Ошибка загрузки документов', 'error');
  }
}

// Рендеринг шаблонов
function renderTemplatesGrid(templates, containerId) {
  const container = document.getElementById(containerId);
  
  if (!templates || templates.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="icon">📋</div>
        <h3>Нет шаблонов</h3>
        <p>Создайте первый шаблон документа HACCP</p>
        <button class="btn btn-primary btn-sm" onclick="openCreateModal()">Создать шаблон</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = templates.map(t => {
    const config = typeof t.config_json === 'string' ? JSON.parse(t.config_json) : (t.config_json || {});
    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${escapeHtml(t.name)}</div>
          <span class="card-badge badge-${t.type === 'journal' ? 'journal' : 'sheet'}">${t.type}</span>
        </div>
        <div class="card-description">${escapeHtml(t.description || 'Описание отсутствует')}</div>
        <div class="card-meta">
          <span>📁 ${t.category}</span>
          <span>👁️ ${t.usage_count || 0}</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-secondary" onclick="useTemplate('${t.id}')">Использовать</button>
          <button class="btn btn-sm btn-secondary" onclick="duplicateTemplate('${t.id}')">Копия</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTemplate('${t.id}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// Модальные окна
function openCreateModal() {
  document.getElementById('createModal').classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Создание шаблона
async function createTemplate() {
  const name = document.getElementById('newTemplateName').value;
  const description = document.getElementById('newTemplateDesc').value;
  const category = document.getElementById('newTemplateCategory').value;
  const type = document.getElementById('newTemplateType').value;
  
  if (!name) {
    showToast('Введите название шаблона', 'error');
    return;
  }
  
  const defaultConfig = {
    org: '',
    systemTag: 'СИСТЕМА ХАССП',
    title: name,
    metaFields: [],
    columns: [{ name: '№ п/п', width: '8' }, { name: 'Параметр', width: '50' }, { name: 'Значение', width: '24' }, { name: 'Подпись', width: '18' }],
    rowLabels: [],
    signatures: []
  };
  
  try {
    const response = await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name,
        description,
        category,
        type,
        config: defaultConfig,
        isPublic: false
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showToast('Шаблон создан', 'success');
      closeModal('createModal');
      loadDashboard();
      
      // Очистка формы
      document.getElementById('newTemplateName').value = '';
      document.getElementById('newTemplateDesc').value = '';
    } else {
      showToast(data.error || 'Ошибка создания', 'error');
    }
  } catch (error) {
    showToast('Ошибка соединения', 'error');
  }
}

// Использование шаблона
async function useTemplate(templateId) {
  try {
    const response = await fetch(`${API_BASE}/templates/${templateId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    const template = data.template;
    
    // Переход в конструктор с загруженным шаблоном
    navigateTo('create');
    initBuilder(JSON.parse(template.config_json));
    
    showToast(`Шаблон "${template.name}" загружен`, 'success');
  } catch (error) {
    showToast('Ошибка загрузки шаблона', 'error');
  }
}

// Дублирование шаблона
async function duplicateTemplate(templateId) {
  try {
    const response = await fetch(`${API_BASE}/templates/${templateId}/duplicate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      showToast('Шаблон дублирован', 'success');
      loadAllTemplates();
    }
  } catch (error) {
    showToast('Ошибка дублирования', 'error');
  }
}

// Удаление шаблона
async function deleteTemplate(templateId) {
  if (!confirm('Удалить этот шаблон?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/templates/${templateId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      showToast('Шаблон удален', 'success');
      loadAllTemplates();
    }
  } catch (error) {
    showToast('Ошибка удаления', 'error');
  }
}

// Конструктор документов
let currentBuilderMode = 'sheet';
let currentConfig = null;

function switchBuilderTab(mode) {
  currentBuilderMode = mode;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  initBuilder(currentConfig);
}

function initBuilder(config = null) {
  currentConfig = config || getDefaultConfig();
  const container = document.getElementById('builderArea');
  
  container.innerHTML = `
    <div class="card" style="max-width:800px;">
      <div class="form-group">
        <label>Название организации</label>
        <input type="text" id="builderOrg" value="${currentConfig.org || ''}" placeholder="ООО Организация">
      </div>
      <div class="form-group">
        <label>Заголовок документа</label>
        <input type="text" id="builderTitle" value="${currentConfig.title || ''}" placeholder="Журнал контроля">
      </div>
      <div class="form-group">
        <label>Системный тег</label>
        <input type="text" id="builderSystemTag" value="${currentConfig.systemTag || 'ХАССП'}">
      </div>
      <div class="form-group">
        <label>Ориентация</label>
        <select id="builderOrientation" style="width:100%;padding:0.75rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);">
          <option value="portrait" ${currentConfig.orientation === 'portrait' ? 'selected' : ''}>Книжная</option>
          <option value="landscape" ${currentConfig.orientation === 'landscape' ? 'selected' : ''}>Альбомная</option>
        </select>
      </div>
      <div style="display:flex;gap:0.75rem;margin-top:1rem;">
        <button class="btn btn-primary" onclick="saveCurrentDocument()">💾 Сохранить документ</button>
        <button class="btn btn-secondary" onclick="printPreview()">🖨️ Печать/PDF</button>
        <button class="btn btn-secondary" onclick="exportToExcel()">📊 Excel</button>
      </div>
    </div>
  `;
}

function getDefaultConfig() {
  return {
    mode: currentBuilderMode,
    orientation: 'portrait',
    org: '',
    systemTag: 'СИСТЕМА ХАССП',
    title: '',
    metaFields: [],
    columns: [],
    rowLabels: [],
    signatures: []
  };
}

async function saveCurrentDocument() {
  const title = document.getElementById('builderTitle').value || 'Новый документ';
  
  const docData = {
    org: document.getElementById('builderOrg').value,
    systemTag: document.getElementById('builderSystemTag').value,
    title: title,
    orientation: document.getElementById('builderOrientation').value,
    mode: currentBuilderMode
  };
  
  try {
    const response = await fetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title,
        data: docData,
        status: 'draft'
      })
    });
    
    if (response.ok) {
      showToast('Документ сохранен', 'success');
    }
  } catch (error) {
    showToast('Ошибка сохранения', 'error');
  }
}

function printPreview() {
  window.print();
}

function exportToExcel() {
  showToast('Экспорт в Excel...', 'success');
  // Реализация экспорта через XLSX библиотеку
}

async function exportDocumentExcel(docId) {
  window.open(`${API_BASE}/export/document/${docId}/excel`, '_blank');
}

// Экспорт данных
async function exportJSON() {
  window.open(`${API_BASE}/export/templates/json`, '_blank');
}

async function exportBackup() {
  window.open(`${API_BASE}/export/backup/full`, '_blank');
}

async function exportAllExcel() {
  showToast('Формирование Excel...', 'success');
}

// Настройки
async function loadSettings() {
  try {
    const response = await fetch(`${API_BASE}/settings`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const data = await response.json();
    const settings = data.settings || [];
    
    const orgSetting = settings.find(s => s.key === 'system_name');
    const orientSetting = settings.find(s => s.key === 'default_orientation');
    
    if (orgSetting) document.getElementById('settingOrgName').value = orgSetting.value;
    if (orientSetting) document.getElementById('settingOrientation').value = orientSetting.value;
  } catch (error) {
    console.error('Ошибка загрузки настроек:', error);
  }
}

async function saveSettings() {
  const orgName = document.getElementById('settingOrgName').value;
  const orientation = document.getElementById('settingOrientation').value;
  
  try {
    await fetch(`${API_BASE}/settings/system_name`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ value: orgName })
    });
    
    await fetch(`${API_BASE}/settings/default_orientation`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ value: orientation })
    });
    
    showToast('Настройки сохранены', 'success');
  } catch (error) {
    showToast('Ошибка сохранения настроек', 'error');
  }
}

// Утилиты
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function filterTemplates() {
  const search = document.getElementById('templateSearch').value.toLowerCase();
  const filtered = allTemplates.filter(t => 
    t.name.toLowerCase().includes(search) ||
    (t.description && t.description.toLowerCase().includes(search))
  );
  renderTemplatesGrid(filtered, 'allTemplatesGrid');
}

async function viewDocument(docId) {
  showToast('Открытие документа...', 'success');
  // Реализация просмотра
}
