/**
 * Operaciones de la tabla: valores por tipo, filas y columnas, orden, cambio de tipo con
 * conversión, pegado de rangos, vistas por persona y deshacer/rehacer colaborativo.
 */
import { describe, expect, test } from "vitest";
import { fusionarTablas, tablasIguales } from "@/lib/vivo/tabla/fusion";
import { invertirPaso, type Paso } from "@/lib/vivo/tabla/historial";
import {
    LIMITES,
    columnasVisibles,
    fechaDesdeTexto,
    filasVisibles,
    numeroDesdeTexto,
    enlaceSeguro,
    opcionesOrdenadas,
    tablaVacia,
    valorCelda,
    type Ctx,
    type Tabla,
} from "@/lib/vivo/tabla/modelo";
import {
    anadirColumna,
    anadirFila,
    anadirFilasAlFinal,
    anadirOpcion,
    aplicarCeldas,
    aplicarPegado,
    borrarColumna,
    borrarFilas,
    cambiarTipoColumna,
    coaccionarTexto,
    duplicarFila,
    editarOpcion,
    establecerCelda,
    limpiarCeldas,
    moverColumna,
    moverFila,
    moverOpcion,
    quitarOpcion,
    renombrarColumna,
    sanearValor,
    tablaInicial,
} from "@/lib/vivo/tabla/operaciones";
import { aplicarVista, leerVista, guardarVista, limpiarVista, VISTA_VACIA } from "@/lib/vivo/tabla/vista";
import { crearCalculadora } from "@/lib/vivo/tabla/formulas";

let reloj = 1000;
const C = (): Ctx => ({ t: reloj++, a: "ana000000000" });

function tabla(tipos: ("texto" | "numero" | "fecha" | "casilla" | "seleccion" | "enlace" | "persona")[], filas = 3) {
    let t = tablaVacia();
    const cs: string[] = [];
    tipos.forEach((tipo, i) => {
        const r = anadirColumna(t, C(), { nombre: `C${i + 1}`, tipo });
        t = r.tabla;
        cs.push(r.colId!);
    });
    const f = anadirFilasAlFinal(t, filas, C());
    return { t: f.tabla, cs, fs: f.filaIds };
}

