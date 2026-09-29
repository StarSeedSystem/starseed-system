/**
 * Estudio Creativo · piezas PURAS (Ola 0929-C).
 *
 * Las «obras» son tus espacios REALES de creación (`os_spaces`, ver `gen5/_catalogo/espacios.ts`):
 * documentos, presentaciones, tablas, pizarras y programas. Tres se crean aquí mismo con la
 * función de su app (`crearVivoDocumento`, `crearVivoPresentacion`, `crearVivoTabla`); la pizarra
 * y el programa se crean en su propia página.
 */
import type { Espacio, TipoEspacio } from "../gen5/_catalogo/espacios";

export type TipoObra = Extract<TipoEspacio, "documento" | "presentacion" | "tabla" | "pizarra" | "programa">;
export type TipoCreable = Extract<TipoObra, "documento" | "presentacion" | "tabla">;

export interface MetaObra { tipo: TipoObra; nombre: string; plural: string; color: string; ayuda: string; crearEn?: string }

export const OBRAS: MetaObra[] = [
    { tipo: "documento", nombre: "Documento", plural: "documentos", color: "#60a5fa", ayuda: "Escribe con otras personas a la vez" },
    { tipo: "presentacion", nombre: "Presentación", plural: "presentaciones", color: "#f472b6", ayuda: "Diapositivas que se presentan en vivo" },
    { tipo: "tabla", nombre: "Tabla", plural: "tablas", color: "#34d399", ayuda: "Datos que se rellenan entre varias personas" },
    { tipo: "pizarra", nombre: "Pizarra", plural: "pizarras", color: "#fbbf24", ayuda: "Un lienzo libre para las ideas", crearEn: "/pizarra" },
    { tipo: "programa", nombre: "Programa", plural: "programas", color: "#a78bfa", ayuda: "Encuestas y pequeñas apps compartidas", crearEn: "/crear" },
];

export const META_OBRA = Object.fromEntries(OBRAS.map((o) => [o.tipo, o])) as Record<TipoObra, MetaObra>;

export function esObra(e: Pick<Espacio, "tipo">): e is Espacio & { tipo: TipoObra } {
    return e.tipo in META_OBRA;
}

export function obrasDe(espacios: Espacio[] | null | undefined): (Espacio & { tipo: TipoObra })[] {
    return (espacios ?? []).filter(esObra);
}

export function conteoPorTipo(obras: Pick<Espacio, "tipo">[]): Record<TipoObra, number> {
    const c = { documento: 0, presentacion: 0, tabla: 0, pizarra: 0, programa: 0 } as Record<TipoObra, number>;
    for (const o of obras) if (o.tipo in c) c[o.tipo as TipoObra]++;
    return c;
}

/** «3 documentos, 1 presentación y 2 tablas» (solo lo que hay). */
export function resumenConteo(c: Record<TipoObra, number>): string {
    const partes = OBRAS.filter((o) => c[o.tipo] > 0).map((o) => `${c[o.tipo]} ${c[o.tipo] === 1 ? o.nombre.toLowerCase() : o.plural}`);
    if (partes.length <= 1) return partes[0] ?? "ninguna obra";
    return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** La app de cada tipo creable y su función de crear (carga perezosa: solo al pulsar). */
export async function crearObra(tipo: TipoCreable, titulo: string): Promise<{ refId: string; ruta: string }> {
    if (tipo === "documento") return (await import("@/lib/vivo/documento")).crearVivoDocumento(titulo);
    if (tipo === "presentacion") return (await import("@/lib/vivo/presentacion")).crearVivoPresentacion(titulo);
    return (await import("@/lib/vivo/tabla")).crearVivoTabla(titulo);
}
