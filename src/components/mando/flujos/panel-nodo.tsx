"use client";

/**
 * Panel lateral del nodo seleccionado en el editor de Flujos de Genesis.
 *
 * Los campos dependen del tipo, con la misma firma que reciben las funciones de
 * `scripts/puente/flujos/nodos.py`. Las credenciales NUNCA son valores: es un
 * `<select>` con los NOMBRES de variables de entorno que ya conoce Genesis
 * (`GET /api/mando/claves`), y se guarda solo el nombre.
 */

import type { NodoUI } from "./editor-flujos";

export interface CampoNodo {
    clave: string;
    etiqueta: string;
    tipo: "texto" | "area" | "numero" | "variable" | "select" | "casilla";
    opciones?: { valor: string; etiqueta: string }[];
    ayuda?: string;
}

/** Campos por tipo de nodo, en el orden del motor. */
export const CAMPOS_POR_TIPO: Record<string, CampoNodo[]> = {
    webhook: [
        { clave: "ruta", etiqueta: "Ruta del webhook", tipo: "texto", ayuda: "Letras, dígitos, guion y guion bajo; firma HMAC en la entrada." },
    ],
    cron: [
        { clave: "expresion", etiqueta: "Expresión cron", tipo: "texto", ayuda: "minuto hora día mes día-semana (cinco campos)." },
    ],
    bus: [
        { clave: "tipos", etiqueta: "Tipos de evento", tipo: "texto", ayuda: "Lista separada por comas: commit, rechazada, publicada…" },
    ],
    chat: [],
    http: [
        { clave: "metodo", etiqueta: "Método", tipo: "select", opciones: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ valor: m, etiqueta: m })) },
        { clave: "url", etiqueta: "URL", tipo: "texto" },
        { clave: "credencial", etiqueta: "Credencial (nombre de variable)", tipo: "variable" },
        { clave: "cuerpo", etiqueta: "Cuerpo", tipo: "area" },
    ],
    ntfy: [
        { clave: "tema", etiqueta: "Tema", tipo: "texto" },
        { clave: "titulo", etiqueta: "Título", tipo: "texto" },
        { clave: "mensaje", etiqueta: "Mensaje", tipo: "area" },
        { clave: "servidor_env", etiqueta: "Servidor (nombre de variable)", tipo: "variable", ayuda: "Sin valor: https://ntfy.sh." },
    ],
    telegram: [
        { clave: "chat_id", etiqueta: "Chat de destino", tipo: "texto" },
        { clave: "texto", etiqueta: "Texto", tipo: "area" },
    ],
    chat_director: [
        { clave: "texto", etiqueta: "Texto", tipo: "area" },
        { clave: "canal", etiqueta: "Canal", tipo: "texto" },
    ],
    ia: [
        { clave: "prompt", etiqueta: "Prompt", tipo: "area", ayuda: "Admite {{ $json.campo }} y {{ $nodo.id.campo }}." },
        { clave: "campo", etiqueta: "Campo de salida", tipo: "texto" },
    ],
    conocimiento: [
        { clave: "base", etiqueta: "Base de conocimiento", tipo: "texto" },
        { clave: "consulta", etiqueta: "Consulta", tipo: "area" },
        { clave: "k", etiqueta: "Fragmentos (k)", tipo: "numero" },
    ],
    si: [
        { clave: "condicion", etiqueta: "Condición", tipo: "texto", ayuda: "Expresión segura, sin eval: «$json.estado == 'ok'»." },
    ],
    switch: [
        { clave: "expresion", etiqueta: "Expresión", tipo: "texto" },
        { clave: "casos", etiqueta: "Casos (JSON)", tipo: "area" },
    ],
    fusion: [
        { clave: "modo", etiqueta: "Modo", tipo: "select", opciones: [
            { valor: "concatenar", etiqueta: "Concatenar" },
            { valor: "parear", etiqueta: "Parear" },
        ] },
    ],
    set: [
        { clave: "campos", etiqueta: "Campos (JSON)", tipo: "area" },
        { clave: "conservar", etiqueta: "Conservar el ítem original", tipo: "casilla" },
    ],
    esperar: [
        { clave: "ms", etiqueta: "Espera (ms)", tipo: "numero" },
    ],
};

function textoDe(valor: unknown): string {
    if (valor === null || valor === undefined) return "";
    if (typeof valor === "string") return valor;
    try {
        return JSON.stringify(valor);
    } catch {
        return "";
    }
}

interface PropsPanel {
    nodo: NodoUI;
    variables: string[];
    onCambiar: (cambios: Partial<NodoUI>) => void;
    onEliminar: (id: string) => void;
    onCerrar: () => void;
}

