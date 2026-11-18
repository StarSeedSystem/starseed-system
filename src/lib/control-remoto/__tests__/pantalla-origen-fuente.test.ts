/**
 * RST06 · pruebas de la petición explícita de fuente (proyección) y la respuesta real del aparato.
 * Cobertura: nativo-comandos.ts permite "fuente"; pantalla-origen.ts la pasa si se pide "proyeccion";
 * el resultado siempre lleva la fuente REAL y, si se pidió proyección y no se concedió, también fuente_pedida.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";
import { COMANDOS_NATIVOS } from "../nativo-comandos";

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

class PeerFalso {
    iceGatheringState = "complete";
    localDescription: { type?: string; sdp?: string } | null = null;
    connectionState = "new";
    onicegatheringstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    ondatachannel: ((e: { channel: unknown }) => void) | null = null;
    pistas: unknown[] = [];
    remota: { type: string; sdp: string } | null = null;
    candidatos: { candidate: string; sdpMLineIndex?: number }[] = [];
    cerrada = false;
    addTrack(p: unknown) { this.pistas.push(p); return {}; }
    async setRemoteDescription(d: { type: string; sdp: string }) { this.remota = d; }
    async createAnswer() { return { type: "answer", sdp: "v=0\r\nrespuesta" }; }
    async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
    async addIceCandidate(c: { candidate: string; sdpMLineIndex?: number }) { this.candidatos.push(c); }
    close() { this.cerrada = true; }
}

class PintorFalso {
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
let peer: PeerFalso;
let pintor: PintorFalso;
let ahora: number;
let recibidos: unknown[];
let origen: OrigenPantalla;

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

function montar(sinInvocar = false) {
    origen = new OrigenPantalla({
        invocar: sinInvocar
            ? null
            : async (cmd, args) => {
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
        crearPeer: () => peer,
        crearPintor: () => pintor,
        sesionViva: () => viva,
        recibirSobre: async (s) => {
            recibidos.push(s);
            return { tipo: "respuesta", nonce: String((s as { n?: string }).n ?? ""), ok: true, motivo: "ok" } as RespuestaOrden;
        },
        esperar: (ms) => pausa(Math.min(ms, 3)),
        ahora: () => ahora,
        anotar: () => undefined,
    } satisfies DepsOrigen);
}

beforeEach(() => {
    llamadas = [];
    respuestas = {
        control_pantalla_iniciar: { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 },
        control_capacidades: { pantalla: { accesibilidad: true, proyeccion: false, sin_preguntar: true }, entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true }, falta: [] },
        control_estado_aparato: { brillo: 0.5, bateria: 0.8 },
        control_entrada: { ok: true },
    };
    cuadros = [cuadro(1), cuadro(2), cuadro(3)];
    viva = { ...SESION };
    peer = new PeerFalso();
    pintor = new PintorFalso();
    ahora = 1_000_000;
    recibidos = [];
    montar();
});

const n = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);

describe("nativo-comandos: claves permitidas para control_pantalla_iniciar", () => {
    it("incluye 'fuente' junto a sesion, lado_max y calidad", () => {
        expect(COMANDOS_NATIVOS.control_pantalla_iniciar).toEqual(["sesion", "lado_max", "calidad", "fuente"]);
    });
});

describe("pantalla-iniciar con fuente:proyeccion", () => {
    it("pasa 'fuente: proyeccion' a lo nativo cuando args.fuente === 'proyeccion'", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        const args = n("control_pantalla_iniciar")[0].args as Record<string, unknown>;
        expect(args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "proyeccion" });
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 });
        await origen.parar("fin");
    });

    it("NO pasa 'fuente' cuando args.fuente es 'auto' o no está", async () => {
        await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "auto" }, ctx());
        let args = n("control_pantalla_iniciar")[0].args as Record<string, unknown>;
        expect(args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "auto" });

        llamadas = [];
        await origen.parar("fin");
        montar();
        await origen.ejecutar("pantalla-iniciar", { lado: 1000 }, ctx());
        args = n("control_pantalla_iniciar")[0].args as Record<string, unknown>;
        expect(args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "auto" });
        await origen.parar("fin");
    });
});

describe("respuesta con la fuente REAL y fuente_pedida cuando procede", () => {
    it("si lo nativo contesta accesibilidad y se pidió proyección, devuelve fuente:'accesibilidad' y fuente_pedida:'proyeccion'", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r.fuente).toBe("accesibilidad");
        expect(r.fuente_pedida).toBe("proyeccion");
        await origen.parar("fin");
    });

    it("si lo nativo contesta proyección y se pidió proyección, devuelve fuente:'proyeccion' SIN fuente_pedida", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
        respuestas.control_capacidades = { pantalla: { accesibilidad: true, proyeccion: true, sin_preguntar: true }, entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true }, falta: [] };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r.fuente).toBe("proyeccion");
        expect("fuente_pedida" in r).toBe(false);
        await origen.parar("fin");
    });

    it("si no se pidió proyección, nunca devuelve fuente_pedida", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "auto" }, ctx())) as Record<string, unknown>;
        expect(r.fuente).toBe("accesibilidad");
        expect("fuente_pedida" in r).toBe(false);
        await origen.parar("fin");
    });

    it("la sesión sigue en marcha aunque no se conceda la proyección pedida", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
        await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        expect(origen.enMarcha()).toBe(true);
        await origen.parar("fin");
    });
});

