"use client";

import { useEffect, useState } from "react";
import type { Autor, Cambio, Controlador, Molecula, Operacion } from "@/lib/protomolecula/tipos";
import type { Controlador } from "@/lib/protomolecula/controlador";
import { PanelParametros } from "./panel-parametros";
import { BarraDictado } from "./barra-dictado";
import { describirCambio } from "@/lib/protomolecula/parametros";
import { useMolecula } from "./use-molecula";
import { candidatosDe } from "@/lib/protomolecula/registro-atomos";

export interface PanelProtomoleculaProps {
  controlador: Controlador;
  autor: Autor;
  compacto?: boolean;
}

export function PanelProtomolecula({ controlador, autor, compacto = false }: PanelProtomoleculaProps) {
  if (!controlador) {
    return null;
  }
  const [estado, setEstado] = useState<ReturnType<Controlador['obtener']> | null>(null);
  useEffect(() => controlador.suscribir(setEstado), [controlador]);

  if (compacto) {
    return (
      <div>
        <h3>{estado?.molecula.titulo || "Sin título"}</h3>
        <BarraDictado 
          alDictar={(frase) => {
            const resultado = controlador.dictar(frase, autor, "dictado");
            // Devolver solo los resultados para que la barra los muestre
            return resultado.resultados;
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div>
        <h2>{estado?.molecula.titulo || "Sin título"}</h2>
        <div>
          {/* Menú de herramientas - simplificado */}
          <button>Añadir herramienta</button>
        </div>
      </div>

      <div>
        {/* Panel de parámetros */}
        {estado && (
          <PanelParametros 
            valores={estado.molecula.valores} 
            autor={autor} 
            alOperar={(op) => controlador.mover(op)}
            candidatos={candidatosDe(estado.molecula)}
          />
        )}
        
        {/* Barra de dictado */}
        <BarraDictado 
          alDictar={(frase) => {
            const resultado = controlador.dictar(frase, autor, "dictado");
            return resultado.resultados;
          }}
        />
        
        {/* Historial simplificado */}
        <div>
          <h3>Historial</h3>
          <div>
            <button onClick={() => {/* Deshacer */}} disabled={!estado?.historial?.hechos?.length}>Deshacer</button>
            <button onClick={() => {/* Rehacer */}} disabled={!estado?.historial?.rehacer?.length}>Rehacer</button>
          </div>
          {estado?.historial?.hechos?.map((h, i) => {
            const molecula = estado.molecula;
            const candidatos = candidatosDe(molecula);
            const candidato = candidatos.find(c => 
              c.ref.atomoId === h.operacion.objetivo.atomoId && 
              c.ref.parametroId === h.operacion.objetivo.parametroId
            );
            const parametro = candidato?.parametro;
            if (!parametro) {
              return null; // Skip if we can't find the parametro
            }
            return (
              <div key={i}>
                <p>{describirCambio(parametro, h)}</p>
                <small>{h.antes} → {h.despues}</small>
              </div>
            );
          })}
          {estado?.historial?.rehacer?.map((h, i) => {
            const molecula = estado.molecula;
            const candidatos = candidatosDe(molecula);
            const candidato = candidatos.find(c => 
              c.ref.atomoId === h.operacion.objetivo.atomoId && 
              c.ref.parametroId === h.operacion.objetivo.parametroId
            );
            const parametro = candidato?.parametro;
            if (!parametro) {
              return null;
            }
            return (
              <div key={i + "_" + estado?.historial?.hechos?.length}>
                <p>{describirCambio(parametro, h)} (rehacer)</p>
                <small>{h.antes} → {h.despues}</small>
              </div
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PanelProtomoleculaAutonomo({ compacto = false, moleculaId }: { compacto?: boolean; moleculaId?: string }) {
  const { controlador, autor } = useMolecula({ moleculaId });
  if (!controlador) {
    return null;
  }
  return <PanelProtomolecula controlador={controlador} autor={autor} compacto={compacto} />;
}
// Integración: F0H (widget), F0I (app), F0L (orbe), F1B, F2I y F2J lo montan; la verificación en localhost la hace F0I.