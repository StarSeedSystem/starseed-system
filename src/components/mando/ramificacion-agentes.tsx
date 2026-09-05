"use client";

/**
 * Ramificación multiagéntica (Ola 241 · Puente de Mando · pestaña «Procesos»)
 * ─────────────────────────────────────────────────────────────────────────────
 * El árbol vivo de cada ola, dibujado: las tareas en columnas por profundidad de
 * dependencias, con las flechas de qué depende de qué, y en cada tarea su rama de
 * producción: agente (modelo · proveedor · fase · tokens reales · ventana) → revisor
 * → commit. Las tareas vivas laten. Al pulsar una tarea se abre su ficha: pasos con
 * sus datos (qué modelo escribió, errores de tsc antes/después, tests, quién revisó,
 * sha), eventos del bus (reenrutados, proveedores caídos, cortes) y el contexto que
 * recibió el agente.
 *
 * Lee `GET /api/mando/ramificacion` cada 20 s (solo local) y, bajo demanda,
 * `GET /api/mando/contextos`.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronRight, GitCommit, Pause, Play, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";

import { DisenadorOla } from "@/components/mando/disenador-ola";
import { escuchar as escucharAsistente, tomarTareaPendiente } from "@/lib/mando/asistente-cliente";

import type { FotoEnjambre, LatidoTarea } from "@/lib/mando/tipos";
import type { RamaOla, RamaTarea, Ramificacion } from "@/lib/mando/ramificacion";

const INTERVALO_MS = 20_000;

/** Miles con punto, para tokens. */
function miles(n: number | undefined | null): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—";
    return n.toLocaleString("es-ES");
}

