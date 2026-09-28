"use client";

/**
 * Tonos de llamada sintetizados con WebAudio (sin archivos de audio).
 *
 *  · «entrante»: dos notas suaves en seno (re–la) con envolvente, cada 2,6 s. Cálido, no
 *    estridente; volumen bajo.
 *  · «saliente»: una nota tenue cada 3,4 s mientras esperas a que alguien conteste.
 *
 * Los navegadores pueden bloquear el audio sin un gesto previo en la página: en ese caso el
 * tono no suena (la tarjeta del timbre sigue a la vista) y no se insiste.
 */

type Patron = "entrante" | "saliente";

interface Nota {
    frecuencia: number;
    inicio: number;
    duracion: number;
    volumen: number;
}

const PATRONES: Record<Patron, { periodoMs: number; notas: Nota[] }> = {
    entrante: {
        periodoMs: 2600,
        notas: [
            { frecuencia: 587.33, inicio: 0, duracion: 0.42, volumen: 0.11 },
            { frecuencia: 880, inicio: 0.36, duracion: 0.62, volumen: 0.09 },
            { frecuencia: 587.33, inicio: 1.1, duracion: 0.36, volumen: 0.07 },
        ],
    },
    saliente: {
        periodoMs: 3400,
        notas: [{ frecuencia: 523.25, inicio: 0, duracion: 1.0, volumen: 0.045 }],
    },
};

export interface Tono {
    iniciar(): void;
    parar(): void;
}

export function crearTono(patron: Patron): Tono {
    let ctx: AudioContext | null = null;
    let temporizador: ReturnType<typeof setInterval> | null = null;

    const tocar = () => {
        if (!ctx) return;
        const t0 = ctx.currentTime + 0.05;
        for (const n of PATRONES[patron].notas) {
            try {
                const osc = ctx.createOscillator();
                const gan = ctx.createGain();
                osc.type = "sine";
                osc.frequency.value = n.frecuencia;
                const ini = t0 + n.inicio;
                gan.gain.setValueAtTime(0, ini);
                gan.gain.linearRampToValueAtTime(n.volumen, ini + 0.04);
                gan.gain.exponentialRampToValueAtTime(0.0001, ini + n.duracion);
                osc.connect(gan).connect(ctx.destination);
                osc.start(ini);
                osc.stop(ini + n.duracion + 0.05);
            } catch {
                /* contexto cerrado */
            }
        }
    };

    return {
        iniciar() {
            if (temporizador || typeof window === "undefined") return;
            const C = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!C) return;
            try {
                ctx = new C();
                if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
            } catch {
                ctx = null;
                return;
            }
            tocar();
            temporizador = setInterval(tocar, PATRONES[patron].periodoMs);
        },
        parar() {
            if (temporizador) clearInterval(temporizador);
            temporizador = null;
            const c = ctx;
            ctx = null;
            try {
                void c?.close().catch(() => undefined);
            } catch {
                /* noop */
            }
        },
    };
}

/** Vibración suave en móviles (si el navegador la permite). */
export function vibrar(patron: number[] = [180, 120, 180]): void {
    try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(patron);
    } catch {
        /* sin vibración */
    }
}
