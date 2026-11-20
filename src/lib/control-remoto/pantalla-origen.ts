/**
 * Control entre mis neuronas · el LADO CONTROLADO de la pantalla y la entrada (PAN1115J · contrato
 * `control-remoto-entre-neuronas.md` §12; costuras 1 y 2 de `control-fase23-costuras.md`).
 *
 * Qué hace esta página y qué no:
 *  · Dentro de una sesión abierta, `pantalla-iniciar` pide a lo nativo la fuente de pantalla (costura 1:
 *    `control_pantalla_iniciar`), trae cuadros con `control_pantalla_cuadro` (12 bytes de cabecera + un JPEG),
 *    los pinta en un lienzo y los manda como pista de vídeo en una conexión negociada por el canal de control
 *    (`pantalla-senal`: oferta y candidatos entran como órdenes; la contestación sale en la respuesta).
 *  · Las órdenes de entrada (`gesto`, `tecla`, `volumen`, `brillo`, `texto`) llegan YA validadas por la puerta
 *    (forma, firma, sesión, nivel, tope). Aquí NO se ejecutan: se entregan con su sobre intacto a
 *    `control_entrada`, que las vuelve a comprobar en lo nativo (aparato aceptado, regla G, pausa local).
 *  · Todo para cuando la sesión se cierra, caduca o el indicador desaparece (`revisarOrigen`), o la conexión cae.
 *  · Los cuadros no se guardan ni se anotan: se pintan y se sueltan.
 */

import type { Args } from "./niveles";
import type { RespuestaOrden } from "./orden";
import { Reensamblador, leerParte, trocear, type ParteSenal } from "./senal-partes";
import { RelojEstable } from "@/lib/llamadas/reloj-estable";
import { VigiaFondo, esperarCon, type MedidasFondo } from "./vigia-fondo";
import { CUADROS_POR_MEDIDA, RITMO_INICIAL, capacidadFps, mediaCoste, siguienteRitmo, type EstadoRitmo } from "./ritmo-pantalla";
import { MAX_CUADRO_BYTES, nivelDe, partirCuadro, type ParteCuadro } from "./cuadro-malla";
import { ESPERA_FLUIDA_MS, SONDEO_FLUIDA_MS, FUENTE_DEFECTO, debePedirFluida, fuenteActivaDe, proyeccionConcedida, type FuentePedida, type FuenteReal } from "./fuente-pantalla";
import { marcarOcupado } from "@/lib/actualizaciones/momento-navegador";
import { añadirCuadro, añadirAcuse, actualizarMedio, calcularMetricas, EstadoCalidad, lineaRegistro, marcarRegistro, tocaRegistro, type AcuseOrden, type CuadroRecibido, type MetricasCalidad, type TipoMedio, INTERVALO_REGISTRO_MS } from "./calidad";
import { instantaneaMedio } from "./medio-estado";

export const LADO_MAX_DEFECTO = 1280;
export const CALIDAD_DEFECTO = 60;
/** Sin oferta en este tiempo desde que se pidió la pantalla, se para (nadie la está recogiendo). */
export const ESPERA_OFERTA_MS = 30_000;
/** Espera máxima a que la conexión recoja sus candidatos antes de contestar (la contestación los lleva dentro). */
export const ESPERA_CANDIDATOS_MS = 2_500;
export const CABECERA_CUADRO = 12;
export const MAX_MENSAJE_CANAL = 8192;
export const ORDENES_ENTRADA = ["gesto", "tecla", "volumen", "brillo", "texto"] as const;

// ── cuadro: cabecera de la costura 1 ─────────────────────────────────────────────────────────

export interface CabeceraCuadro {
    numero: number;
    ancho: number;
    alto: number;
    giro: 0 | 90 | 180 | 270;
}

/** Lee los 12 bytes (u32 número, u16 ancho, u16 alto, u16 giro, u16 cero, little endian). null si no valen. */
export function leerCabeceraCuadro(b: Uint8Array): CabeceraCuadro | null {
    if (b.length <= CABECERA_CUADRO) return null;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const numero = v.getUint32(0, true);
    const ancho = v.getUint16(4, true);
    const alto = v.getUint16(6, true);
    const giro = v.getUint16(8, true);
    const cero = v.getUint16(10, true);
    if (cero !== 0 || ancho < 1 || alto < 1 || ancho > 8192 || alto > 8192) return null;
    if (giro !== 0 && giro !== 90 && giro !== 180 && giro !== 270) return null;
    return { numero, ancho, alto, giro };
}

/** Lo que devuelve Tauri para bytes crudos puede ser ArrayBuffer, Uint8Array o lista de números. */
export function abytes(x: unknown): Uint8Array | null {
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if (Array.isArray(x) && x.every((n) => typeof n === "number")) return Uint8Array.from(x as number[]);
    return null;
}

// ── lo que se inyecta (en las pruebas son falsos) ────────────────────────────────────────────

export interface CanalLike {
    readyState?: string;
    onmessage: ((e: { data: unknown }) => void) | null;
    onclose: (() => void) | null;
    send(d: string): void;
    close(): void;
}

export interface PeerLike {
    iceGatheringState: string;
    localDescription: { type?: string; sdp?: string } | null;
    connectionState?: string;
    onicegatheringstatechange: (() => void) | null;
    onconnectionstatechange: (() => void) | null;
    ondatachannel: ((e: { channel: CanalLike }) => void) | null;
    addTrack(pista: unknown, ...flujos: unknown[]): unknown;
    setRemoteDescription(d: { type: string; sdp: string }): Promise<void>;
    createAnswer(): Promise<{ type?: string; sdp?: string }>;
    setLocalDescription(d?: unknown): Promise<void>;
    addIceCandidate(c: { candidate: string; sdpMLineIndex?: number }): Promise<void>;
    close(): void;
}

