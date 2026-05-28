import { useState, useEffect, useRef, useCallback } from 'react';
import { createLogStream } from '../lib/api.js';

export interface LogLine {
  text: string;
  pod?: string;
  ts: number;
}

interface UseLogsReturn {
  lines: LogLine[];
  pods: string[];
  selectedPod: string | null;
  connected: boolean;
  clear: () => void;
  selectPod: (pod: string | null) => void;
}

const MAX_LINES = 5000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export function useLogs(appId: string, enabled = true): UseLogsReturn {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [pods, setPods] = useState<string[]>([]);
  const [selectedPod, setSelectedPod] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const selectedPodRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  selectedPodRef.current = selectedPod;

  const connect = useCallback(() => {
    if (closedRef.current || !enabled) return;

    const ws = createLogStream(appId, (msg) => {
      if (msg.type === 'log') {
        setLines((prev) => [
          ...prev.slice(-(MAX_LINES - 1)),
          { text: msg.data, pod: msg.pod, ts: Date.now() },
        ]);
      } else if (msg.type === 'pods') {
        try { setPods(JSON.parse(msg.data)); } catch { /* ignore */ }
      }
    });

    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retriesRef.current = 0;
      if (selectedPodRef.current) {
        ws.send(JSON.stringify({ type: 'select-pod', pod: selectedPodRef.current }));
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (!closedRef.current) {
        // Exponential back-off reconnect
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** retriesRef.current, RECONNECT_MAX_MS);
        retriesRef.current += 1;
        retryRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => { ws.close(); };
  }, [appId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    closedRef.current = false;
    connect();

    return () => {
      closedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, enabled]);

  const selectPod = useCallback((pod: string | null) => {
    setSelectedPod(pod);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'select-pod', pod: pod ?? '' }));
    }
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, pods, selectedPod, connected, clear, selectPod };
}
