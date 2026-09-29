"use client";
/**
 * Montaje global del consumo (2026-09-29). Cuelga del layout raíz, así que todo va PEREZOSO y sin
 * SSR (CLAUDE.md, «El layout raíz no carga motores pesados de forma estática»): el guardián de red ya
 * vive dentro del cliente de Supabase; aquí solo se pinta el aviso y se arranca la lectura del freno
 * remoto en esta pestaña (lo hace el propio aviso al suscribirse con `useFreno`).
 *
 * En src/app/layout.tsx, junto a MontajeGlobalMensajeria y FUERA de <SoloFueraDeMinima> (el aviso
 * es pequeño y también hace falta en /mando y /voces):
 *     import { MontajeConsumo } from "@/components/consumo/montaje-consumo";
 *     <MontajeConsumo />
 */
import dynamic from "next/dynamic";

const AvisoConsumo = dynamic(() => import("@/components/consumo/aviso-consumo").then((m) => m.AvisoConsumo), {
    ssr: false,
});

export function MontajeConsumo() {
    return <AvisoConsumo />;
}

export default MontajeConsumo;