export interface Pintor {
    /** Pinta un JPEG; resuelve cuando YA está pintado (entonces se pide el siguiente). false si no se pudo leer. */
    pintar(jpeg: Uint8Array, ancho: number, alto: number): Promise<boolean>;
    pista(): unknown;
    flujo(): unknown;
    liberar(): void;
    /** CTL1117C: cuántas veces el latido repitió el último cuadro (solo diagnóstico). */
    latidos?(): number;
}

export interface SesionViva {
    token: string;
    de: string;
    nivel: string;
}

export interface DepsOrigen {
    /** `invoke` de Tauri; null fuera de la app nativa. */
    invocar: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null;
    iceServers: () => Promise<RTCIceServer[]>;
    crearPeer: (iceServers: RTCIceServer[]) => PeerLike;
    crearPintor: () => Pintor;
    /** La sesión abierta ahora en la puerta (null si no hay o caducó). */
    sesionViva: () => SesionViva | null;
    /** Una orden firmada que llegó por el canal de datos de la conexión: pasa por la MISMA puerta. */
    recibirSobre: (sobre: unknown) => Promise<RespuestaOrden>;
    esperar: (ms: number) => Promise<void>;
    ahora: () => number;
    anotar: (linea: string) => void;
    /** CTL1117C · FALLO 1: el vigía de segundo plano (solo diagnóstico; vive lo que dura la pantalla remota). */
    vigia?: { arrancar(m: MedidasFondo): void; parar(): void };
    /** CTL1117C: órdenes cumplidas por la puerta (para el diagnóstico de segundo plano). */
    ordenesServidas?: () => number;
    /** CTL1118M: vuelve a codificar un JPEG más pequeño (lado y calidad del nivel) para la pantalla por la malla. null si no se pudo. */
    reducir?: (jpeg: Uint8Array, ancho: number, alto: number, lado: number, calidad: number) => Promise<{ jpeg: Uint8Array; ancho: number; alto: number } | null>;
}

/** CTL1118M: mientras quien manda pida cuadros por la malla, esta página no se para por «sin oferta». */
export const VIGENCIA_MALLA_MS = 8_000;

interface Activa {
    token: string;
    de: string;
    nivel: string;
    inicio: number;
    parado: boolean;
    pintor: Pintor;
    peer: PeerLike | null;
    canal: CanalLike | null;
    fuente: FuenteReal;
    /** CTL1118F: lo que dijo `control_pantalla_iniciar` (para contestar a un «mantener» sin reabrir nada). */
    ancho: number;
    alto: number;
    giro: number;
    /** CTL1118F: último número de cuadro visto (se pone a 0 al cambiar de fuente) y si ya hay una búsqueda de la fuente fluida en marcha. */
    desde: number;
    buscandoFluida: boolean;
    /** CTL1118F: el ritmo de la fluida: coste medio de un cuadro (ms), cuántos van en esta medida y el nivel de tamaño/calidad vigente. */
    coste: number | null;
    enMedida: number;
    ritmo: EstadoRitmo;
    cuadros: number;
    /** CTL1117C: cuadros nuevos que Rust dio a la página (los pintados son `cuadros`). */
    recibidos: number;
    cola: Promise<void>;
    /** CTL1118M: el último cuadro traído de lo nativo y, si quien manda pide por la malla, el que se está repartiendo en partes. */
    ultimo: { numero: number; jpeg: Uint8Array; ancho: number; alto: number } | null;
    mallaHasta: number;
    envio: { num: number; partes: ParteCuadro[]; ancho: number; alto: number } | null;
    reens: Reensamblador; // SEN1116A: partes de la oferta; se tira con la sesión
    respuestas: Map<string, ParteSenal[]>;
    /** CTL1119B: estado de calidad (cuadros enviados, acuses, métricas). */
    calidad: EstadoCalidad;
    ultimaCalidad: MetricasCalidad | null;
}

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

const RE_MOTIVO = /^[a-z-]{1,32}$/;

export class OrigenPantalla {
    private activa: Activa | null = null;
    /** Tarea pesada de la pantalla de control (alimenta el modo «auto» de rendimiento). */
    private soltarOcupado: (() => void) | null = null;
    /** CTL1118F: cuántas veces se pidió la pantalla fluida en cada sesión de control (por su token): sola, UNA; después, solo si la persona lo pide. */
    private readonly fluidaPedidas = new Map<string, number>();
    /** CTL1119B: intervalos para actualización de calidad. */
    private intervalos = new Set<ReturnType<typeof setInterval>>();

    constructor(private readonly d: DepsOrigen) {}

    /** ¿Está mandando pantalla? (para la banda y las pruebas) */
    enMarcha(): boolean {
        return !!this.activa && !this.activa.parado;
    }

    /** Cuadros pintados desde que empezó (solo un contador; nunca el contenido). */
    cuadrosPintados(): number {
        return this.activa?.cuadros ?? 0;
    }

    /** CTL1119B: métricas de calidad actuales (fps, rtt, kbps, resolución, codec, calidad, pérdidas, medio). */
    calidad(): MetricasCalidad | null {
        return this.activa?.ultimaCalidad ?? null;
    }

