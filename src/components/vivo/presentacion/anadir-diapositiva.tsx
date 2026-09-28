"use client";

/**
 * «Añadir a la diapositiva»: menú vertical con texto, imagen o GIF, vídeo, audio, ventana web,
 * app del OS y formas. Crea los elementos con `crearElemento` del lienzo de los mensajes y valida
 * cada dirección con sus mismas reglas (solo https, sin javascript:/blob:). No ofrece «app en
 * vivo»: esa opción comparte en un chat y aquí no hay chat.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AppWindow, Circle, Film, Globe, Image as ImageIcon, Minus, Music, Search, Square, Star, Type, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_CATALOG } from "@/components/dashboard/apps/app-catalog";
import { normalizarEnlace } from "@/components/messages/rico/editor-doc";
import { crearElemento } from "@/components/messages/rico/lienzo-ops";
import type { UniversalAttachment } from "@/lib/files/os-files";
import { urlMediaSegura, urlWebSegura } from "@/lib/mensajeria/formato";
import type { ElementoLienzo, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import { cn } from "@/lib/utils";

const UniversalFilePicker = dynamic(() => import("@/components/files/universal-file-picker").then((m) => m.UniversalFilePicker), { ssr: false });

type TipoMedio = "imagen" | "video" | "audio";

const MEDIOS: Record<TipoMedio, { titulo: string; accept: string; ayuda: string }> = {
    imagen: { titulo: "Añadir imagen, PNG o GIF", accept: "image/*", ayuda: "Desde tus archivos o con un enlace https://." },
    video: { titulo: "Añadir vídeo", accept: "video/*", ayuda: "MP4 o WebM, desde tus archivos o con un enlace." },
    audio: { titulo: "Añadir audio", accept: "audio/*", ayuda: "Música o una nota de voz." },
};

const CLASE_INPUT =
    "h-11 w-full rounded-[14px] border-0 bg-white/[0.06] px-3.5 text-[14px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)] outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-[#7C5CFF]";
const CLASE_DIALOGO = "max-w-md rounded-[24px] border-white/[0.08] bg-[rgba(12,14,34,.95)] text-white";
const BOTON_PRINCIPAL =
    "ss-redondo inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#7C5CFF] px-5 text-[14px] font-semibold text-white shadow-[0_6px_18px_#7C5CFF55] transition-transform duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50";
const BOTON_FANTASMA =
    "ss-redondo inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)] transition-colors duration-200 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50";

function Fila({ icono: Icono, titulo, ayuda, color = "#7C5CFF", onClick, disabled }: { icono: LucideIcon; titulo: string; ayuda: string; color?: string; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-45"
        >
            <span aria-hidden="true" className="ss-redondo grid h-9 w-9 flex-none place-items-center rounded-full" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66`, color }}>
                <Icono className="h-4 w-4" />
            </span>
            <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-white">{titulo}</span>
                <span className="block text-[12px] text-white/60">{ayuda}</span>
            </span>
        </button>
    );
}

export interface AnadirDiapositivaProps {
    lienzo: LienzoMensaje;
    onAnadir: (el: ElementoLienzo) => void;
    onEditarTexto: (id: string) => void;
    disabled?: boolean;
    className?: string;
}

export function AnadirDiapositiva({ lienzo, onAnadir, onEditarTexto, disabled, className }: AnadirDiapositivaProps) {
    const [medio, setMedio] = useState<TipoMedio | null>(null);
    const [web, setWeb] = useState(false);
    const [app, setApp] = useState(false);

    const forma = (tipo: "rect" | "circulo" | "estrella" | "linea") =>
        onAnadir(crearElemento("forma", lienzo, { forma: { tipo, color: "#7c5cff", relleno: tipo !== "linea" } }));

    return (
        <div className={cn("space-y-0.5", className)}>
            <Fila
                icono={Type}
                titulo="Texto"
                ayuda="Con formato tipo Word"
                disabled={disabled}
                onClick={() => {
                    const el = crearElemento("texto", lienzo);
                    onAnadir(el);
                    onEditarTexto(el.id);
                }}
            />
            <Fila icono={ImageIcon} titulo="Imagen o GIF" ayuda="Fotos, PNG con transparencia, GIF" color="#10B981" disabled={disabled} onClick={() => setMedio("imagen")} />
            <Fila icono={Film} titulo="Vídeo" ayuda="Con sus controles" color="#007FFF" disabled={disabled} onClick={() => setMedio("video")} />
            <Fila icono={Music} titulo="Audio" ayuda="Música o nota de voz" color="#A78BFA" disabled={disabled} onClick={() => setMedio("audio")} />
            <Fila icono={Globe} titulo="Ventana web" ayuda="Un sitio dentro de la diapositiva" color="#38BDF8" disabled={disabled} onClick={() => setWeb(true)} />
            <Fila icono={AppWindow} titulo="App del OS" ayuda="Pizarra, mapa, música…" color="#FFBF00" disabled={disabled} onClick={() => setApp(true)} />
            <div className="px-3 pb-1 pt-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Formas</p>
                <div className="grid grid-cols-2 gap-1.5">
                    {(
                        [
                            ["rect", "Rectángulo", Square],
                            ["circulo", "Círculo", Circle],
                            ["estrella", "Estrella", Star],
                            ["linea", "Línea", Minus],
                        ] as const
                    ).map(([tipo, nombre, Icono]) => (
                        <button
                            key={tipo}
                            type="button"
                            disabled={disabled}
                            onClick={() => forma(tipo)}
                            aria-label={`Añadir forma: ${nombre}`}
                            className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] bg-white/[0.04] px-2 py-2 text-[12.5px] text-white/85 transition-colors duration-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            <Icono className="h-4 w-4" aria-hidden="true" />
                            {nombre}
                        </button>
                    ))}
                </div>
            </div>
            <DialogoMedio
                tipo={medio}
                onCerrar={() => setMedio(null)}
                onElegir={(url, nombre, mime) => {
                    const tipo = medio;
                    setMedio(null);
                    if (!tipo) return;
                    const clase = tipo === "imagen" && (mime === "image/gif" || /\.gif(\?|$)/i.test(url)) ? "gif" : tipo;
                    onAnadir(crearElemento(clase, lienzo, { url, nombre, mime }));
                }}
            />
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

function MensajeError({ texto }: { texto: string }) {
    return (
        <p role="alert" className="rounded-[14px] bg-[#DC143C]/15 px-3 py-2 text-[13px] text-[#fda4af] shadow-[inset_0_0_0_1px_#DC143C55]">
            {texto}
        </p>
    );
}

function DialogoMedio({ tipo, onCerrar, onElegir }: { tipo: TipoMedio | null; onCerrar: () => void; onElegir: (url: string, nombre?: string, mime?: string) => void }) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");
    const [selector, setSelector] = useState(false);
    const info = tipo ? MEDIOS[tipo] : null;
    useEffect(() => {
        setUrl("");
        setError("");
    }, [tipo]);

    const desdeEnlace = () => {
        const r = urlMediaSegura(normalizarEnlace(url), { permitirDataImagen: tipo === "imagen" });
        if (!r.ok) return setError(r.error);
        const nombre = decodeURIComponent(new URL(r.url, "https://x.invalid").pathname.split("/").filter(Boolean).pop() ?? "") || undefined;
        onElegir(r.url, nombre);
    };
    const desdeArchivos = (adjuntos: UniversalAttachment[]) => {
        setSelector(false);
        const a = adjuntos.find((x) => x.url);
        if (!a?.url) return setError("Ese elemento no tiene un archivo que se pueda mostrar. Prueba con otro.");
        const r = urlMediaSegura(a.url, { permitirDataImagen: tipo === "imagen" });
        if (!r.ok) return setError(r.error);
        onElegir(r.url, a.name, a.mime);
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
                            <label htmlFor="url-medio-diapositiva" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                                O pega un enlace
                            </label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input id="url-medio-diapositiva" value={url} onChange={(e) => (setUrl(e.target.value), setError(""))} placeholder="https://…" inputMode="url" className={CLASE_INPUT} />
                                <button type="submit" className={BOTON_FANTASMA} disabled={!url.trim()}>
                                    Añadir enlace
                                </button>
                            </div>
                        </form>
                        {error && <MensajeError texto={error} />}
                    </div>
                </DialogContent>
            </Dialog>
            {selector && <UniversalFilePicker open={selector} onOpenChange={setSelector} onPick={desdeArchivos} accept={info?.accept} folder="presentaciones" title={info?.titulo} />}
        </>
    );
}

function DialogoWeb({ abierto, onCerrar, onElegir }: { abierto: boolean; onCerrar: () => void; onElegir: (url: string, nombre?: string) => void }) {
    const [url, setUrl] = useState("");
    const [nombre, setNombre] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        if (!abierto) return;
        setUrl("");
        setNombre("");
        setError("");
    }, [abierto]);
    const enviar = () => {
        const u = urlWebSegura(normalizarEnlace(url));
        if (!u) return setError("Escribe una dirección que empiece por https://. Las ventanas no abren javascript:, archivos locales ni http sin cifrar.");
        onElegir(u, nombre.trim() || undefined);
    };
    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
            <DialogContent className={CLASE_DIALOGO}>
                <DialogHeader>
                    <DialogTitle>Añadir ventana web</DialogTitle>
                    <DialogDescription className="text-white/60">
                        Se ve en una ventana aislada y se activa con un clic. Si un sitio no se deja mostrar dentro, siempre habrá un botón para abrirlo aparte.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-3 pt-1"
                    onSubmit={(e) => {
                        e.preventDefault();
                        enviar();
                    }}
                >
                    <label className="block space-y-1.5 text-[13px] font-medium text-white/75">
                        Dirección
                        <input autoFocus value={url} onChange={(e) => (setUrl(e.target.value), setError(""))} placeholder="https://ejemplo.org" inputMode="url" className={CLASE_INPUT} />
                    </label>
                    <label className="block space-y-1.5 text-[13px] font-medium text-white/75">
                        Título de la ventana (opcional)
                        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Por ejemplo: Mapa de la asamblea" className={CLASE_INPUT} />
                    </label>
                    {error && <MensajeError texto={error} />}
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
                    <DialogDescription className="text-white/60">Aparece como una ventana con su nombre; al presentar se abre con un toque.</DialogDescription>
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
                                        <Icono className="h-5 w-5 text-white" aria-hidden="true" />
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
