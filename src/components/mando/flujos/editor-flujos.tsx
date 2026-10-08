"use client";

/**
 * Editor de Flujos de Genesis (FLU1005Hc · contrato §3).
 *
 * Lienzo de nodos arrastrables con `@dnd-kit/core`, conexiones en SVG, zoom y
 * desplazamiento, paleta de tipos del motor (`scripts/puente/flujos/nodos.py`),
 * panel lateral por nodo e historial de ejecuciones con su Ejecutar/Activar y
 * Duplicar. En pantallas estrechas el lienzo se cambia por una lista.
 *
 * La posición de cada nodo vive en `configuracion.posicion` del propio flujo:
 * así viaja en el JSON sin cambiar el dataclass `Nodo` del motor Python.
 */

import { DndContext, type DragEndEvent, useDraggable } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import { HistorialEjecuciones } from "./historial-ejecuciones";
import { PanelNodo } from "./panel-nodo";

// ── Modelo del editor ─────────────────────────────────────────────────────

export interface Posicion {
    x: number;
    y: number;
}

export interface NodoUI {
    id: string;
    tipo: string;
    configuracion: Record<string, unknown>;
    reintentos: number;
    espera_ms: number;
    posicion: Posicion;
}

export interface ConexionUI {
    origen: string;
    destino: string;
}

export interface FlujoUI {
    id: string;
    nombre: string;
    nodos: NodoUI[];
    conexiones: ConexionUI[];
}

export interface ResumenFlujo {
    id: string;
    nombre: string;
    nodos: number;
    disparador: string | null;
}

export interface TipoNodo {
    tipo: string;
    etiqueta: string;
    disparador: boolean;
}

/** Paleta de tipos del motor propio (FLU1005B): disparadores primero. */
export const TIPOS_NODO: TipoNodo[] = [
    { tipo: "webhook", etiqueta: "Webhook", disparador: true },
    { tipo: "cron", etiqueta: "Cron", disparador: true },
    { tipo: "bus", etiqueta: "Bus del enjambre", disparador: true },
    { tipo: "chat", etiqueta: "Chat Director", disparador: true },
    { tipo: "http", etiqueta: "HTTP", disparador: false },
    { tipo: "ntfy", etiqueta: "ntfy", disparador: false },
    { tipo: "telegram", etiqueta: "Telegram", disparador: false },
    { tipo: "chat_director", etiqueta: "Aviso al Chat Director", disparador: false },
    { tipo: "ia", etiqueta: "Modelo de IA", disparador: false },
    { tipo: "conocimiento", etiqueta: "Conocimiento", disparador: false },
    { tipo: "si", etiqueta: "Condición", disparador: false },
    { tipo: "switch", etiqueta: "Switch", disparador: false },
    { tipo: "fusion", etiqueta: "Fusión", disparador: false },
    { tipo: "set", etiqueta: "Fijar campos", disparador: false },
    { tipo: "esperar", etiqueta: "Esperar", disparador: false },
];

const ANCHO_NODO = 176;
const ALTO_NODO = 56;

function numero(valor: unknown, respaldo: number): number {
    const n = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(n) ? n : respaldo;
}

/** Traduce el JSON del servicio (poste de `modelo.py`) a `FlujoUI`, tolerante. */
export function flujoDesdeServidor(datos: unknown): FlujoUI | null {
    if (!datos || typeof datos !== "object") return null;
    const f = datos as Record<string, unknown>;
    if (typeof f.id !== "string" || !Array.isArray(f.nodos)) return null;
    const nodos: NodoUI[] = [];
    let fila = 0;
    for (const crudo of f.nodos) {
        if (!crudo || typeof crudo !== "object") continue;
        const n = crudo as Record<string, unknown>;
        if (typeof n.id !== "string" || typeof n.tipo !== "string") continue;
        const config = n.configuracion && typeof n.configuracion === "object"
            ? { ...(n.configuracion as Record<string, unknown>) }
            : {};
        const pos = config.posicion as Record<string, unknown> | undefined;
        delete config.posicion;
        // Descartar nodos sin id válido
        if (!n.id || typeof n.id !== "string" || n.id.trim() === "") {
            continue;
        }
        if (typeof n.tipo !== "string") {
            continue;
        }
        nodos.push({
            id: n.id,
            tipo: n.tipo,
            configuracion: config,
            reintentos: numero(n.reintentos, 0),
            espera_ms: numero(n.espera_ms, 0),
            posicion: {
                x: numero(pos?.x, 40 + (fila % 3) * 220),
                y: numero(pos?.y, 40 + Math.floor(fila / 3) * 120),
            },
        });
        fila += 1;
    }
    const conocidos = new Set(nodos.map((n) => n.id));
    const conexiones: ConexionUI[] = [];
    if (Array.isArray(f.conexiones)) {
        for (const c of f.conexiones) {
            if (!c || typeof c !== "object") continue;
            const { origen, destino } = c as Record<string, unknown>;
            if (conocidos.has(String(origen)) && conocidos.has(String(destino))) {
                conexiones.push({ origen: String(origen), destino: String(destino) });
            }
        }
    }
    return {
        id: f.id,
        nombre: typeof f.nombre === "string" ? f.nombre : f.id,
        nodos,
        conexiones,
    };
}

