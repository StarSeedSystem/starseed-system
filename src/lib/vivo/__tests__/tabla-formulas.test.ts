/**
 * Fórmulas de «Calculado»: el evaluador propio acepta SOLO su gramática (números, + − * /,
 * paréntesis, [columnas] y SUMA/PROMEDIO/MIN/MAX/CONTAR) y rechaza todo lo demás.
 */
import { describe, expect, test } from "vitest";
import {
    columnasUsadas,
    compilarFormula,
    crearCalculadora,
    mostrarFormula,
    textoCalculado,
    type ColumnaRef,
} from "@/lib/vivo/tabla/formulas";
import { claveCelda, filasVisibles, tablaVacia, type Ctx, type Tabla } from "@/lib/vivo/tabla/modelo";
import {
    anadirColumna,
    anadirFilasAlFinal,
    aplicarCeldas,
    establecerFormula,
    renombrarColumna,
} from "@/lib/vivo/tabla/operaciones";

const C: Ctx = { t: 1000, a: "ana" };

interface Armado {
    t: Tabla;
    precio: string;
    cant: string;
    total: string;
    filas: string[];
}

/** Precio · Cantidad · Total (calculado) con 3 filas: 10×2, 5×3, (vacío)×4. */
function armar(): Armado {
    let t = tablaVacia();
    const precio = anadirColumna(t, C, { nombre: "Precio", tipo: "numero" });
    t = precio.tabla;
    const cant = anadirColumna(t, C, { nombre: "Cantidad", tipo: "numero" });
    t = cant.tabla;
    const total = anadirColumna(t, C, { nombre: "Total", tipo: "calculado" });
    t = total.tabla;
    const f = anadirFilasAlFinal(t, 3, C);
    t = f.tabla;
    t = aplicarCeldas(
        t,
        [
            { filaId: f.filaIds[0], colId: precio.colId!, valor: 10 },
            { filaId: f.filaIds[0], colId: cant.colId!, valor: 2 },
            { filaId: f.filaIds[1], colId: precio.colId!, valor: 5 },
            { filaId: f.filaIds[1], colId: cant.colId!, valor: 3 },
            { filaId: f.filaIds[2], colId: cant.colId!, valor: 4 },
        ],
        C,
    );
    return { t, precio: precio.colId!, cant: cant.colId!, total: total.colId!, filas: f.filaIds };
}

function refs(t: Tabla): ColumnaRef[] {
    return Object.values(t.columnas).map((c) => ({ id: c.id, nombre: c.nombre.v }));
}

function conFormula(a: Armado, texto: string): Tabla {
    const r = compilarFormula(texto, refs(a.t), a.total);
    if (!r.ok) throw new Error(r.error);
    return establecerFormula(a.t, a.total, r.almacenada, C);
}

function valores(t: Tabla, colId: string): string[] {
    const calc = crearCalculadora(t);
    return filasVisibles(t).map((f) => {
        const v = calc.calculada(f.id, colId);
        return v ? textoCalculado(v) : "";
    });
}

