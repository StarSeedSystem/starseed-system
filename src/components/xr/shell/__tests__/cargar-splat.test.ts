/**
 * Pruebas de XR1010AM: carga de splats gaussianos (Spark). Sólo funciones puras con cargador y
 * `fetch` inyectados: nada de red, disco ni WebGL. `import { describe, it, expect }` porque
 * vitest corre con `globals: false`.
 */
import { describe, expect, it } from "vitest";
import type { SplatMeshOptions } from "@sparkjsdev/spark";
import {
    cargarSplat,
    marcadorSplat,
    puedeUsarSplat,
    PRESUPUESTO_SPLAT,
    TOPE_BYTES_SPLAT,
    urlSplatSegura,
    type ClaseSplat,
    type MallaSplat,
} from "../cargar-splat";

const URL_OK = "https://biblioteca.starseed.os/splats/jardin.spz";

function claseFalsa(construir: (opciones: SplatMeshOptions) => Promise<unknown>): ClaseSplat<MallaSplat> {
    return class CargoFalso {
        initialized: Promise<unknown>;
        constructor(opciones: SplatMeshOptions) {
            void opciones;
            this.initialized = construir(opciones);
        }
    } as unknown as ClaseSplat<MallaSplat>;
}

describe("XR1010AM · cargar-splat", () => {
    it("puedeUsarSplat: sólo alta y máxima", () => {
        expect(puedeUsarSplat("maxima")).toBe(true);
        expect(puedeUsarSplat("alta")).toBe(true);
        expect(puedeUsarSplat("media")).toBe(false);
        expect(puedeUsarSplat("baja")).toBe(false);
        expect(puedeUsarSplat("minima")).toBe(false);
    });

    it("presupuesto por nivel: 1,5 M en alta y 3 M en máxima, 0 debajo", () => {
        expect(PRESUPUESTO_SPLAT.alta).toBe(1_500_000);
        expect(PRESUPUESTO_SPLAT.maxima).toBe(3_000_000);
        expect(PRESUPUESTO_SPLAT.media).toBe(0);
    });

    it("urlSplatSegura: https sí; http, credenciales y basura no", () => {
        expect(urlSplatSegura(URL_OK)).toBe(true);
        expect(urlSplatSegura("http://biblioteca.starseed.os/splats/jardin.spz")).toBe(false);
        expect(urlSplatSegura("https://ana:secreto@biblioteca.starseed.os/jardin.spz")).toBe(false);
        expect(urlSplatSegura("")).toBe(false);
        expect(urlSplatSegura("no es una url")).toBe(false);
    });

    it("marcadorSplat: nivel bajo, sin enlace, o listo", () => {
        expect(marcadorSplat("media", URL_OK)).toBe("Este objeto necesita un aparato más potente.");
        expect(marcadorSplat("alta", undefined)).toBe("Este splat de la Biblioteca todavía no tiene enlace de descarga.");
        expect(marcadorSplat("maxima", URL_OK)).toBeNull();
    });

    it("cargarSplat: URL http rechazada sin tocar el cargador", async () => {
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

    it("cargarSplat: archivo de más de 60 MB se rechaza con motivo", async () => {
        const r = await cargarSplat(URL_OK, {
            bytes: 65 * 1024 * 1024,
            SplatMesh: claseFalsa(() => Promise.resolve()),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("60 MB");
        expect(65 * 1024 * 1024 > TOPE_BYTES_SPLAT).toBe(true);
    });

    it("cargarSplat: HEAD que responde Content-Length enorme también se rechaza", async () => {
        const pedir: typeof fetch = async () =>
            new Response(null, { headers: { "Content-Length": String(TOPE_BYTES_SPLAT + 1) } });
        const r = await cargarSplat(URL_OK, { pedir, SplatMesh: claseFalsa(() => Promise.resolve()) });
        expect(r.ok).toBe(false);
    });

    it("cargarSplat: cargador que lanza en el constructor devuelve {ok:false}", async () => {
        const r = await cargarSplat(URL_OK, {
            SplatMesh: claseFalsa(() => {
                throw new Error("GPU sin memoria");
            }),
            bytes: 1024,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("GPU sin memoria");
    });

    it("cargarSplat: `initialized` que rechaza devuelve {ok:false}", async () => {
        const r = await cargarSplat(URL_OK, {
            SplatMesh: claseFalsa(() => Promise.reject(new Error("formato desconocido"))),
            bytes: 1024,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("formato desconocido");
    });

    it("cargarSplat: carga feliz pasa la URL y el presupuesto del nivel a la malla", async () => {
        const vistas: SplatMeshOptions[] = [];
        const Clase = class CargoVisto {
            initialized: Promise<unknown>;
            constructor(opciones: SplatMeshOptions) {
                vistas.push(opciones);
                this.initialized = Promise.resolve();
            }
        } as unknown as ClaseSplat<MallaSplat>;
        const r = await cargarSplat(URL_OK, { SplatMesh: Clase, nivel: "alta", bytes: 1024 });
        expect(r.ok).toBe(true);
        expect(vistas[0].url).toBe(URL_OK);
        expect(vistas[0].maxSplats).toBe(PRESUPUESTO_SPLAT.alta);
    });

    it("cargarSplat: sin nivel no fija maxSplats", async () => {
        const vistas: SplatMeshOptions[] = [];
        const Clase = class CargoVisto {
            initialized: Promise<unknown>;
            constructor(opciones: SplatMeshOptions) {
                vistas.push(opciones);
                this.initialized = Promise.resolve();
            }
        } as unknown as ClaseSplat<MallaSplat>;
        await cargarSplat(URL_OK, { SplatMesh: Clase, bytes: 1024 });
        expect(vistas[0].maxSplats).toBeUndefined();
    });
});
