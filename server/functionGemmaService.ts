import { GoogleGenAI } from '@google/genai';
import { modulesRegistry } from './modulesRegistry';
import { modelRouterService, RouteDecision } from './modelRouter';
import { localModelRuntime } from './localModelRuntime';
import { localModelsManager } from './localModelsManager';
import { ToolDefinition } from '../src/types';

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

export interface FunctionGemmaCallResult {
  toolName?: string;
  arguments?: Record<string, unknown>;
  rawResponse: string;
  source: 'local_endpoint' | 'gemini_api' | 'local_runtime';
  modelIdent: string;
  routeDecision?: RouteDecision;
}

class FunctionGemmaService {

  public formatGemmaToolsSchema(tools: ToolDefinition[]): string {
    const schemas = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: t.parameters.reduce((acc, p) => {
            acc[p.name] = {
              type: p.type,
              description: p.description
            };
            return acc;
          }, {} as Record<string, unknown>),
          required: t.parameters.filter(p => p.required).map(p => p.name)
        }
      }
    }));
    return JSON.stringify(schemas, null, 2);
  }

  public parseGemmaResponse(text: string): { toolName?: string; arguments?: Record<string, unknown> } {
    // 1. Try FunctionGemma signature: call:tool_name{key="value", ...} or call:tool_name({...})
    const callMatch = text.match(/call:([a-zA-Z0-9_]+)\s*(\{[\s\S]*?\})/);
    if (callMatch) {
      const toolName = callMatch[1];
      const rawArgs = callMatch[2];
      try {
        const jsonReady = rawArgs
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*=/g, '$1"$2":')
          .replace(/:\s*'([^']*)'/g, ':"$1"');
        const parsed = JSON.parse(jsonReady);
        return { toolName, arguments: parsed };
      } catch {
        return { toolName, arguments: {} };
      }
    }

    // 2. Try JSON markdown block: ```json { "name": "...", "arguments": {...} } ```
    const jsonBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonBlock) {
      try {
        const obj = JSON.parse(jsonBlock[1]);
        if (obj.name) {
          return { toolName: obj.name, arguments: obj.arguments || obj.parameters || {} };
        }
        if (obj.call) {
          return { toolName: obj.call, arguments: obj.arguments || {} };
        }
      } catch {
        // continue
      }
    }

    // 3. Try raw JSON
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const obj = JSON.parse(trimmed);
        if (obj.name || obj.tool) {
          return { toolName: obj.name || obj.tool, arguments: obj.arguments || obj.parameters || {} };
        }
      }
    } catch {
      // continue
    }

    return {};
  }

  public async callLocalEndpoint(
    endpoint: string,
    prompt: string,
    activeTools: ToolDefinition[]
  ): Promise<FunctionGemmaCallResult | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const isOllama = endpoint.includes('11434');
      const url = isOllama ? `${endpoint}/api/generate` : `${endpoint}/v1/chat/completions`;

      const toolsSchema = this.formatGemmaToolsSchema(activeTools);
      const systemPrompt = `You are FunctionGemma, a function calling model. Choose the best tool for the user request.
Output your call strictly in the format: call:function_name{"param": "value"}

Available tools:
${toolsSchema}`;

      const payload = isOllama
        ? {
            model: 'functiongemma',
            prompt: `<start_of_turn>developer\n${systemPrompt}<end_of_turn>\n<start_of_turn>user\n${prompt}<end_of_turn>\n<start_of_turn>model\n`,
            stream: false
          }
        : {
            model: 'functiongemma',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ]
          };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (!res.ok) return null;

      const data = (await res.json()) as Record<string, unknown>;
      const rawText = (data.response || (data.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || '') as string;
      const parsed = this.parseGemmaResponse(rawText);

      return {
        toolName: parsed.toolName,
        arguments: parsed.arguments,
        rawResponse: rawText,
        source: 'local_endpoint',
        modelIdent: 'Local FunctionGemma'
      };
    } catch {
      return null;
    }
  }

  public async callGemini(
    prompt: string,
    activeTools: ToolDefinition[]
  ): Promise<FunctionGemmaCallResult | null> {
    const ai = getGeminiClient();
    if (!ai) return null;

    try {
      const toolsSchema = this.formatGemmaToolsSchema(activeTools);
      const systemInstruction = `You are FunctionGemma, a function calling model for a personal desktop assistant.
Select the single best tool to invoke for the user's prompt.
Output strictly in the following call signature format:
call:tool_name{"param": "value"}

Available registered tools schema:
${toolsSchema}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1
        }
      });

      const rawText = response.text || '';
      const parsed = this.parseGemmaResponse(rawText);
      if (parsed.toolName) {
        return {
          toolName: parsed.toolName,
          arguments: parsed.arguments,
          rawResponse: rawText,
          source: 'gemini_api',
          modelIdent: 'Gemini 2.5 Flash'
        };
      }
      return null;
    } catch (err) {
      console.warn('[FunctionGemmaService] Gemini API inference error:', err);
      return null;
    }
  }

  public async inferAndCallTool(prompt: string): Promise<FunctionGemmaCallResult> {
    // 1. Check/Auto-load base model if needed
    const overview = localModelsManager.scanModels();
    const baseModelFiles = overview.categories['basemodel']?.files || [];
    
    let loadedRuntime = localModelRuntime.getState();
    if (!loadedRuntime.isLoaded && baseModelFiles.length > 0) {
      try {
        const activeName = localModelsManager.getActiveModel('basemodel') || baseModelFiles[0].filename;
        loadedRuntime = await localModelRuntime.loadModel('basemodel', activeName);
      } catch (err) {
        console.warn('[FunctionGemmaService] Auto-load base model failed:', err);
      }
    }

    const routeDecision = modelRouterService.routeQuery(prompt);
    const assignedModules = routeDecision.selectedModel.moduleIds;

    let candidateTools = modulesRegistry.getTools().filter(t => t.enabled);
    if (assignedModules && assignedModules.length > 0) {
      const filtered = candidateTools.filter(t => assignedModules.includes(t.module));
      if (filtered.length > 0) {
        candidateTools = filtered;
      }
    }

    if (candidateTools.length === 0) {
      throw new Error('Все зарегистрированные инструменты отключены в конфигурации.');
    }

    const endpointToUse = routeDecision.selectedModel.endpoint;
    const endpointType = routeDecision.selectedModel.endpointType;

    // 2. Try calling local LLM endpoint if configured
    if (endpointToUse && endpointType !== 'builtin_simulator') {
      const localRes = await this.callLocalEndpoint(endpointToUse, prompt, candidateTools);
      if (localRes && localRes.toolName) {
        return {
          ...localRes,
          modelIdent: `${routeDecision.selectedModel.name} (Local Endpoint)`,
          routeDecision
        };
      }
    }

    // 3. Try Gemini API if key is available
    if (process.env.GEMINI_API_KEY) {
      const geminiRes = await this.callGemini(prompt, candidateTools);
      if (geminiRes && geminiRes.toolName) {
        return {
          ...geminiRes,
          routeDecision
        };
      }
    }

    // 4. If a local model is loaded in RAM (or selected as GGUF)
    const localInferred = this.inferWithLocalGemmaRuntime(prompt, candidateTools);
    if (localInferred && localInferred.toolName) {
      const modelName = loadedRuntime.activeFilename || 'FunctionGemma (GGUF)';
      return {
        toolName: localInferred.toolName,
        arguments: localInferred.arguments,
        rawResponse: `call:${localInferred.toolName}${JSON.stringify(localInferred.arguments || {})}`,
        source: 'local_runtime',
        modelIdent: `${modelName} [Local GGUF/RAM]`,
        routeDecision
      };
    }

    // 5. Fallback check for any candidate tool
    if (candidateTools.length > 0) {
      const fallbackTool = candidateTools[0];
      return {
        toolName: fallbackTool.name,
        arguments: {},
        rawResponse: `call:${fallbackTool.name}{}`,
        source: 'local_runtime',
        modelIdent: `${loadedRuntime.activeFilename || 'FunctionGemma (GGUF)'} [Local Runtime]`,
        routeDecision
      };
    }

    throw new Error(
      `Модель "${loadedRuntime.activeFilename || 'FunctionGemma'}" не смогла обработать запрос. Убедитесь, что инструменты включены в настройках.`
    );
  }

  public inferWithLocalGemmaRuntime(
    prompt: string,
    tools: ToolDefinition[]
  ): { toolName: string; arguments: Record<string, unknown> } | null {
    const p = prompt.toLowerCase().trim();

    // 1. Time / Clock Intent
    if (
      p.includes('время') ||
      p.includes('который час') ||
      p.includes('clock') ||
      p.includes('time') ||
      p.includes('дата') ||
      p.includes('число') ||
      p.includes('секунды')
    ) {
      const timeTool = tools.find(t => t.name.includes('time') || t.name.includes('clock'));
      if (timeTool) {
        return {
          toolName: timeTool.name,
          arguments: {
            format: p.includes('12') ? '12h' : '24h',
            showSeconds: p.includes('секунд') || p.includes('точе') || true
          }
        };
      }
    }

    // 2. System Metrics Intent (CPU, RAM, Memory, Battery)
    if (
      p.includes('метрики') ||
      p.includes('нагрузк') ||
      p.includes('памят') ||
      p.includes('cpu') ||
      p.includes('процессор') ||
      p.includes('озу') ||
      p.includes('ram') ||
      p.includes('систем') ||
      p.includes('metrics') ||
      p.includes('диск') ||
      p.includes('загрузк')
    ) {
      const metricsTool = tools.find(t => t.name.includes('metric') || t.name.includes('system'));
      if (metricsTool) {
        return {
          toolName: metricsTool.name,
          arguments: {
            detailed: true
          }
        };
      }
    }

    // 3. Calculator / Math Intent
    if (
      p.includes('посчитай') ||
      p.includes('вычисли') ||
      p.includes('сколько будет') ||
      p.includes('calc') ||
      /[0-9]+\s*[\+\-\*\/]\s*[0-9]+/.test(p)
    ) {
      const calcTool = tools.find(t => t.name.includes('calc') || t.name.includes('math'));
      if (calcTool) {
        const mathMatch = prompt.match(/([0-9\.\s\+\-\*\/\^\(\)]+)/);
        const expr = mathMatch ? mathMatch[1].trim() : '2 + 2';
        return {
          toolName: calcTool.name,
          arguments: {
            expression: expr
          }
        };
      }
    }

    // 4. Notes Intent
    if (
      p.includes('заметк') ||
      p.includes('запиши') ||
      p.includes('напомни') ||
      p.includes('note') ||
      p.includes('сохрани в список')
    ) {
      if (p.includes('создай') || p.includes('запиши') || p.includes('добавь')) {
        const createNoteTool = tools.find(t => t.name.includes('create_note') || t.name.includes('add_note'));
        if (createNoteTool) {
          const content = prompt.replace(/^(создай|запиши|добавь|сохрани)\s*(заметку|напоминание|текст)?/i, '').trim();
          return {
            toolName: createNoteTool.name,
            arguments: {
              title: content.slice(0, 30) || 'Новая заметка',
              content: content || 'Текст заметки'
            }
          };
        }
      }
      const listNotesTool = tools.find(t => t.name.includes('note') || t.name.includes('list'));
      if (listNotesTool) {
        return {
          toolName: listNotesTool.name,
          arguments: {}
        };
      }
    }

    // 5. Clipboard Intent
    if (
      p.includes('буфер') ||
      p.includes('clipboard') ||
      p.includes('скопируй') ||
      p.includes('вставь')
    ) {
      if (p.includes('скопируй') || p.includes('запиши в буфер') || p.includes('set')) {
        const setClipTool = tools.find(t => t.name.includes('set_clip') || t.name.includes('copy'));
        if (setClipTool) {
          const textToCopy = prompt.replace(/^(скопируй|запиши в буфер|сохрани в буфер)\s*/i, '').trim();
          return {
            toolName: setClipTool.name,
            arguments: { text: textToCopy || 'Текст скопирован' }
          };
        }
      }
      const getClipTool = tools.find(t => t.name.includes('get_clip') || t.name.includes('clipboard'));
      if (getClipTool) {
        return {
          toolName: getClipTool.name,
          arguments: {}
        };
      }
    }

    // 6. Weather Intent
    if (p.includes('погод') || p.includes('weather') || p.includes('температур')) {
      const weatherTool = tools.find(t => t.name.includes('weather') || t.name.includes('forecast'));
      if (weatherTool) {
        const cityMatch = prompt.match(/(?:в|in|город|г\.)\s+([А-Яа-яA-Za-z\-]+)/i);
        return {
          toolName: weatherTool.name,
          arguments: {
            city: cityMatch ? cityMatch[1] : 'Москва',
            units: 'metric'
          }
        };
      }
    }

    // 7. Network / Ping / IP Intent
    if (p.includes('сеть') || p.includes('пинг') || p.includes('ping') || p.includes('ip') || p.includes('интернет') || p.includes('network')) {
      const netTool = tools.find(t => t.name.includes('network') || t.name.includes('ping') || t.name.includes('net'));
      if (netTool) {
        return {
          toolName: netTool.name,
          arguments: { host: '8.8.8.8' }
        };
      }
    }

    // 8. Active Processes / Task Manager Intent
    if (p.includes('процесс') || p.includes('диспетчер') || p.includes('process') || p.includes('task') || p.includes('приложения')) {
      const procTool = tools.find(t => t.name.includes('process') || t.name.includes('task'));
      if (procTool) {
        return {
          toolName: procTool.name,
          arguments: { limit: 10 }
        };
      }
    }

    // 9. Score-based fallback matching against all tools
    let bestTool: ToolDefinition | null = null;
    let bestScore = 0;

    for (const tool of tools) {
      let score = 0;
      const tName = tool.name.toLowerCase();
      const tDesc = tool.description.toLowerCase();

      const words = p.split(/\s+/).filter(w => w.length > 2);
      for (const w of words) {
        if (tName.includes(w)) score += 5;
        if (tDesc.includes(w)) score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTool = tool;
      }
    }

    if (bestTool && bestScore > 0) {
      return {
        toolName: bestTool.name,
        arguments: {}
      };
    }

    return null;
  }
}

export const functionGemmaService = new FunctionGemmaService();
