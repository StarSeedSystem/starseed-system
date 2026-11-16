import { useState } from 'react';

// Tipos base para el componente
export interface Turno {
  emisor: 'usuario' | 'astraura';
  texto: string;
  ts: number;
}

export interface PropsDiseno {
  hilo: Turno[];
  preguntar: () => void;
  estado: string;
}

// TODO: Integrar con ASTRAURA_FORMA y hacetCuanto una vez estén disponibles las dependencias
export function DisenoConversacion({ hilo, preguntar, estado }: PropsDiseno) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-purple-500 rounded-full" />
        <span className="text-sm font-medium">{estado}</span>
      </div>

      <div className="flex-1">
        {hilo.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aún no habéis hablado. Pregúntale lo que quieras.
          </p>
        ) : (
          <ol className="space-y-2">
            {hilo.slice(-3).map((turno, i) => (
              <li key={i} className="text-sm">
                <span className="font-bold text-xs uppercase opacity-70">
                  {turno.emisor === 'usuario' ? 'Tú' : 'Astraura'}
                </span>
                <p className="truncate" title={turno.texto}>
                  {turno.texto}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <button 
        onClick={preguntar}
        className="w-full bg-primary text-primary-foreground py-2 rounded-md hover:opacity-90"
      >
        Preguntar
      </button>
    </div>
  );
}
