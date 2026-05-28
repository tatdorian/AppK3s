import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';

interface Props {
  appId: string;
  pod: string;
  container?: string;
}

type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error';

export function WebTerminal({ appId, pod, container }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connState, setConnState] = useState<ConnState>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
  }

  function connect() {
    if (!termRef.current) return;
    setConnState('connecting');
    setErrorMsg('');

    // Dispose and clean up existing terminal instance + DOM
    if (termInstance.current) {
      termInstance.current.dispose();
      termInstance.current = null;
    }
    // Clear stale xterm DOM elements
    termRef.current.innerHTML = '';

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", Menlo, Monaco, monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#94a3b8',
        selectionBackground: '#334155',
        black: '#1e293b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#34d399',
        white: '#e2e8f0',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);

    // Fit après que le DOM soit peint (RAF évite les dimensions à 0)
    requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });

    termInstance.current = term;
    fitAddon.current = fit;

    const token = localStorage.getItem('token') ?? '';
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;

    const containerParam = container ? `&container=${encodeURIComponent(container)}` : '';
    const url = `${proto}://${host}/api/apps/${appId}/terminal?token=${token}&pod=${encodeURIComponent(pod)}${containerParam}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnState('connected');
      term.writeln('\x1b[1;32mConnecté au pod : \x1b[0;36m' + pod + '\x1b[0m');
      term.writeln('');
      term.focus();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type: 'data' | 'error' | 'exit';
          data: string;
        };

        if (msg.type === 'data') {
          term.write(msg.data);
        } else if (msg.type === 'error') {
          term.writeln(`\x1b[1;31mErreur : ${msg.data}\x1b[0m`);
          setConnState('error');
          setErrorMsg(msg.data);
        } else if (msg.type === 'exit') {
          term.writeln(`\r\n\x1b[1;33mSession terminée (${msg.data})\x1b[0m`);
          setConnState('disconnected');
        }
      } catch {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      setConnState((prev) => (prev === 'connected' ? 'disconnected' : prev));
    };

    ws.onerror = () => {
      setConnState('error');
      setErrorMsg('Connexion WebSocket échouée');
    };

    // Envoie la frappe (y compris Tab) au backend
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }),
          );
        }
      });
    });

    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      disconnect();
      termInstance.current?.dispose();
      termInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, pod, container]);

  return (
    <div className="relative w-full h-full min-h-[400px] bg-[#0f172a] rounded-lg overflow-hidden border border-slate-700/50">
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-100 border-b border-slate-700/40 text-xs">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connState === 'connected'
                ? 'bg-green-400'
                : connState === 'connecting'
                ? 'bg-blue-400 animate-pulse'
                : 'bg-red-400'
            }`}
          />
          <span className="text-slate-400">
            {connState === 'connected' && `Connecté — ${pod}`}
            {connState === 'connecting' && 'Connexion en cours…'}
            {connState === 'disconnected' && 'Déconnecté'}
            {connState === 'error' && `Erreur : ${errorMsg}`}
          </span>
        </div>
        {(connState === 'disconnected' || connState === 'error') && (
          <button
            className="flex items-center gap-1 text-accent hover:text-blue-300 text-xs"
            onClick={() => {
              disconnect();
              connect();
            }}
          >
            <RefreshCw className="w-3 h-3" /> Reconnecter
          </button>
        )}
      </div>

      {/* Terminal container — tabIndex permet la mise au point clavier */}
      <div
        ref={termRef}
        className="w-full outline-none"
        style={{ height: 'calc(100% - 32px)', padding: '8px' }}
        tabIndex={0}
        onFocus={() => termInstance.current?.focus()}
      />

      {/* Overlay connecting */}
      {connState === 'connecting' && (
        <div className="absolute inset-0 bg-[#0f172a]/80 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">Connexion à {pod}…</span>
          </div>
        </div>
      )}

      {/* Overlay disconnected */}
      {connState === 'disconnected' && (
        <div className="absolute inset-0 bg-[#0f172a]/70 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <WifiOff className="w-8 h-8" />
            <span className="text-sm">Session terminée</span>
            <button
              className="btn-primary text-sm"
              onClick={() => {
                disconnect();
                connect();
              }}
            >
              <RefreshCw className="w-4 h-4" /> Reconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
