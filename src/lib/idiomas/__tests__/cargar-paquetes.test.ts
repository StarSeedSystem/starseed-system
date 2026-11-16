import { afterEach, describe, expect, it } from "vitest";
import { cargarCatalogo, inyectarFuentePaquetes, type FuentePaquetes } from "../catalogos/cargar";
import { CON_CATALOGO, idiomasConCatalogo } from "../idiomas";
import { almacenPaquetes } from "../paquete/almacen";
import type { PaqueteIdioma } from "../paquete/formato";

function paquete(
    codigo: string,
    entradas: Record<string, string> = { Guardar: "Guardar" },
    estado: "automatico" | "revisado" = "automatico",
): PaqueteIdioma {
    return {
        formato: "starseed-idioma",
        version: 1,
        codigo,
        nombre: codigo.toUpperCase(),
        dir: "ltr",
        autor: { nombre: "Test" },
        creado: "2026-01-01T00:00:00.000Z",
        revisado: { estado },
        licencia: "MIT",
        base: "es",
        entradas,
        hash: "abc123",
    };
}

function fuente(paquetes: PaqueteIdioma[]): FuentePaquetes {
    return {
        leerPaquete: (codigo) => paquetes.find((p) => p.codigo === codigo) ?? null,
        listarPaquetes: () => paquetes,
    };
}

afterEach(() => {
    inyectarFuentePaquetes(almacenPaquetes);
});

describe("catálogos instalados", () => {
    it("carga el catálogo de un paquete instalado y traduce", async () => {
        inyectarFuentePaquetes(fuente([paquete("de", { Guardar: "Speichern" }, "revisado")]));

        const catalogo = await cargarCatalogo("de");

        expect(catalogo).not.toBeNull();
        expect(catalogo?.traducir("Guardar")).toBe("Speichern");
        expect(catalogo?.revisado).toBe(true);
    });

    it("suma los idiomas con catálogo integrado y de paquetes instalados", () => {
        inyectarFuentePaquetes(fuente([paquete("de"), paquete("en")]));

        const codigos = idiomasConCatalogo();

        expect(codigos).toEqual(expect.arrayContaining([...CON_CATALOGO, "de"]));
        expect(new Set(codigos).size).toBe(codigos.length);
    });

    it("devuelve null cuando el paquete está corrupto", async () => {
        const corrupto = {
            ...paquete("it"),
            entradas: null as unknown as Record<string, string>,
        };
        inyectarFuentePaquetes(fuente([corrupto]));

        expect(await cargarCatalogo("it")).toBeNull();
        expect(idiomasConCatalogo()).not.toContain("it");
    });

    it("el catálogo integrado gana salvo que la persona elija el paquete", async () => {
        inyectarFuentePaquetes(fuente([paquete("en", { Guardar: "Guardar en el paquete" })]));

        const integrado = await cargarCatalogo("en");
        const elegido = await cargarCatalogo("en", true);

        expect(integrado?.traducir("Guardar")).toBe("Save");
        expect(elegido?.traducir("Guardar")).toBe("Guardar en el paquete");
    });
});
