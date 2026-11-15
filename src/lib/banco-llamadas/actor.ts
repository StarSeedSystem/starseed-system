/**
 * Banco de llamadas · el actor de la app de la Mac (ORD1114P · contrato
 * `architecture/ronda-automatica-llamadas.md` §1.2 y §9, sobre el canal de
 * `control-remoto-entre-neuronas.md` §2.5).
 *
 * Python (`scripts/puente/banco_llamadas.py`) solo escribe `orden.json`; esta app lo sondea por
 * `GET /api/banco-llamadas` (solo en su servidor local), escribe las marcas `banco …` en el registro
 * de enlaces, llama ella misma y opera la tableta con órdenes firmadas del control entre neuronas
 * (contestar, mudo, cámara, simular corte IP, colgar). La tableta solo obedece si su dueño encendió
 * allí «Control entre mis neuronas» y aceptó esta Mac.
 *
 * Puro salvo lo inyectado. Nunca lanza hacia fuera. Todo lo «sin IP» es SIMULACIÓN y lo dice.
 */

import type { RespuestaOrden } from "@/lib/control-remoto/orden";
import type { Args } from "@/lib/control-remoto/niveles";

export const SONDEO_MS = 5_000;
export const VIDA_SONDEO_MS = 60_000;
export const ESPERA_CONTESTA_MS = 20_000;
export const HORAS_DEFECTO = 4;
export const HORAS_MAX = 8;
export const LLAMADAS_DEFECTO = 40;

const RE_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCIONES_GUION = ["mudo", "micro", "camara-off", "camara-on", "corte-ip", "vuelve-ip", "colgar"] as const;
type AccionGuion = (typeof ACCIONES_GUION)[number];
const MEDIOS = ["auto", "solo-ble", "sin-ip-desde-inicio"] as const;

export interface PasoGuion {
    t_s: number;
    quien: "mac" | "tableta" | "ambos";
    accion: AccionGuion;
}

export interface OrdenBanco {
    v: 1;
    serie: string;
    n: number;
    escenario: string;
    para: string;
    tipo: "video" | "audio";
    medio: (typeof MEDIOS)[number];
    guion: PasoGuion[];
    dur_s: number;
    caduca: string;
}

/** `orden.json` v1 con forma estricta, o null (una orden rara no se interpreta a medias). */
export function leerOrdenBanco(x: unknown): OrdenBanco | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (o.v !== 1 || typeof o.serie !== "string" || !RE_ID.test(o.serie) || typeof o.escenario !== "string" || !RE_ID.test(o.escenario)) return null;
    if (typeof o.n !== "number" || !Number.isInteger(o.n) || o.n < 1 || o.n > 999) return null;
    if (typeof o.para !== "string" || !RE_UUID.test(o.para)) return null;
    if (o.tipo !== "video" && o.tipo !== "audio") return null;
    if (!MEDIOS.includes(o.medio as (typeof MEDIOS)[number])) return null;
    if (typeof o.dur_s !== "number" || !(o.dur_s > 0 && o.dur_s <= 900)) return null;
    if (typeof o.caduca !== "string" || !Number.isFinite(Date.parse(o.caduca))) return null;
    if (!Array.isArray(o.guion) || o.guion.length > 20) return null;
    const guion: PasoGuion[] = [];
    for (const p of o.guion) {
        if (!p || typeof p !== "object") return null;
        const g = p as Record<string, unknown>;
        if (typeof g.t_s !== "number" || !(g.t_s >= 0 && g.t_s <= 900)) return null;
        if (g.quien !== "mac" && g.quien !== "tableta" && g.quien !== "ambos") return null;
        if (!ACCIONES_GUION.includes(g.accion as AccionGuion)) return null;
        guion.push({ t_s: g.t_s, quien: g.quien, accion: g.accion as AccionGuion });
    }
    return { v: 1, serie: o.serie, n: o.n, escenario: o.escenario, para: o.para.toLowerCase(), tipo: o.tipo, medio: o.medio as OrdenBanco["medio"], guion, dur_s: o.dur_s, caduca: o.caduca };
}

/** El motivo de rechazo de la tableta, en la lista cerrada del lado Python (§9.2). */
export function motivoBanco(m: string): "modo-apagado" | "falta-permiso" | "otra-llamada" | "orden-caducada" {
    if (m === "falta-permiso") return "falta-permiso";
    if (m === "otra-llamada") return "otra-llamada";
    if (m === "caducada") return "orden-caducada";
    return "modo-apagado"; // permiso apagado, no aceptada, sin enlace, sin respuesta (build sin el canal)…
}

