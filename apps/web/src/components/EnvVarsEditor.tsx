import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { EnvVar } from '@appk3s/shared';

interface Props {
  value: EnvVar[];
  onChange: (vars: EnvVar[]) => void;
}

export function EnvVarsEditor({ value, onChange }: Props) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const add = () => {
    if (!newKey.trim()) return;
    onChange([...value, { key: newKey.trim(), value: newVal }]);
    setNewKey('');
    setNewVal('');
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const update = (i: number, field: 'key' | 'value', v: string) => {
    const next = [...value];
    next[i] = { ...next[i], [field]: v };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.map((ev, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            className="input font-mono text-xs flex-1"
            value={ev.key}
            placeholder="KEY"
            onChange={(e) => update(i, 'key', e.target.value)}
          />
          <span className="text-slate-500 text-sm">=</span>
          <input
            className="input font-mono text-xs flex-1"
            value={ev.value}
            placeholder="value"
            onChange={(e) => update(i, 'value', e.target.value)}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="btn-danger p-2 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* New row */}
      <div className="flex gap-2 items-center">
        <input
          className="input font-mono text-xs flex-1"
          value={newKey}
          placeholder="NEW_KEY"
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <span className="text-slate-500 text-sm">=</span>
        <input
          className="input font-mono text-xs flex-1"
          value={newVal}
          placeholder="value"
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button type="button" onClick={add} className="btn-primary p-2 shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
