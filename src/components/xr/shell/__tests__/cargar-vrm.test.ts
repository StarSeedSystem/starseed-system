/**
 * XR1010Z · pruebas de los avatares por nivel (contrato `architecture/starseed-xr.md` §3 d y h).
 * Node, sin red, sin WebGL y sin disco: three y @pixiv/three-vrm se inyectan como cargadores falsos.
 */
import { describe, expect, it } from "vitest";
import { TOPES_VRM_MB, cargarVrm, elegirAvatar, topeVrm, urlVrmSegura } from "../cargar-vrm";
import type { CargadorGltf, HerramientasVrm, ProgresoVrm } from "../cargar-vrm";

const URL_OK = "https://biblioteca.starseed.example/avatares/persona.vrm";
const URL_HTTP = "http://biblioteca.starseed.example/avatares/persona.vrm";
const URL_CREDENCIALES = "https://ana:secreta@biblioteca.starseed.example/avatares/persona.vrm";

/** Cargador falso: guarda los callbacks de cada load para que la prueba decida qué ocurre. */
interface Cargas { url: string; alCargar(g: { scene?: unknown }): void; alProgresar(e: ProgresoVrm): void; alFallar(e: unknown): void }
const frances = new Array<Cargas>();
const instancias = new Array<{ registrados: unknown[] }>();

class FalsoLoader implements CargadorGltf {
    registrados = new Array<unknown>();
    constructor() { instancias.push(this); }
    register(f: (parser: unknown) => unknown): void { this.registrados.push(f); }
    load(url: string, a: (g: { scene?: unknown }) => void, b?: (e: ProgresoVrm) => void, c?: (e: unknown) => void): void {
        frances.push({ url, alCargar: a, alProgresar: (e) => b?.(e), alFallar: (e) => c?.(e) });
    }
}
class FalsoPlugin { constructor(parser: unknown) { void parser; } }
class FalsoLoaderQueLanza { constructor() { throw new Error("sin memoria"); } }

const herramientas: HerramientasVrm = { GLTFLoader: FalsoLoader, VRMLoaderPlugin: FalsoPlugin };
const queLanza: HerramientasVrm = { GLTFLoader: FalsoLoaderQueLanza as unknown as HerramientasVrm["GLTFLoader"], VRMLoaderPlugin: FalsoPlugin };
const ultimas = (): Cargas | undefined => frances[frances.length - 1];
const MB = 1024 * 1024;
describe("elegirAvatar", () => {
    it("por nivel: mínima orbe+manos, baja cabeza+manos, media y más VRM con preferencia segura", () => {
        const pref = { vrmUrl: URL_OK };
        expect(["minima", "baja", "media", "alta", "maxima"].map((n) => elegirAvatar(n as Parameters<typeof elegirAvatar>[0], pref, 1))).toEqual(["orbe-manos", "cabeza-manos", "vrm", "vrm", "vrm"]);
    });
    it("sin VRM (o con URL insegura) y sin turno válido nadie lleva VRM, cae a cabeza+manos", () => {
        expect([
            elegirAvatar("media", null, 1),
            elegirAvatar("maxima", { vrmUrl: URL_HTTP }, 1),
            elegirAvatar("maxima", { vrmUrl: URL_OK }, Number.NaN),
            elegirAvatar("maxima", { vrmUrl: URL_OK }, 0),
        ]).toEqual(["cabeza-manos", "cabeza-manos", "cabeza-manos", "cabeza-manos"]);
    });
    it("reparto de VRM con 30 jugadores en nivel media: tope 12, la más cercana gana, el resto se degrada", () => {
        expect(topeVrm("media")).toBe(12);
        const pref = { vrmUrl: URL_OK };
        expect(elegirAvatar("media", pref, 1)).toBe("vrm");
        expect(elegirAvatar("media", pref, 12)).toBe("vrm");
        expect(elegirAvatar("media", pref, 13)).toBe("cabeza-manos");
        expect(elegirAvatar("media", pref, 30)).toBe("cabeza-manos");
        // En mínima el tope es 4 pero la base ya es orbe: nadie lleva VRM aunque sea la más cercana.
        expect(elegirAvatar("minima", pref, 1)).toBe("orbe-manos");
    });
});

