"use client";

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import {
  MODELO_DIRECTOR_DEFECTO,
  MOTORES_DIRECTOR,
  motorDe,
  type CanalId,
} from "@/lib/mando/chat-director-tipos";
import { SelectorCanales } from "./selector-canales";

export interface ModeloOpcion { id: string; nombre: string; grupo: string; }

export interface CompositorDirectorProps {
  modelos: ModeloOpcion[];
  ultimoModelo: string;
  enviando?: boolean;
  onEnviar: (p: { texto: string; modelo: string; canales: CanalId[] }) => void;
}

const CLAVE_MODELO = "starseed.mando.director.modelo";

/** Elige el modelo inicial: el guardado si existe entre los disponibles, si no el último, si no el de defecto. */
export function modeloInicial(guardado: string | null, ultimo: string, disponibles: string[]): string {
  if (guardado && disponibles.includes(guardado)) return guardado;
  if (ultimo && ultimo.trim() !== "") return ultimo;
  return MODELO_DIRECTOR_DEFECTO;
}

function leerGuardado(): string | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(CLAVE_MODELO);
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
    for (const m of modelos) {
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

  const ayuda = modelo.startsWith("claude-cowork/")
    ? "Te responde la sesión de dirección de Claude en su próxima revisión."
    : modelo.startsWith("claude-mac/")
      ? "Opus 5.5 en tu Mac, con el proyecto entero (solo lectura)."
      : null;

  return (
    <div data-testid="compositor-director" className="flex flex-col gap-2 rounded-xl border border-violet-500/20 bg-zinc-950 p-3">
      <textarea
        aria-label="Mensaje a la dirección"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); enviar(); } }}
        placeholder="Escribe a la dirección… (Ctrl/⌘ + Intro para enviar)"
        rows={3}
        className="w-full resize-y rounded-lg border border-violet-500/30 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-400"
      />
      {ayuda && <p data-testid="ayuda-motor" className="text-[11px] text-amber-300/90">{ayuda}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Modelo con el que responder"
          value={modelo}
          onChange={(e) => cambiarModelo(e.target.value)}
          className="cursor-pointer rounded-lg border border-violet-500/30 bg-zinc-900 px-2.5 py-1.5 text-xs text-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
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
          className="cursor-pointer ml-auto flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" /> Enviar
        </button>
      </div>
    </div>
  );
}
