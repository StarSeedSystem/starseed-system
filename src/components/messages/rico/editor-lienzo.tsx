"use client";

/**
 * Compositor del lienzo del mensaje (C4 · pestaña «Lienzo»), en la línea del lienzo de creación del
 * OS: añadir texto (con el editor tipo Word), fotos/PNG/GIF, vídeo, audio, ventanas web, apps del
 * OS, apps en vivo, archivos y formas; seleccionar, arrastrar, escalar por las esquinas (Mayús
 * conserva la proporción), girar, ordenar capas, bloquear, duplicar, borrar, mover con el teclado
 * y con rejilla. Todo con eventos de puntero (ratón, lápiz y dedo por igual).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
    AppWindow,
    ArrowDownToLine,
    ArrowUpToLine,
    ChevronDown,
    ChevronUp,
    Circle,
    Copy,
    FileIcon,
    Film,
    Globe,
    Image as ImageIcon,
    Lock,
    Minus,
    Music,
    Pencil,
    Radio,
    RotateCw,
    Search,
    Shapes,
    Square,
    Star,
    Sticker,
    Trash2,
    Type,
    Unlock,
    type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DmAttachment } from "@/lib/messages/dm";
import type { UniversalAttachment } from "@/lib/files/os-files";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { BotonCompartirVivo } from "@/components/messages/vivo/boton-compartir-vivo";
import {
    colorTextoSobre,
    fondoCssDe,
    hostDeUrl,
    NOMBRE_ELEMENTO,
    PRESETS_LIENZO,
    urlMediaSegura,
    urlWebSegura,
    type PresetLienzo,
} from "@/lib/mensajeria/formato";
import type { AdjuntoVivo, ElementoLienzo, EstiloMensaje, LienzoMensaje, TipoElementoLienzo } from "@/lib/mensajeria/formato-tipos";
import { normalizarEnlace } from "./editor-doc";
import type { OpcionesCambio } from "./historial";
import {
    actualizarElemento,
    anguloHacia,
    cambiarTamano,
    crearElemento,
    duplicar,
    escalar,
    mover,
    moverCapa,
    PASO_REJILLA,
    presetDe,
    quitarElemento,
    type MovimientoCapa,
} from "./lienzo-ops";
import { PanelEstilo } from "./panel-estilo";
import { CapaFondoAnimado, ElementoVista, estiloCajaElemento } from "./render-lienzo";
import { Deslizador, Opcion, Seccion, SelectorColor } from "./ui-rico";
import styles from "./rico.module.css";

const UniversalFilePicker = dynamic(() => import("@/components/files/universal-file-picker").then((m) => m.UniversalFilePicker), { ssr: false });

export const ICONO_ELEMENTO: Record<TipoElementoLienzo, LucideIcon> = {
    texto: Type,
    imagen: ImageIcon,
    gif: Sticker,
    video: Film,
    audio: Music,
    web: Globe,
    app: AppWindow,
    vivo: Radio,
    archivo: FileIcon,
    forma: Shapes,
};

export type AccionElemento = MovimientoCapa | "duplicar" | "bloquear" | "eliminar";

/** Acciones de un elemento (panel, teclado). Devuelve el lienzo y la selección resultante. */
export function aplicarAccion(lienzo: LienzoMensaje, id: string, accion: AccionElemento): { lienzo: LienzoMensaje; seleccion: string | null } {
    switch (accion) {
        case "frente":
        case "adelante":
        case "atras":
        case "fondo":
            return { lienzo: { ...lienzo, elementos: moverCapa(lienzo.elementos, id, accion) }, seleccion: id };
        case "duplicar": {
            const r = duplicar(lienzo, id);
            return { lienzo: r.lienzo, seleccion: r.nuevoId ?? id };
        }
        case "bloquear":
            return { lienzo: actualizarElemento(lienzo, id, (e) => ({ ...e, bloqueado: e.bloqueado ? undefined : true })), seleccion: id };
        case "eliminar":
            return { lienzo: quitarElemento(lienzo, id), seleccion: null };
    }
}

// ───────────────────────────── Escenario ─────────────────────────────

type TipoGesto = "mover" | "escalar" | "rotar";

interface Gesto {
    tipo: TipoGesto;
    id: string;
    el0: ElementoLienzo;
    p0: { x: number; y: number };
    clave: string;
    movido: boolean;
    yaSeleccionado: boolean;
    esquina: { sx: -1 | 1; sy: -1 | 1 };
}

const ESQUINAS: { sx: -1 | 1; sy: -1 | 1; nombre: string }[] = [
    { sx: -1, sy: -1, nombre: "superior izquierda" },
    { sx: 1, sy: -1, nombre: "superior derecha" },
    { sx: -1, sy: 1, nombre: "inferior izquierda" },
    { sx: 1, sy: 1, nombre: "inferior derecha" },
];

export interface EscenarioLienzoProps {
    lienzo: LienzoMensaje;
    onChange: (l: LienzoMensaje, opciones?: OpcionesCambio) => void;
    estiloMensaje?: EstiloMensaje | null;
    seleccion: string | null;
    onSeleccion: (id: string | null) => void;
    onEditarTexto: (id: string) => void;
    onDeshacer: () => void;
    onRehacer: () => void;
    /** Los textos crecen solos si su contenido no cabe (corrección sin paso de deshacer). */
    onAjustarAltos?: (cambios: { id: string; h: number }[]) => void;
    className?: string;
}

