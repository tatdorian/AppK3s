import { useEffect, useRef } from 'react';
import { Wifi, WifiOff, Trash2 } from 'lucide-react';
import { useLogs } from '../hooks/useLogs.js';
import { cn } from '../lib/utils.js';

interface Props {
  appId: string;
}

export function LogsViewer({ appId }: Props) {
  const { lines, connected, clear } = useLogs(appId, true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50 bg-surface-200">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {connected ? (
            <><Wifi className="w-3.5 h-3.5 text-emerald-400" /> Live</>
          ) : (
            <><WifiOff className="w-3.5 h-3.5 text-slate-500" /> Disconnected</>
          )}
          <span className="text-slate-600">·</span>
          <span>{lines.length} lines</span>
        </div>
        <button
          onClick={clear}
          className="btn-ghost text-xs py-1 px-2 h-auto"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto bg-surface p-4 font-mono text-xs text-slate-300 leading-5">
        {lines.length === 0 ? (
          <p className="text-slate-600 italic">Waiting for logs...</p>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                'whitespace-pre-wrap break-all',
                line.includes('ERROR') || line.includes('error') ? 'text-red-400' : '',
                line.includes('WARN') || line.includes('warning') ? 'text-yellow-400' : '',
              )}
            >
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