describe("valores por tipo de columna", () => {
    test("número: acepta coma y punto, rechaza texto", () => {
        const { t, cs, fs } = tabla(["numero"]);
        expect(valorCelda(establecerCelda(t, fs[0], cs[0], "12,5", C()), fs[0], cs[0])).toBe(12.5);
        expect(valorCelda(establecerCelda(t, fs[0], cs[0], "1.234,5", C()), fs[0], cs[0])).toBe(1234.5);
        expect(valorCelda(establecerCelda(t, fs[0], cs[0], "abc", C()), fs[0], cs[0])).toBeNull();
        expect(establecerCelda(t, fs[0], cs[0], "abc", C())).toBe(t); // no cambia nada
        expect(numeroDesdeTexto("1.234.567")).toBe(1234567);
        expect(numeroDesdeTexto("1,234,567")).toBe(1234567);
        expect(numeroDesdeTexto("-3")).toBe(-3);
        expect(numeroDesdeTexto("1,2,3.4")).toBeNull();
        expect(numeroDesdeTexto("1.23.456")).toBeNull();
        expect(numeroDesdeTexto("12,345.67")).toBe(12345.67);
        expect(numeroDesdeTexto("")).toBeNull();
        expect(numeroDesdeTexto("12abc")).toBeNull();
    });

    test("fecha: ISO válida o dd/mm/aaaa; fechas imposibles se rechazan", () => {
        const { t, cs, fs } = tabla(["fecha"]);
        expect(valorCelda(establecerCelda(t, fs[0], cs[0], "28/09/2026", C()), fs[0], cs[0])).toBe("2026-09-28");
        expect(valorCelda(establecerCelda(t, fs[0], cs[0], "2026-09-28", C()), fs[0], cs[0])).toBe("2026-09-28");
        expect(establecerCelda(t, fs[0], cs[0], "31/02/2026", C())).toBe(t);
        expect(fechaDesdeTexto("2026-13-01")).toBeNull();
    });

    test("casilla, selección y persona", () => {
        const { t, cs, fs } = tabla(["casilla", "seleccion", "persona"]);
        expect(valorCelda(establecerCelda(t, fs[0], cs[0], "sí", C()), fs[0], cs[0])).toBe(true);
        expect(valorCelda(establecerCelda(t, fs[0], cs[0], "no", C()), fs[0], cs[0])).toBe(false);
        expect(establecerCelda(t, fs[0], cs[0], "quizá", C())).toBe(t);
        const op = anadirOpcion(t, cs[1], "Hecho", C());
        expect(valorCelda(establecerCelda(op.tabla, fs[0], cs[1], op.opcionId!, C()), fs[0], cs[1])).toBe(op.opcionId);
        expect(establecerCelda(op.tabla, fs[0], cs[1], "o_inexistente", C())).toBe(op.tabla);
        const uid = "11111111-2222-4333-8444-555555555555";
        expect(valorCelda(establecerCelda(t, fs[0], cs[2], uid, C()), fs[0], cs[2])).toBe(uid);
        expect(establecerCelda(t, fs[0], cs[2], "Ana", C())).toBe(t);
    });

    test("escribir lo mismo no cambia la tabla (misma referencia)", () => {
        const { t, cs, fs } = tabla(["texto"]);
        const a = establecerCelda(t, fs[0], cs[0], "hola", C());
        expect(establecerCelda(a, fs[0], cs[0], "hola", C())).toBe(a);
        expect(establecerCelda(t, fs[0], cs[0], "", C())).toBe(t);
        expect(establecerCelda(t, "f_noexiste", cs[0], "x", C())).toBe(t);
    });

    test("una columna calculada no acepta valores", () => {
        let { t, fs } = tabla(["texto"]);
        const k = anadirColumna(t, C(), { tipo: "calculado" });
        t = k.tabla;
        expect(establecerCelda(t, fs[0], k.colId!, "x", C())).toBe(t);
        expect(sanearValor(t.columnas[k.colId!], 1)).toBeUndefined();
    });

    test("enlaces: solo http(s) y mailto", () => {
        expect(enlaceSeguro("https://starseed.example/a?b=1")).toBe("https://starseed.example/a?b=1");
        expect(enlaceSeguro("starseed.example")).toBe("https://starseed.example/");
        expect(enlaceSeguro("mailto:ana@example.org")).toBe("mailto:ana@example.org");
        for (const malo of ["javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "file:///etc/passwd", "  ", "no es un enlace", "//x.com"]) {
            expect(enlaceSeguro(malo)).toBeNull();
        }
    });
});

describe("filas y columnas", () => {
    test("añadir fila al final, antes y después", () => {
        const { t, fs } = tabla(["texto"]);
        const a = anadirFila(t, C(), { despuesDe: fs[0] });
        expect(filasVisibles(a.tabla).map((f) => f.id)).toEqual([fs[0], a.filaId, fs[1], fs[2]]);
        const b = anadirFila(t, C(), { antesDe: fs[0] });
        expect(filasVisibles(b.tabla)[0].id).toBe(b.filaId);
        const c = anadirFila(t, C());
        expect(filasVisibles(c.tabla).at(-1)!.id).toBe(c.filaId);
    });

    test("mover y borrar filas", () => {
        const { t, fs } = tabla(["texto"], 4);
        expect(filasVisibles(moverFila(t, fs[3], 0, C())).map((f) => f.id)).toEqual([fs[3], fs[0], fs[1], fs[2]]);
        expect(filasVisibles(moverFila(t, fs[0], 3, C())).map((f) => f.id)).toEqual([fs[1], fs[2], fs[3], fs[0]]);
        expect(moverFila(t, fs[1], 1, C())).toBe(t); // ya estaba ahí
        const b = borrarFilas(t, [fs[1], fs[2]], C());
        expect(filasVisibles(b).map((f) => f.id)).toEqual([fs[0], fs[3]]);
        expect(borrarFilas(b, [fs[1]], C())).toBe(b);
    });

    test("duplicar una fila copia sus valores justo debajo", () => {
        const { t, cs, fs } = tabla(["texto", "numero"]);
        const x = aplicarCeldas(t, [{ filaId: fs[0], colId: cs[0], valor: "a" }, { filaId: fs[0], colId: cs[1], valor: 7 }], C());
        const d = duplicarFila(x, fs[0], C());
        const nueva = filasVisibles(d.tabla)[1].id;
        expect(nueva).toBe(d.filaId);
        expect(valorCelda(d.tabla, nueva, cs[0])).toBe("a");
        expect(valorCelda(d.tabla, nueva, cs[1])).toBe(7);
    });

    test("columnas: añadir, renombrar (sin corchetes), mover y borrar", () => {
        const { t, cs } = tabla(["texto", "texto", "texto"]);
        expect(columnasVisibles(renombrarColumna(t, cs[0], "  [Coste] total  ", C())).map((c) => c.nombre.v)[0]).toBe("(Coste) total");
        expect(renombrarColumna(t, cs[0], "   ", C())).toBe(t);
        expect(columnasVisibles(moverColumna(t, cs[2], 0, C())).map((c) => c.id)).toEqual([cs[2], cs[0], cs[1]]);
        expect(columnasVisibles(borrarColumna(t, cs[1], C())).map((c) => c.id)).toEqual([cs[0], cs[2]]);
    });

    test("límites de filas y columnas", () => {
        let t = tablaVacia();
        const r = anadirFilasAlFinal(t, LIMITES.filas + 50, C());
        expect(r.filaIds).toHaveLength(LIMITES.filas);
        t = r.tabla;
        expect(anadirFila(t, C()).filaId).toBeNull();
        let u = tablaVacia();
        for (let i = 0; i < LIMITES.columnas; i++) u = anadirColumna(u, C()).tabla;
        expect(anadirColumna(u, C()).colId).toBeNull();
    });

    test("tabla inicial: tres columnas y cinco filas en blanco", () => {
        const t = tablaInicial(C());
        expect(columnasVisibles(t)).toHaveLength(3);
        expect(filasVisibles(t)).toHaveLength(5);
        expect(Object.keys(t.celdas)).toHaveLength(0);
    });
});

describe("opciones de selección", () => {
    test("añadir (sin repetir), editar, mover y quitar limpia las celdas", () => {
        const { t, cs, fs } = tabla(["seleccion"]);
        const a = anadirOpcion(t, cs[0], "Pendiente", C());
        const b = anadirOpcion(a.tabla, cs[0], "Hecho", C());
        expect(anadirOpcion(b.tabla, cs[0], " pendiente ", C()).opcionId).toBe(a.opcionId); // sin duplicados
        const conValor = establecerCelda(b.tabla, fs[0], cs[0], a.opcionId!, C());
        const editada = editarOpcion(conValor, cs[0], a.opcionId!, { nombre: "En curso", color: "#10B981" }, C());
        expect(opcionesOrdenadas(editada.columnas[cs[0]])[0]).toMatchObject({ nombre: "En curso", color: "#10B981" });
        expect(opcionesOrdenadas(moverOpcion(editada, cs[0], b.opcionId!, -1, C()).columnas[cs[0]]).map((o) => o.nombre)).toEqual(["Hecho", "En curso"]);
        const sin = quitarOpcion(editada, cs[0], a.opcionId!, C());
        expect(opcionesOrdenadas(sin.columnas[cs[0]]).map((o) => o.nombre)).toEqual(["Hecho"]);
        expect(valorCelda(sin, fs[0], cs[0])).toBeNull();
    });
});

describe("cambio de tipo con conversión", () => {
    test("texto → selección crea una opción por valor distinto y remapea las celdas", () => {
        const { t, cs, fs } = tabla(["texto"], 4);
        const x = aplicarCeldas(
            t,
            [
                { filaId: fs[0], colId: cs[0], valor: "Rojo" },
                { filaId: fs[1], colId: cs[0], valor: "Verde" },
                { filaId: fs[2], colId: cs[0], valor: "rojo" },
            ],
            C(),
        );
        const s = cambiarTipoColumna(x, cs[0], "seleccion", C());
        const ops = opcionesOrdenadas(s.columnas[cs[0]]);
        expect(ops.map((o) => o.nombre)).toEqual(["Rojo", "Verde"]);
        expect(valorCelda(s, fs[0], cs[0])).toBe(ops[0].id);
        expect(valorCelda(s, fs[2], cs[0])).toBe(ops[0].id);
        expect(valorCelda(s, fs[3], cs[0])).toBeNull();
        // y de vuelta a texto: los nombres, no los ids
        const v = cambiarTipoColumna(s, cs[0], "texto", C());
        expect(valorCelda(v, fs[1], cs[0])).toBe("Verde");
    });

    test("texto → número convierte lo que se puede; número → texto conserva el dato", () => {
        const { t, cs, fs } = tabla(["texto"]);
        const x = aplicarCeldas(t, [{ filaId: fs[0], colId: cs[0], valor: "12,5" }, { filaId: fs[1], colId: cs[0], valor: "hola" }], C());
        const n = cambiarTipoColumna(x, cs[0], "numero", C());
        expect(valorCelda(n, fs[0], cs[0])).toBe(12.5);
        expect(valorCelda(n, fs[1], cs[0])).toBeNull();
        expect(valorCelda(cambiarTipoColumna(n, cs[0], "texto", C()), fs[0], cs[0])).toBe("12.5");
    });

    test("casilla ⇄ texto", () => {
        const { t, cs, fs } = tabla(["casilla"]);
        const x = aplicarCeldas(t, [{ filaId: fs[0], colId: cs[0], valor: true }, { filaId: fs[1], colId: cs[0], valor: false }], C());
        const s = cambiarTipoColumna(x, cs[0], "texto", C());
        expect(valorCelda(s, fs[0], cs[0])).toBe("Sí");
        expect(valorCelda(s, fs[1], cs[0])).toBe("No");
        expect(valorCelda(cambiarTipoColumna(s, cs[0], "casilla", C()), fs[0], cs[0])).toBe(true);
    });
});

describe("pegado de rangos (TSV)", () => {
    test("pega desde una celda, crea filas si se sale por abajo y descarta lo que sobra por la derecha", () => {
        const { t, cs, fs } = tabla(["texto", "numero"], 2);
        const r = aplicarPegado(
            t,
            [["a", "1"], ["b", "2"], ["c", "3,5", "sobra"]],
            { filaIds: fs, desdeFila: 1, colIds: cs, desdeCol: 0 },
            C(),
        );
        expect(r.filasNuevas).toBe(2);
        const ids = filasVisibles(r.tabla).map((f) => f.id);
        expect(ids).toHaveLength(4);
        expect(valorCelda(r.tabla, ids[1], cs[0])).toBe("a");
        expect(valorCelda(r.tabla, ids[3], cs[1])).toBe(3.5);
        expect(r.omitidas).toBe(0); // la columna que no existe se descarta sin más
    });

    test("selección: un nombre desconocido crea la opción; en número, un texto se omite", () => {
        const { t, cs, fs } = tabla(["seleccion", "numero"], 1);
        const r = aplicarPegado(t, [["Nuevo", "no-es-numero"]], { filaIds: fs, desdeFila: 0, colIds: cs, desdeCol: 0 }, C());
        expect(opcionesOrdenadas(r.tabla.columnas[cs[0]]).map((o) => o.nombre)).toEqual(["Nuevo"]);
        expect(r.escritas).toBe(1);
        expect(r.omitidas).toBe(1);
    });

    test("coaccionarTexto por tipo", () => {
        const { t, cs } = tabla(["fecha", "casilla", "texto"]);
        expect(coaccionarTexto(t.columnas[cs[0]], "1/2/2026")).toBe("2026-02-01");
        expect(coaccionarTexto(t.columnas[cs[1]], "Sí")).toBe(true);
        expect(coaccionarTexto(t.columnas[cs[2]], "  con espacios ")).toBe("  con espacios ");
    });
});

describe("limpiar un rango", () => {
    test("Suprimir vacía las celdas seleccionadas", () => {
        const { t, cs, fs } = tabla(["texto", "texto"]);
        const x = aplicarCeldas(t, fs.flatMap((f) => cs.map((c) => ({ filaId: f, colId: c, valor: "x" }))), C());
        const l = limpiarCeldas(x, [fs[0], fs[1]], [cs[0]], C());
        expect(valorCelda(l, fs[0], cs[0])).toBeNull();
        expect(valorCelda(l, fs[1], cs[0])).toBeNull();
        expect(valorCelda(l, fs[2], cs[0])).toBe("x");
        expect(valorCelda(l, fs[0], cs[1])).toBe("x");
    });
});

describe("vista personal: ordenar y filtrar", () => {
    function datos() {
        const { t, cs, fs } = tabla(["texto", "numero", "casilla"], 5);
        const x = aplicarCeldas(
            t,
            [
                { filaId: fs[0], colId: cs[0], valor: "Zeta" },
                { filaId: fs[1], colId: cs[0], valor: "ana" },
                { filaId: fs[2], colId: cs[0], valor: "Beto" },
                { filaId: fs[3], colId: cs[0], valor: "álvaro" },
                { filaId: fs[0], colId: cs[1], valor: 10 },
                { filaId: fs[1], colId: cs[1], valor: 2 },
                { filaId: fs[2], colId: cs[1], valor: 33 },
                { filaId: fs[0], colId: cs[2], valor: true },
                { filaId: fs[2], colId: cs[2], valor: true },
            ],
            C(),
        );
        return { t: x, cs, fs };
    }

    test("orden de texto con acentos, vacíos al final; numérico real; descendente", () => {
        const { t, cs, fs } = datos();
        expect(aplicarVista(t, { orden: { col: cs[0], dir: "asc" }, filtros: [] })).toEqual([fs[3], fs[1], fs[2], fs[0], fs[4]]);
        expect(aplicarVista(t, { orden: { col: cs[1], dir: "asc" }, filtros: [] })).toEqual([fs[1], fs[0], fs[2], fs[3], fs[4]]);
        expect(aplicarVista(t, { orden: { col: cs[1], dir: "desc" }, filtros: [] })).toEqual([fs[2], fs[0], fs[1], fs[3], fs[4]]);
    });

    test("filtros: contiene, mayor que, marcado, vacío", () => {
        const { t, cs, fs } = datos();
        const v = (op: never, col: string, valor = "") => aplicarVista(t, { orden: null, filtros: [{ col, op, valor }] });
        expect(v("contiene" as never, cs[0], "A")).toEqual([fs[0], fs[1], fs[3]]);
        expect(v("mayor" as never, cs[1], "5")).toEqual([fs[0], fs[2]]);
        expect(v("si" as never, cs[2])).toEqual([fs[0], fs[2]]);
        expect(v("vacio" as never, cs[0])).toEqual([fs[4]]);
        expect(aplicarVista(t, { orden: null, filtros: [{ col: cs[0], op: "no-vacio", valor: "" }, { col: cs[1], op: "menor", valor: "20" }] })).toEqual([fs[0], fs[1]]);
    });

    test("la vista no toca la tabla compartida y un filtro de una columna borrada no oculta nada", () => {
        const { t, cs, fs } = datos();
        const sin = borrarColumna(t, cs[1], C());
        expect(aplicarVista(sin, { orden: null, filtros: [{ col: cs[1], op: "mayor", valor: "5" }] })).toHaveLength(5);
        expect(limpiarVista(sin, { orden: { col: cs[1], dir: "asc" }, filtros: [{ col: cs[1], op: "vacio", valor: "" }] })).toEqual({ orden: null, filtros: [] });
        expect(filasVisibles(t).map((f) => f.id)).toEqual(fs);
    });

    test("se recuerda por tabla en este dispositivo", () => {
        const almacen = new Map<string, string>();
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v), removeItem: (k: string) => void almacen.delete(k) },
        });
        expect(leerVista("esp1")).toEqual(VISTA_VACIA);
        guardarVista("esp1", { orden: { col: "c_aa", dir: "desc" }, filtros: [{ col: "c_bb", op: "contiene", valor: "x" }] });
        expect(leerVista("esp1")).toEqual({ orden: { col: "c_aa", dir: "desc" }, filtros: [{ col: "c_bb", op: "contiene", valor: "x" }] });
        expect(leerVista("otra")).toEqual(VISTA_VACIA);
        guardarVista("esp1", VISTA_VACIA);
        expect(almacen.size).toBe(0);
        almacen.set("starseed.tabla.vista.mala", "{no es json");
        expect(leerVista("mala")).toEqual(VISTA_VACIA);
    });

    test("los totales pueden calcularse sobre las filas filtradas", () => {
        const { t, cs, fs } = datos();
        const calc = crearCalculadora(t);
        const visibles = aplicarVista(t, { orden: null, filtros: [{ col: cs[0], op: "contiene", valor: "a" }] });
        expect(calc.agregar(cs[1], "SUMA", visibles)).toEqual({ ok: true, n: 12 }); // Zeta(10) + ana(2)
        expect(fs.length).toBe(5);
    });
});

