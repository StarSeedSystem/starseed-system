/**
 * CTL1124G · Android controlado: accesibilidad a 0 cuadros/s → aviso de pantalla fluida en la tableta
 * Pruebas de lógica pura: sin red, sin disco, sin procesos.
 */
import { describe, expect, it } from "vitest";
import {
    debePedirFluida,
    fuenteActivaDe,
    proyeccionConcedida,
    rotuloFuenteMedida,
    textoFps,
    ayudaFluida,
    FuenteReal,
} from "../fuente-pantalla";

describe("CTL1124G · Android: accesibilidad a 0 cuadros/s dispara aviso de pantalla fluida", () => {
    describe("textoFps con 0 cuadros/s", () => {
        it("0 fps devuelve «0,0» (un decimal para fps < 10)", () => {
            expect(textoFps(0)).toBe("0,0");
            expect(textoFps(0.0)).toBe("0,0");
        });
    });

    describe("rotuloFuenteMedida con accesibilidad y 0 fps", () => {
        it("muestra la fuente y 0,0 cuadros/s", () => {
            expect(rotuloFuenteMedida("accesibilidad", 0)).toBe("Pantalla por accesibilidad · 0,0 cuadros/s");
            expect(rotuloFuenteMedida("accesibilidad", 0.0)).toBe("Pantalla por accesibilidad · 0,0 cuadros/s");
        });
    });

    describe("ayudaFluida con accesibilidad", () => {
        it("incluye texto claro para aceptar la pantalla fluida", () => {
            const ayuda = ayudaFluida("accesibilidad");
            expect(ayuda).not.toBeNull();
            expect(ayuda).toMatch(/pantalla fluida/i);
            expect(ayuda).toMatch(/aparato|tableta|dispositivo/i);
        });
        it("no muestra ayuda con proyección", () => {
            expect(ayudaFluida("proyeccion")).toBeNull();
        });
    });

    describe("debePedirFluida: detección de accesibilidad sin cuadros", () => {
        it("pide fluida si accesibilidad y 0 cuadros recibidos (primera vez)", () => {
            // La lógica pura no sabe de cuadros; la detección de 0 fps vive en pantalla-origen
            // Esta prueba documenta el comportamiento actual: pide una vez por sesión
            expect(debePedirFluida("accesibilidad", 0, false)).toBe(true);
        });
        it("NO pide fluida automáticamente si ya se pidió una vez (sin manual)", () => {
            expect(debePedirFluida("accesibilidad", 1, false)).toBe(false);
        });
        it("SÍ pide fluida si la persona lo pide manualmente (aunque ya se pidió)", () => {
            expect(debePedirFluida("accesibilidad", 1, true)).toBe(true);
            expect(debePedirFluida("accesibilidad", 3, true)).toBe(true);
        });
        it("NUNCA pide fluida si ya va por proyección", () => {
            expect(debePedirFluida("proyeccion", 0, false)).toBe(false);
            expect(debePedirFluida("proyeccion", 0, true)).toBe(false);
        });
    });

    describe("fuenteActivaDe y proyeccionConcedida: lectura robusta de capacidades", () => {
        it("lee proyeccion=true cuando el «Sí» ya está dado en el aparato", () => {
            expect(proyeccionConcedida({ pantalla: { proyeccion: true } })).toBe(true);
        });
        it("ignora valores no booleanos en proyeccion", () => {
            expect(proyeccionConcedida({ pantalla: { proyeccion: "si" } })).toBe(false);
            expect(proyeccionConcedida({ pantalla: { proyeccion: 1 } })).toBe(false);
        });
        it("lee fuente_activa real del aparato", () => {
            expect(fuenteActivaDe({ pantalla: { fuente_activa: "accesibilidad" } })).toBe("accesibilidad");
            expect(fuenteActivaDe({ pantalla: { fuente_activa: "proyeccion" } })).toBe("proyeccion");
            expect(fuenteActivaDe({ pantalla: { fuente_activa: "otra" } })).toBeNull();
        });
        it("devuelve null si capacidades no tiene la forma esperada", () => {
            expect(fuenteActivaDe(null)).toBeNull();
            expect(fuenteActivaDe({})).toBeNull();
            expect(fuenteActivaDe({ pantalla: null })).toBeNull();
            expect(fuenteActivaDe({ pantalla: "no-objeto" })).toBeNull();
        });
    });
});