/** El `FlujoUI` de vuelta al JSON que esperan la ruta y el motor Python. */
export function flujoParaServidor(flujo: FlujoUI): Record<string, unknown> {
    return {
        id: flujo.id,
        nombre: flujo.nombre,
        nodos: flujo.nodos.map((n) => ({
            id: n.id,
            tipo: n.tipo,
            configuracion: { ...n.configuracion, posicion: { ...n.posicion } },
            reintentos: n.reintentos,
            espera_ms: n.espera_ms,
        })),
        conexiones: flujo.conexiones.map((c) => ({ ...c })),
    };
}

/** Curva SVG cúbica entre el puerto de salida del origen y el del destino. */
export function rutaConexion(origen: Posicion, destino: Posicion): string {
    const salto = Math.max(40, Math.abs(destino.x - origen.x) / 2);
    return `M ${origen.x} ${origen.y} C ${origen.x + salto} ${origen.y}, ${destino.x - salto} ${destino.y}, ${destino.x} ${destino.y}`;
}

/** Puerto de salida (derecha) o de entrada (izquierda) de un nodo del lienzo. */
export function puertoDe(nodo: NodoUI, lado: "entrada" | "salida"): Posicion {
    return {
        x: nodo.posicion.x + (lado === "salida" ? ANCHO_NODO : 0),
        y: nodo.posicion.y + ALTO_NODO / 2,
    };
}

/** Id nuevo `tipo-N` que no choque con los existentes. */
export function nuevoIdNodo(nodos: NodoUI[], tipo: string): string {
    const base = tipo.replace(/_/g, "-");
    const usados = new Set(nodos.map((n) => n.id));
    let n = 1;
    while (usados.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

// ── Componentes internos ───────────────────────────────────────────────────

function etiquetaDe(tipo: string): string {
    return TIPOS_NODO.find((t) => t.tipo === tipo)?.etiqueta ?? tipo;
}

/** Nodo arrastrable del lienzo: usa `useDraggable` con su id. */
function NodoLienzo(props: {
    nodo: NodoUI;
    escala: number;
    seleccionado: boolean;
    conectando: boolean;
    onElegir: (id: string) => void;
    onSalida: (id: string) => void;
    onEntrada: (id: string) => void;
}) {
    const { nodo } = props;
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: nodo.id });
    const estilo: React.CSSProperties = {
        left: nodo.posicion.x,
        top: nodo.posicion.y,
        width: ANCHO_NODO,
        minHeight: ALTO_NODO,
        transform: transform
            ? `translate(${transform.x}px, ${transform.y}px)`
            : undefined,
    };
    return (
        <div
            ref={setNodeRef}
            style={estilo}
            {...listeners}
            {...attributes}
            className={`mc-cristal absolute cursor-grab touch-none px-2 py-1 text-left text-xs ${props.seleccionado ? "mc-neon" : ""}`}
        >
            <button
                type="button"
                className="cursor-pointer font-medium"
                onClick={() => props.onElegir(nodo.id)}
            >
                {etiquetaDe(nodo.tipo)} <span className="opacity-70">({nodo.id})</span>
            </button>
            <button
                type="button"
                aria-label={`Salida de ${nodo.id}`}
                className={`absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full bg-cyan-300 ${props.conectando ? "animate-pulse" : ""}`}
                onClick={(e) => { e.stopPropagation(); props.onSalida(nodo.id); }}
            />
            <button
                type="button"
                aria-label={`Entrada de ${nodo.id}`}
                className="absolute -left-2 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full bg-violet-300"
                onClick={(e) => { e.stopPropagation(); props.onEntrada(nodo.id); }}
            />
        </div>
    );
}

// ── Editor ─────────────────────────────────────────────────────────────────

