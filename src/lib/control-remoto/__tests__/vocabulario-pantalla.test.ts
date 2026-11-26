/**
 * PAN1115J · el vocabulario nuevo (pantalla y entrada): cada rechazo de sus argumentos, el nivel de cada orden
 * y la puerta (nivel, tope de 60 por segundo, sobre intacto hasta el ejecutor). Firmas ECDSA reales.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { ACCIONES, TECLAS, capacidadesDeNivel, definicion } from "../niveles";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, TOPE_ENTRADA_SEGUNDO, type PermisoControl } from "../sesion";

const v = (n: string, a: Record<string, unknown>) => definicion(n)!.validar(a);
const punto = (x = 0.5, y = 0.5, dt = 10): [number, number, number] => [x, y, dt];

describe("niveles de las órdenes nuevas", () => {
    it("pantalla y estado son de «ver»; la entrada es de «controlar»", () => {
        for (const n of ["pantalla-iniciar", "pantalla-parar", "pantalla-senal", "leer-aparato"]) expect(ACCIONES[n].nivel).toBe("ver");
        for (const n of ["gesto", "tecla", "volumen", "brillo", "texto"]) {
            expect(ACCIONES[n].nivel).toBe("controlar");
            expect(ACCIONES[n].entrada).toBe(true);
        }
        expect(capacidadesDeNivel("ver")).not.toContain("gesto");
        expect(capacidadesDeNivel("ver")).toContain("pantalla-iniciar");
        expect(capacidadesDeNivel("controlar")).toEqual(expect.arrayContaining(["gesto", "tecla", "volumen", "brillo", "texto"]));
    });
    it("no hay orden de nivel «administrar»; «modificar» solo para terminal (TRM1125A)", () => {
        for (const d of Object.values(ACCIONES)) {
            expect(d.nivel).not.toBe("administrar");
            if (d.nivel === "modificar") {
                expect(["terminal-abrir", "terminal-cerrar", "terminal-ejecutar"]).toContain(
                    Object.keys(ACCIONES).find((k) => ACCIONES[k] === d)
                );
            }
        }
    });
});

describe("gesto", () => {
    const dedo = (id: number, n = 1) => ({ id, puntos: Array.from({ length: n }, () => punto()) });
    it("acepta un toque y redondea a 4 decimales", () => {
        expect(v("gesto", { dedos: [{ id: 0, puntos: [[0.123456, 0.5, 5]] }], sigue: false })).toEqual({ dedos: [{ id: 0, puntos: [[0.1235, 0.5, 5]] }], sigue: false });
    });
    it("acepta 10 dedos y 64 puntos por dedo", () => {
        expect(v("gesto", { dedos: Array.from({ length: 10 }, (_, i) => dedo(i, 64)), sigue: true })).not.toBeNull();
    });
    const rechazos: [string, Record<string, unknown>][] = [
        ["11 dedos", { dedos: Array.from({ length: 11 }, (_, i) => dedo(i % 10)), sigue: false }],
        ["65 puntos", { dedos: [dedo(0, 65)], sigue: false }],
        ["sin dedos", { dedos: [], sigue: false }],
        ["dedo sin puntos", { dedos: [{ id: 0, puntos: [] }], sigue: false }],
        ["id repetido", { dedos: [dedo(1), dedo(1)], sigue: false }],
        ["id 10", { dedos: [dedo(10)], sigue: false }],
        ["id negativo", { dedos: [dedo(-1)], sigue: false }],
        ["id fraccionario", { dedos: [{ id: 0.5, puntos: [punto()] }], sigue: false }],
        ["x fuera", { dedos: [{ id: 0, puntos: [[1.01, 0.5, 1]] }], sigue: false }],
        ["y negativa", { dedos: [{ id: 0, puntos: [[0.5, -0.1, 1]] }], sigue: false }],
        ["x NaN", { dedos: [{ id: 0, puntos: [[NaN, 0.5, 1]] }], sigue: false }],
        ["dt negativo", { dedos: [{ id: 0, puntos: [[0.5, 0.5, -1]] }], sigue: false }],
        ["dt enorme", { dedos: [{ id: 0, puntos: [[0.5, 0.5, 10_001]] }], sigue: false }],
        ["punto de dos", { dedos: [{ id: 0, puntos: [[0.5, 0.5]] }], sigue: false }],
        ["sin sigue", { dedos: [dedo(0)] }],
        ["sigue no booleano", { dedos: [dedo(0)], sigue: "si" }],
        ["clave extra", { dedos: [dedo(0)], sigue: false, extra: 1 }],
        ["clave extra en dedo", { dedos: [{ id: 0, puntos: [punto()], x: 1 }], sigue: false }],
        ["dedos no es lista", { dedos: "x", sigue: false }],
    ];
    for (const [nombre, args] of rechazos) it(`rechaza: ${nombre}`, () => expect(v("gesto", args)).toBeNull());
});

describe("tecla, volumen, brillo, texto, pantalla", () => {
    it("tecla: cada una de la lista cerrada y nada más", () => {
        for (const t of TECLAS) expect(v("tecla", { cual: t })).toEqual({ cual: t });
        expect(TECLAS).toHaveLength(11);
        for (const malo of ["apagar", "", "Atras", 3, null]) expect(v("tecla", { cual: malo })).toBeNull();
        expect(v("tecla", {})).toBeNull();
        expect(v("tecla", { cual: "atras", y: 1 })).toBeNull();
    });
    it("volumen: flujo cerrado y nivel 0..1", () => {
        expect(v("volumen", { flujo: "timbre", nivel: 0.5 })).toEqual({ flujo: "timbre", nivel: 0.5 });
        expect(v("volumen", { flujo: "multimedia", nivel: 0 })).not.toBeNull();
        expect(v("volumen", { flujo: "multimedia", nivel: 1 })).not.toBeNull();
        for (const a of [{ flujo: "sistema", nivel: 0.5 }, { flujo: "timbre", nivel: 1.1 }, { flujo: "timbre", nivel: -0.1 }, { flujo: "timbre", nivel: NaN }, { flujo: "timbre", nivel: "1" }, { flujo: "timbre" }]) {
            expect(v("volumen", a)).toBeNull();
        }
    });
    it("brillo: 0..1", () => {
        expect(v("brillo", { nivel: 0.3 })).toEqual({ nivel: 0.3 });
        for (const a of [{ nivel: 2 }, { nivel: -1 }, { nivel: Infinity }, {}, { nivel: 0.3, x: 1 }]) expect(v("brillo", a)).toBeNull();
    });
    it("texto: hasta 512 caracteres y sin controles", () => {
        expect(v("texto", { texto: "hola\nmundo\t!" })).not.toBeNull();
        expect(v("texto", { texto: "a".repeat(512) })).not.toBeNull();
        expect(v("texto", { texto: "😀".repeat(512) })).not.toBeNull(); // 512 caracteres, no 512 unidades
        for (const a of [{ texto: "a".repeat(513) }, { texto: "" }, { texto: "a\u0000b" }, { texto: "a\u001bb" }, { texto: 5 }, {}, { texto: "a", x: 1 }]) expect(v("texto", a)).toBeNull();
    });
    it("pantalla-iniciar: lado y calidad opcionales y acotados", () => {
        expect(v("pantalla-iniciar", {})).toEqual({});
        expect(v("pantalla-iniciar", { lado: 1280, calidad: 60 })).toEqual({ lado: 1280, calidad: 60 });
        // UNI1115M · costura b: calidad es un entero 1..100 (los dos extremos valen)
        expect(v("pantalla-iniciar", { calidad: 1 })).toEqual({ calidad: 1 });
        expect(v("pantalla-iniciar", { calidad: 100 })).toEqual({ calidad: 100 });
        for (const a of [{ lado: 100 }, { lado: 4000 }, { lado: 1280.5 }, { calidad: 0 }, { calidad: 101 }, { calidad: 60.5 }, { calidad: 0.6 }, { otra: 1 }]) expect(v("pantalla-iniciar", a)).toBeNull();
    });
    it("pantalla-parar y leer-aparato no llevan argumentos", () => {
        expect(v("pantalla-parar", {})).toEqual({});
        expect(v("leer-aparato", {})).toEqual({});
        expect(v("pantalla-parar", { x: 1 })).toBeNull();
        expect(v("leer-aparato", { x: 1 })).toBeNull();
    });
    it("pantalla-senal: partes de oferta o respuesta, petición de parte y candidatos, con topes", () => {
        const base = { neg: "abcdef0123", tipo: "oferta", i: 0, n: 1, total: 11, sha: "0123456789abcdef", datos: "v=0\r\noferta" };
        expect(v("pantalla-senal", base)).not.toBeNull();
        expect(v("pantalla-senal", { neg: "abcdef0123", pide: 3 })).not.toBeNull();
        expect(v("pantalla-senal", { candidatos: ["candidate:1 1 udp 2 1.2.3.4 5 typ host"] })).not.toBeNull();
        const malos: Record<string, unknown>[] = [
            {},
            { oferta: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n" }, // el formato antiguo, sin partes, ya no existe
            { ...base, datos: "x".repeat(1801), total: 1801 },
            { ...base, i: 1 },
            { ...base, n: 13 },
            { ...base, total: 16_001 },
            { ...base, total: 5000 },
            { ...base, datos: "v=0" }, // largo distinto al total
            { ...base, neg: "A" },
            { ...base, sha: "zz" },
            { ...base, tipo: "otra" },
            { ...base, datos: "\u0001abcdefghij" },
            { ...base, extra: 1 },
            { neg: "abcdef0123", pide: 12 },
            { neg: "abcdef0123", pide: -1 },
            { candidatos: [] },
            { candidatos: Array.from({ length: 9 }, () => "candidate:1") },
            { candidatos: ["x".repeat(401)] },
            { candidatos: ["<script>"] },
            { candidatos: [3] },
            { candidatos: ["candidate:1"], neg: "abcdef0123" },
        ];
        for (const a of malos) expect(v("pantalla-senal", a)).toBeNull();
    });
});

// ── la puerta ────────────────────────────────────────────────────────────────────────────────

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
let reloj = Date.parse("2026-11-15T10:00:00Z");
let nonceN = 0;
let seqN = 0;

async function par() {
    const k = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", k.publicKey)));
    return { priv: k.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
}
type Par = Awaited<ReturnType<typeof par>>;

async function firmar(a: Par, accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) {
    const carga: CargaOrden = {
        aud: AUD_CONTROL, v: 1, de: a.huella, cuenta: CUENTA, para: TABLETA, nivel: "controlar", sesion: null, seq: ++seqN,
        nonce: `nonce-pan-${String(++nonceN).padStart(8, "0")}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(),
        accion: { nombre: accion, args }, ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, a.priv, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

let permiso: PermisoControl;
let puerta: PuertaControl;
let mac: Par;
let llamadas: { nombre: string; args: unknown; sobre: unknown; sesion: unknown }[];

beforeEach(async () => {
    reloj = Date.parse("2026-11-15T10:00:00Z");
    seqN = 0;
    permiso = permisoDeFabrica();
    mac = await par();
    llamadas = [];
    let n = 0;
    puerta = new PuertaControl({
        subtle, ahora: () => reloj, cuentaPropia: () => CUENTA, neuronaPropia: () => TABLETA, leerPermiso: () => permiso, guardarPermiso: (p) => { permiso = p; },
        ejecutar: async (nombre, args, _c, sobre, sesion) => { llamadas.push({ nombre, args, sobre, sesion }); return { ok: true }; },
        anotar: () => undefined, azarHex: () => (++n).toString(16).padStart(32, "0"),
        nativo: { disponible: () => true, abrir: async () => ({ ok: true, token: "a".repeat(32) }), orden: async () => ({ ok: true }), anotar: () => undefined, parar: async () => undefined },
    });
    await puerta.recibir(await firmar(mac, "presentarse", { spki: mac.spki, nombre: "Mac", neurona: "n-mac" }));
});

async function conSesion(nivel: "ver" | "controlar") {
    permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel };
    const r = await puerta.recibir(await firmar(mac, "abrir-sesion", {}, { nivel }));
    expect(r.ok).toBe(true);
    return (r.resultado as { sesion: string }).sesion;
}

describe("la puerta con las órdenes nuevas", () => {
    it("la entrada llega al ejecutor con su sobre intacto y el token de la sesión", async () => {
        const s = await conSesion("controlar");
        const sobre = await firmar(mac, "gesto", { dedos: [{ id: 0, puntos: [[0.1, 0.2, 5]] }], sigue: false }, { sesion: s });
        const r = await puerta.recibir(sobre);
        expect(r.ok).toBe(true);
        expect(llamadas).toHaveLength(1);
        expect(llamadas[0].sobre).toBe(sobre);
        expect(llamadas[0].sesion).toMatchObject({ token: s, nivel: "controlar" });
    });
    it("con una sesión de «ver» la entrada se rechaza con «nivel» y no llega al ejecutor", async () => {
        const s = await conSesion("ver");
        for (const [n, a] of [["tecla", { cual: "atras" }], ["brillo", { nivel: 0.5 }], ["texto", { texto: "x" }], ["volumen", { flujo: "timbre", nivel: 0.1 }], ["gesto", { dedos: [{ id: 0, puntos: [[0.1, 0.2, 5]] }], sigue: false }]] as const) {
            const r = await puerta.recibir(await firmar(mac, n, { ...a }, { sesion: s, nivel: "ver" }));
            expect(r).toMatchObject({ ok: false, motivo: "nivel" });
        }
        expect(llamadas).toHaveLength(0);
        // pantalla y estado sí valen con «ver»
        expect((await puerta.recibir(await firmar(mac, "leer-aparato", {}, { sesion: s, nivel: "ver" }))).ok).toBe(true);
    });
    it("sin sesión abierta la entrada no llega al ejecutor", async () => {
        permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel: "controlar" };
        const r = await puerta.recibir(await firmar(mac, "tecla", { cual: "atras" }, { sesion: "0".repeat(32) }));
        expect(r.ok).toBe(false);
        expect(llamadas).toHaveLength(0);
    });
    it("una orden de entrada con argumentos malos se rechaza antes del ejecutor", async () => {
        const s = await conSesion("controlar");
        const r = await puerta.recibir(await firmar(mac, "tecla", { cual: "apagar" }, { sesion: s }));
        expect(r).toMatchObject({ ok: false, motivo: "argumentos" });
        expect(llamadas).toHaveLength(0);
    });
    it("la entrada admite 60 por segundo y la 61 es «limite»; las órdenes de app siguen en 5", async () => {
        const s = await conSesion("controlar");
        expect(TOPE_ENTRADA_SEGUNDO).toBe(60);
        let ok = 0;
        for (let i = 0; i < 60; i++) if ((await puerta.recibir(await firmar(mac, "tecla", { cual: "atras" }, { sesion: s }))).ok) ok++;
        expect(ok).toBe(60);
        expect(await puerta.recibir(await firmar(mac, "tecla", { cual: "atras" }, { sesion: s }))).toMatchObject({ ok: false, motivo: "limite" });
        reloj += 1100;
        expect((await puerta.recibir(await firmar(mac, "tecla", { cual: "atras" }, { sesion: s }))).ok).toBe(true);
    });
    it("la entrada no gasta el tope de las órdenes de app", async () => {
        const s = await conSesion("controlar");
        for (let i = 0; i < 30; i++) await puerta.recibir(await firmar(mac, "tecla", { cual: "atras" }, { sesion: s }));
        expect((await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion: s }))).ok).toBe(true);
    });
});
