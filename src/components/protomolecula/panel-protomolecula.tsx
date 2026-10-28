"use client";

/**
 * Protomolécula · PANEL. `PanelProtomolecula` pinta un controlador ya abierto: título y ámbito, estado
 * de guardado, «Añadir herramienta», pendientes de confirmar, dictado, parámetros e historial con
 * Deshacer y Rehacer. `PanelProtomoleculaAutonomo` lo monta en cualquier superficie: abre la sesión con
 * `useMolecula` (que crea, registra y guarda el controlador). `compacto` es la versión del widget del
 * dashboard: sin título, dictado ni historial, pero con «Añadir herramienta», parámetros y pendientes
 * (un widget vacío sin forma de llenarlo sería un callejón sin salida).
 */
import { useState } from "react";

import type { Controlador } from "@/lib/protomolecula/controlador";
import { AVISO_SALUD } from "@/lib/protomolecula/permisos";
import { candidatosDe } from "@/lib/protomolecula/registro-atomos";
import type { EstadoGuardado } from "@/lib/protomolecula/sesion-molecula";
import type { Ambito, Autor } from "@/lib/protomolecula/tipos";

import { BarraDictado } from "./barra-dictado";
import { PanelActividad, hayLecturaSalud } from "./panel-actividad";
import { AnadirHerramienta, ListaPendientes } from "./panel-estructura";
import { PanelMausbot } from "./panel-mausbot";
import { PanelParametros } from "./panel-parametros";
import { useEstadoControl, useMolecula } from "./use-molecula";

const AUTOR_PANEL: Autor = { tipo: "persona", id: "panel" };

const ETIQUETA_AMBITO: Record<Ambito, string> = { personal: "personal", perfil: "perfil", grupo: "grupo", publica: "pública" };
const TEXTO_GUARDADO = { "sin-cambios": "Sin cambios que guardar", guardando: "Guardando…", guardado: "Guardado en este aparato" } as const;

export interface PanelProtomoleculaProps {
  controlador: Controlador;
  /** Quién opera desde este panel; Deshacer solo deshace lo suyo. */
  autor?: Autor;
  compacto?: boolean;
  /** Estado de guardado de la sesión que lo abrió; sin él no se enseña ninguno. */
  guardado?: EstadoGuardado;
}

export function PanelProtomolecula({ controlador: ctl, autor = AUTOR_PANEL, compacto = false, guardado }: PanelProtomoleculaProps) {
  const estado = useEstadoControl(ctl);
  const [aviso, setAviso] = useState<string | null>(null);
  if (!estado) return null;

  return (
    <div className={`flex h-full w-full flex-col gap-3 overflow-auto ${compacto ? "p-2" : "p-4"}`}>
      {!compacto && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold">{estado.molecula.titulo}</h2>
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{ETIQUETA_AMBITO[estado.molecula.ambito]}</span>
          {guardado && guardado.estado !== "error" && <span role="status" className="text-xs text-muted-foreground">{TEXTO_GUARDADO[guardado.estado]}</span>}
        </header>
      )}
      {guardado?.estado === "error" && <p role="alert" className="text-xs text-destructive">No se pudo guardar: {guardado.motivo}</p>}
      <AnadirHerramienta controlador={ctl} estado={estado} />
      <ListaPendientes controlador={ctl} estado={estado} />
      {!compacto && <BarraDictado alDictar={(frase) => ctl.dictar(frase, autor).resultados} />}
      <PanelMausbot molecula={estado.molecula} candidatos={candidatosDe(estado.molecula)} />
      <PanelParametros
        candidatos={candidatosDe(estado.molecula)}
        valores={estado.molecula.valores}
        autor={autor}
        alOperar={(op) => { const r = ctl.mover(op); setAviso(r.ok ? null : r.motivo); }}
      />
      {aviso && <p role="status" className="text-xs">{aviso}</p>}
      {hayLecturaSalud(estado) && <p role="note" className="text-xs text-muted-foreground">{AVISO_SALUD}</p>}
      {!compacto && <PanelActividad controlador={ctl} estado={estado} autor={autor} />}
    </div>
  );
}

export interface PanelProtomoleculaAutonomoProps {
  /** Presentación reducida para el widget del dashboard. */
  compacto?: boolean;
  /** Molécula concreta; si se omite, la última abierta, la más reciente guardada o una nueva. */
  moleculaId?: string;
}

export function PanelProtomoleculaAutonomo({ compacto = false, moleculaId }: PanelProtomoleculaAutonomoProps) {
  const { error, controlador, guardado } = useMolecula({ moleculaId });
  if (error) {
    return <p role="alert" className="p-2 text-sm text-destructive">{error}</p>;
  }
  if (!controlador) {
    return <p className="p-2 text-sm text-muted-foreground" role="status">Abriendo la protomolécula…</p>;
  }
  return <PanelProtomolecula controlador={controlador} compacto={compacto} guardado={guardado} />;
}

export default PanelProtomoleculaAutonomo;
