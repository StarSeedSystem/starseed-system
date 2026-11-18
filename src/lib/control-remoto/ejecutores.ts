/**
 * Control entre mis neuronas · lo que hace cada orden YA VALIDADA dentro de la propia app (ORD1114P,
 * fase 1: solo órdenes dirigidas a la app). Reutiliza tal cual las funciones de llamadas que usa la
 * persona con el dedo; nada sale de la app, nada toca permisos del sistema ni los concede.
 *
 * Los módulos de llamadas se cargan a demanda (`import()`): este archivo cuelga del montaje global y
 * no debe arrastrar el motor al grafo común (CLAUDE.md, «el layout raíz no carga motores pesados»).
 */

import type { Args } from "./niveles";

/** Evento que la banda (montada en el layout, con el enrutador de Next) atiende para abrir una ruta. */
export const EVENTO_ABRIR_RUTA = "starseed:control-abrir-ruta";

const ORDENES_PANTALLA = new Set(["pantalla-iniciar", "pantalla-parar", "pantalla-senal", "pantalla-cuadro", "leer-aparato", "gesto", "tecla", "volumen", "brillo", "texto"]);
function esOrdenDePantalla(nombre: string): boolean {
    return ORDENES_PANTALLA.has(nombre);
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
        default:
            throw new Error("accion-desconocida");
    }
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
