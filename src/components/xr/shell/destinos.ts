/**
 * StarSeed XR · NODO HORIZON, parte PURA (XR1010AO · contrato `architecture/starseed-xr.md` §3 a y h).
 * Lista los destinos del nodo Horizon reutilizando el contrato ÚNICO de sala (`src/lib/salas/sala.ts`):
 * rol, permisos y transporte salen de `rolDe`, `puedeVer`, `puedeEditar` y `elegirTransporte`; un
 * destino que no se puede ver no aparece, y los públicos se ordenan después de los privados.
 * Sin React, sin red, sin `node:*`.
 */
import {
    elegirTransporte, puedeVer, puedeEditar, rolDe,
    type Alcanzabilidad, type RolSala, type Sala, type TransporteSala,
} from "@/lib/salas/sala";

/** Las cuatro capas del listado de Horizon. */
export type CategoriaDestino = "mis-mundos" | "estaciones-en-vivo" | "servidores" | "grupos";
/** Un destino tocable del panel de Horizon. */
export interface ItemDestino {
    id: string;
    nombre: string;
    categoria: CategoriaDestino;
    transporte: TransporteSala | "desconocido";
    rol: RolSala | null;
    puedeVer: boolean;
    puedeEditar: boolean;
    privado: boolean;
    etiqueta: string;
}

/** Un grupo del listado de Horizon, p. ej. las estaciones en vivo de la red. */
export interface GrupoDestinos {
    categoria: CategoriaDestino;
    items: ItemDestino[];
}

/** Lo mínimo que el panel necesita saber de una estación de la red. */
export interface FuenteEstacionRef {
    id: string;
    titulo: string;
    visibilidad: "publica" | "grupo";
    owner_id: string;
}

/** Listado interior del panel: los datos ya leídos de sus servicios reales. */
export interface DatosDestinos {
    mundos: readonly Sala[];
    estaciones: readonly Sala[];
    servidores: readonly Sala[];
    grupos: readonly Sala[];
    salas: readonly Sala[];
    /** Sin dato se asume `TODOS_ALCANZABLES`; si se sabe menos, se dice menos. */
    alcanzabilidad?: Alcanzabilidad;
}

/** Caminos disponibles cuando lo único que se sabe es lo que `listarEstaciones` le deja ver. */
export const TODOS_ALCANZABLES: Alcanzabilidad = { internet: true, servidorPrivado: true, malla: true };

const ETIQUETA_DE: Record<Sala["visibilidad"], string> = { privada: "Privada", grupo: "Grupo", publica: "Público" };

/** Un destino de la sala a la persona `yo`: rol, permisos y transporte salen TODOS de `sala.ts`. */
export function itemDe(sala: Sala, categoria: CategoriaDestino, yo: string, a: Alcanzabilidad): ItemDestino | null {
    if (!puedeVer(sala, yo)) return null;
    return {
        id: sala.id,
        nombre: sala.titulo,
        categoria,
        transporte: elegirTransporte(sala, a).transporte,
        rol: rolDe(sala, yo),
        puedeVer: true,
        puedeEditar: puedeEditar(sala, yo),
        privado: sala.visibilidad !== "publica",
        etiqueta: ETIQUETA_DE[sala.visibilidad],
    };
}

/** Privados primero; los «Público» siempre detrás. Estable dentro de cada mitad. */
export const MENOS_PRIVADOS_PRIMERO = (a: ItemDestino, b: ItemDestino): number =>
    (b.privado ? 1 : 0) - (a.privado ? 1 : 0);

/** El listado completo del nodo Horizon, agrupado y ordenado. */
export function listarDestinos(d: DatosDestinos, yo: string): GrupoDestinos[] {
    const a = d.alcanzabilidad ?? TODOS_ALCANZABLES;
    const grupo = (categoria: CategoriaDestino, salas: readonly Sala[]): GrupoDestinos => ({
        categoria,
        items: salas.map((s) => itemDe(s, categoria, yo, a)).filter((x): x is ItemDestino => x !== null).sort(MENOS_PRIVADOS_PRIMERO),
    });
    return [
        grupo("mis-mundos", [...d.mundos, ...d.salas]),
        grupo("estaciones-en-vivo", d.estaciones),
        grupo("servidores", d.servidores),
        grupo("grupos", d.grupos),
    ];
}

/* ─────────── Adaptadores: servicios reales → Sala (para `sala.ts`) ─────────── */

/** Tus salas XR (`listarMiosXr`): son tuyas (dueño) y privadas hasta que se publiquen. */
export function mundosASalas(propias: readonly { refId: string; titulo: string }[], yo: string): Sala[] {
    return propias.map((p) => ({
        id: p.refId,
        tipo: "xr",
        titulo: p.titulo || "Mundo sin nombre",
        visibilidad: "privada",
        transporte: "local",
        miembros: { [yo]: "dueno" },
        creadaEn: 0,
    }));
}

/** Una estación (`listarEstaciones`): el RLS ya la dejó pasar, así que no ser dueño = observador. */
export function estacionASala(e: FuenteEstacionRef, yo: string): Sala {
    const dueno = e.owner_id === yo;
    return {
        id: e.id,
        tipo: "xr",
        titulo: e.titulo,
        visibilidad: e.visibilidad === "grupo" ? "grupo" : "publica",
        transporte: "local",
        miembros: { [e.owner_id]: "dueno", ...(!dueno ? { [yo]: "observador" } : {}) },
        creadaEn: 0,
    };
}
