/**
 * Fusión por celda: las ediciones concurrentes a celdas distintas sobreviven las dos; en la misma
 * celda gana la última; borrar y editar a la vez no pierde ni resucita nada; y la fusión es
 * conmutativa, asociativa e idempotente (todas las copias convergen).
 */
import { describe, expect, test } from "vitest";
import { fusionarTablas, ganaReg, podar, tablasIguales } from "@/lib/vivo/tabla/fusion";
import {
    claveCelda,
    columnasVisibles,
    filasVisibles,
    maxTiempo,
    normalizarTabla,
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
    borrarColumna,
    borrarFilas,
    establecerCelda,
    moverFila,
    redimensionarColumna,
    renombrarColumna,
    restaurarFilas,
} from "@/lib/vivo/tabla/operaciones";

const ANA = (t: number): Ctx => ({ t, a: "ana000000000" });
const BEA = (t: number): Ctx => ({ t, a: "bea000000000" });

/** Base común: 3 columnas de texto y 3 filas, escritas por «base». */
function base() {
    let t = tablaVacia();
    const cs: string[] = [];
    for (const n of ["A", "B", "C"]) {
        const r = anadirColumna(t, { t: 10, a: "base" }, { nombre: n, tipo: "texto" });
        t = r.tabla;
        cs.push(r.colId!);
    }
    const f = anadirFilasAlFinal(t, 3, { t: 11, a: "base" });
    return { t: f.tabla, cs, fs: f.filaIds };
}

describe("fusión de celdas", () => {
    test("ediciones a celdas distintas: sobreviven las dos", () => {
        const { t, cs, fs } = base();
        const a = establecerCelda(t, fs[0], cs[0], "de Ana", ANA(100));
        const b = establecerCelda(t, fs[1], cs[1], "de Bea", BEA(101));
        const m1 = fusionarTablas(a, b);
        const m2 = fusionarTablas(b, a);
        expect(valorCelda(m1, fs[0], cs[0])).toBe("de Ana");
        expect(valorCelda(m1, fs[1], cs[1])).toBe("de Bea");
        expect(tablasIguales(m1, m2)).toBe(true);
    });

    test("misma celda: gana el reloj mayor, sea cual sea el orden de llegada", () => {
        const { t, cs, fs } = base();
        const a = establecerCelda(t, fs[0], cs[0], "Ana", ANA(100));
        const b = establecerCelda(t, fs[0], cs[0], "Bea", BEA(200));
        expect(valorCelda(fusionarTablas(a, b), fs[0], cs[0])).toBe("Bea");
        expect(valorCelda(fusionarTablas(b, a), fs[0], cs[0])).toBe("Bea");
    });

    test("empate exacto de reloj: gana el autor mayor y todos coinciden", () => {
        const { t, cs, fs } = base();
        const a = establecerCelda(t, fs[0], cs[0], "Ana", ANA(500));
        const b = establecerCelda(t, fs[0], cs[0], "Bea", BEA(500));
        const m1 = fusionarTablas(a, b);
        const m2 = fusionarTablas(b, a);
        expect(valorCelda(m1, fs[0], cs[0])).toBe("Bea");
        expect(valorCelda(m2, fs[0], cs[0])).toBe("Bea");
        expect(ganaReg({ v: "y", t: 1, a: "z" }, { v: "x", t: 1, a: "z" })).toBe(true);
        expect(ganaReg({ v: "x", t: 1, a: "z" }, { v: "y", t: 1, a: "z" })).toBe(false);
        expect(ganaReg({ v: "y", t: 1, a: "z" }, { v: "y", t: 1, a: "z" })).toBe(false);
    });

    test("propiedades de columna independientes: renombrar y redimensionar a la vez", () => {
        const { t, cs } = base();
        const a = renombrarColumna(t, cs[0], "Nombre nuevo", ANA(100));
        const b = redimensionarColumna(t, cs[0], 320, BEA(101));
        const m = fusionarTablas(a, b);
        expect(m.columnas[cs[0]].nombre.v).toBe("Nombre nuevo");
        expect(m.columnas[cs[0]].ancho.v).toBe(320);
    });

    test("opciones de selección: dos personas añaden opciones distintas y ambas quedan", () => {
        let t = tablaVacia();
        const c = anadirColumna(t, { t: 1, a: "base" }, { nombre: "Estado", tipo: "seleccion" });
        t = c.tabla;
        const a = anadirOpcion(t, c.colId!, "Pendiente", ANA(100)).tabla;
        const b = anadirOpcion(t, c.colId!, "Hecho", BEA(101)).tabla;
        const m = fusionarTablas(a, b);
        const nombres = Object.values(m.columnas[c.colId!].opciones ?? {}).map((o) => o.v?.nombre).sort();
        expect(nombres).toEqual(["Hecho", "Pendiente"]);
    });
});

