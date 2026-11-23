/**
 * VEN1115L · de punteros a dedos. Sin React ni DOM: recibe puntos 0..1 de la pantalla del aparato y emite
 * `gesto` (puntos por dedo, `sigue:true` mientras haya dedos apoyados, uno final con `sigue:false`).
 * Los puntos se juntan por fotograma (como mucho ~60 órdenes por segundo, contrato §2.4).
 *
 * UNI1115M · costura f: cuando un dedo se levanta habiendo otros apoyados, se manda su último punto y a continuación
 * un `gesto` con `sigue:true` que NO nombra el dedo levantado: lo nativo lo suelta al instante y los demás siguen abajo.
 * Por eso cada `gesto` con `sigue:true` nombra TODOS los dedos apoyados (el que no se movió repite su punto, dt 0).
 */
import type { EntradaControl } from "./tipos";

type Punto3 = [number, number, number];

interface Dedo {
    id: number;
    x: number;
    y: number;
    t: number;
    pend: Punto3[];
}

export interface DepsGestor {
    enviar: (e: Extract<EntradaControl, { tipo: "gesto" }>) => void;
    ahora: () => number;
    /** Pide un fotograma (requestAnimationFrame); devuelve cómo cancelarlo. */
    fotograma: (f: () => void) => () => void;
    esperar: (f: () => void, ms: number) => () => void;
    maxDedos: () => number;
}

const INTERVALO_MIN_MS = 16;
const SILENCIO_RUEDA_MS = 140;
const SILENCIO_RUEDA_TACTIL_MS = 180;
const SEPARACION_INICIAL = 0.2;
const SEPARACION_MIN = 0.04;
const SEPARACION_MAX = 0.8;
const BORDE = 0.01;
const BORDE_TACTIL = 0.08;
const UMBRAL_RUEDA_TACTIL = 0.035;
const DT_RUEDA_TACTIL_MS = 48;
export const CLAVE_RUEDA = "rueda";
export const CLAVE_RUEDA_DOS = ["rueda-dos-a", "rueda-dos-b"] as const;
export const CLAVE_PELLIZCO = ["pellizco-a", "pellizco-b"] as const;

