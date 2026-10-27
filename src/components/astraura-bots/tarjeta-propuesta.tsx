import React from 'react';
import { Bot, AlertTriangle, Vote, Clock } from 'lucide-react';
import { IndicadorSentidos } from './indicador-sentidos';
import type { AccionBot } from '@/lib/astraura-bots/acciones';
import type { Decision } from '@/lib/astraura-bots/permisos';
import type { EstadoBucle } from '@/lib/astraura-bots/bucle';
import type { Sentido } from '@/lib/astraura-bots/tipos';

const accionesTexto: Record<string, string> = {
  'abrir-app': 'Abrir aplicación',
  'navegar': 'Navegar a',
  'widget.añadir': 'Añadir widget',
  'widget.mover': 'Mover widget',
  'widget.quitar': 'Quitar widget',
  'pizarra.operar': 'Operar pizarra',
  'dashboard.editar': 'Editar dashboard',
  'escritorio.organizar': 'Organizar escritorio',
  'pagina.editar': 'Editar página',
  'codigo.proponer': 'Proponer código',
  'mensaje.enviar': 'Enviar mensaje',
};

interface TarjetaPropuestaProps {
  accion: AccionBot;
  decision: Decision;
  estado: EstadoBucle;
  onConfirmar: () => void;
  onRechazar: () => void;
  onVotacion: () => void;
  onApagarSentido: (sentido: Sentido) => void;
  onPausarBot: () => void;
}

export function TarjetaPropuesta({ accion, decision, estado, onConfirmar, onRechazar, onVotacion, onApagarSentido, onPausarBot }: TarjetaPropuestaProps) {
  const textoAccion = accionesTexto[accion.tipo] || accion.tipo;
  const riesgo = decision.requiere === 'confirmacion' ? 'alto' : 'bajo';
  
  return (
    <div className="absolute z-50 p-4 bg-zinc-900 border border-zinc-700 rounded-lg shadow-sm w-72 text-white">
      <div className="flex items-center gap-2 mb-2">
        <Bot className="w-5 h-5" />
        <span className="font-medium text-sm">Propuesta del bot</span>
      </div>
      <p className="text-sm mb-1">{textoAccion}</p>
      <p className="text-xs text-zinc-400 mb-3">Por qué: {decision.motivo}</p>
      {riesgo === 'alto' && (
        <div className="flex items-center gap-1 text-red-400 text-xs mb-3">
          <AlertTriangle className="w-4 h-4" />
          <span>Riesgo alto</span>
        </div>
      )}
      <div className="flex gap-2 mb-2">
        <button onClick={onConfirmar} className="flex-1 bg-primary text-white text-xs py-1.5 rounded cursor-pointer">Confirmar</button>
        <button onClick={onRechazar} className="flex-1 bg-muted text-muted-foreground text-xs py-1.5 rounded cursor-pointer">Rechazar</button>
      </div>
      {decision.requiere === 'votacion' && (
        <button onClick={onVotacion} className="w-full mt-2 flex items-center justify-center gap-1 text-primary text-xs py-1.5 cursor-pointer">
          <Vote className="w-3 h-3" /> Llevar a votación
        </button>
      )}
      {decision.requiere === 'consentimiento' || decision.requiere === 'expreso' ? (
        <div className="text-xs text-amber-400 mt-2">
          Requiere consentimiento expreso
        </div>
      ) : null}
      <div className="mt-4 pointer-events-auto">
        <IndicadorSentidos estado={estado} onApagarSentido={onApagarSentido} onPausarBot={onPausarBot} />
      </div>
    </div>
  );
}
