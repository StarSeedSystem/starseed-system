import { describe, it, expect } from "vitest";
import {
    crearAlmacenMemoria,
    crearToken,
    verificarToken,
    revocarToken,
    huellaSha256,
} from "../tokens-externos";

describe("tokens-externos", () => {
    it("huellaSha256 produce hex de 64 caracteres", async () => {
        const h = await huellaSha256("hola");
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it("crearToken devuelve el valor una vez y guarda solo la huella", async () => {
        const almacen = crearAlmacenMemoria();
        const r = await crearToken("ambito-prueba", ["leer", "escribir"], undefined, almacen);
        expect(typeof r.valor).toBe("string");
        expect(r.valor.length).toBeGreaterThan(0);
        expect(typeof r.huella).toBe("string");

        const entrada = almacen.leerPorHuella(r.huella);
        expect(entrada).not.toBeNull();
        expect(entrada!.ambito).toBe("ambito-prueba");
        expect(entrada!.alcance).toEqual(["leer", "escribir"]);
        expect(entrada!.usos).toBe(0);
    });

    it("el valor del token nunca se guarda en el almacén", async () => {
        const almacen = crearAlmacenMemoria();
        const r = await crearToken("x", ["a"], undefined, almacen);
        const lista = almacen.listarPorAmbito("x");
        expect(lista.length).toBe(1);
        expect(lista[0]!.huella).toBe(r.huella);
        expect((lista[0] as any).valor).toBeUndefined();
    });

    it("verificarToken pasa con token válido", async () => {
        const almacen = crearAlmacenMemoria();
        const r = await crearToken("a1", ["b"], undefined, almacen);
        const v = await verificarToken(r.valor, almacen);
        expect(v).toEqual({ ambito: "a1", alcance: ["b"] });
    });

    it("verificarToken rechaza token revocado", async () => {
        const almacen = crearAlmacenMemoria();
        const r = await crearToken("rev", ["c"], undefined, almacen);
        revocarToken(r.huella, almacen, Date.now());
        const v = await verificarToken(r.valor, almacen);
        expect(v).toBeNull();
    });

    it("verificarToken rechaza token caducado", async () => {
        const almacen = crearAlmacenMemoria();
        const r = await crearToken("cad", ["d"], Date.now() - 1000, almacen);
        const v = await verificarToken(r.valor, almacen, Date.now());
        expect(v).toBeNull();
    });

    it("verificarToken rechaza valor incorrecto", async () => {
        const almacen = crearAlmacenMemoria();
        await crearToken("ok", ["e"], undefined, almacen);
        const v = await verificarToken("valor-falso", almacen);
        expect(v).toBeNull();
    });
});
