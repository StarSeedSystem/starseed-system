"use client";

/**
 * EditorMensajeRico (contrato C4) — «Crear mensaje» a pantalla completa.
 *
 *  · Texto: editor tipo Word (títulos, listas, tareas, citas, código, enlaces, colores…).
 *  · Lienzo: composición libre con fotos, vídeo, gifs, audio, ventanas web, apps del OS y apps en
 *    vivo, cada una con su tamaño, posición, giro y capa.
 *  · Panel «Estilo del mensaje» común a los dos modos y vista previa viva de la burbuja final.
 *
 * Enviar: se valida con `validarFormato` y se entrega `{ body, formato, attachments }`: el body es el
 * texto plano equivalente y los adjuntos son las apps en vivo y los archivos subidos (así también
 * aparecen en «Archivos del chat»). El borrador sobrevive a cerrar el diálogo por error.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutTemplate, Loader2, Redo2, Send, Type, Undo2, X } from "lucide-react";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { acquireFullscreenModal } from "@/lib/ui/fullscreen-modal";
import { cn } from "@/lib/utils";
import type { DmAttachment } from "@/lib/messages/dm";
import {
    colorTextoSobre,
    docDesdeTexto,
    docVacio,
    fondoCssDe,
    textoPlanoDeFormato,
    validarFormato,
} from "@/lib/mensajeria/formato";
import type { DocRico, EstiloMensaje, FormatoMensaje, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import { Rotulo } from "@/components/widgets-libres/familias/comun";
import { normalizarDoc, recortarDoc } from "./doc-dom";
import { EditorDoc } from "./editor-doc";
import { AnadirAlLienzo, EscenarioLienzo, PanelCristal, PanelElemento, PanelLienzo } from "./editor-lienzo";
import { useHistorial, type OpcionesCambio } from "./historial";
import { actualizarElemento, ajustarProporcion, lienzoVacio, zMaxima } from "./lienzo-ops";
import { MensajeFormateado } from "./mensaje-formateado";
import { PanelEstilo } from "./panel-estilo";
import styles from "./rico.module.css";

export interface EditorMensajeRicoProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    hiloId: string;
    textoInicial?: string;
    onEnviar: (r: { body: string; formato: FormatoMensaje; attachments: DmAttachment[] }) => void | Promise<void>;
}

interface Borrador {
    estilo: EstiloMensaje | null;
    doc: DocRico;
    lienzo: LienzoMensaje;
}

type Modo = "texto" | "lienzo";

/** Referencia estable (el editor repinta si cambia la identidad del documento). */
const DOC_VACIO: DocRico = { bloques: [] };

function borradorNuevo(texto?: string): Borrador {
    return { estilo: null, doc: normalizarDoc(texto ? docDesdeTexto(texto) : { bloques: [] }), lienzo: lienzoVacio() };
}

/** Formato a enviar a partir del borrador (sin partes vacías). */
export function construirFormato(b: Borrador): FormatoMensaje {
    const f: FormatoMensaje = { v: 1 };
    if (b.estilo && Object.keys(b.estilo).length) f.estilo = b.estilo;
    const doc = recortarDoc(b.doc);
    if (!docVacio(doc)) f.doc = doc;
    if (b.lienzo.elementos.length) f.lienzo = b.lienzo;
    return f;
}

/** Clave con la que se recuerda un adjunto del lienzo (URL del archivo o sesión en vivo). */
export function claveDeAdjunto(a?: DmAttachment | null): string | null {
    if (!a) return null;
    const sesion = (a as { sesionId?: unknown }).sesionId;
    if (a.kind === "vivo" && typeof sesion === "string") return `vivo:${sesion}`;
    return a.url ?? null;
}

/** Adjuntos del chat: apps en vivo y archivos subidos que siguen en el lienzo (sin repetir). */
export function adjuntosDeFormato(f: FormatoMensaje, subidos: Record<string, DmAttachment>): DmAttachment[] {
    const out: DmAttachment[] = [];
    const vistos = new Set<string>();
    for (const el of f.lienzo?.elementos ?? []) {
        if (el.tipo === "vivo" && el.vivo) {
            const clave = `vivo:${el.vivo.sesionId}`;
            if (!vistos.has(clave)) {
                vistos.add(clave);
                // El adjunto original (tal cual lo creó la app en vivo) si lo tenemos; si no, el validado.
                out.push(subidos[clave] ?? el.vivo);
            }
        } else if (el.url && subidos[el.url] && !vistos.has(el.url)) {
            vistos.add(el.url);
            const a = { ...subidos[el.url] };
            if (el.nombre) a.name = el.nombre;
            out.push(a);
        }
    }
    return out;
}

