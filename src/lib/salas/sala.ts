/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Salas (Ola 307) — contrato ÚNICO de sala compartida.
 * ---------------------------------------------------------------------------
 * Hoy conviven dos mitades sueltas: `useSharedBoardSpace` y
 * `useSharedDesktopSpace` sobre `os_spaces` (kinds `board` y `desktop`). Aquí
 * vive el contrato común que las abarca a ambas y añade dashboards, escenas 3D
 * y XR: quién puede qué (matriz de roles en UN solo sitio), por dónde viaja la
 * sala (servidor público, servidor privado, malla P2P o local) y qué admite
 * cada tipo, para que la UI no ofrezca lo que una sala no puede hacer.
 *
 * Módulo PURO: sin red, sin disco, sin `node:*`. Sólo decide y explica.
 * Invariante §6 (privacidad ↔ transparencia): una sala privada prefiere
 * siempre el camino privado, aunque haya internet; y cuando no sincroniza, lo
 * dice con honestidad en vez de fingir que sí.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Los cinco tipos de sala que el OS sabe abrir. */
export type TipoSala = "pizarra" | "escritorio" | "dashboard" | "escena3d" | "xr";

/** Por dónde viajan los cambios de una sala. */
export type TransporteSala =
    | "servidor-publico"
    | "servidor-privado"
    | "malla-p2p"
    | "local";

/** Rol de una persona dentro de una sala, de más a menos poder. */
export type RolSala = "dueno" | "editor" | "comentarista" | "observador";

/** Una sala compartible: el objeto que viaja entre dispositivos y personas. */
export interface Sala {
    id: string;
    tipo: TipoSala;
    titulo: string;
    visibilidad: "privada" | "grupo" | "publica";
    grupoId?: string;
    transporte: TransporteSala;
    servidorUrl?: string;
    miembros: Record<string, RolSala>;
    creadaEn: number;
    proposito?: string;
}

/** Qué caminos hay disponibles ahora mismo desde este dispositivo. */
export interface Alcanzabilidad {
    internet: boolean;
    servidorPrivado: boolean;
    malla: boolean;
}

/** Decisión de transporte, siempre acompañada de su motivo en claro. */
export interface DecisionTransporte {
    transporte: TransporteSala;
    motivo: string;
}

/* ─────────────────────────── Matriz de roles ─────────────────────────── */

/**
 * Rango numérico de cada rol, de más a menos poder. Sirve para comparar
 * («¿este rol llega al menos a editor?») sin repetir cadenas por el código.
 */
export const RANGO_ROL: Record<RolSala, number> = {
    dueno: 3,
    editor: 2,
    comentarista: 1,
    observador: 0,
};

/**
 * Rol de una persona en una sala, o `null` si no figura entre sus miembros.
 * Es la única puerta de entrada a la matriz: todo lo demás se apoya aquí.
 */
export function rolDe(sala: Sala, usuarioId: string): RolSala | null {
    const rol = sala.miembros[usuarioId];
    return rol ?? null;
}

/**
 * Ver una sala. Una sala pública la ve cualquiera (esté o no en la lista);
 * una sala privada o de grupo, sólo quien figure entre sus miembros.
 */
export function puedeVer(sala: Sala, usuarioId: string): boolean {
    if (sala.visibilidad === "publica") return true;
    return rolDe(sala, usuarioId) !== null;
}

/**
 * Editar el contenido de la sala (trazos, ventanas, widgets, objetos…).
 * Sólo dueños y editores; comentaristas y observadores miran, no tocan. En una
 * sala pública, quien no es miembro entra como observador: puede ver, no editar.
 */
export function puedeEditar(sala: Sala, usuarioId: string): boolean {
    const rol = rolDe(sala, usuarioId);
    if (rol === null) return false;
    return RANGO_ROL[rol] >= RANGO_ROL.editor;
}

/**
 * Invitar a más gente. El dueño siempre puede. Un editor sólo si la sala NO es
 * privada: ampliar el círculo de una sala privada es decisión de su dueño y de
 * nadie más (§6, privacidad primero).
 */
