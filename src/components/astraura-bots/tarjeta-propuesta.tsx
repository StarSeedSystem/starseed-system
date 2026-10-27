import React from 'react';
import { Bot, AlertTriangle, Vote } from 'lucide-react';

interface BotPropuesta {
  descripcion: string;
  riesgo?: string;
  motivo?: string;
}

interface TarjetaPropuestaProps {
  propuesta: BotPropuesta;
  onConfirmar: () => void;
  onRechazar: () => void;
  onVotacion: () => void;
}

export function TarjetaPropuesta({ propuesta, onConfirmar, onRechazar, onVotacion }: TarjetaPropuestaProps) {
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm w-72">
      <div className="flex items-center gap-2 mb-2">
        <Bot className="w-5 h-5" />
        <span className="font-medium text-sm">Propuesta del bot</span>
      </div>
      <p className="text-sm text-slate-700 mb-3">{propuesta.descripcion}</p>
      {propuesta.riesgo === 'alto' && (
        <div className="flex items-center gap-1 text-red-600 text-xs mb-3">
          <AlertTriangle className="w-4 h-4" />
          <span>Riesgo alto</span>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onConfirmar} className="flex-1 bg-slate-900 text-white text-xs py-1.5 rounded cursor-pointer">Confirmar</button>
        <button onClick={onRechazar} className="flex-1 bg-slate-100 text-slate-700 text-xs py-1.5 rounded cursor-pointer">Rechazar</button>
      </div>
      <button onClick={onVotacion} className="w-full mt-2 flex items-center justify-center gap-1 text-slate-600 text-xs py-1.5 border border-slate-200 rounded cursor-pointer">
        <Vote className="w-3 h-3" /> Llevar a votación
      </button>
    </div>
  );
}
