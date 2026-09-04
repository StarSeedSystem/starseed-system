"use client";

/**
 * ACOMPAÑANTE DE PERSONALIDAD (Ola 235 · M4 · 2/3)
 * ============================================================================
 * Capa flotante que, cuando la personalidad ACTIVA lo pide
 * (`acompanante.mostrar`), pinta su `AvatarVivo` en la esquina configurada
 * mientras se usa el chat.
 *
 * Reglas:
 *  · Arrastrable dentro de la ventana; recuerda el desplazamiento en sesión.
 *  · NO bloquea clics: `pointer-events` solo en el propio avatar (el resto de
 *    la capa es transparente al ratón).
 *  · Desaparece con `prefers-reduced-motion` o al desactivar `mostrar`.
 *  · Reacciona AMBOS eventos del OS: `starseed:aurora-personality` (cambio de
 *    personalidad activa) y `starseed:avatar-personalidad` (cambio de config).
 *  · El movimiento lo da el motor único «Vida StarSeed» vía `AvatarVivo`:
 *    gesto de ambiente con la energía/expresividad configuradas.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    getActivePersonality,
    PERSONALITY_CHANGED_EVENT,
    type PersonalityProfile,
} from "@/lib/aurora/personalities";
import { proceduralAvatarSvg } from "@/lib/aurora/persona-avatar";
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import { AvatarVivo, type FuenteAvatar } from "@/components/avatares/avatar-vivo";
import {
    AVATAR_PERSONALIDAD_EVENT,
    avatarDePersonalidad,
    type AvatarPersonalidad,
} from "@/lib/aurora/persona-avatar-vivo";
import { cn } from "@/lib/utils";

/** Estilo fijo según la esquina elegida. */
function estiloEsquina(esquina: AvatarPersonalidad["acompanante"]["esquina"]): React.CSSProperties {
    const base: React.CSSProperties = { position: "absolute" };
    if (esquina.startsWith("inferior")) base.bottom = 0;
    else base.top = 0;
    if (esquina.endsWith("derecha")) base.right = 0;
    else base.left = 0;
    return base;
}

/** Convierte la fuente guardada en la `FuenteAvatar` del componente universal. */
function fuentePara(config: AvatarPersonalidad, perfil: PersonalityProfile): FuenteAvatar {
    const f = config.fuente;
    if (f.tipo === "glb" && f.url) return { tipo: "glb", url: f.url };
    if (f.tipo === "imagen" && f.url) return { tipo: "imagen", url: f.url };
    return { tipo: "procedural", svg: proceduralAvatarSvg(perfil, 256) };
}

export function AcompanantePersonalidad() {
    const [estado, setEstado] = useState<{
        config: AvatarPersonalidad;
        perfil: PersonalityProfile;
    } | null>(null);
    const [reducir, setReducir] = useState(false);
    const [arrastre, setArrastre] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
    const nodoRef = useRef<HTMLDivElement | null>(null);

    /* Resuelve la personalidad activa y su configuración de avatar. */
    const refrescar = useCallback(() => {
        try {
            const perfil = getActivePersonality();
            if (!perfil) {
                setEstado(null);
                return;
            }
            const config = avatarDePersonalidad(perfil.id);
            setEstado(config.acompanante.mostrar ? { config, perfil } : null);
        } catch {
            setEstado(null);
        }
    }, []);

    useEffect(() => {
        refrescar();
        window.addEventListener(PERSONALITY_CHANGED_EVENT, refrescar);
        window.addEventListener(AVATAR_PERSONALIDAD_EVENT, refrescar);
        window.addEventListener("storage", refrescar);
        return () => {
            window.removeEventListener(PERSONALITY_CHANGED_EVENT, refrescar);
            window.removeEventListener(AVATAR_PERSONALIDAD_EVENT, refrescar);
            window.removeEventListener("storage", refrescar);
        };
    }, [refrescar]);

    /* prefers-reduced-motion manda: con movimiento reducido no hay acompañante. */
    useEffect(() => {
        try {
            const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
            const aplicar = () => setReducir(mq.matches);
            aplicar();
            mq.addEventListener("change", aplicar);
            return () => mq.removeEventListener("change", aplicar);
        } catch {
            return undefined;
        }
    }, []);

    /* Arrastre con puntero: solo dentro de la ventana. */
    const alArrastrar = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const origenX = e.clientX;
        const origenY = e.clientY;
        const inicial = arrastre;
        e.currentTarget.setPointerCapture(e.pointerId);
        const mover = (ev: PointerEvent) => {
            const caja = nodoRef.current?.getBoundingClientRect();
            const limiteX = caja ? window.innerWidth - caja.width : window.innerWidth;
            const limiteY = caja ? window.innerHeight - caja.height : window.innerHeight;
            setArrastre({
                dx: Math.min(0, Math.max(-limiteX, inicial.dx + ev.clientX - origenX)),
                dy: Math.min(0, Math.max(-limiteY, inicial.dy + ev.clientY - origenY)),
            });
        };
        const soltar = () => {
            window.removeEventListener("pointermove", mover);
            window.removeEventListener("pointerup", soltar);
        };
        window.addEventListener("pointermove", mover);
        window.addEventListener("pointerup", soltar);
    }, [arrastre]);

    if (reducir || !estado) return null;

    const { config, perfil } = estado;
    const nombre = perfil.name;
    const movimientoEncendido = config.movimiento.automatico;
    // Gesto de ambiente: bucle infinito de presencia; el motor decide el nivel.
    const gesto: Gesto | null = movimientoEncendido
        ? {
              prompt: "presencia tranquila en una conversación",
              energia: config.movimiento.energia,
              bucle: true,
              duracionMs: 3200,
          }
        : null;

    return (
        <div
            className="pointer-events-none fixed inset-0 z-[60] p-4"
            aria-hidden="true"
        >
            <div
                ref={nodoRef}
                className="pointer-events-none absolute"
                style={{
                    ...estiloEsquina(config.acompanante.esquina),
                    transform: `translate(${arrastre.dx}px, ${arrastre.dy}px)`,
                }}
            >
                <div
                    role="img"
                    aria-label={`Acompañante de ${nombre}`}
                    title={`${nombre} — arrástrame`}
                    onPointerDown={alArrastrar}
                    className={cn(
                        "pointer-events-auto cursor-grab touch-none rounded-3xl p-1 active:cursor-grabbing",
                        "bg-white/[0.03] backdrop-blur-sm ring-1 ring-white/10",
                    )}
                    style={{ opacity: config.acompanante.opacidad }}
                >
                        <AvatarVivo
                        fuente={fuentePara(config, perfil)}
                        gesto={gesto}
                        tamano={config.acompanante.tamano}
                        personalidadId={config.personalidadId}
                    />
                </div>
            </div>
        </div>
    );
}
