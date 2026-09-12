import { GoogleGenAI } from '@google/genai';
import { modulesRegistry } from './modulesRegistry';
import { modelRouterService, RouteDecision } from './modelRouter';
import { ToolDefinition } from '../src/types';

export interface FunctionGemmaCallResult {
  toolName?: string;
  arguments?: Record<string, unknown>;
  rawResponse: string;
  source: 'local_endpoint' | 'builtin_engine' | 'gemini_fallback';
  modelIdent: string;
  routeDecision?: RouteDecision;
}

class FunctionGemmaService {
  private geminiClient: GoogleGenAI | null = null;

  private getGeminiClient(): GoogleGenAI | null {
    if (!this.geminiClient && process.env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return this.geminiClient;
  }

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
      let rawArgs = callMatch[2];
      try {
        // Fix non-standard json like {param="value"} or unquoted keys
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

      // Support Ollama format or OpenAI-compatible format
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

  // Built-in intelligent FunctionGemma simulator matching user intents to registered tool signatures
  public async simulateFunctionGemma(
    prompt: string,
    activeTools: ToolDefinition[]
  ): Promise<FunctionGemmaCallResult> {
    const p = prompt.toLowerCase();

    // 0. Time and Date (get_current_time)
    if (
      p.includes('врем') ||
      p.includes('time') ||
      p.includes('час') ||
      p.includes('date') ||
      p.includes('дат') ||
      p.includes('день недели') ||
      p.includes('секунд') ||
      p.includes('clock') ||
      p.includes('таймзон')
    ) {
      const tool = activeTools.find(t => t.name === 'get_current_time');
      if (tool) {
        return {
          toolName: 'get_current_time',
          arguments: { format: '24h', show_seconds: true },
          rawResponse: '<start_of_turn>model\ncall:get_current_time{"format":"24h","show_seconds":true}<end_of_turn>',
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 0.1 Math and Calculator (evaluate_math)
    if (p.includes('посчитай') || p.includes('вычисли') || p.includes('сколько будет') || p.match(/\d+\s*[\+\-\*\/]\s*\d+/)) {
      const tool = activeTools.find(t => t.name === 'evaluate_math');
      if (tool) {
        const mathMatch = prompt.match(/[\d+\-*/().^ \t]+/);
        const expr = mathMatch ? mathMatch[0].trim() : '2 + 2';
        return {
          toolName: 'evaluate_math',
          arguments: { expression: expr },
          rawResponse: `<start_of_turn>model\ncall:evaluate_math{"expression":"${expr}"}<end_of_turn>`,
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 1. Check system metrics
    if (p.includes('cpu') || p.includes('процессор') || p.includes('памят') || p.includes('нагрузк') || p.includes('метрик') || p.includes('ram') || p.includes('системе')) {
      const tool = activeTools.find(t => t.name === 'get_metrics');
      if (tool) {
        return {
          toolName: 'get_metrics',
          arguments: { include_memory_breakdown: true },
          rawResponse: '<start_of_turn>model\ncall:get_metrics{"include_memory_breakdown":true}<end_of_turn>',
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 2. Process management
    if (p.includes('процесс') || p.includes('process') || p.includes('запущен') || p.includes('pid') || p.includes('kill')) {
      const tool = activeTools.find(t => t.name === 'manage_processes');
      if (tool) {
        let filterName = '';
        if (p.includes('хром') || p.includes('chrome')) filterName = 'chrome';
        else if (p.includes('node')) filterName = 'node';
        else if (p.includes('python')) filterName = 'python';

        return {
          toolName: 'manage_processes',
          arguments: filterName ? { filter_name: filterName, limit: 5 } : { limit: 5 },
          rawResponse: `<start_of_turn>model\ncall:manage_processes{${filterName ? `"filter_name":"${filterName}",` : ''}"limit":5}<end_of_turn>`,
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 3. Clipboard
    if (p.includes('буфер') || p.includes('clipboard') || p.includes('скопируй') || p.includes('вставь')) {
      const tool = activeTools.find(t => t.name === 'clipboard');
      if (tool) {
        const isWrite = p.includes('скопируй') || p.includes('запиши') || p.includes('сохрани в буфер');
        const contentMatch = prompt.match(/['"](.*)['"]/) || prompt.match(/(?:текст|буфер):\s*(.+)$/);
        return {
          toolName: 'clipboard',
          arguments: isWrite ? { action: 'write', content: contentMatch ? contentMatch[1] : 'Привет из FunctionGemma' } : { action: 'read' },
          rawResponse: `<start_of_turn>model\ncall:clipboard{"action":"${isWrite ? 'write' : 'read'}"}<end_of_turn>`,
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 4. File search
    if (p.includes('файл') || p.includes('найди файл') || p.includes('расширен') || p.includes('explorer') || p.includes('.ts') || p.includes('.json')) {
      const tool = activeTools.find(t => t.name === 'file_explorer');
      if (tool) {
        let pattern = '*.ts';
        if (p.includes('json')) pattern = '*.json';
        else if (p.includes('tsx')) pattern = '*.tsx';
        return {
          toolName: 'file_explorer',
          arguments: { pattern },
          rawResponse: `<start_of_turn>model\ncall:file_explorer{"pattern":"${pattern}"}<end_of_turn>`,
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 5. Notes search
    if (p.includes('заметк') || p.includes('note') || p.includes('сниппет') || p.includes('напомни') || p.includes('памятк')) {
      const tool = activeTools.find(t => t.name === 'find_notes');
      if (tool) {
        const words = prompt.replace(/[^\w\sа-яА-Я]/gi, '').split(/\s+/).filter(w => w.length > 3);
        const keyword = words[words.length - 1] || 'gemma';
        return {
          toolName: 'find_notes',
          arguments: { keyword },
          rawResponse: `<start_of_turn>model\ncall:find_notes{"keyword":"${keyword}"}<end_of_turn>`,
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 6. Shell command
    if (p.includes('команд') || p.includes('terminal') || p.includes('терминал') || p.includes('shell') || p.includes('bash') || p.includes('uname') || p.includes('node -v') || p.includes('git status')) {
      const tool = activeTools.find(t => t.name === 'run_command');
      if (tool) {
        let cmd = 'node -v';
        if (p.includes('git')) cmd = 'git status';
        else if (p.includes('uname') || p.includes('система')) cmd = 'uname -a';
        else if (p.includes('date') || p.includes('время')) cmd = 'date';
        return {
          toolName: 'run_command',
          arguments: { command: cmd },
          rawResponse: `<start_of_turn>model\ncall:run_command{"command":"${cmd}"}<end_of_turn>`,
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 7. Storage management
    if (p.includes('storage') || p.includes('хранилищ') || p.includes('сохрани в файл') || p.includes('папк') || p.includes('директори')) {
      const tool = activeTools.find(t => t.name === 'manage_storage');
      if (tool) {
        let action = 'info';
        let filename = '';
        if (p.includes('прочитай') || p.includes('открой')) {
          action = 'read';
          filename = 'notes.json';
        } else if (p.includes('запиши') || p.includes('сохрани')) {
          action = 'write';
          filename = 'quick_note.txt';
        }
        return {
          toolName: 'manage_storage',
          arguments: filename ? { action, filename, content: 'Сохранено через FunctionGemma' } : { action: 'info' },
          rawResponse: `<start_of_turn>model\ncall:manage_storage{"action":"${action}"${filename ? `,"filename":"${filename}"` : ''}}<end_of_turn>`,
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // 8. General search / web lookup
    if (p.includes('найди') || p.includes('поищи') || p.includes('поиск') || p.includes('что такое') || p.includes('search') || p.includes('гугл') || p.includes('информац')) {
      const tool = activeTools.find(t => t.name === 'web_lookup');
      if (tool) {
        const cleanQuery = prompt.replace(/^(найди|поищи|поиск|что такое|search|информация о|информацию о)\s+/i, '').trim();
        return {
          toolName: 'web_lookup',
          arguments: { query: cleanQuery || prompt },
          rawResponse: `<start_of_turn>model\ncall:web_lookup{"query":"${cleanQuery || prompt}"}<end_of_turn>`,
          source: 'builtin_engine',
          modelIdent: 'FunctionGemma-7b (Engine)'
        };
      }
    }

    // Fallback: Check Gemini API if configured
    const client = this.getGeminiClient();
    if (client) {
      try {
        const toolsDesc = activeTools.map(t => `- ${t.name}: ${t.description} (params: ${t.parameters.map(p => p.name).join(', ')})`).join('\n');
        const response = await client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `You are simulating FunctionGemma. The user prompt is: "${prompt}".
Select exactly ONE function from:
${toolsDesc}

Format output strictly as: call:function_name{"param": "value"}`
        });
        const text = response.text || '';
        const parsed = this.parseGemmaResponse(text);
        if (parsed.toolName) {
          return {
            toolName: parsed.toolName,
            arguments: parsed.arguments,
            rawResponse: text,
            source: 'gemini_fallback',
            modelIdent: 'FunctionGemma (Gemini Assisted)'
          };
        }
      } catch {
        // fallback to default
      }
    }

    // Default to web search tool or no match
    const defaultTool = activeTools[0];
    return {
      toolName: defaultTool?.name,
      arguments: { query: prompt },
      rawResponse: `<start_of_turn>model\ncall:${defaultTool?.name || 'none'}{"query":"${prompt}"}<end_of_turn>`,
      source: 'builtin_engine',
      modelIdent: 'FunctionGemma-7b (Engine)'
    };
  }

  public async inferAndCallTool(prompt: string): Promise<FunctionGemmaCallResult> {
    const routeDecision = modelRouterService.routeQuery(prompt);
    const assignedModules = routeDecision.selectedModel.moduleIds;

    let candidateTools = modulesRegistry.getTools().filter(t => t.enabled);
    if (assignedModules && assignedModules.length > 0) {
      const filtered = candidateTools.filter(t => assignedModules.includes(t.module));
      if (filtered.length > 0) {
        candidateTools = filtered;
      }
    }

    const endpointToUse = routeDecision.selectedModel.endpoint;
    const endpointType = routeDecision.selectedModel.endpointType;

    // 1. If local endpoint is set, try calling it
    if (endpointToUse && endpointType !== 'builtin_simulator') {
      const localRes = await this.callLocalEndpoint(endpointToUse, prompt, candidateTools);
      if (localRes && localRes.toolName) {
        return {
          ...localRes,
          modelIdent: `${routeDecision.selectedModel.name} (Local)`,
          routeDecision
        };
      }
    }

    // 2. Use built-in simulation / fallback
    const simRes = await this.simulateFunctionGemma(prompt, candidateTools);
    return {
      ...simRes,
      modelIdent: `${routeDecision.selectedModel.name} (${simRes.source === 'gemini_fallback' ? 'Gemini' : 'Engine'})`,
      routeDecision
    };
  }
}

export const functionGemmaService = new FunctionGemmaService();
