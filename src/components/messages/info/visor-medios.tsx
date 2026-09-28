"use client";

/**
 * Visor de fotos y vídeos del chat (caja de luz): anterior/siguiente con flechas o botones,
 * Escape cierra, descarga e «Ir al mensaje». Si el archivo ya no existe, lo dice con calma.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, ImageOff, MessageSquareShare, X } from "lucide-react";
import type { ArchivoHilo } from "@/lib/mensajeria/archivos";
import { useMovimientoReducido } from "@/components/messages/dm/hooks-hilo";
import { fechaCompleta } from "@/components/messages/dm/utilidades-hilo";

const BOTON =
    "ss-redondo grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-colors duration-200 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-30";

function MedioGrande({ item }: { item: ArchivoHilo }) {
    const [fallo, setFallo] = useState(false);
    useEffect(() => setFallo(false), [item.id]);
    if (!item.url || fallo) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center text-white/70" style={{ background: "rgba(255,255,255,.05)" }}>
                <ImageOff className="h-10 w-10" />
                <p className="text-sm">Este archivo ya no está disponible en el almacenamiento</p>
            </div>
        );
    }
    if (item.categoria === "video") {
        return <video key={item.id} src={item.url} controls autoPlay className="max-h-[78dvh] max-w-full rounded-2xl" onError={() => setFallo(true)} />;
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img key={item.id} src={item.url} alt={item.nombre} className="max-h-[78dvh] max-w-full rounded-2xl object-contain" onError={() => setFallo(true)} />;
}

export function VisorMedios({
    items, indice, onIndice, onCerrar, nombreDe, onIrAlMensaje,
}: {
    items: ArchivoHilo[];
    /** null = cerrado. */
    indice: number | null;
    onIndice: (i: number) => void;
    onCerrar: () => void;
    nombreDe: (uid: string | null) => string;
    onIrAlMensaje?: (mensajeId: string) => void;
}) {
    const reducido = useMovimientoReducido();
    const abierto = indice !== null && indice >= 0 && indice < items.length;
    const item = abierto ? items[indice!] : null;

    useEffect(() => {
        if (!abierto) return;
        const tecla = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCerrar();
            else if (e.key === "ArrowLeft" && indice! > 0) onIndice(indice! - 1);
            else if (e.key === "ArrowRight" && indice! < items.length - 1) onIndice(indice! + 1);
        };
        window.addEventListener("keydown", tecla);
        return () => window.removeEventListener("keydown", tecla);
    }, [abierto, indice, items.length, onCerrar, onIndice]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <AnimatePresence>
            {item && (
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Visor: ${item.nombre}`}
                    className="fixed inset-0 z-[110] flex flex-col"
                    style={{ background: "rgba(4,5,14,.92)", backdropFilter: "blur(18px)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reducido ? 0 : 0.2 }}
                >
                    <div className="flex items-center gap-2 px-3 py-3 sm:px-5">
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-white">{item.mio ? "Tú" : nombreDe(item.remitente)}</p>
                            <p className="truncate text-[12px] text-white/60">{fechaCompleta(item.fecha)} · {indice! + 1} de {items.length}</p>
                        </div>
                        {onIrAlMensaje && (
                            <button type="button" onClick={() => onIrAlMensaje(item.mensajeId)} aria-label="Ir al mensaje" title="Ir al mensaje" className={BOTON}>
                                <MessageSquareShare className="h-5 w-5" />
                            </button>
                        )}
                        {item.url && (
                            <a href={item.url} download={item.nombre} target="_blank" rel="noopener noreferrer" aria-label="Descargar" title="Descargar" className={BOTON}>
                                <Download className="h-5 w-5" />
                            </a>
                        )}
                        <button type="button" onClick={onCerrar} aria-label="Cerrar el visor" title="Cerrar (Esc)" className={BOTON}>
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6 sm:px-16">
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: reducido ? 1 : 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: reducido ? 0 : 0.22 }}
                            className="flex max-h-full max-w-full items-center justify-center"
                        >
                            <MedioGrande item={item} />
                        </motion.div>
                        <button
                            type="button"
                            onClick={() => onIndice(indice! - 1)}
                            disabled={indice === 0}
                            aria-label="Anterior"
                            className={`${BOTON} absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 sm:left-4`}
                        >
                            <ChevronLeft className="h-6 w-6" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onIndice(indice! + 1)}
                            disabled={indice === items.length - 1}
                            aria-label="Siguiente"
                            className={`${BOTON} absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 sm:right-4`}
                        >
                            <ChevronRight className="h-6 w-6" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}

export default VisorMedios;