describe("fórmulas · operaciones entre celdas de la misma fila", () => {
    test("multiplicación, suma, resta y precedencia", () => {
        const a = armar();
        expect(valores(conFormula(a, "[Precio] * [Cantidad]"), a.total)).toEqual(["20", "15", "0"]);
        expect(valores(conFormula(a, "[Precio] + [Cantidad] * 2"), a.total)).toEqual(["14", "11", "8"]);
        expect(valores(conFormula(a, "([Precio] + [Cantidad]) * 2"), a.total)).toEqual(["24", "16", "8"]);
        expect(valores(conFormula(a, "[Precio] - [Cantidad] - 1"), a.total)).toEqual(["7", "1", "-5"]);
        expect(valores(conFormula(a, "-[Precio] + 3"), a.total)).toEqual(["-7", "-2", "3"]);
    });

    test("división, decimales con coma o punto y división entre cero", () => {
        const a = armar();
        expect(valores(conFormula(a, "[Precio] / [Cantidad]"), a.total)).toEqual(["5", "1,666667", "0"]);
        expect(valores(conFormula(a, "[Cantidad] / [Precio]"), a.total)).toEqual(["0,2", "0,6", "#DIV/0"]);
        expect(valores(conFormula(a, "[Precio] * 0,5"), a.total)).toEqual(["5", "2,5", "0"]);
        expect(valores(conFormula(a, "[Precio] * 0.5"), a.total)).toEqual(["5", "2,5", "0"]);
    });

    test("celda vacía cuenta como cero; texto en aritmética da #VALOR", () => {
        const a = armar();
        const t = aplicarCeldas(
            anadirColumna(a.t, C, { nombre: "Notas", tipo: "texto" }).tabla,
            [],
            C,
        );
        const notas = Object.values(t.columnas).find((c) => c.nombre.v === "Notas")!.id;
        const t2 = aplicarCeldas(t, [{ filaId: a.filas[0], colId: notas, valor: "hola" }], C);
        const r = compilarFormula("[Notas] + 1", refs(t2), a.total);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const t3 = establecerFormula(t2, a.total, r.almacenada, C);
        expect(valores(t3, a.total)).toEqual(["#VALOR", "1", "1"]);
    });

    test("los nombres no distinguen mayúsculas ni tildes", () => {
        const a = armar();
        const t = renombrarColumna(a.t, a.cant, "Cantidád Total", C);
        const r = compilarFormula("[cantidad total] * 2", refs(t), a.total);
        expect(r.ok).toBe(true);
    });
});

describe("fórmulas · agregados sobre una columna", () => {
    test("SUMA, PROMEDIO, MIN, MAX y CONTAR", () => {
        const a = armar();
        const calc = crearCalculadora(a.t);
        expect(calc.agregar(a.precio, "SUMA")).toEqual({ ok: true, n: 15 });
        expect(calc.agregar(a.precio, "PROMEDIO")).toEqual({ ok: true, n: 7.5 });
        expect(calc.agregar(a.precio, "MIN")).toEqual({ ok: true, n: 5 });
        expect(calc.agregar(a.precio, "MAX")).toEqual({ ok: true, n: 10 });
        expect(calc.agregar(a.precio, "CONTAR")).toEqual({ ok: true, n: 2 });
        expect(calc.agregar(a.cant, "CONTAR")).toEqual({ ok: true, n: 3 });
    });

    test("un agregado dentro de una fórmula de fila", () => {
        const a = armar();
        expect(valores(conFormula(a, "[Precio] / SUMA([Precio]) * 100"), a.total)).toEqual(["66,666667", "33,333333", "0"]);
        expect(valores(conFormula(a, "suma([Cantidad]) - MAX([Cantidad])"), a.total)).toEqual(["5", "5", "5"]);
    });

    test("PROMEDIO de una columna sin números es #DIV/0; MIN y MAX vacíos dan 0", () => {
        const a = armar();
        const t = anadirColumna(a.t, C, { nombre: "Nada", tipo: "numero" });
        const calc = crearCalculadora(t.tabla);
        expect(calc.agregar(t.colId!, "PROMEDIO")).toEqual({ ok: false, e: "DIV0" });
        expect(calc.agregar(t.colId!, "MIN")).toEqual({ ok: true, n: 0 });
        expect(calc.agregar(t.colId!, "MAX")).toEqual({ ok: true, n: 0 });
    });

    test("agrega solo las filas indicadas (vista filtrada)", () => {
        const a = armar();
        const calc = crearCalculadora(a.t);
        expect(calc.agregar(a.precio, "SUMA", [a.filas[1]])).toEqual({ ok: true, n: 5 });
    });

    test("columnas calculadas encadenadas y ciclos", () => {
        const a = armar();
        let t = conFormula(a, "[Precio] * [Cantidad]");
        const extra = anadirColumna(t, C, { nombre: "Doble", tipo: "calculado" });
        t = extra.tabla;
        const r = compilarFormula("[Total] * 2", refs(t), extra.colId!);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        t = establecerFormula(t, extra.colId!, r.almacenada, C);
        expect(valores(t, extra.colId!)).toEqual(["40", "30", "0"]);

        // Total ← Doble ← Total: círculo
        const c2 = compilarFormula("[Doble] + 1", refs(t), a.total);
        expect(c2.ok).toBe(true);
        if (!c2.ok) return;
        const ciclo = establecerFormula(t, a.total, c2.almacenada, C);
        expect(valores(ciclo, a.total)).toEqual(["#CICLO", "#CICLO", "#CICLO"]);
        expect(valores(ciclo, extra.colId!)).toEqual(["#CICLO", "#CICLO", "#CICLO"]);
    });

    test("una columna no puede citarse a sí misma", () => {
        const a = armar();
        const r = compilarFormula("[Total] + 1", refs(a.t), a.total);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/sí misma/);
        const s = compilarFormula("SUMA([Total])", refs(a.t), a.total);
        expect(s.ok).toBe(false);
    });
});

