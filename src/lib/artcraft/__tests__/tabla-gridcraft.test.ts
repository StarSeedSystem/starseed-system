/** Pruebas GridCraft ↔ tabla viva. Solo funciones puras. */
import { describe, expect, it } from "vitest";
import { csvParaGridcraft, matrizACsv, planGridcraftDesdeTabla, rangoA1 } from "../tabla-gridcraft";
import { tablaInicial } from "../../vivo/tabla/operaciones";
import { autorCorto } from "../../vivo/tabla/modelo";
import { aplicarCeldas, anadirColumna } from "../../vivo/tabla/operaciones";

function ctx() {
  const now = 1700000000000;
  return { t: now, a: autorCorto("u1") };
}

describe("rangoA1", () => {
  it("bordes", () => {
    expect(rangoA1(1, 1)).toBe("A1");
    expect(rangoA1(1, 26)).toBe("Z1");
    expect(rangoA1(1, 27)).toBe("AA1");
    expect(rangoA1(1, 52)).toBe("AZ1"); // AZ es 52
  });
});

describe("csvParaGridcraft", () => {
  it("usa separador coma vía csvDesdeTabla", () => {
    let t = tablaInicial(ctx());
    const r = anadirColumna(t, ctx(), { nombre: "Nombre", tipo: "texto" });
    t = r.tabla;
    const colId = r.colId!;
    const c = aplicarCeldas(t, [{ filaId: Object.keys(t.filas)[0], colId, valor: "Ana, con coma" }], ctx());
    const s = csvParaGridcraft(c);
    expect(s).toContain('"Ana, con coma"');
  });
});

describe("matrizACsv", () => {
  it("escapa comillas y saltos", () => {
    const s = matrizACsv([["a\"b", "c\nd"]]);
    expect(s).toContain('a""b');
    expect(s).toContain('"c\nd"');
  });
  it("valores null y booleanos", () => {
    const s = matrizACsv([[null, false, true, 123]]);
    expect(s).toContain("FALSE");
    expect(s).toContain("TRUE");
    expect(s).toContain("123");
  });
  it("tope MAX_BYTES_IMPORTAR", () => {
    // crear matriz grande
    const fila = Array(100).fill("x".repeat(1000));
    const filas = Array(50).fill(fila);
    const s = matrizACsv(filas);
    expect(Buffer.byteLength(s, "utf8")).toBeLessThanOrEqual(4000005);
  });
});

describe("planGridcraftDesdeTabla", () => {
  it("plan con y sin tabla ni grafica", () => {
    let t = tablaInicial(ctx());
    const r1 = anadirColumna(t, ctx(), { nombre: "A", tipo: "texto" });
    t = r1.tabla;
    const p1 = planGridcraftDesdeTabla(t, { archivo: "mi-tabla" });
    expect(p1.llamadas[0].herramienta).toBe("new_workbook");
    expect(p1.llamadas.some((x) => x.herramienta === "write_range")).toBe(true);
    expect(p1.llamadas.some((x) => x.herramienta === "create_table")).toBe(false);
    expect(p1.llamadas.some((x) => x.herramienta === "insert_chart")).toBe(false);

    const p2 = planGridcraftDesdeTabla(t, { archivo: "mi-tabla", tabla: true, grafica: { tipo: "bar", titulo: "T" } });
    expect(p2.llamadas.some((x) => x.herramienta === "create_table")).toBe(true);
    expect(p2.llamadas.some((x) => x.herramienta === "insert_chart")).toBe(true);
    const save = p2.llamadas.find((x) => x.herramienta === "save_workbook");
    expect(save?.parametros.path).toBe("salida/mi-tabla.xlsx");
  });
  it("archivo con nombre malo saneado", () => {
    let t = tablaInicial(ctx());
    const p = planGridcraftDesdeTabla(t, { archivo: "../MAL/Nombre Con Espacios!.XLSX" });
    const save = p.llamadas.find((x) => x.herramienta === "save_workbook")!;
    const path = save.parametros.path as string;
    expect(path).toMatch(/^salida\/[a-z0-9\-_]+\.xlsx$/);
  });
  it("columna calculada avisa", () => {
    let t = tablaInicial(ctx());
    // añadir columna calculada si existe función - mirar operaciones
    const { anadirColumnaCalculada } = await import("../../vivo/tabla/operaciones");
    const r = anadirColumnaCalculada(t, ctx(), { nombre: "Calc", formula: "=A1+1" });
    t = r.tabla;
    const p = planGridcraftDesdeTabla(t, { archivo: "x" });
    expect(p.avisos.some((a) => a.includes("calculada"))).toBe(true);
  });
  it("tabla vacía no genera llamadas de escritura?", () => {
    let t = tablaInicial(ctx());
    // quitar filas/columnas? tablaInicial tiene estructura base; pero contrato dice "tabla vacía no genera llamadas de escritura" - test dice eso explícitamente
    const p = planGridcraftDesdeTabla({ ...t, filas: {}, columnas: {} } as any, { archivo: "vacia" });
    // si no hay filas/columnas visibles, matriz solo encabezados? o vacía
    const writes = p.llamadas.filter((x) => x.herramienta === "write_range");
    // según requisito: "tabla vacía no genera llamadas de escritura" - ajustar
    expect(writes.length).toBe(0);
  });
});