/** Hora local corta. */
function hora(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** Último tramo del id del modelo (`nvidia/moonshotai/kimi-k3` → `kimi-k3`). */
function corto(modelo: string): string {
    return (modelo || "").split("/").slice(-1)[0] || "—";
}

/** Tono por estado: lo que le pasa a la tarea, de un vistazo. */
function tonoEstado(estado: string): { borde: string; punto: string; texto: string; etiqueta: string } {
    switch (estado) {
        case "commit":
            return { borde: "border-emerald-400/40", punto: "bg-emerald-400", texto: "text-emerald-300", etiqueta: "integrada" };
        case "bloqueante":
            return { borde: "border-amber-400/50", punto: "bg-amber-400", texto: "text-amber-300", etiqueta: "integrada · revisión bloqueante" };
        case "en_curso":
            return { borde: "border-sky-400/60", punto: "bg-sky-400 animate-pulse", texto: "text-sky-300", etiqueta: "en curso" };
        case "sin_cambios":
        case "sustituida":
            return { borde: "border-white/15", punto: "bg-zinc-500", texto: "text-white/50", etiqueta: estado === "sustituida" ? "sustituida" : "sin cambios" };
        case "conflicto":
            return { borde: "border-orange-400/50", punto: "bg-orange-400", texto: "text-orange-300", etiqueta: "conflicto" };
        case "pendiente":
            return { borde: "border-white/10", punto: "bg-white/25", texto: "text-white/40", etiqueta: "pendiente" };
        case "reasignada":
            return { borde: "border-violet-400/40", punto: "bg-violet-400", texto: "text-violet-300", etiqueta: "movida de servidor" };
        default:
            if (estado.startsWith("fallo")) {
                return { borde: "border-rose-400/50", punto: "bg-rose-400", texto: "text-rose-300", etiqueta: estado.replace("_", " ") };
            }
            return { borde: "border-white/10", punto: "bg-white/25", texto: "text-white/50", etiqueta: estado || "—" };
    }
}

/** Color por fase del agente vivo. */
function tonoFase(fase: string): string {
    if (fase === "escribiendo") return "text-emerald-300";
    if (fase === "tsc" || fase === "tests") return "text-sky-300";
    if (fase === "revision" || fase === "integrando") return "text-amber-300";
    if (fase.startsWith("esperando")) return "text-white/50";
    return "text-white/70";
}

/** Barra de contexto: media de tokens de entrada por llamada frente a la ventana del modelo. */
function BarraVentana({ vivo }: { vivo: LatidoTarea }) {
    const ventana = vivo.ventana ?? 0;
    const llamadas = vivo.tokens?.llamadas ?? 0;
    const entrada = vivo.tokens?.entrada ?? 0;
    if (!ventana || !llamadas) return null;
    const media = entrada / llamadas;
    const pct = Math.min(100, Math.round((media / ventana) * 100));
    return (
        <div className="mt-1" title={`Media de ${miles(Math.round(media))} tokens de entrada por llamada sobre una ventana de ${miles(ventana)}`}>
            <div className="flex items-center justify-between text-[10px] text-white/40">
                <span>ventana {Math.round(ventana / 1024)}k</span>
                <span>{pct}% por llamada</span>
            </div>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-white/10">
                <div
                    className={`h-full ${pct > 80 ? "bg-rose-400" : pct > 50 ? "bg-amber-400" : "bg-sky-400"}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

/** Tarjeta de una tarea del árbol. */
function TarjetaTarea({
    tarea,
    seleccionada,
    onSeleccionar,
}: {
    tarea: RamaTarea;
    seleccionada: boolean;
    onSeleccionar: (id: string) => void;
}) {
    const tono = tonoEstado(tarea.estado);
    const vivo = tarea.vivo;
    return (
        <button
            type="button"
            data-tarea={tarea.id}
            onClick={() => onSeleccionar(tarea.id)}
            className={`w-60 cursor-pointer rounded-xl border bg-black/40 p-3 text-left backdrop-blur transition-colors duration-200 hover:bg-white/[0.05] ${tono.borde} ${
                seleccionada ? "ring-1 ring-white/40" : ""
            }`}
            aria-pressed={seleccionada}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-white">
                    <span className={`h-2 w-2 rounded-full ${tono.punto}`} aria-hidden />
                    {tarea.id}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-white/50">
                    {tarea.donde ? (
                        <span className={tarea.donde === "nube" ? "text-sky-300" : "text-amber-300"}>{tarea.donde}</span>
                    ) : null}
                    {tarea.medio ? (
                        <span className="text-violet-200" title="Desde dónde se usan las APIs (quién lanzó el orquestador)">· {tarea.medio}</span>
                    ) : null}
                    <span className={tono.texto}>{tono.etiqueta}</span>
                </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/75" title={tarea.titulo}>
                {tarea.titulo}
            </p>
            {vivo ? (
                <div className="mt-2 rounded-lg border border-sky-400/20 bg-sky-500/10 px-2 py-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className={`flex items-center gap-1 font-medium ${tonoFase(vivo.fase)}`}>
                            <Bot className="h-3 w-3" aria-hidden />
                            {vivo.fase}
                            {vivo.quietoSegundos > 180 ? ` · mudo ${Math.round(vivo.quietoSegundos / 60)} min` : ""}
                        </span>
                        <span className="text-white/50">{vivo.minutos} min</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/70">
                        {corto(vivo.modelo)}
                        {vivo.proveedor ? <span className="text-white/40"> · {vivo.proveedor}</span> : null}
                        {vivo.intento && vivo.intento > 1 ? <span className="text-white/40"> · intento {vivo.intento}</span> : null}
                    </div>
                    {vivo.tokens ? (
                        <div className="mt-0.5 font-mono text-[10px] text-white/60">
                            {miles(vivo.tokens.entrada)} in · {miles(vivo.tokens.salida)} out · {vivo.tokens.llamadas} llamadas
                        </div>
                    ) : (
                        <div className="mt-0.5 text-[10px] text-white/40">tokens aún no medidos</div>
                    )}
                    <BarraVentana vivo={vivo} />
                </div>
            ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-white/50">
                    <span className="flex items-center gap-1" title={tarea.modelo || "sin agente"}>
                        <Bot className="h-3 w-3" aria-hidden />
                        {corto(tarea.modelo)}
                        {tarea.proveedor ? <span className="text-white/35">·{tarea.proveedor}</span> : null}
                    </span>
                    <ChevronRight className="h-3 w-3 text-white/25" aria-hidden />
                    <span className="flex items-center gap-1" title={tarea.revisor || "sin revisor"}>
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        {corto(tarea.revisor)}
                    </span>
                    <ChevronRight className="h-3 w-3 text-white/25" aria-hidden />
                    <span className="flex items-center gap-1 font-mono">
                        <GitCommit className="h-3 w-3" aria-hidden />
                        {tarea.sha || "—"}
                    </span>
                </div>
            )}
        </button>
    );
}

/** Flechas de dependencia entre tarjetas (medidas tras pintar). */
interface Arista {
    id: string;
    d: string;
}

export function ArbolOla({
    ola,
    seleccion,
    onSeleccionar,
}: {
    ola: RamaOla;
    seleccion: string | null;
    onSeleccionar: (id: string) => void;
}) {
    const contenedor = useRef<HTMLDivElement | null>(null);
    const [aristas, setAristas] = useState<Arista[]>([]);
    const [tamano, setTamano] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

    const columnas = useMemo(() => {
        const porNivel = new Map<number, RamaTarea[]>();
        for (const t of ola.tareas) {
            const lista = porNivel.get(t.nivel) ?? [];
            lista.push(t);
            porNivel.set(t.nivel, lista);
        }
        return [...porNivel.entries()].sort((a, b) => a[0] - b[0]);
    }, [ola]);

    const medir = useCallback(() => {
        const raiz = contenedor.current;
        if (!raiz) return;
        const base = raiz.getBoundingClientRect();
        const pos = new Map<string, DOMRect>();
        raiz.querySelectorAll<HTMLElement>("[data-tarea]").forEach((el) => {
            const id = el.dataset.tarea;
            if (id) pos.set(id, el.getBoundingClientRect());
        });
        const nuevas: Arista[] = [];
        for (const t of ola.tareas) {
            const a = pos.get(t.id);
            if (!a) continue;
            for (const dep of t.dependencias) {
                const de = pos.get(dep);
                if (!de) continue;
                const x1 = de.right - base.left + raiz.scrollLeft;
                const y1 = de.top + de.height / 2 - base.top + raiz.scrollTop;
                const x2 = a.left - base.left + raiz.scrollLeft;
                const y2 = a.top + a.height / 2 - base.top + raiz.scrollTop;
                const cx = (x1 + x2) / 2;
                nuevas.push({ id: `${dep}->${t.id}`, d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}` });
            }
        }
        setAristas(nuevas);
        setTamano({ w: raiz.scrollWidth, h: raiz.scrollHeight });
    }, [ola]);

    useLayoutEffect(() => {
        medir();
        const raiz = contenedor.current;
        if (!raiz || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => medir());
        ro.observe(raiz);
        return () => ro.disconnect();
    }, [medir]);

    return (
        <div ref={contenedor} className="relative overflow-x-auto pb-2">
            <svg
                className="pointer-events-none absolute left-0 top-0"
                width={tamano.w}
                height={tamano.h}
                aria-hidden
            >
                <defs>
                    <marker id="flecha-dep" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 z" fill="rgba(255,255,255,0.35)" />
                    </marker>
                </defs>
                {aristas.map((a) => (
                    <path
                        key={a.id}
                        d={a.d}
                        fill="none"
                        stroke="rgba(255,255,255,0.28)"
                        strokeWidth={1.2}
                        markerEnd="url(#flecha-dep)"
                    />
                ))}
            </svg>
            <div className="relative flex items-start gap-10">
                {columnas.map(([nivel, tareas]) => (
                    <div key={`nivel-${nivel}`} className="flex shrink-0 flex-col gap-3">
                        <span className="text-[10px] uppercase tracking-wide text-white/30">
                            {nivel === 0 ? "raíz" : `depende de ${nivel} nivel${nivel > 1 ? "es" : ""}`}
                        </span>
                        {tareas.map((t) => (
                            <TarjetaTarea
                                key={t.id}
                                tarea={t}
                                seleccionada={seleccion === t.id}
                                onSeleccionar={onSeleccionar}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Contexto que recibió un agente (de `GET /api/mando/contextos`). */
interface ContextoResumen {
    tarea: string;
    area: string;
    documentos: string[];
    reglas: string[];
    habilidades: string[];
    fuentes: string[];
    caracteres: number;
    archivos: string[];
}

/** APIs con las que el orquestador puede escribir (opencode las tiene cableadas). */
const APIS_ESCRITORAS = ["xkiro", "nim", "aihubmix", "tokenrouter", "openrouter"];

interface ModeloCatalogo {
    id: string;
    proveedor: string;
    nombre: string;
    salud: string;
    contexto: number | null;
}

/**
 * Cambiar el servidor (Mac ⇄ nube) o el modelo/API de UNA tarea, conservando el flujo:
 * el orquestador corta la escritura en curso y sigue con el nuevo modelo por el mismo
 * camino (tsc → tests → revisión → integración); si cambia de servidor, la tarea y sus
 * dependientes pendientes se sueltan aquí y se lanzan allí como cola nueva.
 */
function ReasignarTarea({ tarea, estadosOla, onHecho }: { tarea: RamaTarea; estadosOla: Record<string, string>; onHecho: () => void }) {
    const dondeActual: "mac" | "nube" = tarea.donde === "nube" ? "nube" : "mac";
    const [abierto, setAbierto] = useState(false);
    const [modelos, setModelos] = useState<ModeloCatalogo[] | null>(null);
    const [donde, setDonde] = useState<"mac" | "nube">(dondeActual);
    const [api, setApi] = useState<string>(tarea.proveedor && APIS_ESCRITORAS.includes(tarea.proveedor) ? tarea.proveedor : "xkiro");
    const [modelo, setModelo] = useState<string>("");
    const [confirmando, setConfirmando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

    useEffect(() => {
        setDonde(dondeActual);
        setResultado(null);
        setConfirmando(false);
    }, [tarea.id, dondeActual]);

    const abrir = useCallback(async () => {
        setAbierto(true);
        if (modelos !== null) return;
        try {
            const r = await fetch("/api/mando/modelos", { cache: "no-store" });
            const cuerpo = (await r.json()) as { modelos?: ModeloCatalogo[] };
            setModelos((cuerpo.modelos ?? []).filter((m) => APIS_ESCRITORAS.includes(m.proveedor)));
        } catch {
            setModelos([]);
        }
    }, [modelos]);

    const deLaApi = useMemo(() => (modelos ?? []).filter((m) => m.proveedor === api), [modelos, api]);
    const cambiaServidor = donde !== dondeActual;
    const listo = cambiaServidor || modelo !== "";
    const terminada = ["commit", "bloqueante", "sin_cambios", "sustituida", "reasignada"].includes(tarea.estado);

    const aplicar = useCallback(async () => {
        setEnviando(true);
        setResultado(null);
        try {
            const r = await fetch("/api/mando/colas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "reasignar", nombre: tarea.cola, tarea: tarea.id, dondeActual, donde, modelo: modelo || undefined, estados: estadosOla }),
            });
            const cuerpo = (await r.json()) as { ok?: boolean; error?: string; detalle?: string };
            setResultado({ ok: Boolean(cuerpo.ok), texto: cuerpo.ok ? cuerpo.detalle ?? "Hecho." : cuerpo.error ?? `HTTP ${r.status}` });
            if (cuerpo.ok) onHecho();
        } catch {
            setResultado({ ok: false, texto: "No se pudo enviar la orden." });
        } finally {
            setEnviando(false);
            setConfirmando(false);
        }
    }, [tarea.cola, tarea.id, dondeActual, donde, modelo, estadosOla, onHecho]);

    if (!tarea.cola) return null;
    if (!abierto) {
        return (
            <button
                type="button"
                onClick={() => void abrir()}
                className="cursor-pointer rounded-md border border-violet-400/30 px-2 py-1 text-xs text-violet-200 hover:bg-violet-400/10"
                title="Cambiar el servidor, el modelo o la API de esta tarea conservando el flujo"
            >
                Reasignar
            </button>
        );
    }
    return (
        <div className="mt-3 rounded-lg border border-violet-400/25 bg-violet-400/[0.04] p-3" data-testid="reasignar-tarea">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-[11px] font-medium uppercase tracking-wide text-violet-200/80">
                    Reasignar {tarea.id} · ahora en {dondeActual}{tarea.modelo ? ` con ${corto(tarea.modelo)}` : " (rotación)"}
                </h5>
                <button type="button" onClick={() => setAbierto(false)} className="cursor-pointer text-[11px] text-white/50 hover:text-white/80">
                    cerrar
                </button>
            </div>
            {terminada ? (
                <p className="mt-1 text-[11px] text-white/50">
                    La tarea ya terminó ({tonoEstado(tarea.estado).etiqueta}): reasignarla la vuelve a ejecutar desde cero en el servidor elegido.
                </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-end gap-3 text-xs">
                <label className="flex flex-col gap-1 text-white/60">
                    Servidor
                    <select value={donde} onChange={(e) => setDonde(e.target.value === "nube" ? "nube" : "mac")} className="cursor-pointer rounded-md border border-white/10 bg-black/50 px-2 py-1 text-white" aria-label="Servidor de la tarea">
                        <option value="mac">Mac (esta máquina)</option>
                        <option value="nube">Nube (contenedor)</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-white/60">
                    API
                    <select value={api} onChange={(e) => { setApi(e.target.value); setModelo(""); }} className="cursor-pointer rounded-md border border-white/10 bg-black/50 px-2 py-1 text-white" aria-label="API del agente">
                        {APIS_ESCRITORAS.map((a) => {
                            const n = (modelos ?? []).filter((m) => m.proveedor === a);
                            const salud = n[0]?.salud ?? "";
                            return (
                                <option key={a} value={a}>{a}{n.length ? ` · ${n.length}` : ""}{salud === "caido" ? " · caída" : salud === "sin-clave" ? " · sin clave" : ""}</option>
                            );
                        })}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-white/60">
                    Modelo
                    <select value={modelo} onChange={(e) => setModelo(e.target.value)} className="max-w-[280px] cursor-pointer rounded-md border border-white/10 bg-black/50 px-2 py-1 text-white" aria-label="Modelo del agente">
                        <option value="">{modelos === null ? "cargando…" : "(rotación del orquestador)"}</option>
                        {deLaApi.map((m) => (
                            <option key={m.id} value={m.id} disabled={m.salud === "sin-clave"}>
                                {m.nombre}{m.contexto ? ` · ${Math.round(m.contexto / 1024)}k` : ""}{m.salud === "caido" ? " · caído" : ""}
                            </option>
                        ))}
                    </select>
                </label>
                {!confirmando ? (
                    <button
                        type="button"
                        disabled={!listo || enviando}
                        onClick={() => setConfirmando(true)}
                        className="cursor-pointer rounded-md border border-violet-400/40 bg-violet-500/20 px-3 py-1 text-violet-100 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Aplicar
                    </button>
                ) : (
                    <span className="flex items-center gap-2">
                        <span className="text-white/70">
                            {cambiaServidor
                                ? `¿Mover ${tarea.id} (y sus dependientes pendientes) de ${dondeActual} a ${donde}${modelo ? ` con ${corto(modelo)}` : ""}?`
                                : `¿Cambiar ${tarea.id} a ${corto(modelo)} en ${dondeActual}?`}
                        </span>
                        <button type="button" disabled={enviando} onClick={() => void aplicar()} className="cursor-pointer rounded-md bg-violet-500/40 px-2 py-1 text-white hover:bg-violet-500/60 disabled:opacity-50">
                            {enviando ? "enviando…" : "sí"}
                        </button>
                        <button type="button" disabled={enviando} onClick={() => setConfirmando(false)} className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-white/70 hover:bg-white/5">
                            no
                        </button>
                    </span>
                )}
            </div>
            <p className="mt-2 text-[11px] text-white/45">
                El flujo no cambia: escritura → tsc → tests → revisión → integración. Al cambiar de servidor, el otro debe tener `main` al día (paquete) para que las dependencias ya integradas existan allí.
            </p>
            {resultado ? (
                <p className={`mt-2 text-xs ${resultado.ok ? "text-emerald-300" : "text-rose-300"}`} data-testid="reasignar-resultado">{resultado.texto}</p>
            ) : null}
        </div>
    );
}

/** Ficha de la tarea seleccionada: pasos, eventos, modelos fallidos y contexto. */
function FichaTarea({ tarea, estadosOla, onCerrar, onCambio }: { tarea: RamaTarea; estadosOla: Record<string, string>; onCerrar: () => void; onCambio: () => void }) {
    const [contexto, setContexto] = useState<ContextoResumen | null | "cargando" | "sin">(null);
    const tono = tonoEstado(tarea.estado);

    const cargarContexto = useCallback(async () => {
        setContexto("cargando");
        try {
            const r = await fetch("/api/mando/contextos", { cache: "no-store" });
            if (!r.ok) {
                setContexto("sin");
                return;
            }
            const cuerpo = (await r.json()) as { contextos?: unknown[] };
            const lista = Array.isArray(cuerpo.contextos) ? cuerpo.contextos : [];
            const mio = lista
                .map((c) => c as Partial<ContextoResumen>)
                .find((c) => c.tarea === tarea.id);
            setContexto(
                mio
                    ? {
                          tarea: tarea.id,
                          area: mio.area ?? "",
                          documentos: mio.documentos ?? [],
                          reglas: mio.reglas ?? [],
                          habilidades: mio.habilidades ?? [],
                          fuentes: mio.fuentes ?? [],
                          caracteres: mio.caracteres ?? 0,
                          archivos: mio.archivos ?? [],
                      }
                    : "sin",
            );
        } catch {
            setContexto("sin");
        }
    }, [tarea.id]);

    return (
        <section className={`rounded-xl border bg-black/40 p-4 backdrop-blur ${tono.borde}`}>
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <span className={`h-2 w-2 rounded-full ${tono.punto}`} aria-hidden />
                        <span className="font-mono">{tarea.id}</span>
                        <span className={`text-xs font-normal ${tono.texto}`}>{tono.etiqueta}</span>
                        {tarea.donde ? (
                            <span className={`text-xs font-normal ${tarea.donde === "nube" ? "text-sky-300" : "text-amber-300"}`}>
                                · {tarea.donde}
                            </span>
                        ) : null}
                        {tarea.medio ? (
                            <span className="text-xs font-normal text-violet-200" title="Desde dónde se usan las APIs">· desde {tarea.medio}</span>
                        ) : null}
                    </h4>
                    <p className="mt-1 text-sm text-white/80">{tarea.titulo}</p>
                    <p className="mt-1 text-[11px] text-white/50">
                        {tarea.ola}
                        {tarea.dependencias.length ? ` · depende de ${tarea.dependencias.join(", ")}` : " · sin dependencias"}
                        {tarea.segundos ? ` · ${Math.round(tarea.segundos / 60)} min` : ""}
                        {tarea.nota ? ` · ${tarea.nota}` : ""}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ReasignarTarea tarea={tarea} estadosOla={estadosOla} onHecho={onCambio} />
                    <button
                        type="button"
                        onClick={onCerrar}
                        className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/5"
                    >
                        Cerrar
                    </button>
                </div>
            </header>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <h5 className="text-[11px] font-medium uppercase tracking-wide text-white/50">Rama de producción</h5>
                    <ul className="mt-2 space-y-1 text-xs text-white/80">
                        <li className="flex items-center gap-2">
                            <Bot className="h-3.5 w-3.5 text-white/50" aria-hidden />
                            <span>
                                {tarea.modelo || "sin agente todavía"}
                                {tarea.proveedor ? <span className="text-white/40"> · {tarea.proveedor}</span> : null}
                            </span>
                        </li>
                        <li className="flex items-center gap-2">
                            <ShieldCheck className="h-3.5 w-3.5 text-white/50" aria-hidden />
                            <span>{tarea.revisor || "sin revisión"}</span>
                        </li>
                        <li className="flex items-center gap-2 font-mono">
                            <GitCommit className="h-3.5 w-3.5 text-white/50" aria-hidden />
                            <span>{tarea.sha || "sin commit"}</span>
                        </li>
                    </ul>
                    {tarea.modelosFallidos.length ? (
                        <p className="mt-2 text-[11px] text-rose-200/80">
                            Modelos que ya fallaron aquí: {tarea.modelosFallidos.map(corto).join(", ")}
                        </p>
                    ) : null}
                    {tarea.vivo ? (
                        <div className="mt-2 text-[11px] text-white/70">
                            Ahora: <span className={tonoFase(tarea.vivo.fase)}>{tarea.vivo.fase}</span> · {corto(tarea.vivo.modelo)}
                            {tarea.vivo.tokens
                                ? ` · ${miles(tarea.vivo.tokens.entrada)} in / ${miles(tarea.vivo.tokens.salida)} out / ${miles(
                                      tarea.vivo.tokens.razonamiento,
                                  )} razonamiento / ${miles(tarea.vivo.tokens.cacheLeida)} caché · ${tarea.vivo.tokens.llamadas} llamadas`
                                : ""}
                            {tarea.vivo.ventana ? ` · ventana ${Math.round(tarea.vivo.ventana / 1024)}k` : ""}
                            {tarea.vivo.bytesLog ? ` · registro ${Math.round(tarea.vivo.bytesLog / 1024)} KB` : ""}
                        </div>
                    ) : null}
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <h5 className="text-[11px] font-medium uppercase tracking-wide text-white/50">Pasos</h5>
                    {tarea.pasos.length === 0 ? (
                        <p className="mt-2 text-xs text-white/40">Sin pasos registrados todavía.</p>
                    ) : (
                        <ol className="mt-2 space-y-1.5 text-xs">
                            {tarea.pasos.map((p, i) => (
                                <li key={`${p.paso}-${p.t}-${i}`} className="text-white/80">
                                    <span className="text-white/40">{hora(p.t)}</span>{" "}
                                    <span className="font-medium text-white">{p.paso}</span>
                                    <span className="text-white/40"> · {p.donde}</span>
                                    <div className="font-mono text-[10px] text-white/55">
                                        {Object.entries(p.datos)
                                            .map(([k, v]) => `${k}=${String(v).slice(0, 48)}`)
                                            .join(" · ")}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <h5 className="text-[11px] font-medium uppercase tracking-wide text-white/50">Eventos</h5>
                    {tarea.eventos.length === 0 ? (
                        <p className="mt-2 text-xs text-white/40">Sin eventos en el bus para esta tarea.</p>
                    ) : (
                        <ul className="mt-2 space-y-1 text-xs">
                            {tarea.eventos.map((e, i) => (
                                <li key={`${e.tipo}-${e.t}-${i}`} className="text-white/75">
                                    <span className="text-white/40">{hora(e.t)}</span>{" "}
                                    <span
                                        className={
                                            e.tipo === "commit"
                                                ? "text-emerald-300"
                                                : e.tipo.startsWith("fallo") || e.tipo === "estancado"
                                                  ? "text-rose-300"
                                                  : e.tipo === "reenrutado" || e.tipo === "proveedor"
                                                    ? "text-amber-300"
                                                    : "text-white/60"
                                        }
                                    >
                                        {e.tipo}
                                    </span>{" "}
                                    {e.texto}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                    <h5 className="text-[11px] font-medium uppercase tracking-wide text-white/50">Contexto que recibió el agente</h5>
                    {contexto === null ? (
                        <button
                            type="button"
                            onClick={() => void cargarContexto()}
                            className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                        >
                            Ver contexto
                        </button>
                    ) : null}
                </div>
                {contexto === "cargando" ? (
                    <p className="mt-2 text-xs text-white/40">Leyendo el contexto…</p>
                ) : contexto === "sin" ? (
                    <p className="mt-2 text-xs text-white/40">
                        No hay contexto guardado para esta tarea en esta máquina (si corrió en la nube, su contexto vive allí).
                    </p>
                ) : contexto && contexto !== null ? (
                    <div className="mt-2 grid gap-2 text-xs text-white/75 sm:grid-cols-2">
                        <p>
                            <span className="text-white/45">Área:</span> {contexto.area || "—"} ·{" "}
                            <span className="text-white/45">tamaño:</span> {miles(contexto.caracteres)} caracteres
                        </p>
                        <p>
                            <span className="text-white/45">Archivos:</span> {contexto.archivos.join(", ") || "—"}
                        </p>
                        <p>
                            <span className="text-white/45">Documentos:</span> {contexto.documentos.join(", ") || "—"}
                        </p>
                        <p>
                            <span className="text-white/45">Habilidades:</span> {contexto.habilidades.join(", ") || "—"}
                        </p>
                        <p className="sm:col-span-2">
                            <span className="text-white/45">Fuentes externas:</span> {contexto.fuentes.join(" · ") || "—"}
                        </p>
                        {contexto.reglas.length ? (
                            <ul className="sm:col-span-2 list-disc space-y-0.5 pl-4 text-white/65">
                                {contexto.reglas.slice(0, 6).map((r, i) => (
                                    <li key={`regla-${i}`}>{r}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

/** Orden de fila de una tarea: primero lo vivo, luego lo pendiente por nivel, luego lo cerrado. */
function pesoFila(t: RamaTarea): number {
    if (t.vivo) return 0;
    if (t.estado === "en_curso") return 1;
    if (t.estado === "pendiente") return 2;
    return 3;
}

function etiquetaCorta(t: RamaTarea): string {
    const tono = tonoEstado(t.estado);
    return tono.etiqueta;
}

/**
 * Filas de procesos: la lista ORDENADA de la ola (qué va antes, qué espera a qué) y la fila
 * de cada agente vivo (qué está escribiendo y qué tiene detrás). Complementa el árbol: el
 * árbol enseña las dependencias; la fila enseña el turno.
 */
function FilasDeProcesos({ olas, olaSel, latidos, enjambres, onVer }: {
    olas: RamaOla[];
    olaSel: RamaOla;
    latidos: LatidoTarea[];
    enjambres: FotoEnjambre[];
    onVer: (id: string) => void;
}) {
    const hechas = new Set(olaSel.tareas.filter((t) => ["commit", "bloqueante", "sin_cambios", "sustituida", "reasignada"].includes(t.estado)).map((t) => t.id));
    const filaOla = [...olaSel.tareas].sort((a, b) => pesoFila(a) - pesoFila(b) || a.nivel - b.nivel || a.id.localeCompare(b.id, undefined, { numeric: true }));

    // Agentes: cada orquestador vivo (donde · cola · medio) con su fila; y las colas con tareas
    // pendientes sin nadie vivo, para que se vea lo que espera un lanzamiento.
    const todas = olas.flatMap((o) => o.tareas);
    const porCola = new Map<string, RamaTarea[]>();
    for (const t of todas) {
        if (!t.cola) continue;
        const lista = porCola.get(t.cola) ?? [];
        lista.push(t);
        porCola.set(t.cola, lista);
    }
    const agentes = enjambres.map((e) => {
        const cola = e.cola.replace(/^cola-/, "").replace(/\.json$/, "");
        const tareas = porCola.get(cola) ?? [];
        const vivas = latidos.filter((l) => l.cola.replace(/^cola-/, "").replace(/\.json$/, "") === cola && l.donde === e.donde);
        return { clave: `${e.donde}|${cola}`, donde: e.donde, cola, medio: e.medio, vivas, tareas, t: e.t, integradas: e.integradas };
    });
    const colasVivas = new Set(agentes.map((a) => a.cola));
    const sinAgente = [...porCola.entries()]
        .filter(([cola, tareas]) => !colasVivas.has(cola) && tareas.some((t) => t.estado === "pendiente" || t.estado === "en_curso"))
        .map(([cola, tareas]) => ({ cola, tareas }));

    const Fila = ({ tareas, marcarHechas }: { tareas: RamaTarea[]; marcarHechas: Set<string> }) => (
        <ol className="mt-2 space-y-1 text-xs">
            {tareas.map((t, i) => {
                const tono = tonoEstado(t.estado);
                const espera = t.estado === "pendiente" ? t.dependencias.filter((d) => !marcarHechas.has(d)) : [];
                return (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="w-5 text-right font-mono text-white/35">{i + 1}.</span>
                        <button type="button" onClick={() => onVer(t.id)} className="cursor-pointer font-mono font-medium text-white hover:underline" title="Abrir la ficha">
                            {t.id}
                        </button>
                        <span className={`h-1.5 w-1.5 rounded-full ${tono.punto}`} aria-hidden />
                        <span className={tono.texto}>{etiquetaCorta(t)}</span>
                        {t.vivo ? (
                            <span className={tonoFase(t.vivo.fase)}>{t.vivo.fase} · {corto(t.vivo.modelo)}{t.vivo.minutos ? ` · ${t.vivo.minutos} min` : ""}</span>
                        ) : t.modelo ? (
                            <span className="text-white/45">{corto(t.modelo)}{t.proveedor ? ` · ${t.proveedor}` : ""}</span>
                        ) : null}
                        {t.donde ? <span className={t.donde === "nube" ? "text-sky-300/80" : "text-amber-300/80"}>{t.donde}{t.medio ? ` · ${t.medio}` : ""}</span> : null}
                        {espera.length ? <span className="text-white/40">espera {espera.join(", ")}</span> : null}
                        {t.sha ? <span className="font-mono text-white/35">{t.sha}</span> : null}
                        <span className="truncate text-white/50" title={t.titulo}>· {t.titulo}</span>
                    </li>
                );
            })}
        </ol>
    );

    return (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="filas-procesos">
            <section className="rounded-xl border border-white/10 bg-black/30 p-3">
                <h4 className="text-[11px] font-medium uppercase tracking-wide text-white/50">
                    Fila de la ola · {olaSel.id} · {olaSel.tareas.length} tareas
                </h4>
                <p className="mt-1 text-[11px] text-white/40">Turno real: primero lo que late, luego lo pendiente por nivel de dependencias, al final lo cerrado.</p>
                <Fila tareas={filaOla} marcarHechas={hechas} />
            </section>
            <section className="rounded-xl border border-white/10 bg-black/30 p-3">
                <h4 className="text-[11px] font-medium uppercase tracking-wide text-white/50">Fila por agente · {agentes.length} vivo{agentes.length === 1 ? "" : "s"}</h4>
                {agentes.length === 0 && sinAgente.length === 0 ? (
                    <p className="mt-2 text-xs text-white/40">Ningún orquestador vivo y ninguna cola con tareas pendientes.</p>
                ) : null}
                {agentes.map((a) => {
                    const hechasCola = new Set(a.tareas.filter((t) => ["commit", "bloqueante", "sin_cambios", "sustituida", "reasignada"].includes(t.estado)).map((t) => t.id));
                    const fila = [...a.tareas]
                        .filter((t) => t.vivo || t.estado === "en_curso" || t.estado === "pendiente")
                        .sort((x, y) => pesoFila(x) - pesoFila(y) || x.nivel - y.nivel || x.id.localeCompare(y.id, undefined, { numeric: true }));
                    return (
                        <div key={a.clave} className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className={`font-medium ${a.donde === "nube" ? "text-sky-300" : "text-amber-300"}`}>{a.donde}</span>
                                {a.medio ? <span className="text-violet-200">desde {a.medio}</span> : null}
                                <span className="font-mono text-white/70">cola-{a.cola}</span>
                                <span className="text-white/45">{a.vivas.length} escribiendo · {fila.filter((t) => t.estado === "pendiente").length} en fila · {a.integradas} integradas</span>
                            </div>
                            {fila.length ? <Fila tareas={fila} marcarHechas={hechasCola} /> : <p className="mt-1 text-[11px] text-white/40">Sin tareas en fila: está cerrando.</p>}
                        </div>
                    );
                })}
                {sinAgente.map((c) => {
                    const hechasCola = new Set(c.tareas.filter((t) => ["commit", "bloqueante", "sin_cambios", "sustituida", "reasignada"].includes(t.estado)).map((t) => t.id));
                    const fila = c.tareas.filter((t) => t.estado === "pendiente" || t.estado === "en_curso").sort((x, y) => x.nivel - y.nivel || x.id.localeCompare(y.id, undefined, { numeric: true }));
                    return (
                        <div key={`sin-${c.cola}`} className="mt-2 rounded-lg border border-dashed border-white/10 p-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="text-white/50">sin agente vivo</span>
                                <span className="font-mono text-white/70">cola-{c.cola}</span>
                                <span className="text-white/45">{fila.length} esperan un lanzamiento (Diseñar ola → importar)</span>
                            </div>
                            <Fila tareas={fila} marcarHechas={hechasCola} />
                        </div>
                    );
                })}
            </section>
        </div>
    );
}

export function RamificacionAgentes() {
    const [datos, setDatos] = useState<Ramificacion | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cuantas, setCuantas] = useState(4);
    const [olaSel, setOlaSel] = useState<string | null>(null);
    const [tareaSel, setTareaSel] = useState<string | null>(null);
    const [pausado, setPausado] = useState(false);
    const [actualizado, setActualizado] = useState<string>("");
    const [disenando, setDisenando] = useState(false);

    const recargar = useCallback(async () => {
        try {
            const r = await fetch(`/api/mando/ramificacion?olas=${cuantas}`, { cache: "no-store" });
            if (!r.ok) {
                setError(
                    r.status === 404
                        ? "La consola está apagada en esta instancia."
                        : r.status === 401
                          ? "Necesitas iniciar sesión."
                          : `No se pudo leer la ramificación (HTTP ${r.status}).`,
                );
                return;
            }
            setDatos((await r.json()) as Ramificacion);
            setError(null);
            setActualizado(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        } catch {
            setError("No se pudo leer la ramificación.");
        }
    }, [cuantas]);

    useEffect(() => {
        void recargar();
    }, [recargar]);

    useEffect(() => {
        if (pausado) return;
        const id = window.setInterval(() => void recargar(), INTERVALO_MS);
        return () => window.clearInterval(id);
    }, [pausado, recargar]);

    // El asistente puede pedir «ver tarea»: se selecciona la ola que la contiene y la tarea.
    // Si la petición llegó antes de montarse esta pestaña, queda apuntada y se atiende aquí.
    useEffect(() => {
        const abrir = (id: string) => {
            const ola = (datos?.olas ?? []).find((o) => o.tareas.some((t) => t.id === id));
            if (ola) setOlaSel(ola.id);
            setTareaSel(id);
        };
        if (datos) {
            const pendiente = tomarTareaPendiente();
            if (pendiente) abrir(pendiente);
        }
        return escucharAsistente((aviso) => {
            if (aviso.tipo === "tarea" && aviso.tareaId) abrir(aviso.tareaId);
        });
    }, [datos]);

    const olas = datos?.olas ?? [];
    const ola = useMemo(() => {
        if (olas.length === 0) return null;
        return olas.find((o) => o.id === olaSel) ?? olas[0];
    }, [olas, olaSel]);
    const tarea = useMemo(() => ola?.tareas.find((t) => t.id === tareaSel) ?? null, [ola, tareaSel]);

    const vivos = datos?.latidos.length ?? 0;

    return (
        <section className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-white">Ramificación multiagéntica</h3>
                    <p className="text-[11px] text-white/50">
                        Tareas por dependencias · agente → revisor → commit · {vivos} agente{vivos === 1 ? "" : "s"} vivo{vivos === 1 ? "" : "s"}
                        {actualizado ? ` · actualizado ${actualizado}` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {[4, 8, 30].map((n) => (
                        <button
                            key={`cuantas-${n}`}
                            type="button"
                            onClick={() => setCuantas(n)}
                            className={`cursor-pointer rounded-md border px-2 py-1 ${
                                cuantas === n ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/60 hover:bg-white/5"
                            }`}
                        >
                            {n === 30 ? "todas" : `${n} olas`}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setDisenando((d) => !d)}
                        className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 ${
                            disenando ? "border-violet-400/60 bg-violet-500/15 text-white" : "border-white/10 text-white/70 hover:bg-white/5"
                        }`}
                        title="Crear o corregir una ola: tareas, dependencias, modelo; guardar y lanzar"
                    >
                        <Wand2 className="h-3 w-3" aria-hidden />
                        Diseñar ola
                    </button>
                    <button
                        type="button"
                        onClick={() => setPausado((p) => !p)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/70 hover:bg-white/5"
                        title={pausado ? "Reanudar la actualización cada 20 s" : "Pausar la actualización automática"}
                    >
                        {pausado ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />}
                        {pausado ? "Reanudar" : "En vivo"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void recargar()}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-white/70 hover:bg-white/5"
                    >
                        <RefreshCw className="h-3 w-3" aria-hidden />
                        Actualizar
                    </button>
                </div>
            </header>

            {error ? (
                <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</p>
            ) : null}

            {disenando ? (
                <div className="mt-3">
                    <DisenadorOla onCerrar={() => setDisenando(false)} />
                </div>
            ) : null}

            {olas.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {olas.map((o) => {
                        const activa = ola?.id === o.id;
                        return (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => {
                                    setOlaSel(o.id);
                                    setTareaSel(null);
                                }}
                                className={`cursor-pointer rounded-md border px-2 py-1 text-[11px] transition-colors duration-150 ${
                                    activa ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/60 hover:bg-white/5"
                                }`}
                                title={`${o.hechas} integradas · ${o.enCurso} en curso · ${o.fallidas} fallidas · ${o.sinCambios} sin cambios · ${o.pendientes} pendientes`}
                            >
                                {o.viva ? <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" aria-hidden /> : null}
                                {o.id}
                                <span className="ml-1 text-white/40">
                                    {o.hechas}/{o.total}
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : datos ? (
                <p className="mt-3 text-sm text-white/50">No hay colas de olas en disco.</p>
            ) : (
                <p className="mt-3 text-sm text-white/50">Leyendo la ramificación…</p>
            )}

            {ola ? (
                <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-3 text-[11px] text-white/55">
                        <span>
                            <span className="text-emerald-300">{ola.hechas}</span> integradas
                        </span>
                        <span>
                            <span className="text-sky-300">{ola.enCurso}</span> en curso
                        </span>
                        <span>
                            <span className="text-rose-300">{ola.fallidas}</span> fallidas
                        </span>
                        <span>
                            <span className="text-white/70">{ola.sinCambios}</span> sin cambios
                        </span>
                        <span>
                            <span className="text-white/70">{ola.pendientes}</span> pendientes
                        </span>
                    </div>
                    <ArbolOla ola={ola} seleccion={tareaSel} onSeleccionar={(id) => setTareaSel((prev) => (prev === id ? null : id))} />
                    <FilasDeProcesos
                        olas={datos?.olas ?? []}
                        olaSel={ola}
                        latidos={datos?.latidos ?? []}
                        enjambres={datos?.enjambres ?? []}
                        onVer={(id) => {
                            const dueña = (datos?.olas ?? []).find((o) => o.tareas.some((t) => t.id === id));
                            if (dueña) setOlaSel(dueña.id);
                            setTareaSel(id);
                        }}
                    />
                    {tarea ? (
                        <FichaTarea
                            tarea={tarea}
                            estadosOla={Object.fromEntries(ola.tareas.map((t) => [t.id, t.estado]))}
                            onCerrar={() => setTareaSel(null)}
                            onCambio={() => void recargar()}
                        />
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
