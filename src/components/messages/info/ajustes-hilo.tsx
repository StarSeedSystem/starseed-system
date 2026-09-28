"use client";

/**
 * AjustesHiloPanel (contrato C2) — los ajustes de UN chat, grupo o correo. Solo se guarda lo que
 * cambias; lo demás hereda de los ajustes generales de Mensajería (y lo dice al lado). Todo es
 * personal: silenciar, vaciar, archivar o restringir solo cambia lo que ves tú.
 * Escribe a través de `useAjustesMensajeria()` (C7).
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
    Archive, Bell, BellOff, BellRing, Check, Clock, Eraser, Eye, EyeOff, Image as ImageIcon, Link2, Loader2, MessageSquareText,
    Palette, Pin, RotateCcw, ShieldMinus, Tag, Type, Upload, Volume2, X,
} from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { COLORES_BURBUJA, FONDOS_PRESET, type AjustesApariencia, type AjustesHilo, type AjustesNotificaciones, type CargaMultimedia, type Densidad, type FondoChat, type TamanoLetra, type TipoHilo } from "@/lib/mensajeria/ajustes-tipos";
import { uploadFile } from "@/lib/files/os-files";
// Contrato C7.
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";
import { OPCIONES_SILENCIO, fondoCss, tamanoLetraPx } from "@/lib/mensajeria/ajustes";
import { esHex, esColorClaro, fechaCompleta, sombrear } from "@/components/messages/dm/utilidades-hilo";
import { FilaAjuste, Interruptor, RotuloSeccion, Segmentado, Tarjeta, PistaHereda } from "@/components/messages/info/piezas";

const TAMANOS: { id: TamanoLetra; etiqueta: string }[] = [
    { id: "s", etiqueta: "Pequeña" },
    { id: "m", etiqueta: "Normal" },
    { id: "l", etiqueta: "Grande" },
    { id: "xl", etiqueta: "Muy grande" },
];

const DENSIDADES: { id: Densidad; etiqueta: string }[] = [
    { id: "comoda", etiqueta: "Cómoda" },
    { id: "compacta", etiqueta: "Compacta" },
];

const CARGAS: { id: CargaMultimedia; etiqueta: string }[] = [
    { id: "siempre", etiqueta: "Siempre" },
    { id: "wifi", etiqueta: "Solo con wifi" },
    { id: "nunca", etiqueta: "Al tocar" },
];

function estadoSilencio(n: AjustesNotificaciones): string {
    const h = n.silencioHasta;
    if (!h) return "Suena normalmente";
    if (h === "siempre") return "Silenciado hasta que lo actives";
    const t = new Date(h).getTime();
    if (Number.isNaN(t) || t <= Date.now()) return "Suena normalmente";
    return `Silenciado hasta el ${fechaCompleta(h)}`;
}

function valorSilencio(n: AjustesNotificaciones): string {
    const h = n.silencioHasta;
    if (!h) return "no";
    if (h === "siempre") return "siempre";
    const t = new Date(h).getTime();
    return Number.isNaN(t) || t <= Date.now() ? "no" : "activo";
}

/** Vista previa en miniatura del chat con el fondo, la letra y mis burbujas. */
function VistaPrevia({ apariencia }: { apariencia: AjustesApariencia }) {
    const c = apariencia.colorBurbuja;
    const claro = esColorClaro(c);
    const px = tamanoLetraPx(apariencia.tamanoLetra);
    const hueco = apariencia.densidad === "compacta" ? 4 : 8;
    return (
        <div
            aria-hidden
            className="overflow-hidden rounded-2xl p-3"
            style={{ background: fondoCss(apariencia.fondo), boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
        >
            <div className="flex flex-col" style={{ gap: hueco, fontSize: px }}>
                <div className="max-w-[78%] self-start rounded-[16px] rounded-bl-[4px] px-3 py-1.5 text-white/90" style={{ background: "rgba(255,255,255,.08)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}>
                    ¿Nos vemos en la huerta?
                    {apariencia.mostrarHora && <span className="ml-2 text-[10px] text-white/50">{apariencia.formato24h ? "18:04" : "6:04 p. m."}</span>}
                </div>
                <div
                    className="max-w-[78%] self-end rounded-[16px] rounded-br-[4px] px-3 py-1.5"
                    style={{ background: `linear-gradient(135deg, ${sombrear(c, -0.1)}, ${c} 48%, ${sombrear(c, 0.28)})`, color: claro ? "#0b0b12" : "#fff" }}
                >
                    ¡Claro! Llevo semillas
                    {apariencia.mostrarHora && <span className={cn("ml-2 text-[10px]", claro ? "text-black/55" : "text-white/70")}>{apariencia.formato24h ? "18:05" : "6:05 p. m."}</span>}
                </div>
            </div>
        </div>
    );
}

function Muestra({
    activo, onClick, etiqueta, fondo, children,
}: { activo: boolean; onClick: () => void; etiqueta: string; fondo: string; children?: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={activo}
            aria-label={etiqueta}
            title={etiqueta}
            className="group/muestra flex w-[60px] cursor-pointer flex-col items-center gap-1 text-[11px] text-white/65 hover:text-white"
        >
            <span
                className={cn("grid h-11 w-11 place-items-center rounded-xl transition-transform duration-200 group-hover/muestra:scale-105", activo && "ring-2 ring-[#7C5CFF] ring-offset-2 ring-offset-[#0c0e22]")}
                style={{ background: fondo, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }}
            >
                {children}
            </span>
            <span className="w-full truncate text-center">{etiqueta}</span>
        </button>
    );
}

export interface AjustesHiloPanelProps {
    hiloId: string;
    tipo: TipoHilo;
    /** Sección a la que desplazarse al abrir (p. ej. "apariencia"). */
    foco?: string;
}

export function AjustesHiloPanel({ hiloId, tipo, foco }: AjustesHiloPanelProps) {
    const api = useAjustesMensajeria();
    const confirmar = useConfirm();
    const uid = useId();
    const hilo: AjustesHilo = api.ajustes.hilos?.[hiloId] ?? {};
    const ef = api.efectivos(hiloId, tipo);
    const esCorreo = tipo === "correo";
    const [apodo, setApodo] = useState(hilo.apodo ?? "");
    const [urlImagen, setUrlImagen] = useState(ef.apariencia.fondo.tipo === "imagen" ? ef.apariencia.fondo.url : "");
    const [subiendo, setSubiendo] = useState(false);
    const [etiquetaNueva, setEtiquetaNueva] = useState("");
    const archivoRef = useRef<HTMLInputElement>(null);
    const aparienciaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setApodo(api.ajustes.hilos?.[hiloId]?.apodo ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hiloId]);

    useEffect(() => {
        if (foco === "apariencia") aparienciaRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }, [foco]);

    const cambiar = (c: AjustesHilo) => api.cambiarHilo(hiloId, c);
    const cambiarApariencia = (c: Partial<AjustesApariencia>) => cambiar({ apariencia: c });
    const cambiarNotif = (c: Partial<AjustesNotificaciones>) => cambiar({ notificaciones: c });

    const heredaNotif = (k: keyof AjustesNotificaciones) => hilo.notificaciones?.[k] === undefined;
    const heredaAp = (k: keyof AjustesApariencia) => hilo.apariencia?.[k] === undefined;

    const guardarApodo = () => {
        const limpio = apodo.trim();
        if ((hilo.apodo ?? "") === limpio) return;
        cambiar({ apodo: limpio || undefined });
        toast.success(limpio ? `Verás este chat como «${limpio}»` : "Vuelves a ver su nombre de siempre");
    };

    const elegirFondo = (f: FondoChat) => cambiarApariencia({ fondo: f });

    const aplicarUrlImagen = () => {
        const u = urlImagen.trim();
        if (!u) return;
        if (!u.startsWith("https://") && !u.startsWith("/")) {
            toast.error("La imagen debe ser una dirección segura (https://).");
            return;
        }
        elegirFondo({ tipo: "imagen", url: u });
    };

    const subirImagen = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Elige un archivo de imagen.");
            return;
        }
        setSubiendo(true);
        try {
            const r = await uploadFile(file, { folder: "mensajes/fondos", meta: { context: "fondo-chat", hiloId } });
            if (r.ok && r.file?.url) {
                setUrlImagen(r.file.url);
                elegirFondo({ tipo: "imagen", url: r.file.url });
                toast.success("Fondo actualizado");
            } else {
                toast.error(r.error || "No se pudo subir la imagen.");
            }
        } finally {
            setSubiendo(false);
        }
    };

    const vaciar = async () => {
        const ok = await confirmar({
            title: "¿Vaciar este chat solo para ti?",
            description: "Dejarás de ver los mensajes anteriores. No se borra nada para nadie y puedes volver a mostrarlos.",
            confirmText: "Vaciar para mí",
            destructive: true,
        });
        if (!ok) return;
        cambiar({ vaciadoEn: new Date().toISOString() });
        toast.success("Chat vaciado para ti");
    };

    const restablecer = async () => {
        const ok = await confirmar({
            title: "¿Volver a los ajustes generales?",
            description: "Este chat dejará de tener apodo, fondo, silencio y demás ajustes propios, y seguirá los de Mensajería.",
            confirmText: "Volver a los generales",
        });
        if (!ok) return;
        api.restablecerHilo(hiloId);
        setApodo("");
        toast.success("Este chat sigue ahora los ajustes generales");
    };

    const etiquetas = hilo.etiquetas ?? [];
    const anadirEtiqueta = () => {
        const e = etiquetaNueva.trim().replace(/\s+/g, " ").slice(0, 32);
        if (!e) return;
        if (etiquetas.some((x) => x.toLowerCase() === e.toLowerCase())) {
            setEtiquetaNueva("");
            return;
        }
        cambiar({ etiquetas: [...etiquetas, e] });
        setEtiquetaNueva("");
    };

    const fondo = ef.apariencia.fondo;
    const esPreset = (id: string) => fondo.tipo === "preset" && fondo.id === id;
    const colorPropio = !COLORES_BURBUJA.some((c) => c.toLowerCase() === ef.apariencia.colorBurbuja.toLowerCase());
    const n = ef.notificaciones;

    // ───────────── Bloques ─────────────

    const bloqueSilencio = (
        <FilaAjuste
            icono={ef.silenciado ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            titulo="Silenciar"
            descripcion={estadoSilencio(n)}
            hereda={heredaNotif("silencioHasta")}
            abajo
        >
            <Segmentado
                etiqueta="Silenciar este chat"
                valor={valorSilencio(n)}
                onCambiar={(v) => {
                    if (v === "no") cambiarNotif({ silencioHasta: null });
                    else if (v !== "activo") {
                        const op = OPCIONES_SILENCIO.find((o) => o.id === v);
                        if (op) cambiarNotif({ silencioHasta: op.hasta(new Date()) });
                    }
                }}
                opciones={[
                    { id: "no", etiqueta: "No silenciar" },
                    ...OPCIONES_SILENCIO.map((o) => ({ id: o.id, etiqueta: o.etiqueta })),
                    ...(valorSilencio(n) === "activo" ? [{ id: "activo", etiqueta: "Silenciado" }] : []),
                ]}
            />
        </FilaAjuste>
    );

    const bloqueNotificaciones = (
        <Tarjeta>
            <RotuloSeccion className="mb-1">Notificaciones</RotuloSeccion>
            {bloqueSilencio}
            <FilaAjuste icono={<BellRing className="h-4 w-4" />} titulo="Avisos" descripcion="Recibir avisos de este chat" hereda={heredaNotif("activas")} htmlFor={`${uid}-activas`}>
                <Interruptor id={`${uid}-activas`} etiqueta="Avisos" activo={n.activas} onCambiar={(v) => cambiarNotif({ activas: v })} />
            </FilaAjuste>
            <FilaAjuste icono={<Volume2 className="h-4 w-4" />} titulo="Sonido" hereda={heredaNotif("sonido")} htmlFor={`${uid}-sonido`}>
                <Interruptor id={`${uid}-sonido`} etiqueta="Sonido" activo={n.sonido} onCambiar={(v) => cambiarNotif({ sonido: v })} />
            </FilaAjuste>
            <FilaAjuste icono={<Eye className="h-4 w-4" />} titulo="Vista previa del mensaje" descripcion="Enseñar el texto en el aviso" hereda={heredaNotif("vistaPrevia")} htmlFor={`${uid}-vista`}>
                <Interruptor id={`${uid}-vista`} etiqueta="Vista previa del mensaje" activo={n.vistaPrevia} onCambiar={(v) => cambiarNotif({ vistaPrevia: v })} />
            </FilaAjuste>
        </Tarjeta>
    );

    const bloqueFondo = (
        <FilaAjuste icono={<ImageIcon className="h-4 w-4" />} titulo="Fondo" hereda={heredaAp("fondo")} abajo>
            <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    <Muestra activo={fondo.tipo === "ninguno"} onClick={() => elegirFondo({ tipo: "ninguno" })} etiqueta="Ninguno" fondo="transparent">
                        <X className="h-4 w-4 text-white/50" />
                    </Muestra>
                    {FONDOS_PRESET.map((f) => (
                        <Muestra key={f.id} activo={esPreset(f.id)} onClick={() => elegirFondo({ tipo: "preset", id: f.id })} etiqueta={f.nombre} fondo={f.css}>
                            {esPreset(f.id) && <Check className="h-4 w-4 text-white" />}
                        </Muestra>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12.5px] text-white/75 hover:text-white" style={{ background: "rgba(255,255,255,.05)" }}>
                        <Palette className="h-4 w-4" /> Color liso
                        <input
                            type="color"
                            aria-label="Color de fondo"
                            value={fondo.tipo === "color" && esHex(fondo.color) ? fondo.color : "#0c0e22"}
                            onChange={(e) => elegirFondo({ tipo: "color", color: e.target.value })}
                            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => archivoRef.current?.click()}
                        disabled={subiendo}
                        className="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12.5px] text-white/75 hover:text-white disabled:cursor-wait"
                        style={{ background: "rgba(255,255,255,.05)" }}
                    >
                        {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir imagen
                    </button>
                    <input ref={archivoRef} type="file" accept="image/*" hidden onChange={(e) => void subirImagen(e.target.files?.[0])} />
                </div>
                <div className="flex gap-2">
                    <input
                        value={urlImagen}
                        onChange={(e) => setUrlImagen(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && aplicarUrlImagen()}
                        placeholder="…o pega la dirección de una imagen (https://)"
                        aria-label="Dirección de la imagen de fondo"
                        className="min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 py-2 text-[13px] text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:ring-[#7C5CFF]/60"
                    />
                    <button type="button" onClick={aplicarUrlImagen} className="shrink-0 cursor-pointer rounded-xl px-3 py-2 text-[13px] font-medium text-white" style={{ background: "rgba(124,92,255,.25)", boxShadow: "inset 0 0 0 1px rgba(124,92,255,.5)" }}>
                        Usar
                    </button>
                </div>
            </div>
        </FilaAjuste>
    );

    const bloqueLetra = (
        <FilaAjuste icono={<Type className="h-4 w-4" />} titulo="Tamaño de letra" hereda={heredaAp("tamanoLetra")} abajo>
            <Segmentado etiqueta="Tamaño de letra" opciones={TAMANOS} valor={ef.apariencia.tamanoLetra} onCambiar={(v) => cambiarApariencia({ tamanoLetra: v })} />
        </FilaAjuste>
    );

    const bloqueApariencia = (
        <Tarjeta>
            <div ref={aparienciaRef} id="ajustes-apariencia" className="scroll-mt-4" />
            <RotuloSeccion className="mb-2">{esCorreo ? "Apariencia de lectura" : "Fondo y apariencia"}</RotuloSeccion>
            {!esCorreo && <VistaPrevia apariencia={ef.apariencia} />}
            {bloqueFondo}
            {bloqueLetra}
            {!esCorreo && (
                <>
                    <FilaAjuste icono={<MessageSquareText className="h-4 w-4" />} titulo="Color de mis burbujas" hereda={heredaAp("colorBurbuja")} abajo>
                        <div className="flex flex-wrap items-center gap-2">
                            {COLORES_BURBUJA.map((c) => {
                                const activo = c.toLowerCase() === ef.apariencia.colorBurbuja.toLowerCase();
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => cambiarApariencia({ colorBurbuja: c })}
                                        aria-label={`Color ${c}`}
                                        aria-pressed={activo}
                                        className={cn("ss-redondo grid h-8 w-8 cursor-pointer place-items-center rounded-full transition-transform duration-200 hover:scale-110", activo && "ring-2 ring-white/80 ring-offset-2 ring-offset-[#0c0e22]")}
                                        style={{ background: `linear-gradient(135deg, ${c}, ${sombrear(c, 0.28)})` }}
                                    >
                                        {activo && <Check className={cn("h-4 w-4", esColorClaro(c) ? "text-black/70" : "text-white")} />}
                                    </button>
                                );
                            })}
                            <label
                                className={cn("ss-redondo relative grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-full", colorPropio && "ring-2 ring-white/80 ring-offset-2 ring-offset-[#0c0e22]")}
                                style={{ background: "conic-gradient(#f43f5e,#f59e0b,#10b981,#007fff,#7c5cff,#f43f5e)" }}
                                title="Otro color"
                            >
                                <input
                                    type="color"
                                    aria-label="Otro color para mis burbujas"
                                    value={esHex(ef.apariencia.colorBurbuja) ? ef.apariencia.colorBurbuja : "#7C5CFF"}
                                    onChange={(e) => cambiarApariencia({ colorBurbuja: e.target.value })}
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                />
                            </label>
                        </div>
                    </FilaAjuste>
                    <FilaAjuste icono={<MessageSquareText className="h-4 w-4" />} titulo="Densidad" hereda={heredaAp("densidad")} abajo>
                        <Segmentado etiqueta="Densidad" opciones={DENSIDADES} valor={ef.apariencia.densidad} onCambiar={(v) => cambiarApariencia({ densidad: v })} />
                    </FilaAjuste>
                    <FilaAjuste icono={<Clock className="h-4 w-4" />} titulo="Mostrar la hora" hereda={heredaAp("mostrarHora")} htmlFor={`${uid}-hora`}>
                        <Interruptor id={`${uid}-hora`} etiqueta="Mostrar la hora" activo={ef.apariencia.mostrarHora} onCambiar={(v) => cambiarApariencia({ mostrarHora: v })} />
                    </FilaAjuste>
                    <FilaAjuste icono={<Clock className="h-4 w-4" />} titulo="Formato de 24 horas" hereda={heredaAp("formato24h")} htmlFor={`${uid}-24h`}>
                        <Interruptor id={`${uid}-24h`} etiqueta="Formato de 24 horas" activo={ef.apariencia.formato24h} onCambiar={(v) => cambiarApariencia({ formato24h: v })} />
                    </FilaAjuste>
                </>
            )}
        </Tarjeta>
    );

    const bloqueOrganizar = (
        <Tarjeta>
            <RotuloSeccion className="mb-1">Organizar</RotuloSeccion>
            <FilaAjuste icono={<Pin className="h-4 w-4" />} titulo="Fijar arriba" htmlFor={`${uid}-fijar`}>
                <Interruptor id={`${uid}-fijar`} etiqueta="Fijar arriba" activo={ef.fijado} onCambiar={(v) => cambiar({ fijado: v })} />
            </FilaAjuste>
            <FilaAjuste icono={<Archive className="h-4 w-4" />} titulo="Archivar" descripcion="Sale de la lista principal; vuelve si llega algo nuevo que te importe." htmlFor={`${uid}-archivar`}>
                <Interruptor id={`${uid}-archivar`} etiqueta="Archivar" activo={ef.archivado} onCambiar={(v) => cambiar({ archivado: v })} />
            </FilaAjuste>
            {!esCorreo && (
                <FilaAjuste
                    icono={<ShieldMinus className="h-4 w-4" />}
                    titulo="Restringir"
                    descripcion="Es personal: sus mensajes no te avisan y el chat pasa a «Restringidos». No bloquea ni avisa a la otra persona."
                    htmlFor={`${uid}-restringir`}
                >
                    <Interruptor id={`${uid}-restringir`} etiqueta="Restringir" activo={ef.restringido} onCambiar={(v) => cambiar({ restringido: v })} />
                </FilaAjuste>
            )}
        </Tarjeta>
    );

    return (
        <div className="space-y-3.5 pb-6">
            {!esCorreo && (
                <Tarjeta>
                    <RotuloSeccion className="mb-2">Nombre de este chat</RotuloSeccion>
                    <div className="flex gap-2">
                        <input
                            value={apodo}
                            onChange={(e) => setApodo(e.target.value)}
                            onBlur={guardarApodo}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    guardarApodo();
                                }
                            }}
                            maxLength={60}
                            placeholder={tipo === "grupo" ? "Un nombre solo para ti" : "Cómo quieres ver a esta persona"}
                            aria-label="Apodo de este chat"
                            className="min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 py-2 text-[14px] text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:ring-[#7C5CFF]/60"
                        />
                        {hilo.apodo && (
                            <button
                                type="button"
                                onClick={() => {
                                    setApodo("");
                                    cambiar({ apodo: undefined });
                                }}
                                aria-label="Quitar el apodo"
                                className="ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <p className="mt-1.5 px-1 text-[12px] text-white/50">
                        Solo lo ves tú: no cambia su nombre para nadie más.
                        <PistaHereda visible={!hilo.apodo} />
                    </p>
                </Tarjeta>
            )}

            {bloqueNotificaciones}

            {esCorreo && (
                <Tarjeta>
                    <RotuloSeccion className="mb-2">Etiquetas</RotuloSeccion>
                    <div className="flex flex-wrap gap-1.5">
                        {etiquetas.length === 0 && <p className="px-1 text-[12.5px] text-white/50">Sin etiquetas todavía.</p>}
                        {etiquetas.map((e) => (
                            <span key={e} className="inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[12.5px] text-white/90" style={{ background: "#14B8A61f", boxShadow: "inset 0 0 0 1px #14B8A666" }}>
                                <Tag className="h-3 w-3 text-[#5eead4]" /> {e}
                                <button
                                    type="button"
                                    onClick={() => cambiar({ etiquetas: etiquetas.filter((x) => x !== e) })}
                                    aria-label={`Quitar la etiqueta ${e}`}
                                    className="ss-redondo grid h-5 w-5 cursor-pointer place-items-center rounded-full hover:bg-white/10"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                        <input
                            value={etiquetaNueva}
                            onChange={(e) => setEtiquetaNueva(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    anadirEtiqueta();
                                }
                            }}
                            placeholder="Nueva etiqueta"
                            aria-label="Nueva etiqueta"
                            className="min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 py-2 text-[13px] text-white outline-none ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:ring-[#14B8A6]/60"
                        />
                        <button type="button" onClick={anadirEtiqueta} className="shrink-0 cursor-pointer rounded-xl px-3 py-2 text-[13px] font-medium text-white" style={{ background: "#14B8A62e", boxShadow: "inset 0 0 0 1px #14B8A699" }}>
                            Añadir
                        </button>
                    </div>
                </Tarjeta>
            )}

            {esCorreo ? (
                <>
                    {bloqueOrganizar}
                    {bloqueApariencia}
                </>
            ) : (
                <>
                    {bloqueApariencia}
                    <Tarjeta>
                        <RotuloSeccion className="mb-1">Privacidad y datos</RotuloSeccion>
                        <FilaAjuste
                            icono={<Check className="h-4 w-4" />}
                            titulo="Confirmaciones de lectura"
                            descripcion="Si las apagas, no avisas de que has leído y tampoco verás las de los demás aquí."
                            hereda={hilo.confirmacionesLectura === undefined}
                            htmlFor={`${uid}-lectura`}
                        >
                            <Interruptor id={`${uid}-lectura`} etiqueta="Confirmaciones de lectura" activo={ef.confirmacionesLectura} onCambiar={(v) => cambiar({ confirmacionesLectura: v })} />
                        </FilaAjuste>
                        <FilaAjuste
                            icono={<Link2 className="h-4 w-4" />}
                            titulo="Vista previa de enlaces"
                            hereda={hilo.vistaPreviaEnlaces === undefined}
                            htmlFor={`${uid}-enlaces`}
                        >
                            <Interruptor id={`${uid}-enlaces`} etiqueta="Vista previa de enlaces" activo={ef.vistaPreviaEnlaces} onCambiar={(v) => cambiar({ vistaPreviaEnlaces: v })} />
                        </FilaAjuste>
                        <FilaAjuste icono={<ImageIcon className="h-4 w-4" />} titulo="Cargar fotos y vídeos" hereda={hilo.cargarMultimedia === undefined} abajo>
                            <Segmentado etiqueta="Cargar fotos y vídeos" opciones={CARGAS} valor={ef.cargarMultimedia} onCambiar={(v) => cambiar({ cargarMultimedia: v })} />
                        </FilaAjuste>
                    </Tarjeta>
                    {bloqueOrganizar}
                    <Tarjeta>
                        <RotuloSeccion className="mb-2">Limpieza</RotuloSeccion>
                        {ef.vaciadoEn ? (
                            <div className="flex flex-wrap items-center gap-2 px-1 py-1">
                                <EyeOff className="h-4 w-4 text-white/55" />
                                <span className="min-w-0 flex-1 text-[13px] text-white/70">Vaciado para ti el {fechaCompleta(ef.vaciadoEn, ef.apariencia.formato24h)}</span>
                                <button type="button" onClick={() => cambiar({ vaciadoEn: null })} className="cursor-pointer rounded-xl px-3 py-1.5 text-[12.5px] font-medium text-white" style={{ background: "rgba(255,255,255,.07)" }}>
                                    Volver a mostrar lo anterior
                                </button>
                            </div>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => void vaciar()}
                            className="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[14px] font-medium text-[#fda4af] transition-colors hover:bg-[#DC143C]/10"
                        >
                            <Eraser className="h-4 w-4" /> Vaciar chat (solo para mí)
                        </button>
                    </Tarjeta>
                </>
            )}

            <button
                type="button"
                onClick={() => void restablecer()}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-3 py-3 text-[13.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
                style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
            >
                <RotateCcw className="h-4 w-4" /> Volver a los ajustes generales
            </button>
        </div>
    );
}

export default AjustesHiloPanel;
