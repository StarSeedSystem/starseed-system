import { describe, expect, it } from "vitest";
import { detalleDeMedidor } from "@/lib/mando/medidores";
import type { LanzamientoEstado } from "@/lib/mando/lanzamientos-tipos";

describe("detalleDeMedidor · versiones", () => {
    it("muestra el resumen con fase, detalle y versión cuando hay estado", () => {
        const estado: LanzamientoEstado = {
            fase: "verificando-archivos",
            detalle: "v0.4.1 publicada",
            version: "v0.4.1",
            pasos: [],
            jobs: [],
            medios: {
                web: { estado: "al-dia", faltan: [], pequenos: [] },
                macos: { estado: "generando", faltan: [], pequenos: [] },
            },
            historial: [],
            pausado: false,
            tono: "normal",
        };

        const d = detalleDeMedidor("versiones", { versiones: estado });

        expect(d.titulo).toBe("Centro de Versiones");
        expect(d.resumen).toContain("verificando-archivos");
        expect(d.resumen).toContain("v0.4.1");
        expect(d.filas).toHaveLength(2);
        expect(d.filas.map((f) => f.id)).toEqual(expect.arrayContaining(["web", "macos"]));
    });

    it("muestra el detalle de cada medio con su estado y filtros", () => {
        const estado: LanzamientoEstado = {
            fase: "publicando",
            detalle: "en curso",
            version: "v0.5.0",
            pasos: [],
            jobs: [
                { medio: "macos", job: "12345", estado: "completado", url: "https://github.com/...", inicio: "", fin: "" },
            ],
            medios: {
                web: { estado: "al-dia", faltan: [], pequenos: [] },
                macos: { estado: "generando", faltan: [".dmg"], pequenos: [] },
            },
            historial: [],
            pausado: false,
            tono: "normal",
        };

        const d = detalleDeMedidor("versiones", { versiones: estado });

        expect(d.filas.find((f) => f.id === "macos")?.porque).toContain("Faltan: .dmg");
    });

    it("cuenta filas por cada medio declarado", () => {
        const estado: LanzamientoEstado = {
            fase: "al-dia",
            detalle: "todo publicado",
            version: "v0.4.1",
            pasos: [],
            jobs: [],
            medios: {
                web: { estado: "al-dia", faltan: [], pequenos: [] },
                pwa: { estado: "al-dia", faltan: [], pequenos: [] },
                macos: { estado: "al-dia", faltan: [], pequenos: [] },
                windows: { estado: "al-dia", faltan: [], pequenos: [] },
                linux: { estado: "al-dia", faltan: [], pequenos: [] },
                android: { estado: "al-dia", faltan: [], pequenos: [] },
            },
            historial: [],
            pausado: false,
            tono: "normal",
        };

        const d = detalleDeMedidor("versiones", { versiones: estado });

        expect(d.filas).toHaveLength(6);
        expect(d.filas.every((f) => f.estado === "al-dia")).toBe(true);
    });

    it("muestra mensaje cuando no hay datos del director", () => {
        const d = detalleDeMedidor("versiones", {});

        expect(d.resumen).toBe("Sin datos del director de lanzamientos.");
        expect(d.filas).toEqual([]);
        expect(d.vacio).toBe("No se pudo leer el estado del director de lanzamientos.");
    });

    it("incluye botón de lanzar versión en acciones", () => {
        const estado: LanzamientoEstado = {
            fase: "esperando-publicacion",
            detalle: " lista terminada",
            version: "v0.5.0",
            pasos: [],
            jobs: [],
            medios: { web: { estado: "al-dia", faltan: [], pequenos: [] } },
            historial: [],
            pausado: false,
            tono: "normal",
        };

        const d = detalleDeMedidor("versiones", { versiones: estado });

        expect(d.acciones).toContainEqual(
            expect.objectContaining({
                clase: "publicar",
                texto: "Lanzar versión",
                destructiva: false,
            }),
        );
    });
});