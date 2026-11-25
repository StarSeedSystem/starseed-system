/**
<<<<<<< HEAD
 * CTL1124D · la pantalla por la malla no se queda negra: los cuadros que llegan
 * por la malla cuentan en cuadros/s y resolución, y una fuente «proyeccion»
 * no devuelve respuesta vacía. Solo funciones puras (sin red, sin disco).
 */
import { describe, expect, it } from "vitest";
import {
    calcularMetricas,
    añadirCuadro,
    estadoInicial,
    type CuadroRecibido,
    type TipoMedio,
} from "../calidad";
import {
    estadoCuadros,
    textoFps,
    rotuloFuenteMedida,
    veredictoFuente,
    fuenteActivaDe,
    proyeccionConcedida,
    rotuloFuente,
    type FuentePedida,
    type FuenteReal,
    type MedidaCuadros,
} from "../fuente-pantalla";

const AHORA = 1_000_000;
const medioMalla: TipoMedio = "red-local";

function mCuadro(t: number, bytes: number, ancho: number, alto: number): CuadroRecibido {
    return { t, bytes, ancho, alto, completo: true, codec: "jpeg" };
}

function medida(parcial: Partial<MedidaCuadros> = {}): MedidaCuadros {
    return { fuente: "proyeccion", cuadros: 0, desdeInicioMs: 0, desdeUltimoMs: null, ...parcial };
}

describe("CTL1124D · cuadros por la malla cuentan en el medidor", () => {
    it("varios cuadros llegados por la malla dan fps > 0 y resolución del último", () => {
        const e = estadoInicial("controlador", medioMalla);
        for (let i = 0; i < 5; i++) {
            añadirCuadro(e, mCuadro(AHORA - 2_000 + i * 200, 30_000, 1280, 720));
        }
        const m = calcularMetricas(e, AHORA);
        expect(m.fps).toBeGreaterThan(0);
        expect(m.resolucion).toEqual({ ancho: 1280, alto: 720 });
        expect(m.cuadrosEnVentana).toBe(5);
    });

    it("un solo cuadro da resolución aunque no fps (único en la ventana)", () => {
        const e = estadoInicial("controlador", medioMalla);
        añadirCuadro(e, mCuadro(AHORA - 200, 30_000, 1920, 1080));
        const m = calcularMetricas(e, AHORA);
        expect(m.fps).toBe(0);
        expect(m.resolucion).toEqual({ ancho: 1920, alto: 1080 });
        expect(m.codec).toBe("jpeg");
    });
});

describe("CTL1124D · el rótulo muestra cuadros/s", () => {
    it("textoFps: un decimal con coma por debajo de 10, entero por encima", () => {
        expect(textoFps(2.75)).toBe("2,8");
        expect(textoFps(2.74)).toBe("2,7");
        expect(textoFps(15)).toBe("15");
        expect(textoFps(0)).toBe("0,0");
        expect(textoFps(undefined)).toBeNull();
        expect(textoFps(-1)).toBeNull();
    });

    it("rotuloFuenteMedida anexa los cuadros medidos a la fuente real", () => {
        expect(rotuloFuenteMedida("proyeccion", 2.7)).toBe("Pantalla fluida (proyección) · 2,7 cuadros/s");
        expect(rotuloFuenteMedida("accesibilidad", 4)).toBe("Pantalla por accesibilidad · 4,0 cuadros/s");
        expect(rotuloFuenteMedida("proyeccion")).toBe("Pantalla fluida (proyección)");
        expect(rotuloFuenteMedida(null)).toBe("Pantalla: aún sin fuente");
    });
});

