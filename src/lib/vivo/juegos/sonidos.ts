/**
 * Sonidos del juego con WebAudio: tonos sintetizados, sin archivos. SILENCIADOS por defecto y la
 * preferencia se recuerda en este navegador (nunca se sincroniza: el sonido es de cada persona).
 * Nada suena hasta que la persona lo activa con un gesto (política de autoplay de los navegadores).
 */

export type NombreSonido = "ficha" | "captura" | "jaque" | "turno" | "acierto" | "victoria" | "derrota" | "tablas" | "tic";

const CLAVE = "starseed.juego.sonido";

interface Nota {
    f: number;
    d: number;
    a?: number;
    tipo?: OscillatorType;
    en?: number;
}

const PARTITURAS: Record<NombreSonido, Nota[]> = {
    ficha: [{ f: 440, d: 0.07, a: 0.16, tipo: "triangle" }],
    captura: [{ f: 220, d: 0.09, a: 0.2, tipo: "triangle" }, { f: 165, d: 0.12, a: 0.16, tipo: "triangle", en: 0.05 }],
    jaque: [{ f: 660, d: 0.09, a: 0.16, tipo: "square" }, { f: 880, d: 0.12, a: 0.14, tipo: "square", en: 0.09 }],
    turno: [{ f: 587, d: 0.08, a: 0.1, tipo: "sine" }, { f: 784, d: 0.1, a: 0.1, tipo: "sine", en: 0.08 }],
    acierto: [{ f: 523, d: 0.09, a: 0.16 }, { f: 659, d: 0.09, a: 0.16, en: 0.09 }, { f: 784, d: 0.16, a: 0.16, en: 0.18 }],
    victoria: [
        { f: 523, d: 0.12, a: 0.18 },
        { f: 659, d: 0.12, a: 0.18, en: 0.12 },
        { f: 784, d: 0.12, a: 0.18, en: 0.24 },
        { f: 1047, d: 0.3, a: 0.18, en: 0.36 },
    ],
    derrota: [{ f: 392, d: 0.16, a: 0.16, tipo: "triangle" }, { f: 311, d: 0.16, a: 0.16, tipo: "triangle", en: 0.16 }, { f: 262, d: 0.3, a: 0.16, tipo: "triangle", en: 0.32 }],
    tablas: [{ f: 440, d: 0.14, a: 0.13, tipo: "sine" }, { f: 440, d: 0.2, a: 0.13, tipo: "sine", en: 0.18 }],
    tic: [{ f: 1200, d: 0.03, a: 0.08, tipo: "square" }],
};

type ContextoAudio = AudioContext;

function crearContexto(): ContextoAudio | null {
    try {
        const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const C = g.AudioContext ?? g.webkitAudioContext;
        return C ? new C() : null;
    } catch {
        return null;
    }
}

export function leerPreferenciaSonido(): boolean {
    try {
        return globalThis.localStorage?.getItem(CLAVE) === "on";
    } catch {
        return false;
    }
}

export function guardarPreferenciaSonido(activo: boolean): void {
    try {
        globalThis.localStorage?.setItem(CLAVE, activo ? "on" : "off");
    } catch {
        /* sin almacenamiento: vale, solo no se recuerda */
    }
}

export interface Sonidos {
    activo(): boolean;
    /** Activa o silencia. Activar debe llamarse desde un gesto (un clic). */
    fijar(activo: boolean): void;
    tocar(nombre: NombreSonido): void;
    cerrar(): void;
}

export function crearSonidos(inicial = false): Sonidos {
    let activo = inicial;
    let ctx: ContextoAudio | null = null;

    const asegurar = (): ContextoAudio | null => {
        if (!ctx) ctx = crearContexto();
        if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
        return ctx;
    };

    return {
        activo: () => activo,
        fijar(v) {
            activo = v;
            guardarPreferenciaSonido(v);
            if (v) asegurar();
        },
        tocar(nombre) {
            if (!activo) return;
            const c = asegurar();
            if (!c) return;
            try {
                const t0 = c.currentTime;
                for (const n of PARTITURAS[nombre]) {
                    const o = c.createOscillator();
                    const g = c.createGain();
                    const inicio = t0 + (n.en ?? 0);
                    o.type = n.tipo ?? "sine";
                    o.frequency.setValueAtTime(n.f, inicio);
                    g.gain.setValueAtTime(0.0001, inicio);
                    g.gain.exponentialRampToValueAtTime(n.a ?? 0.15, inicio + 0.012);
                    g.gain.exponentialRampToValueAtTime(0.0001, inicio + n.d);
                    o.connect(g);
                    g.connect(c.destination);
                    o.start(inicio);
                    o.stop(inicio + n.d + 0.02);
                }
            } catch {
                /* un fallo de audio nunca rompe la partida */
            }
        },
        cerrar() {
            try {
                void ctx?.close();
            } catch {
                /* noop */
            }
            ctx = null;
        },
    };
}
