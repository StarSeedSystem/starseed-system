import { describe, it, expect } from "vitest";
import {
    CLAVE_ADJUNTO_PUBLICACION,
    ENDPOINT_ADJUNTO_PUBLICACION,
    RUTA_PUBLICACION_SEGURA,
    adjuntoDeRespuesta,
    almacenDeSesion,
    consumirAdjunto,
    guardarAdjunto,
    parsearAdjunto,
    peticionAdjunto,
    portadaLocalDeCategoria,
    recortarAdjunto,
    serializarAdjunto,
    type AlmacenAdjuntos,
} from "../publicar-seguro";
function almacenEnMemoria(): AlmacenAdjuntos & { datos: Map<string, string> } {
    const datos = new Map<string, string>();
    return {
        datos,
        getItem: (clave) => datos.get(clave) ?? null,
        setItem: (clave, valor) => void datos.set(clave, valor),
        removeItem: (clave) => void datos.delete(clave),
    };
}
describe("recorte del adjunto de publicación", () => {
    it("deja solo los campos necesarios y recorta espacios", () => {
        const adjunto = recortarAdjunto({
            title: "  Mi recurso  ",
            url: " https://ejemplo.test/a ",
            route: " /biblioteca/1 ",
            note: "  una nota  ",
            acl: "secreto",
            payload: { enorme: true },
        });
        expect(adjunto).toEqual({
            title: "Mi recurso",
            url: "https://ejemplo.test/a",
            route: "/biblioteca/1",
            note: "una nota",
        });
        expect(adjunto).not.toHaveProperty("acl");
        expect(adjunto).not.toHaveProperty("payload");
    });
    it("no inventa adjunto sin URL ni ruta abrible", () => {
        expect(recortarAdjunto({ title: "sin destino" })).toBeNull();
        expect(recortarAdjunto(null)).toBeNull();
        expect(recortarAdjunto([])).toBeNull();
    });
    it("ordena por recorte: el título vacío cae a un nombre estable", () => {
        expect(recortarAdjunto({ route: "/x", title: "   " })?.title).toBe(
            "Ítem de la Biblioteca",
        );
    });
});
describe("petición POST sin datos en la URL", () => {
    it("usa POST, Content-Type JSON y un cuerpo con el payload", () => {
        const adjunto = { title: "Informe privado", route: "/biblioteca/f1" };
        const { url, init } = peticionAdjunto(adjunto);
        expect(url).toBe(ENDPOINT_ADJUNTO_PUBLICACION);
        expect(url).not.toContain("Informe");
        expect(init.method).toBe("POST");
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(String(init.body)).toContain("Informe privado");
        expect(init.cache).toBe("no-store");
    });
    it("la ruta de navegación solo lleva el flag, nunca el ítem", () => {
        expect(RUTA_PUBLICACION_SEGURA).toBe("/publish?attach=1");
        expect(RUTA_PUBLICACION_SEGURA).not.toContain("http");
    });
});
describe("respuesta del endpoint", () => {
    it("extrae y sanea el adjunto devuelto", () => {
        expect(
            adjuntoDeRespuesta({ ok: true, adjunto: { title: "A", route: "/a" } }),
        ).toEqual({ title: "A", route: "/a" });
        expect(adjuntoDeRespuesta({ ok: true })).toBeNull();
        expect(adjuntoDeRespuesta("texto")).toBeNull();
    });
});
describe("serialización y almacén de sesión", () => {
    it("serializa y vuelve a leer sin perder campos", () => {
        const original = { title: "Informe", url: "https://ejemplo.test/i.pdf" };
        expect(parsearAdjunto(serializarAdjunto(original))).toEqual(original);
    });
    it("descarta JSON corrupto o vacío", () => {
        expect(parsearAdjunto(null)).toBeNull();
        expect(parsearAdjunto("")).toBeNull();
        expect(parsearAdjunto("no-es-json")).toBeNull();
        expect(parsearAdjunto("[]")).toBeNull();
    });
    it("guarda y consume una sola vez", () => {
        const almacen = almacenEnMemoria();
        const adjunto = { title: "A", route: "/a" };
        expect(guardarAdjunto(almacen, adjunto)).toBe(true);
        expect(almacen.datos.get(CLAVE_ADJUNTO_PUBLICACION)).toBeTruthy();
        expect(consumirAdjunto(almacen)).toEqual(adjunto);
        expect(consumirAdjunto(almacen)).toBeNull();
    });
    it("sin almacén no lanza y devuelve vacío", () => {
        expect(guardarAdjunto(null, { title: "A", route: "/a" })).toBe(false);
        expect(consumirAdjunto(null)).toBeNull();
        expect(almacenDeSesion()).toBeNull();
    });
});
describe("portadas locales", () => {
    it("usa rutas locales, sin servicios externos ni títulos", () => {
        for (const categoria of ["app", "widget", "tema", "personalidad", "cerebro", "recurso"]) {
            const portada = portadaLocalDeCategoria(categoria);
            expect(portada.startsWith("/")).toBe(true);
            expect(portada).not.toMatch(/^https?:/);
            expect(portada).not.toContain("placehold");
        }
    });
    it("distingue categorías y tiene reserva para lo desconocido", () => {
        expect(portadaLocalDeCategoria("app")).not.toBe(portadaLocalDeCategoria("cerebro"));
        expect(portadaLocalDeCategoria("inexistente")).toBe("/app-icons/library.png");
        expect(portadaLocalDeCategoria(undefined)).toBe("/app-icons/library.png");
    });
});
