/** Pruebas de `tabla-gridcraft.ts` (contrato `architecture/artcraft-y-rare.md` §4.2). Solo funciones puras. */
import { describe, expect, it } from "vitest";
import { csvParaGridcraft, letraA1, matrizACsv, planGridcraftDesdeTabla, rangoA1 } from "../tabla-gridcraft";
import { LIMITES, claveCelda, reg, tablaVacia, type Columna, type Ctx, type Fila, type Tabla, type TipoColumna } from "../../vivo/tabla/modelo";

const c: Ctx = { t: 1, a: "prueba" };

function col(id: string, nombre: string, tipo: TipoColumna = "texto", orden = 1, formula?: string): Columna {
  const base: Columna = { id, nombre: reg(nombre, c), tipo: reg(tipo, c), ancho: reg(LIMITES.anchoDefecto, c), orden: reg(orden, c) };
  if (formula) base.formula = reg(formula, c);
  return base;
}
function fila(id: string, orden: number): Fila {
  return { id, orden: reg(orden, c) };
}

/** Tabla con «Nombre» (texto) e «Importe» (número): una fila, «a,b» y 5. */
function tablaPrueba(): Tabla {
  const t = tablaVacia();
  t.columnas["c_a"] = col("c_a", "Nombre");
  t.columnas["c_b"] = col("c_b", "Importe", "numero", 2);
  t.filas["f_1"] = fila("f_1", 1);
  t.celdas[claveCelda("f_1", "c_a")] = reg("a,b", c);
  t.celdas[claveCelda("f_1", "c_b")] = reg(5, c);
  return t;
}

describe("rangoA1 y letraA1 en los bordes", () => {
  it("una columna y una fila dan A1:A1", () => {
    expect(letraA1(1)).toBe("A");
    expect(rangoA1(1, 1)).toBe("A1:A1");
  });
  it("la columna 26 es Z y la 27 ya es AA", () => {
    expect(letraA1(26)).toBe("Z");
    expect(rangoA1(1, 27)).toBe("A1:AA1");
  });
  it("52 columnas llegan a AZ y 53 a BA", () => {
    expect(letraA1(52)).toBe("AZ");
    expect(letraA1(53)).toBe("BA");
    expect(rangoA1(3, 52)).toBe("A1:AZ3");
  });
});

describe("csvParaGridcraft", () => {
  it("sale con comas: títulos y una fila con la coma del texto entre comillas", () => {
    const csv = csvParaGridcraft(tablaPrueba());
    expect(csv.startsWith("Nombre,Importe\r\n")).toBe(true);
    expect(csv).toContain('"a,b",5\r\n');
  });
  it("escapa comillas dobles y saltos de línea", () => {
    const t = tablaVacia();
    t.columnas["c_a"] = col("c_a", "Dicho");
    t.filas["f_1"] = fila("f_1", 1);
    t.celdas[claveCelda("f_1", "c_a")] = reg('dice "hola"\nadiós', c);
    const csv = csvParaGridcraft(t);
    expect(csv).toContain('"dice ""hola""\nadiós"');
  });
});

describe("matrizACsv", () => {
  it("null queda vacío y los booleanos y números salen tal cual", () => {
    expect(matrizACsv([[null, true, false, 7]])).toBe(",true,false,7\r\n");
  });
  it("escapa comas, comillas y saltos dentro del valor", () => {
    expect(matrizACsv([["a,b"], ['x "y"']])).toBe('"a,b"\r\n"x ""y"""\r\n');
    expect(matrizACsv([["dos\nlíneas"]])).toBe('"dos\nlíneas"\r\n');
  });
  it("el texto con forma de fórmula viaja con apóstrofo delante", () => {
    expect(matrizACsv([["=1+1"]])).toBe("'=1+1\r\n");
  });
  it("una matriz vacía no produce nada", () => {
    expect(matrizACsv([])).toBe("");
  });
});

