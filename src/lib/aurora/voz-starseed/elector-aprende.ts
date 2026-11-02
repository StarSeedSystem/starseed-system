/**
 * ELECTOR DE VOZ QUE APRENDE — de lo medido y del 👍/👎 (Ola 1018V · N).
 * Ordena motores POR NEURONA con lo medido (latencia y errores, `aurora/medidas-voz.ts`)
 * y el pulgar de cada respuesta hablada. Contrato: architecture/voz-voicestudio.md §4.
 * Olvido exponencial (mitad del peso cada 7 días); 5 medidas como mínimo para cambiar el
 * orden, lo demás «sin medir»; la licencia ya la resuelve quien llama; pura, sin reloj.
 */

export const VIDA_MEDIA_MS = 7 * 24 * 60 * 60 * 1000; // la mitad del peso cada 7 días
export const MEDIDAS_MINIMAS = 5; // medidas que un motor necesita para cambiar el orden
export const PENALIZACION_ERROR_MS = 500; // por error ponderado: un motor que falla ya no es rápido
export const GANANCIA_VOTO_MS = 150; // por unidad de voto ponderado: el pulgar de la persona manda

/** Una medida ya lista para el elector (nace de `medidas-voz.ts` y la malla). */
export interface MedidaElector {
    motor: string;
    neurona: string;
    latenciaPrimeraFraseMs: number; // ms del pedido al primer sonido
    errores: number; // errores del tramo
    t: number; // ms de época
}

/** Un pulgar de una respuesta hablada (👍 = 1, 👎 = -1). */
export interface VotoVoz {
    motor: string;
    voto: 1 | -1;
    t: number;
}

/** Un motor puntuado: número con medidas bastantes; «sin medir» si no. */
export interface MotorPuntuado {
    motor: string;
    puntuacion: number | null; // menor es mejor; null mientras falten medidas
    medidas: number;
    estado: "medido" | "sin-medir";
}

export type OrdenPorNeurona = Record<string, MotorPuntuado[]>; // cada lista: del mejor al peor

/** Peso de una medida o un voto con esa edad: la mitad cada 7 días. */
export function pesoDeOlvido(edadMs: number): number {
    if (!Number.isFinite(edadMs) || edadMs <= 0) return 1;
    return Math.pow(0.5, edadMs / VIDA_MEDIA_MS);
}
/** Lo que se acumula de un mismo motor en la misma neurona. */
interface Grupo {
    neurona: string;
    motor: string;
    numLat: number; // suma ponderada de latencias y de sus pesos: la media con olvido
    den: number;
    errPond: number; // errores con la misma vida media
    n: number; // cuántas medidas hay, sin importar el peso
    orden: number; // primera aparición, para no reordenar lo no medido
}
/** Puntuación de un grupo, o null si aún no alcanza el mínimo. */
function puntuar(g: Grupo, voto: number): number | null {
    if (g.n < MEDIDAS_MINIMAS || g.den <= 0) return null;
    return g.numLat / g.den + g.errPond * PENALIZACION_ERROR_MS - voto * GANANCIA_VOTO_MS;
}
/** Orden dentro de una neurona: medidos por puntuación; sin medir, como estaban. */
function comparar(a: MotorPuntuado, b: MotorPuntuado): number {
    if (a.estado === "medido" && b.estado === "medido") return (a.puntuacion ?? 0) - (b.puntuacion ?? 0);
    if (a.estado !== b.estado) return a.estado === "medido" ? -1 : 1;
    return 0; // el sort de JS es estable: conservan el orden de entrada
}
/** Votos ponderados por motor (el pulgar es de la persona, sin importar la neurona). */
function votosPonderados(votos: readonly VotoVoz[] | null | undefined, ahora: number): Map<string, number> {
    const out = new Map<string, number>();
    for (const v of votos ?? []) {
        if (!v || typeof v.motor !== "string" || v.motor.trim() === "") continue;
        if ((v.voto !== 1 && v.voto !== -1) || !Number.isFinite(v.t) || v.t > ahora) continue;
        out.set(v.motor.trim(), (out.get(v.motor.trim()) ?? 0) + v.voto * pesoDeOlvido(Math.max(0, ahora - v.t)));
    }
    return out;
}
/** Una medida bien formada (o null): sin horas futuras ni números imposibles. */
function medidaValida(m: unknown, ahora: number): MedidaElector | null {
    if (!m || typeof m !== "object") return null;
    const r = m as Partial<MedidaElector>;
    const textoOk = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";
    const lat = r.latenciaPrimeraFraseMs;
    if (!textoOk(r.motor) || !textoOk(r.neurona) || typeof lat !== "number" || !Number.isFinite(lat) || lat < 0
        || typeof r.t !== "number" || !Number.isFinite(r.t) || r.t > ahora) return null;
    const errores = typeof r.errores === "number" && Number.isFinite(r.errores) && r.errores >= 0 ? r.errores : 0;
    return { motor: r.motor.trim(), neurona: r.neurona.trim(), latenciaPrimeraFraseMs: lat, errores, t: r.t };
}
/** puntuarMotores — orden de motores por neurona con lo medido y lo votado:
 *  `{ [neurona]: MotorPuntuado[] }`, medidos primero (menor es mejor); nada lanza. */
export function puntuarMotores(
    medidas?: readonly MedidaElector[] | null,
    votos?: readonly VotoVoz[] | null,
    ahora?: number,
): OrdenPorNeurona {
    if (typeof ahora !== "number" || !Number.isFinite(ahora)) return {};
    const votosDe = votosPonderados(votos, ahora);
    const grupos = new Map<string, Grupo>();
    let orden = 0;
    for (const cruda of medidas ?? []) {
        const m = medidaValida(cruda, ahora);
        if (!m) continue;
        const clave = `${m.neurona}\u0000${m.motor}`;
        const peso = pesoDeOlvido(Math.max(0, ahora - m.t));
        const g = grupos.get(clave);
        if (g) {
            g.numLat += peso * m.latenciaPrimeraFraseMs;
            g.den += peso;
            g.errPond += peso * m.errores;
            g.n += 1;
        } else {
            grupos.set(clave, { neurona: m.neurona, motor: m.motor, numLat: peso * m.latenciaPrimeraFraseMs, den: peso, errPond: peso * m.errores, n: 1, orden: orden++ });
        }
    }
    const salida: OrdenPorNeurona = {};
    for (const g of [...grupos.values()].sort((a, b) => a.orden - b.orden)) {
        const p = puntuar(g, votosDe.get(g.motor) ?? 0);
        (salida[g.neurona] ??= []).push({ motor: g.motor, puntuacion: p, medidas: g.n, estado: p === null ? "sin-medir" : "medido" });
    }
    for (const lista of Object.values(salida)) lista.sort(comparar);
    return salida;
}