export function EscenarioLienzo({
    lienzo,
    onChange,
    estiloMensaje,
    seleccion,
    onSeleccion,
    onEditarTexto,
    onDeshacer,
    onRehacer,
    onAjustarAltos,
    className,
}: EscenarioLienzoProps) {
    const areaRef = useRef<HTMLDivElement>(null);
    const tableroRef = useRef<HTMLDivElement>(null);
    const [area, setArea] = useState({ w: 640, h: 520 });
    const [arrastrando, setArrastrando] = useState(false);
    const gesto = useRef<Gesto | null>(null);
    const lienzoRef = useRef(lienzo);
    lienzoRef.current = lienzo;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onEditarRef = useRef(onEditarTexto);
    onEditarRef.current = onEditarTexto;

    useEffect(() => {
        const nodo = areaRef.current;
        if (!nodo) return;
        const medir = () => {
            const r = nodo.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) setArea({ w: r.width, h: r.height });
        };
        medir();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", medir);
            return () => window.removeEventListener("resize", medir);
        }
        const obs = new ResizeObserver(medir);
        obs.observe(nodo);
        return () => obs.disconnect();
    }, []);

    // Un texto que ya no cabe en su caja la estira hacia abajo (como en el lienzo de creación).
    useLayoutEffect(() => {
        const tablero = tableroRef.current;
        if (!tablero || !onAjustarAltos) return;
        const cambios: { id: string; h: number }[] = [];
        for (const el of lienzo.elementos) {
            if (el.tipo !== "texto") continue;
            const caja = tablero.querySelector<HTMLElement>(`[data-elemento="${el.id}"] [data-texto-caja]`);
            const alto = caja ? Math.ceil(caja.scrollHeight) : 0;
            if (alto > el.h + 1) cambios.push({ id: el.id, h: alto });
        }
        if (cambios.length) onAjustarAltos(cambios);
    }, [lienzo.elementos, onAjustarAltos]);

    const escala = Math.max(0.05, Math.min((area.w - 24) / lienzo.ancho, (area.h - 24) / lienzo.alto, 1.6));
    const anchoPx = lienzo.ancho * escala;
    const altoPx = lienzo.alto * escala;
    const ordenados = useMemo(() => [...lienzo.elementos].sort((a, b) => a.z - b.z), [lienzo.elementos]);
    const sel = lienzo.elementos.find((e) => e.id === seleccion) ?? null;

    const iniciar = useCallback(
        (e: React.PointerEvent, tipo: TipoGesto, el: ElementoLienzo, esquina: { sx: -1 | 1; sy: -1 | 1 } = { sx: 1, sy: 1 }) => {
            if (e.button !== 0 && e.pointerType === "mouse") return;
            e.stopPropagation();
            e.preventDefault();
            const yaSeleccionado = seleccion === el.id;
            onSeleccion(el.id);
            areaRef.current?.focus({ preventScroll: true });
            const tablero = tableroRef.current;
            if (!tablero) return;
            const esc = escala;
            const aUnidades = (cx: number, cy: number) => {
                const r = tablero.getBoundingClientRect();
                return { x: (cx - r.left) / esc, y: (cy - r.top) / esc };
            };
            gesto.current = { tipo, id: el.id, el0: el, p0: aUnidades(e.clientX, e.clientY), clave: `gesto-${el.id}-${Date.now()}`, movido: false, yaSeleccionado, esquina };
            const alMover = (ev: PointerEvent) => {
                const g = gesto.current;
                if (!g || g.el0.bloqueado) return;
                const p = aUnidades(ev.clientX, ev.clientY);
                const dx = p.x - g.p0.x;
                const dy = p.y - g.p0.y;
                if (!g.movido && Math.hypot(dx * esc, dy * esc) < 3) return;
                if (!g.movido) setArrastrando(true);
                g.movido = true;
                let nuevo: ElementoLienzo;
                if (g.tipo === "mover") nuevo = mover(g.el0, dx, dy, !ev.altKey);
                else if (g.tipo === "escalar") nuevo = escalar(g.el0, g.esquina.sx, g.esquina.sy, dx, dy, ev.shiftKey);
                else {
                    const rot = anguloHacia(g.el0.x + g.el0.w / 2, g.el0.y + g.el0.h / 2, p.x, p.y, ev.shiftKey);
                    nuevo = { ...g.el0, rot: rot || undefined };
                }
                onChangeRef.current(actualizarElemento(lienzoRef.current, g.id, () => nuevo), { agrupar: g.clave });
            };
            const alSoltar = () => {
                window.removeEventListener("pointermove", alMover);
                window.removeEventListener("pointerup", alSoltar);
                window.removeEventListener("pointercancel", alSoltar);
                const g = gesto.current;
                gesto.current = null;
                setArrastrando(false);
                // Segundo toque sobre un texto ya elegido (sin arrastrar) → editarlo.
                if (g && !g.movido && g.tipo === "mover" && g.yaSeleccionado && g.el0.tipo === "texto" && !g.el0.bloqueado) onEditarRef.current(g.id);
            };
            window.addEventListener("pointermove", alMover);
            window.addEventListener("pointerup", alSoltar);
            window.addEventListener("pointercancel", alSoltar);
        },
        [escala, onSeleccion, seleccion],
    );

    const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const mod = e.metaKey || e.ctrlKey;
        const k = e.key.toLowerCase();
        if (mod && k === "z") {
            e.preventDefault();
            if (e.shiftKey) onRehacer();
            else onDeshacer();
            return;
        }
        if (mod && k === "y") {
            e.preventDefault();
            onRehacer();
            return;
        }
        if (!sel) return;
        const flechas: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
        if (flechas[k]) {
            e.preventDefault();
            if (sel.bloqueado) return;
            const paso = e.shiftKey ? PASO_REJILLA : 1;
            const [dx, dy] = flechas[k];
            onChange(actualizarElemento(lienzo, sel.id, { x: sel.x + dx * paso, y: sel.y + dy * paso }), { agrupar: `teclas-${sel.id}`, ventana: 900 });
            return;
        }
        const accion = (a: AccionElemento) => {
            e.preventDefault();
            const r = aplicarAccion(lienzo, sel.id, a);
            onChange(r.lienzo);
            onSeleccion(r.seleccion);
        };
        if (k === "delete" || k === "backspace") return accion("eliminar");
        if (mod && k === "d") return accion("duplicar");
        if (e.key === "]") return accion(mod ? "frente" : "adelante");
        if (e.key === "[") return accion(mod ? "fondo" : "atras");
        if (k === "escape") {
            e.preventDefault();
            onSeleccion(null);
            return;
        }
        if (k === "enter" && sel.tipo === "texto") {
            e.preventDefault();
            onEditarTexto(sel.id);
        }
    };

    const tamAsa = 16 / escala;
    const tocable = 36 / escala;

    return (
        <div
            ref={areaRef}
            tabIndex={0}
            role="application"
            aria-roledescription="lienzo"
            aria-label="Lienzo del mensaje. Flechas para mover el elemento elegido (Mayús: de 10 en 10), Supr para borrarlo, Intro para editar un texto, corchetes para cambiar de capa."
            className={cn(styles.escenario, "relative h-full min-h-[260px] w-full", className)}
            onKeyDown={alTeclear}
            // Elementos y asas detienen la propagación: lo que llega aquí es un toque en el vacío.
            onPointerDown={() => onSeleccion(null)}
            data-escenario=""
        >
            <div
                ref={tableroRef}
                className={cn(styles.tablero, !lienzo.fondo && styles.transparente)}
                style={{
                    left: (area.w - anchoPx) / 2,
                    top: (area.h - altoPx) / 2,
                    width: anchoPx,
                    height: altoPx,
                    background: fondoCssDe(lienzo.fondo),
                    color: colorTextoSobre(lienzo.fondo) ?? "#fff",
                    borderRadius: 16,
                }}
            >
                <CapaFondoAnimado tipo={lienzo.animacionFondo} />
                <div
                    className={cn(styles.rejilla, arrastrando && styles.rejillaVisible)}
                    style={{ backgroundSize: `${PASO_REJILLA * 2 * escala}px ${PASO_REJILLA * 2 * escala}px` }}
                    aria-hidden="true"
                />
                <div className={styles.escena} style={{ width: lienzo.ancho, height: lienzo.alto, transform: `scale(${escala})` }}>
                    {ordenados.map((el) => (
                        <div
                            key={el.id}
                            className={cn(styles.editable, el.bloqueado && styles.editableBloqueado)}
                            style={estiloCajaElemento(el)}
                            onPointerDown={(e) => iniciar(e, "mover", el)}
                            onDoubleClick={() => el.tipo === "texto" && !el.bloqueado && onEditarTexto(el.id)}
                            data-elemento={el.id}
                            data-tipo={el.tipo}
                        >
                            <ElementoVista el={el} estiloBase={estiloMensaje ?? undefined} modo="edicion" escala={escala} mio />
                        </div>
                    ))}
                    {sel && (
                        <div
                            className={styles.seleccion}
                            style={{
                                left: sel.x,
                                top: sel.y,
                                width: sel.w,
                                height: sel.h,
                                transform: sel.rot ? `rotate(${sel.rot}deg)` : undefined,
                                boxShadow: `0 0 0 ${1.5 / escala}px #7c5cff, 0 0 0 ${4 / escala}px rgba(124,92,255,.22)`,
                            }}
                            data-seleccion={sel.id}
                        >
                            {!sel.bloqueado &&
                                ESQUINAS.map(({ sx, sy, nombre }) => (
                                    <div
                                        key={nombre}
                                        role="presentation"
                                        title={`Escalar desde la esquina ${nombre} (Mayús: mantener proporción)`}
                                        className="absolute flex items-center justify-center"
                                        style={{
                                            width: tocable,
                                            height: tocable,
                                            left: sx < 0 ? -tocable / 2 : undefined,
                                            right: sx > 0 ? -tocable / 2 : undefined,
                                            top: sy < 0 ? -tocable / 2 : undefined,
                                            bottom: sy > 0 ? -tocable / 2 : undefined,
                                            cursor: sx * sy > 0 ? "nwse-resize" : "nesw-resize",
                                            pointerEvents: "auto",
                                            touchAction: "none",
                                        }}
                                        onPointerDown={(e) => iniciar(e, "escalar", sel, { sx, sy })}
                                        data-asa={`${sx},${sy}`}
                                    >
                                        <span
                                            className={styles.asa}
                                            style={{ position: "static", width: tamAsa, height: tamAsa, boxShadow: `0 0 0 ${2 / escala}px #7c5cff, 0 ${2 / escala}px ${8 / escala}px rgba(0,0,0,.4)` }}
                                        />
                                    </div>
                                ))}
                            {!sel.bloqueado && (
                                <>
                                    <div className={styles.lineaGiro} style={{ top: -30 / escala, height: 30 / escala, width: 1.5 / escala }} />
                                    <div
                                        role="presentation"
                                        title="Girar (Mayús: de 15 en 15 grados)"
                                        className={styles.asaGiro}
                                        style={{
                                            width: 26 / escala,
                                            height: 26 / escala,
                                            left: `calc(50% - ${13 / escala}px)`,
                                            top: -56 / escala,
                                            boxShadow: `0 0 0 ${2 / escala}px #fff, 0 ${2 / escala}px ${10 / escala}px rgba(124,92,255,.6)`,
                                        }}
                                        onPointerDown={(e) => iniciar(e, "rotar", sel)}
                                        data-asa="giro"
                                    >
                                        <RotateCw style={{ width: 14 / escala, height: 14 / escala }} aria-hidden="true" />
                                    </div>
                                </>
                            )}
                            {sel.bloqueado && (
                                <span
                                    className="absolute flex items-center justify-center rounded-full bg-[#7c5cff] text-white"
                                    style={{ width: 24 / escala, height: 24 / escala, right: -12 / escala, top: -12 / escala }}
                                    aria-hidden="true"
                                >
                                    <Lock style={{ width: 13 / escala, height: 13 / escala }} />
                                </span>
                            )}
                        </div>
                    )}
                </div>
                {!lienzo.elementos.length && (
                    <div className="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center gap-2 p-6 text-center">
                        <Shapes className="h-8 w-8 text-white/35" aria-hidden="true" />
                        <p className="max-w-[28ch] text-[13px] text-white/60">Añade texto, fotos, vídeos, ventanas web o apps y colócalos a tu gusto.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ───────────────────────────── Añadir elementos ─────────────────────────────

type TipoMedio = "imagen" | "gif" | "video" | "audio" | "archivo";

const INFO_MEDIO: Record<TipoMedio, { titulo: string; accept?: string; ayuda: string }> = {
    imagen: { titulo: "Añadir imagen o PNG", accept: "image/*", ayuda: "Fotos y PNG con transparencia." },
    gif: { titulo: "Añadir GIF", accept: "image/gif,image/webp", ayuda: "GIF o WebP animado." },
    video: { titulo: "Añadir vídeo", accept: "video/*", ayuda: "MP4, WebM…" },
    audio: { titulo: "Añadir audio", accept: "audio/*", ayuda: "Notas de voz, música…" },
    archivo: { titulo: "Añadir archivo", ayuda: "Cualquier documento." },
};

export interface MedioElegido {
    url: string;
    nombre?: string;
    mime?: string;
    size?: number;
    /** Subido al OS (se lista también en los archivos del chat). */
    subido: boolean;
}

function nombreDeUrl(url: string): string {
    try {
        const u = new URL(url, "https://x.invalid");
        const ultimo = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
        return ultimo || hostDeUrl(url);
    } catch {
        return "archivo";
    }
}

const CLASE_INPUT =
    "h-11 w-full rounded-[14px] border-0 bg-white/[0.06] px-3.5 text-[14px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)] outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-[#7C5CFF]";

const CLASE_DIALOGO = "max-w-md rounded-[24px] border-white/[0.08] bg-[rgba(12,14,34,.94)] text-white";

const BOTON_PRINCIPAL =
    "ss-redondo inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#7C5CFF] px-5 text-[14px] font-semibold text-white shadow-[0_6px_18px_#7C5CFF55] transition-transform duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50";

const BOTON_FANTASMA =
    "ss-redondo inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)] transition-colors duration-200 hover:bg-white/[0.07]";

function DialogoMedio({ tipo, onCerrar, onElegir }: { tipo: TipoMedio | null; onCerrar: () => void; onElegir: (m: MedioElegido) => void }) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");
    const [selector, setSelector] = useState(false);
    const info = tipo ? INFO_MEDIO[tipo] : null;

    useEffect(() => {
        setUrl("");
        setError("");
    }, [tipo]);

    const desdeEnlace = () => {
        if (!tipo) return;
        const limpio = normalizarEnlace(url);
        const r = urlMediaSegura(limpio, { permitirDataImagen: tipo === "imagen" || tipo === "gif" });
        if (!r.ok) return setError(r.error);
        onElegir({ url: r.url, nombre: nombreDeUrl(r.url), subido: false });
    };

    const desdeArchivos = (adjuntos: UniversalAttachment[]) => {
        const a = adjuntos.find((x) => x.url);
        setSelector(false);
        if (!a?.url) return setError("Ese elemento no tiene un archivo que se pueda mostrar. Prueba con otro.");
        const r = urlMediaSegura(a.url, { permitirDataImagen: tipo === "imagen" || tipo === "gif" });
        if (!r.ok) return setError(r.error);
        onElegir({ url: r.url, nombre: a.name, mime: a.mime, size: a.size, subido: true });
    };

    return (
        <>
            <Dialog open={!!tipo} onOpenChange={(v) => !v && onCerrar()}>
                <DialogContent className={CLASE_DIALOGO}>
                    <DialogHeader>
                        <DialogTitle>{info?.titulo}</DialogTitle>
                        <DialogDescription className="text-white/60">{info?.ayuda}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 pt-1">
                        <button type="button" className={cn(BOTON_PRINCIPAL, "w-full")} onClick={() => setSelector(true)}>
                            <ImageIcon className="h-4 w-4" aria-hidden="true" /> Subir o elegir de tus archivos
                        </button>
                        <form
                            className="space-y-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                desdeEnlace();
                            }}
                        >
                            <label htmlFor="url-medio" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">
                                O pega un enlace
                            </label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    id="url-medio"
                                    value={url}
                                    onChange={(e) => {
                                        setUrl(e.target.value);
                                        setError("");
                                    }}
                                    placeholder="https://…"
                                    inputMode="url"
                                    className={CLASE_INPUT}
                                />
                                <button type="submit" className={BOTON_FANTASMA} disabled={!url.trim()}>
                                    Añadir enlace
                                </button>
                            </div>
                        </form>
                        {error && (
                            <p role="alert" className="rounded-[14px] bg-[#DC143C]/15 px-3 py-2 text-[13px] text-[#fda4af] shadow-[inset_0_0_0_1px_#DC143C55]">
                                {error}
                            </p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
            {selector && (
                <UniversalFilePicker
                    open={selector}
                    onOpenChange={setSelector}
                    onPick={desdeArchivos}
                    accept={info?.accept}
                    folder="mensajes"
                    title={info?.titulo}
                />
            )}
        </>
    );
}

function DialogoWeb({ abierto, onCerrar, onElegir }: { abierto: boolean; onCerrar: () => void; onElegir: (url: string, nombre?: string) => void }) {
    const [url, setUrl] = useState("");
    const [nombre, setNombre] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        if (abierto) {
            setUrl("");
            setNombre("");
            setError("");
        }
    }, [abierto]);
    const enviar = () => {
        const u = urlWebSegura(normalizarEnlace(url));
        if (!u) return setError("Escribe una dirección web que empiece por https://. Las ventanas no pueden abrir javascript:, archivos locales ni http sin cifrar.");
        onElegir(u, nombre.trim() || undefined);
    };
    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
            <DialogContent className={CLASE_DIALOGO}>
                <DialogHeader>
                    <DialogTitle>Añadir ventana web</DialogTitle>
                    <DialogDescription className="text-white/60">
                        Se verá dentro del mensaje en una ventana aislada. Algunos sitios no se dejan mostrar dentro: siempre habrá un botón para abrirlo en una pestaña nueva.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-3 pt-1"
                    onSubmit={(e) => {
                        e.preventDefault();
                        enviar();
                    }}
                >
                    <div className="space-y-1.5">
                        <label htmlFor="url-web" className="text-[13px] font-medium text-white/75">
                            Dirección
                        </label>
                        <input id="url-web" autoFocus value={url} onChange={(e) => (setUrl(e.target.value), setError(""))} placeholder="https://ejemplo.org" inputMode="url" className={CLASE_INPUT} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="nombre-web" className="text-[13px] font-medium text-white/75">
                            Título de la ventana (opcional)
                        </label>
                        <input id="nombre-web" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: Mapa de la asamblea" className={CLASE_INPUT} />
                    </div>
                    {error && (
                        <p role="alert" className="rounded-[14px] bg-[#DC143C]/15 px-3 py-2 text-[13px] text-[#fda4af] shadow-[inset_0_0_0_1px_#DC143C55]">
                            {error}
                        </p>
                    )}
                    <div className="flex justify-end">
                        <button type="submit" className={BOTON_PRINCIPAL} disabled={!url.trim()}>
                            <Globe className="h-4 w-4" aria-hidden="true" /> Añadir ventana
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DialogoApp({ abierto, onCerrar, onElegir }: { abierto: boolean; onCerrar: () => void; onElegir: (ruta: string, nombre: string) => void }) {
    const [busqueda, setBusqueda] = useState("");
    const apps = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return APP_CATALOG.filter((a) => a.open.route && a.open.route.startsWith("/") && a.status !== "soon").filter(
            (a) => !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q),
        );
    }, [busqueda]);
    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
            <DialogContent className={cn(CLASE_DIALOGO, "max-w-lg")}>
                <DialogHeader>
                    <DialogTitle>Añadir una app del OS</DialogTitle>
                    <DialogDescription className="text-white/60">Aparece como una ventana con su nombre; quien lo reciba la abre con un toque.</DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" aria-hidden="true" />
                    <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar app" aria-label="Buscar app" className={cn(CLASE_INPUT, "pl-10")} />
                </div>
                <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1" role="list">
                    {apps.map((a) => {
                        const Icono = a.icon;
                        const acento = a.accent.startsWith("#") ? a.accent : "#7C5CFF";
                        return (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => onElegir(a.open.route!, a.name)}
                                    className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
                                >
                                    <span className="grid h-10 w-10 flex-none place-items-center rounded-[12px]" style={{ background: `${acento}1f`, boxShadow: `inset 0 0 0 1px ${acento}66` }}>
                                        {a.iconUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={a.iconUrl} alt="" className="h-7 w-7 rounded-lg object-cover" />
                                        ) : (
                                            <Icono className="h-5 w-5 text-white" aria-hidden="true" />
                                        )}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[14px] font-semibold text-white">{a.name}</span>
                                        <span className="line-clamp-1 block text-[12px] text-white/60">{a.description}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                    {!apps.length && <li className="px-3 py-6 text-center text-[13px] text-white/55">No hay apps con ese nombre.</li>}
                </ul>
            </DialogContent>
        </Dialog>
    );
}