describe("lápidas: borrar y editar a la vez", () => {
    test("borrar una fila mientras otra persona edita una celda suya: la fila queda borrada y el dato guardado", () => {
        const { t, cs, fs } = base();
        const a = borrarFilas(t, [fs[0]], ANA(100));
        const b = establecerCelda(t, fs[0], cs[0], "editado", BEA(101));
        const m = fusionarTablas(a, b);
        expect(filasVisibles(m).map((f) => f.id)).not.toContain(fs[0]);
        expect(valorCelda(m, fs[0], cs[0])).toBe("editado"); // el dato sigue ahí…
        const vuelve = restaurarFilas(m, [fs[0]], ANA(200)); // …y reaparece si se restaura
        expect(valorCelda(vuelve, fs[0], cs[0])).toBe("editado");
        expect(filasVisibles(vuelve).map((f) => f.id)).toContain(fs[0]);
    });

    test("un borrado no resucita al fusionar con una copia vieja", () => {
        const { t, fs } = base();
        const borrada = borrarFilas(t, [fs[1]], ANA(100));
        const vieja = t; // alguien que no vio el borrado
        expect(filasVisibles(fusionarTablas(borrada, vieja)).map((f) => f.id)).not.toContain(fs[1]);
        expect(filasVisibles(fusionarTablas(vieja, borrada)).map((f) => f.id)).not.toContain(fs[1]);
    });

    test("borrar una columna oculta sus celdas sin destruirlas", () => {
        const { t, cs, fs } = base();
        const conDato = establecerCelda(t, fs[0], cs[1], "dato", ANA(50));
        const sin = borrarColumna(conDato, cs[1], BEA(100));
        expect(columnasVisibles(sin).map((c) => c.id)).not.toContain(cs[1]);
        expect(valorCelda(sin, fs[0], cs[1])).toBe("dato");
    });
});

describe("orden de filas", () => {
    test("dos personas mueven filas distintas a la vez: ambas se mueven", () => {
        const { t, fs } = base();
        const a = moverFila(t, fs[2], 0, ANA(100)); // Ana sube la 3ª arriba
        const b = moverFila(t, fs[0], 2, BEA(101)); // Bea baja la 1ª al final
        const m = fusionarTablas(a, b);
        expect(filasVisibles(m).map((f) => f.id)).toEqual(filasVisibles(fusionarTablas(b, a)).map((f) => f.id));
        expect(filasVisibles(m)).toHaveLength(3);
    });

    test("dos filas nuevas insertadas en el mismo hueco: ninguna se pierde y el orden es el mismo para todos", () => {
        const { t, fs } = base();
        const a = anadirFila(t, ANA(100), { despuesDe: fs[0] });
        const b = anadirFila(t, BEA(101), { despuesDe: fs[0] });
        const m1 = fusionarTablas(a.tabla, b.tabla);
        const m2 = fusionarTablas(b.tabla, a.tabla);
        expect(filasVisibles(m1)).toHaveLength(5);
        expect(filasVisibles(m1).map((f) => f.id)).toEqual(filasVisibles(m2).map((f) => f.id));
    });

    test("insertar muchas veces en el mismo hueco no agota la precisión (renumera)", () => {
        let { t, fs } = base();
        let tiempo = 1000;
        for (let i = 0; i < 80; i++) {
            const r = anadirFila(t, ANA(tiempo++), { despuesDe: fs[0] });
            t = r.tabla;
        }
        const orden = filasVisibles(t).map((f) => f.orden.v);
        expect(filasVisibles(t)).toHaveLength(83);
        expect(new Set(orden).size).toBe(83);
        expect(orden).toEqual([...orden].sort((x, y) => x - y));
    });
});

