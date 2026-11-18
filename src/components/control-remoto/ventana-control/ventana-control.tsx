"use client";

/**
 * VEN1115L · la ventana de control de otra neurona: la pantalla del aparato, el puntero convertido en dedos y los
 * mandos del aparato. Solo presentación: no sabe de sesiones ni de transporte; todo entra por props y sale por `alEnviar`.
 * Modo `flotante` (ventana que se arrastra y cambia de tamaño, o se reduce a una pastilla) o `pagina` (llena su contenedor).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PuntoColor } from "../punto-control";
import { CapaOndas, useOndas } from "./onda-toque";
import { PALABRAS_INDICADOR } from "@/lib/control-remoto/palabras-indicador";
import type { Giro, PropsVentanaControl } from "./tipos";
import { ajustar, deltaACuadro, puntoEnPantalla, tamanoGirado, type Caja } from "./geometria";
import { GestorToque } from "./gestor-toque";
import { trocear } from "./texto";
import { SelectorFuente } from "./selector-fuente";

export type { EntradaControl, PropsVentanaControl, FuentePedida } from "./tipos";

const BARRA_PX = 40;
const FILA_PX = 36;
const ANCHO_MIN = 240;
const ANCHO_CON_MANDOS = 340; // con los mandos abiertos la ventana no baja de aquí: la pantalla se ajusta con bandas
const ANCHO_DEFECTO = 420;
const CLAVE_MEMORIA = "starseed.ventana-control.lugar";

const TEXTO_ESTADO: Record<PropsVentanaControl["estado"], string> = {
    conectando: "Conectando",
    "en-vivo": "En vivo",
    "pausa-local": "En pausa",
    "sin-pantalla": "Sin pantalla",
    cerrada: "Cerrada",
};

const TECLAS: { cual: string; texto: string }[] = [
    { cual: "atras", texto: "Atrás" },
    { cual: "inicio", texto: "Inicio" },
    { cual: "recientes", texto: "Recientes" },
    { cual: "notificaciones", texto: "Notificaciones" },
    { cual: "ajustes-rapidos", texto: "Ajustes rápidos" },
    { cual: "bloquear", texto: "Bloquear" },
    { cual: "captura", texto: "Captura" },
    { cual: "menu-energia", texto: "Menú de encendido" },
    // CTL1117M · Mac controlado (lo que ofrece un escritorio)
    { cual: "volumen-subir", texto: "Volumen +" },
    { cual: "volumen-bajar", texto: "Volumen −" },
    { cual: "silencio", texto: "Silencio" },
];

/** CTL1117M · un aparato de escritorio se anuncia con la marca «escritorio» entre sus teclas (`control_capacidades`). */
export function esEscritorio(teclas: readonly string[]): boolean {
    return teclas.includes("escritorio");
}

/** CTL1118L · un Linux de escritorio se anuncia además con la marca «linux». */
export function esLinux(teclas: readonly string[]): boolean {
    return teclas.includes("linux");
}

/** CTL1117M · en un Mac, «Recientes» es Mission Control; (CTL1118L) en un Linux es cambiar de ventana (Alt+Tab). */
function rotuloTecla(cual: string, texto: string, escritorio: boolean, linux = false): string {
    if (!escritorio || cual !== "recientes") return texto;
    return linux ? "Cambiar de ventana" : "Mission Control";
}

/**
 * CTL1117M · la tecla física de quien controla un Mac → el texto que se manda («texto» con \n, \b). Solo letras, números,
 * signos, Intro y Borrar, sin Ctrl/Cmd/Alt: los atajos del propio navegador no salen hacia el otro Mac. Tab y Escape quedan
 * para moverse por la ventana (accesibilidad).
 */
export function textoDeTecla(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing?: boolean }): string | null {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return null;
    if (e.key === "Enter") return "\n";
    if (e.key === "Backspace") return "\b";
    return e.key.length >= 1 && [...e.key].length === 1 ? e.key : null;
}