/** Mientras el editor está abierto, el dock Trinity y los accesos de borde se repliegan. */
function RegistroModal() {
    useEffect(() => acquireFullscreenModal(), []);
    return null;
}

function BotonIcono({ etiqueta, onClick, disabled, children }: { etiqueta: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={etiqueta}
            title={etiqueta}
            className="ss-redondo grid h-10 w-10 cursor-pointer place-items-center rounded-full text-white/80 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-35"
        >
            {children}
        </button>
    );
}

export function EditorMensajeRico({ open, onOpenChange, hiloId, textoInicial, onEnviar }: EditorMensajeRicoProps) {
    const hist = useHistorial<Borrador>(() => borradorNuevo(textoInicial));
    const borrador = hist.valor;
    const [modo, setModo] = useState<Modo>("texto");
    const [seleccion, setSeleccion] = useState<string | null>(null);
    const [editandoTexto, setEditandoTexto] = useState<string | null>(null);
    const [subidos, setSubidos] = useState<Record<string, DmAttachment>>({});
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const hiloAnterior = useRef(hiloId);
    const reducirMovimiento = useReducedMotion();

    // Otro chat → borrador nuevo.
    useEffect(() => {
        if (hiloAnterior.current === hiloId) return;
        hiloAnterior.current = hiloId;
        hist.reiniciar(borradorNuevo(textoInicial));
        setSubidos({});
        setSeleccion(null);
        setEditandoTexto(null);
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hiloId]);

    // Al abrir con texto del compositor y un borrador vacío, se parte de ese texto.
    useEffect(() => {
        if (!open || !textoInicial) return;
        const actual = construirFormato(hist.valor);
        if (!actual.doc && !actual.lienzo) hist.reiniciar(borradorNuevo(textoInicial));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const { fijar, ajustar } = hist;
    const ajustarAltos = useCallback(
        (cambios: { id: string; h: number }[]) =>
            ajustar((b) => ({
                ...b,
                lienzo: {
                    ...b.lienzo,
                    elementos: b.lienzo.elementos.map((e) => {
                        const c = cambios.find((x) => x.id === e.id);
                        return c ? { ...e, h: Math.min(c.h, b.lienzo.alto * 2) } : e;
                    }),
                },
            })),
        [ajustar],
    );
    const fijarDoc = useCallback((doc: DocRico, op?: OpcionesCambio) => fijar((b) => ({ ...b, doc }), op), [fijar]);
    const fijarLienzo = useCallback((lienzo: LienzoMensaje, op?: OpcionesCambio) => fijar((b) => ({ ...b, lienzo }), op), [fijar]);
    const fijarEstilo = useCallback((estilo: EstiloMensaje | null) => fijar((b) => ({ ...b, estilo }), { agrupar: "estilo", ventana: 1200 }), [fijar]);

    const formato = useMemo(() => construirFormato(borrador), [borrador]);
    const previa = useMemo(() => validarFormato(formato), [formato]);
    const textoPrevia = previa.ok ? textoPlanoDeFormato(previa.formato) : "";
    const hayContenido = !!(formato.doc || formato.lienzo);

    const seleccionado = borrador.lienzo.elementos.find((e) => e.id === seleccion) ?? null;
    const enEdicion = borrador.lienzo.elementos.find((e) => e.id === editandoTexto && e.tipo === "texto") ?? null;

    const anadir = (el: LienzoMensaje["elementos"][number], adjunto?: DmAttachment) => {
        const clave = `anadir-${el.id}`;
        // Actualización funcional: la app en vivo llega tras un diálogo asíncrono.
        hist.fijar(
            (b) => ({ ...b, lienzo: { ...b.lienzo, elementos: [...b.lienzo.elementos, { ...el, z: zMaxima(b.lienzo.elementos) + 1 }] } }),
            { agrupar: clave },
        );
        setSeleccion(el.id);
        const claveAdjunto = claveDeAdjunto(adjunto);
        if (adjunto && claveAdjunto) setSubidos((s) => ({ ...s, [claveAdjunto]: adjunto }));
        // Fotos: ajustar a su proporción real en cuanto se conozca (mismo paso de deshacer).
        if ((el.tipo === "imagen" || el.tipo === "gif") && el.url && typeof window !== "undefined" && typeof Image !== "undefined") {
            const img = new Image();
            img.onload = () => {
                if (!img.naturalWidth) return;
                hist.fijar(
                    (b) => ({ ...b, lienzo: actualizarElemento(b.lienzo, el.id, (e) => ajustarProporcion(e, img.naturalHeight / img.naturalWidth, b.lienzo)) }),
                    { agrupar: clave },
                );
            };
            img.src = el.url;
        }
    };

    const enviar = async () => {
        setError(null);
        const r = validarFormato(formato);
        if (!r.ok) return setError(r.error);
        if (!r.formato.doc && !r.formato.lienzo) return setError("Escribe algo o añade un elemento al lienzo antes de enviar.");
        const body = textoPlanoDeFormato(r.formato);
        const attachments = adjuntosDeFormato(r.formato, subidos);
        setEnviando(true);
        try {
            await onEnviar({ body, formato: r.formato, attachments });
            hist.reiniciar(borradorNuevo());
            setSubidos({});
            setSeleccion(null);
            setEditandoTexto(null);
            setModo("texto");
            onOpenChange(false);
        } catch {
            setError("No se pudo enviar el mensaje. Revisa la conexión e inténtalo de nuevo.");
        } finally {
            setEnviando(false);
        }
    };

    const estilo = borrador.estilo;
    const fondoArea = estilo?.fondo ? { background: fondoCssDe(estilo.fondo), color: estilo.color ?? colorTextoSobre(estilo.fondo) } : undefined;

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                {/* Un escalón por debajo de ui/dialog (120/121): sus diálogos (subir archivo, ventana web…) se abren encima con su velo. */}
                <DialogPrimitive.Overlay className="fixed inset-0 z-[118] bg-black/70 backdrop-blur-sm" />
                <DialogPrimitive.Content
                    className={cn(styles.pantallaCompleta, "fixed inset-0 z-[119] flex flex-col bg-[rgba(7,8,22,.97)] text-white outline-none")}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    data-editor-mensaje-rico=""
                >
                <RegistroModal />
                <motion.div
                    className="flex h-full min-h-0 flex-col overflow-y-auto lg:overflow-hidden"
                    initial={reducirMovimiento ? false : { opacity: 0, y: 18, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                >
                <div className="flex flex-col lg:h-full">
                    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-white/[0.06] bg-[rgba(7,8,22,.92)] px-4 py-3 backdrop-blur-xl sm:px-6 lg:static">
                        <div className="order-1 mr-auto min-w-0">
                            <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">Crear mensaje</DialogPrimitive.Title>
                            <DialogPrimitive.Description className="sr-only text-[12.5px] text-white/60 sm:not-sr-only">
                                Texto con formato o un lienzo con fotos, vídeos, ventanas y apps.
                            </DialogPrimitive.Description>
                        </div>
                        <div role="tablist" aria-label="Modo de edición" className="ss-redondo order-4 flex rounded-full lg:order-2 bg-white/[0.05] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                            {(
                                [
                                    ["texto", "Texto", Type],
                                    ["lienzo", "Lienzo", LayoutTemplate],
                                ] as const
                            ).map(([id, nombre, Icono]) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    id={`pestana-${id}`}
                                    aria-selected={modo === id}
                                    aria-controls={`panel-${id}`}
                                    onClick={() => {
                                        setModo(id);
                                        setEditandoTexto(null);
                                    }}
                                    className={cn(
                                        "ss-redondo flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-[background-color,color,box-shadow] duration-200",
                                        modo === id ? "bg-[#7C5CFF] text-white shadow-[0_4px_14px_#7C5CFF55]" : "text-white/70 hover:text-white",
                                    )}
                                >
                                    <Icono className="h-4 w-4" aria-hidden="true" />
                                    {nombre}
                                </button>
                            ))}
                        </div>
                        <div className="order-5 flex items-center gap-1 lg:order-3">
                            <BotonIcono etiqueta="Deshacer (Ctrl+Z)" onClick={hist.deshacer} disabled={!hist.puedeDeshacer}>
                                <Undo2 className="h-[18px] w-[18px]" />
                            </BotonIcono>
                            <BotonIcono etiqueta="Rehacer (Ctrl+Mayús+Z)" onClick={hist.rehacer} disabled={!hist.puedeRehacer}>
                                <Redo2 className="h-[18px] w-[18px]" />
                            </BotonIcono>
                        </div>
                        <button
                            type="button"
                            onClick={() => void enviar()}
                            disabled={enviando || !hayContenido}
                            className="ss-redondo order-2 inline-flex lg:order-4 min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[#7C5CFF] px-5 text-[14px] font-semibold text-white shadow-[0_6px_18px_#7C5CFF55] transition-transform duration-200 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                            {enviando ? "Enviando…" : "Enviar"}
                        </button>
                        <DialogPrimitive.Close asChild>
                            <BotonCerrar etiqueta="Cerrar" atajo="Esc" tamano="sm" className="order-3 lg:order-5" />
                        </DialogPrimitive.Close>
                    </header>

                    {error && (
                        <div role="alert" className="mx-4 mt-3 flex items-start gap-3 rounded-[16px] bg-[#DC143C]/15 px-4 py-3 text-[13.5px] text-[#fecdd3] shadow-[inset_0_0_0_1px_#DC143C66] sm:mx-6">
                            <span className="flex-1">{error}</span>
                            <button type="button" onClick={() => setError(null)} className="cursor-pointer text-[12.5px] font-semibold text-white/80 hover:text-white">
                                Entendido
                            </button>
                        </div>
                    )}

                    <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
                        <main className="flex min-w-0 flex-col gap-3 p-3 sm:p-4 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                            {modo === "texto" ? (
                                <div id="panel-texto" role="tabpanel" aria-labelledby="pestana-texto" className="flex h-[72vh] min-h-[420px] flex-col lg:h-auto lg:min-h-0 lg:flex-1">
                                    <EditorDoc
                                        doc={borrador.doc}
                                        onChange={fijarDoc}
                                        onDeshacer={hist.deshacer}
                                        onRehacer={hist.rehacer}
                                        estiloBase={estilo}
                                        estiloArea={fondoArea}
                                        autoFocus
                                        className="flex-1"
                                    />
                                </div>
                            ) : (
                                <div id="panel-lienzo" role="tabpanel" aria-labelledby="pestana-lienzo" className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row">
                                    <div className="relative order-1 h-[58vh] min-h-[320px] flex-none lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1">
                                        <PanelCristal className="h-full overflow-hidden">
                                            <EscenarioLienzo
                                                lienzo={borrador.lienzo}
                                                onChange={fijarLienzo}
                                                estiloMensaje={estilo}
                                                seleccion={seleccion}
                                                onSeleccion={setSeleccion}
                                                onEditarTexto={setEditandoTexto}
                                                onDeshacer={hist.deshacer}
                                                onRehacer={hist.rehacer}
                                                onAjustarAltos={ajustarAltos}
                                            />
                                        </PanelCristal>
                                        {enEdicion && (
                                            <div className="absolute inset-0 z-20 flex flex-col gap-3 rounded-[22px] bg-[rgba(7,8,22,.94)] p-3 shadow-[inset_0_0_0_1px_rgba(124,92,255,.35)] backdrop-blur-xl sm:p-4">
                                                <div className="flex items-center gap-3">
                                                    <p className="mr-auto text-[15px] font-semibold">Editar texto</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditandoTexto(null)}
                                                        className="ss-redondo inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full bg-[#7C5CFF] px-4 text-[13px] font-semibold text-white"
                                                    >
                                                        <X className="h-4 w-4" aria-hidden="true" /> Listo
                                                    </button>
                                                </div>
                                                <EditorDoc
                                                    key={enEdicion.id}
                                                    compacto
                                                    autoFocus
                                                    etiqueta="Texto del elemento"
                                                    placeholder="Escribe el texto…"
                                                    doc={enEdicion.texto ?? DOC_VACIO}
                                                    onChange={(doc, op) =>
                                                        hist.fijar((b) => ({ ...b, lienzo: actualizarElemento(b.lienzo, enEdicion.id, { texto: doc }) }), op)
                                                    }
                                                    onDeshacer={hist.deshacer}
                                                    onRehacer={hist.rehacer}
                                                    estiloBase={{ fuente: enEdicion.estilo?.fuente ?? estilo?.fuente, color: enEdicion.estilo?.color, alineacion: enEdicion.estilo?.alineacion }}
                                                    estiloArea={{ background: fondoCssDe(enEdicion.estilo?.fondo ?? borrador.lienzo.fondo), color: colorTextoSobre(enEdicion.estilo?.fondo ?? borrador.lienzo.fondo) }}
                                                    className="min-h-0 flex-1"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <aside className="order-2 flex-none lg:order-1 lg:w-[280px] lg:overflow-y-auto" aria-label="Añadir al lienzo">
                                        <PanelCristal className="p-2">
                                            <div className="px-3 pb-1 pt-2">
                                                <Rotulo>Añadir al lienzo</Rotulo>
                                            </div>
                                            <AnadirAlLienzo
                                                hiloId={hiloId}
                                                lienzo={borrador.lienzo}
                                                onAnadir={anadir}
                                                onEditarTexto={setEditandoTexto}
                                                className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1"
                                            />
                                        </PanelCristal>
                                    </aside>
                                </div>
                            )}
                        </main>

                        <aside className="flex-none border-t border-white/[0.06] p-4 lg:w-[380px] lg:overflow-y-auto lg:border-l lg:border-t-0 sm:p-5" aria-label="Estilo y vista previa">
                            <div className="space-y-7">
                                <section className="space-y-2.5">
                                    <Rotulo>Vista previa</Rotulo>
                                    <div className="rounded-[20px] bg-[radial-gradient(120%_120%_at_0%_0%,#1a1440,#0b0d1a_70%)] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
                                        <div className="flex justify-end">
                                            <div className={cn("max-w-full rounded-2xl rounded-br-sm bg-[#7C5CFF] px-3.5 py-2.5 text-white", formato.lienzo && "w-full")}>
                                                {previa.ok && hayContenido ? (
                                                    <MensajeFormateado formato={previa.formato} textoPlano={textoPrevia} mio />
                                                ) : previa.ok ? (
                                                    <p className="text-[13.5px] text-white/80">Tu mensaje aparecerá aquí tal y como lo verán en el chat.</p>
                                                ) : (
                                                    <p className="text-[13px] text-white/90">{previa.error}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {modo === "lienzo" &&
                                    (seleccionado ? (
                                        <div className="space-y-3">
                                            <PanelElemento el={seleccionado} lienzo={borrador.lienzo} onChange={fijarLienzo} onSeleccion={setSeleccion} onEditarTexto={setEditandoTexto} />
                                            <button
                                                type="button"
                                                onClick={() => setSeleccion(null)}
                                                className="ss-redondo min-h-10 w-full cursor-pointer rounded-full px-4 text-[13px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] transition-colors duration-200 hover:bg-white/[0.07]"
                                            >
                                                Ver ajustes del lienzo
                                            </button>
                                        </div>
                                    ) : (
                                        <PanelLienzo lienzo={borrador.lienzo} onChange={fijarLienzo} seleccion={seleccion} onSeleccion={setSeleccion} />
                                    ))}

                                <section className="space-y-4">
                                    <div>
                                        <p className="text-[15px] font-semibold">Estilo del mensaje</p>
                                        <p className="text-[12.5px] text-white/55">
                                            {modo === "lienzo" ? "Marco, fondo y letra por defecto de la burbuja." : "Fuente, color, marco, fondo y animaciones de todo el mensaje."}
                                        </p>
                                    </div>
                                    <PanelEstilo estilo={estilo} onChange={fijarEstilo} />
                                </section>
                            </div>
                        </aside>
                    </div>
                </div>
                </motion.div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

export default EditorMensajeRico;
