import { describe, it, expect } from "vitest";
import { MEDIOS_PANEL, filasDeMedios, validarPeticion, EstadoDirector } from "@/lib/mando/lanzamientos";

describe("MEDIOS_PANEL", () => {
    it("contiene los 9 medios del panel en el orden correcto", () => {
        expect(MEDIOS_PANEL).toHaveLength(9);
        expect(MEDIOS_PANEL[0]).toEqual({ id: "web", titulo: "Sitio web oficial", formatos: [{ nombre: "web", url: "https://starseed-os.vercel.app" }] });
        expect(MEDIOS_PANEL[1]).toEqual({ id: "pwa", titulo: "App web instalable (PWA)", formatos: [] });
        expect(MEDIOS_PANEL[8]).toEqual({ id: "libreria", titulo: "Librería de StarSeed OS", formatos: [] });
    });
});

describe("filasDeMedios", () => {
    it("devuelve una fila por medio con los datos del estado", () => {
        const estado: EstadoDirector = { fase: "compilando", detalle: "compilando v0.4.0", version: "0.4.0", t: 1700000000, medios: { web: { estado: "al-dia", faltan: [], pequenos: [] }, pwa: { estado: "generando", faltan: [], pequenos: [] }, macos: { estado: "al-dia", faltan: [], pequenos: [] } } };
        const filas = filasDeMedios(estado, "0.3.9");
        expect(filas).toHaveLength(9);
        expect(filas[0]).toEqual({ id: "web", titulo: "Sitio web oficial", formatos: [{ nombre: "web", url: "https://starseed-os.vercel.app" }], version: "0.4.0", estado: "al-dia", detalle: "compilando v0.4.0", accion: "descargar" });
    });

    it("asigna la accion correcta segun el estado del medio", () => {
        const estado: EstadoDirector = { fase: "compilando", detalle: "d", t: 1, version: "0.4.0", medios: { web: { estado: "al-dia", faltan: [], pequenos: [] }, pwa: { estado: "generando", faltan: [], pequenos: [] }, macos: { estado: "atascado", faltan: ["test.dmg"], pequenos: [] } } };
        const filas = filasDeMedios(estado, "0.3.9");
        expect(filas[0].accion).toBe("descargar");
        expect(filas[1].accion).toBe("generar");
        expect(filas[2].accion).toBe("regenerar");
    });

    it("usa la version publicada cuando no hay version en estado", () => {
        const filas = filasDeMedios({ fase: "esperando-lista", medios: {} } as EstadoDirector, "0.3.9");
        expect(filas[0].version).toBe("0.3.9");
        expect(filas[0].estado).toBe("no-disponible");
        expect(filas[0].accion).toBe("verificar");
    });

    it("calcula detalle con archivos faltantes o pequenos", () => {
        const filas = filasDeMedios({ version: "0.4.0", medios: { macos: { estado: "atascado", faltan: ["file.dmg"], pequenos: [] }, windows: { estado: "al-dia", faltan: [], pequenos: ["file.msi"] } } } as EstadoDirector, "0.3.9");
        expect(filas[2].detalle).toBe("Faltan: file.dmg");
        expect(filas[3].detalle).toBe("Archivos pequeños: file.msi");
    });

    it("incluye URLs de descarga para el formato web", () => {
        const filas = filasDeMedios({ version: "0.4.0", medios: { web: { estado: "al-dia", faltan: [], pequenos: [] } } } as EstadoDirector, "0.3.9");
        expect(filas[0].formatos[0].url).toBe("https://starseed-os.vercel.app");
    });
});

describe("validarPeticion", () => {
    it("acepta peticiones validas y rechaza invalidas", () => {
        expect(validarPeticion({ accion: "lanzar", medio: "web" })).toEqual({ accion: "lanzar", medio: "web" });
        expect(validarPeticion({ accion: "pausar" })).toEqual({ accion: "pausar" });
        expect(validarPeticion({ accion: "reanudar" })).toEqual({ accion: "reanudar" });
        expect(validarPeticion({ accion: "auto", activo: true })).toEqual({ accion: "auto", activo: true });
        expect(validarPeticion({ accion: "reintentar", medio: "macos" })).toEqual({ accion: "reintentar", medio: "macos" });
        expect(validarPeticion({ accion: "regenerar", medio: "windows" })).toEqual({ accion: "regenerar", medio: "windows" });
    });

    it("rechaza medio invalido, accion no permitida y auto sin activo", () => {
        expect(validarPeticion({ accion: "lanzar", medio: "invalido" })).toBeInstanceOf(Error);
        expect(validarPeticion({ accion: "eliminar", medio: "web" })).toBeInstanceOf(Error);
        expect(validarPeticion({ accion: "auto" })).toBeInstanceOf(Error);
        expect(validarPeticion({ accion: "auto", activo: "true" as unknown as boolean })).toBeInstanceOf(Error);
        expect(validarPeticion({ accion: "reintentar" })).toBeInstanceOf(Error);
        expect(validarPeticion(null)).toBeInstanceOf(Error);
        expect(validarPeticion({})).toBeInstanceOf(Error);
    });

    it("requiere medio para acciones que lo necesitan", () => {
        expect(validarPeticion({ accion: "reintentar" })).toBeInstanceOf(Error);
        expect(validarPeticion({ accion: "regenerar" })).toBeInstanceOf(Error);
        expect(validarPeticion({ accion: "lanzar" })).toBeInstanceOf(Error);
    });
});