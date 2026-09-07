import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import Database from './database.js';
import authRoutes from './routes/auth.js';
import templateRoutes from './routes/templates.js';
import documentRoutes from './routes/documents.js';
import exportRoutes from './routes/export.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import { WebSocketServer } from 'ws';
import http from 'http';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Инициализация базы данных
export const db = new Database('./haccp.db');
db.initialize();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// WebSocket для реального времени
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('🔌 Клиент подключился к WebSocket');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Рассылка событий всем подключенным клиентам
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (err) {
      console.error('Ошибка обработки WebSocket сообщения:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Клиент отключился от WebSocket');
  });
});

// Функция для рассылки событий
export function broadcastEvent(eventType, data) {
  const message = JSON.stringify({ type: eventType, data, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// API Routes
app.use('/api/auth', authRoutes(db));
app.use('/api/templates', templateRoutes(db, broadcastEvent));
app.use('/api/documents', documentRoutes(db, broadcastEvent));
app.use('/api/export', exportRoutes(db));
app.use('/api/users', userRoutes(db));
app.use('/api/settings', settingsRoutes(db));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '6.0.0',
    uptime: process.uptime(),
    templates: db.getTemplateCount(),
    documents: db.getDocumentCount(),
    users: db.getUserCount()
  });
});

// Статика для клиента
app.use(express.static('../haccp-client/public'));

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err.stack);
  res.status(500).json({ 
    error: 'Внутренняя ошибка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     HACCP CONTROL SERVER v6.0 - Enterprise Edition        ║
╠═══════════════════════════════════════════════════════════╣
║  Сервер запущен на порту: ${PORT}                            
║  Режим: ${process.env.NODE_ENV || 'production'}                                     
║  База данных: ./haccp.db                                  
║  WebSocket: ws://localhost:${PORT}/ws                       
╚═══════════════════════════════════════════════════════════╝
  `);
});

export { server, wss };
