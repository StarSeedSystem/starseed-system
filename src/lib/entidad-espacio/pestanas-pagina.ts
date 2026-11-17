// pestanas-pagina · SES1115Q P1-B: adaptador PURO de pestañas del espacio de una
// entidad a las pestañas de su página. Sin red, sin disco: recibe la lista ya
// filtrada por permisos, el estado EN VIVO por sesión y una función de render,
// y devuelve la forma que la página espera (`{id, label, node}`). Contenido =
// entidad única: cada pestaña REFERENCIA su sesión, nunca la duplica.
import type { ReactNode } from "react";
import type { Pestana } from "./modelo";

/** Estado EN VIVO de una sesión, por `sesionId` (luego lo alimenta la presencia). */
export interface EstadoEnDirecto {
    directo: boolean;
    personas: number;
}

/** Pestaña lista para el carril de la página (`SectionTabs` + `TabsContent`). */
export interface PestanaDePagina {
    id: string;
    label: string;
    node: ReactNode;
}

export type RenderPestana = (p: Pestana) => ReactNode;

/** Etiqueta de la pestaña: «<título>», o «<título> ● EN VIVO · <personas>» en directo. */
export function etiquetaPestana(titulo: string, estado?: EstadoEnDirecto): string {
    if (!estado || !estado.directo) return titulo;
    const personas = Number.isFinite(estado.personas) ? Math.max(0, Math.floor(estado.personas)) : 0;
    return `${titulo} ● EN VIVO · ${personas}`;
}

/**
 * Convierte las pestañas del espacio (clave `espacio`) en pestañas de página.
 * El orden de entrada se conserva; no filtra permisos (eso lo hace quien lee,
 * con `puedeVerPestana`) y no toca la red.
 */
export function aPestanasDePagina(
    pestanas: Pestana[],
    enDirecto: Record<string, EstadoEnDirecto>,
    render: RenderPestana,
): PestanaDePagina[] {
    return pestanas.map((p) => ({
        id: p.id,
        label: etiquetaPestana(p.titulo, enDirecto[p.sesionId]),
        node: render(p),
    }));
}
