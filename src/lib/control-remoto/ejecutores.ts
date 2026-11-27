/**
 * Control entre mis neuronas · lo que hace cada orden YA VALIDADA dentro de la propia app (ORD1114P,
 * fase 1: solo órdenes dirigidas a la app). Reutiliza tal cual las funciones de llamadas que usa la
 * persona con el dedo; nada sale de la app, nada toca permisos del sistema ni los concede.
 *
 * Los módulos de llamadas se cargan a demanda (`import()`): este archivo cuelga del montaje global y
 * no debe arrastrar el motor al grafo común (metagenesis.md, «el layout raíz no carga motores pesados»).
 *
 * BAP1127I · `prueba-control` contesta `{estado:"aceptada", id}` al instante (`mandarOrden` espera 15 s,
 * `canal.ts:27`) y hace la prueba en segundo plano; el fin se avisa por registro, no con una respuesta larga.
 * Hacen falta DOS sesiones aceptadas con el permiso encendido en cada dueño: Mac→origen y origen→destino
 * (`sesion.ts` pasos 2, 4 y 13: permiso, aparato aceptado por clave y sesión viva con latidos). El origen
 * abre la suya hacia el destino por el mismo camino que la pantalla «Controlar» (`crearPantallaDestino`),
 * sin encender permisos ni pedir aceptación a distancia.
 */

import type { Args } from "./niveles";
import { validarArgsPruebaControl, finalizarPrueba, type ArgsPruebaControl, type InformePruebaControl } from "./prueba-control";
import { fuentePedidaValida, type FuentePedida } from "./fuente-pantalla";

/** Evento que la banda (montada en el layout, con el enrutador de Next) atiende para abrir una ruta. */
export const EVENTO_ABRIR_RUTA = "starseed:control-abrir-ruta";

const ORDENES_PANTALLA = new Set(["pantalla-iniciar", "pantalla-parar", "pantalla-senal", "pantalla-cuadro", "leer-aparato", "gesto", "tecla", "volumen", "brillo", "texto"]);
function esOrdenDePantalla(nombre: string): boolean {
    return ORDENES_PANTALLA.has(nombre);
}

// ── BAP1127I · prueba-control (puro salvo el camino inyectado) ────────────────────────────────

export type MotivoPruebaControl = "ok" | "espera-permiso" | "ocupado" | "duracion" | "argumentos" | `fallo:${string}`;
type VeredictoPrueba = { motivo: "duracion" | "argumentos" | "espera-permiso" | "ocupado" } | { args: ArgsPruebaControl };

export interface CaminoControlPrueba {
    permisoEncendido: boolean;
    llamadaEnCurso: boolean;
    id(): string;
    abrir(destino: string, fuente: FuentePedida): Promise<{ ok: boolean; cuadros: number; latenciaMs: number; motivo?: string }>;
    esperar(ms: number): Promise<void>;
    cerrar(): Promise<void>;
    anotar(linea: string): void;
    enSegundoPlano(tarea: () => Promise<void>): void;
}

/** Decide SIN abrir nada. El validador de PRU1126A manda; después permiso y llamada, en ese orden. */
export function veredictoPruebaControl(args: Args, camino: CaminoControlPrueba): VeredictoPrueba {
    const base = {
        destino: typeof args.destino === "string" ? args.destino : "",
        fuente: typeof args.fuente === "string" ? args.fuente : "",
        nivel: typeof args.nivel === "string" ? args.nivel : undefined,
    };
    const duracionMs = typeof args.duracionMs === "number" ? args.duracionMs : Number.NaN;
    const validas = validarArgsPruebaControl({ ...base, duracionMs });
    if (!validas) {
        const sinDuracion = validarArgsPruebaControl({ ...base, duracionMs: 30_000 });
        return { motivo: sinDuracion ? "duracion" : "argumentos" };
    }
    if (!camino.permisoEncendido) return { motivo: "espera-permiso" };
    if (camino.llamadaEnCurso) return { motivo: "ocupado" };
    return { args: validas };
}

