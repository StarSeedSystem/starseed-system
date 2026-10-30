import { describe, it, expect } from "vitest";
import {
    elegirVista,
    esAtomoVideoHtml,
    IDS_VIDEO_HTML,
    type VistaAtomoVideoHtml,
} from "../bloque-protomolecula";
import type { AtomoEnUso } from "../tipos";

const activo = (herramientaId: string): AtomoEnUso => ({
    id: "at-1",
    herramientaId,
    estado: "activo",
});

const suspendido = (herramientaId: string): AtomoEnUso => ({
    id: "at-2",
    herramientaId,
    estado: "suspendido",
});

const espero = (tipo: VistaAtomoVideoHtml["tipo"], motivo: string): VistaAtomoVideoHtml => ({ tipo, motivo });

describe("correspondencia átomo video-html → vista", () => {
    it("reconoce las dos formas del id: la ficha «hyperframes» y el átomo «video-html»", () => {
        expect(IDS_VIDEO_HTML).toContain("video-html");
        expect(IDS_VIDEO_HTML).toContain("hyperframes");
        expect(esAtomoVideoHtml("video-html")).toBe(true);
        expect(esAtomoVideoHtml("hyperframes")).toBe(true);
        expect(esAtomoVideoHtml("comfyui")).toBe(false);
        expect(esAtomoVideoHtml("")).toBe(false);
    });

    it("no es un átomo de vídeo: no hay vista", () => {
        expect(elegirVista(activo("blender"), true, true)).toBeNull();
    });
});

describe("elegirVista · prioridad de la vista", () => {
    it("servicio local vivo: vista previa en vivo, aunque haya vídeo renderizado", () => {
        expect(elegirVista(activo("video-html"), true, true)).toEqual(
            espero("vivo", "Vista previa en vivo con el servicio local de HyperFrames."),
        );
        expect(elegirVista(activo("hyperframes"), true, false)?.tipo).toBe("vivo");
    });

    it("sin servicio pero con render hecho: vídeo ya renderizado", () => {
        expect(elegirVista(activo("video-html"), false, true)).toEqual(
            espero("renderizado", "Vídeo ya renderizado por la malla."),
        );
    });

    it("sin servicio ni render: póster estático", () => {
        expect(elegirVista(activo("hyperframes"), false, false)).toEqual(
            espero("poster", "Sin servicio local ni vídeo renderizado: se muestra el póster."),
        );
    });

    it("átomo suspendido: no se reproduce, sin importar servicio ni render", () => {
        expect(elegirVista(suspendido("video-html"), true, true)).toEqual(
            espero("suspendido", "El átomo está suspendido: no se reproduce."),
        );
        expect(elegirVista(suspendido("hyperframes"), false, false)?.tipo).toBe("suspendido");
    });
});
