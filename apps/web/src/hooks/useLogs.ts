import { useState, useEffect, useRef } from 'react';
import { createLogStream } from '../lib/api.js';

export function useLogs(appId: string, enabled = true) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ws = createLogStream(appId, (line) => {
      setLines((prev) => [...prev.slice(-2000), line]); // keep last 2000 lines
    });

    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [appId, enabled]);

  const clear = () => setLines([]);

  return { lines, connected, clear };
}
