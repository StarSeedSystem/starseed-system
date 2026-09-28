"use client";

/**
 * VisorMensaje — lector a pantalla completa de cualquier mensaje (texto, formato enriquecido y
 * adjuntos), con transición suave (escala + fundido), anterior/siguiente por los mensajes del
 * chat con botones o flechas del teclado, y Escape para cerrar.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Bot, ChevronLeft, ChevronRight, Copy, MessageSquareShare, X } from "lucide-react";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import type { DmMessage } from "@/lib/messages/dm";
import { urlVigenteAdjunto } from "@/lib/mensajeria/adjuntos";
// Contrato C4.
import { MensajeFormateado } from "@/components/messages/rico/mensaje-formateado";
import { AttachmentView, MedioNoDisponible } from "@/components/messages/dm/message-bubble";
import { useMovimientoReducido } from "@/components/messages/dm/hooks-hilo";
import { fechaCompleta, formatoDe } from "@/components/messages/dm/utilidades-hilo";
import estilos from "@/components/messages/dm/hilo.module.css";

const BOTON =
    "ss-redondo grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-white transition-colors duration-200 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-30";

function ImagenGrande({ url, nombre }: { url?: string; nombre?: string }) {
    const src = urlVigenteAdjunto(url);
    const [fallo, setFallo] = useState(false);
    if (!src || fallo) return <MedioNoDisponible nombre={nombre} />;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={nombre || "Imagen"} onError={() => setFallo(true)} className="mx-auto max-h-[68dvh] max-w-full rounded-2xl object-contain" />
    );
}

export interface VisorMensajeProps {
    mensajes: DmMessage[];
    /** null = cerrado. */
    mensajeId: string | null;
    onNavegar: (id: string) => void;
    onCerrar: () => void;
    nombreDe: (m: DmMessage) => string;
    miUid: string | null;
    formato24h?: boolean;
    onIrAlMensaje?: (id: string) => void;
}