const FLUJOS: { flujo: "multimedia" | "llamada" | "timbre" | "alarma"; texto: string }[] = [
    { flujo: "multimedia", texto: "Multimedia" },
    { flujo: "llamada", texto: "Llamada" },
    { flujo: "timbre", texto: "Timbre" },
    { flujo: "alarma", texto: "Alarma" },
];

interface Lugar {
    x: number;
    y: number;
    w: number;
}
let memoria: Lugar | null = null; // lo recuerda la sesión (también en sessionStorage si se puede)

function leerLugar(): Lugar | null {
    if (memoria) return memoria;
    try {
        const j = JSON.parse(window.sessionStorage.getItem(CLAVE_MEMORIA) ?? "null") as Partial<Lugar> | null;
        if (j && [j.x, j.y, j.w].every((n) => typeof n === "number" && Number.isFinite(n))) memoria = { x: j.x!, y: j.y!, w: j.w! };
    } catch {
        /* sin almacenamiento */
    }
    return memoria;
}

function guardarLugar(l: Lugar): void {
    memoria = l;
    try {
        window.sessionStorage.setItem(CLAVE_MEMORIA, JSON.stringify(l));
    } catch {
        /* sin almacenamiento */
    }
}

/** Para las pruebas: olvida el lugar recordado. */
export function olvidarLugarVentana(): void {
    memoria = null;
    try {
        window.sessionStorage.removeItem(CLAVE_MEMORIA);
    } catch {
        /* sin almacenamiento */
    }
}

/** Mantiene la ventana dentro de la vista: ancho entre el mínimo y la vista, y la barra siempre alcanzable. */
export function acotarLugar(l: Lugar, vw: number, vh: number): Lugar {
    const w = Math.max(Math.min(ANCHO_MIN, vw), Math.min(l.w, vw));
    return { w, x: Math.min(Math.max(0, l.x), Math.max(0, vw - w)), y: Math.min(Math.max(0, l.y), Math.max(0, vh - BARRA_PX)) };
}

function useCaja(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
    const [caja, setCaja] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const medir = () => setCaja((c) => (c.width === el.clientWidth && c.height === el.clientHeight ? c : { width: el.clientWidth, height: el.clientHeight }));
        medir();
        if (typeof ResizeObserver === "undefined") return;
        const o = new ResizeObserver(medir);
        o.observe(el);
        return () => o.disconnect();
    }, [ref]);
    return caja;
}

/** Envía el último valor como mucho cada `ms` (el primero al instante, el último siempre). */
function useLimitado<T>(f: (v: T) => void, ms: number): (v: T) => void {
    const fRef = useRef(f);
    fRef.current = f;
    const t = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ultimo = useRef(0);
    const pendiente = useRef<{ v: T } | null>(null);
    useEffect(() => () => {
        if (t.current) clearTimeout(t.current);
    }, []);
    return useCallback(
        (v: T) => {
            const ahora = Date.now();
            if (!t.current && ahora - ultimo.current >= ms) {
                ultimo.current = ahora;
                fRef.current(v);
                return;
            }
            pendiente.current = { v };
            if (t.current) return;
            t.current = setTimeout(() => {
                t.current = null;
                const p = pendiente.current;
                pendiente.current = null;
                if (p) {
                    ultimo.current = Date.now();
                    fRef.current(p.v);
                }
            }, Math.max(0, ms - (ahora - ultimo.current)));
        },
        [ms],
    );
}

function Deslizador({ etiqueta, valor, onCambia }: { etiqueta: string; valor: number | undefined; onCambia: (n: number) => void }) {
    const [local, setLocal] = useState<number | undefined>(undefined);
    useEffect(() => setLocal(undefined), [valor]);
    // CTL1117A · S5: como mucho 4 órdenes por segundo al arrastrar, y el valor FINAL al soltar sale en el acto.
    const enviar = useLimitado(onCambia, 250);
    const v = local ?? valor;
    const texto = v === undefined ? "sin dato" : `${Math.round(v * 100)} %`;
    return (
        <label className="flex min-h-10 items-center gap-2 text-[12px] text-white/80">
            <span className="w-24 shrink-0">{etiqueta}</span>
            <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={v ?? 0}
                aria-label={etiqueta}
                aria-valuetext={texto}
                onPointerUp={(e) => onCambia(Math.min(1, Math.max(0, Number(e.currentTarget.value))))}
                onKeyUp={(e) => onCambia(Math.min(1, Math.max(0, Number(e.currentTarget.value))))}
                onChange={(e) => {
                    const n = Math.min(1, Math.max(0, Number(e.target.value)));
                    setLocal(n);
                    enviar(n);
                }}
                className={`h-6 min-w-0 flex-1 cursor-pointer accent-[#DC143C] ${v === undefined ? "opacity-50" : ""}`}
            />
            <span className="w-14 shrink-0 text-right tabular-nums text-white/60">{texto}</span>
        </label>
    );
}