    /** Ejecuta una orden de pantalla o de entrada YA validada por la puerta. Lanza con un motivo corto. */
    async ejecutar(nombre: string, args: Args, ctx: { sobre?: unknown; sesion?: { token: string; nivel: string } }): Promise<unknown> {
        const s = ctx.sesion;
        if (!s) throw new Error("sesion");
        const viva = this.d.sesionViva();
        if (!viva || viva.token !== s.token) throw new Error("sesion");
        switch (nombre) {
            case "pantalla-iniciar":
                return args.mantener === true ? this.mantener(viva, args) : this.iniciar(viva, args);
            case "pantalla-parar":
                await this.parar("ordenado");
                return { parada: true };
            case "pantalla-senal":
                return this.senal(viva, args);
            case "pantalla-cuadro":
                return this.cuadro(viva, args);
            case "leer-aparato":
                return this.leerAparato();
            case "gesto":
            case "tecla":
            case "volumen":
            case "brillo":
            case "texto":
                return this.entrada(viva, s.nivel, ctx.sobre);
            default:
                throw new Error("accion-desconocida");
        }
    }

    // ── pantalla ─────────────────────────────────────────────────────────────────────────────

    private async iniciar(s: SesionViva, args: Args): Promise<unknown> {
        const inv = this.d.invocar;
        if (!inv) throw new Error("sin-soporte");
        await this.parar("reinicio");
        // RST1116A: «proyeccion» viaja como petición explícita; sin fuente o con «auto» no se manda nada y
        // lo elige el aparato. La fuente que se devuelve y se guarda es SIEMPRE la que contesta lo nativo.
        const pedida: FuentePedida = args.fuente === "proyeccion" ? "proyeccion" : FUENTE_DEFECTO;
        const r = await (pedida === "proyeccion"
            ? inv("control_pantalla_iniciar", {
                  sesion: s.token,
                  lado_max: typeof args.lado === "number" ? args.lado : LADO_MAX_DEFECTO,
                  calidad: typeof args.calidad === "number" ? args.calidad : CALIDAD_DEFECTO,
                  fuente: pedida,
              })
            : inv("control_pantalla_iniciar", {
                  sesion: s.token,
                  lado_max: typeof args.lado === "number" ? args.lado : LADO_MAX_DEFECTO,
                  calidad: typeof args.calidad === "number" ? args.calidad : CALIDAD_DEFECTO,
              })
        ).catch(() => null);
        if (!esObjeto(r) || r.ok !== true) {
            // La orden se cumplió; lo nativo dijo que no puede y por qué (lo que falta lo arregla la persona EN el aparato).
            const motivo = esObjeto(r) && typeof r.motivo === "string" && RE_MOTIVO.test(r.motivo) ? r.motivo : "sin-soporte";
            const falta = esObjeto(r) && Array.isArray(r.falta) ? r.falta.filter((x): x is string => typeof x === "string" && RE_MOTIVO.test(x)).slice(0, 8) : [];
            return { ok: false, motivo, falta };
        }
        const fuente: FuenteReal = r.fuente === "proyeccion" ? "proyeccion" : "accesibilidad";
        const ancho = Number(r.ancho) || 0;
        const alto = Number(r.alto) || 0;
        const giro = [0, 90, 180, 270].includes(Number(r.giro)) ? Number(r.giro) : 0;
        const medioSnap = instantaneaMedio(s.de);
        const medio: TipoMedio = (medioSnap.pantalla.medio as TipoMedio) ?? (medioSnap.ordenes.medio as TipoMedio) ?? "sin-determinar";
        const a: Activa = {
            token: s.token,
            de: s.de,
            nivel: s.nivel,
            inicio: this.d.ahora(),
            parado: false,
            pintor: this.d.crearPintor(),
            peer: null,
            canal: null,
            fuente,
            ancho,
            alto,
            giro,
            desde: 0,
            buscandoFluida: false,
            coste: null,
            enMedida: 0,
            ritmo: RITMO_INICIAL,
            cuadros: 0,
            recibidos: 0,
            cola: Promise.resolve(),
            ultimo: null,
            mallaHasta: 0,
            envio: null,
            reens: new Reensamblador(this.d.ahora),
            respuestas: new Map(),
            calidad: { cuadros: [], acuses: [], ultimoRegistro: 0, medioActual: medio, lado: "aparato" },
            ultimaCalidad: null,
        };
        this.activa = a;
        this.soltarOcupado?.();
        this.soltarOcupado = marcarOcupado(`control-pantalla:${a.token}`, "control");
        // CTL1117C: mide el segundo plano mientras dure esta pantalla (nada corre sin ella).
        try {
            this.d.vigia?.arrancar({
                producidos: () => a.recibidos,
                enviados: () => a.cuadros,
                latidos: () => a.pintor.latidos?.() ?? 0,
                ordenes: () => this.d.ordenesServidas?.() ?? 0,
            });
        } catch {
            /* el diagnóstico nunca impide la pantalla */
        }
        void this.bucle(a);
        // CTL1119B: actualización de calidad cada 500 ms
        const intCalidad = setInterval(() => void this.actualizarCalidad(a), 500);
        this.intervalos.add(intCalidad);
        this.d.anotar(`control-fuente paso=inicio fuente=${fuente} pedida=${pedida}`);
        // CTL1118F: la pantalla ya sale; lo fluido se pide sin esperar y sin cerrar nada.
        if (debePedirFluida(fuente, this.fluidaPedidas.get(a.token) ?? 0, pedida === "proyeccion")) void this.buscarFluida(a, pedida === "proyeccion");
        const capacidades = await inv("control_capacidades").catch(() => null);
        return {
            ok: true,
            fuente,
            ...(pedida === "proyeccion" ? { fuente_pedida: pedida } : {}),
            ancho,
            alto,
            giro,
            capacidades: esObjeto(capacidades) ? capacidades : null,
        };
    }