describe("planGridcraftDesdeTabla", () => {
  it("sin tabla ni gráfica: libro, bloque, encabezado en negrita y guardado, en ese orden", () => {
    const p = planGridcraftDesdeTabla(tablaPrueba(), { archivo: "datos" });
    expect(p.llamadas.map((l) => l.herramienta)).toEqual(["new_workbook", "write_range", "format_range", "save_workbook"]);
    const bloque = p.llamadas[1];
    expect(bloque.parametros["range"]).toBe("A1");
    expect(bloque.parametros["values"]).toEqual([["Nombre", "Importe"], ["a,b", 5]]);
    expect(p.llamadas[2].parametros).toEqual({ range: "A1:B1", bold: true });
    expect(p.llamadas[3].parametros).toEqual({ path: "salida/datos.xlsx" });
    expect(p.avisos).toEqual([]);
  });
  it("con tabla y gráfica se suman create_table e insert_chart tras el encabezado", () => {
    const p = planGridcraftDesdeTabla(tablaPrueba(), { archivo: "datos", tabla: true, grafica: { tipo: "linea", titulo: "Ventas" } });
    expect(p.llamadas.map((l) => l.herramienta)).toEqual([
      "new_workbook", "write_range", "format_range", "create_table", "insert_chart", "save_workbook",
    ]);
    expect(p.llamadas[3].parametros).toEqual({ range: "A1:B2", header: true });
    expect(p.llamadas[4].parametros).toEqual({ range: "A1:B2", type: "linea", title: "Ventas" });
  });
  it("sin título la gráfica no lleva la clave title", () => {
    const p = planGridcraftDesdeTabla(tablaPrueba(), { archivo: "datos", grafica: { tipo: "barra" } });
    expect(p.llamadas[3].parametros).toEqual({ range: "A1:B2", type: "barra" });
  });
  it("encabezadoNegrita a false quita el format_range", () => {
    const p = planGridcraftDesdeTabla(tablaPrueba(), { archivo: "datos", encabezadoNegrita: false });
    expect(p.llamadas.map((l) => l.herramienta)).toEqual(["new_workbook", "write_range", "save_workbook"]);
  });
  it("un archivo con mal nombre se sanea y se avisa", () => {
    const p = planGridcraftDesdeTabla(tablaPrueba(), { archivo: " Informe $.xlsx " });
    const guardado = p.llamadas.at(-1);
    expect(guardado?.parametros["path"]).toBe("salida/informe.xlsx");
    expect(p.avisos.some((a) => a.includes("informe"))).toBe(true);
  });
  it("una columna calculada se exporta con su valor y avisa", () => {
    const t = tablaPrueba();
    t.columnas["c_c"] = col("c_c", "Doble", "calculado", 3, "[#c_b] * 2");
    const p = planGridcraftDesdeTabla(t, { archivo: "datos" });
    expect(p.avisos.some((a) => a.includes("calculadas"))).toBe(true);
    const matriz = p.llamadas[1].parametros["values"] as unknown[][];
    expect(matriz[0]).toEqual(["Nombre", "Importe", "Doble"]);
    expect(matriz[1]).toEqual(["a,b", 5, 10]);
    expect(p.llamadas[2].parametros["range"]).toBe("A1:C1");
  });
  it("la tabla vacía no genera llamadas de escritura, solo el aviso", () => {
    const p = planGridcraftDesdeTabla(tablaVacia(), { archivo: "datos", tabla: true });
    expect(p.llamadas).toEqual([]);
    expect(p.avisos.length).toBeGreaterThanOrEqual(1);
  });
  it("pasarse del tope de columnas recorta y avisa", () => {
    const t = tablaVacia();
    for (let i = 0; i < LIMITES.columnas + 2; i++) t.columnas[`c_${i}`] = col(`c_${i}`, `Col${i}`, "texto", i);
    t.filas["f_1"] = fila("f_1", 1);
    const p = planGridcraftDesdeTabla(t, { archivo: "datos" });
    const matriz = p.llamadas[1].parametros["values"] as unknown[][];
    expect(matriz[0].length).toBe(LIMITES.columnas);
    expect(p.avisos.some((a) => a.includes("2 columnas"))).toBe(true);
  });
});
