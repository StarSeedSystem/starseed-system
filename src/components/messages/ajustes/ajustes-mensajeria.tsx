"use client";

/**
 * AjustesMensajeriaDialog (contrato C3 · 2026-09-28) — la pantalla de ajustes de TODA la sección
 * Mensajería (chats y correos). Diálogo en escritorio y hoja a pantalla completa en móvil, con
 * navegación vertical por secciones: Chats · Privacidad · Notificaciones · Correos · Aurora ·
 * Chats personalizados, y «Restablecer todo» con confirmación.
 *
 * Todo pasa por `useAjustesMensajeria()` (C7): local al instante, sincronizado con la cuenta.
 */

import { useEffect, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Bell, ChevronLeft, ChevronRight, Loader2, Mail, MessageSquare, RotateCcw, Shield, SlidersHorizontal, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";
import type { AjustesMensajeriaApi } from "@/lib/mensajeria/ajustes-tipos";
import { useNivelMovimiento } from "@/hooks/use-nivel-movimiento";
import { ACENTO, CLASE_ROTULO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { useEsMovil } from "@/components/messages/marco/use-es-movil";
import { SeccionChats } from "./seccion-chats";
import { SeccionPrivacidad } from "./seccion-privacidad";
import { SeccionNotificaciones } from "./seccion-notificaciones";
import { SeccionCorreos } from "./seccion-correos";
import { SeccionAurora } from "./seccion-aurora";
import { SeccionPersonalizados, tieneAjustesPropios } from "./seccion-personalizados";

export type SeccionAjustesMensajeria = "chats" | "privacidad" | "notificaciones" | "correos" | "aurora" | "personalizados";

export interface AjustesMensajeriaDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    seccionInicial?: SeccionAjustesMensajeria;
}

interface InfoSeccion {
    id: SeccionAjustesMensajeria;
    titulo: string;
    descripcion: string;
    Icono: ComponentType<{ className?: string }>;
    color: string;
    Componente: ComponentType<{ api: AjustesMensajeriaApi }>;
}

export const SECCIONES_AJUSTES: InfoSeccion[] = [
    { id: "chats", titulo: "Chats", descripcion: "Apariencia, envío y lista", Icono: MessageSquare, color: ACENTO.mensajes, Componente: SeccionChats },
    { id: "privacidad", titulo: "Privacidad", descripcion: "En línea, lecturas y quién te escribe", Icono: Shield, color: ACENTO.esmeralda, Componente: SeccionPrivacidad },
    { id: "notificaciones", titulo: "Notificaciones", descripcion: "Avisos, sonidos y horas de silencio", Icono: Bell, color: ACENTO.ambar, Componente: SeccionNotificaciones },
    { id: "correos", titulo: "Correos", descripcion: "Firma, vista y dirección externa", Icono: Mail, color: ACENTO.aurora, Componente: SeccionCorreos },
    { id: "aurora", titulo: "Aurora", descripcion: "Tu IA en los chats", Icono: Sparkles, color: ACENTO.aurora, Componente: SeccionAurora },
    { id: "personalizados", titulo: "Chats personalizados", descripcion: "Chats con ajustes propios", Icono: SlidersHorizontal, color: ACENTO.contactos, Componente: SeccionPersonalizados },
];

function RestablecerTodo({ api, compacto }: { api: AjustesMensajeriaApi; compacto?: boolean }) {
    const [confirmando, setConfirmando] = useState(false);
    if (!confirmando) {
        return (
            <button
                type="button"
                onClick={() => setConfirmando(true)}
                className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white",
                    compacto && "justify-center",
                )}
            >
                <RotateCcw className="h-4 w-4 text-[#DC143C]" />
                Restablecer todo
            </button>
        );
    }
    return (
        <div role="alertdialog" aria-label="Confirmar restablecer todo" className="space-y-2.5 rounded-2xl p-3" style={pildoraFantasma(ACENTO.carmesi)}>
            <p className="text-[13px] font-semibold text-white">¿Restablecer todos los ajustes?</p>
            <p className="text-[12px] leading-relaxed text-white/70">
                Vuelven los valores de fábrica, también los de cada chat. Tus mensajes y correos no se tocan.
            </p>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setConfirmando(false)}
                    className="h-8 flex-1 cursor-pointer rounded-lg bg-white/[0.08] px-3 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.14]"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={() => {
                        api.restablecerTodo();
                        setConfirmando(false);
                        toast.success("Ajustes de Mensajería restablecidos.");
                    }}
                    className="h-8 flex-1 cursor-pointer rounded-lg bg-[#DC143C] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                    Sí, restablecer
                </button>
            </div>
        </div>
    );
}

function Cargando() {
    return (
        <div role="status" className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-[13px]">Cargando tus ajustes…</p>
        </div>
    );
}