    /** CTL1119B: calcula métricas de calidad, actualiza medio y emite registro cada 10 s. */
    private actualizarCalidad(a: Activa): void {
        if (a.parado) return;
        const ahora = this.d.ahora();
        // Actualizar medio actual
        const medioSnap = instantaneaMedio(a.de);
        const medio: TipoMedio = (medioSnap.pantalla.medio as TipoMedio) ?? (medioSnap.ordenes.medio as TipoMedio) ?? "sin-determinar";
        actualizarMedio(a.calidad, medio);
        // Calcular métricas
        const metricas = calcularMetricas(a.calidad, ahora);
        a.ultimaCalidad = metricas;
        // Registro cada 10 s
        if (tocaRegistro(a.calidad, ahora)) {
            const linea = lineaRegistro(metricas);
            this.d.anotar(linea);
            marcarRegistro(a.calidad, ahora);
        }
    }

    /** CTL1118F: `pantalla-iniciar` con `mantener`: no reabre nada (ni conexión ni canal); si la persona pide la fluida, la busca; contesta lo que hay ahora. */
    private async mantener(s: SesionViva, args: Args): Promise<unknown> {
        const a = this.activa;
        if (!a || a.parado || a.token !== s.token || a.de !== s.de) {
            const { mantener: _m, ...resto } = args;
            return this.iniciar(s, resto);
        }
        const manual = args.fuente === "proyeccion";
        this.d.anotar(`control-fuente paso=mantener fuente=${a.fuente} manual=${manual ? "si" : "no"}`);
        if (manual && debePedirFluida(a.fuente, this.fluidaPedidas.get(a.token) ?? 0, true)) void this.buscarFluida(a, true);
        return { ok: true, mantenida: true, fuente: a.fuente, ancho: a.ancho, alto: a.alto, giro: a.giro };
    }

    private async llamarFluida(a: Activa): Promise<{ ok: boolean; r: Record<string, unknown> | null }> {
        const inv = this.d.invocar;
        const r = inv
            ? await inv("control_pantalla_iniciar", { sesion: a.token, lado_max: LADO_MAX_DEFECTO, calidad: CALIDAD_DEFECTO, fuente: "proyeccion" }).catch(() => null)
            : null;
        return { ok: esObjeto(r) && r.ok === true && r.fuente === "proyeccion", r: esObjeto(r) ? r : null };
    }

    /**
     * CTL1118F · la fuente fluida por defecto. Pide a lo nativo `fuente: "proyeccion"`: si la persona ya dio el «Sí» en esta sesión, cambia al
     * instante; si no, lo nativo abre SU diálogo en el aparato (y, con su «Sí», la pantalla de Android) y aquí se espera, mirando solo si
     * ya lo dio. Nada se contesta por la persona. Si no lo acepta (o no hay nadie), la accesibilidad sigue y no se insiste. La sesión, la conexión
     * y la ventana no se tocan: cambia quién escribe los cuadros.
     */
    private async buscarFluida(a: Activa, manual: boolean): Promise<void> {
        if (a.parado || a.buscandoFluida || !this.d.invocar) return;
        const pedidas = this.fluidaPedidas.get(a.token) ?? 0;
        if (!debePedirFluida(a.fuente, pedidas, manual)) return;
        a.buscandoFluida = true;
        this.fluidaPedidas.set(a.token, pedidas + 1);
        if (this.fluidaPedidas.size > 32) this.fluidaPedidas.delete(this.fluidaPedidas.keys().next().value as string);
        const t0 = this.d.ahora();
        this.d.anotar(`control-fuente paso=fluida-pedida manual=${manual ? "si" : "no"} desde=${a.fuente} veces=${pedidas + 1}`);
        try {
            let { ok, r } = await this.llamarFluida(a);
            if (!ok && r?.ok === false && r.motivo !== "sin-consentimiento") {
                this.d.anotar(`control-fuente paso=fluida-pedida resultado=rechazo motivo=${typeof r.motivo === "string" && RE_MOTIVO.test(r.motivo) ? r.motivo : "fallo"} sigue=${a.fuente}`);
                return;
            }
            const limite = t0 + ESPERA_FLUIDA_MS;
            while (!ok && !a.parado && this.vive(a) && this.d.ahora() < limite) {
                await this.d.esperar(SONDEO_FLUIDA_MS);
                if (a.parado || !this.vive(a)) return;
                const cap = await this.d.invocar("control_capacidades").catch(() => null);
                if (fuenteActivaDe(cap) === "proyeccion") {
                    ok = true; // ya escribe la proyección (otro camino la arrancó): solo falta anotarlo
                    r = { ok: true, fuente: "proyeccion", ancho: a.ancho, alto: a.alto, giro: a.giro };
                } else if (proyeccionConcedida(cap)) {
                    ({ ok, r } = await this.llamarFluida(a));
                    if (!ok) {
                        this.d.anotar(`control-fuente paso=fluida resultado=fallo-al-arrancar sigue=${a.fuente}`);
                        return;
                    }
                }
            }
            if (!ok || !r || a.parado) {
                this.d.anotar(`control-fuente paso=fluida resultado=sin-respuesta-de-la-persona esperado-ms=${Math.max(0, Math.round(this.d.ahora() - t0))} sigue=${a.fuente}`);
                return;
            }
            this.cambiarFuente(a, "proyeccion", r, `pedida`, this.d.ahora() - t0);
        } finally {
            a.buscandoFluida = false;
        }
    }

    private medirRitmo(a: Activa, ms: number): void {
        a.coste = mediaCoste(a.coste, ms);
        a.enMedida += 1;
        if (a.enMedida < CUADROS_POR_MEDIDA) return;
        a.enMedida = 0;
        const { estado, cambio } = siguienteRitmo(a.ritmo, a.coste);
        a.ritmo = estado;
        if (!cambio) return;
        this.d.anotar(`control-fuente paso=ritmo nivel=${estado.nivel} lado=${cambio.lado} calidad=${cambio.calidad} coste-ms=${Math.round(a.coste)} caben-fps=${capacidadFps(a.coste)}`);
        // Se vuelve a pedir lo mismo con otro tamaño/calidad: lo nativo ya tiene el «Sí», no pregunta nada y el cambio es en caliente.
        void this.d.invocar?.("control_pantalla_iniciar", { sesion: a.token, lado_max: cambio.lado, calidad: cambio.calidad, fuente: "proyeccion" }).catch(() => undefined);
    }

