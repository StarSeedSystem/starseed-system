import React, { useState } from "react";

export interface PaqueteIdioma {
  id: string;
  nombre: string;
  tamanoMB: number;
  descargado: boolean;
  verificado: boolean;
}

interface Props {
  paquetes: PaqueteIdioma[];
  espacioUsadoMB: number;
  capacidadTotalMB: number;
  esPersistente: boolean;
  onDescargar: (id: string) => void;
  onQuitar: (id: string) => void;
  onCancelar: (id: string) => void;
}

export const GestorPaquetes: React.FC<Props> = ({
  paquetes,
  espacioUsadoMB,
  capacidadTotalMB,
  esPersistente,
  onDescargar,
  onQuitar,
  onCancelar,
}) => {
  // TODO: Implementar barra de progreso cuando el estado de descarga sea activo
  return (
    <div className="space-y-4">
      <div className="text-sm">
        Usado {espacioUsadoMB} MB de {capacidadTotalMB} MB
      </div>
      {!esPersistente && <div className="text-xs text-amber-600">Se perderá al cerrar</div>}
      <ul className="space-y-2">
        {paquetes.map((p) => (
          <li key={p.id} className="flex justify-between items-center p-2 border rounded">
            <div>
              <div>{p.nombre} ({p.tamanoMB} MB) {!p.verificado && <span className="text-xs text-red-500">(Sin verificar)</span>}</div>
            </div>
            {p.descargado ? (
              <button onClick={() => { if(window.confirm("¿Seguro que desea quitar este paquete?")) onQuitar(p.id); }} className="cursor-pointer text-red-600">Quitar</button>
            ) : (
              <button onClick={() => { if(!p.verificado && !window.confirm("Este paquete no está verificado, ¿descargar de todas formas?")) return; onDescargar(p.id); }} className="cursor-pointer text-blue-600">Descargar</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