function Pantalla({ p, activo, gestor }: { p: PropsVentanaControl; activo: boolean; gestor: GestorToque }) {
    const caja = useRef<HTMLDivElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const tam = useCaja(caja);
    const { ondas, lanzar } = useOndas();
    const giro: Giro = p.pantalla?.giro ?? 0;
    const g = p.pantalla ? tamanoGirado(p.pantalla.ancho, p.pantalla.alto, giro) : { w: 16, h: 10 };
    const img = ajustar({ left: 0, top: 0, width: tam.width, height: tam.height }, g.w, g.h);
    const girada = giro === 90 || giro === 270;
    const vw = girada ? img.height : img.width;
    const vh = girada ? img.width : img.height;

    useEffect(() => {
        const v = video.current;
        if (!v) return;
        v.srcObject = p.flujo;
        if (p.flujo) void v.play?.().catch?.(() => undefined);
    }, [p.flujo]);

    /** Caja de la imagen en coordenadas del cliente, medida en el momento (la ventana se mueve). */
    const imagenCliente = useCallback((): Caja => {
        const r = caja.current?.getBoundingClientRect();
        return { left: (r?.left ?? 0) + img.left, top: (r?.top ?? 0) + img.top, width: img.width, height: img.height };
    }, [img.left, img.top, img.width, img.height]);

    const activoRef = useRef(activo);
    activoRef.current = activo;
    const giroRef = useRef(giro);
    giroRef.current = giro;

    useEffect(() => {
        const el = caja.current;
        if (!el) return;
        const rueda = (e: WheelEvent) => {
            if (!activoRef.current) return;
            const im = imagenCliente();
            const pt = puntoEnPantalla(e.clientX, e.clientY, im, giroRef.current);
            if (pt.fuera) return;
            e.preventDefault();
            const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
            if (e.ctrlKey) {
                gestor.pellizcar(pt.x, pt.y, e.deltaY * k);
            } else {
                const [dx, dy] = deltaACuadro((-e.deltaX * k) / im.width, (-e.deltaY * k) / im.height, giroRef.current);
                gestor.desplazar(pt.x, pt.y, dx, dy);
            }
        };
        el.addEventListener("wheel", rueda, { passive: false });
        return () => el.removeEventListener("wheel", rueda);
    }, [gestor, imagenCliente]);

    const clave = (e: React.PointerEvent) => `p${e.pointerId}`;
    const alBajar = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!activo) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const pt = puntoEnPantalla(e.clientX, e.clientY, imagenCliente(), giro);
        if (pt.fuera) return;
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* puntero sintético */
        }
        (e.currentTarget.closest("[data-ventana-control]") as HTMLElement | null)?.focus({ preventScroll: true });
        // CTL1117I: eco local de MI clic, al instante y en mi color (no espera al vídeo del aparato).
        const r = caja.current?.getBoundingClientRect();
        lanzar(e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
        gestor.abajo(clave(e), pt.x, pt.y);
    };
    const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!activo) return;
        const pt = puntoEnPantalla(e.clientX, e.clientY, imagenCliente(), giro);
        if (pt.fuera) gestor.levantar(clave(e), pt.x, pt.y); // sale de la imagen: acotado y el trazo acaba
        else gestor.mover(clave(e), pt.x, pt.y);
    };
    const alSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
        const pt = puntoEnPantalla(e.clientX, e.clientY, imagenCliente(), giro);
        gestor.levantar(clave(e), pt.x, pt.y);
    };
    const alPerder = (e: React.PointerEvent<HTMLDivElement>) => gestor.levantar(clave(e));

    const mensaje = mensajeSobrePantalla(p);

    return (
        <div
            ref={caja}
            data-testid="ventana-control-pantalla"
            className={`relative min-h-0 flex-1 select-none overflow-hidden bg-black ${activo ? "touch-none cursor-crosshair" : ""}`}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alPerder}
            onLostPointerCapture={alPerder}
            onContextMenu={(e) => activo && e.preventDefault()}
        >
            <div className="pointer-events-none absolute" style={{ left: img.left, top: img.top, width: img.width, height: img.height }} data-testid="ventana-control-imagen">
                    <video
                        ref={video}
                        muted
                        playsInline
                        autoPlay
                        aria-label={`Pantalla de ${p.nombre}`}
                        className="absolute bg-black object-contain"
                        style={{ width: vw, height: vh, left: (img.width - vw) / 2, top: (img.height - vh) / 2, transform: `rotate(${giro}deg)` }}
                    />
            </div>
            <CapaOndas ondas={ondas} color={p.miColor ?? "#ffffff"} />
            {!mensaje && <AvisoOrden p={p} />}
            {mensaje && (
                <div aria-live="polite" data-testid="ventana-control-mensaje" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 p-4 text-center text-sm text-white">
                    <span className="max-w-[90%] rounded-lg bg-[#0b0f1a]/90 px-3 py-2">
                        {mensaje}
                        {p.estado === "cerrada" && p.alReabrir && (
                            <button type="button" onClick={p.alReabrir} className="pointer-events-auto ml-2 min-h-8 cursor-pointer rounded-md bg-[#DC143C] px-2 text-white">
                                Reabrir
                            </button>
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}

/** CTL1117A · S3/S9: lo que pasó con la última orden (en palabras) y la cuenta atrás de la hora máxima de la sesión, sin tapar la imagen. */
function AvisoOrden({ p }: { p: PropsVentanaControl }) {
    const [ahora, setAhora] = useState(() => Date.now());
    const cuenta = p.caduca !== undefined && p.caduca - ahora <= 5 * 60_000 && p.caduca > ahora;
    useEffect(() => {
        if (p.caduca === undefined) return;
        const i = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(i);
    }, [p.caduca]);
    const restante = cuenta && p.caduca !== undefined ? Math.max(0, Math.ceil((p.caduca - ahora) / 1000)) : 0;
    const reloj = `${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}`;
    if (!p.motivo && !cuenta) return null;
    return (
        <div aria-live="polite" data-testid="ventana-control-aviso" className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-col items-center gap-1 text-center text-[12px] text-white">
            {p.motivo && <span className="pointer-events-none max-w-[95%] rounded-lg bg-[#0b0f1a]/90 px-3 py-1.5">{p.motivo}</span>}
            {cuenta && (
                <span className="flex items-center gap-2 rounded-lg bg-[#0b0f1a]/90 px-3 py-1.5">
                    <span data-testid="ventana-control-cuenta">La sesión termina en {reloj}; luego pulsa «Reabrir».</span>
                </span>
            )}
        </div>
    );
}

function mensajeSobrePantalla(p: PropsVentanaControl): string | null {
    const por = p.motivo ? ` · ${p.motivo}` : "";
    switch (p.estado) {
        case "conectando": return `Conectando con ${p.nombre}…${por}`;
        case "pausa-local": return `En pausa: alguien está tocando ${p.nombre}${por}`;
        case "sin-pantalla": return `${p.nombre} no enseña su pantalla${por}`;
        case "cerrada": return `Sesión cerrada${por}`;
        default:
            if (!p.pantalla || !p.flujo) return `Esperando la imagen de ${p.nombre}${por}`;
            return null;
    }
}

function dato(v: string | null): string {
    return v ?? "—";
}

function FilaEstado({ p }: { p: PropsVentanaControl }) {
    const a = p.aparato;
    const si = (b: boolean | undefined) => (b === undefined ? null : b ? "sí" : "no");
    const items: [string, string][] = [
        ["Batería", dato(a?.bateria === undefined ? null : `${Math.round(a.bateria * 100)} %${a.cargando ? " ⚡" : ""}`)],
        ["Wi‑Fi", dato(si(a?.red?.wifi))],
        ["Datos", dato(si(a?.red?.datos))],
        ["Bluetooth", dato(si(a?.red?.bluetooth))],
        ["Latencia", dato(p.latenciaMs === undefined ? null : `${Math.round(p.latenciaMs)} ms`)],
        ["Cuadros/s", dato(p.fps === undefined ? null : `${Math.round(p.fps)}`)],
    ];
    return (
        <ul aria-label="Estado del aparato" data-testid="ventana-control-estado-aparato" className="flex min-h-[2.25rem] flex-wrap gap-x-3 gap-y-0.5 px-3 py-1 text-[11px] text-white/60">
            {items.map(([k, v]) => (
                <li key={k} className="whitespace-nowrap">
                    {k}: <span className="tabular-nums text-white/85">{v}</span>
                </li>
            ))}
        </ul>
    );
}

function Controles({ p }: { p: PropsVentanaControl }) {
    const c = p.capacidades;
    const [texto, setTexto] = useState("");
    const escritorio = esEscritorio(c.teclas);
    const teclas = TECLAS.filter((t) => c.teclas.includes(t.cual));
    const enviarTexto = () => {
        if (!texto) return;
        for (const t of trocear(texto)) p.alEnviar({ tipo: "texto", texto: t });
        setTexto("");
    };
    const hay = teclas.length > 0 || c.volumen || c.brillo || c.texto;
    if (!hay) return <p className="px-3 py-2 text-[12px] text-white/55">Este aparato no ofrece mandos.</p>;
    return (
        <div data-testid="ventana-control-mandos" className="space-y-2 px-3 py-2">
            {teclas.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Botones del aparato">
                    {teclas.map((t) => (
                        <button
                            key={t.cual}
                            type="button"
                            onClick={() => p.alEnviar({ tipo: "tecla", cual: t.cual })}
                            className="min-h-10 min-w-10 cursor-pointer rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.12]"
                        >
                            {rotuloTecla(t.cual, t.texto, escritorio, esLinux(c.teclas))}
                        </button>
                    ))}
                </div>
            )}
            {c.volumen && (
                <div role="group" aria-label="Volumen">
                    {FLUJOS.map((f) => (
                        <Deslizador key={f.flujo} etiqueta={`Volumen de ${f.texto.toLowerCase()}`} valor={p.aparato?.volumen?.[f.flujo]} onCambia={(nivel) => p.alEnviar({ tipo: "volumen", flujo: f.flujo, nivel })} />
                    ))}
                </div>
            )}
            {c.brillo && <Deslizador etiqueta="Brillo" valor={p.aparato?.brillo} onCambia={(nivel) => p.alEnviar({ tipo: "brillo", nivel })} />}
            {c.texto && (
                <form
                    className="flex gap-1.5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        enviarTexto();
                    }}
                >
                    <input
                        type="text"
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        aria-label="Texto para escribir en el aparato"
                        placeholder="Escribir en el aparato"
                        autoComplete="off"
                        className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 text-[13px] text-white placeholder:text-white/35"
                    />
                    <button type="submit" className="min-h-10 cursor-pointer rounded-lg bg-[#DC143C] px-3 text-[12px] font-medium text-white hover:bg-[#b01030]">
                        Enviar texto
                    </button>
                </form>
            )}
        </div>
    );
}