/** Paso del guion → orden de la app (vocabulario cerrado del control entre neuronas). */
export function ordenDePaso(a: AccionGuion): { nombre: string; args: Args } {
    switch (a) {
        case "mudo":
            return { nombre: "micro", args: { activo: false } };
        case "micro":
            return { nombre: "micro", args: { activo: true } };
        case "camara-off":
            return { nombre: "camara", args: { activo: false } };
        case "camara-on":
            return { nombre: "camara", args: { activo: true } };
        case "corte-ip":
            return { nombre: "simular-corte-ip", args: {} };
        case "vuelve-ip":
            return { nombre: "simular-vuelve-ip", args: {} };
        case "colgar":
            return { nombre: "colgar", args: {} };
    }
}

export interface DepsActor {
    ahora: () => number;
    dormir: (ms: number) => Promise<void>;
    /** `GET /api/banco-llamadas`: `null` si no está disponible. */
    leer: () => Promise<{ orden: unknown; calma: unknown } | null>;
    /** Escribe una línea `banco <detalle>` (con el enlace de `neurona` si lo hay). */
    marcar: (detalle: string, neurona: string | null) => void;
    /** Orden firmada a la tableta (sesión del control entre neuronas). */
    tableta: (para: string) => { orden(nombre: string, args?: Args): Promise<RespuestaOrden> };
    /** La misma acción en ESTA app (la Mac), sin pasar por la puerta: es la propia app. */
    local: (nombre: string, args: Args) => Promise<unknown>;
}

export interface Armado {
    con: string;
    hasta: number;
    restantes: number;
}

