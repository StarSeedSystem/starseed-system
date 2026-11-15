/**
 * Control entre mis neuronas · la PUERTA del aparato controlado (ORD1114P · contrato
 * `control-remoto-entre-neuronas.md` §1, §2.1, §2.3 y §2.4; fase 1).
 *
 * Quien decide es el lado controlado, nunca quien firma (§1 A). Una orden solo surte efecto si, en
 * ESTE aparato y por este orden:
 *   1. tiene la forma exacta (`leerOrden`) — si no, «forma»;
 *   2. el dueño encendió aquí «Control entre mis neuronas» (apagado de fábrica) — si no, «permiso-apagado»;
 *   3. es de la MISMA cuenta — si no, «otra-cuenta»;
 *   4. la manda un aparato que el dueño aceptó AQUÍ (clave pública fijada) — si no, «no-autorizado»;
 *   5. la firma ECDSA vale con esa clave fijada — si no, «firma»;
 *   6. va dirigida a esta neurona — si no, «otro-destino»;
 *   7. su hora está a ±5 min y no ha caducado (vida ≤ 2 min) — si no, «caducada»;
 *   8. su `seq` es mayor que el último visto de ese aparato y su nonce es nuevo — si no, «repetida»;
 *   9. no pasa del tope (5 por segundo, 60 por minuto por aparato) — si no, «limite»;
 *  10. la acción está en la lista cerrada — si no, «accion-desconocida» (nunca se adivina);
 *  11. sus argumentos son los tipados — si no, «argumentos»;
 *  12. su nivel no pasa del concedido ni del de la sesión — si no, «nivel»;
 *  13. hay sesión abierta por ESE aparato, viva (1 h máx., 2 min sin actividad) — si no, «sin-sesion»/«sesion-caducada».
 * Cada orden, aceptada o no, deja una línea `orden <acción> de=<8> nivel=<n> resultado=<…>`.
 * Revocar (un toque) cierra la sesión y APAGA el permiso: lo siguiente es «permiso-apagado».
 *
 * Pura salvo lo inyectado (reloj, WebCrypto, almacén, ejecutor, registro, azar). Nunca lanza hacia fuera.
 */

import { leerOrden, verificarFirma, huellaDeSpki, DESFASE_MAX_MS, VIDA_ORDEN_MS, type CargaOrden, type RespuestaOrden } from "./orden";
import { capacidadesDeNivel, definicion, nivelMinimo, rangoNivel, NIVELES_CONCEDIBLES_FASE1, type Args, type Nivel } from "./niveles";

export const SESION_MAX_MS = 60 * 60_000;
export const SESION_INACTIVA_MS = 2 * 60_000;
export const TOPE_SEGUNDO = 5;
export const TOPE_MINUTO = 60;
export const MAX_CONTROLADORES = 4;
export const MAX_PENDIENTES = 5;

export interface Controlador {
    huella: string;
    spki: string;
    cuenta: string;
    nombre: string;
    neurona: string;
    desde: string;
}

/** Lo que el dueño decidió en ESTE aparato. Se guarda; las sesiones no (viven en memoria). */
export interface PermisoControl {
    encendido: boolean;
    nivel: Nivel;
    controladores: Controlador[];
    pendientes: Controlador[];
}

export function permisoDeFabrica(): PermisoControl {
    return { encendido: false, nivel: "controlar", controladores: [], pendientes: [] };
}

export interface SesionActiva {
    token: string;
    de: string;
    nombre: string;
    nivel: Nivel;
    inicio: number;
    ultima: number;
}

export interface DepsPuerta {
    subtle: SubtleCrypto;
    ahora: () => number;
    cuentaPropia: () => string | null;
    neuronaPropia: () => string;
    leerPermiso: () => PermisoControl;
    guardarPermiso: (p: PermisoControl) => void;
    /** Ejecuta una acción YA validada. Devuelve el resultado o lanza con un motivo corto. */
    ejecutar: (nombre: string, args: Args, carga: CargaOrden) => Promise<unknown>;
    anotar: (linea: string) => void;
    /** 16 bytes de azar en hex (el token de la sesión). */
    azarHex: () => string;
    /** Avisa a la interfaz (banda) de que cambió la sesión o el permiso. */
    alCambiar?: () => void;
}

