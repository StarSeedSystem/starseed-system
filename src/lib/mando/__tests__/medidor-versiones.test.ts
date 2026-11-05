import { describe, expect, it } from "vitest";

import { detalleDeMedidor, MEDIOS_VERSIONES } from "@/lib/mando/medidores";

type TonoPastilla = "normal" | "aviso" | "peligro";

describe("MEDIOS_VERSIONES", () => {
    it("tiene los 9 medios en el orden del contrato", () => {
        expect(MEDIOS_VERSIONES).toHaveLength(9);
        expect(MEDIOS_VERSIONES.map(([k]) => k)).toEqual([
            "web",
            "pwa",
            "macos",
            "windows",
            "linux",
            "android",
            "ios",
            "canales",
            "libreria",
        ]);
    });

    it("cada medio tiene su etiqueta legible", () => {
        for (const [clave, etiqueta] of MEDIOS_VERSIONES) {
            expect(etiqueta).toBeTruthy();
            expect(typeof etiqueta).toBe("string");
            expect(etiqueta.length).toBeGreaterThan(1);
        }
    });
});

describe("detalleDeMedidor(«versiones»)", () => {
    const AHORA = Date.now();
    const estadoBase = {
        fase: "compilando",
        detalle: "compilando v0.4.0 en GitHub",
        version: "0.4.0",
        pasos: [
            { fase: "esperando-lista", t: AHORA - 3600_000, detalle: "lista terminada" },
            { fase: "esperando-publicacion", t: AHORA - 3000_000, detalle: "espero publicación" },
            { fase: "preparando", t: AHORA - 2400_000, detalle: "preparo v0.4.0" },
            { fase: "etiquetando", t: AHORA - 1800_000, detalle: "etiqueta v0.4.0 subida" },
            { fase: "compilando", t: AHORA - 600_000, detalle: "compilando v0.4.0 en GitHub" },
        ],
        jobs: [
            { medio: "macos", job: "macos · macos-latest", estado: "en-curso", url: "https://github.com/.../jobs/1", inicio: "2026-11-05T10:00:00Z" },
            { medio: "windows", job: "windows · windows-latest", estado: "en-cola", url: "https://github.com/.../jobs/2" },
        ],
        medios: {
            web: { estado: "al-dia", faltan: [], pequenos: [] },
            pwa: { estado: "al-dia", faltan: [], pequenos: [] },
            macos: { estado: "generando", faltan: [], pequenos: [] },
            windows: { estado: "en-cola", faltan: [], pequenos: [] },
            linux: { estado: "en-cola", faltan: [], pequenos: [] },
            android: { estado: "en-cola", faltan: [], pequenos: [] },
            ios: { estado: "no-disponible", faltan: [], pequenos: [] },
            canales: { estado: "en-cola", faltan: [], pequenos: [] },
            libreria: { estado: "en-cola", faltan: [], pequenos: [] },
        },
        run_url: "https://github.com/StarSeedSystem/starseed-system/actions/runs/123",
        release_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.4.0",
        historial: [
            { t: AHORA - 86400_000 * 2, tipo: "lanzado", version: "0.3.0" },
        ],
        pausado: false,
        tono: "aviso" as TonoPastilla,
    };

    it("devuelve las 9 filas, una por medio, con su etiqueta y estado", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoBase }, AHORA);
        expect(d.filas).toHaveLength(9);
        expect(d.filas.map((f) => f.id)).toEqual([
            "web",
            "pwa",
            "macos",
            "windows",
            "linux",
            "android",
            "ios",
            "canales",
            "libreria",
        ]);
        expect(d.filas[0].titulo).toBe("Sitio web oficial");
        expect(d.filas[2].titulo).toBe("macOS");
        expect(d.filas[6].titulo).toBe("iOS");
    });

    it("el resumen incluye versión publicada, versión en curso, fase y último paso", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoBase }, AHORA);
        expect(d.resumen).toContain("publicada: v0.3.0");
        expect(d.resumen).toContain("en curso: v0.4.0");
        expect(d.resumen).toContain("compilando");
        expect(d.resumen).toContain("compilando v0.4.0 en GitHub");
    });

    it("el tono viene del estado (aviso en este caso)", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoBase }, AHORA);
        expect(d.tono).toBe("aviso");
    });

    it("iOS en no-disponible añade el motivo en la ficha", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoBase }, AHORA);
        const ios = d.filas.find((f) => f.id === "ios");
        expect(ios?.porque).toContain("no-disponible");
        expect(ios?.porque).toContain("sin cuenta de Apple Developer");
        expect(ios?.ficha?.some((fc) => fc.aviso)).toBe(true);
    });

    it("un medio atascado con archivos faltantes lo muestra en la ficha", () => {
        const estadoConFaltantes = {
            ...estadoBase,
            medios: {
                ...estadoBase.medios,
                macos: { estado: "atascado", faltan: ["StarSeed.OS_0.4.0_universal.dmg", "StarSeed.OS_0.4.0_universal.app.tar.gz"], pequenos: [] },
            },
        };
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoConFaltantes }, AHORA);
        const macos = d.filas.find((f) => f.id === "macos");
        expect(macos?.estado).toBe("atascado");
        expect(macos?.porque).toContain("faltan: StarSeed.OS_0.4.0_universal.dmg, StarSeed.OS_0.4.0_universal.app.tar.gz");
        expect(macos?.ficha?.some((fc) => fc.etiqueta === "Faltan" && fc.aviso)).toBe(true);
    });

    it("un medio con archivos pequeños lo muestra en la ficha", () => {
        const estadoConPequenos = {
            ...estadoBase,
            medios: {
                ...estadoBase.medios,
                windows: { estado: "atascado", faltan: [], pequenos: ["StarSeed.OS_0.4.0_x64-setup.exe"] },
            },
        };
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoConPequenos }, AHORA);
        const windows = d.filas.find((f) => f.id === "windows");
        expect(windows?.porque).toContain("pequeños: StarSeed.OS_0.4.0_x64-setup.exe");
        expect(windows?.ficha?.some((fc) => fc.etiqueta === "Tamaño insuficiente" && fc.aviso)).toBe(true);
    });

    it("sin estado del director devuelve aviso y mensaje explicativo", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: null }, AHORA);
        expect(d.filas).toHaveLength(0);
        expect(d.resumen).toBe("sin datos del director de lanzamientos");
        expect(d.aviso).toContain("No se pudo leer el estado de lanzamientos");
        expect(d.vacio).toBe("Sin estado del director de lanzamientos.");
        expect(d.acciones.map((a) => a.clase)).toEqual(["ir-a"]);
        expect(d.acciones[0].destino).toBe("lanzamientos");
    });

    it("sin medios en el estado usa el vacio", () => {
        const estadoSinMedios = { ...estadoBase, medios: {} };
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoSinMedios }, AHORA);
        expect(d.filas).toHaveLength(0);
        expect(d.vacio).toBe("Sin medios en el estado del director.");
    });

    it("la acción siempre lleva al Centro de Versiones", () => {
        const d = detalleDeMedidor("versiones", { lanzamientosEstado: estadoBase }, AHORA);
        expect(d.acciones).toHaveLength(1);
        expect(d.acciones[0].clase).toBe("ir-a");
        expect(d.acciones[0].destino).toBe("lanzamientos");
    });
});