const acotar = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export class GestorToque {
    private dedos = new Map<string, Dedo>();
    private cancelarFotograma: (() => void) | null = null;
    private cancelarSilencio: (() => void) | null = null;
    private ultimoEnvio = -Infinity;
    private centro: [number, number] = [0.5, 0.5];
    private separacion = SEPARACION_INICIAL;
    private grupoRueda: "pellizco" | "desplazar" | "desplazar-dos" | null = null;
    private acumRuedaTactil: { dx: number; dy: number } = { dx: 0, dy: 0 };

    constructor(private readonly d: DepsGestor) {}

    hayDedos(): boolean {
        return this.dedos.size > 0;
    }

    private hueco(): number | null {
        const usados = new Set([...this.dedos.values()].map((f) => f.id));
        const tope = Math.max(0, Math.min(10, Math.floor(this.d.maxDedos())));
        for (let i = 0; i < tope; i++) if (!usados.has(i)) return i;
        return null;
    }

    abajo(clave: string, x: number, y: number): boolean {
        if (this.dedos.has(clave)) return false;
        const id = this.hueco();
        if (id === null) return false;
        const t = this.d.ahora();
        this.dedos.set(clave, { id, x, y, t, pend: [[x, y, 0]] });
        this.programar();
        return true;
    }

    mover(clave: string, x: number, y: number, minDtMs = 0): void {
        const f = this.dedos.get(clave);
        if (!f) return;
        const t = this.d.ahora();
        const dt = Math.max(minDtMs, Math.round(t - f.t));
        f.pend.push([x, y, dt]);
        f.x = x;
        f.y = y;
        f.t = t;
        this.programar();
    }

    /** Levanta un dedo (con su punto final si se da). Cierra el gesto con `sigue:false`. */
    levantar(clave: string, x?: number, y?: number): void {
        const f = this.dedos.get(clave);
        if (!f) return;
        if (x !== undefined && y !== undefined && (x !== f.x || y !== f.y)) this.mover(clave, x, y);
        this.cerrar([clave]);
    }

    /** Puntero perdido, cancelado, desenfoque o cierre: todos los dedos se levantan donde estaban. */
    terminarTodo(): void {
        this.cancelarSilencio?.();
        this.cancelarSilencio = null;
        this.grupoRueda = null;
        this.acumRuedaTactil = { dx: 0, dy: 0 };
        this.cerrar([...this.dedos.keys()]);
    }

    /** Pellizco de trackpad (Ctrl + rueda): dos dedos alrededor del puntero; `deltaY` en píxeles de rueda. */
    pellizcar(x: number, y: number, deltaY: number): void {
        if (this.grupoRueda === "desplazar") this.levantar(CLAVE_RUEDA);
        if (this.grupoRueda === "desplazar-dos") this.cerrar(CLAVE_RUEDA_DOS.filter((k) => this.dedos.has(k)));
        if (this.grupoRueda !== "pellizco") {
            this.centro = [x, y];
            this.separacion = SEPARACION_INICIAL;
            const a = this.abajo(CLAVE_PELLIZCO[0], 0, 0);
            const b = a ? this.abajo(CLAVE_PELLIZCO[1], 0, 0) : false;
            if (!a || !b) {
                for (const k of CLAVE_PELLIZCO) this.dedos.delete(k); // sin dos dedos libres no hay pellizco; nada se envió
                return;
            }
            this.grupoRueda = "pellizco";
            this.colocarPellizco(false);
        }
        this.separacion = Math.min(SEPARACION_MAX, Math.max(SEPARACION_MIN, this.separacion * Math.exp(-deltaY * 0.02)));
        this.colocarPellizco(true);
        this.esperarSilencio(() => this.cerrar(CLAVE_PELLIZCO.filter((k) => this.dedos.has(k))));
    }

    private colocarPellizco(mover: boolean): void {
        const [cx, cy] = this.centro;
        const m = Math.min(this.separacion / 2, cx, 1 - cx);
        const pos: [number, number][] = [[cx - m, cy], [cx + m, cy]];
        CLAVE_PELLIZCO.forEach((k, i) => {
            const f = this.dedos.get(k);
            if (!f) return;
            if (mover) this.mover(k, pos[i][0], pos[i][1]);
            else { f.x = pos[i][0]; f.y = pos[i][1]; f.pend = [[f.x, f.y, 0]]; }
        });
    }

    /** Clic derecho en escritorio controlado: dos dedos quietos en el punto (sin arrastre) para abrir menú contextual. */
    clicDerecho(x: number, y: number): boolean {
        if (this.grupoRueda === "pellizco") this.cerrar(CLAVE_PELLIZCO.filter((k) => this.dedos.has(k)));
        if (this.grupoRueda === "desplazar") this.levantar(CLAVE_RUEDA);
        if (this.grupoRueda === "desplazar-dos") this.cerrar(CLAVE_RUEDA_DOS.filter((k) => this.dedos.has(k)));
        const px = acotar(x);
        const py = acotar(y);
        const sep = Math.min(0.03, px, 1 - px);
        const idA = this.hueco();
        if (idA === null) return false;
        const t = this.d.ahora();
        this.dedos.set("__clic_der__", { id: idA, x: acotar(px - sep), y: py, t, pend: [[acotar(px - sep), py, 0]] });
        const idB = this.hueco();
        this.dedos.delete("__clic_der__");
        if (idB === null) return false;
        this.ultimoEnvio = t;
        this.d.enviar({
            tipo: "gesto",
            dedos: [
                { id: idA, puntos: [[acotar(px - sep), py, 0]] },
                { id: idB, puntos: [[acotar(px + sep), py, 0]] },
            ],
            sigue: false,
        });
        return true;
    }

    /**
     * Rueda sin Ctrl:
     * · `dosDedos = true` (escritorio): 2 dedos paralelos que se desplazan para hacer rueda natural (sin seleccionar elementos).
     * · `dosDedos = false` (táctil/Android): acumula pasos pequeños por encima del umbral táctil antes de tocar, y traza suavemente.
     */
    desplazar(x: number, y: number, dx: number, dy: number, dosDedos = false): void {
        if (this.grupoRueda === "pellizco") this.cerrar(CLAVE_PELLIZCO.filter((k) => this.dedos.has(k)));
        if (dosDedos) {
            if (this.grupoRueda === "desplazar") this.levantar(CLAVE_RUEDA);
            if (!this.dedos.has(CLAVE_RUEDA_DOS[0])) {
                const px = acotar(x);
                const py = acotar(y);
                const sep = Math.min(0.03, px, 1 - px);
                const a = this.abajo(CLAVE_RUEDA_DOS[0], acotar(px - sep), py);
                const b = a ? this.abajo(CLAVE_RUEDA_DOS[1], acotar(px + sep), py) : false;
                if (!a || !b) {
                    for (const k of CLAVE_RUEDA_DOS) this.dedos.delete(k);
                    return;
                }
                this.grupoRueda = "desplazar-dos";
            }
            const fA = this.dedos.get(CLAVE_RUEDA_DOS[0]);
            const fB = this.dedos.get(CLAVE_RUEDA_DOS[1]);
            if (!fA || !fB) return;
            const nxA = acotar(fA.x + dx);
            const nyA = acotar(fA.y + dy);
            const nxB = acotar(fB.x + dx);
            const nyB = acotar(fB.y + dy);
            this.mover(CLAVE_RUEDA_DOS[0], nxA, nyA);
            this.mover(CLAVE_RUEDA_DOS[1], nxB, nyB);
            const alBorde = nyA <= BORDE || nyA >= 1 - BORDE || nxA <= BORDE || nxB >= 1 - BORDE;
            if (alBorde) {
                this.cerrar([...CLAVE_RUEDA_DOS]);
                return;
            }
            this.esperarSilencio(() => this.cerrar([...CLAVE_RUEDA_DOS]), SILENCIO_RUEDA_MS);
            return;
        }
        if (this.grupoRueda === "desplazar-dos") this.cerrar(CLAVE_RUEDA_DOS.filter((k) => this.dedos.has(k)));
        let pasoDx = dx;
        let pasoDy = dy;
        if (!this.dedos.has(CLAVE_RUEDA)) {
            this.acumRuedaTactil.dx += dx;
            this.acumRuedaTactil.dy += dy;
            if (Math.hypot(this.acumRuedaTactil.dx, this.acumRuedaTactil.dy) < UMBRAL_RUEDA_TACTIL) {
                this.esperarSilencio(() => {
                    this.acumRuedaTactil = { dx: 0, dy: 0 };
                }, SILENCIO_RUEDA_TACTIL_MS);
                return;
            }
            pasoDx = this.acumRuedaTactil.dx;
            pasoDy = this.acumRuedaTactil.dy;
            this.acumRuedaTactil = { dx: 0, dy: 0 };
            if (!this.abajo(CLAVE_RUEDA, x, y)) return;
            this.grupoRueda = "desplazar";
        }
        const f = this.dedos.get(CLAVE_RUEDA);
        if (!f) return;
        const nx = acotar(f.x + pasoDx);
        const ny = acotar(f.y + pasoDy);
        this.mover(CLAVE_RUEDA, nx, ny, DT_RUEDA_TACTIL_MS);
        const alBorde = nx <= BORDE_TACTIL || nx >= 1 - BORDE_TACTIL || ny <= BORDE_TACTIL || ny >= 1 - BORDE_TACTIL;
        if (alBorde) {
            this.cerrar([CLAVE_RUEDA]); // el siguiente giro empieza otro trazo en el puntero
            return;
        }
        this.esperarSilencio(() => this.cerrar([CLAVE_RUEDA]), SILENCIO_RUEDA_TACTIL_MS);
    }

    private esperarSilencio(f: () => void, ms = SILENCIO_RUEDA_MS): void {
        this.cancelarSilencio?.();
        this.cancelarSilencio = this.d.esperar(() => {
            this.cancelarSilencio = null;
            f();
        }, ms);
    }

    private programar(): void {
        if (this.cancelarFotograma) return;
        this.cancelarFotograma = this.d.fotograma(() => {
            this.cancelarFotograma = null;
            if (this.d.ahora() - this.ultimoEnvio < INTERVALO_MIN_MS) {
                this.programar();
                return;
            }
            this.vaciar(true);
        });
    }

    /** Emite lo pendiente de todos los dedos apoyados. */
    private vaciar(sigue: boolean): boolean {
        const dedos: { id: number; puntos: Punto3[] }[] = [];
        for (const f of this.dedos.values()) {
            if (f.pend.length) {
                dedos.push({ id: f.id, puntos: f.pend });
                f.pend = [];
            } else {
                dedos.push({ id: f.id, puntos: [[f.x, f.y, 0]] });
            }
        }
        if (!dedos.length) return false;
        this.ultimoEnvio = this.d.ahora();
        this.d.enviar({ tipo: "gesto", dedos, sigue });
        return true;
    }

    /** Levanta las claves dadas: si quedan otros dedos apoyados siguen abajo (`sigue:true` sin el levantado); si no, `sigue:false`. */
    private cerrar(claves: string[]): void {
        const quita = claves.filter((k) => this.dedos.has(k));
        if (!quita.length) return;
        this.cancelarFotograma?.();
        this.cancelarFotograma = null;
        const quedan = this.dedos.size > quita.length;
        this.vaciar(quedan);
        for (const k of quita) this.dedos.delete(k);
        if (this.grupoRueda && !this.dedos.has(CLAVE_RUEDA) && !this.dedos.has(CLAVE_RUEDA_DOS[0]) && !this.dedos.has(CLAVE_PELLIZCO[0])) {
            this.grupoRueda = null;
            this.acumRuedaTactil = { dx: 0, dy: 0 };
            this.cancelarSilencio?.();
            this.cancelarSilencio = null;
        }
        for (const f of this.dedos.values()) f.pend = [[f.x, f.y, 0]];
        if (this.dedos.size) this.vaciar(true); // el dedo levantado ya no va: lo nativo lo suelta ahora, no al siguiente movimiento
    }
}
