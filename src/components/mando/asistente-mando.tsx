"use client";

/**
 * Asistente técnico del Puente de Mando (cliente)
 * ─────────────────────────────────────────────────────────────────────────────
 * El mismo componente sirve a la orbe flotante (`modo="flotante"`) y a la sección
 * «Asistente» de la pestaña Chat (`modo="panel"`): lista de chats, selector de modelo
 * (todos los disponibles, agrupados por proveedor y con su salud), mensajes con
 * markdown, y las acciones que el modelo propone (ver tarea · leer archivo al momento;
 * lanzar · detener con confirmación humana). Habla con `/api/mando/asistente`,
 * `/api/mando/chats`, `/api/mando/modelos` y `/api/mando/colas`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Check, CircleDashed, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";

import type { AccionPropuesta, ChatMando, MensajeChat } from "@/lib/mando/asistente";
import type { ModeloDisponible } from "@/lib/mando/modelos-disponibles";
import {
    escuchar,
    pedirVerTarea,
    fijarChatActual,
    fijarModeloActual,
    leerChatActual,
    leerModeloActual,
} from "@/lib/mando/asistente-cliente";

interface ResumenChat {
    id: string;
    titulo: string;
    actualizado: string;
    modelo: string;
    mensajes: number;
    ultimo: string;
}

function hora(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** Acciones propuestas en un texto del asistente (mismo formato que extrae el servidor). */
function accionesDe(texto: string): AccionPropuesta[] {
    const salida: AccionPropuesta[] = [];
    const re = /\{[^{}\n]*"accion"\s*:\s*"(lanzar|detener|ver_tarea|leer)"[^{}\n]*\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
        try {
            const d = JSON.parse(m[0]) as Record<string, unknown>;
            const a: AccionPropuesta = { accion: d.accion as AccionPropuesta["accion"] };
            if (typeof d.cola === "string") a.cola = d.cola.replace(/^cola-/, "").replace(/\.json$/, "");
            if (typeof d.donde === "string") a.donde = d.donde === "mac" ? "mac" : "nube";
            if (typeof d.workers === "number") a.workers = Math.min(4, Math.max(1, Math.round(d.workers)));
            if (typeof d.id === "string") a.id = d.id;
            if (typeof d.ruta === "string") a.ruta = d.ruta;
            salida.push(a);
        } catch {
            // bloque mal formado
        }
    }
    return salida.slice(0, 6);
}

/** Quita del texto los bloques JSON de acción (se muestran como botones, no como texto). */
function sinBloquesDeAccion(texto: string): string {
    return texto
        .split("\n")
        .filter((l) => !/^\s*\{[^{}]*"accion"\s*:[^{}]*\}\s*$/.test(l))
        .join("\n")
        .trim();
}

function puntoSalud(salud: string): string {
    if (salud === "vivo") return "bg-emerald-400";
    if (salud === "caido") return "bg-rose-400";
    if (salud === "sin-clave") return "bg-zinc-600";
    return "bg-white/30";
}

