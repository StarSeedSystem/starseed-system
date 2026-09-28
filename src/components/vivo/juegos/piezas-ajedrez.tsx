import { FORMAS_PIEZA, type TipoPieza } from "./piezas-formas";

const RELLENO: Record<0 | 1, string> = { 0: "#FFFFFF", 1: "#15122F" };
const CONTORNO: Record<0 | 1, string> = { 0: "#241C63", 1: "#E9E5FF" };

/** Nombre en español de cada tipo de pieza, para las etiquetas de accesibilidad. */
export const NOMBRE_PIEZA: Record<TipoPieza, string> = {
    p: "peón",
    n: "caballo",
    b: "alfil",
    r: "torre",
    q: "dama",
    k: "rey",
};

/** Una pieza de ajedrez como SVG. `bando`: 0 = blancas, 1 = negras. Decorativa (`aria-hidden`). */
export function Pieza({ tipo, bando, className }: { tipo: TipoPieza; bando: 0 | 1; className?: string }) {
    const f = FORMAS_PIEZA[tipo];
    const relleno = RELLENO[bando];
    const contorno = CONTORNO[bando];
    return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
            {f.rellenos.map((d, i) => (
                <path key={`r${i}`} d={d} fill={relleno} stroke={contorno} strokeWidth={2.4} strokeLinejoin="round" />
            ))}
            {f.circulos.map(([cx, cy, r], i) => (
                <circle key={`c${i}`} cx={cx} cy={cy} r={r} fill={relleno} stroke={contorno} strokeWidth={2.4} />
            ))}
            {f.detalles.map((d, i) => (
                <path key={`d${i}`} d={d} fill="none" stroke={contorno} strokeWidth={2.4} strokeLinecap="round" />
            ))}
            {f.puntos.map(([cx, cy, r], i) => (
                <circle key={`p${i}`} cx={cx} cy={cy} r={r} fill={contorno} />
            ))}
        </svg>
    );
}

/** Pieza del tablero (valor con signo: +blanca, −negra; 1 P … 6 R) → su tipo y bando. */
export function tipoDeValor(v: number): { tipo: TipoPieza; bando: 0 | 1 } | null {
    if (!v) return null;
    const orden: TipoPieza[] = ["p", "n", "b", "r", "q", "k"];
    const tipo = orden[Math.abs(v) - 1];
    if (!tipo) return null;
    return { tipo, bando: v > 0 ? 0 : 1 };
}

/** «torre blanca», «peón negro»… con el género bien puesto. */
export function describirPieza(tipo: TipoPieza, bando: 0 | 1): string {
    const femenino = tipo === "r" || tipo === "q";
    const color = bando === 0 ? (femenino ? "blanca" : "blanco") : femenino ? "negra" : "negro";
    return `${NOMBRE_PIEZA[tipo]} ${color}`;
}
