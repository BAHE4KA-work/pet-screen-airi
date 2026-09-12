import { useState, useEffect, useCallback } from 'react';

export interface ServiceHealthStatus {
  name: string;
  status: 'online' | 'ready' | 'connected' | 'offline' | 'error';
  container?: string;
  port?: number;
  engine?: string;
}

export interface MicroservicesHealth {
  gateway: ServiceHealthStatus;
  llm_worker: ServiceHealthStatus;
  stt_worker: ServiceHealthStatus;
  rabbitmq: ServiceHealthStatus;
  postgres: ServiceHealthStatus;
}

export interface LiveServerEvent {
  type: string;
  data: any;
  timestamp: string;
}

export function useServerEvents() {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [services, setServices] = useState<MicroservicesHealth>({
    gateway: { name: 'FastAPI / Gateway', status: 'online', port: 3000 },
    llm_worker: { name: 'LLM Worker (Transformers/GGUF)', status: 'ready', container: 'overlay-llm-worker' },
    stt_worker: { name: 'Voice Worker (Faster-Whisper)', status: 'ready', container: 'overlay-stt-worker' },
    rabbitmq: { name: 'RabbitMQ Message Broker', status: 'connected', port: 5672 },
    postgres: { name: 'PostgreSQL 16 (pgvector)', status: 'ready', port: 5432 }
  });
  const [latestEvent, setLatestEvent] = useState<LiveServerEvent | null>(null);
  const [eventHistory, setEventHistory] = useState<LiveServerEvent[]>([]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            const liveEvent: LiveServerEvent = {
              type: event.type || 'message',
              data: parsed,
              timestamp: parsed.timestamp || new Date().toISOString()
            };
            setLatestEvent(liveEvent);
            setEventHistory(prev => [liveEvent, ...prev.slice(0, 49)]);
          } catch {
            // Ignore raw text
          }
        };

        eventSource.addEventListener('INIT_SNAPSHOT', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data.services) {
              setServices(prev => ({ ...prev, ...data.services }));
            }
          } catch {}
        });

        eventSource.addEventListener('MODEL_STATUS', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            setLatestEvent({ type: 'MODEL_STATUS', data, timestamp: new Date().toISOString() });
          } catch {}
        });

        eventSource.addEventListener('EXECUTION_LOG', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            setLatestEvent({ type: 'EXECUTION_LOG', data, timestamp: new Date().toISOString() });
          } catch {}
        });

        eventSource.onerror = () => {
          setIsConnected(false);
          eventSource?.close();
          // Auto-reconnect after 3s
          reconnectTimeout = setTimeout(connectSSE, 3000);
        };
      } catch (err) {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connectSSE, 5000);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  return {
    isConnected,
    services,
    latestEvent,
    eventHistory
  };
}
