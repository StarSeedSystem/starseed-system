/**
 * Tokens de color de la capa editorial-papel (Risograph).
 * ─────────────────────────────────────────────────────────────────────────────
 * Los hex viven aquí y SOLO aquí: el resto del módulo (transiciones, compositor)
 * los referencia por nombre, nunca los repite (memory/diseno/identidades.md).
 * Paleta Trinity del ADN: architecture/diseno-motion-1114.md §ADN.
 */

export interface TokenColor {
    nombre: string;
    /** Hex del token. */
    valor: string;
    /** Cobertura del token en la composición (0-1). */
    cobertura: number;
}

/** Azul eléctrico. */
export const zenith: TokenColor = { nombre: "zenith", valor: "#007FFF", cobertura: 0.25 };
/** Verde esmeralda. */
export const horizonte: TokenColor = { nombre: "horizonte", valor: "#10B981", cobertura: 0.25 };
/** Amarillo lógico. */
export const logica: TokenColor = { nombre: "logica", valor: "#FFBF00", cobertura: 0.2 };
/** Rojo raíz. */
export const anchor: TokenColor = { nombre: "anchor", valor: "#DC143C", cobertura: 0.1 };
/** Superficie de papel. */
export const neutro: TokenColor = { nombre: "neutro", valor: "#FFFFFF", cobertura: 0.3 };

export interface ParadaGradiente {
    color: string;
    /** Posición de la parada dentro del gradiente (0-1). */
    posicion: number;
}

/** Gradiente radial de acento: cobertura del 15 %, de zenith hacia el neutro. */
export interface GradienteAcento {
    tipo: "radial";
    /** Cobertura del acento sobre la superficie (0-1). */
    cobertura: number;
    paradas: ParadaGradiente[];
}

export const gradienteAcento: GradienteAcento = {
    tipo: "radial",
    cobertura: 0.15,
    paradas: [
        { color: zenith.valor, posicion: 0 },
        { color: neutro.valor, posicion: 1 },
    ],
};
