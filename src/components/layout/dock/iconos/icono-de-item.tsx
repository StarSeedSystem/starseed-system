"use client";

/**
 * IconoDeItem (Ola 1025U · V1b) — el dibujo de un botón del dock: si el item tiene un diseño (propio o de
 * la plantilla del perfil) se pinta con `IconoDock`; si no, es el icono de Lucide de siempre, sin ningún
 * cambio. Es el único punto de contacto de OmniDock con el diseño de iconos.
 */

import { memo } from "react";
import { disenoEfectivo, type DisenoIcono, type PerfilIconos } from "@/lib/dock/iconos/modelo";
import type { IconoLucide } from "./glifos-lucide";
import { IconoDock } from "./icono-dock";

export interface IconoDeItemProps {
    id: string;
    iconKey: string;
    /** Diseño propio del item (cambiado a mano). */
    diseno?: DisenoIcono | null;
    /** El icono de Lucide de siempre. */
    Icono: IconoLucide;
    perfil: PerfilIconos;
    /** Clases del icono de siempre (su tamaño). El diseñado ocupa todo el botón. */
    className?: string;
}

export const IconoDeItem = memo(function IconoDeItem({ id, iconKey, diseno, Icono, perfil, className }: IconoDeItemProps) {
    const d = disenoEfectivo({ id, iconKey, diseno }, perfil);
    return d ? <IconoDock diseno={d} icono={Icono} iconKey={iconKey} /> : <Icono className={className} />;
});
