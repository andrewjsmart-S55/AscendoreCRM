import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { connectDatabase } from './database/connection';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

// Import routers
import { authRouter } from './api/auth';
import { companiesRouter } from './api/companies';
import { contactsRouter } from './api/contacts';
import { dealsRouter } from './api/deals';
import { tasksRouter } from './api/tasks';
import { notesRouter } from './api/notes';
import { campaignsRouter } from './api/campaigns';
import { projectsRouter } from './api/projects';
import { activitiesRouter } from './api/activities';
import { searchRouter } from './api/search';
import { analyticsRouter } from './api/analytics';
import { aiRouter } from './api/ai';
import { exportRouter } from './api/export';
import { importRouter } from './api/import';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_VERSION = process.env.API_VERSION || 'v1';

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'AscendoreCRM',
    version: '0.1.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
// Auth routes (no a-crm prefix)
app.use(`/api/${API_VERSION}/auth`, authRouter);

// CRM routes - all prefixed with /api/v1/a-crm
const API_PREFIX = `/api/${API_VERSION}/a-crm`;

app.use(`${API_PREFIX}/companies`, companiesRouter);
app.use(`${API_PREFIX}/contacts`, contactsRouter);
app.use(`${API_PREFIX}/deals`, dealsRouter);
app.use(`${API_PREFIX}/tasks`, tasksRouter);
app.use(`${API_PREFIX}/notes`, notesRouter);
app.use(`${API_PREFIX}/campaigns`, campaignsRouter);
app.use(`${API_PREFIX}/projects`, projectsRouter);
app.use(`${API_PREFIX}/activities`, activitiesRouter);
app.use(`${API_PREFIX}/search`, searchRouter);
app.use(`${API_PREFIX}/analytics`, analyticsRouter);
app.use(`${API_PREFIX}/ai`, aiRouter);
app.use(`${API_PREFIX}/export`, exportRouter);
app.use(`${API_PREFIX}/import`, importRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Start listening
    app.listen(PORT, () => {
      logger.info(`AscendoreCRM API server started on port ${PORT}`);
      logger.info(`API endpoints available at: http://localhost:${PORT}${API_PREFIX}`);
      logger.info('Environment:', process.env.NODE_ENV || 'development');
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();
