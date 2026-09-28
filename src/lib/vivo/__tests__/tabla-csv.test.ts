/**
 * CSV y portapapeles de la tabla: lectura RFC 4180, ida y vuelta sin pérdidas, protección contra
 * fórmulas de hoja de cálculo y copia/pega de rangos (TSV).
 */
import { describe, expect, test } from "vitest";
import {
    csvDesdeTabla,
    detectarDelimitador,
    importarCsv,
    inferirTipo,
    matrizDesdeTsv,
    parseCsv,
    tsvDesdeRango,
    MAX_BYTES_IMPORTAR,
} from "@/lib/vivo/tabla/csv";
import { columnasVisibles, enlaceSeguro, filasVisibles, opcionesOrdenadas, tablaVacia, valorCelda, type Ctx, type Tabla } from "@/lib/vivo/tabla/modelo";
import {
    anadirColumna,
    anadirFilasAlFinal,
    anadirOpcion,
    aplicarCeldas,
    aplicarPegado,
    establecerFormula,
} from "@/lib/vivo/tabla/operaciones";
import { columnasCitables, compilarFormula } from "@/lib/vivo/tabla/formulas";

let reloj = 5000;
const C = (): Ctx => ({ t: reloj++, a: "ana000000000" });

function tablaCompleta() {
    let t = tablaVacia();
    const id: Record<string, string> = {};
    for (const [k, nombre, tipo] of [
        ["nom", "Nombre", "texto"],
        ["cant", "Cantidad", "numero"],
        ["fec", "Fecha", "fecha"],
        ["ok", "Hecho", "casilla"],
        ["est", "Estado", "seleccion"],
        ["url", "Enlace", "enlace"],
    ] as const) {
        const r = anadirColumna(t, C(), { nombre, tipo });
        t = r.tabla;
        id[k] = r.colId!;
    }
    const a = anadirOpcion(t, id.est, "En curso", C());
    const b = anadirOpcion(a.tabla, id.est, "Hecho", C());
    t = b.tabla;
    const f = anadirFilasAlFinal(t, 4, C());
    t = f.tabla;
    const [f0, f1, f2, f3] = f.filaIds;
    t = aplicarCeldas(
        t,
        [
            { filaId: f0, colId: id.nom, valor: 'Ana "la jefa", S.L.' },
            { filaId: f0, colId: id.cant, valor: 1234.5 },
            { filaId: f0, colId: id.fec, valor: "2026-09-28" },
            { filaId: f0, colId: id.ok, valor: true },
            { filaId: f0, colId: id.est, valor: a.opcionId! },
            { filaId: f0, colId: id.url, valor: "https://starseed.example/a?b=1&c=2" },
            { filaId: f1, colId: id.nom, valor: "Línea 1\nLínea 2" },
            { filaId: f1, colId: id.cant, valor: -3 },
            { filaId: f1, colId: id.ok, valor: false },
            { filaId: f1, colId: id.est, valor: b.opcionId! },
            { filaId: f2, colId: id.nom, valor: "=SUMA(A1:A9)" },
            { filaId: f2, colId: id.cant, valor: 0.25 },
            { filaId: f2, colId: id.est, valor: a.opcionId! },
            { filaId: f3, colId: id.est, valor: b.opcionId! },
        ],
        C(),
    );
    return { t, id, filas: f.filaIds };
}

function comparar(a: Tabla, b: Tabla) {
    const ca = columnasVisibles(a);
    const cb = columnasVisibles(b);
    expect(cb.map((c) => [c.nombre.v, c.tipo.v])).toEqual(ca.map((c) => [c.nombre.v, c.tipo.v]));
    const fa = filasVisibles(a);
    const fb = filasVisibles(b);
    expect(fb).toHaveLength(fa.length);
    fa.forEach((f, i) => {
        ca.forEach((c, j) => {
            const va = valorCelda(a, f.id, c.id);
            const vb = valorCelda(b, fb[i].id, cb[j].id);
            if (c.tipo.v === "seleccion") {
                const na = va ? opcionesOrdenadas(c).find((o) => o.id === va)?.nombre : null;
                const nb = vb ? opcionesOrdenadas(cb[j]).find((o) => o.id === vb)?.nombre : null;
                expect(nb).toBe(na);
            } else {
                expect(vb).toEqual(va);
            }
        });
    });
}