export function EditorFlujos() {
    const [lista, setLista] = useState<ResumenFlujo[]>([]);
    const [flujo, setFlujo] = useState<FlujoUI | null>(null);
    const [seleccionado, setSeleccionado] = useState<string | null>(null);
    const [origenConexion, setOrigenConexion] = useState<string | null>(null);
    const [variables, setVariables] = useState<string[]>([]);
    const [aviso, setAviso] = useState("");
    const [vista, setVista] = useState({ escala: 1, x: 0, y: 0 });

    const cargarLista = useCallback(async () => {
        try {
            const res = await fetch("/api/mando/flujos", { cache: "no-store" });
            const datos: unknown = await res.json().catch(() => null);
            const cruda = datos && typeof datos === "object" ? (datos as Record<string, unknown>).flujos : null;
            setLista(Array.isArray(cruda) ? cruda as ResumenFlujo[] : []);
        } catch {
            setLista([]);
        }
    }, []);

    const cargarFlujo = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/mando/flujos?flujo=${encodeURIComponent(id)}`, { cache: "no-store" });
            const datos: unknown = await res.json().catch(() => null);
            const traducido = datos && typeof datos === "object"
                ? flujoDesdeServidor((datos as Record<string, unknown>).flujo)
                : null;
            setFlujo(traducido);
            setSeleccionado(null);
            setOrigenConexion(null);
        } catch {
            setFlujo(null);
        }
    }, []);

    useEffect(() => {
        void cargarLista();
        fetch("/api/mando/claves", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((datos: unknown) => {
                const claves = datos && typeof datos === "object" ? (datos as Record<string, unknown>).claves : null;
                if (Array.isArray(claves)) {
                    setVariables(claves
                        .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>).variable : null))
                        .filter((v): v is string => typeof v === "string"));
                }
            })
            .catch(() => undefined);
    }, [cargarLista]);

    const nodoSeleccionado = useMemo(
        () => flujo?.nodos.find((n) => n.id === seleccionado) ?? null,
        [flujo, seleccionado],
    );

    const actualizar = useCallback((cambio: (f: FlujoUI) => FlujoUI) => {
        setFlujo((actual) => (actual ? cambio(actual) : actual));
    }, []);

    const moverNodo = useCallback((evento: DragEndEvent) => {
        const delta = evento.delta;
        actualizar((f) => ({
            ...f,
            nodos: f.nodos.map((n) => n.id === String(evento.active.id)
                ? { ...n, posicion: { x: n.posicion.x + delta.x / vista.escala, y: n.posicion.y + delta.y / vista.escala } }
                : n),
        }));
    }, [actualizar, vista.escala]);

    const agregarNodo = useCallback((tipo: string) => {
        actualizar((f) => {
            const id = nuevoIdNodo(f.nodos, tipo);
            return {
                ...f,
                nodos: [...f.nodos, {
                    id,
                    tipo,
                    configuracion: {},
                    reintentos: 0,
                    espera_ms: 0,
                    posicion: { x: 40 + (f.nodos.length % 4) * 220, y: 40 + Math.floor(f.nodos.length / 4) * 120 },
                }],
            };
        });
    }, [actualizar]);

    const cambiarNodo = useCallback((cambios: Partial<NodoUI>) => {
        actualizar((f) => ({
            ...f,
            nodos: f.nodos.map((n) => (n.id === seleccionado ? { ...n, ...cambios } : n)),
        }));
    }, [actualizar, seleccionado]);

    const eliminarNodo = useCallback((id: string) => {
        actualizar((f) => ({
            ...f,
            nodos: f.nodos.filter((n) => n.id !== id),
            conexiones: f.conexiones.filter((c) => c.origen !== id && c.destino !== id),
        }));
        setSeleccionado(null);
    }, [actualizar]);

    const conectar = useCallback((destino: string) => {
        if (!origenConexion || origenConexion === destino) return;
        actualizar((f) => ({
            ...f,
            conexiones: [...f.conexiones.filter(
                (c) => !(c.origen === origenConexion && c.destino === destino)),
            { origen: origenConexion, destino }],
        }));
        setOrigenConexion(null);
    }, [actualizar, origenConexion]);

    const enviar = useCallback(async (accion: string, extra: Record<string, unknown> = {}) => {
        try {
            const res = await fetch("/api/mando/flujos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion, ...extra }),
            });
            const datos: unknown = await res.json().catch(() => null);
            if (!res.ok || !datos || typeof datos !== "object" || (datos as Record<string, unknown>).ok !== true) {
                setAviso(typeof (datos as Record<string, unknown> | null)?.error === "string"
                    ? (datos as Record<string, string>).error
                    : "La operación no se completó.");
                return false;
            }
            setAviso("");
            return true;
        } catch {
            setAviso("No se pudo hablar con Genesis.");
            return false;
        }
    }, []);

    const guardar = useCallback(async () => {
        if (!flujo) return;
        if (await enviar("guardar", { flujo: flujoParaServidor(flujo) })) {
            setAviso("Flujo guardado.");
            void cargarLista();
        }
    }, [enviar, flujo, cargarLista]);

    const ejecutar = useCallback(async () => {
        if (!flujo) return;
        if (await enviar("ejecutar", { id: flujo.id })) setAviso("Entrada manual dejada: el servicio la tomará en su próximo ciclo.");
    }, [enviar, flujo]);

    const activar = useCallback(async () => {
        if (!flujo) return;
        if (await enviar("activar", { id: flujo.id })) setAviso("Flujo activo: el servicio lo recoge con su disparador.");
    }, [enviar, flujo]);

    const duplicar = useCallback(async () => {
        if (!flujo) return;
        const copia: FlujoUI = { ...flujo, id: `${flujo.id}-copia`, nombre: `${flujo.nombre} (copia)` };
        if (await enviar("guardar", { flujo: flujoParaServidor(copia) })) {
            setAviso(`Duplicado como «${copia.id}».`);
            await cargarLista();
            void cargarFlujo(copia.id);
        }
    }, [enviar, flujo, cargarLista, cargarFlujo]);

    const crear = useCallback(() => {
        const id = nuevoIdNodo(
            lista.map((r) => ({ id: r.id, tipo: "set", configuracion: {}, reintentos: 0, espera_ms: 0, posicion: { x: 0, y: 0 } })),
            "flujo",
        );
        setFlujo({ id, nombre: "Flujo nuevo", nodos: [], conexiones: [] });
        setSeleccionado(null);
    }, [lista]);

    const nodosPorId = useMemo(() => new Map(flujo?.nodos.map((n) => [n.id, n]) ?? []), [flujo]);

    return (
        <section className="flex flex-col gap-3" aria-label="Editor de Flujos de Genesis">
            <div className="flex flex-wrap items-center gap-2">
                <select
                    aria-label="Flujo abierto"
                    className="mc-cristal cursor-pointer rounded px-2 py-1 text-sm"
                    value={flujo?.id ?? ""}
                    onChange={(e) => { if (e.target.value) void cargarFlujo(e.target.value); }}
                >
                    <option value="">— Elige un flujo —</option>
                    {lista.map((r) => (
                        <option key={r.id} value={r.id}>
                            {r.nombre} ({r.id}{r.disparador ? ` · ${r.disparador}` : ""})
                        </option>
                    ))}
                </select>
                <button type="button" className="mc-cristal mc-alzar cursor-pointer rounded px-3 py-1 text-sm" onClick={crear}>
                    Crear flujo
                </button>
                {flujo ? (
                    <>
                        <button type="button" className="mc-cristal mc-neon mc-alzar cursor-pointer rounded px-3 py-1 text-sm" onClick={() => void guardar()}>
                            Guardar
                        </button>
                        <button type="button" className="mc-cristal mc-neon--ok mc-alzar cursor-pointer rounded px-3 py-1 text-sm" onClick={() => void ejecutar()}>
                            Ejecutar
                        </button>
                        <button type="button" className="mc-cristal mc-alzar cursor-pointer rounded px-3 py-1 text-sm" onClick={() => void activar()}>
                            Activar
                        </button>
                        <button type="button" className="mc-cristal mc-alzar cursor-pointer rounded px-3 py-1 text-sm" onClick={() => void duplicar()}>
                            Duplicar
                        </button>
                    </>
                ) : null}
            </div>
            {aviso ? <p role="status" className="text-sm opacity-90">{aviso}</p> : null}

<div className="flex flex-wrap gap-1" aria-label="Paleta de tipos de nodo">
    {TIPOS_NODO.map((t) => (
        <button
            key={t.tipo}
            type="button"
            title={t.disparador ? "Disparador: arranca el flujo" : "Nodo de acción"}
            className={`mc-cristal mc-alzar cursor-pointer rounded px-2 py-1 text-xs ${t.disparador ? "mc-neon--aviso" : ""}`}
            onClick={() => agregarNodo(t.tipo)}
        >
            + {t.etiqueta}
        </button>
    ))}
</div>

{flujo ? (
    <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* Lienzo (escritorio). En pantallas estrechas se usa la lista. */}
            <div className="relative hidden h-[420px] overflow-hidden rounded-md border border-white/10 md:block"
                aria-label="Lienzo del flujo"
                onWheel={(e) => {
                    const factor = e.deltaY < 0 ? 1.1 : 0.9;
                    setVista((v) => ({ ...v, escala: Math.min(2, Math.max(0.5, v.escala * factor)) }));
                }}
            >
                <DndContext onDragEnd={moverNodo}>
                    <div
                        className="absolute origin-top-left"
                        style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.escala})` }}
                    >
                        <svg className="absolute left-0 top-0 h-[2000px] w-[2000px] overflow-visible" role="presentation">
                            {flujo.conexiones.map((c) => {
                                const o = nodosPorId.get(c.origen);
                                const d = nodosPorId.get(c.destino);
                                if (!o || !d) return null;
                                return (
                                    <path
                                        key={`${c.origen}-${c.destino}`}
                                        d={rutaConexion(puertoDe(o, "salida"), puertoDe(d, "entrada"))}
                                        fill="none"
                                        stroke="rgba(34,211,238,0.65)"
                                        strokeWidth={2}
                                        role="button"
                                        aria-label={`Quitar conexión de ${c.origen} a ${c.destino}`}
                                        className="cursor-pointer hover:stroke-violet-300"
                                        onClick={() => actualizar((f) => ({
                                            ...f,
                                            conexiones: f.conexiones.filter((x) => x !== c),
                                        }))}
                                    />
                                );
                            })}
                        </svg>
                        {flujo.nodos.map((nodo) => (
                            <NodoLienzo
                                key={nodo.id}
                                nodo={nodo}
                                escala={vista.escala}
                                seleccionado={seleccionado === nodo.id}
                                conectando={origenConexion === nodo.id}
                                onElegir={setSeleccionado}
                                onSalida={(id) => setOrigenConexion((actual) => (actual === id ? null : id))}
                                onEntrada={conectar}
                            />
                        ))}
                    </div>
                </DndContext>
                <div className="absolute bottom-2 right-2 flex gap-1">
                    <button type="button" aria-label="Acercar" className="mc-cristal cursor-pointer rounded px-2 py-1 text-sm"
                        onClick={() => setVista((v) => ({ ...v, escala: Math.min(2, v.escala * 1.2) }))}>+</button>
                    <button type="button" aria-label="Alejar" className="mc-cristal cursor-pointer rounded px-2 py-1 text-sm"
                        onClick={() => setVista((v) => ({ ...v, escala: Math.max(0.5, v.escala / 1.2) }))}>−</button>
                    <button type="button" aria-label="Centrar vista" className="mc-cristal cursor-pointer rounded px-2 py-1 text-sm"
                        onClick={() => setVista({ escala: 1, x: 0, y: 0 })}>⟲</button>
                </div>
            </div>

            {/* Lista de nodos (móvil, 360 px): orden y acceso al panel. */}
            <ul className="flex flex-col gap-1 md:hidden" aria-label="Lista de nodos">
                {flujo.nodos.map((nodo) => (
                    <li key={nodo.id} className="mc-cristal flex items-center justify-between rounded px-2 py-1 text-sm">
                        <span>{etiquetaDe(nodo.tipo)} <span className="opacity-70">({nodo.id})</span></span>
                        <span className="flex gap-1">
                            <button type="button" className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-xs"
                                onClick={() => setSeleccionado(nodo.id)}>Editar</button>
                            <button type="button" aria-label={`Eliminar ${nodo.id}`} className="mc-neon--peligro cursor-pointer rounded border border-white/15 px-2 py-0.5 text-xs"
                                onClick={() => eliminarNodo(nodo.id)}>×</button>
                        </span>
                    </li>
                ))}
                {flujo.nodos.length === 0 ? (
                    <li className="text-sm opacity-70">Añade nodos desde la paleta: un disparador y las acciones.</li>
                ) : null}
            </ul>
        </div>

        {nodoSeleccionado ? (
            <PanelNodo
                nodo={nodoSeleccionado}
                variables={variables}
                onCambiar={cambiarNodo}
                onEliminar={eliminarNodo}
                onCerrar={() => setSeleccionado(null)}
            />
        ) : null}
    </div>
) : (
    <p className="text-sm opacity-75">
        Elige un flujo guardado o crea uno nuevo. Los flujos viven en el disco del Genesis y
        el servicio los ejecuta cuando salta su disparador.
    </p>
)}

            <HistorialEjecuciones flujoId={flujo?.id ?? null} />
        </section>
    );
}

export default EditorFlujos;