export function VisorMensaje({ mensajes, mensajeId, onNavegar, onCerrar, nombreDe, miUid, formato24h = true, onIrAlMensaje }: VisorMensajeProps) {
    const reducido = useMovimientoReducido();
    const indice = mensajeId ? mensajes.findIndex((m) => m.id === mensajeId) : -1;
    const mensaje = indice >= 0 ? mensajes[indice] : null;
    const [direccion, setDireccion] = useState(0);
    const cerrarRef = useRef<HTMLButtonElement>(null);
    const previo = useRef<HTMLElement | null>(null);

    const ir = (delta: number) => {
        const destino = mensajes[indice + delta];
        if (!destino) return;
        setDireccion(delta);
        onNavegar(destino.id);
    };

    useEffect(() => {
        if (!mensaje) return;
        const tecla = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCerrar();
            else if (e.key === "ArrowLeft") ir(-1);
            else if (e.key === "ArrowRight") ir(1);
        };
        window.addEventListener("keydown", tecla);
        return () => window.removeEventListener("keydown", tecla);
    });

    const abierto = !!mensaje;
    useEffect(() => {
        if (abierto) {
            previo.current = document.activeElement as HTMLElement | null;
            setTimeout(() => cerrarRef.current?.focus(), 30);
        } else if (previo.current) {
            previo.current.focus?.();
            previo.current = null;
        }
    }, [abierto]);

    if (typeof document === "undefined") return null;

    const copiar = async () => {
        if (!mensaje) return;
        try {
            await navigator.clipboard.writeText(mensaje.body);
            toast.success("Copiado");
        } catch {
            toast.error("No se pudo copiar en este navegador.");
        }
    };

    return createPortal(
        <AnimatePresence>
            {mensaje && (
                <motion.div
                    key="visor-mensaje"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Mensaje de ${nombreDe(mensaje)}`}
                    className="fixed inset-0 z-[110] flex flex-col"
                    style={{ background: "rgba(4,5,14,.9)", backdropFilter: "blur(22px) saturate(140%)", WebkitBackdropFilter: "blur(22px) saturate(140%)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reducido ? 0 : 0.22 }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) onCerrar();
                    }}
                >
                    <div className="flex items-center gap-2 px-3 py-3 sm:px-6">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: mensaje.kind === "agent" ? "rgba(0,127,255,.3)" : "rgba(124,92,255,.3)" }}>
                            {mensaje.kind === "agent" ? <Bot className="h-5 w-5" /> : nombreDe(mensaje).replace(/^@/, "").slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold text-white">{mensaje.sender === miUid && mensaje.kind !== "agent" ? "Tú" : nombreDe(mensaje)}</p>
                            <p className="truncate text-[12.5px] text-white/60">
                                {fechaCompleta(mensaje.createdAt, formato24h)}
                                {mensaje.editedAt ? " · editado" : ""} · {indice + 1} de {mensajes.length}
                            </p>
                        </div>
                        {mensaje.body && (
                            <button type="button" onClick={() => void copiar()} aria-label="Copiar el texto" title="Copiar el texto" className={BOTON}>
                                <Copy className="h-5 w-5" />
                            </button>
                        )}
                        {onIrAlMensaje && (
                            <button type="button" onClick={() => onIrAlMensaje(mensaje.id)} aria-label="Ir al mensaje en el chat" title="Ir al mensaje en el chat" className={BOTON}>
                                <MessageSquareShare className="h-5 w-5" />
                            </button>
                        )}
                        <button ref={cerrarRef} type="button" onClick={onCerrar} aria-label="Cerrar el visor" title="Cerrar (Esc)" className={BOTON}>
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="relative flex min-h-0 flex-1 items-stretch justify-center px-2 pb-5 sm:px-20">
                        <AnimatePresence mode="wait" initial={false} custom={direccion}>
                            <motion.article
                                key={mensaje.id}
                                initial={{ opacity: 0, scale: reducido ? 1 : 0.97, x: reducido ? 0 : direccion * 28 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                exit={{ opacity: 0, scale: reducido ? 1 : 0.98, x: reducido ? 0 : direccion * -28 }}
                                transition={reducido ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                                className="w-full max-w-3xl overflow-y-auto overscroll-contain rounded-[24px] p-5 sm:p-8"
                                style={{
                                    background: "rgba(12,14,34,.62)",
                                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.06), 0 30px 80px rgba(0,0,0,.45)",
                                    ["--tam-letra" as string]: "17px",
                                }}
                            >
                                {(() => {
                                    const formato = formatoDe(mensaje);
                                    if (formato) return <MensajeFormateado formato={formato} textoPlano={mensaje.body} mio={mensaje.sender === miUid} variante="ampliado" />;
                                    if (mensaje.body.trim()) return <MessageRenderer text={mensaje.body} media className={estilos.cuerpo} />;
                                    return null;
                                })()}
                                {mensaje.attachments.length > 0 && (
                                    <div className="mt-5 space-y-3">
                                        {mensaje.attachments.map((a, i) =>
                                            a.kind === "image" ? (
                                                <ImagenGrande key={i} url={a.url} nombre={a.name} />
                                            ) : (
                                                <div key={i} className="flex justify-center">
                                                    <AttachmentView attachment={a} mio={mensaje.sender === miUid} />
                                                </div>
                                            ),
                                        )}
                                    </div>
                                )}
                            </motion.article>
                        </AnimatePresence>

                        <button type="button" onClick={() => ir(-1)} disabled={indice <= 0} aria-label="Mensaje anterior" className={`${BOTON} absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 sm:left-5`}>
                            <ChevronLeft className="h-6 w-6" />
                        </button>
                        <button type="button" onClick={() => ir(1)} disabled={indice >= mensajes.length - 1} aria-label="Mensaje siguiente" className={`${BOTON} absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 sm:right-5`}>
                            <ChevronRight className="h-6 w-6" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}

export default VisorMensaje;
