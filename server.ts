import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { modulesRegistry } from './server/modulesRegistry';
import { loggerService } from './server/loggerService';
import { functionGemmaService } from './server/functionGemmaService';
import { storageService } from './server/storageService';
import { sttService } from './server/sttService';
import { modelRouterService } from './server/modelRouter';
import { localModelsManager } from './server/localModelsManager';
import { localModelRuntime } from './server/localModelRuntime';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API: Get Model and Checksum Status
app.get('/api/status', (req, res) => {
  const status = modulesRegistry.getModelStatus();
  res.json(status);
});

// API: Get Modules and Tools
app.get('/api/modules', (req, res) => {
  const tools = modulesRegistry.getTools();
  const manifest = modulesRegistry.getTrainingManifest();
  const currentChecksum = modulesRegistry.getCurrentChecksum();
  const conflict = modulesRegistry.checkConflict();
  const groups = modulesRegistry.getModuleGroups();

  res.json({
    modules: groups,
    tools,
    currentChecksum,
    trainingManifest: manifest,
    conflict
  });
});

// API: Save Module config.ini
app.post('/api/modules/:module/config', (req, res) => {
  const { configIniRaw } = req.body;
  if (typeof configIniRaw !== 'string') {
    res.status(400).json({ error: 'Параметр configIniRaw должен быть строкой.' });
    return;
  }
  const saved = modulesRegistry.saveModuleConfig(req.params.module, configIniRaw);
  res.json({ success: saved });
});

// API: Save Module module.json
app.post('/api/modules/:module/manifest', (req, res) => {
  const manifestData = req.body;
  if (!manifestData || !manifestData.name) {
    res.status(400).json({ error: 'Некорректный manifest модуля.' });
    return;
  }
  const saved = modulesRegistry.saveModuleManifest(req.params.module, manifestData);
  res.json({ success: saved });
});

// SSE Event stream client tracking
const sseClients = new Set<express.Response>();

export function broadcastServerEvent(eventType: string, data: Record<string, unknown>) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify({ ...data, timestamp: new Date().toISOString() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// API: Server-Sent Events (SSE) for Real-Time Server Updates
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.add(res);

  // Send initial connected snapshot
  const initialData = {
    type: 'INIT_SNAPSHOT',
    services: {
      gateway: { status: 'online', port: 3000 },
      llmWorker: { status: 'online', engine: 'llama-cpp / transformers (Python)' },
      voiceWorker: { status: 'online', engine: 'faster-whisper (Python)' },
      rabbitmq: { status: 'connected' },
      postgres: { status: 'ready', vectorSupport: true }
    },
    runtime: localModelRuntime.getState()
  };
  res.write(`event: INIT_SNAPSHOT\ndata: ${JSON.stringify(initialData)}\n\n`);

  // Keep-alive heartbeat interval
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: PING\ndata: {"timestamp":"${new Date().toISOString()}"}\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 10000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// API: Microservices Health & Status
app.get('/api/microservices/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    services: {
      gateway: { name: 'FastAPI / Node Gateway', status: 'online', port: PORT },
      llm_worker: { name: 'LLM Worker (Transformers & GGUF)', status: 'ready', container: 'overlay-llm-worker' },
      stt_worker: { name: 'Speech-to-Text Worker (Faster-Whisper)', status: 'ready', container: 'overlay-stt-worker' },
      rabbitmq: { name: 'RabbitMQ Message Broker', status: 'connected', port: 5672 },
      postgres: { name: 'PostgreSQL 16 + pgvector', status: 'ready', port: 5432 }
    },
    systemMemory: {
      rssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      externalMb: Math.round(mem.external / (1024 * 1024))
    }
  });
});

// API: Save or Update Tool
app.post('/api/modules', (req, res) => {
  const toolData = req.body;
  if (!toolData.id || !toolData.name || !toolData.module || !toolData.code) {
    res.status(400).json({ error: 'Необходимо указать id, name, module и code инструмента.' });
    return;
  }
  const saved = modulesRegistry.saveTool(toolData);
  const conflict = modulesRegistry.checkConflict();
  res.json({ success: true, tool: saved, conflict });
});

