import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, Trash2, ChevronDown, Server, Clock, ChevronsDown } from 'lucide-react';
import { useLogs, type LogLine } from '../hooks/useLogs.js';
import { cn } from '../lib/utils.js';

interface Props {
  appId: string;
}

function lineColor(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('error') || t.includes('fatal') || t.includes('panic') || t.includes('exception')) return 'text-red-400';
  if (t.includes('warn')) return 'text-yellow-400';
  if (t.includes('info') || t.includes('notice')) return 'text-sky-400';
  if (t.includes('debug') || t.includes('trace')) return 'text-slate-500';
  if (t.includes('[build]') || t.includes('[nixpacks]') || t.includes('[static]')) return 'text-emerald-400';
  return 'text-slate-300';
}

const POD_COLORS = [
  'text-purple-400', 'text-pink-400', 'text-orange-400', 'text-teal-400',
  'text-indigo-400', 'text-cyan-400', 'text-lime-400', 'text-rose-400',
];

export function LogsViewer({ appId }: Props) {
  const { lines, pods, selectedPod, connected, clear, selectPod } = useLogs(appId, true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pod color index map — stable per pod name
  const podColorRef = useRef<Record<string, string>>({});
  const getPodColor = (pod: string) => {
    if (!podColorRef.current[pod]) {
      const idx = Object.keys(podColorRef.current).length % POD_COLORS.length;
      podColorRef.current[pod] = POD_COLORS[idx];
    }
    return podColorRef.current[pod];
  };

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [lines, autoScroll]);

  // Detect manual scroll up → disable auto-scroll
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const multiPod = pods.length > 1;

  const formatTs = (ts: number) => {
    const d = new Date(ts);
    return d.toTimeString().slice(0, 8);
  };

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700/50 bg-surface-200 flex-wrap">
        {/* Connection status */}
        <div className="flex items-center gap-1.5 text-xs shrink-0">
          {connected ? (
            <><Wifi className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400 font-medium">Live</span></>
          ) : (
            <><WifiOff className="w-3.5 h-3.5 text-slate-500" /><span className="text-slate-500">Reconnecting…</span></>
          )}
        </div>

        <span className="text-slate-700 text-xs">·</span>
        <span className="text-xs text-slate-500">{lines.length} lignes</span>

        {/* Pod selector */}
        {pods.length > 0 && (
          <>
            <span className="text-slate-700 text-xs">·</span>
            <div className="flex items-center gap-1.5">
              <Server className="w-3 h-3 text-slate-500 shrink-0" />
              <select
                className="bg-surface-300 border border-slate-700/50 rounded-md text-xs text-slate-300 px-2 py-0.5 focus:outline-none focus:border-accent"
                value={selectedPod ?? ''}
                onChange={(e) => selectPod(e.target.value || null)}
              >
                <option value="">Tous les pods ({pods.length})</option>
                {pods.map((p) => (
                  <option key={p} value={p}>{p.split('-').slice(-2).join('-')}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Timestamps toggle */}
          <button
            onClick={() => setShowTimestamps((v) => !v)}
            className={cn('btn-ghost text-xs py-1 px-2 h-auto flex items-center gap-1', showTimestamps && 'text-accent')}
            title="Afficher les timestamps"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          {/* Auto-scroll button */}
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
              className="btn-ghost text-xs py-1 px-2 h-auto flex items-center gap-1 text-accent"
              title="Défiler vers le bas"
            >
              <ChevronsDown className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Clear */}
          <button onClick={clear} className="btn-ghost text-xs py-1 px-2 h-auto flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" />
            Vider
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-[#0d1117] p-3 font-mono text-xs leading-5"
      >
        {lines.length === 0 ? (
          <p className="text-slate-600 italic pt-2">En attente des logs…</p>
        ) : (
          lines.map((line: LogLine, i) => (
            <div key={i} className="flex items-start gap-2 hover:bg-white/[0.02] rounded px-1 -mx-1 group">
              {showTimestamps && (
                <span className="text-slate-600 shrink-0 select-none">{formatTs(line.ts)}</span>
              )}
              {multiPod && !selectedPod && line.pod && (
                <span className={cn('shrink-0 truncate max-w-[80px] select-none', getPodColor(line.pod))} title={line.pod}>
                  {line.pod.split('-').slice(-2).join('-')}
                </span>
              )}
              <span className={cn('whitespace-pre-wrap break-all flex-1', lineColor(line.text))}>
                {line.text}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