function isoSinMs(t: number): string {
    return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function num(x: unknown, d: number): string {
    return typeof x === "number" && Number.isFinite(x) ? x.toFixed(d) : "?";
}

export class ActorBanco {
    private armado: Armado | null = null;
    private ultimoSondeo = 0;
    private hechas = new Set<string>();
    private enMarcha = false;

    constructor(private readonly d: DepsActor) {}

    estado(): Armado | null {
        return this.armado;
    }

    /** Lo enciende la persona EN la Mac (interruptor de la banda), para una sola tableta. */
    armar(con: string, horas = HORAS_DEFECTO, llamadas = LLAMADAS_DEFECTO): boolean {
        if (!RE_UUID.test(con)) return false;
        const h = Math.min(Math.max(horas, 0.25), HORAS_MAX);
        this.armado = { con: con.toLowerCase(), hasta: this.d.ahora() + h * 3_600_000, restantes: Math.max(1, Math.min(200, Math.floor(llamadas))) };
        this.d.marcar(`armada con=${this.armado.con} hasta=${isoSinMs(this.armado.hasta)} restantes=${this.armado.restantes}`, null);
        return true;
    }

    apagar(motivo: string): void {
        if (!this.armado) return;
        this.armado = null;
        this.d.marcar(`apagada motivo=${/^[a-z-]{1,24}$/.test(motivo) ? motivo : "apagar"}`, null);
    }

    /** Una vuelta del sondeo. Devuelve qué hizo (para las pruebas y la banda). */
    async vuelta(): Promise<string> {
        const a = this.armado;
        if (!a) return "apagado";
        if (this.enMarcha) return "en-llamada";
        if (this.d.ahora() >= a.hasta) {
            this.apagar("vencida");
            return "vencida";
        }
        const r = await this.d.leer().catch(() => null);
        const orden = leerOrdenBanco(r?.orden);
        if (!orden || this.hechas.has(`${orden.serie}:${orden.n}`)) {
            if (this.d.ahora() - this.ultimoSondeo >= VIDA_SONDEO_MS) {
                this.ultimoSondeo = this.d.ahora();
                this.d.marcar("sondeo orden=ninguna", null);
            }
            return "sin-orden";
        }
        this.hechas.add(`${orden.serie}:${orden.n}`);
        const k = `esc=${orden.escenario} serie=${orden.serie} n=${orden.n}`;
        if (orden.para !== a.con) return "otra-tableta"; // nunca opera una tableta que la persona no eligió
        if (Date.parse(orden.caduca) <= this.d.ahora()) {
            this.d.marcar(`rechaza ${k} motivo=orden-caducada`, orden.para);
            return "caducada";
        }
        this.enMarcha = true;
        try {
            return await this.llamada(orden, k, r?.calma);
        } finally {
            this.enMarcha = false;
        }
    }

    private calma(c: unknown, o: OrdenBanco, fase: "inicio" | "fin"): void {
        const lec = ((c as { lectura?: Record<string, unknown> } | null)?.lectura ?? {}) as Record<string, unknown>;
        const presion = typeof lec.presion === "number" ? String(lec.presion) : "?";
        this.d.marcar(
            `calma serie=${o.serie} n=${o.n} fase=${fase} carga1=${num(lec.carga1, 1)} presion=${presion} libre=${num(lec.libre_pct, 0)}% swap=${num(lec.swap_pct, 0)}% swapouts_min=${num(lec.swapouts_min, 0)}`,
            null,
        );
    }

    private async llamada(o: OrdenBanco, k: string, calma: unknown): Promise<string> {
        const tab = this.d.tableta(o.para);
        const rechaza = (m: string) => {
            this.d.marcar(`rechaza ${k} motivo=${motivoBanco(m)}`, o.para);
            return `rechazada:${m}`;
        };
        // La tableta lista: sesión abierta y sin otra llamada (lee su estado: nivel «ver»).
        const est = await tab.orden("leer-estado");
        if (!est.ok) return rechaza(est.motivo);
        if ((est.resultado as { llamada?: unknown } | undefined)?.llamada) return rechaza("otra-llamada");

        this.d.marcar(`inicio ${k} medio=${o.medio} tipo=${o.tipo}`, o.para);
        this.calma(calma, o, "inicio");
        const t0 = this.d.ahora();
        try {
            await this.d.local("llamar", { neurona: o.para, tipo: o.tipo });
        } catch {
            this.d.marcar(`fin ${k} cuelga=mac dur_s=0`, o.para);
            return "no-llamo";
        }
        // Contestar: el timbre tarda en llegar; «sin-timbre» se reintenta hasta 20 s.
        let contesto: RespuestaOrden | null = null;
        while (this.d.ahora() - t0 < ESPERA_CONTESTA_MS) {
            contesto = await tab.orden("contestar", { camara: o.tipo === "video", banco: { esc: o.escenario, serie: o.serie, n: o.n } });
            if (contesto.ok || contesto.motivo !== "sin-timbre") break;
            await this.d.dormir(2000);
        }
        if (!contesto?.ok) {
            await this.d.local("colgar", {}).catch(() => undefined);
            this.d.marcar(`fin ${k} cuelga=mac dur_s=${Math.round((this.d.ahora() - t0) / 1000)}`, o.para);
            return rechaza(contesto?.motivo ?? "sin-timbre");
        }
        const tc = this.d.ahora();
        if (o.medio === "sin-ip-desde-inicio" || o.medio === "solo-ble") {
            // SIMULACIÓN (§2): las dos puntas fuerzan voz y vídeo al Bluetooth; nunca cuenta como «sin Wi-Fi» real.
            await this.d.local("simular-corte-ip", {}).catch(() => undefined);
            await tab.orden("simular-corte-ip");
        }
        let cuelga: "mac" | "tableta" | null = null;
        const pasos = [...o.guion].sort((a, b) => a.t_s - b.t_s);
        for (const p of pasos) {
            const espera = tc + p.t_s * 1000 - this.d.ahora();
            if (espera > 0) await this.d.dormir(espera);
            const { nombre, args } = ordenDePaso(p.accion);
            if (p.quien === "mac" || p.quien === "ambos") await this.d.local(nombre, args).catch(() => undefined);
            if (p.quien === "tableta" || p.quien === "ambos") await tab.orden(nombre, args);
            if (p.accion === "colgar") {
                cuelga = p.quien === "tableta" ? "tableta" : "mac";
                break;
            }
        }
        if (!cuelga) {
            const espera = tc + o.dur_s * 1000 - this.d.ahora();
            if (espera > 0) await this.d.dormir(espera);
            await this.d.local("colgar", {}).catch(() => undefined);
            cuelga = "mac";
        }
        this.d.marcar(`fin ${k} cuelga=${cuelga} dur_s=${Math.round((this.d.ahora() - tc) / 1000)}`, o.para);
        this.calma(calma, o, "fin");
        if (this.armado) {
            this.armado.restantes -= 1;
            if (this.armado.restantes <= 0) this.apagar("gastadas");
        }
        return "hecha";
    }
}