// API: Delete Tool
app.delete('/api/modules/:id', (req, res) => {
  const deleted = modulesRegistry.deleteTool(req.params.id);
  const conflict = modulesRegistry.checkConflict();
  res.json({ success: deleted, conflict });
});

// API: Reload all modules from definitions
app.post('/api/modules/reload', (req, res) => {
  const result = modulesRegistry.reloadAll();
  const conflict = modulesRegistry.checkConflict();
  res.json({ success: true, ...result, conflict });
});

// API: Reset to defaults
app.post('/api/modules/reset-defaults', (req, res) => {
  const result = modulesRegistry.resetToDefaults();
  const conflict = modulesRegistry.checkConflict();
  res.json({ success: true, ...result, conflict });
});

// API: Model Unload / Reload
app.post('/api/model/unload', (req, res) => {
  const { loaded } = req.body;
  const currentStatus = modulesRegistry.getModelStatus();
  const newLoaded = loaded !== undefined ? Boolean(loaded) : !currentStatus.loaded;
  modulesRegistry.setModelLoaded(newLoaded);
  res.json({ success: true, loaded: newLoaded });
});

// API: Toggle Ignore Conflict
app.post('/api/model/ignore-conflict', (req, res) => {
  const { ignore } = req.body;
  const currentStatus = modulesRegistry.getModelStatus();
  const newIgnore = ignore !== undefined ? Boolean(ignore) : !currentStatus.ignoreConflict;
  modulesRegistry.setIgnoreConflict(newIgnore);
  res.json({ success: true, ignoreConflict: newIgnore });
});

// API: Sync Training Manifest (Retrain/Reindex simulation)
app.post('/api/model/sync-manifest', (req, res) => {
  const updatedManifest = modulesRegistry.syncTrainingManifestToCurrent();
  const conflict = modulesRegistry.checkConflict();
  res.json({ success: true, manifest: updatedManifest, conflict });
});

