"use client";

/**
 * Protomolécula · ESTRUCTURA. «Añadir herramienta» (desde `listarAtomos()`, el mismo catálogo que enseña
 * la Biblioteca) y la lista de PENDIENTES: lo que una IA o un agente propone en un espacio compartido y
 * una persona confirma o rechaza. El panel no decide permisos: llama al controlador y cuenta lo que
 * este responde.
 */
import { useState } from "react";

import type { Controlador, EstadoControl, Pendiente } from "@/lib/protomolecula/controlador";
import { listarAtomos, obtenerAtomo } from "@/lib/protomolecula/registro-atomos";

const BOTON = "cursor-pointer rounded-md border border-input px-3 py-1 text-sm transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const SIN_HERRAMIENTAS = "Aún no hay herramientas instaladas: llegan con la fase F1.";

export function AnadirHerramienta({ controlador, estado }: { controlador: Controlador; estado: EstadoControl }) {
  const [elegida, setElegida] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const atomos = listarAtomos();
  const motivo = atomos.length === 0 ? SIN_HERRAMIENTAS : elegida === "" ? "Primero elige una herramienta." : undefined;
  const anadir = () => {
    const def = obtenerAtomo(elegida);
    if (!def) return;
    const repetidas = estado.molecula.atomos.filter((a) => a.herramientaId === elegida).length;
    const r = controlador.anadirAtomo(elegida, repetidas > 0 ? `${def.nombre} ${repetidas + 1}` : undefined, "mano");
    setMensaje(r.ok ? `Añadida «${def.nombre}».` : r.motivo);
    if (r.ok) setElegida("");
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Herramienta que añadir" value={elegida} disabled={atomos.length === 0} onChange={(e) => setElegida(e.target.value)}
          className="min-w-0 max-w-full cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50">
          <option value="">Elige una herramienta…</option>
          {atomos.map((a) => (
            <option key={a.herramientaId} value={a.herramientaId} disabled={Boolean(a.proximamente)}>
              {a.nombre}{a.proximamente ? ` (próximamente: ${a.proximamente})` : ""}
            </option>
          ))}
        </select>
        <button type="button" className={BOTON} disabled={motivo !== undefined} title={motivo} onClick={anadir}>Añadir herramienta</button>
      </div>
      {atomos.length === 0 && <p role="status" className="text-xs text-muted-foreground">{SIN_HERRAMIENTAS}</p>}
      {mensaje && <p role="status" className="text-xs">{mensaje}</p>}
    </div>
  );
}

const QUIEN = { ia: "La IA", agente: "Un agente" } as const;

function describirPendiente(p: Pendiente): string {
  const quien = p.operacion.autor.nombre ?? (p.operacion.origen === "ia" || p.operacion.origen === "agente" ? QUIEN[p.operacion.origen] : "Alguien");
  if (p.atomoNuevo) return `${quien} propone añadir «${obtenerAtomo(p.atomoNuevo.herramientaId)?.nombre ?? p.atomoNuevo.herramientaId}».`;
  return `${quien} propone cambiar «${p.operacion.objetivo.parametroId}».`;
}

export function ListaPendientes({ controlador, estado }: { controlador: Controlador; estado: EstadoControl }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  if (estado.pendientes.length === 0) return null;
  return (
    <section aria-label="Pendientes de confirmar" className="flex flex-col gap-2 rounded-md border border-amber-400/40 p-2">
      <h3 className="text-sm font-medium">Pendientes de confirmar ({estado.pendientes.length})</h3>
      <ul className="flex flex-col gap-2">
        {estado.pendientes.map((p) => (
          <li key={p.operacion.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 basis-48">{describirPendiente(p)}</span>
            <button type="button" className={BOTON} onClick={() => { const r = controlador.confirmar(p.operacion.id); setMensaje(r.ok ? null : r.motivo); }}>Confirmar</button>
            <button type="button" className={BOTON} onClick={() => { const r = controlador.rechazar(p.operacion.id); setMensaje(r.ok ? null : r.motivo); }}>Rechazar</button>
          </li>
        ))}
      </ul>
      {mensaje && <p role="status" className="text-xs">{mensaje}</p>}
    </section>
  );
}
