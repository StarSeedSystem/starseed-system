import { describe, it, expect } from "vitest";
import {
    CLAVE_ADJUNTO_PUBLICACION,
    RUTA_PUBLICACION_SEGURA,
    recortarAdjunto,
    serializarAdjunto,
    guardarAdjunto,
    consumirAdjunto,
    portadaLocalDeCategoria,
} from "../adjunto-publicacion";

function almacenFalso() {
    const datos = new Map<string, string>();
    return {
        datos,
        getItem: (clave) => datos.get(clave) ?? null,
        setItem: (clave, valor) => {
            datos.set(clave, valor);
        },
        removeItem: (clave) => {
            datos.delete(clave);
        },
    };
}

describe("recortarAdjunto", () => {
    it("conserva solo los campos necesarios y descarta el objeto completo del ítem", () => {
        const adjunto = recortarAdjunto({
            title: "  Cuaderno de campo  ",
            url: "https://files.starseed.app/cuaderno.pdf",
            route: "/library/item/42",
            note: "Notas de la ola",
            payload: { secreto: "no debe viajar" },
            acl: { read: ["user:otro"] },
        });

        expect(adjunto).toEqual({
            title: "Cuaderno de campo",
            url: "https://files.starseed.app/cuaderno.pdf",
            route: "/library/item/42",
            note: "Notas de la ola",
        });
        expect(JSON.stringify(adjunto)).not.toContain("secreto");
        expect(JSON.stringify(adjunto)).not.toContain("acl");
    });

    it("devuelve null cuando no hay destino abrible", () => {
        expect(recortarAdjunto({ title: "Solo título" })).toBeNull();
        expect(recortarAdjunto({ url: "   " })).toBeNull();
        expect(recortarAdjunto(null)).toBeNull();
    });

    it("recorta longitudes y pone un título legible si falta", () => {
        const adjunto = recortarAdjunto({
            title: "",
            url: "https://files.starseed.app/a.png",
            note: "x".repeat(900),
        });

        expect(adjunto?.title).toBe("Ítem de la Biblioteca");
        expect(adjunto?.note).toHaveLength(500);
    });
});

describe("guardarAdjunto / consumirAdjunto", () => {
    it("guarda el JSON recortado en el almacén y lo consume una sola vez", () => {
        const almacen = almacenFalso();
        const adjunto = recortarAdjunto({ title: "Mapa", route: "/library/item/7" });
        expect(adjunto).not.toBeNull();

        expect(guardarAdjunto(adjunto!, almacen)).toBe(true);
        const crudo = almacen.datos.get(CLAVE_ADJUNTO_PUBLICACION) ?? "";
        expect(crudo).toBe(serializarAdjunto(adjunto!));
        expect(consumirAdjunto(almacen)).toEqual(adjunto);
        expect(almacen.datos.has(CLAVE_ADJUNTO_PUBLICACION)).toBe(false);
        expect(consumirAdjunto(almacen)).toBeNull();
    });

    it("tolera JSON corrupto y almacenes que fallan sin lanzar", () => {
        const almacen = almacenFalso();
        almacen.datos.set(CLAVE_ADJUNTO_PUBLICACION, "{no-es-json");
        expect(consumirAdjunto(almacen)).toBeNull();

        const roto = {
            getItem: () => {
                throw new Error("privado");
            },
            setItem: () => {
                throw new Error("cuota");
            },
            removeItem: () => {
                throw new Error("privado");
            },
        };
        expect(guardarAdjunto({ title: "X", route: "/x" }, roto)).toBe(false);
        expect(consumirAdjunto(roto)).toBeNull();
    });

    it("la ruta de publicación solo lleva una marca, nunca el objeto", () => {
        expect(RUTA_PUBLICACION_SEGURA).toBe("/publish?attach=1");
        expect(RUTA_PUBLICACION_SEGURA).not.toContain("encodeURIComponent");
        expect(RUTA_PUBLICACION_SEGURA).not.toContain("{");
    });
});

describe("portadaLocalDeCategoria", () => {
    it("devuelve siempre una portada local del proyecto, nunca un servicio externo", () => {
        const categorias = ["app", "widget", "tema", "plantilla", "personalidad", "cerebro", "recurso", "calendario", "desconocida"];
        for (const categoria of categorias) {
            const portada = portadaLocalDeCategoria(categoria);
            expect(portada.startsWith("/library-covers/")).toBe(true);
            expect(portada).not.toContain("placehold");
            expect(portada).not.toContain("http");
        }
    });

    it("agrupa categorías por identidad visual sin romper el fallback", () => {
        expect(portadaLocalDeCategoria("app")).toBe(portadaLocalDeCategoria("personalidad"));
        expect(portadaLocalDeCategoria("cerebro")).not.toBe(portadaLocalDeCategoria("app"));
        expect(portadaLocalDeCategoria("desconocida")).toBe(portadaLocalDeCategoria("recurso"));
    });
});
