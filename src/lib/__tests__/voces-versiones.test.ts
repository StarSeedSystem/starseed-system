import { describe, expect, it } from "vitest";

import type { Timbre } from "../aurora/timbres";
import type { VersionVoz } from "../voces/versiones";
import {
    aplicarVersionATimbre,
    fusionarVersiones,
    importarVersiones,
    versionDesdeTimbre,
} from "../voces/versiones";

/** Timbre de juguete para las pruebas. */
const timbre: Timbre = {
    id: "neu-zenit",
    nombre: "Zenit",
    genero: "neutra",
    desc: "Equilibrado y claro",
    local: { voz: "em_alex", speed: 1.06, instruct: "young adult, moderate pitch" },
    sistema: { bases: ["Paulina"], pitch: 0.9, rate: 1.0 },
    expr: { arco: 0.15, vivacidad: 0.14, calidez: 0.1 },
};

/** Versión base para las pruebas. */
function versionPrueba(id: string, speed: number, expr: [number, number, number], instruct: string): VersionVoz {
    const ts = "2026-09-04T00:00:00.000Z";
    return {
        id,
        nombre: `Versión ${id}`,
        timbreBase: "neu-zenit",
        motor: "alta",
        tamano: "auto",
        params: { voz: id === "a" ? "em_alex" : "ef_dora", speed, instruct, expr: { arco: expr[0], vivacidad: expr[1], calidez: expr[2] } },
        notas: "",
        valoracion: null,
        padres: [],
        creadaEn: ts,
        modificadaEn: ts,
        promovidaA: [],
    };
}

describe("versionDesdeTimbre", () => {
    it("copia la receta del timbre y no toca el almacenamiento", () => {
        const v = versionDesdeTimbre(timbre);
        expect(v.timbreBase).toBe("neu-zenit");
        expect(v.params.voz).toBe("em_alex");
        expect(v.params.speed).toBe(1.06);
        expect(v.params.instruct).toBe("young adult, moderate pitch");
        expect(v.params.expr).toEqual({ arco: 0.15, vivacidad: 0.14, calidez: 0.1 });
        expect(v.padres).toEqual([]);
        expect(v.valoracion).toBeNull();
    });
});

describe("fusionarVersiones", () => {
    const a = versionPrueba("a", 1.0, [0.1, 0.2, 0.3], "grave · solemne");
    const b = versionPrueba("b", 1.4, [0.3, 0.4, 0.5], "grave · alegre");

    it("es determinista: mismo peso, mismos números", () => {
        const f1 = fusionarVersiones(a, b, 0.25);
        const f2 = fusionarVersiones(a, b, 0.25);
        expect(f1.params.speed).toBe(f2.params.speed);
        expect(f1.params.expr).toEqual(f2.params.expr);
        expect(f1.params.instruct).toBe(f2.params.instruct);
        expect(f1.padres).toEqual(["a", "b"]);
    });

    it("peso 0 devuelve los números de A", () => {
        const f = fusionarVersiones(a, b, 0);
        expect(f.params.speed).toBe(1.0);
        expect(f.params.expr).toEqual({ arco: 0.1, vivacidad: 0.2, calidez: 0.3 });
        expect(f.params.voz).toBe("em_alex");
        expect(f.timbreBase).toBe(a.timbreBase);
    });

    it("peso 1 devuelve los números de B y la voz de B", () => {
        const f = fusionarVersiones(a, b, 1);
        expect(f.params.speed).toBe(1.4);
        expect(f.params.expr).toEqual({ arco: 0.3, vivacidad: 0.4, calidez: 0.5 });
        expect(f.params.voz).toBe("ef_dora");
    });

    it("peso 0.5 interpola y concatena los instruct sin repetir frases", () => {
        const f = fusionarVersiones(a, b);
        expect(f.params.speed).toBe(1.2);
        expect(f.params.expr).toEqual({ arco: 0.2, vivacidad: 0.3, calidez: 0.4 });
        expect(f.params.instruct).toBe("grave · solemne · alegre");
    });

    it("registra a los dos padres", () => {
        expect(fusionarVersiones(a, b, 0.3).padres).toEqual(["a", "b"]);
    });
});

describe("importarVersiones", () => {
    it("un JSON roto devuelve ok:false sin lanzar", () => {
        const r = importarVersiones("{no es json");
        expect(r.ok).toBe(false);
        expect(r.errores.length).toBeGreaterThan(0);
    });

    it("un JSON que no es array devuelve ok:false sin lanzar", () => {
        expect(importarVersiones('{"a":1}').ok).toBe(false);
    });

    it("una entrada malformada devuelve ok:false con el error señalado", () => {
        const r = importarVersiones(JSON.stringify([{ id: "x" }]));
        expect(r.ok).toBe(false);
        expect(r.errores[0]).toContain("entrada 0");
    });

    it("un array vacío es válido", () => {
        expect(importarVersiones("[]").ok).toBe(true);
    });
});

describe("aplicarVersionATimbre", () => {
    it("conserva id, nombre y expr de la versión", () => {
        const v = { ...versionPrueba("a", 1.0, [0.1, 0.2, 0.3], "grave"), nombre: "Mi voz" };
        const t = aplicarVersionATimbre(v);
        expect(t.id).toBe("a");
        expect(t.nombre).toBe("Mi voz");
        expect(t.expr).toEqual({ arco: 0.1, vivacidad: 0.2, calidez: 0.3 });
        expect(t.local.voz).toBe("em_alex");
        expect(t.local.speed).toBe(1.0);
        expect(t.local.instruct).toBe("grave");
    });

    it("hereda el género del timbre base cuando existe en el catálogo", () => {
        const t = aplicarVersionATimbre(versionPrueba("a", 1.0, [0.1, 0.2, 0.3], "grave"));
        expect(t.genero).toBe("neutra");
        expect(t.desc).toBe("Equilibrado y claro");
    });
});
