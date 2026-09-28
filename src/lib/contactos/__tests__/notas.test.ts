import { describe, expect, test } from "vitest";

import { agruparPorPeriodo, crearNota, editarNota, fusionarNotas, notasVivas, resumenNotas } from "@/lib/contactos/notas";
import type { NotaContacto, NotasDoc } from "@/lib/contactos/tipos";

function nota(parcial: Partial<NotaContacto>): NotaContacto {
    return {
        id: "n",
        fecha: "2026-01-01T00:00:00.000Z",
        tipo: "nota",
        texto: "texto",
        etiquetas: [],
        creado: "2026-01-01T00:00:00.000Z",
        actualizado: "2026-01-01T00:00:00.000Z",
        borrado: null,
        ...parcial,
    };
}

function doc(parcial: Partial<NotasDoc>): NotasDoc {
    return { v: 1, contactoId: "c1", notas: [], actualizado: "1970-01-01T00:00:00.000Z", ...parcial };
}

describe("crearNota / editarNota", () => {
    test("crearNota rellena defaults (fecha = ahora, tipo = nota)", () => {
        const n = crearNota({ texto: "  Hola  " }, "2026-01-01T00:00:00.000Z");
        expect(n.texto).toBe("Hola");
        expect(n.tipo).toBe("nota");
        expect(n.fecha).toBe("2026-01-01T00:00:00.000Z");
        expect(n.borrado).toBeNull();
    });

    test("crearNota respeta fecha/tipo/etiquetas explícitos", () => {
        const n = crearNota(
            { texto: "Cena", tipo: "encuentro", fecha: "2025-12-24T20:00:00.000Z", etiquetas: [" navidad ", ""] },
            "2026-01-01T00:00:00.000Z",
        );
        expect(n.tipo).toBe("encuentro");
        expect(n.fecha).toBe("2025-12-24T20:00:00.000Z");
        expect(n.etiquetas).toEqual(["navidad"]);
    });

    test("editarNota solo toca los campos dados y actualiza el reloj", () => {
        const n = nota({});
        const editada = editarNota(n, { texto: "nuevo texto" }, "2026-02-01T00:00:00.000Z");
        expect(editada.texto).toBe("nuevo texto");
        expect(editada.tipo).toBe("nota");
        expect(editada.actualizado).toBe("2026-02-01T00:00:00.000Z");
    });
});

describe("fusionarNotas", () => {
    test("LWW por id, conmutativa, y las lápidas no resucitan", () => {
        const vivaVieja = nota({ id: "1", texto: "v1", actualizado: "2026-01-01T00:00:00.000Z" });
        const borrada = { ...vivaVieja, borrado: "2026-01-05T00:00:00.000Z", actualizado: "2026-01-05T00:00:00.000Z" };

        const a = doc({ notas: [borrada], actualizado: "2026-01-05T00:00:00.000Z" });
        const b = doc({ notas: [vivaVieja], actualizado: "2026-01-01T00:00:00.000Z" });

        const ab = fusionarNotas(a, b);
        const ba = fusionarNotas(b, a);
        expect(ab).toEqual(ba);
        expect(ab.notas.find((n) => n.id === "1")?.borrado).toBe("2026-01-05T00:00:00.000Z");
    });

    test("conserva el contactoId y hace unión de ids", () => {
        const a = doc({ contactoId: "c1", notas: [nota({ id: "1" })] });
        const b = doc({ contactoId: "c1", notas: [nota({ id: "2" })] });
        const fundido = fusionarNotas(a, b);
        expect(fundido.contactoId).toBe("c1");
        expect(fundido.notas.map((n) => n.id).sort()).toEqual(["1", "2"]);
    });
});

describe("notasVivas", () => {
    test("ordena por fecha desc y luego por creado desc, sin las borradas", () => {
        const notas = [
            nota({ id: "1", fecha: "2026-01-01T00:00:00.000Z", creado: "2026-01-01T00:00:00.000Z" }),
            nota({ id: "2", fecha: "2026-03-01T00:00:00.000Z", creado: "2026-01-01T00:00:00.000Z" }),
            nota({ id: "3", fecha: "2026-01-01T00:00:00.000Z", creado: "2026-01-02T00:00:00.000Z" }),
            nota({ id: "4", fecha: "2026-05-01T00:00:00.000Z", creado: "x", borrado: "2026-01-01" }),
        ];
        const vivas = notasVivas(doc({ notas }));
        expect(vivas.map((n) => n.id)).toEqual(["2", "3", "1"]);
    });
});

describe("agruparPorPeriodo", () => {
    test("agrupa por mes en es-ES, más reciente primero", () => {
        const notas = [
            nota({ id: "1", fecha: "2026-09-15T00:00:00.000Z" }),
            nota({ id: "2", fecha: "2026-09-01T00:00:00.000Z" }),
            nota({ id: "3", fecha: "2026-01-10T00:00:00.000Z" }),
        ];
        const grupos = agruparPorPeriodo(notas);
        expect(grupos.map((g) => g.clave)).toEqual(["2026-09", "2026-01"]);
        expect(grupos[0].titulo).toBe("septiembre de 2026");
        expect(grupos[0].notas.map((n) => n.id)).toEqual(["1", "2"]);
    });
});

describe("resumenNotas", () => {
    test("total, última y recuento por tipo", () => {
        const notas = [
            nota({ id: "1", tipo: "llamada", fecha: "2026-01-01T00:00:00.000Z" }),
            nota({ id: "2", tipo: "llamada", fecha: "2026-02-01T00:00:00.000Z" }),
            nota({ id: "3", tipo: "regalo", fecha: "2026-01-15T00:00:00.000Z" }),
        ];
        const resumen = resumenNotas(notas);
        expect(resumen.total).toBe(3);
        expect(resumen.ultima?.id).toBe("2");
        expect(resumen.porTipo.llamada).toBe(2);
        expect(resumen.porTipo.regalo).toBe(1);
        expect(resumen.porTipo.idea).toBe(0);
    });
});