export function VentanaControl(props: PropsVentanaControl) {
    const { modo, estado, nivel, nombre } = props;
    const propsRef = useRef(props);
    propsRef.current = props;

    const activo = estado === "en-vivo" && nivel === "controlar" && props.capacidades.gestos;

    const gestor = useRef<GestorToque | null>(null);
    if (!gestor.current && typeof window !== "undefined") {
        gestor.current = new GestorToque({
            enviar: (e) => propsRef.current.alEnviar(e),
            ahora: () => performance.now(),
            fotograma: (f) => {
                const id = requestAnimationFrame(() => f());
                return () => cancelAnimationFrame(id);
            },
            esperar: (f, ms) => {
                const id = setTimeout(f, ms);
                return () => clearTimeout(id);
            },
            maxDedos: () => propsRef.current.capacidades.maxDedos,
        });
    }
    const g = gestor.current as GestorToque;

    // Todo dedo se levanta si deja de poder controlarse, si la ventana pierde el foco, se oculta o se cierra.
    useEffect(() => {
        if (!activo) g?.terminarTodo();
    }, [activo, g]);
    useEffect(() => {
        const fin = () => g?.terminarTodo();
        const oculta = () => document.visibilityState === "hidden" && fin();
        window.addEventListener("blur", fin);
        document.addEventListener("visibilitychange", oculta);
        return () => {
            window.removeEventListener("blur", fin);
            document.removeEventListener("visibilitychange", oculta);
            fin();
        };
    }, [g]);

    const [minimizada, setMinimizada] = useState(false);
    const [mandosAbiertos, setMandosAbiertos] = useState(modo === "pagina");
    const [vista, setVista] = useState({ w: 1280, h: 800 });
    const [lugar, setLugar] = useState<Lugar>(() => ({ x: -1, y: -1, w: ANCHO_DEFECTO }));

    useLayoutEffect(() => {
        const medir = () => setVista({ w: window.innerWidth, h: window.innerHeight });
        medir();
        window.addEventListener("resize", medir);
        return () => window.removeEventListener("resize", medir);
    }, []);
    useLayoutEffect(() => {
        if (modo !== "flotante") return;
        setLugar((l) => {
            const w = Math.min(ANCHO_DEFECTO, vista.w - 16);
            const base = l.x < 0 ? leerLugar() ?? { w, x: vista.w - w - 8, y: 56 } : l;
            return acotarLugar(base, vista.w, vista.h);
        });
    }, [modo, vista.w, vista.h]);

    const aspecto = props.pantalla ? (() => { const t = tamanoGirado(props.pantalla.ancho, props.pantalla.alto, props.pantalla.giro); return t.h / t.w; })() : 10 / 16;
    // el área de la pantalla mantiene la proporción de la pantalla; nunca más alta que la vista
    const conMandos = nivel === "controlar" && mandosAbiertos;
    const altoPantallaMax = conMandos ? Math.floor((vista.h - BARRA_PX - FILA_PX) * 0.5) : vista.h - BARRA_PX - FILA_PX - 16;
    const wMax = Math.max(conMandos ? Math.min(ANCHO_CON_MANDOS, vista.w) : ANCHO_MIN, Math.min(lugar.w, Math.floor(altoPantallaMax / aspecto)));
    const wVentana = Math.min(lugar.w, wMax);

    const arrastre = useRef<{ x: number; y: number; l: Lugar; que: "mover" | "tamano" } | null>(null);
    const empezar = (e: React.PointerEvent, que: "mover" | "tamano") => {
        if ((e.target as HTMLElement).closest("button") && que === "mover") return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* puntero sintético */
        }
        arrastre.current = { x: e.clientX, y: e.clientY, l: { ...lugar, w: wVentana }, que };
    };
    const seguir = (e: React.PointerEvent) => {
        const a = arrastre.current;
        if (!a) return;
        const dx = e.clientX - a.x;
        const dy = e.clientY - a.y;
        setLugar(acotarLugar(a.que === "mover" ? { ...a.l, x: a.l.x + dx, y: a.l.y + dy } : { ...a.l, w: a.l.w + Math.max(dx, dy / aspecto) }, vista.w, vista.h));
    };
    const terminar = () => {
        if (!arrastre.current) return;
        arrastre.current = null;
        setLugar((l) => {
            guardarLugar(l);
            return l;
        });
    };
    const teclaTamano = (e: React.KeyboardEvent) => {
        const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 24 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -24 : 0;
        if (!paso) return;
        e.preventDefault();
        setLugar((l) => {
            const n = acotarLugar({ ...l, w: l.w + paso }, vista.w, vista.h);
            guardarLugar(n);
            return n;
        });
    };

    const alTeclear = (e: React.KeyboardEvent) => {
        // Escape es «atrás»; ninguna otra tecla sale hacia el aparato (el cuadro de texto escribe por su botón).
        if (e.key === "Escape" && activo && props.capacidades.teclas.includes("atras")) {
            e.preventDefault();
            props.alEnviar({ tipo: "tecla", cual: "atras" });
            return;
        }
        // CTL1117M · en un Mac controlado, lo que se teclea sobre la pantalla llega como texto (no desde los cuadros de la ventana).
        if (activo && props.capacidades.texto && esEscritorio(props.capacidades.teclas)) {
            const el = e.target as HTMLElement | null;
            if (el?.closest?.("input,textarea,select,button,[contenteditable='true']")) return;
            const t = textoDeTecla(e);
            if (t) {
                e.preventDefault();
                props.alEnviar({ tipo: "texto", texto: t });
            }
        }
    };

    const chip = (
        <span
            data-testid="ventana-control-chip"
            className={`inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                estado === "en-vivo" ? "bg-emerald-500/20 text-emerald-300" : estado === "cerrada" ? "bg-white/10 text-white/60" : "bg-amber-400/20 text-amber-200"
            }`}
        >
            {TEXTO_ESTADO[estado]}
        </span>
    );
    const nota = nivel === "ver" ? (
        <span data-testid="ventana-control-solo-ver" className="whitespace-nowrap rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">
            Solo mirar
        </span>
    ) : null;

    const botonCerrar = (
        <button type="button" onClick={props.alCerrar} aria-label={`Cerrar el control de ${nombre}`} className="min-h-10 min-w-10 cursor-pointer rounded-lg text-white/80 hover:bg-white/10">
            ✕
        </button>
    );

    // CTL1117M · un Mac solo tiene una pantalla que ver: no se ofrece elegir entre fuentes de Android.
    const selector = props.alCambiarFuente && !esEscritorio(props.capacidades.teclas) && (
        <SelectorFuente
            pedida={props.fuentePedida ?? "auto"}
            real={props.fuenteReal ?? null}
            aviso={props.avisoFuente ?? null}
            onCambiar={props.alCambiarFuente}
        />
    );

    /** CTL1117I: «Tus toques» con mi color, para saber con qué color me ven las demás neuronas. */
    const leyendaMia = props.miColor && nivel === "controlar" && (
        <span data-testid="ventana-control-leyenda-mia" className="hidden shrink-0 items-center gap-1 text-[11px] text-white/60 sm:flex" title={PALABRAS_INDICADOR.toques.mios}>
            <PuntoColor color={props.miColor} />
            {PALABRAS_INDICADOR.toques.mios}
        </span>
    );

    const base = "flex flex-col overflow-hidden border border-white/10 bg-[#0b0f1a]/95 text-white shadow-2xl backdrop-blur-xl";

    if (modo === "pagina") {
        const mostrarSelector = props.alCambiarFuente && (mandosAbiertos || nivel === "ver");
        return (
            <section role="region" aria-label={`Control de ${nombre}`} tabIndex={-1} onKeyDown={alTeclear} className={`${base} h-full w-full min-h-0 outline-none`} data-testid="ventana-control" data-ventana-control data-modo="pagina">
                <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3">
                    {props.color && <PuntoColor color={props.color} />}
                    <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{nombre}</h2>
                    {leyendaMia}
                    {nota}
                    {chip}
                    {nivel === "ver" && mostrarSelector && selector}
                    {botonCerrar}
                </header>
                {props.ranuraMedio}
                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <Pantalla p={props} activo={activo} gestor={g} />
                        <FilaEstado p={props} />
                    </div>
                    {nivel === "controlar" && (
                        <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-white/10 md:max-h-none md:w-80 md:border-l md:border-t-0">
                            <Controles p={props} />
                            {mandosAbiertos && mostrarSelector && selector}
                        </div>
                    )}
                </div>
            </section>
        );
    }

    if (minimizada) {
        return (
            <div
                role="group"
                aria-label={`Control de ${nombre}, reducido`}
                data-testid="ventana-control-pastilla"
                className="fixed z-[2147482000] flex h-11 max-w-[calc(100vw-16px)] items-center gap-1 rounded-full border border-white/10 bg-[#0b0f1a]/95 pl-3 pr-1 text-white shadow-2xl backdrop-blur-xl"
                style={{ left: lugar.x, top: lugar.y }}
            >
                {props.color && <PuntoColor color={props.color} />}
                <button type="button" onClick={() => setMinimizada(false)} aria-label={`Abrir el control de ${nombre}`} className="min-h-10 min-w-0 cursor-pointer truncate text-[13px] font-medium">
                    {nombre}
                </button>
                {chip}
                {props.alCambiarFuente && selector}
                {botonCerrar}
            </div>
        );
    }

    const mostrarSelector = props.alCambiarFuente && (mandosAbiertos || nivel === "ver");
    return (
        <div
            role="dialog"
            aria-label={`Control de ${nombre}`}
            aria-modal="false"
            tabIndex={-1}
            onKeyDown={alTeclear}
            data-testid="ventana-control"
            data-ventana-control
            data-modo="flotante"
            className={`${base} fixed z-[2147482000] rounded-xl outline-none`}
            style={{ left: lugar.x, top: lugar.y, width: wVentana, maxHeight: vista.h - lugar.y }}
        >
            <header
                onPointerDown={(e) => empezar(e, "mover")}
                onPointerMove={seguir}
                onPointerUp={terminar}
                onPointerCancel={terminar}
                data-testid="ventana-control-barra"
                className="flex shrink-0 cursor-grab touch-none items-center gap-1.5 border-b border-white/10 px-2 active:cursor-grabbing"
                style={{ height: BARRA_PX }}
            >
                {props.color && <PuntoColor color={props.color} className="ml-1" />}
                <h2 className="min-w-0 flex-1 truncate pl-1 text-[13px] font-semibold">{nombre}</h2>
                {leyendaMia}
                {nota}
                {chip}
                {nivel === "ver" && mostrarSelector && selector}
                {nivel === "controlar" && (
                    <button type="button" onClick={() => setMandosAbiertos((v) => !v)} aria-pressed={mandosAbiertos} className="min-h-10 cursor-pointer rounded-lg px-2 text-[12px] text-white/80 hover:bg-white/10">
                        Controles
                    </button>
                )}
                <button type="button" onClick={() => setMinimizada(true)} aria-label={`Reducir el control de ${nombre} a una pastilla`} className="min-h-10 min-w-10 cursor-pointer rounded-lg text-white/80 hover:bg-white/10">
                    ▁
                </button>
                {botonCerrar}
            </header>
            {props.ranuraMedio}
            <div className="relative flex shrink-0 flex-col" style={{ height: Math.min(wVentana * aspecto, altoPantallaMax) }} data-testid="ventana-control-marco">
                <Pantalla p={props} activo={activo} gestor={g} />
            </div>
            <FilaEstado p={props} />
            {nivel === "controlar" && mandosAbiertos && (
                <div className="min-h-0 shrink overflow-y-auto border-t border-white/10">
                    <Controles p={props} />
                    {mostrarSelector && selector}
                </div>
            )}
            <div
                role="separator"
                tabIndex={0}
                aria-label="Cambiar el tamaño de la ventana"
                aria-orientation="horizontal"
                onKeyDown={teclaTamano}
                onPointerDown={(e) => empezar(e, "tamano")}
                onPointerMove={seguir}
                onPointerUp={terminar}
                onPointerCancel={terminar}
                data-testid="ventana-control-esquina"
                className="absolute bottom-0 right-0 h-6 w-6 cursor-nwse-resize touch-none"
            >
                <span className="absolute bottom-1 right-1 h-2.5 w-2.5 border-b-2 border-r-2 border-white/50" />
            </div>
        </div>
    );
}