/** Selector de modelo: agrupado por proveedor, con salud y búsqueda. */
export function SelectorModelo({
    modelos,
    valor,
    onCambio,
    compacto,
}: {
    modelos: ModeloDisponible[];
    valor: string;
    onCambio: (id: string) => void;
    compacto?: boolean;
}) {
    const grupos = useMemo(() => {
        const porProveedor = new Map<string, ModeloDisponible[]>();
        for (const m of modelos) {
            const lista = porProveedor.get(m.proveedor) ?? [];
            lista.push(m);
            porProveedor.set(m.proveedor, lista);
        }
        const orden = ["xkiro", "nim", "ollama", "gemini", "tokenrouter", "aihubmix", "openrouter"];
        return [...porProveedor.entries()].sort((a, b) => (orden.indexOf(a[0]) + 100) % 100 - ((orden.indexOf(b[0]) + 100) % 100));
    }, [modelos]);
    const actual = modelos.find((m) => m.id === valor);
    return (
        <label className={`flex items-center gap-1.5 ${compacto ? "text-[11px]" : "text-xs"} text-white/70`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${puntoSalud(actual?.salud ?? "desconocido")}`} title={actual ? `${actual.proveedor}: ${actual.salud}` : ""} aria-hidden />
            <select
                value={valor}
                onChange={(e) => onCambio(e.target.value)}
                className={`max-w-[260px] cursor-pointer rounded-md border border-white/10 bg-black/50 px-2 py-1 text-white ${compacto ? "text-[11px]" : "text-xs"}`}
                aria-label="Modelo del asistente"
            >
                {!actual ? <option value={valor}>{valor}</option> : null}
                {grupos.map(([proveedor, lista]) => (
                    <optgroup key={proveedor} label={`${proveedor} · ${lista[0]?.salud ?? ""}`}>
                        {lista.map((m) => (
                            <option key={m.id} value={m.id} disabled={m.salud === "sin-clave"}>
                                {m.nombre}{m.contexto ? ` · ${Math.round(m.contexto / 1024)}k` : ""}{m.salud === "caido" ? " · caído" : m.salud === "sin-clave" ? " · sin clave" : ""}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
        </label>
    );
}

/** Una acción propuesta por el modelo, con su botón (y confirmación si hace falta). */
function BotonAccion({ accion, onEjecutar }: { accion: AccionPropuesta; onEjecutar: (a: AccionPropuesta) => Promise<string> }) {
    const [estado, setEstado] = useState<"idle" | "confirmar" | "ocupado" | "hecho">("idle");
    const [resultado, setResultado] = useState("");
    const peligrosa = accion.accion === "lanzar" || accion.accion === "detener";
    const etiqueta =
        accion.accion === "ver_tarea" ? `Ver ${accion.id ?? "tarea"}`
        : accion.accion === "leer" ? `Leer ${accion.ruta ?? "archivo"}`
        : accion.accion === "lanzar" ? `Lanzar cola-${accion.cola ?? "?"} en ${accion.donde ?? "nube"}${accion.workers ? ` (${accion.workers})` : ""}`
        : `Detener cola-${accion.cola ?? "?"}`;
    const ejecutar = async () => {
        setEstado("ocupado");
        try {
            setResultado(await onEjecutar(accion));
        } catch (e) {
            setResultado(e instanceof Error ? e.message : "Falló.");
        } finally {
            setEstado("hecho");
        }
    };
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            {estado === "confirmar" ? (
                <>
                    <span className="text-[11px] text-amber-200">¿Seguro? {etiqueta}</span>
                    <button type="button" onClick={() => void ejecutar()} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-400/40 px-2 py-0.5 text-[11px] text-emerald-200 hover:bg-emerald-500/10"><Check className="h-3 w-3" aria-hidden /> Sí</button>
                    <button type="button" onClick={() => setEstado("idle")} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/60 hover:bg-white/5"><X className="h-3 w-3" aria-hidden /> No</button>
                </>
            ) : (
                <button
                    type="button"
                    disabled={estado === "ocupado" || estado === "hecho"}
                    onClick={() => (peligrosa ? setEstado("confirmar") : void ejecutar())}
                    className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] disabled:cursor-default disabled:opacity-60 ${peligrosa ? "border-amber-400/40 text-amber-200 hover:bg-amber-500/10" : "border-sky-400/40 text-sky-200 hover:bg-sky-500/10"}`}
                >
                    {estado === "ocupado" ? "…" : estado === "hecho" ? "✓ " : ""}{etiqueta}
                </button>
            )}
            {resultado ? <span className="text-[11px] text-white/60">{resultado}</span> : null}
        </span>
    );
}

