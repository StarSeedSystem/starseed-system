/**
 * CTL1118F · la pantalla fluida es lo de siempre: arranca con lo que haya, el aparato pide él solo la fluida UNA vez, el cambio no cierra nada,
 * sin «Sí» no se insiste, la persona puede volver a pedirla, y el ritmo solo baja calidad si el cuadro cuesta más de lo que cabe.
 */
import { afterEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type PeerLike, type Pintor, type SesionViva } from "../pantalla-origen";
import { definicion } from "../niveles";
import {
    ayudaFluida, debePedirFluida, ESPERA_FLUIDA_MS, fuenteActivaDe, fuenteRealValida, proyeccionConcedida, rotuloFuenteMedida, textoFps,
} from "../fuente-pantalla";
import {
    capacidadFps, COSTE_ALTO_MS, COSTE_BAJO_MS, mediaCoste, MEDIDAS_PARA_BAJAR, MEDIDAS_PARA_SUBIR, NIVELES_CUADRO, RITMO_INICIAL, siguienteRitmo,
} from "../ritmo-pantalla";
import { RegistroSesiones } from "../registro-sesiones";

const SESION: SesionViva = { token: "b".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = { sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "controlar" } };

function cuadro(numero: number): Uint8Array {
    const b = new Uint8Array(32);
    const v = new DataView(b.buffer);
    v.setUint32(0, numero, true);
    v.setUint16(4, 800, true);
    v.setUint16(6, 1280, true);
    return b;
}

interface Mundo {
    origen: OrigenPantalla;
    llamadas: { cmd: string; args?: Record<string, unknown> }[];
    notas: string[];
    /** La persona da (o no) el «Sí» del diálogo del aparato. */
    conceder(): void;
    reloj(): number;
    fuenteActiva: "accesibilidad" | "proyeccion";
}

const vivos: OrigenPantalla[] = [];
function mundo(opts: { concedida?: boolean } = {}): Mundo {
    const llamadas: Mundo["llamadas"] = [];
    const notas: string[] = [];
    let ahora = 1_000_000;
    let concedida = opts.concedida ?? false;
    let n = 0;
    const m = { fuenteActiva: concedida ? "proyeccion" : "accesibilidad" } as Mundo;
    const pintor: Pintor = { async pintar() { return true; }, pista: () => ({}), flujo: () => ({}), liberar() {} };
    const origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_cuadro") {
                await Promise.resolve();
                return n < 400 ? cuadro(++n) : new Uint8Array(0);
            }
            if (cmd === "control_pantalla_iniciar") {
                if (args?.fuente === "proyeccion") {
                    if (!concedida) return { ok: false, motivo: "sin-consentimiento" };
                    m.fuenteActiva = "proyeccion";
                    return { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
                }
                return { ok: true, fuente: m.fuenteActiva, ancho: 800, alto: 1280, giro: 0 };
            }
            if (cmd === "control_capacidades") return { pantalla: { accesibilidad: true, proyeccion: concedida, fuente_activa: m.fuenteActiva }, falta: [] };
            return { ok: true };
        },
        iceServers: async () => [],
        crearPeer: () => ({}) as PeerLike,
        crearPintor: () => pintor,
        sesionViva: () => ({ ...SESION }),
        recibirSobre: async () => ({}) as never,
        esperar: async (ms) => { ahora += ms; await new Promise((r) => setTimeout(r, 1)); },
        ahora: () => ahora,
        anotar: (l) => notas.push(l),
    } satisfies DepsOrigen);
    vivos.push(origen);
    return Object.assign(m, { origen, llamadas, notas, conceder: () => { concedida = true; }, reloj: () => ahora });
}
/** La conexión de quien manda ya existe (si no, a los 30 s sin oferta la pantalla se para por otra causa). */
const conPeer = (m: Mundo) => { (m.origen as unknown as { activa: { peer: unknown } }).activa.peer = { close() {} }; };
const cuenta = (m: Mundo, cmd: string, f?: (a?: Record<string, unknown>) => boolean) => m.llamadas.filter((l) => l.cmd === cmd && (!f || f(l.args))).length;
async function hasta(c: () => boolean, ms = 2000) {
    const t0 = Date.now();
    while (!c()) {
        if (Date.now() - t0 > ms) throw new Error("no llegó a cumplirse");
        await new Promise((r) => setTimeout(r, 2));
    }
}
afterEach(async () => {
    for (const o of vivos.splice(0)) await o.parar("fin");
});

