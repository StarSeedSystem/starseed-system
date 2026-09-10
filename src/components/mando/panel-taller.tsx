"use client";

/**
 * Taller del agente — pestaña del Puente de Mando (2026-09-09)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que Alex pidió: «una ventana de habilidades, conexiones, MCP, prompts,
 * plugins y memorias para los agentes, agregando los que ya tenemos y los de
 * StarSeed OS de la librería y de Astraura, para que los usemos todos como
 * correspondan».
 *
 * Junta en una sola vista TRES fuentes que ya existían separadas y que ningún
 * agente veía a la vez: el catálogo declarado del Taller (navegador, herramientas
 * del backend 1.58, memorias y prompts base), los 19+ conectores reales del OS
 * (`src/lib/connectors/registry.ts`) y las habilidades por cerebro. Nada de esto
 * se inventa aquí: se adapta lo que hay.
 */

import { useEffect, useMemo, useState } from "react";
import { Link2, Search, Shuffle } from "lucide-react";

// 2026-09-09 · Ola 301 · RT2: aquí se administran los recursos de los agentes,
// así que aquí también tiene que verse qué modelo los atiende ahora mismo.
import type { ModeloDisponible } from "@/lib/mando/modelos-disponibles";
import {
    resumenDeFlota,
    saludDesdeCatalogo,
    TEXTO_PAPEL_RUTA,
    type ResumenFlota,
} from "@/lib/mando/enrutamiento";

import {
    catalogoDeclarado,
    filtrarRecursos,
    REGLAS_NAVEGADOR,
    type OrigenRecurso,
    type RecursoAgente,
    type TipoRecurso,
} from "@/lib/agentes/taller";
import { BUILTIN_CONNECTORS } from "@/lib/connectors/registry";

/** Los conectores del OS, traducidos a recursos del Taller. */
function conectoresComoRecursos(): RecursoAgente[] {
    return BUILTIN_CONNECTORS.map((c) => ({
        id: `os:conector:${c.id}`,
        tipo: "conexion" as TipoRecurso,
        origen: "os" as OrigenRecurso,
        nombre: c.name,
        descripcion: c.description ?? "",
        etiquetas: [c.category, c.kind, c.authType].filter(Boolean).map(String),
        requiere: [],
        docs: c.docsUrl,
    }));
}

const TIPOS: Array<{ id: TipoRecurso; etiqueta: string }> = [
    { id: "habilidad", etiqueta: "Habilidades" },
    { id: "conexion", etiqueta: "Conexiones" },
    { id: "mcp", etiqueta: "MCP" },
    { id: "prompt", etiqueta: "Prompts" },
    { id: "plugin", etiqueta: "Plugins" },
    { id: "herramienta", etiqueta: "Herramientas" },
    { id: "memoria", etiqueta: "Memorias" },
];

const ORIGENES: Array<{ id: OrigenRecurso; etiqueta: string }> = [
    { id: "os", etiqueta: "StarSeed OS" },
    { id: "biblioteca", etiqueta: "Biblioteca" },
    { id: "astraura", etiqueta: "Astraura 1.58" },
    { id: "enjambre", etiqueta: "Enjambre" },
];

const TARJETA = "rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur";
const CHIP = "rounded-full border px-2 py-0.5 text-[11px]";

/** Lo que devuelve `/api/mando/modelos` y este panel necesita (nunca claves). */
interface RespuestaModelos {
    modelos?: ModeloDisponible[];
    /** Proveedores con sus claves: solo nombres de variable y huellas. */
    proveedores?: Array<{ id: string; claves: Array<{ var: string }> }>;
}

/**
 * Quién atiende a los agentes ahora mismo (2026-09-09 · Ola 301 · RT2). El
 * Taller reparte habilidades, conexiones y memorias, pero hasta hoy no decía
 * QUIÉN las ejecuta: aquí van el resumen de la flota y, por papel, el activo y
 * el que entra si se agota. Si el mando no responde (producción), no se pinta.
 */
