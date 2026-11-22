/**
 * EVALUACIÓN 2:4 SPARSE + spbitnet EN NEURONA NVIDIA — LABORATORIO
 * Antes de pagar una GPU en la nube se miden perplejidad y tokens por segundo
 * en la MISMA neurona y con el MISMO corpus. Módulo puro y determinista: no
 * hace red ni lee reloj o disco; recibe las mediciones y explica el veredicto.
 * La perplejidad de partida del motor actual es 5,38; sin medición no se
 * invierte («medir-mas»).
 */

/** Perplejidad medida del motor BitNet 1.58-bit actual (referencia). */
export const PERPLEJIDAD_BASE = 5.38;

export interface MedicionMotor {
    /** Perplejidad en el corpus; null si aún no se midió. */
    perplejidad: number | null;
    /** Throughput sostenido en tokens por segundo; null si no se midió. */
    tokensPorSegundo: number | null;
    /** Alquiler de la GPU en USD por hora; 0 cuando corre en local. */
    costoHoraUsd: number;
}

export interface UmbralesInversion {
    /** Ganancia mínima de throughput (×) para que compense. */
    gananciaMinima: number;
    /** Pérdida máxima de perplejidad aceptada, en porcentaje sobre la base. */
    perdidaMaximaPct: number;
    /** Coste máximo aceptable por millón de tokens, en USD. */
    costoMaximoPorMillonUsd: number;
}

export const UMBRALES_INVERSION: UmbralesInversion = {
    gananciaMinima: 1.5,
    perdidaMaximaPct: 5,
    costoMaximoPorMillonUsd: 1,
};

export type VeredictoInversion = "invertir" | "no-invertir" | "medir-mas";

export interface EvaluacionSparse2_4 {
    veredicto: VeredictoInversion;
    /** Throughput candidato ÷ referencia; null si no se puede calcular. */
    gananciaThroughput: number | null;
    /** Variación de perplejidad sobre la referencia, en porcentaje. */
    perdidaPerplejidadPct: number | null;
    /** Coste del candidato por millón de tokens, en USD. */
    costoPorMillonTokensUsd: number | null;
    /** Tiempo ahorrado con la ganancia, en porcentaje (0–100). */
    ahorroTiempoPct: number | null;
    /** Explicación en español de cada motivo del veredicto. */
    motivos: string[];
}

const esPositivo = (n: number | null): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > 0;

const formatear = (n: number, decimales = 2): string =>
    n.toFixed(decimales).replace(".", ",");

/** Compara el motor actual con el candidato 2:4 sparse + spbitnet. */
export function evaluarSparse2_4(
    referencia: MedicionMotor,
    candidato: MedicionMotor,
    umbrales: Partial<UmbralesInversion> = {},
): EvaluacionSparse2_4 {
    const u: UmbralesInversion = { ...UMBRALES_INVERSION, ...umbrales };
    const faltan: string[] = [];
    if (!esPositivo(referencia.perplejidad)) faltan.push("la perplejidad de referencia");
    if (!esPositivo(candidato.perplejidad)) faltan.push("la perplejidad del candidato 2:4");
    if (!esPositivo(referencia.tokensPorSegundo)) faltan.push("el throughput de referencia");
    if (!esPositivo(candidato.tokensPorSegundo)) faltan.push("el throughput del candidato 2:4");

    const ganancia = esPositivo(referencia.tokensPorSegundo) && esPositivo(candidato.tokensPorSegundo)
        ? candidato.tokensPorSegundo / referencia.tokensPorSegundo : null;
    const perdida = esPositivo(referencia.perplejidad) && esPositivo(candidato.perplejidad)
        ? ((candidato.perplejidad - referencia.perplejidad) / referencia.perplejidad) * 100 : null;
    const costo = esPositivo(candidato.tokensPorSegundo) && Number.isFinite(candidato.costoHoraUsd) && candidato.costoHoraUsd >= 0
        ? (candidato.costoHoraUsd / (candidato.tokensPorSegundo * 3600)) * 1_000_000 : null;
    const ahorro = ganancia !== null ? (1 - 1 / ganancia) * 100 : null;
    const base = {
        gananciaThroughput: ganancia,
        perdidaPerplejidadPct: perdida,
        costoPorMillonTokensUsd: costo,
        ahorroTiempoPct: ahorro,
    };

    if (faltan.length > 0 || ganancia === null || perdida === null || costo === null) {
        return { ...base, veredicto: "medir-mas",
            motivos: [`Falta ${faltan.join(", ")}: no se invierte en GPU cloud a ciegas.`] };
    }

    const fallos: string[] = [];
    if (ganancia < u.gananciaMinima) fallos.push(`la ganancia de throughput (${formatear(ganancia)}×) no llega al mínimo (${formatear(u.gananciaMinima)}×)`);
    if (perdida > u.perdidaMaximaPct) fallos.push(`la perplejidad empeora ${formatear(perdida, 1)} % (techo ${formatear(u.perdidaMaximaPct, 1)} %)`);
    if (costo > u.costoMaximoPorMillonUsd) fallos.push(`el coste por millón de tokens (${formatear(costo)} USD) supera el techo (${formatear(u.costoMaximoPorMillonUsd)} USD)`);

    if (fallos.length > 0) {
        return { ...base, veredicto: "no-invertir", motivos: fallos.map((fallo) => `No compensa: ${fallo}.`) };
    }
    return { ...base, veredicto: "invertir",
        motivos: [`Compensa: ${formatear(ganancia)}× de throughput (${formatear(ahorro ?? 0, 1)} % menos de tiempo) con ${formatear(perdida, 1)} % de perplejidad y ${formatear(costo)} USD por millón de tokens.`] };
}
