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

    // 4. If a local model is loaded in RAM
    if (loadedRuntime.isLoaded && loadedRuntime.activeFilename) {
      // Check if local endpoint is active or available
      const localRes = await this.callLocalEndpoint('http://localhost:11434', prompt, candidateTools);
      if (localRes && localRes.toolName) {
        return {
          ...localRes,
          modelIdent: `${loadedRuntime.activeFilename} (Local RAM)`,
          routeDecision
        };
      }
    }

    // 5. No mock data allowed: throw a clean, informative error
    if (baseModelFiles.length === 0 && !process.env.GEMINI_API_KEY) {
      throw new Error(
        'Модель не загружена. В папке models/basemodel/ отсутствуют файлы моделей (.gguf, .safetensors, .bin). Поместите файл модели в папку models/basemodel/ или настройте подключение к локальному серверу/API.'
      );
    }

    throw new Error(
      `Модель "${loadedRuntime.activeFilename || 'FunctionGemma'}" не смогла обработать запрос. Убедитесь, что модель загружена в ОЗУ или запущен локальный сервер инференса.`
    );
  }
}

export const functionGemmaService = new FunctionGemmaService();
