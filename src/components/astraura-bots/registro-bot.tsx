import React from 'react';
import { History } from 'lucide-react';
import type { EntradaRegistro } from '@/lib/astraura-bots/bucle';

interface RegistroBotProps {
  entradas: EntradaRegistro[];
  onDeshacer: (at: number) => void;
}

export function RegistroBot({ entradas, onDeshacer }: RegistroBotProps) {
  return (
    <div className="text-sm p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4" />
        <span className="font-medium text-slate-900">Registro</span>
      </div>
      <div className="space-y-2">
        {entradas.map((e, i) => (
          <div key={`${e.at}-${i}`} className="text-xs text-slate-600 border-b border-slate-100 pb-1">
            <div className="flex justify-between">
              <span>{new Date(e.at).toLocaleTimeString()} · {e.quien} · {e.tipo}</span>
              {i === entradas.length - 1 && e.tipo === 'aplicada' && (
                <button onClick={() => onDeshacer(e.at)} className="text-blue-600 cursor-pointer">Deshacer</button>
              )}
            </div>
            <p className="text-slate-500">{e.motivo}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
