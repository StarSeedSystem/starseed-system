"use client";

/**
 * Barra superior de Mensajería (2026-09-28): conmutador Mensajes | Correos, modo enfoque,
 * ajustes de la sección y los accesos globales (avisos y cuenta). Etiquetas completas siempre;
 * en móvil el enfoque no aplica (las pantallas ya van apiladas) y su botón no se pinta.
 */

import { motion } from "framer-motion";
import { Mail, Maximize2, MessageSquare, Minimize2, Settings } from "lucide-react";
import { NotificationCenter } from "@/components/layout/notification-center";
import { UserNav } from "@/components/layout/user-nav";
import { cn } from "@/lib/utils";
import { useNivelMovimiento } from "@/hooks/use-nivel-movimiento";
import { ACENTO, MUELLE, pildoraFantasma } from "./estilos";

export type SuperficieMensajes = "chats" | "mail";

export interface ConmutadorSuperficieProps {
    superficie: SuperficieMensajes;
    onCambiar: (s: SuperficieMensajes) => void;
    noLeidosChats?: number;
    noLeidosCorreos?: number;
    className?: string;
}

/** Control segmentado Mensajes | Correos (misma semántica que el antiguo SurfaceSwitch). */
export function ConmutadorSuperficie({ superficie, onCambiar, noLeidosChats = 0, noLeidosCorreos = 0, className }: ConmutadorSuperficieProps) {
    const nivel = useNivelMovimiento();
    const opciones: { id: SuperficieMensajes; etiqueta: string; titulo: string; Icono: typeof Mail; cuenta: number }[] = [
        { id: "chats", etiqueta: "Mensajes", titulo: "Conversaciones", Icono: MessageSquare, cuenta: noLeidosChats },
        { id: "mail", etiqueta: "Correos", titulo: "Correos (@star.seed)", Icono: Mail, cuenta: noLeidosCorreos },
    ];
    return (
        <div
            role="tablist"
            aria-label="Sección"
            className={cn(
                "ss-redondo relative inline-flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                className,
            )}
        >
            {opciones.map(({ id, etiqueta, titulo, Icono, cuenta }) => {
                const activa = superficie === id;
                return (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={activa}
                        title={titulo}
                        onClick={() => onCambiar(id)}
                        className={cn(
                            "ss-redondo relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF] sm:px-3.5",
                            activa ? "text-white" : "text-white/60 hover:text-white",
                        )}
                    >
                        {activa && (
                            <motion.span
                                layoutId="ss-mensajeria-superficie"
                                aria-hidden
                                className="absolute inset-0 rounded-full"
                                style={pildoraFantasma(ACENTO.mensajes)}
                                transition={nivel === "minimo" ? { duration: 0 } : MUELLE}
                            />
                        )}
                        <Icono className="relative h-3.5 w-3.5" />
                        <span className="relative">{etiqueta}</span>
                        {cuenta > 0 && (
                            <span
                                className="relative ml-0.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] text-white"
                                style={{ background: ACENTO.mensajes }}
                                aria-label={`${cuenta} sin leer`}
                            >
                                {cuenta > 99 ? "99+" : cuenta}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export interface BarraSuperiorProps {
    superficie: SuperficieMensajes;
    onCambiarSuperficie: (s: SuperficieMensajes) => void;
    onAbrirAjustes: () => void;
    enfocado: boolean;
    onAlternarEnfoque: () => void;
    /** Sin chat ni correo abierto no hay nada que enfocar. */
    puedeEnfocar: boolean;
    esMovil: boolean;
    noLeidosChats?: number;
}

const CLASE_BOTON_ICONO =
    "ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/75 transition-all duration-200 hover:bg-white/[0.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-40";

export function BarraSuperior({
    superficie,
    onCambiarSuperficie,
    onAbrirAjustes,
    enfocado,
    onAlternarEnfoque,
    puedeEnfocar,
    esMovil,
    noLeidosChats = 0,
}: BarraSuperiorProps) {
    return (
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
            <ConmutadorSuperficie superficie={superficie} onCambiar={onCambiarSuperficie} noLeidosChats={noLeidosChats} />
            <div className="flex shrink-0 items-center gap-1.5">
                {!esMovil && (
                    <button
                        type="button"
                        onClick={onAlternarEnfoque}
                        disabled={!puedeEnfocar && !enfocado}
                        aria-pressed={enfocado}
                        aria-label={enfocado ? "Salir del modo enfoque (Esc)" : "Modo enfoque: ocultar la lista"}
                        title={enfocado ? "Salir del modo enfoque (Esc)" : "Modo enfoque: ocultar la lista"}
                        className={CLASE_BOTON_ICONO}
                        style={enfocado ? pildoraFantasma(ACENTO.mensajes) : undefined}
                    >
                        {enfocado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onAbrirAjustes}
                    aria-label="Ajustes de Mensajería"
                    title="Ajustes de Mensajería"
                    className={CLASE_BOTON_ICONO}
                >
                    <Settings className="h-4 w-4" />
                </button>
                <NotificationCenter />
                <UserNav />
            </div>
        </header>
    );
}

export default BarraSuperior;