describe("CTL1124G · registro de rechazo de pantalla fluida", () => {
    // La anotación en el registro se prueba en pantalla-origen.test.ts vía `anotar`
    // Aquí solo verificamos que las funciones puras devuelven lo necesario para registrar
    it("rotuloFuenteMedida da el texto exacto para el registro", () => {
        expect(rotuloFuenteMedida("accesibilidad", 0)).toBe("Pantalla por accesibilidad · 0,0 cuadros/s");
    });
    it("ayudaFluida da el texto para mostrar en la tableta", () => {
        const ayuda = ayudaFluida("accesibilidad");
        expect(ayuda).not.toBeNull();
        expect(typeof ayuda).toBe("string");
        expect(ayuda!.length).toBeGreaterThan(10);
    });
});

// ── Pruebas de integración: OrigenPantalla detecta 0 fps en Android ──

import { afterEach, describe as describeInt, expect as expectInt, it as itInt } from "vitest";
import { OrigenPantalla, type DepsOrigen, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = () => ({ sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "controlar" } });
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));

class PintorFalso implements Pintor {
    pintados: { ancho: number; alto: number; bytes: number }[] = [];
    async pintar() { return true; }
    pista() { return {}; }
    flujo() { return {}; }
    liberar() {}
}

let llamadas: { cmd: string; args?: Record<string, unknown> }[];
let respuestas: Record<string, unknown>;
let cuadros: Uint8Array[];
let viva: SesionViva | null;
let pintor: PintorFalso;
let ahora: number;
let notas: string[];
let origen: OrigenPantalla | null = null;

function montar(opts: { so?: string } = {}) {
    const { so = "android" } = opts;
    llamadas = [];
    respuestas = {
        control_pantalla_iniciar: { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 },
        control_capacidades: { pantalla: { accesibilidad: true, proyeccion: false, fuente_activa: "accesibilidad" }, falta: [] },
        control_estado_aparato: { brillo: 0.5, bateria: 0.8 },
        control_entrada: { ok: true },
    };
    cuadros = [];
    viva = { ...SESION };
    pintor = new PintorFalso();
    ahora = 1_000_000;
    notas = [];
    origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_cuadro") {
                const c = cuadros.shift();
                return c ?? new Uint8Array(0);
            }
            if (cmd in respuestas) {
                const r = respuestas[cmd];
                if (r instanceof Error) throw r;
                return r;
            }
            return { ok: true };
        },
        iceServers: async () => [],
        crearPeer: () => { throw new Error("sin conexión en estas pruebas"); },
        crearPintor: () => pintor,
        sesionViva: () => viva!,
        recibirSobre: async (): Promise<RespuestaOrden> => ({ tipo: "respuesta", nonce: "", ok: false, motivo: "sin-puerta" }),
        esperar: (ms) => pausa(Math.min(ms, 3)),
        ahora: () => ahora,
        anotar: (l) => notas.push(l),
        sistemaOperativo: () => so,
    });
}

function cuadro(numero: number, ancho = 800, alto = 1280): Uint8Array {
    const b = new Uint8Array(12 + 20);
    const v = new DataView(b.buffer);
    v.setUint32(0, numero, true);
    v.setUint16(4, ancho, true);
    v.setUint16(6, alto, true);
    v.setUint16(8, 0, true);
    v.setUint16(10, 0, true);
    return b;
}

const de = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);

afterEach(async () => {
    if (origen) await origen.parar("fin");
    origen = null;
});

