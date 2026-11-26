/**
 * ORD1114Q · las condiciones del contrato que faltaban en la fase 1:
 *   §2.2  el cuerpo va sellado de punta a punta (un relé no lo lee ni lo forja);
 *   §1 H  la sesión es del lado nativo: sin indicador no hay control y parar en «Rust» basta aunque la
 *         página no conteste;
 *   ronda §4 regla 5: si una persona contesta o cuelga a mano, la serie para y lo dice.
 * Cifrado real (ECDH/AES-GCM/ECDSA de WebCrypto); el lado nativo y las llamadas, falsos.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { encryptEnvelopeFor, decryptEnvelopeWith } from "@/ai/astraura/mesh/recipient-crypto";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden, type RespuestaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl } from "../sesion";
import { abrirRespuesta, sellarOrden, sellarRespuesta, type OrdenSellada } from "../sellado";
import { SIN_NATIVO, type PuenteNativoControl } from "../nativo";
import { VigiaMano, MOTIVO_BOTON_COLGAR, type FotoLlamadas } from "@/lib/banco-llamadas/a-mano";
import { ActorBanco, type DepsActor } from "@/lib/banco-llamadas/actor";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const MAC = "aaaa0000-0000-4000-8000-000000000001";
const T0 = Date.parse("2026-11-15T01:00:00Z");

let reloj = T0;
let seq = 0;
let nonceN = 0;
let mac: { privada: CryptoKey; spki: string; huella: string };
let cifrado: { pub: JsonWebKey; priv: CryptoKey };
let permiso: PermisoControl;
let ejecutadas: string[];
let lineas: string[];

/** Lado nativo falso: guarda la sesión como Rust y deja «pulsar» el indicador. */
class NativoFalso implements PuenteNativoControl {
    sesion: string | null = null;
    registro: string[] = [];
    paradas: string[] = [];
    private n = 0;
    constructor(private readonly indicador = true) {}
    disponible() {
        return this.indicador;
    }
    async abrir(de: string) {
        this.sesion = (++this.n).toString(16).padStart(32, "0");
        this.registro.push(`sesion-abierta de=${de.slice(0, 8)}`);
        return { ok: true, token: this.sesion };
    }
    async orden(token: string, nombre: string) {
        if (!this.sesion || token !== this.sesion) return { ok: false, motivo: "parada-nativa" };
        this.registro.push(`orden ${nombre} autorizada`);
        return { ok: true };
    }
    anotar(nombre: string, _de: string, r: string) {
        this.registro.push(`orden ${nombre} ${r}`);
    }
    async parar(motivo: string) {
        this.sesion = null;
        this.paradas.push(motivo);
    }
    /** La persona pulsa «Terminar el control ahora»: solo cambia «Rust», la página no interviene. */
    pulsarTerminar() {
        this.sesion = null;
        this.paradas.push("indicador");
    }
}

let nativo: NativoFalso;
let puerta: PuertaControl;

function crearPuerta(n: PuenteNativoControl, ejecutar?: (nombre: string) => Promise<unknown>) {
    puerta = new PuertaControl({
        subtle,
        ahora: () => reloj,
        cuentaPropia: () => CUENTA,
        neuronaPropia: () => TABLETA,
        huellaAparatoPropia: () => TABLETA,
        leerPermiso: () => permiso,
        guardarPermiso: (p) => {
            permiso = p;
        },
        ejecutar: async (nombre) => {
            ejecutadas.push(nombre);
            return ejecutar ? ejecutar(nombre) : { hecho: true };
        },
        anotar: (l) => lineas.push(l),
        azarHex: () => "0".repeat(32),
        nativo: n,
        abrirSobre: (env) => decryptEnvelopeWith(env, cifrado.priv),
    });
}

