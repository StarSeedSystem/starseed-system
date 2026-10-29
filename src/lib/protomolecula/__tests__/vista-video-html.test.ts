import { describe, it, expect } from "vitest";
import { elegirVista, type VistaVideoHtml, type ElegirVistaArgs } from "../bloque-protomolecula";
import type { AtomoEnUso } from "../tipos";

const a = (o: Partial<AtomoEnUso> = {}): AtomoEnUso => ({ id: "a-1", herramientaId: "hyperframes", estado: "activo", ...o });
const o = (h: string, o: Partial<AtomoEnUso> = {}): AtomoEnUso => ({ id: "a-2", herramientaId: h, estado: "activo", ...o });
const args = (at: AtomoEnUso, sv: boolean, rh: boolean): ElegirVistaArgs => ({ atomo: at, servicioVivo: sv, renderHecho: rh });

describe("elegirVista · decisión pura para átomo video-html", () => {
    it("«video» si renderHecho (prioridad máxima)", () => expect(elegirVista(args(a(), false, true))).toBe("video"));
    it("«video» aunque servicio no vivo si renderHecho", () => expect(elegirVista(args(a(), false, true))).toBe("video"));
    it("«preview» si servicioVivo y no renderHecho", () => expect(elegirVista(args(a(), true, false))).toBe("preview"));
    it("«poster» si ni renderHecho ni servicioVivo", () => expect(elegirVista(args(a(), false, false))).toBe("poster"));
    it("«poster» para otros átomos aunque servicioVivo y renderHecho", () => expect(elegirVista(args(o("sintetizador"), true, true))).toBe("poster"));
    it("«video» para herramientaId video-html con renderHecho", () => expect(elegirVista(args(a({ herramientaId: "video-html" }), true, true))).toBe("video"));
    it("pura: misma entrada → misma salida, sin mutar", () => { const at = a(); const ar = args(at, true, false); const c = structuredClone(ar); expect(elegirVista(ar)).toBe(elegirVista(ar)); expect(ar).toEqual(c); });
    it("orden de prioridad: renderHecho > servicioVivo > poster", () => {
        const at = a();
        expect(elegirVista(args(at, false, false))).toBe("poster");
        expect(elegirVista(args(at, true, false))).toBe("preview");
        expect(elegirVista(args(at, false, true))).toBe("video");
        expect(elegirVista(args(at, true, true))).toBe("video");
    });
    it("átomo suspendido sigue la misma lógica", () => expect(elegirVista(args(a({ estado: "suspendido" }), true, false))).toBe("preview"));
});

describe("tipos exportados", () => {
    it("VistaVideoHtml tiene tres variantes", () => { const v: VistaVideoHtml[] = ["poster", "video", "preview"]; expect(v).toHaveLength(3); });
    it("ElegirVistaArgs tiene forma esperada", () => { const ar = args(a(), true, false); expect(ar.atomo.herramientaId).toBe("hyperframes"); expect(typeof ar.servicioVivo).toBe("boolean"); expect(typeof ar.renderHecho).toBe("boolean"); });
});