// API: Execute Query via FunctionGemma
app.post('/api/query', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Укажите текст запроса.' });
    return;
  }

  const modelStatus = modulesRegistry.getModelStatus();

  // Check if model is unloaded
  if (!modelStatus.loaded) {
    loggerService.addLog({
      timestamp: new Date().toISOString(),
      prompt,
      modelName: modelStatus.modelName,
      status: 'ERROR',
      errorMessage: 'Модель выгружена из памяти из-за несоответствия или по запросу пользователя.',
      durationMs: 0,
      accuracyRating: 'FAILED',
      criticalSumMatched: !modelStatus.conflict.hasConflict
    });
    res.status(400).json({
      error: 'Модель FunctionGemma выгружена. Загрузите модель снова (Ctrl+U) или подтвердите совместимость.',
      modelStatus
    });
    return;
  }

  // Check conflict protection
  if (modelStatus.conflict.hasConflict && !modelStatus.ignoreConflict) {
    loggerService.addLog({
      timestamp: new Date().toISOString(),
      prompt,
      modelName: modelStatus.modelName,
      status: 'BLOCKED_CONFLICT',
      errorMessage: `Конфликт контрольной суммы: ожидалась ${modelStatus.conflict.expectedChecksum.substring(0, 8)}, текущая ${modelStatus.conflict.actualChecksum.substring(0, 8)}`,
      durationMs: 0,
      accuracyRating: 'FAILED',
      criticalSumMatched: false
    });
    res.status(409).json({
      error: 'Блокировка исполнения: критическая сумма инструментов не совпадает с сигнатурой обучения модели.',
      conflict: modelStatus.conflict
    });
    return;
  }

  const start = Date.now();

  try {
    // Infer tool call from FunctionGemma
    const gemmaResult = await functionGemmaService.inferAndCallTool(prompt);

    if (!gemmaResult.toolName) {
      const durationMs = Date.now() - start;
      const log = loggerService.addLog({
        timestamp: new Date().toISOString(),
        prompt,
        modelName: gemmaResult.modelIdent,
        status: 'NO_TOOL_MATCH',
        errorMessage: 'Модель не смогла сопоставить запрос с зарегистрированными инструментами.',
        durationMs,
        accuracyRating: 'UNRATED',
        criticalSumMatched: !modelStatus.conflict.hasConflict
      });
      res.json({
        success: false,
        message: 'Модель не нашла подходящего инструмента для этого запроса.',
        rawResponse: gemmaResult.rawResponse,
        logId: log.id
      });
      return;
    }

    // Execute the inferred tool
    const toolExec = await modulesRegistry.executeTool(gemmaResult.toolName, gemmaResult.arguments);
    const durationMs = Date.now() - start;

    const log = loggerService.addLog({
      timestamp: new Date().toISOString(),
      prompt,
      modelName: gemmaResult.modelIdent,
      toolCalled: gemmaResult.toolName,
      toolArguments: gemmaResult.arguments,
      toolResult: toolExec.result,
      status: 'SUCCESS',
      durationMs,
      accuracyRating: 'EXACT',
      criticalSumMatched: !modelStatus.conflict.hasConflict
    });

    res.json({
      success: true,
      toolCalled: gemmaResult.toolName,
      toolArguments: gemmaResult.arguments,
      result: toolExec.result,
      view: toolExec.view,
      views: toolExec.views,
      durationMs,
      source: gemmaResult.source,
      logId: log.id,
      rawResponse: gemmaResult.rawResponse,
      routeDecision: gemmaResult.routeDecision
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    const log = loggerService.addLog({
      timestamp: new Date().toISOString(),
      prompt,
      modelName: modelStatus.modelName,
      status: 'ERROR',
      errorMessage: msg,
      durationMs,
      accuracyRating: 'FAILED',
      criticalSumMatched: !modelStatus.conflict.hasConflict
    });

    res.status(500).json({
      success: false,
      error: msg,
      logId: log.id
    });
  }
});

// API: Stream Query with Real-time Tool Invocation Events (Server-Sent Events)
app.post('/api/query/stream', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Укажите текст запроса.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: Record<string, unknown>) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const modelStatus = modulesRegistry.getModelStatus();
  if (!modelStatus.loaded) {
    sendEvent('error', { error: 'Модель FunctionGemma выгружена из памяти.' });
    res.end();
    return;
  }

  if (modelStatus.conflict.hasConflict && !modelStatus.ignoreConflict) {
    sendEvent('error', { error: 'Блокировка: критическая сумма модулей не совпадает с сигнатурой обучения.' });
    res.end();
    return;
  }

  const start = Date.now();
  sendEvent('stage', { stage: 'inferring', message: 'FunctionGemma анализирует запрос...' });

  try {
    const gemmaResult = await functionGemmaService.inferAndCallTool(prompt);

    if (!gemmaResult.toolName) {
      const durationMs = Date.now() - start;
      loggerService.addLog({
        timestamp: new Date().toISOString(),
        prompt,
        modelName: gemmaResult.modelIdent,
        status: 'NO_TOOL_MATCH',
        errorMessage: 'Модель не смогла сопоставить запрос с инструментами.',
        durationMs,
        accuracyRating: 'UNRATED',
        criticalSumMatched: !modelStatus.conflict.hasConflict
      });
      sendEvent('no_tool', { message: 'Модель не нашла подходящего инструмента для этого запроса.' });
      res.end();
      return;
    }

    // Inform client immediately that tool is invoked and being executed
    sendEvent('tool_invoked', {
      stage: 'tool_invoked',
      toolName: gemmaResult.toolName,
      arguments: gemmaResult.arguments,
      modelIdent: gemmaResult.modelIdent,
      routeDecision: gemmaResult.routeDecision,
      message: `Инструмент ${gemmaResult.toolName} вызван, ожидание ответа...`
    });

    // Execute tool
    const toolExec = await modulesRegistry.executeTool(gemmaResult.toolName, gemmaResult.arguments);
    const durationMs = Date.now() - start;

    const log = loggerService.addLog({
      timestamp: new Date().toISOString(),
      prompt,
      modelName: gemmaResult.modelIdent,
      toolCalled: gemmaResult.toolName,
      toolArguments: gemmaResult.arguments,
      toolResult: toolExec.result,
      status: 'SUCCESS',
      durationMs,
      accuracyRating: 'EXACT',
      criticalSumMatched: !modelStatus.conflict.hasConflict
    });

    sendEvent('completed', {
      success: true,
      toolCalled: gemmaResult.toolName,
      toolArguments: gemmaResult.arguments,
      result: toolExec.result,
      view: toolExec.view,
      views: toolExec.views,
      durationMs,
      modelIdent: gemmaResult.modelIdent,
      routeDecision: gemmaResult.routeDecision,
      logId: log.id
    });
    res.end();
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    loggerService.addLog({
      timestamp: new Date().toISOString(),
      prompt,
      modelName: modelStatus.modelName,
      status: 'ERROR',
      errorMessage: msg,
      durationMs,
      accuracyRating: 'FAILED',
      criticalSumMatched: !modelStatus.conflict.hasConflict
    });
    sendEvent('error', { error: msg });
    res.end();
  }
});

