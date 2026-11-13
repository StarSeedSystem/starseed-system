"use client";

/**
 * Chats de Genesis · el chat de dirección de MetaGenesis (GEN1113D · 2026-11-13, contrato §2.3)
 * ─────────────────────────────────────────────────────────────────────────────
 * El mismo chat de dirección de /genesis, leído desde la copia que la Mac sube a la puerta del A1:
 * las seis vistas y sus chips salen de las funciones PURAS de `chat-director-feed.ts` (las mismas
 * que usa /genesis, así los números coinciden). Lo que se escribe va a la puerta y la Mac lo
 * recoge; aquí se ve su acuse real («En la puerta del A1 · esperando a la Mac», «Hecho»…).
 *
 * Quién puede qué lo decide la puerta (§4.2); la interfaz solo evita ofrecer lo que se negará:
 * un desarrollador escribe solo al hilo y no ve el selector de motores ni las acciones.
 *
 * Pantallas pequeñas (§8): por debajo de `sm` las vistas y los filtros se eligen en lista completa
 * y las acciones de cada mensaje van en «⋯»; el hilo tiene su propio scroll y el cuadro de texto
 * queda abajo, también con el teclado abierto (`useTecladoVisible`).
 *
 * GEN1114F (contrato GEN1114 §3.4, §3.9 y §8.5): encima del hilo, el nombre del chat del catálogo (el
 * que se firma); sin aparato emparejado, la tarjeta de emparejar en lugar del cuadro de texto; con un
 * aparato de nivel «texto», solo «al hilo» (sin motores); y antes de algo que despierta a un director,
 * la línea «Va a …» con la descripción fija del código y el chat que se firma.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Filter, LayoutList, MoreHorizontal, Reply, Route, Send } from "lucide-react";

import { DESTINO_DE_FUENTE } from "@/lib/chats-genesis/alias-gen1113";
import { chatDeFuente, chatParaFirmar, nombreDeChat, type CatalogoCanon } from "@/lib/chats-genesis/canon";
import { riesgoDeEntrada, type AparatoLocal } from "@/lib/chats-genesis/firma-aparato";
import {
    FILTRO_TODOS,
    aplicarFiltro,
    etiquetaDeFiltro,
    filtrarFeed,
    nombreDeAutor,
    opcionesDeFiltro,
    rolDeDirector,
    type FiltroFeed,
} from "@/lib/mando/chat-director-feed";
import {
    CANALES,
    MODELO_PRESIDENTE,
    MOTORES_DIRECTOR,
    motorDe,
    type CanalId,
    type MensajeDirector,
} from "@/lib/mando/chat-director-tipos";
import type { ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import { cn } from "@/lib/utils";

import {
    CabeceraChat,
    CabeceraEspejo,
    momentoTexto,
    textoEnvio,
    useAhora,
    useEnvios,
    useFeedEspejo,
    type ChatVisto,
    type EnvioLocal,
    type Origen,
    type RegistroEspejo,
} from "./cabecera-espejo";
import { EmparejarAparato } from "./emparejar-aparato";
import { Hoja } from "./hoja";
import { InfoChat } from "./info-chat";
// GEN1114F: las listas de vistas y filtros van en la hoja de Genesis (deja libre el carril de los flotantes).
import { MenuListaHoja as MenuListaMovil } from "./menu-lista-hoja";
import { ANCHO_LG, ANCHO_SM, usePantallaAncha } from "./lista-chats-genesis";

// ── Vistas y filtros ─────────────────────────────────────────────────────────

export const VISTAS: { id: FiltroFeed; etiqueta: string; ayuda: string }[] = [
    { id: "todo", etiqueta: "Todo", ayuda: "Todo lo que pasa por el chat" },
    { id: "direccion", etiqueta: "Dirección", ayuda: "Lo que hablan tú y los directores" },
    { id: "conversacion", etiqueta: "Conversación", ayuda: "Tus mensajes y sus respuestas" },
    { id: "informes", etiqueta: "Informes", ayuda: "Informes y avisos" },
    { id: "enjambre", etiqueta: "Enjambre", ayuda: "Commits, fallos y aprobaciones" },
    { id: "usos", etiqueta: "Usos", ayuda: "Consumo de los modelos" },
];

/** Clave propia de los chips (no pisa la de /genesis, que se copia la primera vez: §3.3). */
export const CLAVE_FILTROS = "starseed.genesis.chats.filtros.v1";
const CLAVE_FILTROS_GENESIS = "starseed.mando.director.filtros";
const CLAVE_VISTA = "starseed.genesis.chats.vista.v1";
const CLAVE_MODELO = "starseed.genesis.chats.modelo.v1";

