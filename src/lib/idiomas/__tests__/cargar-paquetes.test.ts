/**
 * IMA12 · El cargador de catálogos suma los paquetes instalados.
 * Pruebas de funciones puras: el almacén se INYECTA, sin red, disco ni procesos.
 */
import { describe, it, expect } from "vitest";
import { cargarCatalogo } from "../catalogos/cargar";
import { idiomasConCatalogo } from "../idiomas";
import type { AlmacenPaquetes } from "../paquete/almacen";
import type { PaqueteIdioma } from "../paquete/formato";

function paquete(
    codigo: string,
    entradas: Record<string, string>,
    estado: "revisado" | "automatico" = "revisado",
): PaqueteIdioma {
    return {
        formato: "starseed-idioma",
        version: 1,
        codigo,
        nombre: codigo.toUpperCase(),
        dir: "ltr",
        autor: { nombre: "Prueba" },
        creado: "2026-01-01T00:00:00.000Z",
        revisado: { estado },
        licencia: "CC0-1.0",
        base: "es",
        entradas,
        hash: `${codigo}:${estado}:${JSON.stringify(entradas)}`,
    };
}

function almacenCon(...paquetes: PaqueteIdioma[]): AlmacenPaquetes {
    return {
        listarPaquetes: () => [...paquetes],
        guardarPaquete: (): { ok: true } => ({ ok: true }),
        quitarPaquete: () => {},
        leerPaquete: (codigo) => paquetes.find((p) => p.codigo === codigo) ?? null,
    };
}

describe("cargarCatalogo con paquetes instalados", () => {
    it("un paquete alemán instalado se carga y traduce", async () => {
        const almacen = almacenCon(paquete("de", { Ajustes: "Einstellungen", Hola: "Hallo" }));
        const cat = await cargarCatalogo("de", { almacen });
        expect(cat).not.toBeNull();
        expect(cat?.codigo).toBe("de");
        expect(cat?.revisado).toBe(true);
        expect(cat?.traducir("Ajustes")).toBe("Einstellungen");
        expect(cat?.traducir("No existe")).toBeNull();
    });

    it("un paquete sin revisar se marca como automático", async () => {
        const almacen = almacenCon(paquete("it", { Ajustes: "Impostazioni" }, "automatico"));
        const cat = await cargarCatalogo("it", { almacen });
        expect(cat?.revisado).toBe(false);
        expect(cat?.traducir("Ajustes")).toBe("Impostazioni");
    });

    it("un paquete corrupto devuelve null y la interfaz sigue en español", async () => {
        const corrupto = { ...paquete("de", {}), entradas: null as unknown as Record<string, string> };
        expect(await cargarCatalogo("de", { almacen: almacenCon(corrupto) })).toBeNull();
    });

    it("un almacén que falla al leer devuelve null, no lanza", async () => {
        const roto: AlmacenPaquetes = {
            listarPaquetes: () => [],
            guardarPaquete: (): { ok: true } => ({ ok: true }),
            quitarPaquete: () => {},
            leerPaquete: () => { throw new Error("Fallo de lectura"); },
        };
        await expect(cargarCatalogo("de", { almacen: roto })).resolves.toBeNull();
    });

    it("el integrado gana sobre un paquete del mismo código", async () => {
        const almacen = almacenCon(paquete("en", { Ajustes: "Ajustes del paquete" }));
        const cat = await cargarCatalogo("en", { almacen });
        expect(cat?.traducir("Ajustes")).toBe("Settings");
    });

    it("preferirPaquete hace ganar al paquete elegido por la persona", async () => {
        const almacen = almacenCon(paquete("en", { Ajustes: "Ajustes del paquete" }));
        const cat = await cargarCatalogo("en", { almacen, preferirPaquete: true });
        expect(cat?.traducir("Ajustes")).toBe("Ajustes del paquete");
    });

    it("sin integrado ni paquete devuelve null", async () => {
        expect(await cargarCatalogo("xx", { almacen: almacenCon() })).toBeNull();
    });
});

describe("idiomasConCatalogo", () => {
    it("suma integrados y paquetes instalados sin repetir", () => {
        const almacen = almacenCon(paquete("de", { Ajustes: "Einstellungen" }), paquete("en", { Ajustes: "x" }));
        const codigos = idiomasConCatalogo({ almacen });
        expect(codigos).toEqual(expect.arrayContaining(["en", "pt", "fr", "de"]));
        expect(codigos.filter((c) => c === "en")).toHaveLength(1);
    });

    it("sin almacén inyectado solo están los integrados", () => {
        expect(idiomasConCatalogo()).toEqual(["en", "pt", "fr"]);
    });

    it("un almacén que falla al listar no rompe: quedan los integrados", () => {
        const roto: AlmacenPaquetes = {
            listarPaquetes: () => { throw new Error("Fallo de lectura"); },
            guardarPaquete: (): { ok: true } => ({ ok: true }),
            quitarPaquete: () => {},
            leerPaquete: () => null,
        };
        expect(idiomasConCatalogo({ almacen: roto })).toEqual(["en", "pt", "fr"]);
    });
});
