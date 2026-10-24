import { describe, expect, it } from "vitest";

import {
    CLAVE_VIGILADAS,
    decidirConversiones,
    estaEnCarpeta,
    leerVigiladas,
    normalizarRuta,
    reglaPara,
    serializarVigiladas,
    type ReglaVigilada,
} from "../vigiladas";

const regla = (p: Partial<ReglaVigilada> = {}): ReglaVigilada => ({
    id: "r1",
    carpeta: "/Fotos del móvil",
    a: "jpg",
    activa: true,
    subcarpetas: true,
    ...p,
});

describe("rutas de la Biblioteca", () => {
    it("normaliza barras, `.` y `..` sin salir de la raíz", () => {
        expect(normalizarRuta("C:\\Fotos\\..\\Fotos\\Viaje.HEIC")).toBe("/Fotos/Viaje.HEIC");
        expect(normalizarRuta("/a//b/")).toBe("/a/b");
        expect(normalizarRuta("../../etc/passwd")).toBe("/etc/passwd");
        expect(normalizarRuta("")).toBe("");
    });

    it("distingue la carpeta de un prefijo parecido y respeta subcarpetas", () => {
        expect(estaEnCarpeta("/Fotos/a.jpg", "/Fotos")).toBe(true);
        expect(estaEnCarpeta("/Fotos/2026/a.jpg", "/Fotos")).toBe(true);
        expect(estaEnCarpeta("/Fotos/2026/a.jpg", "/Fotos", false)).toBe(false);
        expect(estaEnCarpeta("/Fotos2/a.jpg", "/Fotos")).toBe(false);
        expect(estaEnCarpeta("/Fotos", "/Fotos")).toBe(false);
        expect(estaEnCarpeta("/fotos/a.jpg", "/Fotos")).toBe(true);
    });
});

describe("leerVigiladas y serializarVigiladas", () => {
    it("lee el formato guardado y normaliza formato y carpeta", () => {
        const crudo = JSON.stringify({ v: 1, reglas: [{ id: "r1", carpeta: "Fotos del móvil/", a: "JPG", calidad: 85 }] });
        expect(leerVigiladas(crudo)).toEqual([
            { id: "r1", carpeta: "/Fotos del móvil", a: "jpg", calidad: 85, activa: true, subcarpetas: true },
        ]);
    });

    it("tolera JSON roto, listas sueltas y reglas inválidas", () => {
        expect(leerVigiladas("{no es json")).toEqual([]);
        expect(leerVigiladas(null)).toEqual([]);
        const lista = JSON.stringify([
            { carpeta: "/A", a: "pdf; rm -rf /" },
            { carpeta: "", a: "jpg" },
            { carpeta: "/B", a: "png", id: "r1" },
            { carpeta: "/b", a: "webp", id: "r2" },
            { carpeta: "/C", a: "webp", id: "r1" },
            { carpeta: "/D", a: "webp", calidad: 101 },
        ]);
        expect(leerVigiladas(lista)).toEqual([
            { id: "r1", carpeta: "/B", a: "png", activa: true, subcarpetas: true },
            { id: "/D", carpeta: "/D", a: "webp", activa: true, subcarpetas: true },
        ]);
    });

    it("serializa solo reglas válidas y vuelve a leerse igual", () => {
        const reglas = [regla({ id: "fotos", calidad: 80 }), regla({ id: "mala", carpeta: "", a: "pdf" })];
        const crudo = serializarVigiladas(reglas);
        expect(JSON.parse(crudo)).toMatchObject({ v: 1 });
        expect(leerVigiladas(crudo)).toEqual([regla({ id: "fotos", calidad: 80 })]);
        expect(CLAVE_VIGILADAS).toBe("starseed.conversion.vigiladas.v1");
    });
});

describe("reglaPara", () => {
    it("gana la carpeta más concreta y respeta activa y subcarpetas", () => {
        const fotos = regla({ id: "fotos", carpeta: "/Fotos", a: "jpg" });
        const docs = regla({ id: "docs", carpeta: "/Fotos/Documentos", a: "pdf" });
        expect(reglaPara("/Fotos/Documentos/informe.docx", [fotos, docs])?.id).toBe("docs");
        expect(reglaPara("/Fotos/2026/a.heic", [fotos, docs])?.id).toBe("fotos");
        expect(reglaPara("/Fotos/a.heic", [regla({ carpeta: "/Fotos", activa: false })])).toBeNull();
        expect(reglaPara("/Fotos/2026/a.heic", [regla({ carpeta: "/Fotos", subcarpetas: false })])).toBeNull();
        expect(reglaPara("/Otra/a.heic", [fotos])).toBeNull();
    });
});

