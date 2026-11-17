/**
 * CTL1117C · FALLO 1 · el control con StarSeed OS DETRÁS (la persona pulsó Inicio en la tableta).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Qué pasó (prueba 49): con la app detrás, la página de la tableta iba a ratos: órdenes con ~30 s de retraso, la imagen
 * congelada («Sin pantalla»), el espejo del registro parado. Todo lo que hace la pantalla remota vive en la página (WebView):
 * el bucle que pide cuadros a Rust, el lienzo que los pinta, el latido que repite el último cuadro y las esperas del bucle.
 * Con la actividad en `onPause`/`onStop`, `WryActivity` llama a `mWebView.onPause()` y el WebView oculta la página: sus
 * temporizadores se alinean a 1 s (y, pasados unos minutos oculta, a 1 minuto). Lo nativo lo contrarresta (`ControlFondo` en
 * ControlNeuronasStarSeed.kt: solo con sesión viva reanuda el WebView y su renderizador); esto es la segunda red: los relojes
 * de la pantalla remota (esperas del bucle y latido de cuadros) corren con el Worker de `reloj-estable` (el de las llamadas,
 * probado en campo), que la página oculta no alinea.
 *
 * Este vigía es solo DIAGNÓSTICO y solo existe mientras hay pantalla remota (es decir, sesión): mide, no arregla. Una línea
 * `control-fondo …` (mismo formato `clave=valor` que las `control-*`) cuando la página pasa a segundo plano, otra cada
 * ~10 s mientras dura y otra al volver. Rust le suma lo nativo (si Kotlin cree que está detrás y qué medida aplica).
 *  · estado       visible | oculta (document.visibilityState)
 *  · deriva-ms    el mayor retraso de la vuelta del reloj de 1 s en el periodo (0 = puntual)
 *  · reloj        worker | pagina (quién sostiene el ritmo)
 *  · producidos   cuadros nuevos que Rust dio a la página en el periodo
 *  · enviados     cuadros pintados y entregados a la pista de vídeo
 *  · latidos      repeticiones del último cuadro (señal de vida con la pantalla quieta)
 *  · ordenes      órdenes cumplidas por la puerta en el periodo
 */

import type { RelojEstable } from "@/lib/llamadas/reloj-estable";

export const PERIODO_VIGIA_MS = 1000;
export const LINEA_CADA_MS = 10_000;

export interface MedidasFondo {
    producidos(): number;
    enviados(): number;
    latidos(): number;
    ordenes(): number;
}

export interface DepsVigia {
    reloj: Pick<RelojEstable, "cada" | "estado">;
    /** Escribe la línea (sin el prefijo `control-fondo`). */
    nota: (detalle: string) => void;
    visibilidad?: () => string;
    ahora?: () => number;
}

export class VigiaFondo {
    private quitar: (() => void) | null = null;
    private medidas: MedidasFondo | null = null;
    private ultimaVuelta = 0;
    private derivaMax = 0;
    private oculta = false;
    private ultimaLinea = 0;
    private base = { p: 0, e: 0, l: 0, o: 0 };
    private readonly ahora: () => number;

    constructor(private readonly d: DepsVigia) {
        this.ahora = d.ahora ?? (() => Date.now());
    }

    get activo(): boolean {
        return this.quitar !== null;
    }

    /** Empieza con la pantalla remota. Idempotente. */
    arrancar(m: MedidasFondo): void {
        this.parar();
        this.medidas = m;
        const t = this.ahora();
        this.ultimaVuelta = t;
        this.ultimaLinea = t;
        this.derivaMax = 0;
        this.oculta = this.visibilidad() !== "visible";
        this.base = this.leer();
        this.quitar = this.d.reloj.cada(() => this.vuelta(), PERIODO_VIGIA_MS);
        if (this.oculta) this.linea("inicio-fondo");
    }

    parar(): void {
        const q = this.quitar;
        this.quitar = null;
        this.medidas = null;
        try {
            q?.();
        } catch {
            /* nada */
        }
    }

    private visibilidad(): string {
        try {
            if (this.d.visibilidad) return this.d.visibilidad();
            return typeof document !== "undefined" ? document.visibilityState : "visible";
        } catch {
            return "visible";
        }
    }

    private leer(): { p: number; e: number; l: number; o: number } {
        const m = this.medidas;
        if (!m) return { p: 0, e: 0, l: 0, o: 0 };
        const n = (f: () => number) => {
            try {
                return Math.max(0, Math.floor(f()));
            } catch {
                return 0;
            }
        };
        return { p: n(m.producidos), e: n(m.enviados), l: n(m.latidos), o: n(m.ordenes) };
    }

    private vuelta(): void {
        if (!this.quitar) return;
        const t = this.ahora();
        this.derivaMax = Math.max(this.derivaMax, Math.max(0, t - this.ultimaVuelta - PERIODO_VIGIA_MS));
        this.ultimaVuelta = t;
        const oculta = this.visibilidad() !== "visible";
        if (oculta !== this.oculta) {
            this.oculta = oculta;
            this.linea(oculta ? "inicio-fondo" : "vuelta-al-frente");
            return;
        }
        if (oculta && t - this.ultimaLinea >= LINEA_CADA_MS) this.linea("sigue-en-fondo");
    }

    private linea(que: string): void {
        const t = this.ahora();
        const x = this.leer();
        const b = this.base;
        const periodo = Math.max(0, t - this.ultimaLinea);
        let reloj = "pagina";
        try {
            reloj = this.d.reloj.estado().conWorker ? "worker" : "pagina";
        } catch {
            /* nada */
        }
        const texto =
            `${que} estado=${this.oculta ? "oculta" : "visible"} deriva-ms=${Math.round(this.derivaMax)} reloj=${reloj} periodo-ms=${periodo}` +
            ` producidos=${Math.max(0, x.p - b.p)} enviados=${Math.max(0, x.e - b.e)} latidos=${Math.max(0, x.l - b.l)} ordenes=${Math.max(0, x.o - b.o)}`;
        this.base = x;
        this.ultimaLinea = t;
        this.derivaMax = 0;
        try {
            this.d.nota(texto);
        } catch {
            /* el diagnóstico nunca rompe la pantalla */
        }
    }
}

/** Una espera que corre con el reloj estable (el Worker), no con el `setTimeout` de la página oculta. */
export function esperarCon(reloj: { cada(fn: () => void, ms: number): () => void }, ms: number): Promise<void> {
    return new Promise<void>((resolver) => {
        let hecho = false;
        let quitar: (() => void) | null = null;
        quitar = reloj.cada(() => {
            if (hecho) return;
            hecho = true;
            try {
                quitar?.();
            } catch {
                /* nada */
            }
            resolver();
        }, Math.max(1, Math.floor(ms)));
    });
}
