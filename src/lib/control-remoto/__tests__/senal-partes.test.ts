/**
 * SEN1116A · la señalización en partes con una oferta y una respuesta REALES de Chromium (fixture
 * `fixtures/sdp-chromium.json`): trocear y juntar, partes desordenadas, faltantes, repetidas, tamaño excesivo, dos
 * negociaciones a la vez, que cada parte quepa en la orden firmada, la negociación completa de punta a punta y la
 * razón verdadera cuando algo falla.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/sdp-chromium.json";
import { MAX_PARTES, MAX_TOTAL_SDP, PARTE_MAX, Reensamblador, trocear, resumen, type ParteSenal } from "../senal-partes";
import { definicion, MAX_DEDOS, MAX_PUNTOS_DEDO } from "../niveles";
import { MAX_CARGA_ORDEN, AUD_CONTROL } from "../orden";
import { OrigenPantalla, type DepsOrigen, type PeerLike, type SesionViva } from "../pantalla-origen";
import { PantallaDestino, partirGesto, type DepsDestino, type PeerDestinoLike, type EntradaControl } from "../pantalla-destino";
import { palabrasMotivo } from "../palabras";
import type { RespuestaOrden } from "../orden";

const OFERTA = fixture.oferta as string;
const RESPUESTA = fixture.respuesta as string;

const cargaDe = (args: Record<string, unknown>) =>
    JSON.stringify({ aud: AUD_CONTROL, v: 1, de: "h".repeat(64), cuenta: "cuenta-alex-larga-de-prueba@example.com", para: "aaaa0002-0000-4000-8000-000000000003", nivel: "controlar", sesion: "a".repeat(32), seq: 123456, nonce: "n".repeat(24), t: "2026-11-15T21:02:00.000Z", caduca: "2026-11-15T21:04:00.000Z", accion: { nombre: "pantalla-senal", args } });

describe("lo real: tamaños medidos", () => {
    it("la oferta y la respuesta de Chromium no caben en una orden firmada (por eso hay partes)", () => {
        expect(OFERTA.length).toBeGreaterThan(5000);
        expect(RESPUESTA.length).toBeGreaterThan(4000);
        expect(cargaDe({ oferta: OFERTA }).length).toBeGreaterThan(MAX_CARGA_ORDEN);
    });
    it("cada parte, con todo el sobre, cabe holgada en 4096 bytes (peor caso: todo saltos de línea escapados)", async () => {
        const malo = ("a=x\r\n".repeat(2000)).slice(0, MAX_TOTAL_SDP);
        for (const texto of [OFERTA, RESPUESTA, malo]) {
            for (const p of await trocear(texto, "oferta")) {
                const n = new TextEncoder().encode(cargaDe({ ...p })).length;
                expect(n).toBeLessThanOrEqual(MAX_CARGA_ORDEN);
            }
        }
    });
    it("cada parte pasa por el validador de la puerta", async () => {
        for (const p of await trocear(OFERTA, "oferta")) expect(definicion("pantalla-senal")!.validar({ ...p })).not.toBeNull();
    });
});

describe("juntar partes", () => {
    it("ida y vuelta con la oferta y la respuesta reales", async () => {
        for (const t of [OFERTA, RESPUESTA]) {
            const partes = await trocear(t, "oferta");
            expect(partes.length).toBeGreaterThan(1);
            expect(partes.length).toBeLessThanOrEqual(MAX_PARTES);
            const r = new Reensamblador();
            let fin: string | null = null;
            for (const p of partes) fin = await r.meter(p);
            expect(fin).toBe(t);
            expect(r.pendientes()).toBe(0);
        }
    });
    it("en cualquier orden", async () => {
        const partes = await trocear(OFERTA, "oferta");
        const r = new Reensamblador();
        let fin: string | null = null;
        for (const p of [...partes].reverse()) fin = await r.meter(p);
        expect(fin).toBe(OFERTA);
    });
    it("falta una parte: no se completa y, pasado el tiempo, caduca", async () => {
        let t = 1000;
        const r = new Reensamblador(() => t);
        const partes = await trocear(OFERTA, "oferta");
        for (const p of partes.slice(1)) expect(await r.meter(p)).toBeNull();
        expect(r.pendientes()).toBe(1);
        t += 61_000;
        expect(r.pendientes()).toBe(0);
    });
    it("una parte repetida igual no estorba; repetida con otro contenido se rechaza", async () => {
        const [a, b, ...resto] = await trocear(OFERTA, "oferta");
        const r = new Reensamblador();
        await r.meter(a);
        await r.meter(a);
        await expect(r.meter({ ...a, datos: "z".repeat(a.datos.length) })).rejects.toThrow("parte-repetida-distinta");
        await r.meter(b);
        await r.meter(b);
        let fin: string | null = null;
        for (const p of resto) fin = await r.meter(p);
        expect(fin).toBe(OFERTA);
    });
    it("contenido alterado: el resumen no casa", async () => {
        const partes = await trocear(OFERTA, "oferta");
        partes[1] = { ...partes[1], datos: partes[1].datos.replace(/a/, "b") };
        const r = new Reensamblador();
        let error = "";
        try {
            for (const p of partes) await r.meter(p);
        } catch (e) {
            error = (e as Error).message;
        }
        expect(error).toBe("resumen-no-casa");
    });
    it("un total excesivo se rechaza al trocear y no se acepta ni una parte de más", async () => {
        await expect(trocear("v=0\r\n" + "a".repeat(MAX_TOTAL_SDP), "oferta")).rejects.toThrow("demasiado-grande");
        await expect(trocear("v=0\r\n\u0001", "oferta")).rejects.toThrow("demasiado-grande");
        expect((await trocear("v=0\r\n" + "a".repeat(MAX_TOTAL_SDP - 5), "oferta")).length).toBe(MAX_PARTES - 3);
        const p = (await trocear(OFERTA, "oferta"))[0];
        expect(definicion("pantalla-senal")!.validar({ ...p, n: MAX_PARTES + 1 })).toBeNull();
        expect(definicion("pantalla-senal")!.validar({ ...p, total: MAX_TOTAL_SDP + 1 })).toBeNull();
    });
    it("dos negociaciones a la vez no se mezclan; la quinta a medias se niega", async () => {
        const a = await trocear(OFERTA, "oferta", "negociacion-a1");
        const b = await trocear(RESPUESTA, "oferta", "negociacion-b1");
        const r = new Reensamblador();
        const fines: Record<string, string | null> = {};
        const orden: ParteSenal[] = [];
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (b[i]) orden.push(b[i]);
            if (a[i]) orden.push(a[i]);
        }
        for (const p of orden) {
            const f = await r.meter(p);
            if (f) fines[p.neg] = f;
        }
        expect(fines).toEqual({ "negociacion-a1": OFERTA, "negociacion-b1": RESPUESTA });
        const r2 = new Reensamblador();
        for (let k = 0; k < 4; k++) await r2.meter((await trocear(OFERTA, "oferta", `negociacion-${k}x`))[0]);
        await expect(r2.meter((await trocear(OFERTA, "oferta", "negociacion-zz"))[0])).rejects.toThrow("demasiadas-negociaciones");
    });
    it("el resumen es de 16 hex", async () => {
        expect(await resumen("hola")).toMatch(/^[0-9a-f]{16}$/);
    });
});

// ── de punta a punta con la oferta y la respuesta reales ─────────────────────────────────────

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
class PeerAparato implements PeerLike {
    iceGatheringState = "complete";
    localDescription: { type?: string; sdp?: string } | null = null;
    onicegatheringstatechange = null;
    onconnectionstatechange = null;
    ondatachannel = null;
    remota: { sdp: string } | null = null;
    addTrack() { return {}; }
    async setRemoteDescription(d: { type: string; sdp: string }) { this.remota = d; }
    async createAnswer() { return { type: "answer", sdp: RESPUESTA }; }
    async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
    async addIceCandidate() {}
    close() {}
}
class PeerControlador implements PeerDestinoLike {
    localDescription: { sdp?: string } | null = null;
    onicecandidate = null;
    ontrack = null;
    onconnectionstatechange = null;
    remota: { sdp: string } | null = null;
    addTransceiver() { return {}; }
    createDataChannel() { return { readyState: "connecting", onopen: null, onmessage: null, onclose: null, send() {}, close() {} }; }
    async createOffer() { return { type: "offer", sdp: OFERTA }; }
    async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
    async setRemoteDescription(d: { type: string; sdp: string }) { this.remota = d; }
    async getStats() { return { forEach() {} }; }
    close() {}
}

let lineasO: string[];
let lineasD: string[];
let pa: PeerAparato;
let pc: PeerControlador;
let origen: OrigenPantalla;
let destino: PantallaDestino;
let vistas: { nombre: string; bytes: number }[];
let falla: ((nombre: string, args: Record<string, unknown>) => RespuestaOrden | null) | null;

beforeEach(() => {
    vi.useFakeTimers();
    lineasO = [];
    lineasD = [];
    vistas = [];
    falla = null;
    pa = new PeerAparato();
    pc = new PeerControlador();
    origen = new OrigenPantalla({
        invocar: async (cmd) => (cmd === "control_pantalla_iniciar" ? { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 } : cmd === "control_pantalla_cuadro" ? new Uint8Array(0) : { ok: true }),
        iceServers: async () => [],
        crearPeer: () => pa,
        crearPintor: () => ({ pintar: async () => true, pista: () => ({}), flujo: () => ({}), liberar() {} }),
        sesionViva: () => SESION,
        recibirSobre: async () => ({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok" }),
        esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
        ahora: () => Date.now(),
        anotar: (l) => lineasO.push(l),
        sistemaOperativo: () => "linux",
    } satisfies DepsOrigen);
    const deps: DepsDestino = {
        // El «canal de control»: valida con la lista cerrada de la puerta, mide la orden firmada y llama al origen.
        mandar: async (nombre, args) => {
            if (nombre === "abrir-sesion") return { tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado: { sesion: SESION.token, nivel: "ver" } };
            const forzada = falla?.(nombre, args);
            if (forzada) return forzada;
            const def = definicion(nombre);
            const val = def?.validar(args);
            if (!val) return { tipo: "respuesta", nonce: "n", ok: false, motivo: "argumentos" };
            const bytes = new TextEncoder().encode(cargaDe(args)).length;
            vistas.push({ nombre, bytes });
            if (bytes > MAX_CARGA_ORDEN) return { tipo: "respuesta", nonce: "n", ok: false, motivo: "forma" };
            try {
                return { tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado: await origen.ejecutar(nombre, val, { sesion: { token: SESION.token, nivel: "ver" } }) };
            } catch (e) {
                return { tipo: "respuesta", nonce: "n", ok: false, motivo: (e as Error).message };
            }
        },
        firmar: async () => null,
        iceServers: async () => [],
        crearPeer: () => pc,
        flujoDe: () => null,
        ahora: () => Date.now(),
        anotar: (l) => lineasD.push(l),
    };
    destino = new PantallaDestino("tableta", deps);
});
afterEach(() => {
    vi.useRealTimers();
});

describe("negociación de punta a punta con SDP real", () => {
    it("la oferta de 5 KB llega entera al aparato y la respuesta de 4 KB vuelve entera, todo en órdenes que caben", async () => {
        await destino.iniciar();
        expect(pa.remota?.sdp).toBe(OFERTA);
        expect(pc.remota?.sdp).toBe(RESPUESTA);
        expect(destino.instantanea().estado).toBe("conectando");
        const senales = vistas.filter((v) => v.nombre === "pantalla-senal");
        expect(senales.length).toBeGreaterThanOrEqual(6); // 4 de oferta + 3 de respuesta
        expect(Math.max(...vistas.map((v) => v.bytes))).toBeLessThanOrEqual(MAX_CARGA_ORDEN);
        expect(lineasD.some((l) => /^control-senal paso=oferta lado=controlador resultado=ok partes=\d+ largo=\d+$/.test(l))).toBe(true);
        expect(lineasD.some((l) => /^control-senal paso=respuesta lado=controlador resultado=ok/.test(l))).toBe(true);
        expect(lineasO.some((l) => /^control-senal paso=oferta lado=aparato resultado=ok/.test(l))).toBe(true);
        await destino.cerrar("x", false);
    });
    it("si el aparato rechaza una parte, el estado dice el paso, el lado y la causa en palabras, y el registro lleva su línea", async () => {
        let n = 0;
        falla = (nombre) => (nombre === "pantalla-senal" && ++n === 2 ? { tipo: "respuesta", nonce: "n", ok: false, motivo: "argumentos" } : null);
        await destino.iniciar();
        const s = destino.instantanea();
        expect(s.estado).toBe("cerrada");
        expect(s.motivo).toBe("senal-oferta-aparato-argumentos");
        const palabras = palabrasMotivo(s.motivo)!;
        expect(palabras).toContain("enviar la oferta de vídeo");
        expect(palabras).toContain("aparato controlado");
        expect(palabras).toContain("mal formada");
        expect(lineasD.some((l) => /^control-senal paso=oferta lado=aparato resultado=rechazo motivo=argumentos donde=parte_2_de_4$/.test(l))).toBe(true);
    });
    it("una oferta que no cabe en los topes dice «controlador» y «demasiado grande»", async () => {
        pc.createOffer = async () => ({ type: "offer", sdp: "v=0\r\n" + "a=x\r\n".repeat(4000) });
        await destino.iniciar();
        expect(destino.instantanea().motivo).toBe("senal-oferta-controlador-demasiado-grande");
        expect(palabrasMotivo(destino.instantanea().motivo)).toContain("en este aparato");
        expect(lineasD.some((l) => l.startsWith("control-senal paso=oferta lado=controlador resultado=rechazo motivo=demasiado-grande"))).toBe(true);
    });
    it("si la conexión del aparato rechaza la oferta, el controlador lo ve al enviar la última parte (lado aparato) y el aparato deja su línea del paso de la respuesta", async () => {
        pa.setRemoteDescription = async () => {
            throw new Error("boom");
        };
        await destino.iniciar();
        expect(destino.instantanea().motivo).toBe("senal-oferta-aparato-conexion-rechazada");
        expect(lineasO.some((l) => l.startsWith("control-senal paso=respuesta lado=aparato resultado=rechazo motivo=conexion-rechazada"))).toBe(true);
    });
    it("un motivo desconocido sigue leyéndose", () => {
        expect(palabrasMotivo("senal-candidatos-aparato-algo-raro")).toContain("intercambiar las rutas de red");
    });
});

describe("el resto del camino: tamaño de la entrada", () => {
    it("10 dedos de 64 puntos se parten en órdenes que caben en 4096 bytes, y cada mensaje del canal de datos cabe en 8192", () => {
        const dedos = Array.from({ length: MAX_DEDOS }, (_, id) => ({ id, puntos: Array.from({ length: MAX_PUNTOS_DEDO }, (_, i) => [0.1234 + i / 10000, 0.9876, 9999] as [number, number, number]) }));
        const entrada: EntradaControl = { tipo: "gesto", dedos, sigue: false };
        const sin = new TextEncoder().encode(JSON.stringify({ dedos, sigue: false })).length;
        expect(sin).toBeGreaterThan(MAX_CARGA_ORDEN); // entero NO cabe: hay que partirlo
        const trozos = partirGesto(entrada as Extract<EntradaControl, { tipo: "gesto" }>);
        expect(trozos.length).toBeGreaterThan(3);
        for (const t of trozos) {
            const carga = new TextEncoder().encode(cargaDe({ dedos: t.dedos, sigue: t.sigue }).replace("pantalla-senal", "gesto"));
            expect(carga.length).toBeLessThanOrEqual(MAX_CARGA_ORDEN);
            const b64 = Math.ceil((carga.length * 4) / 3);
            const mensaje = JSON.stringify({ v: 1, carga: "x".repeat(b64), firma: "y".repeat(86) }).length;
            expect(mensaje).toBeLessThanOrEqual(8192); // tope del canal de datos del aparato (MAX_MENSAJE_CANAL)
        }
    });
    it("texto de 512 caracteres de 4 bytes (emoji) cabe en la orden firmada", () => {
        const carga = new TextEncoder().encode(JSON.stringify({ texto: "😀".repeat(512) })).length;
        expect(carga + 500).toBeLessThanOrEqual(MAX_CARGA_ORDEN); // 2048 + ~450 de sobre
    });
});
