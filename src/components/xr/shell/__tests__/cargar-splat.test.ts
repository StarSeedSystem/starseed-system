import { describe, it, expect } from "vitest";
import { URL_OK, puedeUsarSplat, PRESUPUESTO_SPLAT, urlSplatSegura, marcadorSplat, cargarSplat } from "@/lib/xr/splat";

const claseFalsa = (impl: () => Promise<unknown> | unknown) => {
    class Falsa {
        initialized: Promise<unknown>;
        constructor() {
            this.initialized = impl();
        }
    }
    return Falsa;
};

const URL_OK = "https://biblioteca.starseed.os/splats/jardin.spz";

describe("puedeUsarSplat", () => {
    it("sólo alta y máxima", () => {
        expect(puedeUsarSplat("maxima")).toBe(true);
        expect(puedeUsarSplat("alta")).toBe(true);
        expect(puedeUsarSplat("media")).toBe(false);
        expect(puedeUsarSplat("baja")).toBe(false);
        expect(puedeUsarSplat("minima")).toBe(false);
    });
});

describe("PRESUPUESTO_SPLAT", () => {
    it("por nivel: 1,5 M en alta y 3 M en máxima, 0 debajo", () => {
        expect(PRESUPUESTO_SPLAT.alta).toBe(1_500_000);
        expect(PRESUPUESTO_SPLAT.maxima).toBe(3_000_000);
        expect(PRESUPUESTO_SPLAT.media).toBe(0);
    });
});

describe("urlSplatSegura", () => {
    it("https sí; http, credenciales y basura no", () => {
        expect(urlSplatSegura(URL_OK)).toBe(true);
        expect(urlSplatSegura("http://biblioteca.starseed.os/splats/jardin.spz")).toBe(false);
        expect(urlSplatSegura("https://ana:secreto@biblioteca.starseed.os/jardin.spz")).toBe(false);
        expect(urlSplatSegura("")).toBe(false);
        expect(urlSplatSegura("no es una url")).toBe(false);
    });
});

describe("marcadorSplat", () => {
    it("nivel bajo, sin enlace, o listo", () => {
        expect(marcadorSplat("media", URL_OK)).toBe("Este objeto necesita un aparato más potente.");
        expect(marcadorSplat("alta", undefined)).toBe("Este splat de la Biblioteca todavía no tiene enlace de descarga.");
        expect(marcadorSplat("maxima", URL_OK)).toBeNull();
    });
});

describe("cargarSplat", () => {
    it("URL http rechazada sin tocar el cargador", async () => {
        let construida = false;
        const r = await cargarSplat("http://insegura.os/splat.ply", {
            SplatMesh: claseFalsa(() => {
                construida = true;
                return Promise.resolve();
            }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("https");
        expect(construida).toBe(false);
    });

    it("archivo de más de 60 MB se rechaza con motivo", async () => {
        const r = await cargarSplat(URL_OK, {
            bytes: 65 * 1024 * 1024,
            SplatMesh: claseFalsa(() => Promise.resolve()),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("60 MB");
        expect(65 * 1024 * 1024 > PRESUPUESTO_SPLAT.alta).toBe(true);
    });

    it("HEAD que responde Content-Length enorme también se rechaza", async () => {
        const pedir: typeof fetch = async () =>
            new Response(null, { headers: { "Content-Length": String(PRESUPUESTO_SPLAT.maxima + 1) } });
        const r = await cargarSplat(URL_OK, { pedir, SplatMesh: claseFalsa(() => Promise.resolve()) });
        expect(r.ok).toBe(false);
    });

    it("cargador que lanza en el constructor devuelve {ok:false}", async () => {
        const r = await cargarSplat(URL_OK, {
            SplatMesh: claseFalsa(() => {
                throw new Error("GPU sin memoria");
            }),
            bytes: 1024,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("GPU sin memoria");
    });

    it("initialized que rechaza devuelve {ok:false}", async () => {
        const r = await cargarSplat(URL_OK, {
            SplatMesh: claseFalsa(() => Promise.reject(new Error("formato desconocido"))),
            bytes: 1024,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("formato desconocido");
    });

    it("carga feliz pasa la URL y el presupuesto del nivel a la malla", async () => {
        const vistas: SplatMeshOptions[] = [];
        const Clase = class CargoVisto {
            initialized: Promise<unknown>;
            constructor(opciones: SplatMeshOptions) {
                vistas.push(opciones);
                this.initialized = Promise.resolve();
            }
        } as unknown as MallaSplat;
        const r = await cargarSplat(URL_OK, { SplatMesh: Clase, nivel: "alta", bytes: 1024 });
        expect(r.ok).toBe(true);
        expect(vistas[0].url).toBe(URL_OK);
        expect(vistas[0].maxSplats).toBe(PRESUPUESTO_SPLAT.alta);
    });

    it("sin nivel no fija maxSplats", async () => {
        const vistas: SplatMeshOptions[] = [];
        const Clase = class CargoVisto {
            initialized: Promise<unknown>;
            constructor(opciones: SplatMeshOptions) {
                vistas.push(opciones);
                this.initialized = Promise.resolve();
            }
        } as unknown as MallaSplat;
        await cargarSplat(URL_OK, { SplatMesh: Clase, bytes: 1024 });
        expect(vistas[0].maxSplats).toBeUndefined();
    });
});