    /** CTL1118F: la fuente cambió sin cerrar nada: los cuadros nuevos siguen por el mismo bucle y la misma pista. */
    private cambiarFuente(a: Activa, nueva: FuenteReal, r: Record<string, unknown> | null, causa: string, ms: number): void {
        if (a.fuente === nueva) return;
        const antes = a.fuente;
        a.fuente = nueva;
        a.desde = 0;
        a.coste = null;
        a.enMedida = 0;
        a.ritmo = RITMO_INICIAL;
        if (r) {
            if (Number(r.ancho) > 0) a.ancho = Number(r.ancho);
            if (Number(r.alto) > 0) a.alto = Number(r.alto);
        }
        this.d.anotar(`control-fuente paso=cambio de=${antes} a=${nueva} causa=${causa} ms=${Math.max(0, Math.round(ms))} cuadros-hasta-ahora=${a.cuadros}`);
    }

    /** Pide el siguiente cuadro solo cuando el anterior ya se pintó: nunca hay cola de cuadros. */
    private async bucle(a: Activa): Promise<void> {
        const inv = this.d.invocar;
        if (!inv) return;
        let vacios = 0;
        let fallos = 0;
        while (!a.parado) {
            if (!this.vive(a)) {
                await this.parar("sesion-cerrada");
                return;
            }
            if (!a.peer && this.d.ahora() - a.inicio > ESPERA_OFERTA_MS && this.d.ahora() > a.mallaHasta) {
                await this.parar("sin-oferta");
                return;
            }
            let bytes: Uint8Array | null = null;
            const tPide = this.d.ahora();
            try {
                bytes = abytes(await inv("control_pantalla_cuadro", { sesion: a.token, desde: a.desde }));
            } catch {
                fallos += 1;
                if (fallos >= 3) {
                    await this.parar("cuadro-fallo");
                    return;
                }
                await this.d.esperar(100);
                continue;
            }
            if (!bytes || bytes.length === 0) {
                vacios += 1;
                await this.d.esperar(Math.min(200, 20 + vacios * 20)); // sin cuadro nuevo: se adapta, no se ocupa de más
                continue;
            }
            const h = leerCabeceraCuadro(bytes);
            if (!h) {
                fallos += 1;
                if (fallos >= 3) {
                    await this.parar("cuadro-fallo");
                    return;
                }
                continue;
            }
            fallos = 0;
            vacios = 0;
            a.desde = h.numero;
            a.recibidos += 1;
            // CTL1118M: sin conexión de vídeo y con quien manda pidiendo por la malla, el cuadro se guarda para repartirlo; no se pinta para nadie.
            if (!a.peer && this.d.ahora() <= a.mallaHasta) {
                a.ultimo = { numero: h.numero, jpeg: bytes.slice(CABECERA_CUADRO), ancho: h.ancho, alto: h.alto };
                a.cuadros += 1;
                continue;
            }
            a.ultimo = { numero: h.numero, jpeg: bytes.slice(CABECERA_CUADRO), ancho: h.ancho, alto: h.alto };
            const jpeg = bytes.subarray(CABECERA_CUADRO);
            const ok = await a.pintor.pintar(jpeg, h.ancho, h.alto).catch(() => false);
            if (ok) {
                a.cuadros += 1;
                // CTL1119B: alimentar cuadro a calidad (aparato)
                añadirCuadro(a.calidad, { t: this.d.ahora(), bytes: jpeg.length, ancho: h.ancho, alto: h.alto, codec: "jpeg", completo: true });
            }
            // CTL1118F: lo que cuesta un cuadro (traerlo + pintarlo) manda el tamaño y la calidad de los siguientes, solo con la fluida.
            if (ok && a.fuente === "proyeccion") this.medirRitmo(a, this.d.ahora() - tPide);
        }
    }

    private vive(a: Activa): boolean {
        const v = this.d.sesionViva();
        return !!v && v.token === a.token && v.de === a.de;
    }

    /** La sesión pudo cerrarse, caducar o perder su indicador: si es así, la pantalla para ya. */
    async revisar(): Promise<void> {
        const a = this.activa;
        if (a && !a.parado && !this.vive(a)) await this.parar("sesion-cerrada");
    }

    private async senal(s: SesionViva, args: Args): Promise<unknown> {
        const a = this.activa;
        if (!a || a.parado || a.token !== s.token || a.de !== s.de) throw this.falloSenal("oferta", "sin-pantalla");
        // SEN1116A: la oferta llega en partes; la respuesta se pide por partes. Cada fallo deja su línea en el registro.
        if (typeof args.pide === "number") return this.darParteRespuesta(a, args);
        if (typeof args.neg === "string") return this.recibirParteOferta(a, args);
        const peer = a.peer;
        if (!peer) throw this.falloSenal("candidatos", "sin-oferta");
        const lista = Array.isArray(args.candidatos) ? (args.candidatos as string[]) : [];
        let n = 0;
        for (const c of lista) {
            if (c === "") continue;
            await peer.addIceCandidate({ candidate: c, sdpMLineIndex: 0 }).then(
                () => (n += 1),
                () => undefined,
            );
        }
        return { candidatos: n };
    }