export function PanelNodo({ nodo, variables, onCambiar, onEliminar, onCerrar }: PropsPanel) {
    const campos = CAMPOS_POR_TIPO[nodo.tipo] ?? [];
    const ponerConfig = (clave: string, valor: unknown) => {
        onCambiar({ configuracion: { ...nodo.configuracion, [clave]: valor } });
    };
    return (
        <aside className="mc-cristal flex w-full flex-col gap-2 rounded-md p-3 text-sm md:w-72 md:shrink-0"
            aria-label={`Parámetros del nodo ${nodo.id}`}>
            <header className="flex items-center justify-between">
                <strong className="text-sm">{nodo.id}</strong>
                <button type="button" aria-label="Cerrar panel" className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-xs"
                    onClick={onCerrar}>×</button>
            </header>

            <label className="flex flex-col gap-1">
                <span>Id</span>
                <input className="rounded border border-white/15 bg-black/20 px-2 py-1 font-mono text-xs" value={nodo.id} readOnly aria-readonly />
            </label>

            {campos.map((campo) => (
                <label key={campo.clave} className="flex flex-col gap-1">
                    <span>{campo.etiqueta}</span>
                    {campo.tipo === "texto" ? (
                        <input
                            className="rounded border border-white/15 bg-black/20 px-2 py-1"
                            value={textoDe(nodo.configuracion[campo.clave])}
                            onChange={(e) => ponerConfig(campo.clave, e.target.value)}
                        />
                    ) : null}
                    {campo.tipo === "area" ? (
                        <textarea
                            className="min-h-16 rounded border border-white/15 bg-black/20 px-2 py-1 font-mono text-xs"
                            value={textoDe(nodo.configuracion[campo.clave])}
                            onChange={(e) => {
                                const bruto = e.target.value;
                                if (campo.clave === "casos" || campo.clave === "campos" || campo.clave === "cuerpo") {
                                    try {
                                        ponerConfig(campo.clave, JSON.parse(bruto));
                                        return;
                                    } catch {
                                        // mientras se edita, se guarda el texto tal cual
                                    }
                                }
                                ponerConfig(campo.clave, bruto);
                            }}
                        />
                    ) : null}
                    {campo.tipo === "numero" ? (
                        <input
                            type="number"
                            min={0}
                            className="rounded border border-white/15 bg-black/20 px-2 py-1"
                            value={textoDe(nodo.configuracion[campo.clave])}
                            onChange={(e) => ponerConfig(campo.clave, Number(e.target.value))}
                        />
                    ) : null}
                    {campo.tipo === "select" ? (
                        <select
                            className="cursor-pointer rounded border border-white/15 bg-black/20 px-2 py-1"
                            value={textoDe(nodo.configuracion[campo.clave])}
                            onChange={(e) => ponerConfig(campo.clave, e.target.value)}
                        >
                            <option value="">—</option>
                            {(campo.opciones ?? []).map((op) => (
                                <option key={op.valor} value={op.valor}>{op.etiqueta}</option>
                            ))}
                        </select>
                    ) : null}
                    {campo.tipo === "variable" ? (
                        <select
                            className="cursor-pointer rounded border border-white/15 bg-black/20 px-2 py-1"
                            value={textoDe(nodo.configuracion[campo.clave])}
                            onChange={(e) => ponerConfig(campo.clave, e.target.value)}
                        >
                            <option value="">Sin credencial</option>
                            {variables.map((v) => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                    ) : null}
                    {campo.tipo === "casilla" ? (
                        <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer self-start"
                            checked={Boolean(nodo.configuracion[campo.clave])}
                            onChange={(e) => ponerConfig(campo.clave, e.target.checked)}
                        />
                    ) : null}
                    {campo.ayuda ? <small className="opacity-70">{campo.ayuda}</small> : null}
                </label>
            ))}

            <label className="flex flex-col gap-1">
                <span>Reintentos</span>
                <input
                    type="number"
                    min={0}
                    className="rounded border border-white/15 bg-black/20 px-2 py-1"
                    value={String(nodo.reintentos)}
                    onChange={(e) => onCambiar({ reintentos: Math.max(0, Number(e.target.value)) })}
                />
            </label>
            <label className="flex flex-col gap-1">
                <span>Espera entre reintentos (ms)</span>
                <input
                    type="number"
                    min={0}
                    className="rounded border border-white/15 bg-black/20 px-2 py-1"
                    value={String(nodo.espera_ms)}
                    onChange={(e) => onCambiar({ espera_ms: Math.max(0, Number(e.target.value)) })}
                />
            </label>

            <button
                type="button"
                className="mc-neon--peligro cursor-pointer self-start rounded border border-white/15 px-3 py-1 text-xs"
                onClick={() => onEliminar(nodo.id)}
            >
                Eliminar nodo
            </button>
        </aside>
    );
}