describe("decidirConversiones", () => {
    const reglas = [regla({ id: "fotos", calidad: 80 })];

    it("convierte lo nuevo junto al original, con su calidad y sin tocar el original", () => {
        const d = decidirConversiones(reglas, [{ ruta: "/Fotos del móvil/Viaje.HEIC", mtime: 1, tamano: 10 }]);
        expect(d.pendientes).toEqual([{
            reglaId: "fotos",
            ruta: "/Fotos del móvil/Viaje.HEIC",
            nombre: "Viaje.HEIC",
            a: "jpg",
            calidad: 80,
            salida: "/Fotos del móvil/Viaje.jpg",
        }]);
        expect(d.estado.vistos["/Fotos del móvil/Viaje.HEIC"]).toBe("1:10");
    });

    it("no repite lo ya visto ni reconvierte lo que ya está en el destino", () => {
        const primera = decidirConversiones(reglas, [{ ruta: "/Fotos del móvil/a.heic", mtime: 1 }]);
        expect(primera.pendientes).toHaveLength(1);
        expect(decidirConversiones(reglas, [{ ruta: "/Fotos del móvil/a.heic", mtime: 1 }], primera.estado).pendientes).toEqual([]);
        expect(decidirConversiones(reglas, [{ ruta: "/Fotos del móvil/b.jpg", mtime: 1 }]).pendientes).toEqual([]);
    });

    it("no convierte lo que ya existía antes de la regla", () => {
        const antes = decidirConversiones([], [{ ruta: "/Fotos del móvil/viejo.heic", mtime: 1 }]);
        expect(decidirConversiones(reglas, [{ ruta: "/Fotos del móvil/viejo.heic", mtime: 1 }], antes.estado).pendientes).toEqual([]);
    });

    it("nunca convierte una salida de conversión, aunque su formato no coincida", () => {
        const estado = { vistos: {}, salidas: ["/Fotos del móvil/informe.zip"] };
        const d = decidirConversiones(reglas, [{ ruta: "/Fotos del móvil/informe.zip", mtime: 1 }], estado);
        expect(d.pendientes).toEqual([]);
        expect(d.estado.salidas).toContain("/Fotos del móvil/informe.zip");
    });

    it("no pisa una salida existente y evita dos originales con el mismo nombre", () => {
        expect(decidirConversiones(reglas, [
            { ruta: "/Fotos del móvil/a.heic", mtime: 1 },
            { ruta: "/Fotos del móvil/a.jpg", mtime: 1 },
        ]).pendientes).toEqual([]);
        const d = decidirConversiones(reglas, [
            { ruta: "/Fotos del móvil/b.png", mtime: 1 },
            { ruta: "/Fotos del móvil/b.heic", mtime: 1 },
        ]);
        expect(d.pendientes.map((p) => p.ruta)).toEqual(["/Fotos del móvil/b.heic"]);
    });

    it("reconvierte solo si el archivo cambió de firma y ordena por ruta", () => {
        const primera = decidirConversiones(reglas, [{ ruta: "/Fotos del móvil/a.heic", mtime: 1, tamano: 10 }]);
        const cambiado = decidirConversiones(reglas, [{ ruta: "/Fotos del móvil/a.heic", mtime: 2, tamano: 10 }], primera.estado);
        expect(cambiado.pendientes).toHaveLength(1);
        const d = decidirConversiones(reglas, [
            { ruta: "/Fotos del móvil/z.heic", mtime: 1 },
            { ruta: "/Fotos del móvil/a.heic", mtime: 1 },
        ]);
        expect(d.pendientes.map((p) => p.nombre)).toEqual(["a.heic", "z.heic"]);
    });

    it("ignora reglas apagadas, carpetas ajenas y subcarpetas no vigiladas", () => {
        expect(decidirConversiones([regla({ activa: false })], [{ ruta: "/Fotos del móvil/a.heic" }]).pendientes).toEqual([]);
        expect(decidirConversiones(reglas, [{ ruta: "/Otra/a.heic" }]).pendientes).toEqual([]);
        expect(decidirConversiones([regla({ subcarpetas: false })], [{ ruta: "/Fotos del móvil/2026/a.heic" }]).pendientes).toEqual([]);
        expect(decidirConversiones([regla({ carpeta: "/" })], [{ ruta: "/a.png" }]).pendientes).toHaveLength(1);
    });
});
