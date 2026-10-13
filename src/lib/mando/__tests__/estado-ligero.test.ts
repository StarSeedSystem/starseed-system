import { describe, expect, it } from "vitest";
import { estadoLigero, estadoLigeroCacheado, quiereEstadoCompleto, textoEstado } from "../estado-ligero";
import type { EstadoMando } from "../tipos";

function estado(): EstadoMando {
    return {
        generadoEn: "2026-10-13T10:00:00.000Z",
        informes: [{ nombre: "informe-cola-1.md", titulo: "Ola 1", markdown: "# largo\n".repeat(500), fecha: "2026-10-13" }],
        tareas: [{ id: "A1", ola: "1", titulo: "t", dependencias: ["A0"], cola: "c", archivos: ["src/a.ts"], descripcion: "mucho texto" }],
        fila: [{ id: "A1" }],
    } as unknown as EstadoMando;
}

describe("estado ligero (2026-10-13: 3,1 MB por sondeo)", () => {
    it("quita el Markdown de los informes y la descripción y archivos de las tareas, sin mutar", () => {
        const e = estado();
        const l = estadoLigero(e);
        expect(l.informes[0]).toEqual({ nombre: "informe-cola-1.md", titulo: "Ola 1", fecha: "2026-10-13", markdown: "" });
        expect(l.tareas[0]).toEqual({ id: "A1", ola: "1", titulo: "t", dependencias: ["A0"], cola: "c" });
        expect(l.ligero).toBe(true);
        expect(l.fila).toBe(e.fila);
        expect(e.informes[0].markdown.length).toBeGreaterThan(1000);
        expect(e.tareas[0].descripcion).toBe("mucho texto");
    });

    it("pide el completo solo con ?completo=1", () => {
        expect(quiereEstadoCompleto("http://localhost:9002/api/mando/estado?completo=1")).toBe(true);
        expect(quiereEstadoCompleto("/api/mando/estado?completo=1")).toBe(true);
        expect(quiereEstadoCompleto("http://localhost:9002/api/mando/estado")).toBe(false);
        expect(quiereEstadoCompleto("http://localhost:9002/api/mando/estado?completo=0")).toBe(false);
    });

    it("serializa una vez por estado y variante", () => {
        const e = estado();
        expect(estadoLigeroCacheado(e)).toBe(estadoLigeroCacheado(e));
        const ligero = textoEstado(e, false);
        const completo = textoEstado(e, true);
        expect(textoEstado(e, false)).toBe(ligero);
        expect(ligero.length).toBeLessThan(completo.length / 5);
        expect(JSON.parse(completo).informes[0].markdown).toContain("# largo");
    });
});