async function firmar(accion: string, o: Partial<CargaOrden> = {}, args: Record<string, unknown> = {}) {
    const carga: CargaOrden = {
        aud: AUD_CONTROL,
        v: 1,
        de: mac.huella,
        cuenta: CUENTA,
        para: TABLETA,
        nivel: "controlar",
        sesion: null,
        seq: ++seq,
        nonce: `nonce-sellado-${String(++nonceN).padStart(6, "0")}`,
        t: new Date(reloj).toISOString(),
        caduca: new Date(reloj + 60_000).toISOString(),
        accion: { nombre: accion, args },
        ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, mac.privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

async function sellada(accion: string, o: Partial<CargaOrden> = {}, args: Record<string, unknown> = {}) {
    const s = await sellarOrden(await firmar(accion, o, args), cifrado.pub, encryptEnvelopeFor);
    expect(s).not.toBeNull();
    return s!;
}

async function emparejarYAbrir(): Promise<string> {
    const p = await puerta.recibirSellado((await sellada("presentarse", {}, { spki: mac.spki, nombre: "Mac", neurona: MAC })).mensaje);
    expect(p.respuesta.motivo).toBe("pendiente");
    permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true };
    const a = await puerta.recibirSellado((await sellada("abrir-sesion")).mensaje);
    expect(a.respuesta.ok).toBe(true);
    return (a.respuesta.resultado as { sesion: string }).sesion;
}

beforeEach(async () => {
    reloj = T0;
    seq = 0;
    permiso = permisoDeFabrica();
    ejecutadas = [];
    lineas = [];
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    mac = { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
    const ec = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const jwk = await subtle.exportKey("jwk", ec.publicKey);
    cifrado = { pub: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, priv: ec.privateKey };
    nativo = new NativoFalso();
    crearPuerta(nativo);
});

describe("§2.2 · cuerpo sellado de punta a punta", () => {
    it("un cuerpo que un relé puede leer (orden firmada en claro) se rechaza sin ejecutar nada", async () => {
        await emparejarYAbrir();
        const claro = await firmar("leer-estado");
        const r = await puerta.recibirSellado(claro);
        expect(r.respuesta.motivo).toBe("sin-sellar");
        expect(r.kr).toBeNull();
        expect(ejecutadas).toEqual([]);
        expect(nativo.registro.some((l) => l.includes("rechazo:sin-sellar"))).toBe(true);
    });

    it("lo que ve el relé no deja leer la acción ni el nonce", async () => {
        const s = await sellada("colgar", {}, { secreto: "texto-que-no-debe-verse" });
        const visto = JSON.stringify(s.mensaje);
        expect(visto).not.toContain("colgar");
        expect(visto).not.toContain("texto-que-no-debe-verse");
        expect(visto).not.toContain("nonce-sellado");
    });

    it("un cuerpo sellado manipulado (un byte del cifrado cambiado) se rechaza sin ejecutar nada", async () => {
        await emparejarYAbrir();
        const s = await sellada("leer-estado");
        const ct = Buffer.from(s.mensaje.s.ct, "base64");
        ct[5] ^= 0x01;
        const roto: OrdenSellada = { ...s.mensaje, s: { ...s.mensaje.s, ct: ct.toString("base64") } };
        const r = await puerta.recibirSellado(roto);
        expect(r.respuesta.motivo).toBe("sellado-roto");
        expect(ejecutadas).toEqual([]);
    });

    it("un sobre de un relé con una orden inventada no pasa: la firma del aparato sigue mandando", async () => {
        await emparejarYAbrir();
        // El relé conoce la pública de cifrado (es pública) y sella lo que quiera: sin la clave del aparato no firma.
        const falsa = { v: 1, carga: b64url(new TextEncoder().encode(JSON.stringify({ aud: AUD_CONTROL }))), firma: "AAAA" };
        const s = await sellarOrden(falsa, cifrado.pub, encryptEnvelopeFor);
        const r = await puerta.recibirSellado(s!.mensaje);
        expect(r.respuesta.ok).toBe(false);
        expect(ejecutadas).toEqual([]);
    });

    it("la respuesta va sellada con la clave de un solo uso: otra clave, otro nonce o un byte cambiado no abren", async () => {
        const s = await sellada("leer-estado");
        const r: RespuestaOrden = { tipo: "respuesta", nonce: "n-1", ok: true, motivo: "ok", resultado: { ruta: "/mensajes" } };
        const sr = (await sellarRespuesta(r, s.kr))!;
        expect(JSON.stringify(sr)).not.toContain("/mensajes");
        expect(await abrirRespuesta(sr, s.kr, "n-1")).toEqual(r);
        expect(await abrirRespuesta(sr, new Uint8Array(32), "n-1")).toBeNull();
        expect(await abrirRespuesta(sr, s.kr, "n-2")).toBeNull();
        const ct = Buffer.from(sr.ct, "base64");
        ct[0] ^= 0x80;
        expect(await abrirRespuesta({ ...sr, ct: ct.toString("base64") }, s.kr, "n-1")).toBeNull();
        expect(await abrirRespuesta(r, s.kr, "n-1")).toBeNull(); // una respuesta en claro no vale
    });

    it("sin la pública de cifrado del destino no se sella ni se manda", async () => {
        expect(await sellarOrden(await firmar("leer-estado"), null, encryptEnvelopeFor)).toBeNull();
    });
});

describe("§1 H y §2.4 · sesión, indicador y parada en el lado nativo", () => {
    it("sin indicador nativo posible no hay control (navegador, Android/iOS en este pase)", async () => {
        crearPuerta(SIN_NATIVO);
        await puerta.recibirSellado((await sellada("presentarse", {}, { spki: mac.spki, nombre: "Mac", neurona: MAC })).mensaje);
        permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true };
        const r = await puerta.recibirSellado((await sellada("abrir-sesion")).mensaje);
        expect(r.respuesta.motivo).toBe("sin-indicador-nativo");
        expect(puerta.sesionActiva()).toBeNull();
    });

    it("parar en el indicador termina la sesión aunque la página esté colgada; la orden siguiente no se ejecuta", async () => {
        let soltar: () => void = () => undefined;
        crearPuerta(nativo, (nombre) => (nombre === "leer-estado" ? new Promise<unknown>((res) => (soltar = () => res({}))) : Promise.resolve({})));
        const token = await emparejarYAbrir();
        expect(token).toBe(nativo.sesion); // el token es el de «Rust»
        // La página se cuelga ejecutando una orden (no contesta)...
        const colgada = puerta.recibirSellado((await sellada("leer-estado", { sesion: token })).mensaje);
        for (let i = 0; i < 200 && !ejecutadas.includes("leer-estado"); i++) await new Promise((r) => setTimeout(r, 5));
        // ...y la persona pulsa «Terminar el control ahora»: solo actúa «Rust».
        nativo.pulsarTerminar();
        expect(nativo.sesion).toBeNull();
        const r = await puerta.recibirSellado((await sellada("colgar", { sesion: token })).mensaje);
        expect(r.respuesta.motivo).toBe("parada-nativa");
        expect(ejecutadas).toEqual(["leer-estado"]);
        expect(puerta.sesionActiva()).toBeNull();
        soltar();
        await colgada;
    });

    it("cada orden autorizada queda anotada por el lado nativo; revocar para también en «Rust»", async () => {
        const token = await emparejarYAbrir();
        await puerta.recibirSellado((await sellada("leer-estado", { sesion: token })).mensaje);
        expect(nativo.registro).toContain("orden leer-estado autorizada");
        puerta.revocar();
        expect(nativo.paradas).toContain("revocado");
    });
});

describe("ronda §4 regla 5 · una persona toma el mando", () => {
    const foto = (o: Partial<FotoLlamadas> = {}): FotoLlamadas => ({ activa: null, fase: null, motivoFin: null, timbres: [], ...o });

    it("el vigía distingue lo del guion de lo de una persona", () => {
        const v = new VigiaMano();
        v.observar(foto({ timbres: ["s1"] }), 0);
        expect(v.observar(foto({ activa: "s1", fase: "en-curso" }), 100)).toBe("contesto");
        v.observar(foto(), 200);
        v.observar(foto({ timbres: ["s2"] }), 300);
        v.esperar("contestar", 300);
        expect(v.observar(foto({ activa: "s2", fase: "en-curso" }), 400)).toBeNull();
        expect(v.observar(foto({ activa: "s2", fase: "terminada", motivoFin: MOTIVO_BOTON_COLGAR }), 500)).toBe("colgo");
        v.observar(foto({ activa: "s3", fase: "en-curso" }), 600);
        expect(v.observar(foto({ activa: "s3", fase: "terminada", motivoFin: "La otra persona colgó." }), 700)).toBeNull(); // colgó el otro lado
        v.observar(foto({ activa: "s4", fase: "en-curso" }), 800);
        v.esperar("colgar", 800);
        expect(v.observar(foto({ activa: "s4", fase: "terminada", motivoFin: MOTIVO_BOTON_COLGAR }), 900)).toBeNull();
    });

    it("en la tableta: la intervención para la sesión en «Rust» y la orden siguiente dice «a-mano»", async () => {
        const token = await emparejarYAbrir();
        puerta.intervencionLocal("contesto");
        expect(nativo.paradas).toContain("a-mano");
        const r = await puerta.recibirSellado((await sellada("colgar", { sesion: token })).mensaje);
        expect(r.respuesta.motivo).toBe("a-mano");
        expect(ejecutadas).toEqual([]);
    });

    it("el actor de la Mac para la serie al recibir «a-mano» y no cuelga la llamada de esa persona", async () => {
        let t = T0;
        const marcas: string[] = [];
        const local: string[] = [];
        const deps: DepsActor = {
            ahora: () => t,
            dormir: async (ms) => {
                t += ms;
            },
            leer: async () => ({
                orden: {
                    v: 1, serie: "s20261115-0100", n: 1, de_n: 3, escenario: "ble-video-2min", para: TABLETA, tipo: "video", medio: "sin-ip-desde-inicio",
                    guion: [{ t_s: 30, quien: "tableta", accion: "mudo" }], dur_s: 60,
                    creada: new Date(T0).toISOString(), caduca: new Date(T0 + 120_000).toISOString(),
                },
                calma: null,
            }),
            marcar: (d) => marcas.push(d),
            tableta: () => ({
                orden: async (nombre) =>
                    nombre === "micro" || nombre === "mudo"
                        ? { tipo: "respuesta", nonce: "x", ok: false, motivo: "a-mano", resultado: { que: "colgo" } }
                        : { tipo: "respuesta", nonce: "x", ok: true, motivo: "ok", resultado: nombre === "leer-estado" ? { llamada: null } : {} },
            }),
            local: async (nombre) => {
                local.push(nombre);
                return {};
            },
        };
        const a = new ActorBanco(deps);
        a.armar(TABLETA);
        expect(await a.vuelta()).toBe("a-mano");
        expect(marcas).toContain("a-mano que=colgo donde=tableta");
        expect(marcas).toContain("apagada motivo=a-mano");
        expect(marcas.some((m) => m.includes("cuelga=persona"))).toBe(true);
        expect(local).not.toContain("colgar"); // no colgó: la llamada es de la persona
        expect(a.estado()).toBeNull();
    });
});

// ORD1114T · el rechazo a mano de un timbre durante una serie también para la serie.
describe("ronda §4 regla 5 · rechazo a mano (ORD1114T)", () => {
    const foto = (o: Partial<FotoLlamadas> = {}): FotoLlamadas => ({ activa: null, fase: null, motivoFin: null, timbres: [], rechazos: 0, ...o });

    it("la llamada que suena en el otro aparato recibe «rechazo»: es una persona, y se cuenta una vez", () => {
        const v = new VigiaMano();
        v.esperar("llamar", 0);
        v.observar(foto(), 0);
        expect(v.observar(foto({ activa: "s1", fase: "llamando" }), 100)).toBeNull(); // llamada del guion
        expect(v.observar(foto({ activa: "s1", fase: "llamando", rechazos: 1 }), 200)).toBe("rechazo");
        expect(v.observar(foto({ activa: "s1", fase: "terminada", motivoFin: "Tableta no puede atender ahora.", rechazos: 1 }), 300)).toBeNull();
    });

    it("solo el fin «no puede atender ahora» (sin ver la señal) también cuenta; que el otro corte, no", () => {
        const v = new VigiaMano();
        v.observar(foto({ activa: "s2", fase: "llamando" }), 0);
        expect(v.observar(foto({ activa: "s2", fase: "terminada", motivoFin: "Tableta no puede atender ahora." }), 100)).toBe("rechazo");
        v.observar(foto({ activa: "s3", fase: "llamando" }), 200);
        expect(v.observar(foto({ activa: "s3", fase: "terminada", motivoFin: "La otra persona colgó." }), 300)).toBeNull();
        v.observar(foto({ timbres: ["s4"] }), 400);
        expect(v.observar(foto(), 500)).toBeNull(); // el timbre se fue (caducó o cortó quien llama)
    });

    it("en la tableta: un rechazo para la sesión en «Rust» y la Mac recibe «a-mano» con que=rechazo", async () => {
        const token = await emparejarYAbrir();
        puerta.intervencionLocal("rechazo");
        expect(nativo.paradas).toContain("a-mano");
        const r = await puerta.recibirSellado((await sellada("colgar", { sesion: token })).mensaje);
        expect(r.respuesta.motivo).toBe("a-mano");
        expect((r.respuesta.resultado as { que?: string } | undefined)?.que).toBe("rechazo");
    });
});