describe("CTL1124D · fuente «proyeccion» no es una respuesta vacía", () => {
    it("veredictoFuente: pedida proyeccion y real proyeccion = cumplida", () => {
        expect(veredictoFuente("proyeccion", "proyeccion")).toEqual({ cumplida: true, aviso: null });
    });

    it("veredictoFuente: pedida proyeccion pero real accesibilidad = no cumplida con aviso", () => {
        const v = veredictoFuente("proyeccion", "accesibilidad");
        expect(v.cumplida).toBe(false);
        expect(v.aviso).toContain("proyección");
    });

    it("veredictoFuente: real null (no hay fuente todavía) = no cumplida", () => {
        expect(veredictoFuente("proyeccion", null)).toEqual({ cumplida: false, aviso: null });
    });

    it("fuenteActivaDe lee fuente_activa de las capacidades del aparato", () => {
        expect(fuenteActivaDe({ pantalla: { fuente_activa: "proyeccion" } })).toBe("proyeccion");
        expect(fuenteActivaDe({ pantalla: { fuente_activa: "accesibilidad" } })).toBe("accesibilidad");
        expect(fuenteActivaDe({ pantalla: {} })).toBeNull();
        expect(fuenteActivaDe(null)).toBeNull();
    });

    it("proyeccionConcedida solo es true si pantalla.proyeccion === true", () => {
        expect(proyeccionConcedida({ pantalla: { proyeccion: true } })).toBe(true);
        expect(proyeccionConcedida({ pantalla: { proyeccion: false } })).toBe(false);
        expect(proyeccionConcedida({ pantalla: {} })).toBe(false);
        expect(proyeccionConcedida(null)).toBe(false);
    });

    it("rotuloFuente nombra la fuente real (proyección / accesibilidad / sin determinar)", () => {
        expect(rotuloFuente("proyeccion")).toBe("Pantalla fluida (proyección)");
        expect(rotuloFuente("accesibilidad")).toBe("Pantalla por accesibilidad");
        expect(rotuloFuente(null)).toBe("Pantalla: aún sin fuente");
    });
});

describe("CTL1124D · salud de los cuadros con fuente proyeccion", () => {
    it("con fuente proyeccion y cuadros recibidos la pantalla da imagen", () => {
        expect(estadoCuadros(medida({ cuadros: 3, desdeUltimoMs: 100 }))).toBe("dando");
    });

    it("sin fuente no hay imagen aunque pasen los ms", () => {
        expect(estadoCuadros(medida({ fuente: null, desdeInicioMs: 9_000 }))).toBe("sin-fuente");
=======
 * CTL1124D · Mac controla Linux: los cuadros llegan «ok» y la ventana queda negra.
 *
 * Medido con la .63: muchas órdenes `pantalla-cuadro` con resultado ok, pero ninguna imagen pintada
 * (`fps=0`, `resolucion=desconocida`). Aquí se fija el contrato de dos fallos que producían ese negro:
 *  1. la captura compartida del aparato quedaba marcada «en marcha» para siempre al cerrarse la última
 *     pantalla, así que al volver a abrir el control ya no se capturaba ni un cuadro (`nuevo: false` eterno);
 *  2. si el cuadro no cabía (`motivo: "grande"`), quien manda lo trataba como «sin cuadro» y no pedía
 *     un nivel más pequeño, de modo que nunca llegaba nada que pintar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nivelParaCuadroGrande, partirCuadro } from "../cuadro-malla";
import { OrigenPantalla, type DepsOrigen, type Pintor, type SesionViva } from "../pantalla-origen";
import { PantallaDestino, type DepsDestino, type PeerDestinoLike } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";

const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));
const TOKEN = "a".repeat(32);
const SESION: SesionViva = { token: TOKEN, de: "h".repeat(64), nivel: "ver" };
const ctx = { sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: TOKEN, nivel: "ver" } };
const pintor: Pintor = { pintar: async () => true, pista: () => ({}), flujo: () => ({}), liberar: () => undefined } as unknown as Pintor;

function cuadro(numero: number, jpeg = 500): Uint8Array {
    const b = new Uint8Array(12 + jpeg);
    const v = new DataView(b.buffer);
    v.setUint32(0, numero, true);
    v.setUint16(4, 640, true);
    v.setUint16(6, 360, true);
    for (let i = 0; i < jpeg; i++) b[12 + i] = (i * 7 + numero) & 255;
    return b;
}

describe("CTL1124D · la captura compartida vuelve tras cerrar y abrir el control", () => {
    let cola: Uint8Array[];
    let origen: OrigenPantalla;

    beforeEach(() => {
        cola = [];
        origen = new OrigenPantalla({
            invocar: async (cmd) => {
                if (cmd === "control_pantalla_cuadro") return cola.shift() ?? new Uint8Array(0);
                if (cmd === "control_pantalla_iniciar") return { ok: true, fuente: "proyeccion", ancho: 640, alto: 360, giro: 0 };
                if (cmd === "control_capacidades") return { pantalla: { accesibilidad: true }, entrada: { gestos: true, max_dedos: 10, teclas: [], volumen: false, brillo: false, texto: false }, falta: [] };
                return { ok: true };
            },
            iceServers: async () => [],
            crearPeer: () => ({}) as never,
            crearPintor: () => pintor,
            sesionViva: () => SESION,
            recibirSobre: async () => ok(),
            esperar: () => pausa(1),
            ahora: () => Date.now(),
            anotar: () => undefined,
            sistemaOperativo: () => "Linux",
        } as DepsOrigen);
    });

    afterEach(async () => void (await origen.parar("fin")));

    async function abrirYCapturar(numero: number): Promise<void> {
        await origen.ejecutar("pantalla-iniciar", {}, ctx);
        cola.push(cuadro(numero));
        for (let i = 0; i < 100 && cola.length > 0; i++) await pausa(2);
    }

    it("tras parar la última pantalla, un control nuevo vuelve a capturar y sirve su cuadro", async () => {
        await abrirYCapturar(1);
        const primero = (await origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 0 }, ctx)) as Record<string, unknown>;
        expect(primero).toMatchObject({ nuevo: true, num: 1 });

        await origen.parar("fin"); // la persona cierra la ventana de control
        cola.length = 0;

        await abrirYCapturar(2);
        expect(cola).toHaveLength(0); // con el fallo nadie consume el cuadro: la captura se creía en marcha
        const segundo = (await origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 0 }, ctx)) as Record<string, unknown>;
        expect(segundo).toMatchObject({ nuevo: true, num: 2 });
    });
});

