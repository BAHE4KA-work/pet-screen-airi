import { ExecutionLog, AccuracyRating } from '../src/types';
import crypto from 'crypto';

class LoggerService {
  private logs: ExecutionLog[] = [];
  private maxLogs: number = 1000;

  constructor() {
    this.seedInitialLogs();
  }

  private seedInitialLogs() {
    // Add a couple of initial realistic historical entries for immediate analysis
    this.logs.push(
      {
        id: crypto.randomUUID(),
        timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        prompt: 'Какая сейчас загрузка процессора и сколько свободной памяти?',
        modelName: 'FunctionGemma-7b-Tools-v2.1',
        toolCalled: 'get_metrics',
        toolArguments: { include_memory_breakdown: true },
        toolResult: {
          status: 'online',
          cpu: { model: 'Generic x86_64', cores: 8, estimatedUsagePercent: 24 },
          memory: { totalMb: 16384, freeMb: 9420, usagePercent: '42%' }
        },
        status: 'SUCCESS',
        durationMs: 84,
        accuracyRating: 'EXACT',
        userFeedbackNote: 'Точный вызов нужного инструмента с правильным флагом памяти.',
        criticalSumMatched: true
      },
      {
        id: crypto.randomUUID(),
        timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        prompt: 'Найди мне все запущенные процессы браузера и редактора',
        modelName: 'FunctionGemma-7b-Tools-v2.1',
        toolCalled: 'manage_processes',
        toolArguments: { filter_name: 'chrome', limit: 5 },
        toolResult: {
          matchedCount: 1,
          processes: [{ pid: 4892, name: 'chrome-browser', cpuPercent: 8.5, memMb: 1120 }]
        },
        status: 'SUCCESS',
        durationMs: 46,
        accuracyRating: 'EXACT',
        userFeedbackNote: 'Верный фильтр. Можно также добавить комбинированный regex.',
        criticalSumMatched: true
      }
    );
  }

  public addLog(entry: Omit<ExecutionLog, 'id'>): ExecutionLog {
    const log: ExecutionLog = {
      id: crypto.randomUUID(),
      ...entry
    };
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    return log;
  }

  public getLogs(filter?: { tool?: string; status?: string; rating?: string }): ExecutionLog[] {
    let result = [...this.logs];
    if (filter?.tool) {
      result = result.filter(l => l.toolCalled === filter.tool);
    }
    if (filter?.status) {
      result = result.filter(l => l.status === filter.status);
    }
    if (filter?.rating && filter.rating !== 'ALL') {
      result = result.filter(l => l.accuracyRating === filter.rating);
    }
    return result;
  }

  public updateAccuracy(id: string, rating: AccuracyRating, note?: string): ExecutionLog | null {
    const log = this.logs.find(l => l.id === id);
    if (!log) return null;
    log.accuracyRating = rating;
    if (note !== undefined) {
      log.userFeedbackNote = note;
    }
    return log;
  }

  public clearLogs() {
    this.logs = [];
  }

  public exportDataset(format: 'json' | 'jsonl' = 'json'): string {
    if (format === 'jsonl') {
      // Format as FunctionGemma conversational fine-tuning JSON lines
      return this.logs
        .map(l => {
          const sample = {
            messages: [
              { role: 'user', content: l.prompt },
              {
                role: 'model',
                content: l.toolCalled
                  ? `<start_of_turn>model\ncall:${l.toolCalled}${JSON.stringify(l.toolArguments || {})}<end_of_turn>`
                  : l.errorMessage || 'No tool call'
              }
            ],
            metadata: {
              timestamp: l.timestamp,
              accuracy: l.accuracyRating,
              note: l.userFeedbackNote
            }
          };
          return JSON.stringify(sample);
        })
        .join('\n');
    }
    return JSON.stringify(this.logs, null, 2);
  }

  public getAccuracyStats() {
    const total = this.logs.length;
    const exact = this.logs.filter(l => l.accuracyRating === 'EXACT').length;
    const hallucinated = this.logs.filter(l => l.accuracyRating === 'HALLUCINATED_ARGS').length;
    const wrongTool = this.logs.filter(l => l.accuracyRating === 'WRONG_TOOL').length;
    const failed = this.logs.filter(l => l.status === 'ERROR' || l.accuracyRating === 'FAILED').length;
    const unrated = this.logs.filter(l => l.accuracyRating === 'UNRATED').length;

    const ratedCount = total - unrated;
    const accuracyPercent = ratedCount > 0 ? Math.round((exact / ratedCount) * 100) : 100;

    return {
      total,
      exact,
      hallucinated,
      wrongTool,
      failed,
      unrated,
      accuracyPercent
    };
  }
}

export const loggerService = new LoggerService();