describe("CTL1118F · pantalla fluida por defecto", () => {
    it("arranca YA con lo que haya y pide la fluida una vez; con el «Sí» cambia de fuente sin parar ni reabrir nada", async () => {
        const m = mundo();
        const r = (await m.origen.ejecutar("pantalla-iniciar", {}, ctx)) as { ok: boolean; fuente: string };
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect(m.llamadas.find((l) => l.cmd === "control_pantalla_iniciar")?.args).not.toHaveProperty("fuente");
        await hasta(() => cuenta(m, "control_pantalla_iniciar", (a) => a?.fuente === "proyeccion") >= 1);
        m.conceder();
        await hasta(() => m.notas.some((l) => l.includes("paso=cambio de=accesibilidad a=proyeccion")));
        expect(cuenta(m, "control_pantalla_parar")).toBe(0);
        expect(cuenta(m, "control_pantalla_iniciar", (a) => a?.fuente === "auto")).toBe(0);
        const lee = (await m.origen.ejecutar("leer-aparato", {}, ctx)) as { fuente?: string };
        expect(lee.fuente).toBe("proyeccion");
        // los cuadros siguen llegando por el mismo bucle
        const antes = cuenta(m, "control_pantalla_cuadro");
        await hasta(() => cuenta(m, "control_pantalla_cuadro") > antes + 2);
    });

    it("si la persona ya había dado el «Sí» en esta sesión, arranca directamente fluida y no vuelve a pedir", async () => {
        const m = mundo({ concedida: true });
        const r = (await m.origen.ejecutar("pantalla-iniciar", {}, ctx)) as { fuente: string };
        expect(r.fuente).toBe("proyeccion");
        await new Promise((x) => setTimeout(x, 30));
        expect(cuenta(m, "control_pantalla_iniciar", (a) => a?.fuente === "proyeccion")).toBe(0);
    });

    it("sin «Sí» no insiste: pide una vez, espera el plazo y se queda en accesibilidad, sin bucle", async () => {
        const m = mundo();
        await m.origen.ejecutar("pantalla-iniciar", {}, ctx);
        conPeer(m);
        await hasta(() => m.notas.some((l) => l.includes("resultado=sin-respuesta-de-la-persona")), 4000);
        expect(m.reloj() - 1_000_000).toBeGreaterThanOrEqual(ESPERA_FLUIDA_MS);
        const pedidas = cuenta(m, "control_pantalla_iniciar", (a) => a?.fuente === "proyeccion");
        expect(pedidas).toBe(1);
        await new Promise((x) => setTimeout(x, 40));
        expect(cuenta(m, "control_pantalla_iniciar", (a) => a?.fuente === "proyeccion")).toBe(pedidas);
        expect(cuenta(m, "control_pantalla_parar")).toBe(0);
    });

    it("la persona puede volver a pedirla desde el panel (mantener): no reabre la pantalla y sí pide la fluida otra vez", async () => {
        const m = mundo();
        await m.origen.ejecutar("pantalla-iniciar", {}, ctx);
        conPeer(m);
        await hasta(() => m.notas.some((l) => l.includes("resultado=sin-respuesta-de-la-persona")), 4000);
        const autos = cuenta(m, "control_pantalla_iniciar", (a) => a?.fuente === "auto");
        const r = (await m.origen.ejecutar("pantalla-iniciar", { mantener: true, fuente: "proyeccion" }, ctx)) as { ok: boolean; mantenida?: boolean };
        expect(r).toMatchObject({ ok: true, mantenida: true });
        m.conceder();
        await hasta(() => m.notas.some((l) => l.includes("paso=cambio de=accesibilidad a=proyeccion")));
        expect(cuenta(m, "control_pantalla_iniciar", (a) => a?.fuente === "auto")).toBe(autos);
        expect(cuenta(m, "control_pantalla_parar")).toBe(0);
    });

    it("si la fluida se corta en el aparato, leer-aparato dice la fuente REAL y lo anota", async () => {
        const m = mundo({ concedida: true });
        await m.origen.ejecutar("pantalla-iniciar", {}, ctx);
        m.fuenteActiva = "accesibilidad";
        const lee = (await m.origen.ejecutar("leer-aparato", {}, ctx)) as { fuente?: string };
        expect(lee.fuente).toBe("accesibilidad");
        expect(m.notas.some((l) => l.includes("paso=cambio de=proyeccion a=accesibilidad causa=la-fluida-se-corto"))).toBe(true);
    });
});