describe("fórmulas · todo lo que sale de la gramática se rechaza", () => {
    const a = armar();
    const rechazadas = [
        "alert(1)",
        "constructor",
        "[Precio]; [Cantidad]",
        "[Precio] ** 2",
        "[Precio] % 2",
        "[Precio] > 3",
        "[Precio] == 1",
        "SUMA(1)",
        "SUMA([Precio], [Cantidad])",
        "SUMA()",
        "SUMA [Precio]",
        "SUMA([Precio]",
        "MEDIANA([Precio])",
        "EVAL([Precio])",
        "process.exit()",
        "globalThis",
        "this",
        "1 +",
        "* 2",
        "(1 + 2",
        "1 + 2)",
        "()",
        "1 2",
        "[Precio",
        "Precio]",
        "[]",
        "[[Precio]]",
        "'a' + 'b'",
        '"a"',
        "`${1}`",
        "1; 2",
        "1,,2",
        "1e3",
        "0x10",
        "2 ^ 3",
        "[Precio] ? 1 : 2",
        "{a:1}",
        "__proto__",
        "[Precio]()",
        "-",
        "",
        "   ",
    ];
    test.each(rechazadas)("rechaza %j", (texto) => {
        const r = compilarFormula(texto, refs(a.t), a.total);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    });

    test("rechaza columnas inexistentes o repetidas, con su motivo", () => {
        const r = compilarFormula("[Inventada] + 1", refs(a.t), a.total);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/Inventada/);
        const dup = anadirColumna(a.t, C, { nombre: "precio", tipo: "numero" }).tabla;
        const d = compilarFormula("[Precio] + 1", refs(dup), a.total);
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.error).toMatch(/varias columnas/);
    });

    test("límites: demasiado larga, demasiados paréntesis, demasiados niveles", () => {
        expect(compilarFormula("1+".repeat(200) + "1", refs(a.t), a.total).ok).toBe(false);
        expect(compilarFormula("(".repeat(40) + "1" + ")".repeat(40), refs(a.t), a.total).ok).toBe(false);
        expect(compilarFormula("-".repeat(40) + "1", refs(a.t), a.total).ok).toBe(false);
    });

    test("el mensaje de error indica la posición del problema", () => {
        const r = compilarFormula("[Precio] + $", refs(a.t), a.total);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.pos).toBe(11);
    });

    test("una fórmula guardada corrupta no rompe: da #SINTAXIS", () => {
        const roto = establecerFormula(a.t, a.total, "alert(1)", C);
        expect(valores(roto, a.total)).toEqual(["#SINTAXIS", "#SINTAXIS", "#SINTAXIS"]);
    });
});

