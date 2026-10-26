"use client";

/**
 * Glifo de Lucide ELEGIDO a mano (no el propio del item). Vive aparte y se carga a demanda: el dock
 * pinta casi siempre el icono propio de cada item (glifo «auto») y no debe cargar el catálogo de
 * 140 iconos del selector solo por si alguien eligió otro.
 */

import { resolverGlifoLucide } from "./glifos-lucide";

export default function GlifoLucideElegido({ clave, iconKeyPropio }: { clave: string; iconKeyPropio: string }) {
    const Icono = resolverGlifoLucide(clave, iconKeyPropio);
    return <Icono className="h-full w-full" />;
}
