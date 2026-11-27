"use client";

/**
 * TRM1125D · pestaña «Terminal» de la ventana de control (contrato `architecture/terminal-entre-neuronas.md`).
 * Solo presentación: escribir una orden, ver su salida en vivo, el nivel concedido, el aviso del modo completo con
 * su caducidad, el historial y «Terminar». No ejecuta nada ni guarda contraseñas: todo entra por props y sale por
 * `alEnviar` / `alTerminar`; el permiso y la decisión final viven en el aparato controlado.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ModoAdmin, NivelTerminal } from "@/lib/control-remoto/terminal";

export interface LineaSalida {
    flujo: "stdout" | "stderr";
    texto: string;
}

export interface EntradaHistorial {
    orden: string;
    resumen: string;
    cuando: number;
}

export interface PropsTerminalRemota {
    /** Nivel que concedió el dueño del aparato; `null` si no hay permiso de terminal. */
    nivel: NivelTerminal | null;
    modo: ModoAdmin;
    /** Milisegundos que le quedan al modo completo; sin valor, no caduca por reloj. */
    restanteMs?: number | null;
    lineas: readonly LineaSalida[];
    historial: readonly EntradaHistorial[];
    ocupada: boolean;
    error?: string | null;
    alEnviar: (orden: string) => void;
    alTerminar: () => void;
}

/** «1 h 30 min», «5 min», «menos de 1 min» o «caducado». */
export function textoCaducidad(restanteMs: number): string {
    if (!(restanteMs > 0)) return "caducado";
    const min = Math.floor(restanteMs / 60_000);
    if (min < 1) return "menos de 1 min";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function TerminalRemota(p: PropsTerminalRemota) {
    const [texto, setTexto] = useState("");
    const [recuerdo, setRecuerdo] = useState(-1);
    const fin = useRef<HTMLDivElement>(null);
    const sinPermiso = p.nivel === null;
    const completo = p.nivel === "administrador" && p.modo === "completo";

    useEffect(() => {
        fin.current?.scrollIntoView?.({ block: "end" });
    }, [p.lineas.length]);

    const enviar = () => {
        const orden = texto.trim();
        if (orden === "" || p.ocupada || sinPermiso) return;
        p.alEnviar(orden);
        setTexto("");
        setRecuerdo(-1);
    };

    const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            enviar();
        } else if (e.key === "ArrowUp" && p.historial.length > 0) {
            e.preventDefault();
            const i = Math.min(recuerdo + 1, p.historial.length - 1);
            setRecuerdo(i);
            setTexto(p.historial[p.historial.length - 1 - i].orden);
        } else if (e.key === "ArrowDown" && recuerdo >= 0) {
            e.preventDefault();
            const i = recuerdo - 1;
            setRecuerdo(i);
            setTexto(i < 0 ? "" : p.historial[p.historial.length - 1 - i].orden);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-sm text-slate-100" data-testid="terminal-remota">
            <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs">
                    {sinPermiso ? "Sin permiso de terminal" : `Nivel concedido: ${p.nivel}`}
                </span>
                <button
                    type="button"
                    onClick={p.alTerminar}
                    disabled={!p.ocupada}
                    className="cursor-pointer rounded-md border border-red-400/50 px-3 py-1 text-xs text-red-200 transition-colors duration-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Terminar
                </button>
            </div>

            {sinPermiso && (
                <p className="rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-100">
                    Este aparato no ha dado permiso de terminal. Su dueño debe encenderlo en el propio aparato.
                </p>
            )}
            {completo && (
                <p role="alert" className="rounded-md border border-red-400/60 bg-red-500/15 p-2 text-xs text-red-100">
                    Modo administrador completo: cada orden se registra en el aparato.
                    {typeof p.restanteMs === "number" && ` Caduca en ${textoCaducidad(p.restanteMs)}.`}
                </p>
            )}

            <div
                role="log"
                aria-live="polite"
                aria-label="Salida de la terminal"
                tabIndex={0}
                className="min-h-24 flex-1 overflow-auto rounded-md border border-white/10 bg-black/50 p-2 font-mono text-xs"
            >
                {p.lineas.map((l, i) => (
                    <div
                        key={i}
                        data-flujo={l.flujo}
                        className={`whitespace-pre-wrap break-words ${l.flujo === "stderr" ? "text-red-300" : "text-slate-100"}`}
                    >
                        {l.texto}
                    </div>
                ))}
                <div ref={fin} />
            </div>

            {p.error && <p className="text-xs text-red-300">{p.error}</p>}

            <label className="flex items-center gap-2">
                <span className="sr-only">Orden</span>
                <span aria-hidden className="font-mono text-xs text-emerald-300">$</span>
                <input
                    aria-label="Orden"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={alTeclear}
                    disabled={sinPermiso}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={p.ocupada ? "Ejecutando… espera o pulsa «Terminar»" : "Escribe una orden y pulsa Intro"}
                    className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
                />
            </label>

            {p.historial.length > 0 && (
                <ul aria-label="Historial" className="max-h-24 space-y-1 overflow-auto text-xs text-slate-300">
                    {p.historial.map((h, i) => (
                        <li key={`${h.cuando}-${i}`} className="flex justify-between gap-2">
                            <code className="truncate">{h.orden}</code>
                            <span className="shrink-0 text-slate-400">{h.resumen}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