describe("fórmulas · guardar con ids y mostrar con nombres", () => {
    test("renombrar una columna no rompe la fórmula", () => {
        const a = armar();
        const t = conFormula(a, "[Precio] * [Cantidad]");
        expect(t.columnas[a.total].formula!.v).toBe(`[#${a.precio}] * [#${a.cant}]`);
        const renombrada = renombrarColumna(t, a.precio, "Coste", C);
        expect(valores(renombrada, a.total)).toEqual(["20", "15", "0"]);
        expect(mostrarFormula(renombrada.columnas[a.total].formula!.v, refs(renombrada))).toBe("[Coste] * [Cantidad]");
    });

    test("la serialización conserva el significado (paréntesis mínimos y necesarios)", () => {
        const a = armar();
        for (const f of ["([Precio] + [Cantidad]) * 2", "[Precio] - ([Cantidad] - 1)", "[Precio] / ([Cantidad] * 2)", "-([Precio] + 1)", "2 * -[Precio]"]) {
            const r = compilarFormula(f, refs(a.t), a.total);
            expect(r.ok).toBe(true);
            if (!r.ok) continue;
            const t1 = establecerFormula(a.t, a.total, r.almacenada, C);
            const mostrada = mostrarFormula(r.almacenada, refs(t1));
            const r2 = compilarFormula(mostrada, refs(t1), a.total);
            expect(r2.ok).toBe(true);
            if (r2.ok) expect(r2.almacenada).toBe(r.almacenada);
        }
    });

    test("columnasUsadas lista las columnas citadas", () => {
        const a = armar();
        const r = compilarFormula("SUMA([Precio]) / [Cantidad]", refs(a.t), a.total);
        expect(r.ok).toBe(true);
        if (r.ok) expect(columnasUsadas(r.almacenada).sort()).toEqual([a.cant, a.precio].sort());
    });

    test("si una columna citada se borra, la fórmula da #NOMBRE", () => {
        const a = armar();
        const t = conFormula(a, "[Precio] * 2");
        const sinPrecio = { ...t, columnas: { ...t.columnas, [a.precio]: { ...t.columnas[a.precio], borrada: { v: true, t: 2000, a: "ana" } } } };
        expect(valores(sinPrecio, a.total)).toEqual(["#NOMBRE", "#NOMBRE", "#NOMBRE"]);
    });
});

describe("fórmulas · fechas y casillas", () => {
    test("restar fechas da días; una casilla marcada vale 1", () => {
        let t = tablaVacia();
        const ini = anadirColumna(t, C, { nombre: "Inicio", tipo: "fecha" });
        t = ini.tabla;
        const fin = anadirColumna(t, C, { nombre: "Fin", tipo: "fecha" });
        t = fin.tabla;
        const ok = anadirColumna(t, C, { nombre: "Hecho", tipo: "casilla" });
        t = ok.tabla;
        const dias = anadirColumna(t, C, { nombre: "Días", tipo: "calculado" });
        t = dias.tabla;
        const f = anadirFilasAlFinal(t, 2, C);
        t = aplicarCeldas(
            f.tabla,
            [
                { filaId: f.filaIds[0], colId: ini.colId!, valor: "2026-09-01" },
                { filaId: f.filaIds[0], colId: fin.colId!, valor: "2026-09-28" },
                { filaId: f.filaIds[0], colId: ok.colId!, valor: true },
                { filaId: f.filaIds[1], colId: ok.colId!, valor: false },
            ],
            C,
        );
        const r = compilarFormula("[Fin] - [Inicio] + [Hecho]", Object.values(t.columnas).map((c) => ({ id: c.id, nombre: c.nombre.v })), dias.colId!);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        t = establecerFormula(t, dias.colId!, r.almacenada, C);
        expect(valores(t, dias.colId!)).toEqual(["28", "0"]);
        expect(claveCelda("f_a", "c_b")).toBe("f_a|c_b");
    });
});
