import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * /llamada/[id] vive FUERA de los grupos (app)/(main) a propósito: quien llega con un enlace
 * público puede no tener cuenta. El layout raíz aporta la chrome del OS; aquí solo se fija el
 * título y que los buscadores no indexen enlaces de llamadas.
 */
export const metadata: Metadata = {
    title: "Llamada · StarSeed",
    robots: { index: false, follow: false },
};

export default function LayoutLlamada({ children }: { children: ReactNode }) {
    return children;
}
