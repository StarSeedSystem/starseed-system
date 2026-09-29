import { describe, expect, it } from "vitest";
import { haceTexto, normalizarEspacios, rutaDe, tipoDe } from "../_catalogo/espacios";
import { asientos, mundosDe } from "../../gen4/multiverse-hub-partes";

describe("Tus espacios · lógica", () => {
    it("reconoce el tipo real de cada fila de os_spaces", () => {
        expect(tipoDe({ kind: "escena" })).toBe("escena");
        expect(tipoDe({ kind: "board" })).toBe("pizarra");
        expect(tipoDe({ kind: "dashboard", app: "documento" })).toBe("documento");
        expect(tipoDe({ kind: "dashboard", app: "presentacion" })).toBe("presentacion");
        expect(tipoDe({ kind: "dashboard", vivo: "tabla" })).toBe("tabla");
        expect(tipoDe({ kind: "dashboard", vivo: "juego" })).toBe("juego");
        expect(tipoDe({ kind: "juego" })).toBe("juego");
        expect(tipoDe({ kind: "dashboard", vivo: "programa" })).toBe("programa");
        expect(tipoDe({ kind: "dashboard" })).toBe("dashboard");
        expect(tipoDe({ kind: "desktop" })).toBe("escritorio");
        expect(tipoDe({})).toBe("otro");
    });
    it("abre cada espacio en la ruta de su app, con el id escapado", () => {
        expect(rutaDe({ id: "a b", tipo: "documento" })).toBe("/documento/a%20b");
        expect(rutaDe({ id: "x", tipo: "pizarra" })).toBe("/pizarra?board-space=x");
        expect(rutaDe({ id: "x", tipo: "escena" })).toBe("/escena/x");
        expect(rutaDe({ id: "x", tipo: "dashboard" })).toBe("/dashboard-compartido/x");
    });
    it("normaliza filas raras sin romperse", () => {
        const r = normalizarEspacios([{ id: "1", title: "  ", kind: "escena" }, { title: "sin id" }, null, "x"]);
        expect(r).toEqual([{ id: "1", titulo: "Sin título", tipo: "escena", actualizado: "" }]);
        expect(normalizarEspacios(null)).toEqual([]);
    });
    it("dice cuánto hace sin segundos", () => {
        const ahora = Date.parse("2026-09-29T12:00:00Z");
        expect(haceTexto("2026-09-29T11:59:40Z", ahora)).toBe("ahora");
        expect(haceTexto("2026-09-29T11:15:00Z", ahora)).toBe("hace 45 min");
        expect(haceTexto("2026-09-29T07:00:00Z", ahora)).toBe("hace 5 h");
        expect(haceTexto("2026-09-28T10:00:00Z", ahora)).toBe("hace 1 día");
        expect(haceTexto("basura", ahora)).toBe("");
    });
    it("los mundos son escenas y salas de juego, sentados en su órbita", () => {
        const m = mundosDe([{ id: "1", titulo: "a", tipo: "escena", actualizado: "" }, { id: "2", titulo: "b", tipo: "documento", actualizado: "" }, { id: "3", titulo: "c", tipo: "juego", actualizado: "" }]);
        expect(m.map((x) => x.id)).toEqual(["1", "3"]);
        const a = asientos(m);
        expect(a.map((x) => x.orbita)).toEqual([1, 0]);
        const muchos = asientos(Array.from({ length: 4 }, () => ({ tipo: "escena" as const })));
        const angulos = muchos.map((x) => x.angulo);
        expect(new Set(angulos).size).toBe(4);
        expect(angulos[1] - angulos[0]).toBeCloseTo(Math.PI / 2);
    });
});

import { conteoPorTipo, obrasDe, resumenConteo } from "../../gen4/creative-studio-partes";

describe("Estudio Creativo · lógica", () => {
    it("las obras son documentos, presentaciones, tablas, pizarras y programas", () => {
        const e = (id: string, tipo: any) => ({ id, titulo: id, tipo, actualizado: "" });
        const o = obrasDe([e("1", "documento"), e("2", "escena"), e("3", "tabla"), e("4", "dashboard"), e("5", "documento"), e("6", "programa")]);
        expect(o.map((x) => x.id)).toEqual(["1", "3", "5", "6"]);
        const c = conteoPorTipo(o);
        expect(c).toEqual({ documento: 2, presentacion: 0, tabla: 1, pizarra: 0, programa: 1 });
        expect(resumenConteo(c)).toBe("2 documentos, 1 tabla y 1 programa");
        expect(resumenConteo(conteoPorTipo([]))).toBe("ninguna obra");
        expect(resumenConteo(conteoPorTipo([e("1", "presentacion")]))).toBe("1 presentación");
    });
});

import { normalizarRecursos, ordenarRecursos } from "../_catalogo/procomun";

describe("Procomún · lógica", () => {
    it("normaliza los recursos comunes y los ordena por utilidad", () => {
        const r = normalizarRecursos([
            { id: "a", name: "Sala", type: "Espacio", status: "En uso", assignedTo: "u2" },
            { id: "b", name: "Taladro", status: "Disponible" },
            { id: "c", name: "Bici", status: "En uso", assignedTo: "u1" },
            { id: "d", name: "Batería", status: "Roto" },
            { id: "e", name: "Horno", status: "Mantenimiento" },
            { name: "sin id" }, null,
        ]);
        expect(r).toHaveLength(5);
        expect(r.find((x) => x.id === "b")!.tipo).toBe("Recurso");
        expect(r.find((x) => x.id === "d")!.estado).toBe("Disponible");
        expect(ordenarRecursos(r, "u1").map((x) => x.id)).toEqual(["c", "d", "b", "a", "e"]);
    });
});
