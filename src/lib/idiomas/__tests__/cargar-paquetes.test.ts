import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cargarCatalogo, _reiniciarAlmacen, _limpiarCache } from "../catalogos/cargar";

function paqueteIdioma(codigo: string, entradas: Record<string, string>, revisado = "automatico") {
    return {
        formato: "starseed-idioma" as const,
        version: 1,
        codigo,
        nombre: codigo.toUpperCase(),
        dir: "ltr" as const,
        autor: { nombre: "Test" },
        creado: "2026-01-01T00:00:00.000Z",
        revisado: { estado: revisado as "revisado" | "automatico" },
        licencia: "MIT",
        base: "es" as const,
        entradas,
        hash: "abc123",
    };
}

const almacenMock = {
    paquetes: new Map<string, ReturnType<typeof paqueteIdioma>>(),
    listarPaquetes() { return Array.from(this.paquetes.values()); },
    guardarPaquete(p: ReturnType<typeof paqueteIdioma>) { return { ok: true as const }; },
    quitarPaquete(codigo: string) { this.paquetes.delete(codigo); },
    leerPaquete(codigo: string) { return this.paquetes.get(codigo) ?? null; },
};

describe("cargarCatalogo", () => {
    beforeEach(() => {
        almacenMock.paquetes.clear();
        _limpiarCache();
    });

    afterEach(() => {
        _reiniciarAlmacen();
    });

    describe("cargadores integrados", () => {
        it("carga el catálogo integrado 'en'", async () => {
            const catalogo = await cargarCatalogo("en");
            expect(catalogo).not.toBeNull();
            expect(catalogo!.codigo).toBe("en");
            expect(catalogo!.tamano).toBeGreaterThan(0);
        });

        it("carga el catálogo integrado 'pt'", async () => {
            const catalogo = await cargarCatalogo("pt");
            expect(catalogo).not.toBeNull();
            expect(catalogo!.codigo).toBe("pt");
        });

        it("carga el catálogo integrado 'fr'", async () => {
            const catalogo = await cargarCatalogo("fr");
            expect(catalogo).not.toBeNull();
            expect(catalogo!.codigo).toBe("fr");
        });
    });

    describe("carga de paquetes instalados", () => {
        it("carga un paquete instalado 'de' con entradas", async () => {
            almacenMock.paquetes.set("de", paqueteIdioma("de", {
                "Hola Mundo": "Hallo Welt",
            }));
            _reiniciarAlmacen(almacenMock as any);

            const catalogo = await cargarCatalogo("de");
            expect(catalogo).not.toBeNull();
            expect(catalogo!.codigo).toBe("de");
            expect(catalogo!.revisado).toBe(false);
        });

        it("carga un paquete revisado", async () => {
            almacenMock.paquetes.set("de", paqueteIdioma("de", { "Hola Mundo": "Hallo Welt" }, "revisado"));
            _reiniciarAlmacen(almacenMock as any);

            const catalogo = await cargarCatalogo("de");
            expect(catalogo).not.toBeNull();
            expect(catalogo!.revisado).toBe(true);
        });

        it("traducir funciona con un paquete cargado", async () => {
            almacenMock.paquetes.set("de", paqueteIdioma("de", {
                "Hola Mundo": "Hallo Welt",
            }));
            _reiniciarAlmacen(almacenMock as any);

            const catalogo = await cargarCatalogo("de");
            expect(catalogo?.traducir("Hola Mundo")).toBe("Hallo Welt");
        });

        it("retorna null para codigo sin paquete", async () => {
            _reiniciarAlmacen(almacenMock as any);

            const catalogo = await cargarCatalogo("de");
            expect(catalogo).toBeNull();
        });
    });

    describe("preferencia de cargadores integrados", () => {
        it("el cargador integrado gana sobre paquete del mismo codigo sin preferirPaquete", async () => {
            almacenMock.paquetes.set("en", paqueteIdioma("en", { "Hola Mundo": "Custom Hello" }));
            _reiniciarAlmacen(almacenMock as any);

            const catalogo = await cargarCatalogo("en");
            expect(catalogo).not.toBeNull();
            expect(catalogo!.codigo).toBe("en");
            expect(catalogo!.traducir("¡Cuenta creada!")).toBe("Account created!");
        });

        it("con preferirPaquete=true, el paquete se carga aunque exista integrado", async () => {
            almacenMock.paquetes.set("en", paqueteIdioma("en", { "Hola Mundo": "Custom Hello", "¡Cuenta creada!": "Cuenta creada personalizada" }));
            _reiniciarAlmacen(almacenMock as any);

            const catalogo = await cargarCatalogo("en", { preferirPaquete: true });
            expect(catalogo).not.toBeNull();
            expect(catalogo!.traducir("¡Cuenta creada!")).toBe("Cuenta creada personalizada");
        });
    });

    describe("caché de memoria", () => {
        it("retorna el mismo catálogo de la memoria cache", async () => {
            const primerCatalogo = await cargarCatalogo("en");
            const segundoCatalogo = await cargarCatalogo("en");
            expect(primerCatalogo).toBe(segundoCatalogo);
        });
    });

    describe("códigos no válidos", () => {
        it("retorna null para código sin cargador ni paquete", async () => {
            _reiniciarAlmacen(almacenMock as any);

            const catalogo = await cargarCatalogo("xx");
            expect(catalogo).toBeNull();
        });
    });

    describe("paquetes corruptos", () => {
        it("retorna null si el paquete falta propiedades necesarias", async () => {
            almacenMock.paquetes.set("de", {
                formato: "starseed-idioma",
                version: 1,
                codigo: "de",
            } as any);
            _reiniciarAlmacen(almacenMock as any);

            const catalogo = await cargarCatalogo("de");
            expect(catalogo).toBeNull();
        });
    });
});