/** Lee los chips guardados; la primera vez copia los de /genesis sin borrarlos. Nunca lanza. */
export function leerFiltros(): Partial<Record<FiltroFeed, string>> {
    try {
        if (typeof window === "undefined") return {};
        let crudo = window.localStorage.getItem(CLAVE_FILTROS);
        if (crudo === null) {
            const deGenesis = window.localStorage.getItem(CLAVE_FILTROS_GENESIS);
            if (deGenesis !== null) {
                window.localStorage.setItem(CLAVE_FILTROS, deGenesis);
                crudo = deGenesis;
            }
        }
        const datos = JSON.parse(crudo || "{}") as unknown;
        if (!datos || typeof datos !== "object" || Array.isArray(datos)) return {};
        const salida: Partial<Record<FiltroFeed, string>> = {};
        for (const [k, v] of Object.entries(datos as Record<string, unknown>)) {
            if (typeof v === "string" && VISTAS.some((x) => x.id === k)) salida[k as FiltroFeed] = v;
        }
        return salida;
    } catch {
        return {};
    }
}

function guardar(clave: string, valor: string): void {
    try { window.localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: solo en memoria */ }
}

function leer(clave: string): string | null {
    try { return typeof window === "undefined" ? null : window.localStorage.getItem(clave); } catch { return null; }
}

// ── Utilidades compartidas con los puentes ───────────────────────────────────

/** «14:02» si es hoy; «13-11 14:02» si no. */
export function horaMensaje(t: string, ahora: number): string {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return "";
    const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === new Date(ahora).toDateString()) return hora;
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")} ${hora}`;
}

/**
 * ¿Llegó este mensaje por la puerta (escrito desde Genesis en Astraura)? INFERIDO: la Mac (GEN1113B)
 * lo marca con `via`/`origen` «genesis…» o firma «genesis-web-…»; cualquiera de las tres vale.
 */
export function llegoPorGenesis(m: MensajeDirector): boolean {
    const r = m as MensajeDirector & { via?: unknown; origen?: unknown };
    const marca = (v: unknown) => typeof v === "string" && v.startsWith("genesis");
    return marca(r.via) || marca(r.origen) || marca(m.uso?.via) || m.de.startsWith("genesis-web");
}

/** Mantiene el hilo pegado al final y el cuadro de texto a la vista, también con el teclado abierto. */
export function useTecladoVisible() {
    const logRef = useRef<HTMLDivElement | null>(null);
    const compositorRef = useRef<HTMLDivElement | null>(null);
    const pegadoRef = useRef(true);
    const [pegado, setPegado] = useState(true);

    const bajar = useCallback(() => {
        pegadoRef.current = true;
        setPegado(true);
        const nodo = logRef.current;
        if (nodo) nodo.scrollTop = nodo.scrollHeight;
    }, []);

    const alDesplazar = useCallback(() => {
        const nodo = logRef.current;
        if (!nodo) return;
        const p = nodo.scrollHeight - nodo.scrollTop - nodo.clientHeight <= 80;
        pegadoRef.current = p;
        setPegado(p);
    }, []);

    useEffect(() => {
        const vv = typeof window !== "undefined" ? window.visualViewport : null;
        if (!vv) return;
        const ajustar = () => {
            const activo = document.activeElement;
            if (!compositorRef.current || !activo || !compositorRef.current.contains(activo)) return;
            // El teclado encoge la vista: el cuadro de texto y el último mensaje siguen a la vista.
            compositorRef.current.scrollIntoView?.({ block: "end" });
            if (pegadoRef.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        };
        vv.addEventListener("resize", ajustar);
        return () => vv.removeEventListener("resize", ajustar);
    }, []);

    return { logRef, compositorRef, pegadoRef, pegado, bajar, alDesplazar };
}

export { Hoja };

/** Un envío hecho desde aquí, con su estado real. */
export function TarjetaEnvio({ envio, ahora, destino, onQuitar }: { envio: EnvioLocal; ahora: number; destino: Origen; onQuitar: (clave: string) => void }) {
    const malo = envio.estado === "no-enviado" || envio.estado === "rechazado" || envio.estado === "caducado" || envio.estado === "fallo";
    return (
        <article
            data-testid="envio-local"
            data-estado={envio.estado}
            className={cn(
                "ml-auto max-w-[92%] rounded-xl border p-3 text-xs sm:max-w-[85%]",
                malo ? "border-rose-400/35 bg-rose-500/10" : "border-cyan-400/30 bg-cyan-500/10",
            )}
        >
            <header className="flex flex-wrap items-center gap-2 text-cyan-300">
                <span className="font-semibold text-cyan-200">Tú</span>
                <span className="rounded border border-cyan-400/30 bg-cyan-400/15 px-1.5 py-0.5 text-[10px] text-cyan-100">vía Genesis en Astraura</span>
                {envio.firmado ? <span data-testid="marca-firmado" className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-100">firmado · {envio.firmado}</span> : null}
                <span className="ml-auto text-[10px] text-cyan-500/80">{horaMensaje(new Date(envio.iniciado).toISOString(), ahora)}</span>
            </header>
            <p className="mt-2 whitespace-pre-line break-words text-cyan-50 [overflow-wrap:anywhere]">{envio.texto}</p>
            <p role="status" className={cn("mt-2 flex flex-wrap items-center gap-2 text-[11px]", malo ? "text-rose-200" : envio.estado === "hecho" ? "text-emerald-200" : "text-amber-200")}>
                <span className="break-words">{textoEnvio(envio, ahora, destino)}</span>
                {malo || envio.estado === "hecho" ? (
                    <button type="button" onClick={() => onQuitar(envio.clave)} className="cursor-pointer rounded-md border border-white/15 px-2 py-0.5 text-[10.5px] text-white/70 hover:bg-white/10 hover:text-white">
                        Quitar
                    </button>
                ) : null}
            </p>
        </article>
    );
}

/** Botón «↓ Bajar al último» cuando el hilo no está pegado al final. */
export function BotonBajar({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} aria-label="Bajar al último mensaje" className="absolute bottom-2 right-2 flex cursor-pointer items-center gap-1 rounded-full border border-violet-400/60 bg-violet-600/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">
            <ArrowDown className="size-3.5" aria-hidden /> Último
        </button>
    );
}

// ── Tarjeta de un mensaje ────────────────────────────────────────────────────

const ID_RESPONDIBLE = /^md-\d{10,16}-[0-9a-f]{4}$/;
const NOMBRE_ENTREGA: Record<string, string> = { pendiente: "pendiente", entregado: "entregado", respondido: "respondido", fallo: "fallo en la entrega" };

function nombreCanal(id: string): string {
    return CANALES.find((c) => c.id === id)?.nombre ?? id;
}

/** Nombre corto de un motor para el selector (sin el paréntesis). */
export function nombreCortoMotor(id: string): string {
    const m = MOTORES_DIRECTOR.find((x) => x.id === id);
    return m ? m.nombre.replace(/\s*\([^)]*\)\s*$/, "") : id;
}