const MAX_NONCES = 2000;

export class PuertaControl {
    private sesion: SesionActiva | null = null;
    private ultimoSeq = new Map<string, number>();
    private nonces: string[] = [];
    private noncesSet = new Set<string>();
    private marcas = new Map<string, number[]>();

    constructor(private readonly d: DepsPuerta) {}

    sesionActiva(): SesionActiva | null {
        this.caducarSesion();
        return this.sesion;
    }

    /** Un toque: cierra la sesión y apaga el permiso en este aparato. */
    revocar(motivo = "revocado"): void {
        const s = this.sesion;
        this.sesion = null;
        const p = this.d.leerPermiso();
        this.d.guardarPermiso({ ...p, encendido: false });
        this.d.anotar(`orden revocar de=${s ? s.de.slice(0, 8) : "-"} nivel=- resultado=${motivo}`);
        this.d.alCambiar?.();
    }

    private caducarSesion(): void {
        const s = this.sesion;
        if (!s) return;
        const t = this.d.ahora();
        if (t - s.inicio > SESION_MAX_MS || t - s.ultima > SESION_INACTIVA_MS) {
            this.sesion = null;
            this.d.anotar(`orden cerrar-sesion de=${s.de.slice(0, 8)} nivel=${s.nivel} resultado=caducada`);
            this.d.alCambiar?.();
        }
    }

    private respuesta(nonce: string, ok: boolean, motivo: string, nombre: string, de: string, nivel: string, resultado?: unknown): RespuestaOrden {
        const marca = nombre && /^[a-z-]{1,24}$/.test(nombre) ? nombre : "?";
        const sim = definicion(nombre)?.simulacion ? " SIMULACION" : "";
        this.d.anotar(`orden ${marca} de=${de ? de.slice(0, 8) : "-"} nivel=${nivel} resultado=${ok ? "ok" : `rechazo:${motivo}`}${sim}`);
        return { tipo: "respuesta", nonce, ok, motivo, ...(resultado !== undefined ? { resultado } : {}) };
    }

    private tope(huella: string): boolean {
        const t = this.d.ahora();
        const lista = (this.marcas.get(huella) ?? []).filter((x) => t - x < 60_000);
        const enSegundo = lista.filter((x) => t - x < 1000).length;
        if (enSegundo >= TOPE_SEGUNDO || lista.length >= TOPE_MINUTO) {
            this.marcas.set(huella, lista);
            return false;
        }
        lista.push(t);
        this.marcas.set(huella, lista);
        return true;
    }

    private recordarNonce(n: string): void {
        this.noncesSet.add(n);
        this.nonces.push(n);
        if (this.nonces.length > MAX_NONCES) this.noncesSet.delete(this.nonces.shift() as string);
    }

    /** Recibe una orden firmada (lo que llegó por el canal) y devuelve la respuesta. Nunca lanza. */
    async recibir(sobre: unknown): Promise<RespuestaOrden> {
        try {
            return await this.recibirSinGuarda(sobre);
        } catch {
            return this.respuesta("", false, "error", "", "", "-");
        }
    }

