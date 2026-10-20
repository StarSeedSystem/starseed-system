"use client";

/**
 * Protomolécula · ACTIVIDAD. Historial de cambios con `describirCambio` y los botones Deshacer y
 * Rehacer. Cada autor deshace SOLO lo suyo (`controlador.deshacer(autor.id)`): lo de un agente o un
 * mando no se pisa desde aquí. Un botón sin nada que hacer se deshabilita y dice por qué.
 */
import { useState } from "react";

import type { Controlador, EstadoControl } from "@/lib/protomolecula/controlador";
import { describirCambio } from "@/lib/protomolecula/parametros";
import { metricaDeFuente } from "@/lib/protomolecula/permisos";
import { candidatosDe } from "@/lib/protomolecula/registro-atomos";
import type { Autor, Cambio, Origen } from "@/lib/protomolecula/tipos";

const COMO: Record<Origen, string> = {
  mano: "a mano", ia: "IA", dictado: "dictado", midi: "mando MIDI", gamepad: "mando", hid: "mando", osc: "OSC", sensor: "sensor", agente: "agente",
};
const BOTON = "cursor-pointer rounded-md border border-input px-3 py-1 text-sm transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const VISIBLES = 8;

/** Hay en el historial un cambio que vino de un wearable: toca mostrar `AVISO_SALUD`. */
export const hayLecturaSalud = (e: EstadoControl): boolean =>
  e.historial.hechos.some((c) => c.operacion.origen === "sensor" && metricaDeFuente(c.operacion.fuente) !== undefined);

export interface PanelActividadProps { controlador: Controlador; estado: EstadoControl; autor: Autor }

export function PanelActividad({ controlador, estado, autor }: PanelActividadProps) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const candidatos = candidatosDe(estado.molecula);
  const describir = (c: Cambio): string => {
    const o = c.operacion.objetivo;
    const p = candidatos.find((x) => x.ref.atomoId === o.atomoId && x.ref.parametroId === o.parametroId)?.parametro;
    return p ? describirCambio(p, c) : `${o.parametroId}: ${String(c.antes)} → ${String(c.despues)}`;
  };
  const esMio = (c: Cambio) => c.operacion.autor.id === autor.id;
  const { hechos, rehacer } = estado.historial;
  const puedeDeshacer = hechos.some(esMio);
  const puedeRehacer = rehacer.some(esMio);
  const motivoDeshacer = hechos.length === 0 ? "Aún no hay cambios que deshacer." : "Los cambios que ves son de otros: aquí solo se deshace lo tuyo.";

  return (
    <section aria-label="Actividad" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Historial</h3>
        <button type="button" className={BOTON} disabled={!puedeDeshacer} title={puedeDeshacer ? undefined : motivoDeshacer}
          onClick={() => { const r = controlador.deshacer(autor.id); setMensaje(r.ok ? `Deshecho. ${describir({ ...r.cambio, antes: r.cambio.despues, despues: r.cambio.antes })}` : r.motivo); }}>
          Deshacer
        </button>
        <button type="button" className={BOTON} disabled={!puedeRehacer} title={puedeRehacer ? undefined : "No hay nada que rehacer."}
          onClick={() => { const r = controlador.rehacer(autor.id); setMensaje(r.ok ? `Rehecho. ${describir(r.cambio)}` : r.motivo); }}>
          Rehacer
        </button>
      </div>
      {!puedeDeshacer && <p className="text-xs text-muted-foreground">{motivoDeshacer}</p>}
      {mensaje && <p role="status" className="text-xs">{mensaje}</p>}
      <ol aria-label="Historial de cambios" className="flex flex-col gap-1 text-sm">
        {[...hechos].reverse().slice(0, VISIBLES).map((c) => (
          <li key={c.operacion.id}>
            {describir(c)} <span className="text-xs text-muted-foreground">· {esMio(c) ? "tú" : c.operacion.autor.nombre ?? c.operacion.autor.id}, {COMO[c.operacion.origen]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
