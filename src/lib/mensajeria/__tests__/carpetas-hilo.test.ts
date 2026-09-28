import { describe, expect, test } from "vitest";
import type { CarpetaHilo } from "@/lib/mensajeria/carpetas-tipos";
import { fusionarCarpetas, fusionarDocCarpetasPrivadas, type DocCarpetasPrivadas } from "@/lib/mensajeria/carpetas-hilo";

function carpeta(partial: Partial<CarpetaHilo> & Pick<CarpetaHilo, "id" | "actualizado">): CarpetaHilo {
    return {
        hiloId: "h1",
        nombre: "Carpeta",
        color: "#7C5CFF",
        visibilidad: "chat",
        creador: "u1",
        items: [],
        carpetaBibliotecaId: null,
        creado: "2026-01-01T00:00:00.000Z",
        borrado: null,
        ...partial,
    };
}

describe("fusionarCarpetas", () => {
    test("unión por id: lo que solo existe en un lado se conserva", () => {
        const a = [carpeta({ id: "c1", actualizado: "2026-01-01T00:00:00.000Z" })];
        const b = [carpeta({ id: "c2", actualizado: "2026-01-01T00:00:00.000Z" })];
        const fundido = fusionarCarpetas(a, b);
        expect(fundido.map((c) => c.id)).toEqual(["c1", "c2"]);
    });

    test("mismo id: gana el `actualizado` más reciente", () => {
        const vieja = carpeta({ id: "c1", nombre: "Vieja", actualizado: "2026-01-01T00:00:00.000Z" });
        const nueva = carpeta({ id: "c1", nombre: "Nueva", actualizado: "2026-02-01T00:00:00.000Z" });
        expect(fusionarCarpetas([vieja], [nueva])[0].nombre).toBe("Nueva");
        expect(fusionarCarpetas([nueva], [vieja])[0].nombre).toBe("Nueva"); // conmutativo
    });

    test("`borrado` es una lápida más: un borrado con `actualizado` posterior gana sobre una resurrección más vieja", () => {
        const viva = carpeta({ id: "c1", actualizado: "2026-01-01T00:00:00.000Z", borrado: null });
        const borrada = carpeta({ id: "c1", actualizado: "2026-02-01T00:00:00.000Z", borrado: "2026-02-01T00:00:00.000Z" });
        const fundido = fusionarCarpetas([viva], [borrada]);
        expect(fundido[0].borrado).toBe("2026-02-01T00:00:00.000Z");
    });

    test("resultado ordenado por id, sea cual sea el orden de los argumentos (conmutativo)", () => {
        const a = [carpeta({ id: "cz", actualizado: "2026-01-01T00:00:00.000Z" })];
        const b = [carpeta({ id: "ca", actualizado: "2026-01-01T00:00:00.000Z" })];
        expect(fusionarCarpetas(a, b).map((c) => c.id)).toEqual(["ca", "cz"]);
        expect(fusionarCarpetas(b, a).map((c) => c.id)).toEqual(["ca", "cz"]);
    });

    test("empate exacto de `actualizado`: desempate determinista por contenido (conmutativo)", () => {
        const x = carpeta({ id: "c1", nombre: "A", actualizado: "2026-01-01T00:00:00.000Z" });
        const y = carpeta({ id: "c1", nombre: "B", actualizado: "2026-01-01T00:00:00.000Z" });
        expect(fusionarCarpetas([x], [y])).toEqual(fusionarCarpetas([y], [x]));
    });
});

describe("fusionarDocCarpetasPrivadas", () => {
    test("fusiona hilo a hilo, y dentro de cada hilo carpeta a carpeta", () => {
        const a: DocCarpetasPrivadas = {
            hilos: {
                h1: [carpeta({ id: "c1", actualizado: "2026-01-01T00:00:00.000Z" })],
            },
        };
        const b: DocCarpetasPrivadas = {
            hilos: {
                h1: [carpeta({ id: "c1", nombre: "Renombrada", actualizado: "2026-03-01T00:00:00.000Z" })],
                h2: [carpeta({ id: "c2", hiloId: "h2", actualizado: "2026-01-01T00:00:00.000Z" })],
            },
        };
        const fundido = fusionarDocCarpetasPrivadas(a, b);
        expect(Object.keys(fundido.hilos).sort()).toEqual(["h1", "h2"]);
        expect(fundido.hilos.h1[0].nombre).toBe("Renombrada");
        expect(fundido.hilos.h2[0].id).toBe("c2");
    });

    test("documentos vacíos no explotan", () => {
        expect(fusionarDocCarpetasPrivadas({ hilos: {} }, { hilos: {} })).toEqual({ hilos: {} });
    });
});
