"use client";
/**
 * Capas globales de Mensajería (2026-09-28): llamadas (timbre entrante + ventana activa, que
 * sobrevive al salir de /messages), latido de presencia («en línea» en cualquier página), la
 * presencia de las apps en vivo y el aviso de novedad del bloqueo para cuentas ya creadas.
 * Todo se carga PEREZOSO: cuelga del layout raíz y no puede engordar el grafo común
 * (CLAUDE.md, «El layout raíz no carga motores pesados de forma estática»).
 */
import dynamic from "next/dynamic";

const MontajeLlamadas = dynamic(() => import("@/components/llamadas/montaje-llamadas").then((m) => m.MontajeLlamadas), { ssr: false });
const LatidoPresencia = dynamic(() => import("@/components/mensajeria/latido-presencia").then((m) => m.LatidoPresencia), { ssr: false });
const PresenciaSesionVivaMontaje = dynamic(() => import("@/components/messages/vivo/presencia-sesion").then((m) => m.PresenciaSesionVivaMontaje), { ssr: false });
const AvisoNovedadMontaje = dynamic(() => import("@/components/inicio/aviso-novedad-montaje").then((m) => m.AvisoNovedadMontaje), { ssr: false });

export function MontajeGlobalMensajeria() {
    return (
        <>
            <LatidoPresencia />
            <MontajeLlamadas />
            <PresenciaSesionVivaMontaje />
            <AvisoNovedadMontaje />
        </>
    );
}

export default MontajeGlobalMensajeria;