/** Las tres líneas del registro: solo 8 hex de destino, nunca huella completa ni IP. */
export function lineasPruebaControl(id: string, destino: string, durS: number, motivo: MotivoPruebaControl, informe?: InformePruebaControl) {
    const d8 = destino.slice(0, 8);
    const dur = Math.max(0, Math.floor(durS));
    const estado = motivo === "ok" ? "ok" : motivo.startsWith("fallo:") ? "fallo" : "sin-dato";
    const datos = informe ? ` cuadros=${informe.cuadros} latencia=${informe.latenciaMs} informe=${informe.duracionMs}` : "";
    return {
        inicio: `prueba-control inicio id=${id} destino=${d8} dur=${dur} resultado=${motivo}`,
        fin: `prueba-control fin id=${id} destino=${d8} dur=${dur} resultado=${motivo}`,
        avisoFin: `prueba-fin id=${id} resultado=${estado} motivo=${motivo} destino=${d8} dur=${dur}${datos}`,
    };
}

/** Contesta al instante; el rechazo sale como `Error` con motivo corto (lo que `sesion.ts` reenvía). */
export async function ejecutarPruebaControlCon(args: Args, camino: CaminoControlPrueba): Promise<{ estado: "aceptada"; id: string }> {
    const id = camino.id();
    const destino = typeof args.destino === "string" ? args.destino : "";
    const durS = typeof args.duracionMs === "number" && Number.isFinite(args.duracionMs) ? args.duracionMs / 1000 : 0;
    const v = veredictoPruebaControl(args, camino);
    if ("motivo" in v) {
        const lineas = lineasPruebaControl(id, destino, durS, v.motivo);
        camino.anotar(lineas.inicio);
        camino.anotar(lineas.fin);
        camino.anotar(lineas.avisoFin);
        throw new Error(v.motivo);
    }
    camino.anotar(lineasPruebaControl(id, v.args.destino, durS, "ok").inicio);
    camino.enSegundoPlano(async () => {
        let fin: MotivoPruebaControl = "ok";
        let informe: InformePruebaControl | null = null;
        try {
            const r = await camino.abrir(v.args.destino, fuentePedidaValida(v.args.fuente));
            if (!r.ok) {
                fin = `fallo:${r.motivo ?? "sin-sesion"}`;
            } else {
                await camino.esperar(v.args.duracionMs);
                informe = finalizarPrueba({ cuadros: r.cuadros, latenciaMs: r.latenciaMs, retardoMs: 0 });
                if (!informe.ok) fin = `fallo:${informe.motivo}`;
            }
        } catch (e) {
            fin = `fallo:${e instanceof Error ? e.message.slice(0, 40) : "excepcion"}`;
        } finally {
            await camino.cerrar().catch(() => undefined);
            const lineas = lineasPruebaControl(id, v.args.destino, durS, fin, informe ?? undefined);
            camino.anotar(lineas.fin);
            camino.anotar(lineas.avisoFin);
        }
    });
    return { estado: "aceptada", id };
}

/** ¿Hay una simulación de corte IP en curso? (solo para el estado y el registro; nunca cuenta como real) */
let corteIpSimulado = false;

interface MotorMinimo {
    estado(): { micro?: boolean; camara?: boolean; contestada?: boolean; inicio?: number | null };
    alternarMicro(): Promise<string | null>;
    alternarCamara(): Promise<string | null>;
    forzarCarril(flujo: "voz" | "video", carril: "ble-l2cap" | null): void;
    metricasPares?(): unknown;
}

async function llamadas() {
    const store = await import("@/lib/llamadas/store");
    return store.leerLlamadas();
}

function motorActivo(e: Awaited<ReturnType<typeof llamadas>>): MotorMinimo | null {
    return (e.activa?.motor as unknown as MotorMinimo | undefined) ?? null;
}