describe("urlVrmSegura", () => {
    it("acepta https sin credenciales y rechaza http, ftp, credenciales y cadenas rotas", () => {
        expect(urlVrmSegura(URL_OK)).toBe(true);
        expect(urlVrmSegura(URL_HTTP)).toBe(false);
        expect(urlVrmSegura(URL_CREDENCIALES)).toBe(false);
        expect(urlVrmSegura("https://ana@biblioteca.starseed.example/a.vrm")).toBe(false);
        expect(urlVrmSegura("ftp://biblioteca.starseed.example/a.vrm")).toBe(false);
        expect(urlVrmSegura("")).toBe(false);
        expect(urlVrmSegura("no es una url")).toBe(false);
        expect(urlVrmSegura(undefined)).toBe(false);
    });
});

describe("cargarVrm", () => {
    it("URL insegura: no toca el cargador y responde {ok:false, motivo:'url-insegura'}", async () => {
        const antes = frances.length;
        expect(await cargarVrm(URL_HTTP, herramientas)).toEqual({ ok: false, motivo: "url-insegura" });
        expect(await cargarVrm(URL_CREDENCIALES, herramientas)).toEqual({ ok: false, motivo: "url-insegura" });
        expect(frances.length).toBe(antes);
    });
    it("carga buena: registra el plugin de VRM y devuelve la escena recibida", async () => {
        const promesa = cargarVrm(URL_OK, herramientas);
        const carga = ultimas() as Cargas;
        expect([carga.url, instancias.some((i) => i.registrados.length === 1)]).toEqual([URL_OK, true]);
        carga.alProgresar({ total: 5 * MB, loaded: MB });
        carga.alCargar({ scene: { nombre: "vrm" } });
        expect(await promesa).toEqual({ ok: true, escena: { nombre: "vrm" } });
    });
    it("alFallar del cargador → {ok:false, motivo:'carga-fallida'}; nunca lanza", async () => {
        const promesa = cargarVrm(URL_OK, herramientas);
        (ultimas() as Cargas).alFallar(new Error("DNS"));
        expect(await promesa).toEqual({ ok: false, motivo: "carga-fallida" });
    });
    it("cargador falso que lanza al construirse → {ok:false, motivo:'carga-fallida'}", async () => {
        expect(await cargarVrm(URL_OK, queLanza)).toEqual({ ok: false, motivo: "carga-fallida" });
    });    it("archivo demasiado grande (total > tope) rechazado con motivo 'demasiado-grande'", async () => {
        const promesa = cargarVrm(URL_OK, herramientas, { topeMB: TOPES_VRM_MB["vrm-ligero"] });
        const c = ultimas() as Cargas;
        c.alProgresar({ total: (TOPES_VRM_MB["vrm-ligero"] + 5) * MB });
        c.alCargar({ scene: { nombre: "vrm-llego-igual" } });
        expect(await promesa).toEqual({ ok: false, motivo: "demasiado-grande" });
    });
    it("topes por defecto: ≤ 25 MB para vrm y ≤ 10 MB para vrm-ligero", async () => {
        expect(TOPES_VRM_MB).toEqual({ vrm: 25, "vrm-ligero": 10 });
        const dentro = cargarVrm(URL_OK, herramientas, { topeMB: TOPES_VRM_MB.vrm });
        const c = ultimas() as Cargas;
        c.alProgresar({ total: (TOPES_VRM_MB.vrm - 1) * MB });
        c.alCargar({ scene: { nombre: "ok" } });
        expect(await dentro).toEqual({ ok: true, escena: { nombre: "ok" } });
    });
    it("plugin registrado sobre el cargador; sin escena devuelta el motivo es 'sin-escena'", async () => {
        const instanciasAntes = instancias.length;
        const sinEscena = cargarVrm(URL_OK, herramientas);
        (ultimas() as Cargas).alCargar({});
        expect(await sinEscena).toEqual({ ok: false, motivo: "sin-escena" });
        expect(instancias.length).toBe(instanciasAntes + 1);
        expect(instancias[instancias.length - 1].registrados).toHaveLength(1);
    });
});
