"use client";

import { useEffect, useState } from "react";
import type { Autor, Cambio, Controlador, Molecula, Operacion } from "@/lib/protomolecula/tipos";
import { PanelParametros } from "./panel-parametros";
import { BarraDictado } from "./barra-dictado";
import { describirCambio } from "@/lib/protomolecula/parametros";
import { useMolecula } from "./use-molecula";

export interface PanelProtomoleculaProps {
  controlador: Controlador;
  autor: Autor;
  compacto?: boolean;
}

export function PanelProtomolecula({ controlador, autor, compacto = false }: PanelProtomoleculaProps) {
  const [estado, setEstado] = useState<any>(null);
  useEffect(() => controlador.suscribir(setEstado), [controlador]);

  if (compacto) {
    return (
      <div>
        <h3>{estado?.titulo || "Sin título"}</h3>
        <BarraDictado autor={autor} onResultado={async (r) => r.ok && await controlador.mover(r.operacion)} />
      </div>
    );
  }

  return (
    <div>
      <div>
        <h2>{estado?.titulo || "Sin título"}</h2>
        <div>
          {/* Menú de herramientas - simplificado */}
          <button>Añadir herramienta</button>
        </div>
      </div>

      <div>
        {/* Panel de parámetros */}
        {estado && <PanelParametros valores={estado.molecula.valores} autor={autor} alOperar={(op) => controlador.mover(op)} />}
        
        {/* Barra de dictado */}
        <BarraDictado autor={autor} onResultado={async (r) => r.ok && await controlador.mover(r.operacion)} />
        
        {/* Historial simplificado */}
        <div>
          <h3>Historial</h3>
          <div>
            <button onClick={() => {/* Deshacer */}} disabled={!estado?.historial?.length}>Deshacer</button>
            <button onClick={() => {/* Rehacer */}} disabled={!estado?.historial?.length}>Rehacer</button>
          </div>
          {estado?.historial?.map((h, i) => (
            <div key={i}>
              <p>{describirCambio(h.operacion)}</p>
              <small>{h.antes} → {h.despues}</small>
            </div>
          ))}
        </div>
        
        {/* Aviso de salud */}
        {estado?.avisoSalud && <div><strong>AVISO_SALUD:</strong> {estado?.avisoSalud}</div>}
      </div>
    </div>
  );
}

export function PanelProtomoleculaAutonomo({ compacto = false, moleculaId }: { compacto?: boolean; moleculaId?: string }) {
  const { controlador, autor } = useMolecula({ moleculaId });
  return <PanelProtomolecula controlador={controlador} autor={autor} compacto={compacto} />;
}
// Integración: F0H (widget), F0I (app), F0L (orbe), F1B, F2I y F2J lo montan; la verificación en localhost la hace F0I.