describe("CTL1124D · un cuadro «grande» se vuelve a pedir más pequeño", () => {
    it("baja de nivel hasta el mínimo, nunca se queda en el mismo", () => {
        expect(nivelParaCuadroGrande(0)).toBe(1);
        expect(nivelParaCuadroGrande(2)).toBe(3);
        expect(nivelParaCuadroGrande(3)).toBe(3);
        expect(nivelParaCuadroGrande(-1)).toBe(1);
    });

    it("quien manda escala el nivel, pinta y mide el cuadro por la malla", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
        const origRtc = globalThis.RTCPeerConnection;
        (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = function () {
            return {};
        };
        const niveles: number[] = [];
        const pintados: { ancho: number; alto: number }[] = [];
        const lineas: string[] = [];
        const jpeg = new Uint8Array(400);
        const deps: DepsDestino = {
            mandar: async (nombre, args) => {
                if (nombre === "abrir-sesion") return ok({ sesion: TOKEN, nivel: "controlar", caduca: new Date(Date.now() + 3 * 60_000).toISOString() });
                if (nombre === "pantalla-iniciar") return ok({ ok: true, fuente: "proyeccion", ancho: 640, alto: 360, giro: 0, webrtc: false, capacidades: { entrada: { gestos: true, max_dedos: 10, teclas: [], volumen: false, brillo: false, texto: false } } });
                if (nombre === "pantalla-cuadro") {
                    await new Promise((r) => setTimeout(r, 1)); // deja avanzar los temporizadores falsos
                    const nivel = Number(args.nivel);
                    if (Number(args.pide) === 0) {
                        niveles.push(nivel);
                        const num = Number(args.desde) + 1;
                        if (nivel < 3) return ok({ nuevo: false, numero: num, motivo: "grande" });
                        if (num > 2) return ok({ nuevo: false, numero: 2 });
                        return ok({ nuevo: true, ancho: 640, alto: 360, ...partirCuadro(jpeg, num)[0] });
                    }
                    return ok(partirCuadro(jpeg, Number(args.num))[Number(args.pide)]);
                }
                return ok({ aparato: {} });
            },
            firmar: async () => null,
            iceServers: async () => [],
            crearPeer: () => ({}) as PeerDestinoLike,
            flujoDe: () => null,
            ahora: () => Date.now(),
            anotar: (l) => void lineas.push(l),
            malla: {
                hayWebRtc: () => false,
                crearLienzo: () => ({ pintar: async (_j, ancho, alto) => (pintados.push({ ancho, alto }), true), flujo: () => null, liberar: () => undefined }),
                enlace: () => ({ camino: "directo", medio: "red-local" }),
                esperar: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 2))),
            },
        };
        const d = new PantallaDestino("tableta", deps);
        try {
            await d.iniciar();
            await vi.advanceTimersByTimeAsync(500);
            expect(niveles).toEqual(expect.arrayContaining([0, 1, 2, 3]));
            expect(pintados.length).toBeGreaterThan(0);
            expect(lineas.some((l) => l.includes("causa=cuadro-grande nivel=3"))).toBe(true);
            const s = d.instantanea();
            expect(s.calidad?.cuadrosEnVentana).toBeGreaterThan(0);
            expect(s.calidad?.resolucion).toEqual({ ancho: 640, alto: 360 });
        } finally {
            await d.cerrar("fin", false);
            vi.useRealTimers();
            (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = origRtc;
        }
>>>>>>> 839b0df5a (salvavidas · CTL1124Db-d1: trabajo del agente antes de las puertas (tsc / vitest))
    });
});
