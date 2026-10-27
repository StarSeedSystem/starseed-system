import React from 'react';
import { History } from 'lucide-react';

interface RegistroEntrada {
  id: string;
  descripcion: string;
  puedeDeshacer?: boolean;
}

interface RegistroBotProps {
  entradas: RegistroEntrada[];
  onDeshacer: (id: string) => void;
}

export function RegistroBot({ entradas, onDeshacer }: RegistroBotProps) {
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4" />
        <span className="font-medium text-slate-900">Historial</span>
      </div>
      <div className="space-y-2">
        {entradas.map((e, i) => (
          <div key={e.id} className="text-xs text-slate-600 border-b border-slate-100 pb-1 flex justify-between">
            <span>{e.descripcion}</span>
            {i === 0 && e.puedeDeshacer && (
              <button onClick={() => onDeshacer(e.id)} className="text-blue-600 cursor-pointer">Deshacer</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