function FilaAnadir({ icono: Icono, titulo, ayuda, color = "#7C5CFF", onClick }: { icono: LucideIcon; titulo: string; ayuda: string; color?: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
        >
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66`, color }}>
                <Icono className="h-4 w-4" />
            </span>
            <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-white">{titulo}</span>
                <span className="block text-[12px] text-white/60">{ayuda}</span>
            </span>
        </button>
    );
}

export interface AnadirAlLienzoProps {
    hiloId: string;
    lienzo: LienzoMensaje;
    /** Añade el elemento (con su adjunto de chat si lo hay). */
    onAnadir: (el: ElementoLienzo, adjunto?: DmAttachment) => void;
    /** Tras añadir un texto, abrir su editor. */
    onEditarTexto: (id: string) => void;
    className?: string;
}

/** Menú vertical «Añadir al lienzo» (siempre montado: la app en vivo abre su propio diálogo). */
export function AnadirAlLienzo({ hiloId, lienzo, onAnadir, onEditarTexto, className }: AnadirAlLienzoProps) {
    const [medio, setMedio] = useState<TipoMedio | null>(null);
    const [web, setWeb] = useState(false);
    const [app, setApp] = useState(false);

    const anadirMedio = (m: MedioElegido) => {
        const tipo = medio;
        setMedio(null);
        if (!tipo) return;
        const el = crearElemento(tipo, lienzo, { url: m.url, nombre: m.nombre, mime: m.mime });
        const adjunto: DmAttachment | undefined = m.subido
            ? { kind: tipo === "imagen" || tipo === "gif" ? "image" : tipo === "archivo" ? "file" : tipo, url: m.url, name: m.nombre, mime: m.mime, size: m.size }
            : undefined;
        onAnadir(el, adjunto);
    };

    const forma = (tipo: "rect" | "circulo" | "estrella" | "linea") => onAnadir(crearElemento("forma", lienzo, { forma: { tipo, color: "#7c5cff", relleno: tipo !== "linea" } }));

    return (
        <div className={cn("space-y-1", className)}>
            <FilaAnadir
                icono={Type}
                titulo="Texto"
                ayuda="Con formato tipo Word"
                onClick={() => {
                    const el = crearElemento("texto", lienzo);
                    onAnadir(el);
                    onEditarTexto(el.id);
                }}
            />
            <FilaAnadir icono={ImageIcon} titulo="Imagen o PNG" ayuda="Desde tus archivos o un enlace" color="#10B981" onClick={() => setMedio("imagen")} />
            <FilaAnadir icono={Sticker} titulo="GIF" ayuda="Animado, en bucle" color="#39FF14" onClick={() => setMedio("gif")} />
            <FilaAnadir icono={Film} titulo="Vídeo" ayuda="Con sus controles" color="#007FFF" onClick={() => setMedio("video")} />
            <FilaAnadir icono={Music} titulo="Audio" ayuda="Música o nota de voz" color="#A78BFA" onClick={() => setMedio("audio")} />
            <FilaAnadir icono={Globe} titulo="Ventana web" ayuda="Un sitio dentro del mensaje" color="#007FFF" onClick={() => setWeb(true)} />
            <FilaAnadir icono={AppWindow} titulo="App del OS" ayuda="Pizarra, mapa, música…" color="#FFBF00" onClick={() => setApp(true)} />
            <BotonCompartirVivo
                hiloId={hiloId}
                modo="item-menu"
                onEnviar={({ attachments }) => {
                    // En vez de enviarse suelta, la app en vivo entra en el lienzo como un elemento más.
                    const vivo = attachments.find((a) => a.kind === "vivo") as AdjuntoVivo | undefined;
                    if (vivo) onAnadir(crearElemento("vivo", lienzo, { vivo, nombre: vivo.name }), vivo);
                }}
            />
            <FilaAnadir icono={FileIcon} titulo="Archivo" ayuda="Cualquier documento" color="#14B8A6" onClick={() => setMedio("archivo")} />
            <div className="px-3 pb-1 pt-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Formas</p>
                <div className="grid grid-cols-2 gap-2">
                    {(
                        [
                            ["rect", "Rectángulo", Square],
                            ["circulo", "Círculo", Circle],
                            ["estrella", "Estrella", Star],
                            ["linea", "Línea", Minus],
                        ] as const
                    ).map(([tipo, nombre, IconoForma]) => (
                        <Opcion key={tipo} onClick={() => forma(tipo)} className="flex-col gap-1 px-2 py-2.5 text-[12.5px]" aria-label={`Añadir forma: ${nombre}`}>
                            <IconoForma className="h-4 w-4" aria-hidden="true" />
                            {nombre}
                        </Opcion>
                    ))}
                </div>
            </div>
            <DialogoMedio tipo={medio} onCerrar={() => setMedio(null)} onElegir={anadirMedio} />
            <DialogoWeb
                abierto={web}
                onCerrar={() => setWeb(false)}
                onElegir={(url, nombre) => {
                    setWeb(false);
                    onAnadir(crearElemento("web", lienzo, { url, nombre }));
                }}
            />
            <DialogoApp
                abierto={app}
                onCerrar={() => setApp(false)}
                onElegir={(ruta, nombre) => {
                    setApp(false);
                    onAnadir(crearElemento("app", lienzo, { ruta, nombre }));
                }}
            />
        </div>
    );
}

// ───────────────────────────── Paneles ─────────────────────────────

function CampoNumero({ etiqueta, valor, onChange, paso = 1 }: { etiqueta: string; valor: number; onChange: (v: number) => void; paso?: number }) {
    return (
        <label className="flex min-w-0 flex-col gap-1 text-[11.5px] text-white/60">
            {etiqueta}
            <input
                type="number"
                value={Math.round(valor)}
                step={paso}
                onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChange(v);
                }}
                className="h-9 w-full rounded-[10px] border-0 bg-white/[0.06] px-2 text-[13px] tabular-nums text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)] outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFF]"
            />
        </label>
    );
}

function Interruptor({ etiqueta, activo, onChange }: { etiqueta: string; activo: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={activo}
            onClick={() => onChange(!activo)}
            className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-[14px] bg-white/[0.035] px-3 text-left text-[13px] text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] transition-colors duration-200 hover:bg-white/[0.07]"
        >
            {etiqueta}
            <span className={cn("ss-redondo relative h-6 w-10 flex-none rounded-full transition-colors duration-200", activo ? "bg-[#7C5CFF]" : "bg-white/15")} aria-hidden="true">
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200", activo ? "translate-x-[18px]" : "translate-x-0.5")} />
            </span>
        </button>
    );
}

function FilaAccion({ icono: Icono, etiqueta, onClick, peligro, disabled }: { icono: LucideIcon; etiqueta: string; onClick: () => void; peligro?: boolean; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-[12px] px-3 text-left text-[13.5px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40",
                peligro ? "text-[#fda4af] hover:bg-[#DC143C]/15" : "text-white/85 hover:bg-white/[0.07]",
            )}
        >
            <Icono className="h-4 w-4 flex-none" aria-hidden="true" />
            {etiqueta}
        </button>
    );
}

export interface PanelLienzoProps {
    lienzo: LienzoMensaje;
    onChange: (l: LienzoMensaje, opciones?: OpcionesCambio) => void;
    seleccion: string | null;
    onSeleccion: (id: string | null) => void;
}

/** Tamaño, fondo, animación y capas del lienzo. */
export function PanelLienzo({ lienzo, onChange, seleccion, onSeleccion }: PanelLienzoProps) {
    const actual = presetDe(lienzo);
    const capas = [...lienzo.elementos].sort((a, b) => b.z - a.z);
    return (
        <div className="space-y-6">
            <Seccion titulo="Tamaño del lienzo">
                <div className="grid grid-cols-2 gap-2">
                    {PRESETS_LIENZO.map((p) => {
                        const ratio = p.ancho / p.alto;
                        const w = ratio >= 1 ? 22 : 22 * ratio;
                        const h = ratio >= 1 ? 22 / ratio : 22;
                        return (
                            <Opcion key={p.id} activa={actual === p.id} onClick={() => onChange(cambiarTamano(lienzo, p.id as PresetLienzo))} className="justify-start gap-2.5">
                                <span className="grid h-6 w-6 flex-none place-items-center" aria-hidden="true">
                                    <span className="rounded-[3px] shadow-[inset_0_0_0_1.5px_currentColor]" style={{ width: w, height: h }} />
                                </span>
                                <span className="text-left leading-tight">
                                    <span className="block text-[13px]">{p.nombre}</span>
                                    <span className="block text-[11px] text-white/55">{p.proporcion}</span>
                                </span>
                            </Opcion>
                        );
                    })}
                </div>
            </Seccion>
            <PanelEstilo
                estilo={{ fondo: lienzo.fondo, animacionFondo: lienzo.animacionFondo }}
                onChange={(e) => onChange({ ...lienzo, fondo: e?.fondo, animacionFondo: e?.animacionFondo })}
                secciones={["fondo", "animacionFondo"]}
            />
            {capas.length > 0 && (
                <Seccion titulo="Capas">
                    <ul className="space-y-1" role="list" aria-label="Capas del lienzo (arriba la más visible)">
                        {capas.map((el) => {
                            const Icono = ICONO_ELEMENTO[el.tipo];
                            const activo = el.id === seleccion;
                            return (
                                <li key={el.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSeleccion(el.id)}
                                        aria-pressed={activo}
                                        className={cn(
                                            "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[12px] px-3 text-left text-[13px] transition-colors duration-200",
                                            activo ? "bg-[#7C5CFF]/[0.16] text-white shadow-[inset_0_0_0_1.5px_#7C5CFF]" : "text-white/80 hover:bg-white/[0.06]",
                                        )}
                                    >
                                        <Icono className="h-4 w-4 flex-none" aria-hidden="true" />
                                        <span className="min-w-0 flex-1 truncate">{nombreElemento(el)}</span>
                                        {el.bloqueado && <Lock className="h-3.5 w-3.5 flex-none text-white/55" aria-label="Bloqueado" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Seccion>
            )}
        </div>
    );
}

export function nombreElemento(el: ElementoLienzo): string {
    if (el.tipo === "texto") {
        const t = (el.texto?.bloques ?? [])
            .map((b) => ("tramos" in b ? b.tramos.map((x) => x.texto).join("") : ""))
            .join(" ")
            .trim();
        return t ? `Texto: ${t.slice(0, 40)}` : "Texto";
    }
    if (el.tipo === "web") return `Ventana: ${el.nombre || hostDeUrl(el.url)}`;
    if (el.tipo === "vivo") return `En vivo: ${el.vivo?.name ?? el.nombre ?? ""}`;
    const base = NOMBRE_ELEMENTO[el.tipo];
    return el.nombre ? `${base.charAt(0).toUpperCase()}${base.slice(1)}: ${el.nombre}` : `${base.charAt(0).toUpperCase()}${base.slice(1)}`;
}

export interface PanelElementoProps {
    el: ElementoLienzo;
    lienzo: LienzoMensaje;
    onChange: (l: LienzoMensaje, opciones?: OpcionesCambio) => void;
    onSeleccion: (id: string | null) => void;
    onEditarTexto: (id: string) => void;
}

/** Acciones y propiedades del elemento elegido. */
export function PanelElemento({ el, lienzo, onChange, onSeleccion, onEditarTexto }: PanelElementoProps) {
    const Icono = ICONO_ELEMENTO[el.tipo];
    const [urlWeb, setUrlWeb] = useState(el.url ?? "");
    const [errorWeb, setErrorWeb] = useState("");
    useEffect(() => {
        setUrlWeb(el.url ?? "");
        setErrorWeb("");
    }, [el.id, el.url]);

    const cambiar = (c: Partial<ElementoLienzo>, clave?: string) =>
        onChange(actualizarElemento(lienzo, el.id, c), clave ? { agrupar: `${clave}-${el.id}`, ventana: 1200 } : undefined);
    const accion = (a: AccionElemento) => {
        const r = aplicarAccion(lienzo, el.id, a);
        onChange(r.lienzo);
        onSeleccion(r.seleccion);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-[14px] bg-[#7C5CFF]/15 text-[#c4b5fd] shadow-[inset_0_0_0_1px_#7C5CFF55]" aria-hidden="true">
                    <Icono className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-white">{nombreElemento(el)}</p>
                    <p className="text-[12px] text-white/55">Elemento elegido</p>
                </div>
            </div>

            <Seccion titulo="Acciones">
                <div className="space-y-0.5">
                    {el.tipo === "texto" && <FilaAccion icono={Pencil} etiqueta="Editar texto" onClick={() => onEditarTexto(el.id)} disabled={el.bloqueado} />}
                    <FilaAccion icono={ArrowUpToLine} etiqueta="Traer al frente" onClick={() => accion("frente")} />
                    <FilaAccion icono={ChevronUp} etiqueta="Subir una capa" onClick={() => accion("adelante")} />
                    <FilaAccion icono={ChevronDown} etiqueta="Bajar una capa" onClick={() => accion("atras")} />
                    <FilaAccion icono={ArrowDownToLine} etiqueta="Enviar al fondo" onClick={() => accion("fondo")} />
                    <FilaAccion icono={Copy} etiqueta="Duplicar" onClick={() => accion("duplicar")} />
                    <FilaAccion icono={el.bloqueado ? Unlock : Lock} etiqueta={el.bloqueado ? "Desbloquear" : "Bloquear posición"} onClick={() => accion("bloquear")} />
                    <FilaAccion icono={Trash2} etiqueta="Eliminar" onClick={() => accion("eliminar")} peligro />
                </div>
            </Seccion>

            <Seccion titulo="Posición y tamaño">
                <div className="grid grid-cols-4 gap-2">
                    <CampoNumero etiqueta="X" valor={el.x} onChange={(v) => cambiar({ x: v }, "x")} />
                    <CampoNumero etiqueta="Y" valor={el.y} onChange={(v) => cambiar({ y: v }, "y")} />
                    <CampoNumero etiqueta="Ancho" valor={el.w} onChange={(v) => cambiar({ w: Math.max(12, v) }, "w")} />
                    <CampoNumero etiqueta="Alto" valor={el.h} onChange={(v) => cambiar({ h: Math.max(12, v) }, "h")} />
                </div>
                <Deslizador etiqueta="Giro" valor={Math.round(el.rot ?? 0)} min={-180} max={180} unidad="°" onChange={(v) => cambiar({ rot: v || undefined }, "rot")} />
                <Deslizador
                    etiqueta="Opacidad"
                    valor={Math.round((el.opacidad ?? 1) * 100)}
                    min={5}
                    max={100}
                    unidad=" %"
                    onChange={(v) => cambiar({ opacidad: v >= 100 ? undefined : v / 100 }, "opacidad")}
                />
                {el.tipo !== "forma" || el.forma?.tipo === "rect" ? (
                    <Deslizador etiqueta="Esquinas redondeadas" valor={Math.round(el.radio ?? 0)} min={0} max={120} unidad=" px" onChange={(v) => cambiar({ radio: v || undefined }, "radio")} />
                ) : null}
            </Seccion>

            {el.tipo === "texto" && (
                <Seccion titulo="Estilo del texto">
                    <PanelEstilo
                        estilo={el.estilo}
                        onChange={(e) => cambiar({ estilo: e ?? undefined }, "estilo")}
                        tamanoPorDefecto={28}
                        etiquetaTamano="Tamaño en el lienzo"
                        compacto
                    />
                </Seccion>
            )}

            {(el.tipo === "video" || el.tipo === "audio" || el.tipo === "gif") && (
                <Seccion titulo="Reproducción">
                    <div className="space-y-2">
                        {el.tipo === "video" && (
                            <Interruptor
                                etiqueta="Reproducir solo al abrir (en silencio)"
                                activo={!!el.autoplay}
                                onChange={(v) => cambiar(v ? { autoplay: true, silenciado: true } : { autoplay: undefined })}
                            />
                        )}
                        <Interruptor etiqueta="Repetir en bucle" activo={!!el.bucle} onChange={(v) => cambiar({ bucle: v || undefined })} />
                        {el.tipo !== "gif" && (
                            <Interruptor
                                etiqueta="Sin sonido"
                                activo={!!el.silenciado}
                                onChange={(v) => cambiar(v ? { silenciado: true } : { silenciado: undefined, autoplay: undefined })}
                            />
                        )}
                    </div>
                </Seccion>
            )}

            {el.tipo === "forma" && el.forma && (
                <Seccion titulo="Forma">
                    <div className="grid grid-cols-2 gap-2">
                        {(
                            [
                                ["rect", "Rectángulo", Square],
                                ["circulo", "Círculo", Circle],
                                ["estrella", "Estrella", Star],
                                ["linea", "Línea", Minus],
                            ] as const
                        ).map(([tipo, nombre, IconoForma]) => (
                            <Opcion key={tipo} activa={el.forma?.tipo === tipo} onClick={() => cambiar({ forma: { ...el.forma!, tipo } })} className="justify-start">
                                <IconoForma className="h-4 w-4" aria-hidden="true" /> {nombre}
                            </Opcion>
                        ))}
                    </div>
                    <SelectorColor nombre="Color de la forma" valor={el.forma.color} onChange={(c) => cambiar({ forma: { ...el.forma!, color: c ?? "#7c5cff" } }, "forma")} />
                    {el.forma.tipo !== "linea" && <Interruptor etiqueta="Relleno" activo={!!el.forma.relleno} onChange={(v) => cambiar({ forma: { ...el.forma!, relleno: v || undefined } })} />}
                </Seccion>
            )}

            {el.tipo === "web" && (
                <Seccion titulo="Ventana web">
                    <form
                        className="space-y-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const u = urlWebSegura(normalizarEnlace(urlWeb));
                            if (!u) return setErrorWeb("Solo direcciones https://.");
                            cambiar({ url: u });
                        }}
                    >
                        <input value={urlWeb} onChange={(e) => (setUrlWeb(e.target.value), setErrorWeb(""))} aria-label="Dirección de la ventana" className={CLASE_INPUT} inputMode="url" />
                        {errorWeb && (
                            <p role="alert" className="text-[12px] text-[#fda4af]">
                                {errorWeb}
                            </p>
                        )}
                        <button type="submit" className={cn(BOTON_FANTASMA, "w-full")}>
                            Cambiar dirección
                        </button>
                    </form>
                </Seccion>
            )}

            {el.tipo !== "texto" && el.tipo !== "forma" && (
                <Seccion titulo={el.tipo === "imagen" || el.tipo === "gif" ? "Descripción (texto alternativo)" : "Nombre"}>
                    <input
                        value={el.nombre ?? ""}
                        onChange={(e) => cambiar({ nombre: e.target.value || undefined }, "nombre")}
                        placeholder={el.tipo === "imagen" || el.tipo === "gif" ? "Qué se ve en la imagen" : "Nombre visible"}
                        aria-label={el.tipo === "imagen" || el.tipo === "gif" ? "Descripción de la imagen" : "Nombre del elemento"}
                        className={CLASE_INPUT}
                        maxLength={200}
                    />
                </Seccion>
            )}
        </div>
    );
}

/** Contenedor de cristal para las columnas del editor. */
export function PanelCristal({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
    return (
        <div
            className={cn(
                "rounded-[22px] border border-white/[0.08] bg-[rgba(12,14,34,.55)] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-[20px] backdrop-saturate-[1.4]",
                className,
            )}
            style={style}
        >
            {children}
        </div>
    );
}