    private async recibirSinGuarda(sobre: unknown): Promise<RespuestaOrden> {
        const o = leerOrden(sobre);
        if (!o) return this.respuesta("", false, "forma", "", "", "-");
        const { carga: c } = o;
        const nombre = c.accion.nombre;
        const permiso = this.d.leerPermiso();

        // «presentarse»: un aparato de la cuenta pide que el dueño lo acepte AQUÍ. Nunca concede nada.
        if (nombre === "presentarse") return this.presentarse(o);

        if (!permiso.encendido) return this.respuesta(c.nonce, false, "permiso-apagado", nombre, c.de, c.nivel);
        const cuenta = this.d.cuentaPropia();
        if (!cuenta || c.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return this.respuesta(c.nonce, false, "otra-cuenta", nombre, c.de, c.nivel);
        const ctl = permiso.controladores.find((x) => x.huella === c.de);
        if (!ctl || ctl.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return this.respuesta(c.nonce, false, "no-autorizado", nombre, c.de, c.nivel);
        if (!(await verificarFirma(this.d.subtle, ctl.spki, o.bytes, o.firma))) return this.respuesta(c.nonce, false, "firma", nombre, c.de, c.nivel);
        if (c.para !== this.d.neuronaPropia()) return this.respuesta(c.nonce, false, "otro-destino", nombre, c.de, c.nivel);

        const ahora = this.d.ahora();
        const t = Date.parse(c.t);
        const cad = Date.parse(c.caduca);
        if (Math.abs(ahora - t) > DESFASE_MAX_MS || cad <= ahora || cad - t > VIDA_ORDEN_MS || cad < t) {
            return this.respuesta(c.nonce, false, "caducada", nombre, c.de, c.nivel);
        }
        const previo = this.ultimoSeq.get(c.de) ?? 0;
        if (c.seq <= previo || this.noncesSet.has(c.nonce)) return this.respuesta(c.nonce, false, "repetida", nombre, c.de, c.nivel);
        this.ultimoSeq.set(c.de, c.seq);
        this.recordarNonce(c.nonce);
        if (!this.tope(c.de)) return this.respuesta(c.nonce, false, "limite", nombre, c.de, c.nivel);

        const def = definicion(nombre);
        if (!def) return this.respuesta(c.nonce, false, "accion-desconocida", nombre, c.de, c.nivel);
        const args = def.validar(c.accion.args);
        if (!args) return this.respuesta(c.nonce, false, "argumentos", nombre, c.de, c.nivel);

        const concedido: Nivel = NIVELES_CONCEDIBLES_FASE1.includes(permiso.nivel) ? permiso.nivel : "ver";
        if (rangoNivel(c.nivel) > rangoNivel(concedido) || rangoNivel(def.nivel) > rangoNivel(c.nivel)) {
            return this.respuesta(c.nonce, false, "nivel", nombre, c.de, c.nivel);
        }

        if (nombre === "abrir-sesion") {
            this.caducarSesion();
            if (this.sesion && this.sesion.de !== c.de) return this.respuesta(c.nonce, false, "otra-sesion", nombre, c.de, c.nivel);
            const nivel = nivelMinimo(c.nivel, concedido);
            this.sesion = { token: this.d.azarHex(), de: c.de, nombre: ctl.nombre, nivel, inicio: ahora, ultima: ahora };
            this.d.alCambiar?.();
            return this.respuesta(c.nonce, true, "ok", nombre, c.de, nivel, {
                sesion: this.sesion.token,
                nivel,
                capacidades: capacidadesDeNivel(nivel),
                caduca: new Date(ahora + SESION_MAX_MS).toISOString(),
            });
        }

        this.caducarSesion();
        const s = this.sesion;
        if (!s || s.de !== c.de || c.sesion !== s.token) return this.respuesta(c.nonce, false, s ? "sin-sesion" : "sesion-caducada", nombre, c.de, c.nivel);
        if (rangoNivel(def.nivel) > rangoNivel(s.nivel)) return this.respuesta(c.nonce, false, "nivel", nombre, c.de, c.nivel);
        s.ultima = ahora;

        if (nombre === "cerrar-sesion") {
            this.sesion = null;
            this.d.alCambiar?.();
            return this.respuesta(c.nonce, true, "ok", nombre, c.de, s.nivel);
        }
        try {
            const r = await this.d.ejecutar(nombre, args, c);
            return this.respuesta(c.nonce, true, "ok", nombre, c.de, s.nivel, r);
        } catch (e) {
            const m = e instanceof Error && /^[a-z-]{1,32}$/.test(e.message) ? e.message : "fallo";
            return this.respuesta(c.nonce, false, m, nombre, c.de, s.nivel);
        }
    }

    private async presentarse(o: NonNullable<ReturnType<typeof leerOrden>>): Promise<RespuestaOrden> {
        const c = o.carga;
        const a = c.accion.args;
        const cuenta = this.d.cuentaPropia();
        if (!cuenta || c.cuenta.trim().toLowerCase() !== cuenta.trim().toLowerCase()) return this.respuesta(c.nonce, false, "otra-cuenta", "presentarse", c.de, "-");
        if (typeof a.spki !== "string" || typeof a.nombre !== "string" || typeof a.neurona !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(a.neurona)) {
            return this.respuesta(c.nonce, false, "argumentos", "presentarse", c.de, "-");
        }
        // Prueba de posesión: la carga va firmada con la clave que presenta y su huella es `de`.
        if ((await huellaDeSpki(this.d.subtle, a.spki)) !== c.de) return this.respuesta(c.nonce, false, "firma", "presentarse", c.de, "-");
        if (!(await verificarFirma(this.d.subtle, a.spki, o.bytes, o.firma))) return this.respuesta(c.nonce, false, "firma", "presentarse", c.de, "-");
        if (c.para !== this.d.neuronaPropia()) return this.respuesta(c.nonce, false, "otro-destino", "presentarse", c.de, "-");
        const ahora = this.d.ahora();
        if (Math.abs(ahora - Date.parse(c.t)) > DESFASE_MAX_MS || Date.parse(c.caduca) <= ahora) return this.respuesta(c.nonce, false, "caducada", "presentarse", c.de, "-");
        if (!this.tope(c.de)) return this.respuesta(c.nonce, false, "limite", "presentarse", c.de, "-");
        const p = this.d.leerPermiso();
        if (p.controladores.some((x) => x.huella === c.de)) return this.respuesta(c.nonce, true, "ya-aceptado", "presentarse", c.de, "-");
        const nombre = [...a.nombre.replace(/[\u0000-\u001f\u007f]/g, "")].slice(0, 60).join("").trim() || "Neurona";
        const nuevo: Controlador = { huella: c.de, spki: a.spki, cuenta: c.cuenta, nombre, neurona: a.neurona, desde: new Date(ahora).toISOString() };
        const pendientes = [nuevo, ...p.pendientes.filter((x) => x.huella !== c.de)].slice(0, MAX_PENDIENTES);
        this.d.guardarPermiso({ ...p, pendientes });
        this.d.alCambiar?.();
        return this.respuesta(c.nonce, true, "pendiente", "presentarse", c.de, "-");
    }
}

/** El dueño acepta EN ESTE aparato a un aparato que se presentó (lo fija por su clave). */
export function aceptarPendiente(p: PermisoControl, huella: string): PermisoControl {
    const x = p.pendientes.find((y) => y.huella === huella);
    if (!x) return p;
    const controladores = [x, ...p.controladores.filter((y) => y.huella !== huella)].slice(0, MAX_CONTROLADORES);
    return { ...p, controladores, pendientes: p.pendientes.filter((y) => y.huella !== huella) };
}

export function quitarControlador(p: PermisoControl, huella: string): PermisoControl {
    return { ...p, controladores: p.controladores.filter((y) => y.huella !== huella), pendientes: p.pendientes.filter((y) => y.huella !== huella) };
}

/** Lee un permiso guardado con forma estricta; cualquier cosa rara vuelve al de fábrica (apagado). */
export function sanearPermiso(x: unknown): PermisoControl {
    const f = permisoDeFabrica();
    if (!x || typeof x !== "object") return f;
    const o = x as Record<string, unknown>;
    const lista = (v: unknown): Controlador[] =>
        Array.isArray(v)
            ? v
                  .filter(
                      (c): c is Controlador =>
                          !!c &&
                          typeof c === "object" &&
                          typeof (c as Controlador).huella === "string" &&
                          /^[0-9a-f]{64}$/.test((c as Controlador).huella) &&
                          typeof (c as Controlador).spki === "string" &&
                          typeof (c as Controlador).cuenta === "string" &&
                          typeof (c as Controlador).nombre === "string" &&
                          typeof (c as Controlador).neurona === "string",
                  )
                  .slice(0, MAX_CONTROLADORES + MAX_PENDIENTES)
            : [];
    return {
        encendido: o.encendido === true,
        nivel: o.nivel === "ver" ? "ver" : "controlar",
        controladores: lista(o.controladores).slice(0, MAX_CONTROLADORES),
        pendientes: lista(o.pendientes).slice(0, MAX_PENDIENTES),
    };
}
