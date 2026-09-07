/**
 * HACCP Control Server v6.0 - Main Server Entry Point
 * Enterprise Edition for Local Network
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import modules
const db = require('./database/init-database');
const authRoutes = require('./routes/auth');
const templatesRoutes = require('./routes/templates');
const documentsRoutes = require('./routes/documents');
const usersRoutes = require('./routes/users');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
    crossOriginEmbedderPolicy: false
}));

// CORS configuration for local network
app.use(cors({
    origin: true,
    credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files serving (Frontend)
const frontendPath = path.join(__dirname, '../frontend/public');
app.use(express.static(frontendPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/export', exportRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '6.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.APP_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(PORT, HOST, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   HACCP Control Server v6.0 - Enterprise Edition          ║
║                                                           ║
║   🌐 Server running on: http://${HOST}:${PORT}            ║
║   📁 Database: ${process.env.DB_PATH || './database/haccp.db'}                    ║
║   🔧 Environment: ${process.env.APP_ENV || 'development'}                          ║
║                                                           ║
║   Access from local network:                              ║
║   - Find your IP: ip addr (Linux) / ipconfig (Windows)   ║
║   - Open: http://<YOUR_IP>:${PORT}                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
