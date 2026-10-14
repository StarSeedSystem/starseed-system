"use client";

/**
 * Protomolécula · PANEL AUTÓNOMO. Conecta el controlador activo
 * (`controlador-activo.ts`) con la barra de dictado y el panel de parámetros.
 * `compacto` reduce la presentación para su uso como widget del dashboard.
 */
import { useEffect, useState } from "react";

import type { Controlador, EstadoControl } from "@/lib/protomolecula/controlador";
import { controladorActivo } from "@/lib/protomolecula/controlador-activo";
import { candidatosDe } from "@/lib/protomolecula/registro-atomos";
import type { Autor } from "@/lib/protomolecula/tipos";

import { BarraDictado } from "./barra-dictado";
import { PanelParametros } from "./panel-parametros";

const AUTOR_PANEL: Autor = { tipo: "persona", id: "panel" };

export interface PanelProtomoleculaAutonomoProps {
  /** Presentación reducida para el widget del dashboard. */
  compacto?: boolean;
  /** Molécula concreta; si se omite, se usa la última registrada. */
  moleculaId?: string;
}

export function PanelProtomoleculaAutonomo({ compacto = false, moleculaId }: PanelProtomoleculaAutonomoProps) {
  const [ctl, setCtl] = useState<Controlador | null>(null);
  const [estado, setEstado] = useState<EstadoControl | null>(null);

  useEffect(() => {
    const c = controladorActivo(moleculaId);
    setCtl(c);
    if (!c) {
      setEstado(null);
      return;
    }
    setEstado(c.obtener());
    return c.suscribir(setEstado);
  }, [moleculaId]);

  if (!ctl || !estado) {
    return (
      <p className="p-2 text-sm text-muted-foreground" role="status">
        No hay ninguna protomolécula activa.
      </p>
    );
  }

  const candidatos = candidatosDe(estado.molecula);

  return (
    <div className={`flex h-full w-full flex-col gap-3 ${compacto ? "overflow-auto p-2" : "p-4"}`}>
      {!compacto && <BarraDictado alDictar={(frase) => ctl.dictar(frase, AUTOR_PANEL).resultados} />}
      <PanelParametros
        candidatos={candidatos}
        valores={estado.molecula.valores}
        autor={AUTOR_PANEL}
        alOperar={(op) => { ctl.mover(op); }}
      />
    </div>
  );
}

export default PanelProtomoleculaAutonomo;