describeInt("CTL1124G · OrigenPantalla: detección de 0 fps en Android con accesibilidad", () => {
    itInt("en Linux con accesibilidad y 0 fps, NO pide fluida por ceros (solo Android)", async () => {
        montar({ so: "linux" });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        // La petición automática inicial de fluida (en iniciar) SÍ ocurre una vez
        const inicial = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        expect(inicial).toBe(1); // la automática al iniciar
        // No hay cuadros → fps = 0
        ahora += 31_000;
        await pausa(200); // dar tiempo a que actualizarCalidad corra (cada 500ms)
        // En Linux no debe haber MÁS peticiones por ceros
        const total = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        expect(total).toBe(inicial);
        expect(notas.some((n) => n.includes("fluida-por-ceros"))).toBe(false);
    });

    itInt("en Android con accesibilidad y 0 fps, pide fluida tras la histéresis (tras agotar la espera inicial de 90 s)", async () => {
        montar({ so: "android" });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        // La petición automática inicial de fluida (en iniciar) SÍ ocurre una vez
        const inicial = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        expect(inicial).toBe(1);
        // No hay cuadros → fps = 0
        // Avanzar tiempo más allá de ESPERA_FLUIDA_MS (90 s) para que la búsqueda inicial termine
        ahora += 95_000;
        // Esperar a que la búsqueda inicial (buscarFluida) despierte y termine (usa esperar de 3ms real)
        await pausa(50);
        // Verificar estado antes de forzar actualización
        const activasMap = (origen! as unknown as { activas: Map<string, unknown> }).activas;
        const activa = activasMap.get(SESION.token);
        if (activa) {
            const a = activa as { buscandoFluida: boolean; ultimaFluidaPorCeros: number; fuente: string; ultimaCalidad: { fps: number } | null; inicio: number };
            // Forzar actualización de calidad - llamar directamente al método privado
            await (origen! as any).actualizarCalidad(activa);
            // Verificar que se calculó fps=0
            expect(a.ultimaCalidad?.fps).toBe(0);
            expect(a.buscandoFluida).toBe(false);
            expect(a.fuente).toBe("accesibilidad");
            expect(a.ultimaFluidaPorCeros).toBe(0);
            expect(ahora - a.inicio).toBeGreaterThan(30_000);
            // Debug: verificar que el log de debug está en notas
            const debugLogs = notas.filter((n) => n.includes("DEBUG actualizarCalidad"));
            expect(debugLogs.length).toBeGreaterThan(0);
            console.log("DEBUG LOGS:", debugLogs);
        }
        await pausa(100);
        // Debe haber pedido fluida por ceros (además de la inicial)
        const total = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        expect(total).toBeGreaterThan(inicial);
        // Debe estar anotado en el registro
        expect(notas.some((n) => n.includes("fluida-por-ceros"))).toBe(true);
    });

    itInt("en Android con accesibilidad y fps > 0, NO pide fluida por ceros", async () => {
        montar({ so: "android" });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        const inicial = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        // Enviar algunos cuadros para que fps > 0
        cuadros.push(cuadro(1), cuadro(2), cuadro(3));
        ahora += 5_000;
        await pausa(200);
        // Avanzar más allá de la histéresis
        ahora += 31_000;
        await pausa(600);
        const total = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        expect(total).toBe(inicial);
        expect(notas.some((n) => n.includes("fluida-por-ceros"))).toBe(false);
    });

    itInt("en Android con proyección, NO pide fluida por ceros", async () => {
        montar({ so: "android" });
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
        respuestas.control_capacidades = { pantalla: { accesibilidad: true, proyeccion: true, fuente_activa: "proyeccion" }, falta: [] };
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        const inicial = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        ahora += 31_000;
        await pausa(600);
        const total = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        expect(total).toBe(inicial);
        expect(notas.some((n) => n.includes("fluida-por-ceros"))).toBe(false);
    });

    itInt("respeta la histéresis: no repite la petición antes de 30 s (tras agotar la espera inicial de 90 s)", async () => {
        montar({ so: "android" });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        const inicial = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        // Avanzar 95s para que la búsqueda inicial termine y la detección de 0 fps dispare
        ahora += 95_000;
        await pausa(50); // dejar que buscarFluida inicial termine
        let activa = (origen! as unknown as { activas: Map<string, unknown> }).activas.get(SESION.token);
        if (activa) {
            (origen! as unknown as { actualizarCalidad: (a: unknown) => void }).actualizarCalidad(activa);
        }
        await pausa(100);
        const pedidas1 = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        expect(pedidas1).toBeGreaterThan(inicial);
        // Avanzar solo 10s más (total 105s, pero solo 10s desde la última por ceros) → NO debe repetir
        ahora += 10_000;
        activa = (origen! as unknown as { activas: Map<string, unknown> }).activas.get(SESION.token);
        if (activa) {
            (origen! as unknown as { actualizarCalidad: (a: unknown) => void }).actualizarCalidad(activa);
        }
        await pausa(100);
        const pedidas2 = de("control_pantalla_iniciar").filter((l) => l.args?.fuente === "proyeccion").length;
        expect(pedidas2).toBe(pedidas1);
    });
});