function TarjetaFlotaDelTaller() {
    const [resumen, setResumen] = useState<ResumenFlota | null>(null);

    useEffect(() => {
        let vigente = true;
        void (async () => {
            try {
                const r = await fetch("/api/mando/modelos", { cache: "no-store" });
                if (!r.ok) return;
                const datos = (await r.json()) as RespuestaModelos;
                const modelos = datos.modelos ?? [];
                if (!vigente || modelos.length === 0) return;
                // Claves presentes de verdad en la máquina: solo el nombre del proveedor.
                const claves = (datos.proveedores ?? [])
                    .filter((p) => p.claves.length > 0)
                    .map((p) => p.id);
                setResumen(resumenDeFlota(modelos, saludDesdeCatalogo(modelos), claves));
            } catch {
                // El Taller sigue siendo útil sin la flota: no se avisa de nada.
            }
        })();
        return () => {
            vigente = false;
        };
    }, []);

    if (!resumen) return null;

    return (
        <div data-testid="flota-del-taller" className={TARJETA}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Shuffle className="h-4 w-4" aria-hidden /> Quién atiende a estos agentes
            </h2>
            <p className="mt-1 text-xs text-white/70">
                Ahora mismo <span className="text-emerald-300">{resumen.frase}</span>. Estos son el
                activo y el relevo de cada papel de la cadena.
            </p>
            <ul className="mt-3 grid gap-2 md:grid-cols-3">
                {resumen.planes.map((plan) => (
                    <li key={plan.papel} className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-white/50">
                            {TEXTO_PAPEL_RUTA[plan.papel]}
                        </h3>
                        <p className="mt-1 font-mono text-[11px] text-emerald-300">
                            {plan.activo ? plan.activo.id : "nadie vivo"}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-white/40">
                            {plan.siguiente ? plan.siguiente.id : "sin relevo detrás"}
                        </p>
                        <span className={`${CHIP} mt-1 inline-block border-sky-400/30 text-sky-200/80`}>
                            {plan.siguiente ? "entra si el activo se agota" : "sin relevo"}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function PanelTaller() {
    const [texto, setTexto] = useState("");
    const [tipo, setTipo] = useState<TipoRecurso | null>(null);
    const [origen, setOrigen] = useState<OrigenRecurso | null>(null);

    const todos = useMemo(() => [...catalogoDeclarado(), ...conectoresComoRecursos()], []);
    const visibles = useMemo(
        () => filtrarRecursos(todos, { tipo: tipo ?? undefined, origen: origen ?? undefined, texto }),
        [todos, tipo, origen, texto],
    );
    const porTipo = useMemo(() => {
        const n: Record<string, number> = {};
        for (const r of todos) n[r.tipo] = (n[r.tipo] ?? 0) + 1;
        return n;
    }, [todos]);

    return (
        <section data-testid="panel-taller" className="space-y-4">
            {/* Al principio: quién ejecuta todo esto (Ola 301 · RT2). */}
            <TarjetaFlotaDelTaller />

            <div className={TARJETA}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Link2 className="h-4 w-4" aria-hidden /> Taller del agente
                </h2>
                <p className="mt-1 text-xs text-white/70">
                    Todo lo que un agente puede usar, en un sitio: habilidades, conexiones, servidores MCP,
                    prompts, plugins, herramientas y memorias — del OS, de la Biblioteca y del backend 1.58.
                    <span className="text-white/50"> {todos.length} recursos declarados.</span>
                </p>
                <label className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                    <Search className="h-3.5 w-3.5 text-white/40" aria-hidden />
                    <input
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder="Buscar: navegador, memoria, telegram, terminal…"
                        className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/30"
                    />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        onClick={() => setTipo(null)}
                        className={`${CHIP} cursor-pointer ${tipo === null ? "border-white/60 text-white" : "border-white/15 text-white/60"}`}
                    >
                        Todo
                    </button>
                    {TIPOS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTipo(tipo === t.id ? null : t.id)}
                            className={`${CHIP} cursor-pointer ${tipo === t.id ? "border-white/60 text-white" : "border-white/15 text-white/60"}`}
                        >
                            {t.etiqueta} {porTipo[t.id] ? `· ${porTipo[t.id]}` : ""}
                        </button>
                    ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                    {ORIGENES.map((o) => (
                        <button
                            key={o.id}
                            onClick={() => setOrigen(origen === o.id ? null : o.id)}
                            className={`${CHIP} cursor-pointer ${origen === o.id ? "border-emerald-400/60 text-emerald-200" : "border-white/15 text-white/50"}`}
                        >
                            {o.etiqueta}
                        </button>
                    ))}
                </div>
            </div>

            <ul className="grid gap-3 md:grid-cols-2">
                {visibles.map((r) => (
                    <li key={r.id} className={TARJETA}>
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-medium text-white">{r.nombre}</h3>
                            <span className={`${CHIP} shrink-0 border-white/15 text-white/50`}>
                                {TIPOS.find((t) => t.id === r.tipo)?.etiqueta ?? r.tipo}
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-white/70">{r.descripcion}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className={`${CHIP} border-emerald-400/25 text-emerald-200/80`}>
                                {ORIGENES.find((o) => o.id === r.origen)?.etiqueta ?? r.origen}
                            </span>
                            {r.maquina === "mac" ? (
                                <span className={`${CHIP} border-amber-400/30 text-amber-200/80`} title="Solo desde la Mac: los agentes de la nube no llegan aquí">
                                    solo en la Mac
                                </span>
                            ) : null}
                            {r.etiquetas.slice(0, 4).map((e) => (
                                <span key={e} className={`${CHIP} border-white/10 text-white/40`}>{e}</span>
                            ))}
                        </div>
                        {r.ruta ? <p className="mt-2 text-[11px] text-white/35"><code>{r.ruta}</code></p> : null}
                        {r.docs ? (
                            <a href={r.docs} target="_blank" rel="noreferrer" className="mt-1 inline-block cursor-pointer text-[11px] text-sky-300 hover:underline">
                                documentación
                            </a>
                        ) : null}
                    </li>
                ))}
                {visibles.length === 0 ? (
                    <li className={`${TARJETA} md:col-span-2 text-xs text-white/50`}>
                        Nada coincide con esa búsqueda.
                    </li>
                ) : null}
            </ul>

            <div className={`${TARJETA} border-amber-400/20`}>
                <h3 className="text-xs font-semibold text-amber-200">Reglas del navegador, para todos los agentes</h3>
                <ul className="mt-2 space-y-1 text-xs text-white/70">
                    {REGLAS_NAVEGADOR.map((r) => <li key={r}>· {r}</li>)}
                </ul>
            </div>
        </section>
    );
}
