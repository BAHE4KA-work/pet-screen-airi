import { ToolDefinition, ModelTrainingManifest } from '../types';

export interface FineTuningToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<
        string,
        {
          type: string;
          description: string;
          default?: unknown;
        }
      >;
      required: string[];
    };
  };
}

export interface FineTuningDataset {
  format: 'functiongemma-tools-v2.1';
  exportedAt: string;
  checksum: string;
  totalTools: number;
  modelTarget: string;
  systemInstruction: string;
  tools: FineTuningToolSchema[];
  sampleTrainingTurns: {
    messages: {
      role: 'system' | 'user' | 'model';
      content: string;
    }[];
  }[];
}

/**
 * Builds a complete JSON object of all registered tools formatted for
 * fine-tuning FunctionGemma models.
 */
export function buildFineTuningDataset(
  tools: ToolDefinition[],
  checksum: string,
  manifest?: ModelTrainingManifest | null
): FineTuningDataset {
  const activeTools = tools.filter(t => t.enabled);

  const toolsSchemas: FineTuningToolSchema[] = activeTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.parameters.reduce((acc, p) => {
          acc[p.name] = {
            type: p.type,
            description: p.description,
            ...(p.default !== undefined ? { default: p.default } : {})
          };
          return acc;
        }, {} as Record<string, { type: string; description: string; default?: unknown }>),
        required: t.parameters.filter(p => p.required).map(p => p.name)
      }
    }
  }));

  const systemInstruction =
    'You are FunctionGemma, a function calling model. Select appropriate functions to satisfy the user query. Output calls strictly as `call:function_name{"param":"value"}`.';

  // Generate standard conversational training turns for the registered tools
  const sampleTrainingTurns = activeTools.slice(0, 5).map(t => {
    const sampleArgs: Record<string, unknown> = {};
    for (const p of t.parameters) {
      if (p.default !== undefined) sampleArgs[p.name] = p.default;
      else if (p.type === 'string') sampleArgs[p.name] = 'example_' + p.name;
      else if (p.type === 'number') sampleArgs[p.name] = 1;
      else if (p.type === 'boolean') sampleArgs[p.name] = true;
    }

    return {
      messages: [
        {
          role: 'system' as const,
          content: systemInstruction + '\nAvailable Tools:\n' + JSON.stringify(toolsSchemas, null, 2)
        },
        {
          role: 'user' as const,
          content: `Выполни действие с помощью инструмента ${t.name}: ${t.description}`
        },
        {
          role: 'model' as const,
          content: `call:${t.name}${JSON.stringify(sampleArgs)}`
        }
      ]
    };
  });

  return {
    format: 'functiongemma-tools-v2.1',
    exportedAt: new Date().toISOString(),
    checksum,
    totalTools: activeTools.length,
    modelTarget: manifest?.modelName || 'FunctionGemma-7b-Tools',
    systemInstruction,
    tools: toolsSchemas,
    sampleTrainingTurns
  };
}