interface TarjetaProps {
    mensaje: RegistroEspejo;
    ahora: number;
    esDueno: boolean;
    anchaSm: boolean;
    onAccion: (mensaje: RegistroEspejo, modo: "responder" | "reenviar") => void;
}

function TarjetaDireccion({ mensaje: m, ahora, esDueno, anchaSm, onAccion }: TarjetaProps) {
    const esAlex = m.rol === "alex";
    const esSistema = m.rol === "sistema";
    const esPresidente = m.canal === "director-presidente" && !esAlex;
    const entregas = Object.entries(m.entregas ?? {}) as [string, { estado: string; detalle?: string }][];
    const acciones = esDueno && !esSistema && ID_RESPONDIBLE.test(m.id);
    const autor = esAlex ? "Tú" : esPresidente ? "Director presidente" : nombreDeAutor(m.de);
    return (
        <article
            data-testid="mensaje-direccion"
            data-autor={esAlex ? "alex" : m.de}
            className={cn(
                "rounded-xl border p-3 text-xs",
                esAlex ? "ml-auto max-w-[92%] border-cyan-400/30 bg-cyan-500/10 sm:max-w-[85%]"
                    : esPresidente ? "mr-auto max-w-[92%] border-amber-400/35 bg-amber-500/10 sm:max-w-[85%]"
                        : esSistema ? "border-amber-500/30 bg-amber-900/30" : "border-violet-500/20 bg-zinc-900/70",
            )}
        >
            <header className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", esAlex ? "text-cyan-300" : esPresidente ? "text-amber-300" : "text-zinc-400")}>
                <span className={cn("font-semibold", esAlex ? "text-cyan-200" : esPresidente ? "text-amber-100" : "text-violet-200")}>{autor}</span>
                {!esAlex && !esPresidente && !esSistema ? (
                    <span className="rounded border border-zinc-700/50 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300">{rolDeDirector(m.de, m.tipo)}</span>
                ) : null}
                {llegoPorGenesis(m) ? (
                    <span data-testid="via-genesis" className="rounded border border-cyan-400/30 bg-cyan-400/15 px-1.5 py-0.5 text-[10px] text-cyan-100">vía Genesis en Astraura</span>
                ) : null}
                {m.sintesis ? <span className="rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-100">síntesis</span> : null}
                <span className="ml-auto text-[10px] opacity-80">{horaMensaje(m.t, ahora)}</span>
                {acciones && !anchaSm ? (
                    <button type="button" aria-label="Acciones del mensaje" onClick={() => onAccion(m, "responder")} className="grid size-8 cursor-pointer place-items-center rounded-lg border border-white/10 text-white/60 hover:bg-white/10 hover:text-white">
                        <MoreHorizontal className="size-4" />
                    </button>
                ) : null}
            </header>
            <p className={cn("mt-2 whitespace-pre-line break-words [overflow-wrap:anywhere]", esAlex ? "text-cyan-50" : esPresidente ? "text-amber-50" : "text-zinc-100")}>{m.texto}</p>
            {m.modelo || m.canal !== "mando" ? (
                <p className="mt-1.5 break-words text-[10px] text-white/40">
                    {m.canal !== "mando" ? `desde ${nombreCanal(m.canal)}` : ""}
                    {m.modelo ? `${m.canal !== "mando" ? " · " : ""}${m.modelo}` : ""}
                </p>
            ) : null}
            {entregas.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                    {entregas.map(([canal, e]) => (
                        <li key={canal} className={e.estado === "fallo" ? "text-rose-400" : "text-zinc-500"}>
                            {nombreCanal(canal)}: {e.detalle && e.detalle.startsWith("En cola") ? "en cola" : NOMBRE_ENTREGA[e.estado] ?? e.estado}
                        </li>
                    ))}
                </ul>
            ) : null}
            {acciones && anchaSm ? (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-white/5 pt-2">
                    <button type="button" onClick={() => onAccion(m, "responder")} className="flex cursor-pointer items-center gap-1 rounded-lg border border-violet-500/40 px-2.5 py-1 text-[11px] text-violet-200 transition-colors hover:bg-violet-600/20">
                        <Reply className="size-3.5" aria-hidden /> Responder con…
                    </button>
                    <button type="button" onClick={() => onAccion(m, "reenviar")} className="flex cursor-pointer items-center gap-1 rounded-lg border border-violet-500/40 px-2.5 py-1 text-[11px] text-violet-200 transition-colors hover:bg-violet-600/20">
                        <Send className="size-3.5" aria-hidden /> Enviar a…
                    </button>
                </div>
            ) : null}
        </article>
    );
}

