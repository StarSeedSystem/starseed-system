/**
 * PAN1115J · el lado controlado de la pantalla: negociación, cabecera de cuadro, un cuadro cada vez,
 * entrega de la entrada a lo nativo con el sobre intacto y todas las condiciones de parada.
 * Con falsos de la costura 1 (Tauri), de la conexión y del lienzo.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, abytes, leerCabeceraCuadro, type CanalLike, type DepsOrigen, type PeerLike, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";
import { trocear } from "../senal-partes";

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

class CanalFalso implements CanalLike {
    onmessage: CanalLike["onmessage"] = null;
    onclose: CanalLike["onclose"] = null;
    enviados: string[] = [];
    cerrado = false;
    send(d: string) { this.enviados.push(d); }
    close() { this.cerrado = true; }
}
class PeerFalso implements PeerLike {
    iceGatheringState = "complete";
    localDescription: { type?: string; sdp?: string } | null = null;
    connectionState = "new";
    onicegatheringstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    ondatachannel: PeerLike["ondatachannel"] = null;
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
let peer: PeerFalso;
let pintor: PintorFalso;
let ahora: number;
let recibidos: unknown[];
let origen: OrigenPantalla;

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
        sistemaOperativo: () => "linux",
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
    cuadros = [];
    viva = { ...SESION };
    peer = new PeerFalso();
    pintor = new PintorFalso();
    ahora = 1_000_000;
    recibidos = [];
    montar();
});

async function oferta(sdp: string, c = ctx("ver")): Promise<{ respuesta: string }> {
    const ps = await trocear(sdp, "oferta");
    let fin: unknown;
    for (const p of ps) fin = await origen.ejecutar("pantalla-senal", { ...p }, c);
    const f = fin as { n: number };
    let texto = "";
    for (let i = 0; i < f.n; i++) texto += ((await origen.ejecutar("pantalla-senal", { neg: ps[0].neg, pide: i }, c)) as { datos: string }).datos;
    return { respuesta: texto };
}
const n = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);

describe("cabecera del cuadro", () => {
    it("lee número, tamaño y giro (little endian)", () => {
        expect(leerCabeceraCuadro(cuadro(70000, 800, 1280, 90))).toEqual({ numero: 70000, ancho: 800, alto: 1280, giro: 90 });
    });
    it("rechaza lo que no tiene la forma", () => {
        expect(leerCabeceraCuadro(new Uint8Array(0))).toBeNull();
        expect(leerCabeceraCuadro(new Uint8Array(12))).toBeNull(); // sin JPEG
        expect(leerCabeceraCuadro(cuadro(1, 800, 1280, 45))).toBeNull(); // giro raro
        expect(leerCabeceraCuadro(cuadro(1, 800, 1280, 0, 7))).toBeNull(); // el campo cero no es cero
        expect(leerCabeceraCuadro(cuadro(1, 0, 1280))).toBeNull();
        expect(leerCabeceraCuadro(cuadro(1, 9000, 1280))).toBeNull();
    });
    it("lee también si llega como ArrayBuffer, vista o lista de números", () => {
        const c = cuadro(3);
        expect(abytes(c.buffer)?.length).toBe(c.length);
        expect(abytes(new DataView(c.buffer))?.length).toBe(c.length);
        expect(abytes(Array.from(c))?.length).toBe(c.length);
        expect(abytes("x")).toBeNull();
    });
});

describe("pantalla-iniciar", () => {
    it("pide la fuente con la sesión nativa y devuelve lo que dijo lo nativo", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000 }, ctx())) as Record<string, unknown>;
        expect(n("control_pantalla_iniciar")[0].args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60 });
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 });
        expect((r.capacidades as { entrada: { max_dedos: number } }).entrada.max_dedos).toBe(10);
        await origen.parar("fin");
    });
    it("RST1116A: con fuente proyeccion se manda explícita y se devuelve la real con lo pedido", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(n("control_pantalla_iniciar")[0].args).toMatchObject({ sesion: SESION.token, fuente: "proyeccion" });
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        await origen.parar("fin");
    });
    it("RST1116A: si lo nativo contesta proyeccion, la fuente real es proyeccion", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 1280, alto: 798, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion", ancho: 1280, alto: 798 });
        expect(r).not.toHaveProperty("fuente_pedida");
        await origen.parar("fin");
    });
    it("RST1116A: si la proyeccion no se puede, la sesión sigue con lo que haya", async () => {
        const inv = origen as unknown as { d: DepsOrigen };
        const base = inv.d.invocar!;
        inv.d.invocar = async (c, a) => {
            if (c === "control_pantalla_iniciar" && a?.fuente === "proyeccion") {
                llamadas.push({ cmd: c, args: a });
                return { ok: false, motivo: "sin-consentimiento" };
            }
            return base(c, a);
        };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        /// RST06b: con el arreglo, se manda "auto" en el fallback (antes undefined, ahora "auto")
        expect(n("control_pantalla_iniciar").map((l) => l.args?.fuente).slice(0, 2)).toEqual(["proyeccion", "auto"]);
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(origen.enMarcha()).toBe(true);
        await origen.parar("fin");
    });
    it("si lo nativo no puede, la orden se cumple y dice qué falta (sin arrancar nada)", async () => {
        respuestas.control_pantalla_iniciar = { ok: false, motivo: "sin-servicio", falta: ["servicio-accesibilidad", "otra cosa"] };
        const r = await origen.ejecutar("pantalla-iniciar", {}, ctx());
        expect(r).toEqual({ ok: false, motivo: "sin-servicio", falta: ["servicio-accesibilidad"] }); // «otra cosa» no tiene la forma de un código
        expect(origen.enMarcha()).toBe(false);
        expect(n("control_pantalla_cuadro")).toHaveLength(0);
    });
    it("en escritorio (sin-soporte) lo dice igual", async () => {
        respuestas.control_pantalla_iniciar = { ok: false, motivo: "sin-soporte" };
        expect(await origen.ejecutar("pantalla-iniciar", {}, ctx())).toMatchObject({ ok: false, motivo: "sin-soporte" });
    });
    it("fuera de la app nativa no hay nada que iniciar", async () => {
        montar(true);
        await expect(origen.ejecutar("pantalla-iniciar", {}, ctx())).rejects.toThrow("sin-soporte");
    });
    it("sin la sesión de la puerta, o con otro token, no hace nada", async () => {
        await expect(origen.ejecutar("pantalla-iniciar", {}, { sobre: {} })).rejects.toThrow("sesion");
        viva = { ...SESION, token: "b".repeat(32) };
        await expect(origen.ejecutar("pantalla-iniciar", {}, ctx())).rejects.toThrow("sesion");
        viva = null;
        await expect(origen.ejecutar("pantalla-iniciar", {}, ctx())).rejects.toThrow("sesion");
        expect(n("control_pantalla_iniciar")).toHaveLength(0);
    });
});

describe("cuadros: uno cada vez, nunca en cola", () => {
    it("pide el siguiente solo cuando el anterior ya se pintó y pasa el último número", async () => {
        cuadros = [cuadro(1), cuadro(2), cuadro(5)];
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        await hasta(() => pintor.pintados.length === 3);
        expect(pintor.maxEnCurso).toBe(1);
        const desdes = n("control_pantalla_cuadro").map((l) => l.args?.desde);
        expect(desdes.slice(0, 4)).toEqual([0, 1, 2, 5]);
        expect(n("control_pantalla_cuadro")[0].args?.sesion).toBe(SESION.token);
        expect(pintor.pintados[0]).toEqual({ ancho: 800, alto: 1280, bytes: 20 }); // sin los 12 bytes de cabecera
        expect(origen.cuadrosPintados()).toBe(3);
        await origen.parar("fin");
    });
    it("cuando no hay cuadro nuevo espera y no se come la máquina", async () => {
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        await pausa(60);
        await origen.parar("fin");
        expect(pintor.pintados).toHaveLength(0);
        expect(n("control_pantalla_cuadro").length).toBeLessThan(60);
    });
    it("tres cuadros ilegibles seguidos paran la pantalla", async () => {
        cuadros = [cuadro(1, 800, 1280, 45), cuadro(2, 800, 1280, 45), cuadro(3, 800, 1280, 45)];
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        await hasta(() => !origen.enMarcha());
        expect(n("control_pantalla_parar")).toHaveLength(1);
    });
    it("un fallo del nativo al traer cuadros, tres veces, para", async () => {
        respuestas.control_pantalla_cuadro = new Error("x");
        cuadros = [];
        // el falso de arriba lee `cuadros` antes que `respuestas`: forzamos el error por la vía del comando
        const inv = origen as unknown as { d: DepsOrigen };
        const base = inv.d.invocar!;
        inv.d.invocar = async (c, a) => (c === "control_pantalla_cuadro" ? Promise.reject(new Error("x")) : base(c, a));
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        await hasta(() => !origen.enMarcha());
    });
});

describe("CTL1117J · S1 · una pausa local no para la pantalla", () => {
    it("sin cuadros durante la pausa (lo nativo devuelve vacío) la pantalla sigue en marcha y, al reanudar, los cuadros vuelven sin reabrir nada", async () => {
        cuadros = [cuadro(1), cuadro(2)];
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        await hasta(() => pintor.pintados.length === 2);
        await pausa(80); // pausa local: ~3 s reales; aquí, un rato de «vacío» con la sesión viva
        expect(origen.enMarcha()).toBe(true);
        expect(n("control_pantalla_parar")).toHaveLength(0);
        const pintadosEnPausa = pintor.pintados.length;
        expect(pintadosEnPausa).toBe(2);
        cuadros.push(cuadro(3), cuadro(4));
        await hasta(() => pintor.pintados.length === 4);
        // CTL1118F: además del arranque con lo que haya, el aparato pide él solo la fluida UNA vez; la pausa no reabre nada.
        expect(n("control_pantalla_iniciar").filter((l) => l.args?.fuente !== "proyeccion")).toHaveLength(1);
        expect(n("control_pantalla_parar")).toHaveLength(0);
        await origen.parar("fin");
    });
    it("una parada real (la sesión de la puerta ya no está) SÍ para la pantalla", async () => {
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        await pausa(20);
        viva = null;
        await hasta(() => !origen.enMarcha());
        expect(n("control_pantalla_parar")).toHaveLength(1);
    });
    it("una orden de entrada rechazada con «pausa-local» llega a quien manda con ese motivo (no se disfraza de otro)", async () => {
        respuestas.control_entrada = { ok: false, motivo: "pausa-local" };
        await expect(origen.ejecutar("gesto", {}, ctx())).rejects.toThrow("pausa-local");
    });
});

describe("negociación por el canal de control", () => {
    async function conPantalla() {
        await origen.ejecutar("pantalla-iniciar", {}, ctx("ver"));
    }
    it("la oferta se contesta con la respuesta, la pista del lienzo va en la conexión y los candidatos entran", async () => {
        await conPantalla();
        const r = (await oferta("v=0\r\noferta", ctx("ver"))) as { respuesta: string };
        expect(peer.remota).toEqual({ type: "offer", sdp: "v=0\r\noferta" });
        expect(peer.pistas).toEqual([{ pista: true }]);
        expect(r.respuesta).toBe("v=0\r\nrespuesta");
        const c = (await origen.ejecutar("pantalla-senal", { candidatos: ["candidate:1 1 udp 1 1.2.3.4 5 typ host", "candidate:2 1 udp 1 1.2.3.5 5 typ host"] }, ctx("ver"))) as { candidatos: number };
        expect(c.candidatos).toBe(2);
        expect(peer.candidatos[0]).toMatchObject({ sdpMLineIndex: 0 });
        await origen.parar("fin");
    });
    it("si la recogida de candidatos se alarga, contesta igual al pasar la espera", async () => {
        peer.iceGatheringState = "gathering";
        await conPantalla();
        const r = (await oferta("v=0\r\noferta", ctx("ver"))) as { respuesta: string };
        expect(r.respuesta).toBeTruthy();
        await origen.parar("fin");
    });
    it("sin pantalla iniciada no se negocia; una segunda oferta se rechaza; candidatos sin oferta también", async () => {
        await expect(oferta("v=0\r\nofert", ctx("ver"))).rejects.toThrow("sin-pantalla");
        await conPantalla();
        await expect(origen.ejecutar("pantalla-senal", { candidatos: ["candidate:1"] }, ctx("ver"))).rejects.toThrow("sin-oferta");
        await oferta("v=0\r\nofert", ctx("ver"));
        await expect(oferta("v=0\r\nofert", ctx("ver"))).rejects.toThrow("ya-negociada");
        await origen.parar("fin");
    });
    it("el canal de datos lleva las órdenes firmadas a la MISMA puerta, una a una y en orden, y devuelve su respuesta", async () => {
        await conPantalla();
        await oferta("v=0\r\nofert", ctx("ver"));
        const canal = new CanalFalso();
        peer.ondatachannel!({ channel: canal });
        canal.onmessage!({ data: JSON.stringify({ v: 1, n: "uno" }) });
        canal.onmessage!({ data: JSON.stringify({ v: 1, n: "dos" }) });
        canal.onmessage!({ data: "no es json" });
        canal.onmessage!({ data: "x".repeat(9000) });
        canal.onmessage!({ data: 5 });
        await hasta(() => canal.enviados.length === 2);
        expect(recibidos.map((r) => (r as { n: string }).n)).toEqual(["uno", "dos"]);
        expect(JSON.parse(canal.enviados[1])).toMatchObject({ tipo: "respuesta", nonce: "dos", ok: true });
        await origen.parar("fin");
        expect(canal.cerrado).toBe(true);
    });
    it("sin oferta en 30 s se para (nadie recoge la pantalla) — en macOS con WebRTC", async () => {
        // Recrear origen en macOS para probar el comportamiento con WebRTC
        const llamadasMac: { cmd: string; args?: Record<string, unknown> }[] = [];
        const origenMac = new OrigenPantalla({
            invocar: async (cmd, args) => {
                llamadasMac.push({ cmd, args });
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
            sistemaOperativo: () => "macos",
        });
        await origenMac.ejecutar("pantalla-iniciar", {}, ctx("ver"));
        ahora += 31_000;
        await hasta(() => !origenMac.enMarcha());
        expect(llamadasMac.filter((l) => l.cmd === "control_pantalla_parar")).toHaveLength(1);
        await origenMac.parar("fin");
    });
});

describe("entrada: se entrega a lo nativo y la página no la ejecuta", () => {
    it("pasa el sobre tal cual y la sesión nativa, para cada orden de entrada", async () => {
        for (const nombre of ["gesto", "tecla", "volumen", "brillo", "texto"]) {
            const sobre = { v: 1, carga: `c-${nombre}`, firma: "f" };
            expect(await origen.ejecutar(nombre, {}, ctx("controlar", sobre))).toEqual({ ok: true });
            const l = n("control_entrada").at(-1)!;
            expect(l.args?.sobre).toBe(sobre);
            expect(l.args?.sesion).toBe(SESION.token);
        }
        expect(n("control_entrada")).toHaveLength(5);
    });
    it("fuera de una sesión de «controlar» nunca llega a control_entrada", async () => {
        await expect(origen.ejecutar("tecla", {}, ctx("ver"))).rejects.toThrow("nivel");
        await expect(origen.ejecutar("tecla", {}, { sobre: {} })).rejects.toThrow("sesion"); // sin sesión
        viva = null;
        await expect(origen.ejecutar("tecla", {}, ctx())).rejects.toThrow("sesion"); // la sesión ya no vive
        viva = { ...SESION, token: "c".repeat(32) };
        await expect(origen.ejecutar("tecla", {}, ctx())).rejects.toThrow("sesion"); // otro token
        viva = { ...SESION };
        await expect(origen.ejecutar("tecla", {}, ctx("controlar", "no es un sobre"))).rejects.toThrow("forma");
        expect(n("control_entrada")).toHaveLength(0);
    });
    it("el motivo del rechazo nativo vuelve tal cual (regla-g, pausa-local, no-autorizado…)", async () => {
        for (const m of ["regla-g", "pausa-local", "no-autorizado", "limite", "sin-servicio", "sin-soporte", "firma", "sesion"]) {
            respuestas.control_entrada = { ok: false, motivo: m };
            await expect(origen.ejecutar("gesto", {}, ctx())).rejects.toThrow(m);
        }
        respuestas.control_entrada = { ok: false, motivo: "<raro>" };
        await expect(origen.ejecutar("gesto", {}, ctx())).rejects.toThrow("fallo");
    });
    it("si el comando nativo se cae, «sin-servicio»; fuera de la app, «sin-soporte»", async () => {
        respuestas.control_entrada = new Error("boom");
        await expect(origen.ejecutar("brillo", {}, ctx())).rejects.toThrow("sin-servicio");
        montar(true);
        await expect(origen.ejecutar("brillo", {}, ctx())).rejects.toThrow("sin-soporte");
    });
});

describe("leer-aparato", () => {
    it("devuelve el estado y las capacidades; con error nativo lo dice", async () => {
        expect(await origen.ejecutar("leer-aparato", {}, ctx("ver"))).toMatchObject({ aparato: { brillo: 0.5 }, capacidades: { entrada: { gestos: true } } });
        respuestas.control_estado_aparato = { ok: false, motivo: "sin-soporte" };
        await expect(origen.ejecutar("leer-aparato", {}, ctx("ver"))).rejects.toThrow("sin-soporte");
    });
});

describe("todo se para cuando debe", () => {
    async function enMarcha() {
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        await oferta("v=0\r\nofert", ctx());
        const canal = new CanalFalso();
        peer.ondatachannel!({ channel: canal });
        expect(origen.enMarcha()).toBe(true);
        return canal;
    }
    function todoSuelto(canal: CanalFalso) {
        expect(origen.enMarcha()).toBe(false);
        expect(peer.cerrada).toBe(true);
        expect(canal.cerrado).toBe(true);
        expect(pintor.liberado).toBe(true);
        expect(n("control_pantalla_parar")).toHaveLength(1);
        expect(n("control_pantalla_parar")[0].args).toEqual({ sesion: SESION.token });
    }
    it("la sesión se cierra (revisar al cambiar la puerta)", async () => {
        const c = await enMarcha();
        viva = null;
        await origen.revisar();
        todoSuelto(c);
    });
    it("la sesión caduca (la puerta ya no la da) aunque nadie avise: lo ve el propio bucle", async () => {
        const c = await enMarcha();
        viva = null;
        await hasta(() => !origen.enMarcha());
        todoSuelto(c);
    });
    it("el indicador desaparece: la puerta cierra la sesión (parada nativa) y la pantalla para", async () => {
        const c = await enMarcha();
        viva = null; // paradaNativa deja la sesión en null y avisa con alCambiar → revisarOrigen
        await origen.revisar();
        todoSuelto(c);
    });
    it("otra sesión distinta (otro controlador) también la para", async () => {
        const c = await enMarcha();
        viva = { ...SESION, de: "z".repeat(64) };
        await origen.revisar();
        todoSuelto(c);
    });
    it("la conexión cae", async () => {
        const c = await enMarcha();
        peer.connectionState = "failed";
        peer.onconnectionstatechange!();
        await hasta(() => !origen.enMarcha());
        todoSuelto(c);
    });
    it("la orden pantalla-parar", async () => {
        const c = await enMarcha();
        expect(await origen.ejecutar("pantalla-parar", {}, ctx("ver"))).toEqual({ parada: true });
        todoSuelto(c);
    });
    it("parar dos veces suelta una sola vez; un mensaje tardío del canal ya no entra", async () => {
        const c = await enMarcha();
        await origen.parar("a");
        await origen.parar("b");
        expect(n("control_pantalla_parar")).toHaveLength(1);
        c.onmessage?.({ data: JSON.stringify({ n: "tarde" }) });
        await pausa(10);
        expect(recibidos).toHaveLength(0);
    });
    it("pedir la pantalla otra vez reinicia sin dejar la anterior viva", async () => {
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        const primero = pintor;
        pintor = new PintorFalso();
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        expect(primero.liberado).toBe(true);
        expect(n("control_pantalla_parar")).toHaveLength(1);
        await origen.parar("fin");
    });
});