    /**
     * CTL1118M · la pantalla por la malla. Parte 0: si hay un cuadro más nuevo que `desde`, lo congela (con el nivel pedido: más pequeño si el enlace da poco)
     * y contesta su parte 0; si no, `{ nuevo: false }`. Partes 1..n-1: las del cuadro congelado (`num` tiene que casar). Nada se guarda: se suelta al llegar el siguiente.
     */
    private async cuadro(s: SesionViva, args: Args): Promise<unknown> {
        const a = this.activa;
        if (!a || a.parado || a.token !== s.token || a.de !== s.de) throw new Error("sin-pantalla");
        a.mallaHasta = this.d.ahora() + VIGENCIA_MALLA_MS;
        const pide = Number(args.pide);
        if (pide > 0) {
            const e = a.envio;
            if (!e || e.num !== Number(args.num) || !e.partes[pide]) throw new Error("cuadro-cambiado");
            return { ...e.partes[pide] };
        }
        const u = a.ultimo;
        if (!u || u.numero <= Number(args.desde)) return { nuevo: false, numero: u?.numero ?? 0 };
        let { jpeg, ancho, alto } = u;
        const niv = nivelDe(args.nivel);
        const reducir = this.d.reducir;
        if (reducir && (Number(args.nivel) > 0 || jpeg.length > MAX_CUADRO_BYTES)) {
            const r = await reducir(jpeg, ancho, alto, niv.lado, niv.calidad).catch(() => null);
            if (r) ({ jpeg, ancho, alto } = r);
        }
        if (jpeg.length > MAX_CUADRO_BYTES) return { nuevo: false, numero: u.numero, motivo: "grande" };
        const partes = partirCuadro(jpeg, u.numero);
        a.envio = { num: u.numero, partes, ancho, alto };
        return { nuevo: true, ancho, alto, ...partes[0] };
    }

    private falloSenal(paso: string, motivo: string): Error {
        this.d.anotar(`control-senal paso=${paso} lado=aparato resultado=rechazo motivo=${motivo}`);
        return new Error(motivo);
    }

    private async recibirParteOferta(a: Activa, args: Args): Promise<unknown> {
        const p = leerParte(args);
        if (!p || p.tipo !== "oferta") throw this.falloSenal("oferta", "argumentos");
        let texto: string | null;
        try {
            texto = await a.reens.meter(p);
        } catch (e) {
            throw this.falloSenal("oferta", e instanceof Error ? e.message : "fallo");
        }
        if (texto === null) return { recibida: p.i, de: p.n };
        if (a.peer) throw this.falloSenal("oferta", "ya-negociada");
        this.d.anotar(`control-senal paso=oferta lado=aparato resultado=ok partes=${p.n} largo=${p.total}`);
        let respuesta: string;
        try {
            const ice = await this.d.iceServers().catch(() => [] as RTCIceServer[]);
            const peer = this.d.crearPeer(ice);
            a.peer = peer;
            peer.ondatachannel = (e) => this.alAbrirseCanal(a, peer, e.channel);
            peer.onconnectionstatechange = () => {
                if (peer.connectionState === "failed" || peer.connectionState === "closed") void this.parar("conexion-perdida");
            };
            await peer.setRemoteDescription({ type: "offer", sdp: texto });
            peer.addTrack(a.pintor.pista(), a.pintor.flujo());
            const resp = await peer.createAnswer();
            await peer.setLocalDescription(resp);
            await this.esperarRecogida(peer);
            const sdp = peer.localDescription?.sdp ?? resp.sdp;
            if (typeof sdp !== "string") throw new Error("sin-respuesta");
            respuesta = sdp;
        } catch (e) {
            throw this.falloSenal("respuesta", e instanceof Error && e.message === "sin-respuesta" ? "sin-respuesta" : "conexion-rechazada");
        }
        let partes: ParteSenal[];
        try {
            partes = await trocear(respuesta, "respuesta", p.neg);
        } catch (e) {
            throw this.falloSenal("respuesta", e instanceof Error ? e.message : "fallo");
        }
        a.respuestas.set(p.neg, partes);
        this.d.anotar(`control-senal paso=respuesta lado=aparato resultado=ok partes=${partes.length} largo=${respuesta.length}`);
        return { lista: true, n: partes.length, total: respuesta.length, sha: partes[0].sha };
    }

    private darParteRespuesta(a: Activa, args: Args): unknown {
        const partes = a.respuestas.get(String(args.neg));
        const i = Number(args.pide);
        if (!partes || !partes[i]) throw this.falloSenal("respuesta", "sin-respuesta");
        const { i: _i, ...resto } = partes[i];
        return { ...resto, i };
    }

    private async esperarRecogida(peer: PeerLike): Promise<void> {
        if (peer.iceGatheringState === "complete") return;
        await Promise.race([
            new Promise<void>((res) => {
                peer.onicegatheringstatechange = () => {
                    if (peer.iceGatheringState === "complete") res();
                };
            }),
            this.d.esperar(ESPERA_CANDIDATOS_MS),
        ]);
    }

    /** El canal de datos de la conexión lleva órdenes firmadas (entrada) y devuelve sus respuestas. Pasan por la MISMA puerta. */
    private alAbrirseCanal(a: Activa, peer: PeerLike, canal: CanalLike): void {
        if (a.parado || a.peer !== peer) {
            canal.close();
            return;
        }
        a.canal = canal;
        canal.onclose = () => {
            if (a.canal === canal) a.canal = null;
        };
        canal.onmessage = (e) => {
            const t = e.data;
            // Una a una y en orden: la puerta exige `seq` creciente y la firma se verifica de forma asíncrona.
            a.cola = a.cola.then(async () => {
                if (a.parado || typeof t !== "string" || t.length > MAX_MENSAJE_CANAL) return;
                let sobre: unknown;
                let nonce = "";
                try {
                    const parsed = JSON.parse(t);
                    sobre = parsed;
                    nonce = typeof parsed.nonce === "string" ? parsed.nonce : "";
                } catch {
                    return;
                }
                const tEnvio = this.d.ahora();
                const r = await this.d.recibirSobre(sobre);
                const tAcuse = this.d.ahora();
                try {
                    if (!a.parado && a.canal === canal) canal.send(JSON.stringify(r));
                } catch {
                    /* el canal se cerró: la orden ya se cumplió o se rechazó y quedó en el registro */
                }
                // CTL1119B: alimentar acuse a calidad (canal de datos)
                if (nonce) {
                    const medioSnap = instantaneaMedio(a.de);
                    const medio: TipoMedio = (medioSnap.entrada.medio as TipoMedio) ?? "sin-determinar";
                    añadirAcuse(a.calidad, { nonce, tEnvio, tAcuse, medio, ok: esObjeto(r) && r.ok === true });
                }
            });
        };
    }