describe("lectura CSV (RFC 4180)", () => {
    test("comillas, comas y saltos de línea dentro de un campo, comillas dobles escapadas", () => {
        const csv = 'a,b,c\r\n"x, y","di ""hola""","l1\nl2"\r\n1,,3\r\n';
        expect(parseCsv(csv)).toEqual([["a", "b", "c"], ["x, y", 'di "hola"', "l1\nl2"], ["1", "", "3"]]);
    });

    test("BOM inicial, saltos \\r\\n y \\r, sin línea final", () => {
        expect(parseCsv("﻿a;b\r1;2\r\n3;4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    });

    test("detecta el delimitador fuera de comillas", () => {
        expect(detectarDelimitador("a;b;c\n1;2;3")).toBe(";");
        expect(detectarDelimitador("a\tb\tc")).toBe("\t");
        expect(detectarDelimitador('"a;b",c,d\n')).toBe(",");
        expect(detectarDelimitador("solo")).toBe(",");
    });

    test("no revienta con entradas raras", () => {
        expect(parseCsv("")).toEqual([]);
        expect(parseCsv('"sin cerrar,1\n2')).toEqual([["sin cerrar,1\n2"]]);
        expect(parseCsv("\n\n")).toHaveLength(2);
        expect(matrizDesdeTsv("")).toEqual([[""]]);
    });
});

describe("deducción de tipo por columna", () => {
    test("casilla, fecha, enlace, número, selección y texto", () => {
        expect(inferirTipo(["Sí", "no", "", "SI"])).toBe("casilla");
        expect(inferirTipo(["2026-09-28", "01/02/2026"])).toBe("fecha");
        expect(inferirTipo(["https://a.org", "http://b.org/x"])).toBe("enlace");
        expect(inferirTipo(["1", "2,5", "1.234,5", ""])).toBe("numero");
        expect(inferirTipo(["007", "008"])).not.toBe("numero"); // ceros a la izquierda: son códigos, no cantidades
        expect(inferirTipo(["12345678901234567890"])).not.toBe("numero"); // no cabe en un double sin perder dígitos
        expect(inferirTipo(["rojo", "verde", "rojo", "verde", "Rojo"])).toBe("seleccion");
        expect(inferirTipo(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"])).toBe("texto");
        expect(inferirTipo(["", " "])).toBe("texto");
    });
});

describe("ida y vuelta (exportar → importar)", () => {
    test("con comas: texto con comillas y saltos, números, fechas, casillas, selección y enlaces", () => {
        const { t } = tablaCompleta();
        const csv = csvDesdeTabla(t);
        const r = importarCsv(tablaVacia(), csv, C());
        expect(r.avisos).toEqual([]);
        expect(r.filasAnadidas).toBe(4);
        expect(r.columnasNuevas).toBe(6);
        comparar(t, r.tabla);
    });

    test("con punto y coma (Excel en español): los decimales viajan con coma", () => {
        const { t, id, filas } = tablaCompleta();
        const csv = csvDesdeTabla(t, { separador: ";" });
        expect(csv.split("\r\n")[1]).toContain("1234,5");
        const r = importarCsv(tablaVacia(), csv, C());
        comparar(t, r.tabla);
        expect(valorCelda(r.tabla, filasVisibles(r.tabla)[0].id, columnasVisibles(r.tabla)[1].id)).toBe(1234.5);
        expect(id.cant && filas.length).toBeTruthy();
    });

    test("un texto que empieza por = + - @ se protege al exportar y se restaura al importar", () => {
        const { t } = tablaCompleta();
        const csv = csvDesdeTabla(t);
        expect(csv).toContain("'=SUMA(A1:A9)");
        expect(csv).not.toMatch(/(^|,)=SUMA/m);
        const r = importarCsv(tablaVacia(), csv, C());
        const nombres = filasVisibles(r.tabla).map((f) => valorCelda(r.tabla, f.id, columnasVisibles(r.tabla)[0].id));
        expect(nombres[2]).toBe("=SUMA(A1:A9)");
        // los números negativos NO se protegen (no son texto)
        expect(csv).toContain(",-3,");
    });

    test("importar sobre una tabla con las mismas columnas las reutiliza y añade las filas al final", () => {
        const { t } = tablaCompleta();
        const r = importarCsv(t, csvDesdeTabla(t), C());
        expect(r.columnasNuevas).toBe(0);
        expect(r.filasAnadidas).toBe(4);
        expect(filasVisibles(r.tabla)).toHaveLength(8);
        expect(columnasVisibles(r.tabla)).toHaveLength(6);
        // reutilizar la columna Estado no duplica sus opciones
        const est = columnasVisibles(r.tabla).find((c) => c.nombre.v === "Estado")!;
        expect(opcionesOrdenadas(est).map((o) => o.nombre)).toEqual(["En curso", "Hecho"]);
    });

    test("las columnas calculadas se exportan con su resultado y no se importan como fórmula", () => {
        const { t, id } = tablaCompleta();
        const k = anadirColumna(t, C(), { nombre: "Doble", tipo: "calculado" });
        const f = compilarFormula("[Cantidad] * 2", columnasCitables(k.tabla, k.colId!), k.colId!);
        expect(f.ok).toBe(true);
        const t2 = establecerFormula(k.tabla, k.colId!, f.ok ? f.almacenada : "", C());
        const csv = csvDesdeTabla(t2);
        const lineas = csv.trim().split("\r\n");
        expect(lineas[0].endsWith(",Doble")).toBe(true);
        expect(lineas[1].endsWith(",2469")).toBe(true);
        expect(lineas[2].endsWith(",-6")).toBe(true);
        const r = importarCsv(tablaVacia(), csv, C());
        const doble = columnasVisibles(r.tabla).find((c) => c.nombre.v === "Doble")!;
        expect(doble.tipo.v).toBe("numero"); // llega como dato, no como fórmula
        expect(id.cant).toBeTruthy();
    });

    test("nombres de columna raros: se sanean y las cabeceras protegidas se restauran", () => {
        const r = importarCsv(tablaVacia(), "'=Total,[x] y [y],\n1,2,3\n", C());
        expect(columnasVisibles(r.tabla).map((c) => c.nombre.v)).toEqual(["=Total", "(x) y (y)", "Columna 3"]);
    });
});

describe("límites y entradas hostiles al importar", () => {
    test("archivo vacío, demasiado grande y con celdas que no encajan", () => {
        expect(importarCsv(tablaVacia(), "", C()).avisos[0]).toMatch(/vac[ií]o/i);
        expect(importarCsv(tablaVacia(), "a".repeat(MAX_BYTES_IMPORTAR + 1), C()).avisos[0]).toMatch(/demasiado grande/i);
        const base = importarCsv(tablaVacia(), "Cant\n1\n2\n", C()).tabla;
        const r = importarCsv(base, "Cant\nabc\n3\n", C());
        expect(r.avisos.join(" ")).toMatch(/1 celda/);
        expect(r.filasAnadidas).toBe(2);
    });

    test("HTML y javascript: llegan como texto inerte; nunca se convierten en enlace pulsable", () => {
        const c1 = anadirColumna(tablaVacia(), C(), { nombre: "Web", tipo: "enlace" });
        const r = importarCsv(c1.tabla, "Web\nhttps://ok.example\njavascript:alert(1)\n<img src=x onerror=alert(1)>\n", C());
        const web = columnasVisibles(r.tabla)[0];
        const vals = filasVisibles(r.tabla).map((f) => valorCelda(r.tabla, f.id, web.id) as string);
        expect(vals).toEqual(["https://ok.example", "javascript:alert(1)", "<img src=x onerror=alert(1)>"]);
        // la interfaz solo pinta un <a href> cuando enlaceSeguro lo acepta; lo demás es texto plano
        expect(vals.map((v) => enlaceSeguro(v))).toEqual(["https://ok.example/", null, null]);
    });

    test("más filas que el máximo: se corta y se avisa", () => {
        const filas = Array.from({ length: 3005 }, (_, i) => `f${i}`).join("\n");
        const r = importarCsv(tablaVacia(), `Nombre\n${filas}`, C());
        expect(r.filasAnadidas).toBe(3000);
        expect(r.avisos.join(" ")).toMatch(/3000/);
    });
});

describe("copiar y pegar rangos (TSV)", () => {
    test("copiar un rango y pegarlo en otro sitio lo reproduce", () => {
        const { t, id, filas } = tablaCompleta();
        const cols = columnasVisibles(t).map((c) => c.id);
        const tsv = tsvDesdeRango(t, filas, cols);
        const matriz = matrizDesdeTsv(tsv);
        expect(matriz).toHaveLength(4);
        expect(matriz[0][0]).toBe('Ana "la jefa", S.L.');
        expect(matriz[1][0]).toBe("Línea 1\nLínea 2"); // el salto de línea sobrevive a las comillas
        expect(matriz[0][1]).toBe("1234,5"); // decimales en español, como espera una hoja de cálculo
        const nueva = anadirFilasAlFinal(t, 4, C());
        const r = aplicarPegado(nueva.tabla, matriz, { filaIds: nueva.filaIds, desdeFila: 0, colIds: cols, desdeCol: 0 }, C());
        expect(r.omitidas).toBe(0);
        const idsNuevas = filasVisibles(r.tabla).slice(4).map((f) => f.id);
        filas.forEach((f, i) => {
            for (const c of [id.nom, id.cant, id.fec, id.ok, id.url]) {
                expect(valorCelda(r.tabla, idsNuevas[i], c)).toEqual(valorCelda(t, f, c));
            }
            expect(valorCelda(r.tabla, idsNuevas[i], id.est)).toEqual(valorCelda(t, f, id.est)); // mismas opciones por nombre
        });
    });

    test("pegar desde una hoja de cálculo externa (TSV con \\r\\n y línea final)", () => {
        const m = matrizDesdeTsv("a\t1\r\nb\t2\r\n");
        expect(m).toEqual([["a", "1"], ["b", "2"]]);
        expect(matrizDesdeTsv("solo una celda")).toEqual([["solo una celda"]]);
    });
});
