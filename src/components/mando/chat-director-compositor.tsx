"use client";

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import {
  MODELO_DIRECTOR_DEFECTO,
  MODELO_PRESIDENTE,
  MOTORES_DIRECTOR,
  motorDe,
  type CanalId,
} from "@/lib/mando/chat-director-tipos";
import { SelectorCanales } from "./selector-canales";

export interface ModeloOpcion {
  id: string;
  nombre: string;
  grupo: string;
  gratis?: boolean;
  salud?: string;
}

export interface CompositorDirectorProps {
  modelos: ModeloOpcion[];
  ultimoModelo: string;
  enviando?: boolean;
  onEnviar: (p: { texto: string; modelo: string; canales: CanalId[] }) => void;
}

const CLAVE_MODELO = "starseed.mando.director.modelo";
/** (DIR1111G) Marca de la migración única al Director presidente como destinatario por defecto. */
export const CLAVE_MIGRACION_PRESIDENTE = "starseed.mando.director.presidente-1111";

/**
 * Elige el modelo inicial: el guardado si existe entre los disponibles; si no, el Director
 * presidente (DIR1111G: Alex lo quiere como destinatario por defecto). El último modelo del
 * feed ya no manda: con 91 respuestas de Hermes a avisos de rutina, abría siempre Hermes.
 */
export function modeloInicial(guardado: string | null, _ultimo: string, disponibles: string[]): string {
  if (guardado && disponibles.includes(guardado)) return guardado;
  return MODELO_DIRECTOR_DEFECTO;
}

/**
 * (DIR1111G) Una sola vez por aparato: lo guardado pasa al Director presidente (lo que Alex
 * pidió como destinatario por defecto). Después, lo que él elija se respeta. Devuelve el valor
 * guardado tras migrar.
 */
export function migrarAPresidente(almacen: Pick<Storage, "getItem" | "setItem">): string | null {
  if (!almacen.getItem(CLAVE_MIGRACION_PRESIDENTE)) {
    almacen.setItem(CLAVE_MIGRACION_PRESIDENTE, "1");
    almacen.setItem(CLAVE_MODELO, MODELO_PRESIDENTE);
    // La migración vieja (DIR1029A) ya no tiene nada que mover.
    almacen.setItem("starseed.mando.director.hermes-1029", "1");
  }
  return almacen.getItem(CLAVE_MODELO);
}

function leerGuardado(): string | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return migrarAPresidente(window.localStorage);
  } catch { return null; }
}

function guardarModelo(id: string): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(CLAVE_MODELO, id);
  } catch { /* almacenamiento no disponible: no pasa nada */ }
}

export function CompositorDirector({ modelos, ultimoModelo, enviando = false, onEnviar }: CompositorDirectorProps) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, ModeloOpcion[]>();
    mapa.set("Dirección", MOTORES_DIRECTOR.map((m) => ({ id: m.id, nombre: m.nombre, grupo: "Dirección" })));
    const flotaLista: ModeloOpcion[] = [];
    const restantes: ModeloOpcion[] = [];
    for (const m of modelos) {
      if (m.salud === "vivo" && m.gratis !== false) flotaLista.push(m);
      else restantes.push(m);
    }
    if (flotaLista.length > 0) mapa.set("Flota gratuita lista", flotaLista);
    for (const m of restantes) {
      const lista = mapa.get(m.grupo) ?? [];
      lista.push(m);
      mapa.set(m.grupo, lista);
    }
    return [...mapa.entries()];
  }, [modelos]);

  const disponibles = useMemo(() => grupos.flatMap(([, lista]) => lista.map((m) => m.id)), [grupos]);
  // Un solo cálculo del modelo inicial para el modelo y sus canales: lo guardado por Alex manda
  // aunque el catálogo aún no haya llegado (revisión de CDP1004).
  const [inicial] = useState<string>(() => {
    const guardado = leerGuardado();
    if (guardado && guardado.trim() !== "") return guardado;
    return modeloInicial(guardado, ultimoModelo, disponibles);
  });
  const [modelo, setModelo] = useState<string>(inicial);
  const [canales, setCanales] = useState<CanalId[]>(() => {
    const c = motorDe(inicial);
    return c === "api" ? [] : [c];
  });
  const [texto, setTexto] = useState("");

  const cambiarModelo = (id: string) => {
    setModelo(id);
    guardarModelo(id);
    const c = motorDe(id);
    setCanales(c === "api" ? [] : [c]);
  };

  const enviar = () => {
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    onEnviar({ texto: cuerpo, modelo, canales });
    setTexto("");
  };

  const ayuda = modelo.startsWith("director-presidente/")
    ? "Contesta el director que pueda ahora: Claude si sus límites lo permiten, si no Hermes o ChatGPT. Si nadie puede, queda en cola."
    : modelo.startsWith("claude-cowork/")
    ? "Te responde la sesión de dirección de Claude en su próxima revisión."
    : modelo.startsWith("claude-mac/")
      ? "Opus 5.5 en tu Mac, con el proyecto entero (solo lectura)."
      : null;

  return (
    <div data-testid="compositor-director" className="flex flex-col gap-2.5 rounded-xl border border-sky-400/25 bg-[#0A0F1D]/90 p-3 shadow-inner">
      <textarea
        aria-label="Mensaje a la dirección"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); enviar(); } }}
        placeholder="Escribe a la dirección… (Ctrl/⌘ + Intro para enviar)"
        rows={3}
        className="w-full resize-y rounded-lg border border-sky-400/25 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none select-text"
      />
      {ayuda && <p data-testid="ayuda-motor" className="text-[11px] text-amber-300/90">{ayuda}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Modelo con el que responder"
          value={modelo}
          onChange={(e) => cambiarModelo(e.target.value)}
          className="min-w-0 max-w-full cursor-pointer truncate rounded-lg border border-sky-400/30 bg-[#0A0F1D] px-2.5 py-1.5 text-xs text-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
        >
          {!disponibles.includes(modelo) && modelo.trim() !== "" && (
            <option value={modelo}>{modelo}</option>
          )}
          {grupos.map(([grupo, lista]) => (
            <optgroup key={grupo} label={grupo}>
              {lista.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <SelectorCanales valor={canales} onCambio={setCanales} />
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className="cursor-pointer ml-auto flex items-center gap-1.5 rounded-lg bg-violet-600 bg-gradient-to-r from-sky-600 to-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:from-sky-500 hover:to-violet-500 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" /> Enviar
        </button>
      </div>
    </div>
  );
}