/** Ejecuta una acción de la lista cerrada. `cuentaPropia` sirve para contestar solo timbres de la misma cuenta. */
export async function ejecutarEnApp(
    nombre: string,
    args: Args,
    ctx: { cuentaPropia: string | null; sobre?: unknown; sesion?: { token: string; nivel: string } },
): Promise<unknown> {
    // PAN1115J: pantalla y entrada las lleva `pantalla-origen` (la página no ejecuta la entrada: la entrega a Rust/Kotlin).
    if (esOrdenDePantalla(nombre)) {
        const { origenGlobal } = await import("./pantalla-origen");
        return origenGlobal().ejecutar(nombre, args, ctx);
    }
    switch (nombre) {
        case "leer-estado":
            return leerEstadoApp();
        case "llamar": {
            const e = await llamadas();
            if (e.activa) throw new Error("otra-llamada");
            const { conversacionDeNeurona } = await import("@/lib/mensajeria/neuronas/agrupar");
            const { llamarANeurona } = await import("@/lib/mensajeria/neuronas/llamadas-neurona");
            const conversacion = conversacionDeNeurona({ id: String(args.neurona), name: "Neurona" });
            (await import("@/lib/banco-llamadas/a-mano")).vigiaMano.esperar("llamar", Date.now()); // ORD1114Q
            const r = await llamarANeurona({ conversacion, tipo: args.tipo === "audio" ? "audio" : "video" } as Parameters<typeof llamarANeurona>[0]);
            return r;
        }
        case "contestar": {
            const e = await llamadas();
            if (e.activa) throw new Error("otra-llamada");
            const cuenta = ctx.cuentaPropia;
            const t = [...e.timbres].filter((x) => !cuenta || x.llamante.uid === cuenta).sort((a, b) => b.llegada - a.llegada)[0];
            if (!t) throw new Error("sin-timbre");
            if (await mediosNegados(args.camara === true)) throw new Error("falta-permiso");
            const { aceptarTimbre } = await import("@/lib/llamadas/acciones");
            (await import("@/lib/banco-llamadas/a-mano")).vigiaMano.esperar("contestar", Date.now()); // ORD1114Q
            await aceptarTimbre(t, { camara: args.camara === true });
            const b = args.banco as { esc: string; serie: string; n: number } | undefined;
            if (b) {
                const { anotarLlamada } = await import("@/lib/llamadas/voz-datos/diagnostico");
                anotarLlamada("banco", null, `contesta esc=${b.esc} serie=${b.serie} n=${b.n} camara=${args.camara === true ? "si" : "no"}`);
            }
            return { contestada: t.sesionId };
        }
        case "colgar": {
            const e = await llamadas();
            if (!e.activa) throw new Error("sin-llamada");
            const { colgarLlamada } = await import("@/lib/llamadas/acciones");
            (await import("@/lib/banco-llamadas/a-mano")).vigiaMano.esperar("colgar", Date.now()); // ORD1114Q
            colgarLlamada("orden");
            return { colgada: true };
        }
        case "micro":
        case "camara": {
            const m = motorActivo(await llamadas());
            if (!m) throw new Error("sin-llamada");
            const ahora = nombre === "micro" ? !!m.estado().micro : !!m.estado().camara;
            if (ahora !== args.activo) {
                const err = nombre === "micro" ? await m.alternarMicro() : await m.alternarCamara();
                if (err) throw new Error("falta-permiso");
            }
            return { [nombre]: args.activo };
        }
        case "abrir-ruta": {
            if (typeof window === "undefined") throw new Error("sin-ventana");
            window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_RUTA, { detail: { ruta: String(args.ruta) } }));
            return { ruta: args.ruta };
        }
        case "simular-corte-ip":
        case "simular-vuelve-ip": {
            const m = motorActivo(await llamadas());
            if (!m) throw new Error("sin-llamada");
            const corta = nombre === "simular-corte-ip";
            // SIMULACIÓN: fuerza voz y vídeo al Bluetooth (o vuelve a la elección automática). La radio,
            // los sockets y los eventos de red del sistema NO cambian: nunca cuenta como la prueba real.
            m.forzarCarril("voz", corta ? "ble-l2cap" : null);
            m.forzarCarril("video", corta ? "ble-l2cap" : null);
            corteIpSimulado = corta;
            const { anotarLlamada } = await import("@/lib/llamadas/voz-datos/diagnostico");
            anotarLlamada("banco", null, `simulacion ${corta ? "corte-ip" : "vuelve-ip"} medio_real=no`);
            return { simulacion: true, corteIp: corta };
        }
        case "prueba-control": {
            const [{ leerPermisoLocal, nonceNuevo }, e] = await Promise.all([import("./canal"), llamadas()]);
            let pantalla: import("./pantalla-destino").PantallaDestino | null = null;
            const anotar = (linea: string): void => {
                void import("@/lib/llamadas/voz-datos/diagnostico").then((m) => m.anotarLlamada("banco", null, linea)).catch(() => undefined);
            };
            const camino: CaminoControlPrueba = {
                permisoEncendido: leerPermisoLocal().encendido,
                llamadaEnCurso: !!e.activa,
                id: () => nonceNuevo().slice(0, 16),
                anotar,
                abrir: async (destino, fuente) => {
                    const { crearPantallaDestino } = await import("./pantalla-destino");
                    pantalla = crearPantallaDestino(destino, { fuente });
                    await pantalla.iniciar();
                    const s = pantalla.instantanea();
                    return { ok: s.estado === "conectando" || s.estado === "en-vivo" || s.estado === "pausa-local", cuadros: s.calidad?.cuadrosEnVentana ?? 0, latenciaMs: s.calidad?.rttMs ?? 0, motivo: s.motivo };
                },
                esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
                cerrar: async () => { await pantalla?.cerrar("prueba-control-fin", true); },
                enSegundoPlano: (tarea) => { void tarea(); },
            };
            return ejecutarPruebaControlCon(args, camino);
        }
        case "terminal-ejecutar": {
            // TRM1125B: la web no ejecuta nada; pide a Rust, que decide con el permiso del aparato (apagado por defecto).
            const orden = ordenDeTerminal(String(args.comando), (args.args ?? {}) as Args);
            if (orden === null) throw new Error("argumentos");
            const [{ puenteNativo }, { ejecutarTerminal, resumenResultado }] = await Promise.all([import("@/lib/nativa/puente"), import("@/lib/nativa/terminal-cliente")]);
            const r = await ejecutarTerminal(puenteNativo().llamar, orden, { nivel: "usuario" }); // administrador: solo por el ayudante (TRM1125C)
            if (!r.ok) throw new Error(r.motivo);
            return { ...r.valor, resumen: resumenResultado(r.valor) };
        }
        case "terminal-cerrar": {
            const [{ puenteNativo }, { cancelarTerminal }] = await Promise.all([import("@/lib/nativa/puente"), import("@/lib/nativa/terminal-cliente")]);
            const r = await cancelarTerminal(puenteNativo().llamar);
            if (!r.ok) throw new Error(r.motivo);
            return { cerrada: true };
        }
        default:
            throw new Error("accion-desconocida");
    }
}

