import { describe, expect, it } from "vitest";

import {
    CLAVE_VIGILADAS,
    agregarRegla,
    archivosNuevosAConvertir,
    claveArchivo,
    estadoVigiladasVacio,
    marcarConvertido,
    normalizarCarpeta,
    quitarRegla,
    sanearVigiladas,
} from "../vigiladas";

const F = "Fotos del móvil";
const regla = (extra: Record<string, unknown> = {}) => ({ carpeta: F, a: "jpg", ...extra });
const estadoCon = (extra: Record<string, unknown> = {}) => sanearVigiladas({ reglas: [regla()], ...extra });

describe("carpetas y claves", () => {
    it("normaliza barras, puntos y espacios sin dejar salir de la carpeta", () => {
        expect(normalizarCarpeta("/Fotos del móvil//2026/")).toBe("Fotos del móvil/2026");
        expect(normalizarCarpeta("..\\..\\etc")).toBe("etc");
        expect(normalizarCarpeta("  /a/./b/  ")).toBe("a/b");
        expect(normalizarCarpeta("")).toBe("");
    });

    it("la clave no distingue mayúsculas y usa solo el nombre del archivo", () => {
        expect(claveArchivo("/Fotos del Móvil/", "IMG.HEIC")).toBe("fotos del móvil/img.heic");
        expect(claveArchivo(F, "../IMG.HEIC")).toBe("fotos del móvil/img.heic");
    });

    it("la clave de almacenamiento es la del contrato", () => {
        expect(CLAVE_VIGILADAS).toBe("starseed.conversion.vigiladas.v1");
    });
});

describe("sanearVigiladas", () => {
    it("cualquier basura da un estado vacío válido", () => {
        for (const crudo of [null, undefined, 3, "x", [], true]) {
            expect(sanearVigiladas(crudo)).toEqual(estadoVigiladasVacio());
        }
    });

    it("conserva reglas válidas, descarta las malas y deduplica carpeta+destino", () => {
        const s = sanearVigiladas({
            reglas: [
                { carpeta: "/Fotos del móvil/", a: "JPG", calidad: 82.6, desde: 100, subcarpetas: false },
                { carpeta: F, a: "jpg" },
                { carpeta: "", a: "png" },
                { carpeta: "Docs", a: "no vale" },
                null,
            ],
            hechos: { "fotos del móvil/a.heic": 123, x: "no" },
            resultados: { "fotos del móvil/a.jpg": 456 },
        });
        expect(s.reglas).toHaveLength(1);
        expect(s.reglas[0]).toMatchObject({
            id: "fotos del móvil::jpg", carpeta: F, a: "jpg",
            activa: true, calidad: 83, desde: 100, subcarpetas: false,
        });
        expect(s.hechos).toEqual({ "fotos del móvil/a.heic": 123 });
        expect(s.resultados).toEqual({ "fotos del móvil/a.jpg": 456 });
    });

    it("agrega, actualiza y quita reglas sin perder su desde", () => {
        let e = agregarRegla(estadoVigiladasVacio(), { carpeta: `/${F}/`, a: "jpg", calidad: 80 });
        expect(e.reglas[0]).toMatchObject({ carpeta: F, a: "jpg", calidad: 80, desde: 0 });
        e = agregarRegla(e, { carpeta: F, a: "jpg", calidad: 60, desde: 500 });
        expect(e.reglas).toHaveLength(1);
        expect(e.reglas[0]).toMatchObject({ calidad: 60, desde: 500 });
        e = agregarRegla(e, { carpeta: F, a: "png" });
        expect(e.reglas.map((r) => r.a)).toEqual(["jpg", "png"]);
        e = quitarRegla(e, e.reglas[0].id);
        expect(e.reglas.map((r) => r.a)).toEqual(["png"]);
        expect(agregarRegla(e, { carpeta: "", a: "jpg" })).toEqual(e);
    });
});

describe("archivosNuevosAConvertir", () => {
    it("convierte lo que entra en la carpeta vigilada y nada más", () => {
        const pend = archivosNuevosAConvertir([
            { nombre: "IMG_001.HEIC", carpeta: `/${F}/` },
            { nombre: "ya.jpg", carpeta: F },
            { nombre: "fuera.heic", carpeta: "Otra" },
            { nombre: ".oculto.heic", carpeta: F },
            { nombre: "archivo con espacios", carpeta: F },
        ], estadoCon());
        expect(pend).toHaveLength(1);
        expect(pend[0]).toMatchObject({ a: "jpg", nombreSalida: "IMG_001.jpg" });
        expect(pend[0].regla.carpeta).toBe(F);
    });

    it("respeta subcarpetas, la fecha de inicio y las reglas apagadas", () => {
        const sinSub = estadoCon({ reglas: [regla({ subcarpetas: false })] });
        expect(archivosNuevosAConvertir([{ nombre: "a.heic", carpeta: `${F}/2026` }], sinSub)).toEqual([]);
        const conSub = estadoCon({ reglas: [regla({ subcarpetas: true })] });
        expect(archivosNuevosAConvertir([{ nombre: "a.heic", carpeta: `${F}/2026` }], conSub)).toHaveLength(1);
        const desde = estadoCon({ reglas: [regla({ desde: 1000 })] });
        expect(archivosNuevosAConvertir([{ nombre: "viejo.heic", carpeta: F, creado: 500 }], desde)).toEqual([]);
        expect(archivosNuevosAConvertir([{ nombre: "nuevo.heic", carpeta: F, creado: 1500 }], desde)).toHaveLength(1);
        expect(archivosNuevosAConvertir([{ nombre: "sin-fecha.heic", carpeta: F }], desde)).toHaveLength(1);
        const apagada = estadoCon({ reglas: [regla({ activa: false })] });
        expect(archivosNuevosAConvertir([{ nombre: "a.heic", carpeta: F }], apagada)).toEqual([]);
    });

    it("no pisa un archivo que ya existe ni repite el mismo destino", () => {
        const existente = estadoCon();
        expect(archivosNuevosAConvertir([
            { nombre: "foto.heic", carpeta: F },
            { nombre: "foto.jpg", carpeta: F },
        ], existente)).toEqual([]);
        const dos = archivosNuevosAConvertir([
            { nombre: "foto.HEIC", carpeta: F },
            { nombre: "foto.png", carpeta: F },
        ], existente);
        expect(dos).toHaveLength(1);
        expect(dos[0].nombreSalida).toBe("foto.jpg");
    });

    it("no repite ni reconvierte resultados: una carpeta vigilada no puede entrar en bucle", () => {
        const cruzado = sanearVigiladas({ reglas: [{ carpeta: F, a: "jpg" }, { carpeta: F, a: "png" }] });
        const primero = archivosNuevosAConvertir([{ nombre: "foto.heic", carpeta: F }], cruzado);
        expect(primero.map((p) => p.a)).toEqual(["jpg"]);
        const despues = marcarConvertido(cruzado, primero[0], undefined, 1000);
        expect(despues.hechos[primero[0].clave]).toBe(1000);
        expect(despues.resultados[claveArchivo(F, "foto.jpg")]).toBe(1000);
        expect(archivosNuevosAConvertir([
            { nombre: "foto.heic", carpeta: F },
            { nombre: "foto.jpg", carpeta: F },
        ], despues)).toEqual([]);
        expect(archivosNuevosAConvertir([{ nombre: "otra.jpg", carpeta: F, deConversion: true }], despues)).toEqual([]);
    });
});
