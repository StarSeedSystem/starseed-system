"use client";

/**
 * Chats de Genesis · un puente de Telegram sin Telegram (GEN1113D · 2026-11-13, contrato §2.3 y §4.4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Los tres puentes: «Hermes y avisos» (A, lo atiende la Mac), «Peticiones y encargos» (B, lo atiende
 * el A1 aunque la Mac esté apagada) y «Avisos de los directores» (C, solo lectura). El cuadro de texto
 * acepta las mismas órdenes que el bot de ese puente y texto suelto; la lista de órdenes está cerrada
 * (§4.4) y lo que no esté en ella no se envía. La puerta y la Mac vuelven a comprobarlo todo.
 */

import { useEffect, useRef, useState } from "react";
import { HelpCircle, Lock, SquareTerminal, Send } from "lucide-react";

import type { ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import type { PuenteTelegram } from "@/lib/chats-genesis/tipos";
import { nombreDeAutor } from "@/lib/mando/chat-director-feed";
import { cn } from "@/lib/utils";

import { CabeceraEspejo, useAhora, useEnvios, useFeedEspejo, type EntradaEnvio, type RegistroEspejo } from "./cabecera-espejo";
import { BotonBajar, Hoja, TarjetaEnvio, horaMensaje, llegoPorGenesis, useTecladoVisible } from "./hilo-direccion";
import { PUENTES } from "./lista-chats-genesis";

// ── Órdenes de cada puente (§4.4, cerradas) ──────────────────────────────────

export interface OrdenPuente {
    nombre: string;
    uso: string;
    ayuda: string;
    /** Cambia algo: solo un dueño, y caduca a los 30 min si nadie la recoge. */
    cambia?: boolean;
}

export const ORDENES: Record<Exclude<PuenteTelegram, "avisos-directores">, OrdenPuente[]> = {
    "hermes-avisos": [
        { nombre: "estado", uso: "/estado", ayuda: "Resumen del trabajo en la Mac" },
        { nombre: "olas", uso: "/olas [n]", ayuda: "Las últimas olas" },
        { nombre: "cola", uso: "/cola", ayuda: "Lo que espera en la cola" },
        { nombre: "puertas", uso: "/puertas", ayuda: "Cómo están las puertas de publicación" },
        { nombre: "agentes", uso: "/agentes", ayuda: "Los agentes en marcha" },
        { nombre: "ayuda", uso: "/ayuda", ayuda: "Las órdenes de este puente" },
        { nombre: "aprobar", uso: "/aprobar <ids>", ayuda: "Aprueba tareas que esperan tu visto bueno", cambia: true },
        { nombre: "rechazar", uso: "/rechazar <ids>", ayuda: "Rechaza tareas que esperan", cambia: true },
        { nombre: "soltar", uso: "/soltar <ids>", ayuda: "Suelta tareas bloqueadas", cambia: true },
        { nombre: "reasignar", uso: "/reasignar <id> <modelo>", ayuda: "Pasa una tarea a otro modelo", cambia: true },
        { nombre: "decir", uso: "/decir <texto>", ayuda: "Publica en el canal común de los directores" },
        { nombre: "a", uso: "/a <agente> <texto>", ayuda: "Escribe a un agente concreto" },
    ],
    peticiones: [
        { nombre: "estado", uso: "/estado", ayuda: "Cómo va el servicio de peticiones del A1" },
        { nombre: "ayuda", uso: "/ayuda", ayuda: "Las órdenes de este puente" },
        { nombre: "encargos", uso: "/encargos", ayuda: "Los encargos en marcha" },
        { nombre: "pausa", uso: "/pausa", ayuda: "Pausa los encargos", cambia: true },
        { nombre: "sigue", uso: "/sigue", ayuda: "Reanuda los encargos", cambia: true },
        { nombre: "cancela", uso: "/cancela [id]", ayuda: "Cancela un encargo", cambia: true },
    ],
};

const RE_ID = /^[A-Za-z0-9_.-]{2,40}$/;
const RE_MODELO = /^[a-z0-9._/:-]{3,120}$/;

/** Convierte lo escrito en una entrada para la puerta, o dice por qué no (puro). */
export function analizarEscrito(texto: string, puente: Exclude<PuenteTelegram, "avisos-directores">): { ok: true; entrada: EntradaEnvio } | { ok: false; motivo: string } {
    const fuente = `puente:${puente}` as const;
    const limpio = texto.trim();
    if (limpio === "") return { ok: false, motivo: "Escribe algo antes de enviar" };
    if (!limpio.startsWith("/")) return { ok: true, entrada: { fuente, accion: "texto", texto: limpio } };
    const [cabeza = "", ...resto] = limpio.split(/\s+/);
    const nombre = cabeza.slice(1).split("@")[0]!.toLowerCase();
    const orden = ORDENES[puente].find((o) => o.nombre === nombre);
    if (!orden) return { ok: false, motivo: `Orden no permitida en este puente: /${nombre}. Toca «Órdenes» para ver las que hay` };
    const sinCabeza = limpio.slice(cabeza.length).trim();
    if (nombre === "decir") {
        if (!sinCabeza) return { ok: false, motivo: "Falta el texto: /decir <texto>" };
        return { ok: true, entrada: { fuente, accion: "orden", orden: { nombre, args: [] }, texto: sinCabeza } };
    }
    if (nombre === "a") {
        const [agente = "", ...palabras] = resto;
        if (!RE_ID.test(agente) || palabras.length === 0) return { ok: false, motivo: "Uso: /a <agente> <texto>" };
        return { ok: true, entrada: { fuente, accion: "orden", orden: { nombre, args: [agente] }, texto: sinCabeza.slice(agente.length).trim() } };
    }
    if (resto.length > 10 || resto.some((a) => a.length > 120)) return { ok: false, motivo: "Demasiados argumentos (máximo 10, de 120 caracteres)" };
    if (["aprobar", "rechazar", "soltar"].includes(nombre) && (resto.length === 0 || !resto.every((a) => RE_ID.test(a)))) {
        return { ok: false, motivo: `Indica qué tareas: /${nombre} <id> [id…]` };
    }
    if (nombre === "reasignar" && (resto.length !== 2 || !RE_ID.test(resto[0]!) || !RE_MODELO.test(resto[1]!))) {
        return { ok: false, motivo: "Uso: /reasignar <id> <modelo>" };
    }
    return { ok: true, entrada: { fuente, accion: "orden", orden: { nombre, args: resto } } };
}

// ── Tarjeta de un mensaje del puente ─────────────────────────────────────────

function TarjetaPuente({ mensaje: m, ahora }: { mensaje: RegistroEspejo; ahora: number }) {
    const esAlex = m.rol === "alex";
    const aviso = m.tipo === "aviso";
    return (
        <article
            data-testid="mensaje-puente"
            className={cn(
                "max-w-[92%] rounded-xl border p-3 text-xs sm:max-w-[85%]",
                esAlex ? "ml-auto border-cyan-400/30 bg-cyan-500/10" : aviso ? "mr-auto border-amber-400/35 bg-amber-500/10" : "mr-auto border-sky-500/20 bg-zinc-900/70",
            )}
        >
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-400">
                <span className={cn("font-semibold", esAlex ? "text-cyan-200" : aviso ? "text-amber-100" : "text-sky-200")}>{esAlex ? "Tú" : nombreDeAutor(m.de)}</span>
                {llegoPorGenesis(m) ? <span className="rounded border border-cyan-400/30 bg-cyan-400/15 px-1.5 py-0.5 text-[10px] text-cyan-100">vía Genesis en Astraura</span> : null}
                {aviso ? <span className="rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-100">aviso</span> : null}
                <span className="ml-auto text-[10px] opacity-80">{horaMensaje(m.t, ahora)}</span>
            </header>
            <p className={cn("mt-2 whitespace-pre-line break-words [overflow-wrap:anywhere]", esAlex ? "text-cyan-50" : "text-zinc-100")}>{m.texto}</p>
        </article>
    );
}

// ── El hilo ──────────────────────────────────────────────────────────────────

export interface HiloPuenteProps {
    cliente: ClienteChatsGenesis;
    puente: PuenteTelegram;
    esDueno: boolean;
}

const PISTA: Record<PuenteTelegram, string> = {
    "hermes-avisos": "Texto suelto: un mensaje a Hermes en su sesión de dirección (no la de Telegram).",
    peticiones: "Texto suelto: una petición o un encargo para el A1. La respuesta llega aquí, no a Telegram.",
    "avisos-directores": "Canal de avisos: solo lectura. Lo que algunos scripts mandan solo a Telegram aún no llega aquí.",
};

export function HiloPuente({ cliente, puente, esDueno }: HiloPuenteProps) {
    const nombre = PUENTES.find((p) => p.puente === puente)?.etiqueta ?? puente;
    // A y B son solo para dueños (§4.2): sin rol de dueño ni se pide la copia.
    if (puente !== "avisos-directores" && !esDueno) {
        return (
            <section aria-label={nombre} data-testid="hilo-puente" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-black/20 p-6 text-center">
                <Lock className="size-5 text-white/40" aria-hidden />
                <p className="max-w-sm text-[13px] text-white/60">«{nombre}» solo lo puede leer y usar un dueño de MetaGenesis.</p>
            </section>
        );
    }
    return <HiloPuenteAbierto cliente={cliente} puente={puente} nombre={nombre} />;
}

function HiloPuenteAbierto({ cliente, puente, nombre }: { cliente: ClienteChatsGenesis; puente: PuenteTelegram; nombre: string }) {
    const feed = useFeedEspejo(cliente, `puente:${puente}`);
    const { envios, enviar, quitar } = useEnvios(cliente);
    const ahora = useAhora(1000);
    const { logRef, compositorRef, pegadoRef, pegado, bajar, alDesplazar } = useTecladoVisible();
    const origen = puente === "peticiones" ? "a1" : "mac";
    const soloLectura = puente === "avisos-directores";
    const ultimo = feed.registros[feed.registros.length - 1];
    const firma = `${ultimo?.id ?? ""}:${ultimo?.texto.length ?? 0}:${envios.length}`;
    useEffect(() => {
        if (pegadoRef.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [firma, pegadoRef, logRef]);

    return (
        <section aria-label={nombre} data-testid="hilo-puente" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <CabeceraEspejo latido={feed.latido} fallo={feed.fallo} cargado={feed.cargado} origen={origen} queEs="puente" ahora={ahora} onReintentar={feed.releer} />
            <div className="relative flex min-h-0 flex-1 flex-col">
                <div ref={logRef} role="log" aria-label={`Mensajes de ${nombre}`} onScroll={alDesplazar} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-xl border border-white/5 bg-black/20 p-2">
                    <div className="mt-auto flex flex-col gap-2">
                        {feed.cargado && feed.registros.length === 0 ? (
                            <p data-testid="hilo-vacio" className="p-2 text-[12px] text-white/50">
                                {feed.latido
                                    ? `Sin mensajes en la copia de «${nombre}» (último latido: ${horaMensaje(feed.latido.t, ahora)}).`
                                    : feed.fallo ? "Sin copia que mostrar." : `La puerta del A1 aún no tiene ninguna copia de «${nombre}».`}
                            </p>
                        ) : null}
                        {feed.registros.map((m) => <TarjetaPuente key={m.id} mensaje={m} ahora={ahora} />)}
                        {envios.map((e) => <TarjetaEnvio key={e.clave} envio={e} ahora={ahora} destino={origen} onQuitar={quitar} />)}
                    </div>
                </div>
                {!pegado ? <BotonBajar onClick={bajar} /> : null}
            </div>
            <div ref={compositorRef} className="shrink-0 pb-[env(safe-area-inset-bottom)]">
                {soloLectura ? (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12px] leading-snug text-white/55">{PISTA[puente]}</p>
                ) : (
                    <CompositorPuente
                        puente={puente}
                        onEnviar={async (entrada, texto) => {
                            bajar();
                            return enviar(entrada, texto);
                        }}
                    />
                )}
            </div>
        </section>
    );
}

function CompositorPuente({ puente, onEnviar }: {
    puente: Exclude<PuenteTelegram, "avisos-directores">;
    onEnviar: (entrada: EntradaEnvio, texto: string) => Promise<{ ok: true } | { ok: false; motivo: string }>;
}) {
    const [texto, setTexto] = useState("");
    const [aviso, setAviso] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [hoja, setHoja] = useState(false);
    const areaRef = useRef<HTMLTextAreaElement | null>(null);

    const mandar = async (escrito: string, limpiarAlFinal: boolean) => {
        const r = analizarEscrito(escrito, puente);
        if (!r.ok) { setAviso(r.motivo); return; }
        setEnviando(true);
        const hecho = await onEnviar(r.entrada, escrito.trim());
        setEnviando(false);
        setAviso(hecho.ok ? null : hecho.motivo);
        if (hecho.ok && limpiarAlFinal) setTexto("");
    };

    return (
        <div data-testid="compositor-puente" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 backdrop-blur-sm">
            {aviso ? <p role="alert" data-testid="aviso-envio" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11.5px] text-rose-100">{aviso}</p> : null}
            <p className="px-1 text-[11px] leading-snug text-white/45">{PISTA[puente]}</p>
            <textarea
                ref={areaRef}
                rows={1}
                value={texto}
                aria-label="Mensaje u orden para el puente"
                placeholder="Escribe o usa una orden: /estado"
                onChange={(e) => {
                    setTexto(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(176, Math.max(44, e.target.scrollHeight))}px`;
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!enviando) void mandar(texto, true); }
                }}
                className="max-h-44 min-h-[44px] w-full resize-none rounded-xl border border-white/10 bg-background/50 px-3.5 py-2.5 text-[15px] leading-6 text-white placeholder:text-white/40 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            />
            <div className="flex min-w-0 items-center gap-2">
                <button type="button" onClick={() => setHoja(true)} className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-sky-500/30 bg-zinc-900 px-2.5 text-xs text-sky-200 hover:border-sky-400">
                    <SquareTerminal className="size-3.5" aria-hidden /> Órdenes
                </button>
                <button type="button" disabled={enviando} onClick={() => void mandar("/ayuda", false)} className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40">
                    <HelpCircle className="size-3.5" aria-hidden /> /ayuda
                </button>
                <button type="button" aria-label="Enviar" disabled={enviando || !texto.trim()} onClick={() => void mandar(texto, true)} className="ml-auto flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-sky-600 text-white transition-colors hover:bg-sky-500 disabled:opacity-40">
                    <Send className="size-4" />
                </button>
            </div>
            <Hoja titulo="Órdenes del puente" abierta={hoja} onCerrar={() => setHoja(false)}>
                <ul className="flex flex-col gap-0.5">
                    {ORDENES[puente].map((o) => (
                        <li key={o.nombre}>
                            <button
                                type="button"
                                onClick={() => {
                                    setHoja(false);
                                    setTexto(`/${o.nombre} `);
                                    queueMicrotask(() => areaRef.current?.focus());
                                }}
                                className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.05]"
                            >
                                <code className="max-w-full break-words rounded bg-white/[0.06] px-1.5 py-0.5 text-[12px] text-sky-200">{o.uso}</code>
                                <span className="min-w-0 text-[12px] leading-snug text-white/65">
                                    {o.ayuda}
                                    {o.cambia ? <span className="block text-[11px] text-amber-200/80">Cambia algo: caduca a los 30 min si nadie la recoge.</span> : null}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </Hoja>
        </div>
    );
}
