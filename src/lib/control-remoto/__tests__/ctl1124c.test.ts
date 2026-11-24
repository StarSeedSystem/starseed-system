/**
 * CTL1124C · Linux sin WebRTC: la pantalla no se para por «sin oferta», sigue sirviendo
 * cuadros por la malla mientras el controlador los pida.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type PeerLike, type Pintor, type SesionViva } from "../pantalla-origen";

function cuadro(numero: number, ancho = 800, alto = 1280, giro = 0, cero = 0, jpeg = 20): Uint8Array {
    const b = new Uint8Array(12 + jpeg);
    const v = new DataView(b.buffer);
    v.setUint32(0, numero, true);
    v.setUint16(4, ancho, true);
    v.setUint16(6, alto, true);
    v.setUint16(8, giro, true);
    v.setUint16(10, cero, true);
    return b;
}

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = (nivel = "controlar", sobre: unknown = { v: 1, carga: "c", firma: "f" }) => ({ sobre, sesion: { token: SESION.token, nivel } });
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));
async function hasta(c: () => boolean, ms = 1500) {
    const t0 = Date.now();
    while (!c()) {
        if (Date.now() - t0 > ms) throw new Error("no llegó a cumplirse");
        await pausa(2);
    }
}

class PintorFalso implements Pintor {
    pintados: { ancho: number; alto: number; bytes: number }[] = [];
    enCurso = 0;
    maxEnCurso = 0;
    liberado = false;
    resultado = true;
    async pintar(j: Uint8Array, ancho: number, alto: number) {
        this.enCurso++;
        this.maxEnCurso = Math.max(this.maxEnCurso, this.enCurso);
        await pausa(3);
        this.enCurso--;
        this.pintados.push({ ancho, alto, bytes: j.length });
        return this.resultado;
    }
    pista() { return { pista: true }; }
    flujo() { return { flujo: true }; }
    liberar() { this.liberado = true; }
}

let llamadas: { cmd: string; args?: Record<string, unknown> }[];
let respuestas: Record<string, unknown>;
let cuadros: Uint8Array[];
let viva: SesionViva | null;
let pintor: PintorFalso;
let ahora: number;
let lineas: string[];
let origen: OrigenPantalla | null = null;

async function montar(opts: { hayWebRtc: boolean } = { hayWebRtc: true }) {
    const { hayWebRtc } = opts;
    // Parar el origen anterior si existe
    if (origen) {
        await origen.parar("test-cleanup");
    }
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
        iceServers: async () => [{ urls: "stun:x" }],
        crearPeer: () => ({} as unknown as PeerLike),
        crearPintor: () => pintor,
        sesionViva: () => viva,
        recibirSobre: async () => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok" }),
        esperar: (ms) => pausa(Math.min(ms, 3)),
        ahora: () => ahora,
        anotar: (l) => void lineas.push(l),
        hayWebRtc: () => hayWebRtc,
    } satisfies DepsOrigen);
}

beforeEach(async () => {
    llamadas = [];
    respuestas = {
        control_pantalla_iniciar: { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 },
        control_capacidades: { pantalla: { accesibilidad: true, proyeccion: false, sin_preguntar: true }, entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true }, falta: [] },
        control_estado_aparato: { brillo: 0.5, bateria: 0.8 },
        control_entrada: { ok: true },
    };
    cuadros = [];
    viva = { ...SESION };
    pintor = new PintorFalso();
    ahora = 1_000_000;
    lineas = [];
    await montar();
});

describe("CTL1124C · Linux sin WebRTC no se para por sin-oferta", () => {
    it("CON WebRTC: a los 30 s sin peer y sin malla se para con sin-oferta", async () => {
        await montar({ hayWebRtc: true });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        ahora += 31_000;
        await hasta(() => !origen!.enMarcha());
        expect(llamadas.some((l) => l.cmd === "control_pantalla_parar")).toBe(true);
        expect(lineas.some((l) => l.includes("motivo=sin-oferta"))).toBe(true);
    });

    it("SIN WebRTC: sin malla, cae a comportamiento original (para a los 30s con sin-oferta)", async () => {
        await montar({ hayWebRtc: false });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        ahora += 31_000;
        await hasta(() => !origen!.enMarcha());
        expect(llamadas.some((l) => l.cmd === "control_pantalla_parar")).toBe(true);
        expect(lineas.some((l) => l.includes("motivo=sin-oferta"))).toBe(true);
    });

    it("SIN WebRTC: si el controlador pide por la malla, la pantalla sigue viva", async () => {
        await montar({ hayWebRtc: false });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        // Simular petición de cuadro por la malla (como haría el controlador)
        cuadros.push(cuadro(1));
        // Esperar a que el bucle compartido capture el cuadro
        await hasta(() => cuadros.length === 0);
        // Dar tiempo a que el bucle procese el cuadro (pintar tarda ~3ms real)
        await pausa(50);
        const r = await origen!.ejecutar("pantalla-cuadro", { desde: 0, pide: 0, num: 1 }, ctx("ver"));
        expect(r).toMatchObject({ nuevo: true });
        // Avanzar 5 segundos (dentro de la vigencia de malla de 8s)
        ahora += 5_000;
        await pausa(50);
        expect(origen!.enMarcha()).toBe(true);
        expect(lineas.some((l) => l.includes("motivo=sin-oferta"))).toBe(false);
        expect(lineas.some((l) => l.includes("motivo=sin-malla"))).toBe(false);
    });

    it("SIN WebRTC: tras 8 s sin peticiones de malla (después de los 30s de gracia), SÍ se para", async () => {
        await montar({ hayWebRtc: false });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        // Una petición de malla
        cuadros.push(cuadro(1));
        // Esperar a que el bucle compartido capture el cuadro
        await hasta(() => cuadros.length === 0);
        // Dar tiempo a que el bucle procese el cuadro
        await pausa(50);
        await origen!.ejecutar("pantalla-cuadro", { desde: 0, pide: 0, num: 1 }, ctx("ver"));
        // Avanzar 39 segundos (30s gracia + 9s > 8s vigencia malla)
        ahora += 39_000;
        await hasta(() => !origen!.enMarcha());
        expect(llamadas.some((l) => l.cmd === "control_pantalla_parar")).toBe(true);
        expect(lineas.some((l) => l.includes("motivo=sin-malla"))).toBe(true);
    });

    it("CON WebRTC: si hay peer, no se para por sin-oferta", async () => {
        await montar({ hayWebRtc: true });
        await origen!.ejecutar("pantalla-iniciar", {}, ctx());
        // Simular que se crea el peer (negociación exitosa)
        const origenInterno = origen! as unknown as { activas: Map<string, unknown> };
        const activas = origenInterno.activas;
        const a = activas.get(SESION.token);
        if (a) {
            (a as { peer: unknown }).peer = {} as unknown as PeerLike;
        }
        ahora += 31_000;
        await pausa(50);
        expect(origen!.enMarcha()).toBe(true);
        expect(lineas.some((l) => l.includes("motivo=sin-oferta"))).toBe(false);
    });
});