// ── Hoja de acciones de un mensaje («Responder con» y «Enviar a») ────────────

function HojaAcciones({ mensaje, modo, vaA, onCerrar, onResponder, onReenviar }: {
    mensaje: RegistroEspejo | null;
    modo: "responder" | "reenviar";
    /** «Va a …»: responder y reenviar siempre ponen a trabajar a alguien (§3.6, `alto`). */
    vaA: string;
    onCerrar: () => void;
    onResponder: (id: string, modelo: string) => void;
    onReenviar: (id: string, canales: CanalId[]) => void;
}) {
    const [seccion, setSeccion] = useState(modo);
    const [modelo, setModelo] = useState<string>(MODELO_PRESIDENTE);
    const [canales, setCanales] = useState<CanalId[]>([]);
    useEffect(() => { setSeccion(modo); setCanales([]); }, [mensaje, modo]);
    if (!mensaje) return null;
    const pie = seccion === "responder" ? (
        <button type="button" onClick={() => { onResponder(mensaje.id, modelo); onCerrar(); }} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">
            <Reply className="size-3.5" aria-hidden /> Pedir respuesta
        </button>
    ) : (
        <button type="button" disabled={canales.length === 0} onClick={() => { onReenviar(mensaje.id, canales); onCerrar(); }} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40">
            <Send className="size-3.5" aria-hidden /> Enviar a {canales.length}
        </button>
    );
    return (
        <Hoja titulo="Acciones del mensaje" abierta onCerrar={onCerrar} pie={<div className="flex w-full flex-col items-end gap-2"><LineaVaA texto={vaA} />{pie}</div>}>
            <div role="tablist" aria-label="Acción" className="mb-2 grid grid-cols-2 gap-1 rounded-xl border border-white/10 p-1">
                {(["responder", "reenviar"] as const).map((s) => (
                    <button key={s} type="button" role="tab" aria-selected={seccion === s} onClick={() => setSeccion(s)} className={cn("cursor-pointer rounded-lg px-2 py-2 text-xs", seccion === s ? "bg-white/10 text-white" : "text-white/55 hover:text-white")}>
                        {s === "responder" ? "Responder con" : "Enviar a"}
                    </button>
                ))}
            </div>
            <ul className="flex flex-col gap-0.5">
                {seccion === "responder"
                    ? MOTORES_DIRECTOR.map((mt) => (
                        <li key={mt.id}>
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-white/80 hover:bg-white/[0.05]">
                                <input type="radio" name="responder-con" checked={modelo === mt.id} onChange={() => setModelo(mt.id)} className="size-4 accent-violet-500" />
                                <span className="min-w-0 flex-1 break-words">{mt.nombre}</span>
                            </label>
                        </li>
                    ))
                    : CANALES.filter((c) => c.id !== mensaje.canal).map((c) => (
                        <li key={c.id}>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.05]">
                                <input type="checkbox" checked={canales.includes(c.id)} onChange={() => setCanales((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))} aria-label={c.nombre} className="mt-0.5 size-4 accent-violet-500" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] text-white/85">{c.nombre}</span>
                                    <span className="block text-[11px] leading-snug text-white/45">{c.descripcion}</span>
                                </span>
                            </label>
                        </li>
                    ))}
            </ul>
        </Hoja>
    );
}