export function AsistenteMando({ modo, onCerrar }: { modo: "panel" | "flotante"; onCerrar?: () => void }) {
    const [chats, setChats] = useState<ResumenChat[]>([]);
    const [chat, setChat] = useState<ChatMando | null>(null);
    const [modelos, setModelos] = useState<ModeloDisponible[]>([]);
    const [modelo, setModelo] = useState("nim/moonshotai/kimi-k3");
    const [texto, setTexto] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const final = useRef<HTMLDivElement | null>(null);

    const cargarChats = useCallback(async () => {
        try {
            const r = await fetch("/api/mando/chats", { cache: "no-store" });
            if (r.ok) setChats(((await r.json()) as { chats: ResumenChat[] }).chats);
        } catch {
            // sin lista
        }
    }, []);

    const cargarChat = useCallback(async (id: string | null) => {
        if (!id) {
            setChat(null);
            return;
        }
        try {
            const r = await fetch(`/api/mando/chats?id=${encodeURIComponent(id)}`, { cache: "no-store" });
            if (r.ok) setChat(((await r.json()) as { chat: ChatMando }).chat);
            else {
                setChat(null);
                fijarChatActual(null);
            }
        } catch {
            setChat(null);
        }
    }, []);

    useEffect(() => {
        setModelo(leerModeloActual());
        void cargarChats();
        void cargarChat(leerChatActual());
        void (async () => {
            try {
                const r = await fetch("/api/mando/modelos", { cache: "no-store" });
                if (r.ok) setModelos(((await r.json()) as { modelos: ModeloDisponible[] }).modelos);
            } catch {
                // sin catálogo: el selector muestra el modelo actual
            }
        })();
        return escuchar((aviso) => {
            if (aviso.tipo === "cambio") {
                if (aviso.modelo) setModelo(aviso.modelo);
                if (aviso.chatId !== undefined) void cargarChat(aviso.chatId);
                void cargarChats();
            }
        });
    }, [cargarChat, cargarChats]);

    useEffect(() => {
        final.current?.scrollIntoView({ block: "end" });
    }, [chat?.mensajes.length, ocupado]);

    const nuevoChat = async () => {
        try {
            const r = await fetch("/api/mando/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "crear", modelo }) });
            if (!r.ok) return;
            const { chat: nuevo } = (await r.json()) as { chat: ChatMando };
            setChat(nuevo);
            fijarChatActual(nuevo.id);
            void cargarChats();
        } catch {
            setError("No se pudo crear el chat.");
        }
    };

    const borrar = async (id: string) => {
        await fetch("/api/mando/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "borrar", id }) }).catch(() => null);
        if (chat?.id === id) {
            setChat(null);
            fijarChatActual(null);
        }
        void cargarChats();
    };

    const ejecutarAccion = useCallback(async (a: AccionPropuesta): Promise<string> => {
        if (a.accion === "ver_tarea" && a.id) {
            pedirVerTarea(a.id);
            return `Abierta ${a.id} en la ramificación.`;
        }
        if (a.accion === "leer" && a.ruta) {
            const r = await fetch("/api/mando/asistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "leer", chatId: chat?.id, ruta: a.ruta }) });
            const d = (await r.json()) as { ok: boolean; bytes: number; contenido: string };
            if (chat?.id) void cargarChat(chat.id);
            return d.ok ? `Leído (${d.bytes} bytes); ya está en el chat. Pregunta de nuevo para que lo use.` : d.contenido;
        }
        if ((a.accion === "lanzar" || a.accion === "detener") && a.cola) {
            if (a.accion === "detener") {
                // detener viaja por el bus como orden firmada (nube) o mata el orquestador local por cola
                const r = await fetch("/api/mando/colas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "detener", nombre: a.cola, donde: a.donde ?? "nube" }) });
                const d = (await r.json()) as { ok?: boolean; error?: string };
                return d.ok ? "Orden de detener enviada." : d.error ?? "No se pudo detener.";
            }
            const r = await fetch("/api/mando/colas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "lanzar", nombre: a.cola, donde: a.donde ?? "nube", workers: a.workers ?? 2 }) });
            const d = (await r.json()) as { ok?: boolean; error?: string; pid?: number };
            return d.ok ? (a.donde === "mac" ? `Lanzada aquí (pid ${d.pid ?? "?"}).` : "Orden firmada publicada en el bus.") : d.error ?? "No se pudo lanzar.";
        }
        return "Acción no reconocida.";
    }, [chat?.id, cargarChat]);

    const enviar = async () => {
        const limpio = texto.trim();
        if (!limpio || ocupado) return;
        setOcupado(true);
        setError(null);
        setTexto("");
        // Eco optimista del mensaje del usuario.
        const optimista: MensajeChat = { rol: "usuario", texto: limpio, t: new Date().toISOString() };
        setChat((prev) => (prev ? { ...prev, mensajes: [...prev.mensajes, optimista] } : { id: "", titulo: limpio.slice(0, 60), creado: "", actualizado: "", modelo, mensajes: [optimista] }));
        try {
            const r = await fetch("/api/mando/asistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chat?.id ?? "", modelo, mensaje: limpio }) });
            const d = (await r.json()) as { chatId?: string; respuesta?: MensajeChat; acciones?: AccionPropuesta[]; error?: string };
            if (d.chatId && d.chatId !== chat?.id) fijarChatActual(d.chatId);
            if (!r.ok || !d.respuesta) {
                setError(d.error ?? `El modelo no respondió (HTTP ${r.status}).`);
            }
            if (d.chatId) await cargarChat(d.chatId);
            void cargarChats();
        } catch {
            setError("No se pudo hablar con el mando.");
        } finally {
            setOcupado(false);
        }
    };

    const cambiarModelo = (id: string) => {
        setModelo(id);
        fijarModeloActual(id);
    };

    const mensajes = chat?.mensajes ?? [];

    return (
        <div className={`flex ${modo === "panel" ? "min-h-[520px]" : "h-full"} flex-col gap-2`}>
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-violet-300" aria-hidden />
                    <span className="text-sm font-semibold text-white">Asistente técnico</span>
                    <span className="text-[11px] text-white/45">{chat ? chat.titulo : "sin chat"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <SelectorModelo modelos={modelos} valor={modelo} onCambio={cambiarModelo} compacto={modo === "flotante"} />
                    <button type="button" onClick={() => void nuevoChat()} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/5" title="Chat nuevo">
                        <Plus className="h-3 w-3" aria-hidden /> Nuevo
                    </button>
                    {onCerrar ? (
                        <button type="button" onClick={onCerrar} className="cursor-pointer rounded-md border border-white/10 p-1 text-white/60 hover:bg-white/5" aria-label="Cerrar">
                            <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    ) : null}
                </div>
            </header>

            <div className={`grid flex-1 gap-2 ${modo === "panel" ? "lg:grid-cols-[220px_1fr]" : ""}`}>
                {modo === "panel" ? (
                    <aside className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/40">
                            <span>Chats</span>
                            <button type="button" onClick={() => void cargarChats()} className="cursor-pointer rounded p-0.5 text-white/40 hover:text-white/80" aria-label="Actualizar chats"><RefreshCw className="h-3 w-3" aria-hidden /></button>
                        </div>
                        {chats.length === 0 ? <p className="text-xs text-white/40">Aún no hay chats. Escribe abajo o pulsa «Nuevo».</p> : null}
                        {chats.map((c) => (
                            <div key={c.id} className={`flex items-start justify-between gap-1 rounded-lg border px-2 py-1.5 text-xs ${chat?.id === c.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/10 hover:bg-white/5"}`}>
                                <button type="button" onClick={() => fijarChatActual(c.id)} className="min-w-0 flex-1 cursor-pointer text-left">
                                    <span className="block truncate text-white/85">{c.titulo}</span>
                                    <span className="block truncate text-[10px] text-white/40">{c.mensajes} msg · {c.modelo.split("/").slice(-1)[0]} · {hora(c.actualizado)}</span>
                                </button>
                                <button type="button" onClick={() => void borrar(c.id)} className="cursor-pointer rounded p-0.5 text-white/30 hover:text-rose-300" aria-label={`Borrar ${c.titulo}`}><Trash2 className="h-3 w-3" aria-hidden /></button>
                            </div>
                        ))}
                    </aside>
                ) : null}

                <section className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/40">
                    <div className={`flex-1 space-y-2 overflow-y-auto p-3 ${modo === "flotante" ? "max-h-[46vh]" : "max-h-[60vh]"}`}>
                        {mensajes.length === 0 ? (
                            <p className="text-xs text-white/45">
                                Pregunta por el estado del enjambre, una tarea, un proveedor, las memorias o el relevo; pide que lea un archivo, o que proponga una ola. Puede usar cualquier modelo del selector.
                            </p>
                        ) : null}
                        {mensajes.map((m, i) => {
                            const clave = Date.parse(m.t);
                            const propuestas = m.rol === "asistente" ? accionesDe(m.texto) : undefined;
                            return (
                                <div key={`${m.t}-${i}`} className={`rounded-lg px-3 py-2 text-sm ${m.rol === "usuario" ? "ml-6 bg-violet-500/15 text-white" : m.rol === "herramienta" ? "border border-white/10 bg-white/[0.03] font-mono text-[11px] text-white/60" : "mr-6 bg-white/[0.05] text-white/90"}`}>
                                    <div className="mb-1 flex items-center justify-between text-[10px] text-white/40">
                                        <span>{m.rol === "usuario" ? "Tú" : m.rol === "herramienta" ? "archivo" : (m.modelo ?? "asistente").split("/").slice(-1)[0]}</span>
                                        <span>{hora(m.t)}{m.tokens ? ` · ${m.tokens.entrada}/${m.tokens.salida} tokens` : ""}{m.latenciaMs ? ` · ${Math.round(m.latenciaMs / 1000)} s` : ""}</span>
                                    </div>
                                    {m.rol === "asistente" ? (
                                        <div className="prose prose-invert prose-sm max-w-none text-white/90 [&_code]:text-[12px] [&_pre]:overflow-x-auto [&_pre]:text-[11px]">
                                            <ReactMarkdown>{sinBloquesDeAccion(m.texto)}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <p className="whitespace-pre-wrap">{m.rol === "herramienta" ? m.texto.slice(0, 1200) + (m.texto.length > 1200 ? "…" : "") : m.texto}</p>
                                    )}
                                    {propuestas?.length ? (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {propuestas.map((a, j) => <BotonAccion key={`${clave}-${j}`} accion={a} onEjecutar={ejecutarAccion} />)}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                        {ocupado ? (
                            <div className="mr-6 flex items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/60">
                                <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden /> {modelo.split("/").slice(-1)[0]} está pensando…
                            </div>
                        ) : null}
                        {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}
                        <div ref={final} />
                    </div>
                    <form
                        className="flex items-end gap-2 border-t border-white/10 p-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void enviar();
                        }}
                    >
                        <textarea
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void enviar();
                                }
                            }}
                            rows={modo === "flotante" ? 2 : 3}
                            placeholder="Pregunta o pide algo al asistente… (Enter envía, Mayús+Enter salta de línea)"
                            className="flex-1 resize-none rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
                        />
                        <button type="submit" disabled={ocupado || !texto.trim()} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-violet-400/50 bg-violet-500/15 px-3 py-2 text-xs text-white hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50">
                            <Send className="h-3.5 w-3.5" aria-hidden /> Enviar
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
}
