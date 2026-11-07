/**
 * Icono de una neurona según su tipo de aparato, con su punto de «en línea» (MSJ1107A · 2026-11-07).
 * Las conversaciones con otra cuenta (cerebro compartido) llevan el icono de red.
 */

import { Cpu, Laptop, Monitor, Network, Server, Smartphone, Tablet } from "lucide-react";
import { ACENTO, ESTILO_PUNTO_EN_LINEA } from "@/components/messages/marco/estilos";

const POR_TIPO: Record<string, typeof Cpu> = {
    desktop: Monitor,
    laptop: Laptop,
    mobile: Smartphone,
    tablet: Tablet,
    server: Server,
    other: Cpu,
};

export function IconoNeurona({ kind, propia = true, enLinea }: { kind?: string; propia?: boolean; enLinea?: boolean }) {
    const Icono = propia ? POR_TIPO[kind ?? "other"] ?? Cpu : Network;
    const color = propia ? ACENTO.mensajes : ACENTO.contactos;
    return (
        <span
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
            style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}55`, color }}
            aria-hidden
        >
            <Icono className="h-[18px] w-[18px]" />
            {enLinea && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full" style={ESTILO_PUNTO_EN_LINEA} />}
        </span>
    );
}

export default IconoNeurona;