    // ── aparato y entrada ────────────────────────────────────────────────────────────────────

    private async leerAparato(): Promise<unknown> {
        const inv = this.d.invocar;
        if (!inv) throw new Error("sin-soporte");
        const e = await inv("control_estado_aparato").catch(() => null);
        if (!esObjeto(e)) throw new Error("sin-soporte");
        if (e.ok === false) throw new Error(typeof e.motivo === "string" && RE_MOTIVO.test(e.motivo) ? e.motivo : "sin-soporte");
        const c = await inv("control_capacidades").catch(() => null);
        // CTL1118F: la fuente REAL ahora (la que dice el aparato; si la fluida se cortó, vuelve a accesibilidad y aquí se entera). Nunca la pedida.
        const a = this.activa;
        const real = fuenteActivaDe(c);
        if (a && !a.parado && real && real !== a.fuente) this.cambiarFuente(a, real, null, real === "accesibilidad" ? "la-fluida-se-corto" : "detectado", this.d.ahora() - a.inicio);
        return { aparato: e, capacidades: esObjeto(c) ? c : null, ...(a && !a.parado ? { fuente: a.fuente } : {}) };
    }

    /** Entrega la orden de entrada, con su sobre tal como llegó, a lo nativo. Esta página no la ejecuta. */
    private async entrada(s: SesionViva, nivelOrden: string, sobre: unknown): Promise<unknown> {
        // Dos miradas: la sesión viva de la puerta y la que acompañó a la orden; las dos tienen que ser de «controlar».
        if (s.nivel !== "controlar" || nivelOrden !== "controlar") throw new Error("nivel");
        if (!esObjeto(sobre)) throw new Error("forma");
        const nonce = typeof sobre.nonce === "string" ? sobre.nonce : "";
        const tEnvio = this.d.ahora();
        const inv = this.d.invocar;
        if (!inv) throw new Error("sin-soporte");
        let r: unknown;
        try {
            r = await inv("control_entrada", { sesion: s.token, sobre });
        } catch {
            throw new Error("sin-servicio");
        }
        const tAcuse = this.d.ahora();
        // CTL1119B: alimentar acuse a calidad (canal de control)
        if (nonce && this.activa) {
            const medioSnap = instantaneaMedio(this.activa.de);
            const medio: TipoMedio = (medioSnap.ordenes.medio as TipoMedio) ?? "sin-determinar";
            añadirAcuse(this.activa.calidad, { nonce, tEnvio, tAcuse, medio, ok: esObjeto(r) && r.ok === true });
        }
        if (esObjeto(r) && r.ok === true) return { ok: true };
        const m = esObjeto(r) && typeof r.motivo === "string" && RE_MOTIVO.test(r.motivo) ? r.motivo : "fallo";
        throw new Error(m);
    }

    // ── parar ────────────────────────────────────────────────────────────────────────────────

    /** Para la pantalla y suelta todo: la fuente nativa, la conexión, el canal y el lienzo. Idempotente. */
    async parar(motivo: string): Promise<void> {
        const a = this.activa;
        if (!a) return;
        this.activa = null;
        a.parado = true;
        // CTL1119B: limpiar intervalos de calidad
        for (const i of this.intervalos) clearInterval(i);
        this.intervalos.clear();
        this.soltarOcupado?.();
        this.soltarOcupado = null;
        try {
            this.d.vigia?.parar();
        } catch {
            /* nada */
        }
        this.d.anotar(`pantalla parada motivo=${RE_MOTIVO.test(motivo) ? motivo : "parada"} cuadros=${a.cuadros}`);
        try {
            a.canal?.close();
        } catch {
            /* ya cerrado */
        }
        try {
            a.peer?.close();
        } catch {
            /* ya cerrada */
        }
        try {
            a.pintor.liberar();
            a.reens.limpiar();
            a.respuestas.clear();
        } catch {
            /* nada */
        }
        await this.d.invocar?.("control_pantalla_parar", { sesion: a.token }).catch(() => undefined);
    }
}

// ── implementación real (navegador + Tauri) ──────────────────────────────────────────────────

/** CTL1117A · S8: con la pantalla quieta no llegan cuadros nuevos y el controlador lo leía como «Sin pantalla». Si pasa `cadaMs` sin pintar, se vuelve a pedir el último cuadro (señal de vida, no imagen nueva). */
export const LATIDO_CUADROS_MS = 1500;
export function latidoDeCuadros(
    pedir: () => void,
    ahora: () => number = () => Date.now(),
    cadaMs = LATIDO_CUADROS_MS,
    /** CTL1117C: el reloj estable (Worker) en lugar del `setInterval` de la página, que oculta se alinea a 1 s o más. */
    cada?: (fn: () => void, ms: number) => () => void,
): { tocado: () => void; parar: () => void } {
    let ultimo = ahora();
    const f = () => {
        if (ahora() - ultimo >= cadaMs) {
            ultimo = ahora();
            try {
                pedir();
            } catch {
                /* la pista ya no está */
            }
        }
    };
    const periodo = Math.max(250, Math.floor(cadaMs / 3));
    if (cada) {
        const quitar = cada(f, periodo);
        return { tocado: () => void (ultimo = ahora()), parar: quitar };
    }
    const i = setInterval(f, periodo);
    return { tocado: () => void (ultimo = ahora()), parar: () => clearInterval(i) };
}