/** La orden de una línea para Rust a partir de un comando tipado; null si algún argumento no es un token simple (nada de shell). */
export function ordenDeTerminal(comando: string, args: Args): string | null {
    const partes = [comando];
    for (const [k, v] of Object.entries(args)) {
        if (v === true) partes.push(`--${k}`);
        else if (v === false || v === "" || v === undefined) continue;
        else if ((typeof v === "string" || typeof v === "number") && /^[\w./:@-]+$/.test(String(v))) partes.push(`--${k}`, String(v));
        else return null;
    }
    return partes.join(" ");
}

/**
 * ¿El sistema ya NEGÓ cámara o micrófono a esta página? Solo lee (`navigator.permissions.query`, que no
 * abre ningún diálogo); nunca pide ni concede nada. Si no se puede leer, decide el sistema al abrir la
 * pista, igual que cuando contesta la persona con el dedo.
 */
async function mediosNegados(conCamara: boolean): Promise<boolean> {
    try {
        const p = (globalThis as { navigator?: { permissions?: { query(d: { name: string }): Promise<{ state: string }> } } }).navigator?.permissions;
        if (!p) return false;
        const nombres = conCamara ? ["microphone", "camera"] : ["microphone"];
        for (const n of nombres) {
            const r = await p.query({ name: n }).catch(() => null);
            if (r?.state === "denied") return true;
        }
        return false;
    } catch {
        return false;
    }
}

/** El estado que lee «leer-estado»: ruta, llamada y sus números, enlaces y su medio, versión y build. */
export async function leerEstadoApp(): Promise<Record<string, unknown>> {
    const e = await llamadas();
    const m = motorActivo(e);
    const est = m?.estado();
    let enlaces: Array<{ tipo: string; via: string }> = [];
    try {
        const t = await import("@/lib/malla/transporte-universal");
        enlaces = (await t.enlacesDisponibles()).slice(0, 12).map((x) => ({ tipo: String(x.tipo), via: t.etiquetaDeVia(x) }));
    } catch {
        enlaces = [];
    }
    const { OS_VERSION } = await import("@/lib/version/os-release");
    const { etiquetaBuild } = await import("@/lib/pwa/build-corriendo");
    return {
        ruta: typeof window !== "undefined" ? window.location.pathname : null,
        llamada: e.activa
            ? {
                  tipo: e.activa.tipo,
                  contestada: !!est?.contestada,
                  inicio: est?.inicio ?? null,
                  micro: !!est?.micro,
                  camara: !!est?.camara,
                  numeros: m?.metricasPares?.() ?? null,
                  corteIpSimulado,
              }
            : null,
        timbres: e.timbres.length,
        enlaces,
        version: OS_VERSION,
        web: etiquetaBuild(),
        leido: new Date().toISOString(),
    };
}
