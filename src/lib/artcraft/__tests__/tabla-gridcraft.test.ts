/** Pruebas del puente GridCraft ↔ tabla viva (§4.2). Solo funciones puras. */
import { describe, expect, it } from "vitest";
import { csvParaGridcraft, matrizACsv, planGridcraftDesdeTabla, rangoA1 } from "../tabla-gridcraft";
import { claveCelda, type Columna, type Tabla, type TipoColumna, type ValorCelda } from "../../vivo/tabla/modelo";

const reg = <T,>(v: T) => ({ v, t: 1, a: "a" });

interface ColDef { id: string; nombre: string; tipo: TipoColumna; formula?: string }

function tabla(cols: ColDef[], filas: number, valores: Record<string, ValorCelda> = {}): Tabla {
    const t: Tabla = { v: 1, columnas: {}, filas: {}, celdas: {} };
    cols.forEach((c, i) => {
        const col: Columna = { id: c.id, nombre: reg(c.nombre), tipo: reg(c.tipo), ancho: reg(168), orden: reg(i) };
        if (c.formula) col.formula = reg(c.formula);
        t.columnas[c.id] = col;
    });
    for (let n = 1; n <= filas; n++) {
        const id = `f_${String(n).padStart(2, "0")}`;
        t.filas[id] = { id, orden: reg(n) };
    }
    for (const [clave, valor] of Object.entries(valores)) {
        const i = clave.indexOf("|");
        t.celdas[claveCelda(clave.slice(0, i), clave.slice(i + 1))] = reg(valor);
    }
    return t;
}

const herramientas = (t: Tabla, o: Parameters<typeof planGridcraftDesdeTabla>[1]) =>
    planGridcraftDesdeTabla(t, o).llamadas.map((l) => l.herramienta);
const llamada = (t: Tabla, o: Parameters<typeof planGridcraftDesdeTabla>[1], nombre: string) =>
    planGridcraftDesdeTabla(t, o).llamadas.find((l) => l.herramienta === nombre);

describe("rangoA1", () => {
    it("una celda es A1", () => expect(rangoA1(1, 1)).toBe("A1"));
    it("la columna 26 es Z", () => expect(rangoA1(1, 26)).toBe("A1:Z1"));
    it("la columna 27 es AA", () => expect(rangoA1(1, 27)).toBe("A1:AA1"));
    it("52 columnas terminan en AZ", () => expect(rangoA1(1, 52)).toBe("A1:AZ1"));
});

describe("csvParaGridcraft", () => {
    it("escapa comas, comillas y saltos de línea", () => {
        const t = tabla([{ id: "c_a1", nombre: "Texto", tipo: "texto" }], 1, { "f_01|c_a1": 'Hola, "mundo"\ny' });
        expect(csvParaGridcraft(t)).toBe('Texto\r\n"Hola, ""mundo""\ny"\r\n');
    });
});

describe("planGridcraftDesdeTabla", () => {
    const t = tabla(
        [{ id: "c_a1", nombre: "Nombre", tipo: "texto" }, { id: "c_b1", nombre: "Edad", tipo: "numero" }],
        2,
        { "f_01|c_a1": "Ana", "f_01|c_b1": 30, "f_02|c_a1": "Luis", "f_02|c_b1": 25 },
    );

    it("con tabla y gráfica produce todas las llamadas en orden", () => {
        const o = { archivo: "personas", tabla: true, grafica: { tipo: "bar", titulo: "Edades" } };
        expect(herramientas(t, o)).toEqual(["new_workbook", "write_range", "format_range", "create_table", "insert_chart", "save_workbook"]);
        expect(llamada(t, o, "write_range")?.parametros).toEqual({ range: "A1", values: [["Nombre", "Edad"], ["Ana", "30"], ["Luis", "25"]] });
        expect(llamada(t, o, "format_range")?.parametros).toEqual({ range: "A1:B1", bold: true });
        expect(llamada(t, o, "create_table")?.parametros).toEqual({ range: "A1:B3", header: true });
        expect(llamada(t, o, "insert_chart")?.parametros).toEqual({ range: "A1:B3", type: "bar", title: "Edades" });
        expect(llamada(t, o, "save_workbook")?.parametros).toEqual({ path: "salida/personas.xlsx" });
    });

    it("sin tabla ni gráfica solo escribe, formatea y guarda", () => {
        const o = { archivo: "personas" };
        expect(herramientas(t, o)).toEqual(["new_workbook", "write_range", "format_range", "save_workbook"]);
        expect(planGridcraftDesdeTabla(t, o).avisos).toEqual([]);
    });

    it("sanea un nombre de archivo con rutas y símbolos", () => {
        const r = planGridcraftDesdeTabla(t, { archivo: "../../Hoja de Alex!" });
        expect(r.llamadas.at(-1)?.parametros).toEqual({ path: "salida/hoja-de-alex.xlsx" });
        expect(r.avisos.some((a) => /saneó/.test(a))).toBe(true);
    });

    it("avisa de la columna calculada y exporta su valor", () => {
        const c = tabla(
            [{ id: "c_a1", nombre: "Base", tipo: "numero" }, { id: "c_c1", nombre: "Doble", tipo: "calculado", formula: "[#c_a1] * 2" }],
            1,
            { "f_01|c_a1": 3 },
        );
        const r = planGridcraftDesdeTabla(c, { archivo: "calc" });
        expect(r.avisos.some((a) => /calculada/.test(a))).toBe(true);
        expect(llamada(c, { archivo: "calc" }, "write_range")?.parametros.values).toEqual([["Base", "Doble"], ["3", "6"]]);
    });

    it("avisa y protege una celda que empieza por fórmula", () => {
        const f = tabla([{ id: "c_a1", nombre: "Texto", tipo: "texto" }], 1, { "f_01|c_a1": "=SUMA(A1:A2)" });
        const r = planGridcraftDesdeTabla(f, { archivo: "formula" });
        expect(r.avisos.some((a) => /fórmula/.test(a))).toBe(true);
        expect(llamada(f, { archivo: "formula" }, "write_range")?.parametros.values).toEqual([["Texto"], ["'=SUMA(A1:A2)"]]);
    });

    it("una tabla vacía no genera escrituras", () => {
        const v = tabla([], 0);
        expect(herramientas(v, { archivo: "vacia", tabla: true, grafica: { tipo: "line" } })).toEqual(["new_workbook", "save_workbook"]);
        expect(planGridcraftDesdeTabla(v, { archivo: "vacia" }).avisos.some((a) => /vacía/.test(a))).toBe(true);
    });
});

describe("matrizACsv", () => {
    it("convierte null y booleanos sin comillas", () => {
        expect(matrizACsv([["a", null, true, false, 1.5]])).toBe("a,,Sí,No,1.5\r\n");
    });

    it("escapa comas, comillas y saltos", () => {
        expect(matrizACsv([['a,b', 'dijo "hola"', "línea\nnueva"]])).toBe('"a,b","dijo ""hola""","línea\nnueva"\r\n');
    });

    it("descarta lo no compatible con aviso", () => {
        const avisos: string[] = [];
        expect(matrizACsv([["ok", { x: 1 }, undefined, NaN]], avisos)).toBe("ok,,,\r\n");
        expect(avisos[0]).toMatch(/no compatibles/);
    });

    it("corta al superar el tope de importación", () => {
        const avisos: string[] = [];
        expect(matrizACsv([["x".repeat(4_000_001)]], avisos)).toBe("");
        expect(avisos[0]).toMatch(/tope/);
    });
});
