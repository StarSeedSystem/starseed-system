import { describe, it, expect } from "vitest";
import {
    ADJUNTO_PUBLICACION_KEY,
    crearAdjuntoPublicacion,
    parsearAdjuntoPublicacion,
    portadaLocalDeCategoria,
    serializarAdjuntoPublicacion,
} from "../publicacion-biblioteca";

describe("portadas locales de la Biblioteca", () => {
    it("devuelve rutas locales, nunca URLs externas ni títulos codificados", () => {
        for (const categoria of ["app", "widget", "tema", "personalidad", "cerebro", "recurso"]) {
            const portada = portadaLocalDeCategoria(categoria);
            expect(portada.startsWith("/")).toBe(true);
            expect(portada).not.toMatch(/^https?:/);
            expect(portada).not.toContain("placehold");
        }
    });

    it("usa una portada distinta por categoría y una de reserva para lo desconocido", () => {
        expect(portadaLocalDeCategoria("app")).not.toBe(portadaLocalDeCategoria("cerebro"));
        expect(portadaLocalDeCategoria("categoria-inexistente")).toBe("/app-icons/library.png");
        expect(portadaLocalDeCategoria(undefined)).toBe("/app-icons/library.png");
    });
});

describe("adjunto de publicación", () => {
    it("construye una referencia compacta y recorta los espacios", () => {
        const adjunto = crearAdjuntoPublicacion({
            kind: " post ",
            id: " i1 ",
            title: "  Mi recurso  ",
            url: " https://ejemplo.test/a ",
            note: "  una nota  ",
        });
        expect(adjunto).toEqual({
            kind: "post",
            id: "i1",
            name: "Mi recurso",
            url: "https://ejemplo.test/a",
            note: "una nota",
        });
    });

    it("no inventa adjunto si no hay nombre ni destino abrible", () => {
        expect(crearAdjuntoPublicacion({ title: "   " })).toBeNull();
        expect(crearAdjuntoPublicacion({})).toBeNull();
    });

    it("usa la ruta como nombre cuando no hay título", () => {
        const adjunto = crearAdjuntoPublicacion({ route: "/biblioteca/entidad-1", kind: "page" });
        expect(adjunto?.name).toBe("entidad-1");
        expect(adjunto?.route).toBe("/biblioteca/entidad-1");
    });

    it("serializa y vuelve a leer sin perder campos", () => {
        const original = crearAdjuntoPublicacion({
            kind: "file",
            id: "f1",
            title: "Informe",
            url: "https://ejemplo.test/informe.pdf",
            route: "/biblioteca/f1",
            note: "nota",
        });
        expect(original).not.toBeNull();
        const crudo = serializarAdjuntoPublicacion(original!);
        expect(parsearAdjuntoPublicacion(crudo)).toEqual(original);
    });

    it("descarta JSON corrupto o vacío", () => {
        expect(parsearAdjuntoPublicacion(null)).toBeNull();
        expect(parsearAdjuntoPublicacion("")).toBeNull();
        expect(parsearAdjuntoPublicacion("no-es-json")).toBeNull();
        expect(parsearAdjuntoPublicacion("[]")).toBeNull();
        expect(parsearAdjuntoPublicacion('{"name":"   "}')).toBeNull();
    });

    it("expone una clave de sesión estable", () => {
        expect(ADJUNTO_PUBLICACION_KEY).toBe("starseed.publish.adjunto.v1");
    });
});
