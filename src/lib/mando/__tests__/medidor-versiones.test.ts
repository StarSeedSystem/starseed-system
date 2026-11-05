import { describe, expect, it } from "vitest";

import { detalleDeMedidor, type ClaveMedidor } from "@/lib/mando/medidores";

describe("detalleDeMedidor · versiones", () => {
    const estadoBasico = {
        fase: "esperando-lista",
        detalle: "la lista no ha terminado: 2 tarea(s)",
        version: null,
        pasos: [],
        jobs: [],
        medios: {},
        run_url: null,
        release_url: null,
        historial: [],
        pausado: false,
        tono: "normal",
    };

    it("devuelve filas vacías y mensaje explicativo cuando no hay estado", () => {
        const d = detalleDeMedidor("versiones", {}, Date.now());
        expect(d.filas).toEqual([]);
        expect(d.vacio).toBeTruthy();
        expect(d.resumen).toContain("sin lanzamiento en curso");
    });

    it("muestra la fase y el detalle en el resumen", () => {
        const ahora = Date.now();
        const d = detalleDeMedidor("versiones", { lanzamientos: estadoBasico }, ahora);
        expect(d.resumen).toContain("esperando-lista");
        expect(d.resumen).toContain("la lista no ha terminado");
    });

    it("incluye una fila por medio con su estado", () => {
        const estadoConMedios = {
            ...estadoBasico,
            fase: "compilando",
            version: "0.4.0",
            medios: {
                macos: { estado: "al-dia", faltan: [], pequenos: [] },
                windows: { estado: "atascado", faltan: ["StarSeed.OS_0.4.0_x64_en-US.msi"], pequenos: [] },
                linux: { estado: "al-dia", faltan: [], pequenos: [] },
                android: { estado: "al-dia", faltan: [], pequenos: [] },
                ios: { estado: "no-disponible", faltan: [], pequenos: [] },
                canales: { estado: "al-dia", faltan: [], pequenos: [] },
                web: { estado: "al-dia", faltan: [], pequenos: [] },
                pwa: { estado: "al-dia", faltan: [], pequenos: [] },
                libreria: { estado: "al-dia", faltan: [], pequenos: [] },
            },
            jobs: [
                { medio: "macos", job: "macos-build", estado: "ok", url: "https://github.com/...", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:15:00Z" },
                { medio: "windows", job: "windows-build", estado: "fallo", url: "https://github.com/...", inicio: "2026-11-05T10:00:00Z", fin: "2026-11-05T10:10:00Z" },
            ],
            run_url: "https://github.com/StarSeedSystem/starseed-system/actions/runs/123",
        };
        const ahora = Date.now();
        const d = detalleDeMedidor("versiones", { lanzamientos: estadoConMedios }, ahora);
        expect(d.filas.length).toBeGreaterThan(0);
        const filaMacos = d.filas.find((f) => f.id === "macos");
        expect(filaMacos).toBeDefined();
        expect(filaMacos?.estado).toBe("al-dia");
        const filaWindows = d.filas.find((f) => f.id === "windows");
        expect(filaWindows).toBeDefined();
        expect(filaWindows?.estado).toBe("atascado");
    });

    it("el tono de la pastilla refleja el estado: peligro si hay atascado, aviso si hay lanzamiento en curso", () => {
        const ahora = Date.now();
        const dNormal = detalleDeMedidor("versiones", { lanzamientos: { ...estadoBasico, tono: "normal" } }, ahora);
        expect(dNormal.acciones.some((a) => a.clase === "ir-a")).toBe(true);
    });

    it("los pasos del lanzamiento aparecen en la ficha de la fila del lanzamiento", () => {
        const estadoConPasos = {
            ...estadoBasico,
            fase: "compilando",
            version: "0.4.0",
            pasos: [
                { fase: "esperando-lista", t: Date.now() - 100000, detalle: "lista terminada" },
                { fase: "esperando-publicacion", t: Date.now() - 50000, detalle: "publicada y verificada" },
                { fase: "preparando", t: Date.now() - 10000, detalle: "versión 0.4.0 preparada" },
                { fase: "etiquetando", t: Date.now() - 5000, detalle: "etiqueta v0.4.0 subida" },
                { fase: "compilando", t: Date.now(), detalle: "compilando v0.4.0 en GitHub" },
            ],
        };
        const ahora = Date.now();
        const d = detalleDeMedidor("versiones", { lanzamientos: estadoConPasos }, ahora);
        const filaLanzamiento = d.filas.find((f) => f.id === "lanzamiento");
        expect(filaLanzamiento).toBeDefined();
        expect(filaLanzamiento?.ficha).toBeDefined();
        const etiquetas = filaLanzamiento?.ficha?.map((f) => f.etiqueta) ?? [];
        expect(etiquetas).toContain("Paso 1");
        expect(etiquetas).toContain("Paso 5");
    });
});