export function crearPintorReal(cada?: (fn: () => void, ms: number) => () => void): Pintor {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    // CTL1118M: WebKitGTK sin GStreamer no tiene `captureStream`: no es motivo para no servir la pantalla (por la malla no hace falta flujo).
    let flujo: MediaStream | null = null;
    try {
        flujo = typeof canvas.captureStream === "function" ? canvas.captureStream(0) : null; // 0 fps: el cuadro sale cuando se pide con requestFrame, ya pintado
    } catch {
        flujo = null;
    }
    const pista = flujo?.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    let repetidos = 0;
    const latido = latidoDeCuadros(
        () => {
            if (canvas.width > 0 && canvas.height > 0) {
                pista?.requestFrame?.();
                repetidos += 1;
            }
        },
        undefined,
        undefined,
        cada,
    );
    return {
        async pintar(jpeg, ancho, alto) {
            if (!ctx) return false;
            let bmp: ImageBitmap | null = null;
            try {
                bmp = await createImageBitmap(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
                if (canvas.width !== ancho || canvas.height !== alto) {
                    canvas.width = ancho;
                    canvas.height = alto;
                }
                ctx.drawImage(bmp, 0, 0, ancho, alto);
                pista?.requestFrame?.();
                latido.tocado();
                return true;
            } catch {
                return false;
            } finally {
                bmp?.close();
            }
        },
        latidos: () => repetidos,
        pista: () => pista,
        flujo: () => flujo,
        liberar() {
            latido.parar();
            for (const t of flujo?.getTracks() ?? []) t.stop();
            canvas.width = 0;
            canvas.height = 0;
        },
    };
}

/** CTL1118M: vuelve a codificar un JPEG más pequeño (solo para la pantalla por la malla; no corre con WebRTC). */
async function reducirReal(jpeg: Uint8Array, ancho: number, alto: number, lado: number, calidad: number): Promise<{ jpeg: Uint8Array; ancho: number; alto: number } | null> {
    let bmp: ImageBitmap | null = null;
    try {
        bmp = await createImageBitmap(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
        const k = Math.min(1, lado / Math.max(ancho, alto));
        const w = Math.max(1, Math.round(ancho * k));
        const h = Math.max(1, Math.round(alto * k));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
        const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/jpeg", calidad / 100));
        if (!blob) return null;
        return { jpeg: new Uint8Array(await blob.arrayBuffer()), ancho: w, alto: h };
    } catch {
        return null;
    } finally {
        bmp?.close();
    }
}

function invocadorTauri(): DepsOrigen["invocar"] {
    const t = (globalThis as { __TAURI__?: { core?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__;
    const inv = t?.core?.invoke;
    return typeof inv === "function" ? inv : null;
}

interface PuertaMinima {
    sesionActiva(): SesionViva | null;
    recibir(sobre: unknown): Promise<RespuestaOrden>;
    /** CTL1117C: órdenes cumplidas hasta ahora (diagnóstico de segundo plano). */
    ordenesServidas?(): number;
}
let puertaRegistrada: PuertaMinima | null = null;
/** `canal.ts` entrega aquí la puerta de este aparato al arrancar (sin import circular). */
export function registrarPuerta(p: PuertaMinima | null): void {
    puertaRegistrada = p;
}

let global: OrigenPantalla | null = null;

/** El origen de este aparato, con sus piezas reales (se crea al primer uso). */
export function origenGlobal(): OrigenPantalla {
    if (global) return global;
    // CTL1117C · FALLO 1: UN reloj estable (Worker) para las esperas del bucle, el latido de cuadros y el vigía; el Worker solo
    // existe mientras haya algo suscrito (es decir, con pantalla remota) y la página oculta no lo alinea a 1 s.
    const reloj = new RelojEstable({
        anotar: (d) => {
            void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("banco", null, d)).catch(() => undefined);
        },
    });
    const vigia = new VigiaFondo({ reloj, nota: (d) => void import("./nativo").then((m) => m.notaFondo(d)).catch(() => undefined) });
    global = new OrigenPantalla({
        invocar: invocadorTauri(),
        iceServers: async () => {
            const { obtenerIceServidores } = await import("@/lib/llamadas/ice");
            return (await obtenerIceServidores()).iceServers;
        },
        crearPeer: (iceServers) => new RTCPeerConnection({ iceServers }) as unknown as PeerLike,
        crearPintor: () => crearPintorReal((f, ms) => reloj.cada(f, ms)),
        sesionViva: () => puertaRegistrada?.sesionActiva() ?? null,
        recibirSobre: async (sobre) => (puertaRegistrada ? puertaRegistrada.recibir(sobre) : { tipo: "respuesta", nonce: "", ok: false, motivo: "sin-puerta" }),
        esperar: (ms) => esperarCon(reloj, ms),
        ahora: () => Date.now(),
        vigia,
        reducir: reducirReal,
        ordenesServidas: () => puertaRegistrada?.ordenesServidas?.() ?? 0,
        anotar: (l) => {
            void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("banco", null, l)).catch(() => undefined);
            try {
                console.info(`[control-neuronas] ${l}`);
            } catch {
                /* nada */
            }
        },
    });
    return global;
}

/** Que la puerta avise de que cambió la sesión: si el origen existe y su sesión ya no vale, para. */
export function revisarOrigen(): void {
    void global?.revisar();
}