describe("propiedades del CRDT (conmutativa, asociativa, idempotente)", () => {
    /** Generador pseudoaleatorio con semilla: las pruebas son reproducibles. */
    function rng(semilla: number): () => number {
        let s = semilla >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 0x100000000;
        };
    }

    function replica(semilla: number, autor: string): Tabla {
        const azar = rng(semilla);
        const { t: inicial, cs, fs } = base();
        let t = inicial;
        let reloj = 1000 + Math.floor(azar() * 50);
        for (let i = 0; i < 30; i++) {
            const c: Ctx = { t: reloj++, a: autor };
            const k = azar();
            if (k < 0.55) t = establecerCelda(t, fs[Math.floor(azar() * fs.length)], cs[Math.floor(azar() * cs.length)], `v${Math.floor(azar() * 9)}`, c);
            else if (k < 0.65) t = anadirFila(t, c).tabla;
            else if (k < 0.72) t = borrarFilas(t, [fs[Math.floor(azar() * fs.length)]], c);
            else if (k < 0.8) t = moverFila(t, fs[Math.floor(azar() * fs.length)], Math.floor(azar() * 4), c);
            else if (k < 0.88) t = renombrarColumna(t, cs[Math.floor(azar() * cs.length)], `N${Math.floor(azar() * 9)}`, c);
            else if (k < 0.94) t = redimensionarColumna(t, cs[Math.floor(azar() * cs.length)], 100 + Math.floor(azar() * 200), c);
            else t = anadirColumna(t, c, { nombre: `Nueva${i}` }).tabla;
        }
        return t;
    }

    const semillas = [1, 2, 3, 4, 5, 6, 7, 8];
    test.each(semillas)("semilla %i: a∪b = b∪a, (a∪b)∪c = a∪(b∪c), a∪a = a", (s) => {
        const a = replica(s, "ana000000000");
        const b = replica(s + 100, "bea000000000");
        const c = replica(s + 200, "cai000000000");
        expect(tablasIguales(fusionarTablas(a, b), fusionarTablas(b, a))).toBe(true);
        expect(tablasIguales(fusionarTablas(fusionarTablas(a, b), c), fusionarTablas(a, fusionarTablas(b, c)))).toBe(true);
        expect(fusionarTablas(a, a)).toBe(a);
        const ab = fusionarTablas(a, b);
        expect(fusionarTablas(ab, a)).toBe(ab); // volver a aplicar lo mismo no cambia nada
        expect(fusionarTablas(ab, b)).toBe(ab);
    });

    test("comparte estructura: si b no aporta nada devuelve LA MISMA referencia", () => {
        const { t, cs, fs } = base();
        const a = establecerCelda(t, fs[0], cs[0], "x", ANA(100));
        expect(fusionarTablas(a, t)).toBe(a);
        expect(fusionarTablas(a, tablaVacia())).toBe(a);
        expect(fusionarTablas(t, a)).not.toBe(t);
    });

    test("el orden de llegada de tres réplicas no importa (todas convergen)", () => {
        const rs = [replica(11, "ana000000000"), replica(12, "bea000000000"), replica(13, "cai000000000")];
        const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
        const resultados = perms.map(([i, j, k]) => fusionarTablas(fusionarTablas(rs[i], rs[j]), rs[k]));
        for (const r of resultados) expect(tablasIguales(r, resultados[0])).toBe(true);
    });
});

describe("poda de lo borrado hace tiempo", () => {
    const DIA = 86_400_000;
    test("suelta las celdas de filas borradas hace más de 7 días y respeta lo reciente", () => {
        const { t, cs, fs } = base();
        let x = establecerCelda(t, fs[0], cs[0], "viejo", { t: 1000, a: "a" });
        x = establecerCelda(x, fs[1], cs[0], "reciente", { t: 1000, a: "a" });
        x = borrarFilas(x, [fs[0]], { t: 1000, a: "a" });
        x = borrarFilas(x, [fs[1]], { t: 20 * DIA, a: "a" });
        const podada = podar(x, 21 * DIA);
        expect(podada.celdas[claveCelda(fs[0], cs[0])]).toBeUndefined();
        expect(podada.celdas[claveCelda(fs[1], cs[0])]).toBeDefined();
        expect(podada.filas[fs[0]]).toBeDefined(); // la lápida sigue (plazo largo)
        expect(podar(x, 21 * DIA)).toEqual(podada);
    });

    test("pasado el plazo largo se suelta también la lápida; sin nada que podar devuelve la misma tabla", () => {
        const { t, fs } = base();
        const x = borrarFilas(t, [fs[0]], { t: 1000, a: "a" });
        expect(podar(x, 100 * DIA).filas[fs[0]]).toBeUndefined();
        expect(podar(t, 100 * DIA)).toBe(t);
    });

    test("podar es idempotente y compatible con la fusión", () => {
        const { t, cs, fs } = base();
        const x = borrarFilas(establecerCelda(t, fs[0], cs[0], "v", { t: 1000, a: "a" }), [fs[0]], { t: 1001, a: "a" });
        const p = podar(x, 30 * DIA);
        expect(podar(p, 30 * DIA)).toBe(p);
        // una copia vieja que aún trae la celda vuelve a podarse al fusionar: no resucita
        expect(podar(fusionarTablas(p, x), 30 * DIA).celdas[claveCelda(fs[0], cs[0])]).toBeUndefined();
    });
});