// API: Storage Management
app.get('/api/storage', (req, res) => {
  const info = storageService.getStorageInfo();
  res.json(info);
});

app.post('/api/storage/path', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath || typeof newPath !== 'string') {
    res.status(400).json({ error: 'Укажите новый путь к папке хранилища.' });
    return;
  }
  const result = storageService.setPath(newPath);
  res.json({ ...result, info: storageService.getStorageInfo() });
});

// API: Speech-to-Text (STT) Config & Transcribe
app.get('/api/stt/config', (req, res) => {
  res.json(sttService.getConfig());
});

app.post('/api/stt/config', (req, res) => {
  const updated = sttService.setConfig(req.body);
  res.json({ success: true, config: updated });
});

app.post('/api/stt/transcribe', async (req, res) => {
  try {
    const { base64Audio, filename } = req.body;
    let buffer: Buffer;
    if (base64Audio) {
      buffer = Buffer.from(base64Audio, 'base64');
    } else {
      buffer = Buffer.from([]);
    }
    const result = await sttService.transcribeAudio(buffer, filename || 'audio.webm');
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// API: Multi-Model Routing Clusters
app.get('/api/models/clusters', (req, res) => {
  res.json({
    clusters: modelRouterService.getClusters(),
    autoRouting: modelRouterService.isAutoRoutingEnabled(),
    defaultModel: modelRouterService.getDefaultModel()
  });
});

app.post('/api/models/default', (req, res) => {
  const { id } = req.body;
  const ok = modelRouterService.setDefaultModel(id);
  res.json({ success: ok, defaultModel: modelRouterService.getDefaultModel() });
});

app.post('/api/models/autoroute', (req, res) => {
  const { enabled } = req.body;
  modelRouterService.setAutoRouting(Boolean(enabled));
  res.json({ success: true, autoRouting: modelRouterService.isAutoRoutingEnabled() });
});

app.post('/api/models/clusters', (req, res) => {
  const updated = modelRouterService.updateCluster(req.body);
  res.json({ success: true, cluster: updated, clusters: modelRouterService.getClusters() });
});

// API: Local Model Store (/models folder)
app.get('/api/models/local', (req, res) => {
  const overview = localModelsManager.scanModels();
  res.json(overview);
});

app.post('/api/models/local/scan', (req, res) => {
  const overview = localModelsManager.scanModels();
  res.json(overview);
});

app.post('/api/models/local/select', (req, res) => {
  const { category, model } = req.body;
  if (!category || !model) {
    res.status(400).json({ error: 'Укажите категорию и идентификатор модели.' });
    return;
  }
  const result = localModelsManager.setActiveModel(category, model);

  // If STT model changed, sync with sttService
  if (category === 'stt') {
    sttService.setConfig({ modelFile: model, model });
  }

  res.json({ success: true, ...result, overview: localModelsManager.scanModels() });
});

app.post('/api/models/local/descriptor', (req, res) => {
  const { category, filename, descriptor } = req.body;
  if (!category || !filename || !descriptor) {
    res.status(400).json({ error: 'Недостаточно данных для создания дескриптора.' });
    return;
  }
  const result = localModelsManager.createModelDescriptor(category, filename, descriptor);
  res.json({ success: true, ...result, overview: localModelsManager.scanModels() });
});

// API: Model Runtime RAM Management (Load / Unload / Status)
app.get('/api/models/runtime', (req, res) => {
  res.json(localModelRuntime.getState());
});

app.post('/api/models/load', async (req, res) => {
  try {
    const { category = 'basemodel', filename } = req.body;
    const runtime = await localModelRuntime.loadModel(category, filename);
    res.json({ success: true, runtime, modelStatus: modulesRegistry.getModelStatus() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg });
  }
});

app.post('/api/models/unload', (req, res) => {
  const runtime = localModelRuntime.unloadModel();
  res.json({ success: true, runtime, modelStatus: modulesRegistry.getModelStatus() });
});

// API: Toggle Module (all tools in module)
app.post('/api/modules/:module/toggle', (req, res) => {
  const { enabled } = req.body;
  const moduleName = req.params.module;
  const updatedTools = modulesRegistry.toggleModule(moduleName, Boolean(enabled));
  const currentChecksum = modulesRegistry.getCurrentChecksum();
  res.json({
    success: true,
    module: moduleName,
    enabled: Boolean(enabled),
    updatedTools,
    currentChecksum,
    conflict: modulesRegistry.checkConflict()
  });
});

// API: Toggle Individual Tool
app.post('/api/tools/:id/toggle', (req, res) => {
  const { enabled } = req.body;
  const toolId = req.params.id;
  const updatedTool = modulesRegistry.toggleTool(toolId, typeof enabled === 'boolean' ? enabled : undefined);
  if (!updatedTool) {
    res.status(404).json({ error: 'Инструмент не найден.' });
    return;
  }
  const currentChecksum = modulesRegistry.getCurrentChecksum();
  res.json({
    success: true,
    tool: updatedTool,
    currentChecksum,
    conflict: modulesRegistry.checkConflict()
  });
});

// API: Execution Logs
app.get('/api/logs', (req, res) => {
  const { tool, status, rating } = req.query;
  const logs = loggerService.getLogs({
    tool: typeof tool === 'string' ? tool : undefined,
    status: typeof status === 'string' ? status : undefined,
    rating: typeof rating === 'string' ? rating : undefined
  });
  const stats = loggerService.getAccuracyStats();
  res.json({ logs, stats });
});

// API: Update Accuracy Rating on Log
app.post('/api/logs/:id/accuracy', (req, res) => {
  const { rating, note } = req.body;
  const updated = loggerService.updateAccuracy(req.params.id, rating, note);
  if (!updated) {
    res.status(404).json({ error: 'Лог не найден.' });
    return;
  }
  res.json({ success: true, log: updated });
});

// API: Export dataset
app.get('/api/logs/export', (req, res) => {
  const format = req.query.format === 'jsonl' ? 'jsonl' : 'json';
  const data = loggerService.exportDataset(format);
  res.setHeader('Content-Type', format === 'jsonl' ? 'application/x-ndjson' : 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="functiongemma_dataset.${format}"`);
  res.send(data);
});

// API: Configure Settings
app.post('/api/settings', (req, res) => {
  const { endpoint, type } = req.body;
  if (endpoint && type) {
    modulesRegistry.setLocalEndpoint(endpoint, type);
  }
  res.json({ success: true, status: modulesRegistry.getModelStatus() });
});

// Vite middleware and static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
