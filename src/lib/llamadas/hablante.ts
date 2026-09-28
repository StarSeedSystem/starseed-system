/**
 * Hablante activo — lógica PURA. El motor mide el volumen de cada voz con un `AnalyserNode`
 * (datos en el dominio del tiempo, 0..255 con el silencio en 128) y aquí se decide quién
 * habla, con histéresis para que el foco no salte de persona en persona con cada tos.
 */

/** Volumen RMS normalizado (0..1) de una trama de `getByteTimeDomainData`. */
export function nivelRms(datos: ArrayLike<number>): number {
    const n = datos.length;
    if (!n) return 0;
    let suma = 0;
    for (let i = 0; i < n; i++) {
        const v = (datos[i] - 128) / 128;
        suma += v * v;
    }
    return Math.min(1, Math.sqrt(suma / n));
}

/** Suavizado exponencial (ataque rápido, caída lenta: la voz «enciende» ya y se apaga suave). */
export function suavizarNivel(previo: number, nuevo: number, ataque = 0.6, caida = 0.2): number {
    const a = nuevo > previo ? ataque : caida;
    const v = previo + (nuevo - previo) * a;
    return v < 0.001 ? 0 : Math.min(1, v);
}

export interface HablanteVigente {
    id: string;
    /** Epoch ms desde que es el hablante. */
    desde: number;
}

export interface OpcionesHablante {
    /** Por debajo de esto es silencio. */
    umbral?: number;
    /** El vigente se mantiene al menos esto (ms). */
    permanenciaMs?: number;
    /** Un aspirante debe superar al vigente por este factor para quitarle el foco. */
    margen?: number;
}

/**
 * Elige el hablante activo. Reglas:
 *  1. Sin nadie por encima del umbral: se conserva el vigente durante `permanenciaMs` (las
 *     pausas entre frases no apagan el foco) y después nadie.
 *  2. El más alto por encima del umbral es el aspirante.
 *  3. El vigente se conserva si sigue hablando y el aspirante no le supera por `margen`, o si
 *     aún no han pasado `permanenciaMs`.
 */
export function elegirHablante(
    niveles: Record<string, number>,
    vigente: HablanteVigente | null,
    ahora: number,
    opciones: OpcionesHablante = {},
): HablanteVigente | null {
    const umbral = opciones.umbral ?? 0.04;
    const permanencia = opciones.permanenciaMs ?? 900;
    const margen = opciones.margen ?? 1.3;

    let aspirante: string | null = null;
    let max = 0;
    for (const [id, nivel] of Object.entries(niveles)) {
        if (nivel >= umbral && nivel > max) {
            max = nivel;
            aspirante = id;
        }
    }

    const vigenteSigue = vigente && vigente.id in niveles;
    if (!aspirante) {
        if (vigenteSigue && ahora - vigente!.desde < permanencia) return vigente;
        return null;
    }
    if (!vigenteSigue) return { id: aspirante, desde: ahora };
    if (aspirante === vigente!.id) return vigente;

    const nivelVigente = niveles[vigente!.id] ?? 0;
    const dentroDePermanencia = ahora - vigente!.desde < permanencia;
    if (dentroDePermanencia) return vigente;
    if (nivelVigente >= umbral && max < nivelVigente * margen) return vigente;
    return { id: aspirante, desde: ahora };
}