export function puedeInvitar(sala: Sala, usuarioId: string): boolean {
    const rol = rolDe(sala, usuarioId);
    if (rol === null) return false;
    if (rol === "dueno") return true;
    if (rol === "editor") return sala.visibilidad !== "privada";
    return false;
}

/* ──────────────────────── Elección de transporte ─────────────────────── */

/** Un servidor privado sólo es usable si además sabemos dónde está. */
function servidorPrivadoUsable(sala: Sala, a: Alcanzabilidad): boolean {
    const url = sala.servidorUrl?.trim() ?? "";
    return a.servidorPrivado && url.length > 0;
}

/**
 * Decide por dónde sincroniza esta sala AHORA MISMO, y lo explica.
 *
 * Criterio: una sala que no es pública (privada o de grupo) prefiere el
 * servidor privado y, si no, la malla P2P, aunque haya internet — la
 * privacidad va antes que la comodidad (§6). Sólo cuando no queda ningún
 * camino reservado se acepta un servidor público, y el motivo lo dice sin
 * adornos. Una sala pública, en cambio, usa internet si lo hay, porque para
 * eso es pública. Sin ningún camino se queda en `local`, y el motivo avisa con
 * honestidad de que NO se está sincronizando con nadie.
 */
export function elegirTransporte(sala: Sala, a: Alcanzabilidad): DecisionTransporte {
    const reservada = sala.visibilidad !== "publica";
    const privado = servidorPrivadoUsable(sala, a);

    if (reservada) {
        if (privado) {
            return {
                transporte: "servidor-privado",
                motivo: "Sala no pública con servidor privado alcanzable: los cambios no salen de tu servidor.",
            };
        }
        if (a.malla) {
            return {
                transporte: "malla-p2p",
                motivo: "Sala no pública sin servidor privado: viaja por la malla P2P, sin intermediarios.",
            };
        }
        if (a.internet) {
            return {
                transporte: "servidor-publico",
                motivo: "Sin servidor privado ni malla: se usa un servidor público. Es el camino menos reservado de todos.",
            };
        }
        return {
            transporte: "local",
            motivo: "Sin internet, sin servidor privado y sin malla: la sala queda en este dispositivo y NO se está sincronizando.",
        };
    }

    if (a.internet) {
        return {
            transporte: "servidor-publico",
            motivo: "Sala pública con internet: servidor público, que es donde cualquiera puede encontrarla.",
        };
    }
    if (privado) {
        return {
            transporte: "servidor-privado",
            motivo: "Sala pública sin internet: se sirve desde el servidor privado alcanzable.",
        };
    }
    if (a.malla) {
        return {
            transporte: "malla-p2p",
            motivo: "Sala pública sin internet ni servidor: viaja por la malla P2P entre los presentes.",
        };
    }
    return {
        transporte: "local",
        motivo: "Sin internet, sin servidor privado y sin malla: la sala queda en este dispositivo y NO se está sincronizando.",
    };
}

/* ─────────────────────── Capacidades por tipo de sala ────────────────── */

/**
 * Qué admite cada tipo de sala. La UI lee esta tabla para no ofrecer lo que
 * una sala no puede hacer (nada de «añadir ancla» en una pizarra plana).
 * Los cinco tipos declaran capacidades: ninguno se queda vacío.
 */
export const CAPACIDADES_POR_TIPO: Record<TipoSala, string[]> = {
    pizarra: ["trazos", "notas", "formas", "imagenes", "punteros"],
    escritorio: ["ventanas", "archivos", "atajos", "fondo", "punteros"],
    dashboard: ["widgets", "fuentes-datos", "rejilla", "filtros"],
    escena3d: ["objetos", "anclas", "avatares", "luces", "camaras"],
    xr: ["objetos", "anclas", "avatares", "manos", "pasajeros", "escala-real"],
};

/** ¿Admite esta sala una capacidad concreta? */
export function admiteCapacidad(sala: Sala, capacidad: string): boolean {
    return CAPACIDADES_POR_TIPO[sala.tipo].includes(capacidad);
}