export function AjustesMensajeriaDialog({ open, onOpenChange, seccionInicial }: AjustesMensajeriaDialogProps) {
    const api = useAjustesMensajeria();
    const esMovil = useEsMovil();
    const nivel = useNivelMovimiento();
    const [seccion, setSeccion] = useState<SeccionAjustesMensajeria>(seccionInicial ?? "chats");
    /** Solo en móvil: índice de secciones o una sección abierta. */
    const [enSeccionMovil, setEnSeccionMovil] = useState(!!seccionInicial);

    useEffect(() => {
        if (!open) return;
        setSeccion(seccionInicial ?? "chats");
        setEnSeccionMovil(!!seccionInicial);
    }, [open, seccionInicial]);

    const info = SECCIONES_AJUSTES.find((s) => s.id === seccion) ?? SECCIONES_AJUSTES[0];
    const nPersonalizados = Object.values(api.ajustes?.hilos ?? {}).filter((h) => tieneAjustesPropios(h)).length;

    const elegir = (id: SeccionAjustesMensajeria) => {
        setSeccion(id);
        setEnSeccionMovil(true);
    };

    const transicion = nivel === "minimo" ? { duration: 0 } : { duration: nivel === "suave" ? 0.12 : 0.18, ease: [0.22, 1, 0.36, 1] as const };
    const Componente = info.Componente;

    const contenido = (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={info.id}
                initial={nivel === "minimo" ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={nivel === "minimo" ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={transicion}
            >
                {api.listo ? <Componente api={api} /> : <Cargando />}
            </motion.div>
        </AnimatePresence>
    );

    const navegacion = (
        <nav aria-label="Secciones de ajustes" className="space-y-1">
            {SECCIONES_AJUSTES.map(({ id, titulo, descripcion, Icono, color }) => {
                const activa = !esMovil && id === seccion;
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => elegir(id)}
                        aria-current={activa ? "page" : undefined}
                        className={cn(
                            "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]",
                            esMovil ? "py-3.5" : "py-2.5",
                            activa ? "text-white" : "text-white/75 hover:bg-white/[0.05] hover:text-white",
                        )}
                        style={activa ? pildoraFantasma(color) : undefined}
                    >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `${color}22`, color }}>
                            <Icono className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold">{titulo}</span>
                            {(esMovil || activa) && <span className="block text-[12px] text-white/55">{descripcion}</span>}
                        </span>
                        {id === "personalizados" && nPersonalizados > 0 && (
                            <span className="min-w-[20px] rounded-full bg-white/10 px-1.5 text-center text-[11px] font-bold leading-5 text-white/85">{nPersonalizados}</span>
                        )}
                        {esMovil && <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />}
                    </button>
                );
            })}
        </nav>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-testid="ajustes-mensajeria"
                className={cn(
                    "gap-0 border-white/10 bg-[rgba(10,12,28,0.97)] p-0 backdrop-blur-2xl",
                    "max-md:left-0 max-md:top-0 max-md:h-[100dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0",
                    "md:h-[min(780px,88vh)] md:max-w-4xl md:rounded-[24px]",
                )}
            >
                <DialogTitle className="sr-only">Ajustes de Mensajería</DialogTitle>
                <DialogDescription className="sr-only">
                    Apariencia, privacidad, avisos, correos y Aurora para todos tus chats y correos.
                </DialogDescription>

                {esMovil ? (
                    <div className="flex h-full min-h-0 flex-col pb-[env(safe-area-inset-bottom)]">
                        {enSeccionMovil ? (
                            <>
                                <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.08] px-3 py-3 pr-14">
                                    <button
                                        type="button"
                                        onClick={() => setEnSeccionMovil(false)}
                                        className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-xl px-2 text-[13px] font-medium text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
                                    >
                                        <ChevronLeft className="h-4 w-4" /> Ajustes
                                    </button>
                                    <h2 className="min-w-0 flex-1 text-[15px] font-semibold text-white">{info.titulo}</h2>
                                </header>
                                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">{contenido}</div>
                            </>
                        ) : (
                            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                                <div className="mb-4 px-2 pr-12">
                                    <p className={CLASE_ROTULO}>Mensajería</p>
                                    <h2 className="mt-1 text-xl font-semibold text-white">Ajustes</h2>
                                </div>
                                {navegacion}
                                <div className="mt-6 border-t border-white/[0.08] pt-3">
                                    <RestablecerTodo api={api} />
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid h-full min-h-0 grid-cols-[240px_1fr]">
                        <aside className="flex min-h-0 flex-col border-r border-white/[0.08] bg-white/[0.02] p-3">
                            <div className="mb-4 px-2 pt-2">
                                <p className={CLASE_ROTULO}>Mensajería</p>
                                <h2 className="mt-1 text-lg font-semibold text-white">Ajustes</h2>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto">{navegacion}</div>
                            <div className="mt-3 border-t border-white/[0.08] pt-3">
                                <RestablecerTodo api={api} />
                            </div>
                        </aside>
                        <div className="flex min-h-0 flex-col">
                            <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-6 py-4 pr-16">
                                <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${info.color}22`, color: info.color }}>
                                    <info.Icono className="h-4 w-4" />
                                </span>
                                <div>
                                    <h2 className="text-[16px] font-semibold text-white">{info.titulo}</h2>
                                    <p className="text-[12px] text-white/55">{info.descripcion}</p>
                                </div>
                            </header>
                            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{contenido}</div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default AjustesMensajeriaDialog;