// ── Cuadro de texto ──────────────────────────────────────────────────────────

const SOLO_HILO = "";

/** La línea «Va a …» (§3.9): la descripción fija del destino y el chat que se firma. */
export function LineaVaA({ texto }: { texto: string | null }) {
    if (!texto) return null;
    return (
        <p data-testid="linea-va-a" className="flex w-full items-start gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/10 px-2.5 py-1.5 text-left text-[11.5px] leading-snug text-violet-100">
            <Route className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{texto}</span>
        </p>
    );
}

/** El chat que se firma al escribir a la dirección con estos canales (§3.4): un solo canal → su chat. */
export function chatDeDireccion(catalogo: CatalogoCanon | null, canales: readonly CanalId[]): ChatVisto | null {
    const unico = canales.length === 1 && canales[0] !== "mando" ? canales[0]! : null;
    const c = chatParaFirmar(catalogo, "direccion", unico);
    return c ? { id: c.id, nombre: c.nombre } : null;
}

function CompositorDireccion({ esDueno, soloTexto, catalogo, onEnviar, aviso }: {
    esDueno: boolean;
    /** Aparato de nivel «texto»: escribe solo al hilo, sin motores (§3.9). */
    soloTexto: boolean;
    catalogo: CatalogoCanon | null;
    aviso: string | null;
    onEnviar: (d: { texto: string; modelo: string; canales: CanalId[] }) => Promise<boolean>;
}) {
    const conMotores = esDueno && !soloTexto;
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [modelo, setModelo] = useState<string>(() => {
        const g = leer(CLAVE_MODELO);
        return g !== null && (g === SOLO_HILO || MOTORES_DIRECTOR.some((m) => m.id === g)) ? g : MODELO_PRESIDENTE;
    });
    const [canales, setCanales] = useState<CanalId[]>(() => canalesDe(modelo));
    const [hojaCanales, setHojaCanales] = useState(false);
    const areaRef = useRef<HTMLTextAreaElement | null>(null);

    const cambiarModelo = (id: string) => {
        setModelo(id);
        guardar(CLAVE_MODELO, id);
        setCanales(canalesDe(id));
    };

    const enviar = async () => {
        const cuerpo = texto.trim();
        if (!cuerpo || enviando) return;
        setEnviando(true);
        const ok = await onEnviar(conMotores ? { texto: cuerpo, modelo, canales } : { texto: cuerpo, modelo: SOLO_HILO, canales: ["mando"] });
        setEnviando(false);
        // Si no se envió, el borrador se queda tal cual (§7.2).
        if (ok) {
            setTexto("");
            if (areaRef.current) areaRef.current.style.height = "";
        }
    };

    // «Va a …» solo cuando lo que se va a enviar despierta a un director (alto).
    const prevista = conMotores ? { fuente: "direccion" as const, accion: "decir" as const, canales, ...(modelo ? { modelo } : {}) } : null;
    const chatPrevisto = prevista ? chatDeDireccion(catalogo, canales) : null;
    const vaA = prevista && chatPrevisto && riesgoDeEntrada(prevista) === "alto" ? `Va a ${DESTINO_DE_FUENTE.direccion} · chat «${chatPrevisto.nombre}»` : null;

    return (
        <div data-testid="compositor-genesis" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 backdrop-blur-sm">
            {aviso ? <p role="alert" data-testid="aviso-envio" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11.5px] text-rose-100">{aviso}</p> : null}
            <LineaVaA texto={vaA} />
            <textarea
                ref={areaRef}
                rows={1}
                value={texto}
                aria-label="Mensaje a la dirección"
                placeholder={esDueno ? "Escribe a la dirección…" : "Escribe al hilo de dirección…"}
                onChange={(e) => {
                    setTexto(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(176, Math.max(44, e.target.scrollHeight))}px`;
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); }
                }}
                className="max-h-44 min-h-[44px] w-full resize-none rounded-xl border border-white/10 bg-background/50 px-3.5 py-2.5 text-[15px] leading-6 text-white placeholder:text-white/40 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
            <div className="flex min-w-0 items-center gap-2">
                {conMotores ? (
                    <>
                        <select
                            aria-label="Quién contesta"
                            value={modelo}
                            onChange={(e) => cambiarModelo(e.target.value)}
                            data-testid="selector-motor"
                            className="h-10 min-w-0 flex-1 cursor-pointer truncate rounded-lg border border-violet-500/30 bg-zinc-900 px-2.5 text-xs text-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400/60 sm:max-w-xs sm:flex-none"
                        >
                            {MOTORES_DIRECTOR.map((m) => <option key={m.id} value={m.id}>{nombreCortoMotor(m.id)}</option>)}
                            <option value={SOLO_HILO}>Solo al hilo (nadie contesta)</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => setHojaCanales(true)}
                            className="h-10 shrink-0 cursor-pointer rounded-lg border border-violet-500/30 bg-zinc-900 px-2.5 text-xs text-violet-200 hover:border-violet-400"
                        >
                            Canales ({canales.length})
                        </button>
                    </>
                ) : (
                    <p data-testid={soloTexto && esDueno ? "aviso-nivel" : undefined} className="min-w-0 flex-1 text-[11px] leading-snug text-white/45">
                        {esDueno
                            ? "Desde este aparato solo escribes al hilo. Para poner a trabajar a un director, emparéjalo como completo en la Mac."
                            : "Escribes solo al hilo. Poner a trabajar a un director lo hace un dueño de MetaGenesis."}
                    </p>
                )}
                <button
                    type="button"
                    onClick={() => void enviar()}
                    disabled={enviando || !texto.trim()}
                    aria-label="Enviar"
                    className="ml-auto flex h-10 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                    <Send className="size-4" />
                </button>
            </div>
            <Hoja titulo="Canales de destino" abierta={hojaCanales} onCerrar={() => setHojaCanales(false)} pie={
                <button type="button" onClick={() => setHojaCanales(false)} className="cursor-pointer rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">Listo</button>
            }>
                <ul className="flex flex-col gap-0.5">
                    {CANALES.map((c) => (
                        <li key={c.id}>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.05]">
                                <input type="checkbox" checked={canales.includes(c.id)} aria-label={c.nombre} onChange={() => setCanales((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))} className="mt-0.5 size-4 accent-violet-500" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] text-white/85">{c.nombre}</span>
                                    <span className="block text-[11px] leading-snug text-white/45">{c.descripcion}</span>
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>
            </Hoja>
        </div>
    );
}

function canalesDe(modelo: string): CanalId[] {
    if (modelo === SOLO_HILO) return ["mando"];
    const c = motorDe(modelo);
    return c === "api" ? [] : [c];
}

// ── El hilo ──────────────────────────────────────────────────────────────────

export interface HiloDireccionProps {
    cliente: ClienteChatsGenesis;
    esDueno: boolean;
    /** GEN1114F: la clave de este aparato (undefined = aún se está leyendo; null = no hay). */
    aparato?: AparatoLocal | null;
    /** GEN1114F: el catálogo de nombres (de él salen el nombre de la cabecera y el chat que se firma). */
    catalogo?: CatalogoCanon | null;
    /** GEN1114F: la tarjeta de emparejar avisa cuando cambia el aparato. */
    onAparato?: (a: AparatoLocal | null) => void;
}

export function HiloDireccion({ cliente, esDueno, aparato, catalogo = null, onAparato }: HiloDireccionProps) {
    const feed = useFeedEspejo(cliente, "direccion");
    const emparejado = aparato?.estado === "emparejado" ? aparato : null;
    const { envios, enviar, quitar } = useEnvios(cliente, emparejado ? emparejado.codigo.split("-")[0] : null);
    const [info, setInfo] = useState(false);
    // La cabecera enseña el chat de la dirección; es el que se firma con lo que va «al hilo».
    const chatHilo = chatDeDireccion(catalogo, ["mando"]);
    const nombreHilo = chatHilo?.nombre ?? nombreDeChat(catalogo, "direccion").nombre;
    const provisionalHilo = chatParaFirmar(catalogo, "direccion")?.provisional ?? true;
    const ahora = useAhora(1000);
    const anchaSm = usePantallaAncha(ANCHO_SM);
    const anchaLg = usePantallaAncha(ANCHO_LG);
    const { logRef, compositorRef, pegadoRef, pegado, bajar, alDesplazar } = useTecladoVisible();

    const [vista, setVista] = useState<FiltroFeed>(() => {
        const g = leer(CLAVE_VISTA);
        return VISTAS.some((v) => v.id === g) ? (g as FiltroFeed) : "todo";
    });
    const [chips, setChips] = useState<Partial<Record<FiltroFeed, string>>>(leerFiltros);
    const [aviso, setAviso] = useState<string | null>(null);
    const [accion, setAccion] = useState<{ mensaje: RegistroEspejo; modo: "responder" | "reenviar" } | null>(null);

    const mensajes = feed.registros;
    const dePestana = useMemo(() => filtrarFeed(mensajes, vista), [mensajes, vista]);
    const chipActivo = chips[vista] ?? FILTRO_TODOS;
    const ahoraFiltro = useMemo(() => Date.now(), [mensajes]); // eslint-disable-line react-hooks/exhaustive-deps
    const opciones = useMemo(() => opcionesDeFiltro(vista, dePestana, ahoraFiltro, chipActivo), [vista, dePestana, ahoraFiltro, chipActivo]);
    const visibles = useMemo(() => aplicarFiltro(dePestana, chipActivo, ahoraFiltro) as RegistroEspejo[], [dePestana, chipActivo, ahoraFiltro]);

    const elegirVista = (id: string) => {
        setVista(id as FiltroFeed);
        guardar(CLAVE_VISTA, id);
    };
    const elegirChip = useCallback((id: string) => {
        setChips((previos) => {
            const nuevos = { ...previos, [vista]: id };
            if (id === FILTRO_TODOS) delete nuevos[vista];
            guardar(CLAVE_FILTROS, JSON.stringify(nuevos));
            return nuevos;
        });
    }, [vista]);

    // Un envío que la copia ya trae deja de pintarse aparte (lo de la Mac manda).
    useEffect(() => {
        for (const e of envios) {
            if (e.estado !== "hecho" && e.estado !== "entregado") continue;
            const texto = e.entrada.texto;
            if (texto && mensajes.some((m) => m.rol === "alex" && m.texto === texto && Date.parse(m.t) >= e.iniciado - 120_000)) quitar(e.clave);
        }
    }, [envios, mensajes, quitar]);

    const ultimo = visibles[visibles.length - 1];
    const firmaFinal = `${ultimo?.id ?? ""}:${ultimo?.texto.length ?? 0}:${envios.length}`;
    useEffect(() => {
        if (pegadoRef.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [firmaFinal, pegadoRef, logRef]);

    const mandar = useCallback(async (entrada: Parameters<ClienteChatsGenesis["enviar"]>[0], texto: string) => {
        bajar();
        const chat = chatDeDireccion(catalogo, entrada.accion === "decir" ? entrada.canales ?? ["mando"] : []);
        const r = await enviar(entrada, texto, chat);
        setAviso(r.ok ? null : r.motivo);
        return r.ok;
    }, [bajar, enviar, catalogo]);

    const etiquetaVista = VISTAS.find((v) => v.id === vista)?.etiqueta ?? vista;
    const chipsEnLista = !anchaLg && opciones.length > 3;

    return (
        <section aria-label="Dirección de MetaGenesis" data-testid="hilo-direccion" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <CabeceraChat nombre={nombreHilo} provisional={provisionalHilo} onInfo={() => setInfo(true)} />
            <CabeceraEspejo latido={feed.latido} fallo={feed.fallo} cargado={feed.cargado} origen="mac" queEs="direccion" ahora={ahora} onReintentar={feed.releer} />

            <div className={cn("flex min-w-0 shrink-0 gap-2", !anchaSm && chipsEnLista ? "flex-row" : "flex-col")}>
                {anchaSm ? (
                    <div role="tablist" aria-label="Vistas de dirección" className="flex flex-wrap gap-1.5">
                        {VISTAS.map((v) => (
                            <button key={v.id} type="button" role="tab" aria-selected={vista === v.id} onClick={() => elegirVista(v.id)} className={cn("cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors", vista === v.id ? "border-violet-400/60 bg-violet-600/25 text-violet-100" : "border-white/10 text-white/55 hover:text-white/85")}>
                                {v.etiqueta}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="min-w-0 flex-1 basis-0" data-testid="vistas-en-lista">
                        <MenuListaMovil titulo="Vistas de dirección" opciones={VISTAS.map((v) => ({ id: v.id, label: v.etiqueta, hint: v.ayuda, icon: LayoutList, accent: "text-violet-300" }))} valor={vista} onCambiar={elegirVista} />
                    </div>
                )}
                {opciones.length > 1 ? (
                    chipsEnLista ? (
                        <div className={cn("min-w-0", anchaSm ? "" : "flex-1 basis-0")} data-testid="filtros-en-lista">
                            <MenuListaMovil
                                titulo={`Filtros de ${etiquetaVista}`}
                                opciones={opciones.map((o) => ({ id: o.id, label: o.etiqueta, hint: `${o.cuenta} mensajes`, icon: Filter, accent: "text-amber-300" }))}
                                valor={chipActivo}
                                onCambiar={elegirChip}
                            />
                        </div>
                    ) : (
                        <div role="group" aria-label={`Filtros de ${etiquetaVista}`} className="flex flex-wrap gap-1">
                            {opciones.map((o) => (
                                <button key={o.id} type="button" aria-pressed={chipActivo === o.id} onClick={() => elegirChip(o.id)} className={cn("cursor-pointer rounded-md border px-2 py-1 text-[11px] transition-colors", chipActivo === o.id ? "border-amber-400/60 bg-amber-500/15 text-amber-100" : "border-white/10 text-white/50 hover:text-white/85")}>
                                    {o.etiqueta} <span className="text-white/35">{o.cuenta}</span>
                                </button>
                            ))}
                        </div>
                    )
                ) : null}
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col">
                <div ref={logRef} role="log" aria-label="Mensajes de dirección" onScroll={alDesplazar} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-xl border border-white/5 bg-black/20 p-2">
                    <div className="mt-auto flex flex-col gap-2">
                        {!feed.cargado ? null : visibles.length === 0 && chipActivo !== FILTRO_TODOS ? (
                            <p data-testid="filtro-vacio" className="flex flex-wrap items-center gap-2 p-2 text-[12px] text-white/55">
                                Nada con «{etiquetaDeFiltro(chipActivo)}» en {etiquetaVista}{dePestana.length > 0 ? ` (hay ${dePestana.length} sin el filtro)` : ""}.
                                <button type="button" onClick={() => elegirChip(FILTRO_TODOS)} className="cursor-pointer rounded-md border border-amber-400/50 px-2 py-0.5 text-amber-100 hover:bg-amber-500/15">Quitar el filtro</button>
                            </p>
                        ) : visibles.length === 0 ? (
                            <p data-testid="hilo-vacio" className="p-2 text-[12px] text-white/50">
                                {mensajes.length === 0
                                    ? feed.latido
                                        ? `La copia de la Mac no trae mensajes (último latido: ${momentoTexto(Date.parse(feed.latido.t), ahora)}).`
                                        : feed.fallo ? "Sin copia que mostrar." : "La puerta del A1 aún no tiene ninguna copia del chat de dirección."
                                    : `Nada en ${etiquetaVista} entre los últimos ${mensajes.length} mensajes de la copia.`}
                            </p>
                        ) : (
                            visibles.map((m) => <TarjetaDireccion key={m.id} mensaje={m} ahora={ahora} esDueno={esDueno && emparejado?.nivel === "completo"} anchaSm={anchaSm} onAccion={(mensaje, modo) => setAccion({ mensaje, modo })} />)
                        )}
                        {envios.map((e) => <TarjetaEnvio key={e.clave} envio={e} ahora={ahora} destino="mac" onQuitar={quitar} />)}
                    </div>
                </div>
                {!pegado ? <BotonBajar onClick={bajar} /> : null}
            </div>

            <div ref={compositorRef} className="shrink-0 pb-[env(safe-area-inset-bottom)]">
                {aparato === undefined ? (
                    <p role="status" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/55">Comprobando la clave de este aparato…</p>
                ) : !emparejado ? (
                    <EmparejarAparato alCambiar={onAparato} />
                ) : (
                <CompositorDireccion
                    esDueno={esDueno}
                    soloTexto={emparejado.nivel !== "completo"}
                    catalogo={catalogo}
                    aviso={aviso}
                    onEnviar={({ texto, modelo, canales }) => mandar(
                        { fuente: "direccion", accion: "decir", texto, canales, ...(modelo ? { modelo } : {}) },
                        texto,
                    )}
                />
                )}
            </div>

            <Hoja titulo="Información del chat" abierta={info} onCerrar={() => setInfo(false)} completa>
                <InfoChat chat={chatDeFuente(catalogo, "direccion")} claveGen1113="direccion" esDueno={esDueno} />
            </Hoja>

            {esDueno && accion && emparejado?.nivel === "completo" ? (
                <HojaAcciones
                    mensaje={accion.mensaje}
                    modo={accion.modo}
                    vaA={`Va a ${DESTINO_DE_FUENTE.direccion} · chat «${nombreHilo}»`}
                    onCerrar={() => setAccion(null)}
                    onResponder={(id, modelo) => void mandar({ fuente: "direccion", accion: "responder", respondeA: id, modelo }, `Pedir respuesta a ${nombreCortoMotor(modelo)}`)}
                    onReenviar={(id, canales) => void mandar({ fuente: "direccion", accion: "reenviar", reenviar: id, canales }, `Reenviar a ${canales.map(nombreCanal).join(", ")}`)}
                />
            ) : null}
        </section>
    );
}