describe("deshacer y rehacer colaborativo", () => {
    function paso(antes: Tabla, despues: Tabla): Paso {
        return { antes, despues };
    }

    test("deshacer una edición restaura el valor anterior; rehacer lo vuelve a poner", () => {
        const { t, cs, fs } = tabla(["texto"]);
        const a = establecerCelda(t, fs[0], cs[0], "uno", C());
        const b = establecerCelda(a, fs[0], cs[0], "dos", C());
        const deshecho = invertirPaso(paso(a, b), b, C());
        expect(valorCelda(deshecho, fs[0], cs[0])).toBe("uno");
        const rehecho = invertirPaso(paso(b, deshecho), deshecho, C());
        expect(valorCelda(rehecho, fs[0], cs[0])).toBe("dos");
    });

    test("deshacer respeta lo que otra persona cambió después", () => {
        const { t, cs, fs } = tabla(["texto"]);
        const yo = establecerCelda(t, fs[0], cs[0], "mío", C());
        const otra = establecerCelda(yo, fs[0], cs[0], "de Bea", { t: reloj++, a: "bea000000000" });
        const r = invertirPaso(paso(t, yo), otra, C());
        expect(valorCelda(r, fs[0], cs[0])).toBe("de Bea"); // no se pisa su edición
        expect(r).toBe(otra);
    });

    test("deshacer una fila creada la entierra; rehacer la recupera", () => {
        const { t } = tabla(["texto"]);
        const creada = anadirFila(t, C());
        const deshecho = invertirPaso(paso(t, creada.tabla), creada.tabla, C());
        expect(filasVisibles(deshecho).map((f) => f.id)).not.toContain(creada.filaId);
        const rehecho = invertirPaso(paso(creada.tabla, deshecho), deshecho, C());
        expect(filasVisibles(rehecho).map((f) => f.id)).toContain(creada.filaId);
    });

    test("deshacer un borrado de filas y un movimiento", () => {
        const { t, fs } = tabla(["texto"], 3);
        const borrada = borrarFilas(t, [fs[1]], C());
        expect(filasVisibles(invertirPaso(paso(t, borrada), borrada, C())).map((f) => f.id)).toEqual(fs);
        const movida = moverFila(t, fs[2], 0, C());
        expect(filasVisibles(invertirPaso(paso(t, movida), movida, C())).map((f) => f.id)).toEqual(fs);
    });

    test("deshacer una columna nueva y un cambio de tipo con conversión", () => {
        const { t, cs, fs } = tabla(["texto"]);
        const x = establecerCelda(t, fs[0], cs[0], "Rojo", C());
        const s = cambiarTipoColumna(x, cs[0], "seleccion", C());
        const d = invertirPaso(paso(x, s), s, C());
        expect(d.columnas[cs[0]].tipo.v).toBe("texto");
        expect(valorCelda(d, fs[0], cs[0])).toBe("Rojo");
        const nueva = anadirColumna(t, C());
        expect(columnasVisibles(invertirPaso(paso(t, nueva.tabla), nueva.tabla, C())).map((c) => c.id)).toEqual(cs);
    });

    test("el resultado de deshacer converge con una réplica que no lo ha visto aún", () => {
        const { t, cs, fs } = tabla(["texto"]);
        const a = establecerCelda(t, fs[0], cs[0], "x", C());
        const deshecho = invertirPaso(paso(t, a), a, C());
        // otra réplica recibe primero la edición y luego el deshacer, u orden inverso
        expect(tablasIguales(fusionarTablas(a, deshecho), fusionarTablas(deshecho, a))).toBe(true);
        expect(valorCelda(fusionarTablas(a, deshecho), fs[0], cs[0])).toBeNull();
    });
});
