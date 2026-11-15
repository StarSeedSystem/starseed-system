/**
 * VEN1115L · de punteros a dedos. Sin React ni DOM: recibe puntos 0..1 de la pantalla del aparato y emite
 * `gesto` (puntos por dedo, `sigue:true` mientras haya dedos apoyados, uno final con `sigue:false`).
 * Los puntos se juntan por fotograma (como mucho ~60 órdenes por segundo, contrato §2.4).
 *
 * Decisión: cuando un dedo se levanta habiendo otros apoyados, el gesto se cierra con `sigue:false` (el formato solo
 * dice «sigue» para todos) y los demás dedos se reponen en el aparato con su siguiente punto como un apoyo nuevo.
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
const SEPARACION_INICIAL = 0.2;
const SEPARACION_MIN = 0.04;
const SEPARACION_MAX = 0.8;
const BORDE = 0.01;
export const CLAVE_RUEDA = "rueda";
export const CLAVE_PELLIZCO = ["pellizco-a", "pellizco-b"] as const;

const acotar = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export class GestorToque {
    private dedos = new Map<string, Dedo>();
    private cancelarFotograma: (() => void) | null = null;
    private cancelarSilencio: (() => void) | null = null;
    private ultimoEnvio = -Infinity;
    private centro: [number, number] = [0.5, 0.5];
    private separacion = SEPARACION_INICIAL;
    private grupoRueda: "pellizco" | "desplazar" | null = null;

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

    mover(clave: string, x: number, y: number): void {
        const f = this.dedos.get(clave);
        if (!f) return;
        const t = this.d.ahora();
        f.pend.push([x, y, Math.max(0, Math.round(t - f.t))]);
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
        this.cerrar([...this.dedos.keys()]);
    }

    /** Pellizco de trackpad (Ctrl + rueda): dos dedos alrededor del puntero; `deltaY` en píxeles de rueda. */
    pellizcar(x: number, y: number, deltaY: number): void {
        if (this.grupoRueda === "desplazar") this.levantar(CLAVE_RUEDA);
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

    /** Rueda sin Ctrl: un dedo que se arrastra `dx,dy` (0..1 del cuadro del aparato, ya al revés de la rueda). */
    desplazar(x: number, y: number, dx: number, dy: number): void {
        if (this.grupoRueda === "pellizco") this.cerrar(CLAVE_PELLIZCO.filter((k) => this.dedos.has(k)));
        if (!this.dedos.has(CLAVE_RUEDA)) {
            if (!this.abajo(CLAVE_RUEDA, x, y)) return;
            this.grupoRueda = "desplazar";
        }
        const f = this.dedos.get(CLAVE_RUEDA);
        if (!f) return;
        const nx = acotar(f.x + dx);
        const ny = acotar(f.y + dy);
        this.mover(CLAVE_RUEDA, nx, ny);
        const alBorde = nx <= BORDE || nx >= 1 - BORDE || ny <= BORDE || ny >= 1 - BORDE;
        if (alBorde) {
            this.cerrar([CLAVE_RUEDA]); // el siguiente giro empieza otro trazo en el puntero
            return;
        }
        this.esperarSilencio(() => this.cerrar([CLAVE_RUEDA]));
    }

    private esperarSilencio(f: () => void): void {
        this.cancelarSilencio?.();
        this.cancelarSilencio = this.d.esperar(() => {
            this.cancelarSilencio = null;
            f();
        }, SILENCIO_RUEDA_MS);
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
            } else if (!sigue) {
                dedos.push({ id: f.id, puntos: [[f.x, f.y, 0]] });
            }
        }
        if (!dedos.length) return false;
        this.ultimoEnvio = this.d.ahora();
        this.d.enviar({ tipo: "gesto", dedos, sigue });
        return true;
    }

    /** Cierra el gesto (`sigue:false`) levantando las claves dadas; los dedos que quedan se reponen como apoyo nuevo. */
    private cerrar(claves: string[]): void {
        const quita = claves.filter((k) => this.dedos.has(k));
        if (!quita.length) return;
        this.cancelarFotograma?.();
        this.cancelarFotograma = null;
        this.vaciar(false);
        for (const k of quita) this.dedos.delete(k);
        if (this.grupoRueda && !this.dedos.has(CLAVE_RUEDA) && !this.dedos.has(CLAVE_PELLIZCO[0])) {
            this.grupoRueda = null;
            this.cancelarSilencio?.();
            this.cancelarSilencio = null;
        }
        for (const f of this.dedos.values()) f.pend = [[f.x, f.y, 0]];
        if (this.dedos.size) this.programar();
    }
}