describe("CTL1118F · reglas puras de la fuente", () => {
    it("pide la fluida sola una vez por sesión y siempre que la persona lo pida; nunca si ya va fluida", () => {
        expect(debePedirFluida("accesibilidad", 0, false)).toBe(true);
        expect(debePedirFluida("accesibilidad", 1, false)).toBe(false);
        expect(debePedirFluida("accesibilidad", 3, true)).toBe(true);
        expect(debePedirFluida("proyeccion", 0, true)).toBe(false);
        expect(debePedirFluida(null, 0, false)).toBe(false);
    });
    it("lee las capacidades sin fiarse de su forma", () => {
        expect(proyeccionConcedida({ pantalla: { proyeccion: true } })).toBe(true);
        expect(proyeccionConcedida({ pantalla: { proyeccion: "si" } })).toBe(false);
        expect(proyeccionConcedida(null)).toBe(false);
        expect(fuenteActivaDe({ pantalla: { fuente_activa: "proyeccion" } })).toBe("proyeccion");
        expect(fuenteActivaDe({ pantalla: { fuente_activa: "otra" } })).toBeNull();
        expect(fuenteRealValida(5)).toBeNull();
    });
    it("enseña solo lo medido y la ayuda solo con accesibilidad", () => {
        expect(textoFps(2.94)).toBe("2,9");
        expect(textoFps(24.4)).toBe("24");
        expect(textoFps(undefined)).toBeNull();
        expect(textoFps(Number.NaN)).toBeNull();
        expect(rotuloFuenteMedida("accesibilidad", 2.9)).toBe("Pantalla por accesibilidad · 2,9 cuadros/s");
        expect(rotuloFuenteMedida("proyeccion")).toBe("Pantalla fluida (proyección)");
        expect(ayudaFluida("accesibilidad")).toMatch(/aceptar la pantalla fluida/);
        expect(ayudaFluida("proyeccion")).toBeNull();
        expect(`${ayudaFluida("accesibilidad")}`).not.toMatch(/Mando/);
    });
    it("la orden pantalla-iniciar acepta «mantener: true» y nada más", () => {
        expect(definicion("pantalla-iniciar")!.validar({ mantener: true, fuente: "proyeccion" })).toEqual({ mantener: true, fuente: "proyeccion" });
        expect(definicion("pantalla-iniciar")!.validar({ mantener: false })).toBeNull();
        expect(definicion("pantalla-iniciar")!.validar({ mantener: true, otra: 1 })).toBeNull();
    });
});

describe("CTL1118F · el ritmo de la fluida", () => {
    it("baja de nivel con 2 medidas altas seguidas y no pasa del último", () => {
        let e = RITMO_INICIAL;
        let c = null as ReturnType<typeof siguienteRitmo>["cambio"];
        for (let i = 0; i < MEDIDAS_PARA_BAJAR - 1; i++) ({ estado: e, cambio: c } = siguienteRitmo(e, COSTE_ALTO_MS + 10));
        expect(c).toBeNull();
        ({ estado: e, cambio: c } = siguienteRitmo(e, COSTE_ALTO_MS + 10));
        expect(c).toEqual(NIVELES_CUADRO[1]);
        for (let i = 0; i < 30; i++) ({ estado: e } = siguienteRitmo(e, 500));
        expect(e.nivel).toBe(NIVELES_CUADRO.length - 1);
    });
    it("sube más despacio de lo que baja, y una medida intermedia reinicia las cuentas", () => {
        let e = { nivel: 2, altas: 0, bajas: 0 };
        for (let i = 0; i < MEDIDAS_PARA_SUBIR - 1; i++) ({ estado: e } = siguienteRitmo(e, COSTE_BAJO_MS - 5));
        expect(e.nivel).toBe(2);
        ({ estado: e } = siguienteRitmo(e, 45));
        expect(e.bajas).toBe(0);
        for (let i = 0; i < MEDIDAS_PARA_SUBIR; i++) ({ estado: e } = siguienteRitmo(e, COSTE_BAJO_MS - 5));
        expect(e.nivel).toBe(1);
    });
    it("a un coste de 45 ms (≈22 cuadros/s) no toca nada: dentro de lo pedido", () => {
        let e = RITMO_INICIAL;
        for (let i = 0; i < 20; i++) ({ estado: e } = siguienteRitmo(e, 45));
        expect(e).toEqual(RITMO_INICIAL);
    });
    it("la media ignora lo absurdo y capacidadFps no promete más de 60", () => {
        expect(mediaCoste(null, 40)).toBe(40);
        expect(mediaCoste(40, Number.NaN)).toBeCloseTo(35);
        expect(capacidadFps(0)).toBe(60);
        expect(capacidadFps(50)).toBe(20);
    });
});

describe("CTL1118F · un solo carril de órdenes por neurona", () => {
    it("quien pide el carril dos veces (cualquier mayúscula) recibe el mismo", () => {
        const r = new RegistroSesiones();
        expect(r.carrilDe("AbC")).toBe(r.carrilDe("abc"));
        expect(r.carrilDe("abc")).not.toBe(r.carrilDe("otra"));
    });
});
