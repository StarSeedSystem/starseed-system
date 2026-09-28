/**
 * El modelo del editor: cada bloque de cada plantilla sobrevive a ida y vuelta por el borrador (lo
 * que la persona ve y edita) y lo que sale se valida con las reglas del motor, no con otras.
 */
import { describe, expect, test } from "vitest";
import { sanearBloque } from "@/lib/vivo/programas/esquema";
import { PLANTILLAS_PROGRAMA } from "@/lib/vivo/programas/plantillas";
import { TIPOS_BLOQUE_PROG } from "@/lib/vivo/programas/tipos";
import { bloqueDeBorrador, borradorDeBloque, borradorNuevo, idBloqueNuevo, siguienteId, type BorradorBloque } from "../editor-modelo";

type BorradorContador = Extract<BorradorBloque, { tipo: "contador" }>;
const nuevoContador = (id: string): BorradorContador => borradorNuevo("contador", id) as BorradorContador;

describe("ida y vuelta por el borrador", () => {
    test("todos los bloques de todas las plantillas vuelven igual (salvo su semilla)", () => {
        let visto = 0;
        for (const t of PLANTILLAS_PROGRAMA) {
            for (const b of t.bloques()) {
                const original = sanearBloque(b).bloque!;
                const vuelta = sanearBloque(bloqueDeBorrador(borradorDeBloque(original))).bloque;
                expect(vuelta, `${t.id}/${b.id}`).toEqual(original);
                visto += 1;
            }
        }
        expect(visto).toBeGreaterThan(8);
    });

    test("el contador recuerda su modo: libre, un voto o un límite por persona", () => {
        const c = (porPersona: number | null) =>
            borradorDeBloque({ id: "c", tipo: "contador", titulo: "t", inicial: 0, paso: 1, min: null, max: null, unidad: "", porPersona });
        expect(c(null)).toMatchObject({ modo: "libre" });
        expect(c(1)).toMatchObject({ modo: "voto" });
        expect(c(5)).toMatchObject({ modo: "limite", limite: "5" });
        expect(bloqueDeBorrador({ ...nuevoContador("c"), modo: "limite", limite: "4" })).toMatchObject({ porPersona: 4 });
        expect(bloqueDeBorrador({ ...nuevoContador("c"), modo: "voto" })).toMatchObject({ porPersona: 1 });
    });
});

describe("borradores nuevos", () => {
    test("cada tipo nace con algo razonable; los que necesitan contenido no pasan hasta rellenarlos", () => {
        for (const tipo of TIPOS_BLOQUE_PROG) {
            const r = sanearBloque(bloqueDeBorrador(borradorNuevo(tipo, "x1")), { semillas: true });
            if (tipo === "titulo" || tipo === "texto" || tipo === "encuesta") expect(r.bloque, tipo).toBeNull();
            else expect(r.bloque, `${tipo}: ${r.problemas.join(" · ")}`).not.toBeNull();
        }
    });

    test("números mal escritos se rechazan con su motivo, y las comas decimales se aceptan", () => {
        const b = { ...nuevoContador("c"), min: "abc" };
        const r = sanearBloque(bloqueDeBorrador(b));
        expect(r.bloque).toBeNull();
        expect(r.problemas[0]).toMatch(/mínimo del contador/);
        const f = { ...borradorNuevo("formulario", "f"), cupo: "12" };
        expect(sanearBloque(bloqueDeBorrador(f)).bloque).toMatchObject({ cupo: 12 });
    });

    test("las semillas de tareas se leen una por línea, sin líneas vacías", () => {
        const b = { ...borradorNuevo("tareas", "t"), iniciales: "uno\n\n  dos  \n" };
        expect(sanearBloque(bloqueDeBorrador(b), { semillas: true }).bloque).toMatchObject({ iniciales: ["uno", "dos"] });
    });
});

describe("identificadores", () => {
    test("idBloqueNuevo cumple el patrón y no choca con los existentes", () => {
        const ids: string[] = [];
        for (let i = 0; i < 50; i++) {
            const id = idBloqueNuevo(ids);
            expect(id).toMatch(/^[a-z0-9][a-z0-9_-]{0,23}$/i);
            expect(ids).not.toContain(id);
            ids.push(id);
        }
        // con el azar bloqueado en un valor que ya existe, sigue dando uno nuevo
        const fijo = idBloqueNuevo([], () => 0.5);
        expect(idBloqueNuevo([fijo], () => 0.5)).not.toBe(fijo);
    });

    test("siguienteId salta los ya usados", () => {
        expect(siguienteId("o", ["o1", "o2"])).toBe("o3");
        expect(siguienteId("o", ["o1", "o3"])).toBe("o4"); // longitud 2 → prueba o3 (ocupado) → o4
        expect(siguienteId("c", [])).toBe("c1");
    });
});
