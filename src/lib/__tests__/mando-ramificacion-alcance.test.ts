import { describe, it, expect } from "vitest";
import { leerAlcance, leerRevision, motivoDe, type PasoRama } from "../mando/ramificacion";

// Ola 269 (2026-09-07): parseo de los pasos nuevos del orquestador (`alcance`, `revision`
// con segundos e intentos) y del motivo del visto bueno, como funciones puras.

function paso(nombre: string, datos: Record<string, string | number | boolean>): PasoRama {
    return { t: "2026-09-07T10:00:00Z", paso: nombre, donde: "mac", datos };
}

describe("leerAlcance (Ola 269)", () => {
    it("devuelve null si no hay paso alcance", () => {
        expect(leerAlcance([])).toBeNull();
        expect(leerAlcance([paso("escritura", { modelo: "xkiro/qwen" })])).toBeNull();
    });

    it("faltan «a.ts,b.ts» se convierte en array limpio", () => {
        const a = leerAlcance([paso("alcance", { pedidos: 3, tocados: 2, faltan: "a.ts,b.ts", completado: true })]);
        expect(a).not.toBeNull();
        expect(a?.faltan).toEqual(["a.ts", "b.ts"]);
        expect(a?.pedidos).toBe(3);
        expect(a?.tocados).toBe(2);
        expect(a?.completado).toBe(true);
    });

    it("faltan vacía da array vacío, sin huecos", () => {
        const a = leerAlcance([paso("alcance", { pedidos: 2, tocados: 2, faltan: "", completado: false })]);
        expect(a?.faltan).toEqual([]);
        expect(a?.completado).toBe(false);
    });

    it("los faltantes se recortan (espacios) y se filtran los trozos vacíos", () => {
        const a = leerAlcance([paso("alcance", { pedidos: 3, tocados: 1, faltan: " a.ts , , b.ts ", completado: false })]);
        expect(a?.faltan).toEqual(["a.ts", "b.ts"]);
    });

    it("manda el ÚLTIMO paso alcance si el orquestador escribió varios", () => {
        const a = leerAlcance([
            paso("alcance", { pedidos: 2, tocados: 1, faltan: "viejo.ts", completado: false }),
            paso("alcance", { pedidos: 2, tocados: 2, faltan: "", completado: true }),
        ]);
        expect(a?.faltan).toEqual([]);
        expect(a?.completado).toBe(true);
    });
});

describe("leerRevision (Ola 269)", () => {
    it("sin revisión da null", () => {
        expect(leerRevision([])).toBeNull();
        expect(leerRevision([paso("revision", { caracteres: 5000 })])).toBeNull(); // sin revisor no vale
    });

    it("un paso revision sin segundos deja segundos en null", () => {
        const r = leerRevision([paso("revision", { revisor: "xkiro/qwen3.7-plus", bloqueante: false })]);
        expect(r?.revisor).toBe("xkiro/qwen3.7-plus");
        expect(r?.segundos).toBeNull();
        expect(r?.intentos).toBeNull();
        expect(r?.bloqueante).toBe(false);
    });

    it("segundos e intentos se leen cuando vienen", () => {
        const r = leerRevision([paso("revision", { revisor: "nim/kimi", segundos: 96, intentos: 2, bloqueante: true })]);
        expect(r?.segundos).toBe(96);
        expect(r?.intentos).toBe(2);
        expect(r?.bloqueante).toBe(true);
    });

    it("manda el último paso revision", () => {
        const r = leerRevision([
            paso("revision", { revisor: "xkiro/uno", segundos: 10 }),
            paso("revision", { revisor: "xkiro/dos", segundos: 20 }),
        ]);
        expect(r?.revisor).toBe("xkiro/dos");
        expect(r?.segundos).toBe(20);
    });
});

describe("motivoDe (Ola 269 · evento esperando_aprobacion)", () => {
    it("devuelve el motivo cuando viene en datos.motivo", () => {
        expect(motivoDe({ motivo: "revisión bloqueante confirmada" })).toBe("revisión bloqueante confirmada");
        expect(motivoDe({ motivo: "alcance incompleto: faltan a.ts" })).toBe("alcance incompleto: faltan a.ts");
        expect(motivoDe({ motivo: "pedido por la cola cola-269" })).toBe("pedido por la cola cola-269");
    });

    it("sin motivo (o vacío) da null, nunca una cadena fea", () => {
        expect(motivoDe({})).toBeNull();
        expect(motivoDe({ motivo: "   " })).toBeNull();
        expect(motivoDe(null)).toBeNull();
        expect(motivoDe(undefined)).toBeNull();
        expect(motivoDe({ motivo: 42 })).toBeNull();
    });
});