describe("normalización defensiva de lo que llega de la red", () => {
    test("descarta entradas mal formadas y claves peligrosas", () => {
        const malo = JSON.parse(
            `{"v":1,"columnas":{"__proto__":{"nombre":{"v":"x","t":1,"a":"a"}},"c_ok":{"nombre":{"v":"Bien","t":1,"a":"a"},"tipo":{"v":"texto","t":1,"a":"a"},"ancho":{"v":99999,"t":1,"a":"a"},"orden":{"v":1,"t":1,"a":"a"}},"c_mal":{"nombre":5},"constructor":{}},
             "filas":{"f_ok":{"orden":{"v":1,"t":1,"a":"a"}},"f_x":{"orden":{"v":"no","t":1,"a":"a"}},"prototype":{}},
             "celdas":{"f_ok|c_ok":{"v":"hola","t":2,"a":"a"},"f_ok|c_mal":{"v":{"x":1},"t":2,"a":"a"},"__proto__|c_ok":{"v":"x","t":1,"a":"a"},"sinbarra":{"v":"x","t":1,"a":"a"},"f_ok|c_ok2":{"v":"y","t":-5,"a":"a"}}}`,
        );
        const t = normalizarTabla(malo);
        expect(Object.keys(t.columnas)).toEqual(["c_ok"]);
        expect(t.columnas.c_ok.ancho.v).toBe(800); // acotado
        expect(Object.keys(t.filas)).toEqual(["f_ok"]);
        expect(Object.keys(t.celdas)).toEqual(["f_ok|c_ok"]);
        expect(({} as Record<string, unknown>).nombre).toBeUndefined(); // sin contaminar el prototipo
    });

    test("cualquier cosa (null, número, array) da una tabla vacía sin lanzar", () => {
        for (const x of [null, undefined, 5, "a", [], [1, 2]]) {
            const t = normalizarTabla(x);
            expect(Object.keys(t.celdas)).toHaveLength(0);
            expect(filasVisibles(t)).toHaveLength(0);
        }
    });

    test("recorta textos larguísimos y descarta números no finitos", () => {
        const largo = "x".repeat(5000);
        const t = normalizarTabla({
            columnas: { c_aa: { nombre: { v: "N".repeat(200), t: 1, a: "a" }, tipo: { v: "raro", t: 1, a: "a" }, orden: { v: 1, t: 1, a: "a" } } },
            filas: { f_aa: { orden: { v: 1, t: 1, a: "a" } } },
            celdas: { "f_aa|c_aa": { v: largo, t: 1, a: "a" } },
        });
        expect(t.columnas.c_aa).toBeUndefined(); // tipo desconocido → columna descartada
        const ok = normalizarTabla({
            columnas: { c_aa: { nombre: { v: "N".repeat(200), t: 1, a: "a" }, tipo: { v: "texto", t: 1, a: "a" }, orden: { v: 1, t: 1, a: "a" } } },
            filas: { f_aa: { orden: { v: 1, t: 1, a: "a" } } },
            celdas: { "f_aa|c_aa": { v: largo, t: 1, a: "a" }, "f_aa|c_bb": { v: 1, t: Infinity, a: "a" } },
        });
        expect(ok.columnas.c_aa.nombre.v).toHaveLength(60);
        expect((ok.celdas["f_aa|c_aa"].v as string).length).toBe(2000);
        expect(ok.celdas["f_aa|c_bb"]).toBeUndefined();
    });

    test("ida y vuelta por JSON conserva la tabla", () => {
        const { t, cs, fs } = base();
        const x = establecerCelda(t, fs[0], cs[0], "dato", ANA(100));
        const vuelta = normalizarTabla(JSON.parse(JSON.stringify(x)));
        expect(tablasIguales(vuelta, x)).toBe(true);
        expect(maxTiempo(vuelta)).toBe(100);
    });
});
