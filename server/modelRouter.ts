export interface ModelCluster {
  id: string;
  name: string;
  endpoint: string;
  endpointType: 'local_ollama' | 'local_vllm' | 'custom_endpoint' | 'builtin_simulator';
  description: string;
  moduleIds: string[];
  keywords: string[];
  isDefault: boolean;
  active: boolean;
}

export interface RouteDecision {
  selectedModel: ModelCluster;
  reason: string;
  confidence: number;
  allScores: { modelId: string; modelName: string; score: number }[];
}

class ModelRouterService {
  private clusters: ModelCluster[] = [
    {
      id: 'cluster-sysadmin',
      name: 'FunctionGemma-SysAdmin',
      endpoint: 'http://localhost:11434',
      endpointType: 'builtin_simulator',
      description: 'Системный мониторинг, метрики CPU/RAM, процессы и терминальные команды',
      moduleIds: ['system', 'developer'],
      keywords: ['cpu', 'процессор', 'память', 'ram', 'нагрузка', 'метрика', 'процесс', 'терминал', 'bash', 'node', 'uptime', 'kill'],
      isDefault: false,
      active: true
    },
    {
      id: 'cluster-workspace',
      name: 'FunctionGemma-Workspace',
      endpoint: 'http://localhost:11434',
      endpointType: 'builtin_simulator',
      description: 'Управление файлами, локальным хранилищем, базой заметок и буфером обмена',
      moduleIds: ['notes', 'files', 'storage', 'search'],
      keywords: ['файл', 'директория', 'заметка', 'поиск', 'буфер', 'clipboard', 'хранилище', 'storage', 'папка', 'сохрани'],
      isDefault: false,
      active: true
    },
    {
      id: 'cluster-general',
      name: 'FunctionGemma-General (Default)',
      endpoint: 'http://localhost:11434',
      endpointType: 'builtin_simulator',
      description: 'Универсальная модель с полным реестром модулей (время, вычисления, система, заметки)',
      moduleIds: ['time', 'system', 'calc', 'notes', 'browser', 'developer', 'files', 'storage', 'search'],
      keywords: ['время', 'час', 'дата', 'секунд', 'посчитай', 'вычисли', 'что такое', 'найди', 'поищи', 'как', 'помощь', 'информация'],
      isDefault: true,
      active: true
    }
  ];

  private autoRoutingEnabled: boolean = true;

  public getClusters(): ModelCluster[] {
    return this.clusters;
  }

  public isAutoRoutingEnabled(): boolean {
    return this.autoRoutingEnabled;
  }

  public setAutoRouting(enabled: boolean) {
    this.autoRoutingEnabled = enabled;
  }

  public setDefaultModel(id: string): boolean {
    const found = this.clusters.find(c => c.id === id);
    if (!found) return false;
    for (const c of this.clusters) {
      c.isDefault = c.id === id;
    }
    return true;
  }

  public updateCluster(updated: ModelCluster): ModelCluster {
    const index = this.clusters.findIndex(c => c.id === updated.id);
    if (index >= 0) {
      this.clusters[index] = updated;
    } else {
      this.clusters.push(updated);
    }
    return updated;
  }

  public deleteCluster(id: string): boolean {
    if (this.clusters.length <= 1) return false;
    this.clusters = this.clusters.filter(c => c.id !== id);
    if (!this.clusters.some(c => c.isDefault)) {
      this.clusters[0].isDefault = true;
    }
    return true;
  }

  public getDefaultModel(): ModelCluster {
    return this.clusters.find(c => c.isDefault && c.active) || this.clusters[0];
  }

  /**
   * Evaluates query similarity against cluster keywords & module descriptions.
   * Calculates similarity score (0 to 1) based on token overlap and intent matching.
   */
  public routeQuery(prompt: string): RouteDecision {
    const defaultModel = this.getDefaultModel();
    if (!this.autoRoutingEnabled) {
      return {
        selectedModel: defaultModel,
        reason: 'Выбрана модель по умолчанию (автомаршрутизация отключена)',
        confidence: 1.0,
        allScores: this.clusters.map(c => ({
          modelId: c.id,
          modelName: c.name,
          score: c.id === defaultModel.id ? 1.0 : 0.0
        }))
      };
    }

    const tokens = prompt.toLowerCase().replace(/[^\w\sа-яА-ЯёЁ]/gi, ' ').split(/\s+/).filter(Boolean);
    const scores = this.clusters.map(cluster => {
      if (!cluster.active) return { modelId: cluster.id, modelName: cluster.name, score: 0 };

      let matchCount = 0;
      for (const token of tokens) {
        // Keyword match
        for (const kw of cluster.keywords) {
          if (token.includes(kw) || kw.includes(token)) {
            matchCount += 2;
          }
        }
        // Description match
        if (cluster.description.toLowerCase().includes(token)) {
          matchCount += 1;
        }
      }

      // If default, give slight tie-breaker weight
      const bonus = cluster.isDefault ? 0.5 : 0;
      const normalizedScore = Math.min(1.0, (matchCount + bonus) / Math.max(1, tokens.length * 1.8));

      return {
        modelId: cluster.id,
        modelName: cluster.name,
        score: parseFloat(normalizedScore.toFixed(3))
      };
    });

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];

    if (top && top.score > 0.25) {
      const best = this.clusters.find(c => c.id === top.modelId)!;
      return {
        selectedModel: best,
        reason: `Спектральное совпадение запроса с кластером модулей (${best.moduleIds.join(', ')})`,
        confidence: top.score,
        allScores: scores
      };
    }

    return {
      selectedModel: defaultModel,
      reason: 'Специфический кластер не обнаружен; использована модель по умолчанию',
      confidence: 0.5,
      allScores: scores
    };
  }
}

export const modelRouterService = new ModelRouterService();
