/**
 * Reglas de los juegos de mesa sencillos (tres en raya, conecta 4) y de la mesa (asientos,
 * rendición, quién puede mover) — con el mismo `aplicar` que valida cada jugada remota.
 */
import { describe, expect, test } from "vitest";
import { COLUMNAS_C4, FILAS_C4, filaLibre, lineaDesde, tableroC4Inicial } from "../juegos/conecta4";
import { baseDePartida, motorMesa, type EstadoMesa } from "../juegos/mesa";
import { lineaGanadora, tableroTresInicial } from "../juegos/tres-en-raya";
import type { Fin } from "../juegos/tipos";
import { SENTAR_DOS, entrada, jugarMesa } from "@/lib/vivo/__pruebas__/juego-utiles";

const jugarTres = (cel: number[]) =>
    jugarMesa("tres-en-raya", [...SENTAR_DOS, ...cel.map((c, i): [string, string, { c: number }] => ["jugar", i % 2 === 0 ? "ana" : "beto", { c }])]);
const tresDe = (e: EstadoMesa) => e.tablero as ReturnType<typeof tableroTresInicial>;

describe("tres en raya", () => {
    test("la mesa empieza sola al sentarse dos personas y mueve primero el asiento 0", () => {
        const solo = jugarMesa("tres-en-raya", [["sentar", "ana", { nombre: "Ana" }]]);
        expect(solo.iniciada).toBe(false);
        const listo = jugarMesa("tres-en-raya", SENTAR_DOS);
        expect(listo.iniciada).toBe(true);
        expect(listo.turno).toBe(0);
    });

    test("gana la fila, la columna y la diagonal", () => {
        const fila = jugarTres([0, 3, 1, 4, 2]);
        expect(fila.fin).toEqual({ tipo: "victoria", ganador: 0, motivo: "Tres en raya" });
        expect(tresDe(fila).linea).toEqual([0, 1, 2]);
        const columna = jugarTres([0, 1, 3, 2, 6]);
        expect(columna.fin?.ganador).toBe(0);
        const diagonal = jugarTres([2, 0, 4, 1, 6]);
        expect(diagonal.fin?.ganador).toBe(0);
        expect(tresDe(diagonal).linea).toEqual([2, 4, 6]);
        const beto = jugarTres([0, 3, 1, 4, 8, 5]);
        expect(beto.fin?.ganador).toBe(1);
    });

    test("un tablero lleno sin línea son tablas", () => {
        const tablas = jugarTres([0, 1, 2, 4, 3, 5, 7, 6, 8]);
        expect(tablas.fin).toEqual({ tipo: "tablas", ganador: null, motivo: "Tablero lleno" });
    });

    test("rechaza: casilla ocupada, fuera de rango, turno ajeno, no sentados y partida acabada", () => {
        const e = jugarTres([4]);
        const intento = (u: string, d: object) => motorMesa.aplicar(e, entrada("jugar", u, d as never, e.n));
        expect(intento("beto", { c: 4 })).toMatchObject({ ok: false, motivo: "Esa casilla ya está ocupada." });
        expect(intento("beto", { c: 9 })).toMatchObject({ ok: false });
        expect(intento("beto", { c: -1 })).toMatchObject({ ok: false });
        expect(intento("beto", { c: 1.5 })).toMatchObject({ ok: false });
        expect(intento("beto", { c: "1" })).toMatchObject({ ok: false });
        expect(intento("ana", { c: 0 })).toMatchObject({ ok: false, motivo: "No es tu turno." });
        expect(intento("mirón", { c: 0 })).toMatchObject({ ok: false });
        const acabada = jugarTres([0, 3, 1, 4, 2]);
        expect(motorMesa.aplicar(acabada, entrada("jugar", "beto", { c: 8 }, acabada.n))).toMatchObject({ ok: false });
    });

    test("no se puede jugar antes de que la mesa esté llena ni con entradas desconocidas", () => {
        const solo = jugarMesa("tres-en-raya", [["sentar", "ana", { nombre: "Ana" }]]);
        expect(motorMesa.aplicar(solo, entrada("jugar", "ana", { c: 0 }, 1))).toMatchObject({ ok: false });
        const listo = jugarMesa("tres-en-raya", SENTAR_DOS);
        expect(motorMesa.aplicar(listo, entrada("volar", "ana", {}, 2))).toMatchObject({ ok: false });
    });

    test("lineaGanadora sobre tableros sueltos", () => {
        expect(lineaGanadora([0, 0, 0, null, null, null, null, null, null])).toEqual([0, 1, 2]);
        expect(lineaGanadora([0, 1, 0, null, null, null, null, null, null])).toEqual([]);
    });
});

describe("conecta 4", () => {
    const jugarC4 = (cols: number[]) =>
        jugarMesa("conecta-4", [...SENTAR_DOS, ...cols.map((c, i): [string, string, { c: number }] => ["jugar", i % 2 === 0 ? "ana" : "beto", { c }])]);

    test("las fichas caen hasta la fila más baja libre", () => {
        const e = jugarC4([3, 3, 3]);
        const t = e.tablero as ReturnType<typeof tableroC4Inicial>;
        expect(t.c[0 * COLUMNAS_C4 + 3]).toBe(0);
        expect(t.c[1 * COLUMNAS_C4 + 3]).toBe(1);
        expect(t.c[2 * COLUMNAS_C4 + 3]).toBe(0);
        expect(filaLibre(t.c, 3)).toBe(3);
        expect(filaLibre(t.c, 0)).toBe(0);
    });

    test("gana en horizontal, vertical y las dos diagonales", () => {
        expect(jugarC4([0, 0, 1, 1, 2, 2, 3]).fin).toMatchObject({ tipo: "victoria", ganador: 0 });
        expect(jugarC4([0, 1, 0, 1, 0, 1, 0]).fin).toMatchObject({ tipo: "victoria", ganador: 0 });
        // Diagonal ascendente ↗ para el rojo: (0,0) (1,1) (2,2) (3,3).
        const asc = jugarC4([0, 1, 1, 2, 3, 2, 2, 3, 4, 3, 3]);
        expect(asc.fin).toMatchObject({ tipo: "victoria", ganador: 0 });
        expect((asc.tablero as { linea: number[] }).linea).toEqual([0, 8, 16, 24]);
        // Diagonal descendente ↘ para el rojo: (0,3) (1,2) (2,1) (3,0).
        const desc = jugarC4([3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0]);
        expect(desc.fin).toMatchObject({ tipo: "victoria", ganador: 0 });
        expect((desc.tablero as { linea: number[] }).linea).toEqual([3, 9, 15, 21]);
    });

    test("tres seguidas no son cuatro, y una línea de cinco cuenta", () => {
        expect(jugarC4([0, 0, 1, 1, 2]).fin).toBeNull();
        const c = tableroC4Inicial().c.slice();
        [0, 1, 2, 4, 3].forEach((col) => {
            c[col] = 0;
        });
        expect(lineaDesde(c, 3)).toEqual([0, 1, 2, 3, 4]);
    });

    test("rechaza una columna llena, fuera de rango o el turno ajeno", () => {
        const llena = jugarC4(Array.from({ length: FILAS_C4 }, () => 0));
        expect(motorMesa.aplicar(llena, entrada("jugar", "ana", { c: 0 }, llena.n))).toMatchObject({ ok: false, motivo: "Esa columna está llena." });
        expect(motorMesa.aplicar(llena, entrada("jugar", "ana", { c: 7 }, llena.n))).toMatchObject({ ok: false });
        expect(motorMesa.aplicar(llena, entrada("jugar", "beto", { c: 1 }, llena.n))).toMatchObject({ ok: false, motivo: "No es tu turno." });
    });

    test("el tablero lleno sin línea son tablas", () => {
        // Partida de 42 jugadas sin ningún cuatro en línea (encontrada por búsqueda).
        const partida = [6, 4, 6, 2, 3, 0, 0, 2, 1, 6, 6, 2, 4, 6, 4, 5, 3, 6, 1, 5, 1, 3, 0, 5, 2, 1, 2, 0, 2, 3, 5, 4, 1, 1, 4, 3, 5, 4, 3, 5, 0, 0];
        const e = jugarC4(partida);
        expect(e.fin).toEqual({ tipo: "tablas", ganador: null, motivo: "Tablero lleno" });
        expect(e.turno).toBeNull();
    });
});

describe("mesa: asientos, rendición y doble asiento", () => {
    test("un asiento ocupado o ya tenido se rechaza; levantarse libera el sitio", () => {
        let e = jugarMesa("tres-en-raya", [["sentar", "ana", { nombre: "Ana" }]]);
        expect(motorMesa.aplicar(e, entrada("sentar", "ana", { nombre: "Ana" }, 1))).toMatchObject({ ok: false, motivo: "Ya tienes asiento." });
        expect(motorMesa.aplicar(e, entrada("sentar", "beto", { lado: 0, nombre: "B" }, 1))).toMatchObject({ ok: false, motivo: "Ese asiento ya está ocupado." });
        expect(motorMesa.aplicar(e, entrada("sentar", "beto", { lado: 5 }, 1))).toMatchObject({ ok: false });
        const r = motorMesa.aplicar(e, entrada("levantar", "ana", { lado: 0 }, 1));
        expect(r.ok).toBe(true);
        if (r.ok) e = r.estado;
        expect(e.asientos[0]).toBeNull();
        expect(motorMesa.aplicar(e, entrada("levantar", "ana", { lado: 0 }, 2))).toMatchObject({ ok: false });
    });

    test("nadie más puede levantar a otra persona", () => {
        const e = jugarMesa("tres-en-raya", [["sentar", "ana", { nombre: "Ana" }]]);
        expect(motorMesa.aplicar(e, entrada("levantar", "beto", { lado: 0 }, 1))).toMatchObject({ ok: false, motivo: "Ese no es tu asiento." });
    });

    test("la rendición da la victoria al otro asiento y solo la pide quien juega", () => {
        const e = jugarMesa("ajedrez", SENTAR_DOS);
        expect(motorMesa.aplicar(e, entrada("rendirse", "mirón", {}, e.n))).toMatchObject({ ok: false });
        const r = motorMesa.aplicar(e, entrada("rendirse", "beto", {}, e.n));
        expect(r.ok && r.estado.fin).toEqual({ tipo: "rendicion", ganador: 0, motivo: "Rendición" });
    });

    test("una persona puede ocupar los dos asientos (jugar en la misma pantalla)", () => {
        let e = jugarMesa("tres-en-raya", [
            ["sentar", "ana", { nombre: "Ana", lado: 0, doble: true }],
            ["sentar", "ana", { nombre: "Ana", lado: 1, doble: true }],
        ]);
        expect(e.iniciada).toBe(true);
        for (const c of [0, 4, 1]) {
            const r = motorMesa.aplicar(e, entrada("jugar", "ana", { c }, e.n));
            expect(r.ok).toBe(true);
            if (r.ok) e = r.estado;
        }
        expect(motorMesa.aplicar(jugarMesa("dibujo", []), entrada("sentar", "ana", { doble: true }, 0))).toMatchObject({ ok: false });
    });

    test("tras empezar ya no se puede sentar nadie y el diario no acepta nada tras el final", () => {
        const e = jugarMesa("tres-en-raya", SENTAR_DOS);
        expect(motorMesa.aplicar(e, entrada("sentar", "carla", {}, e.n))).toMatchObject({ ok: false });
    });

    test("nombres saneados: sin espacios raros ni longitud desmedida", () => {
        const e = jugarMesa("tres-en-raya", [["sentar", "ana", { nombre: `   ${"x".repeat(200)}   ` }]]);
        expect(e.asientos[0]?.nombre).toHaveLength(40);
        const vacio = jugarMesa("tres-en-raya", [["sentar", "ana", { nombre: "   " }]]);
        expect(vacio.asientos[0]?.nombre).toBe("Jugador");
    });

    test("entradas sin autor válido se rechazan", () => {
        const base = baseDePartida("tres-en-raya", "ana", 1);
        const e = motorMesa.inicial(base);
        expect(motorMesa.aplicar(e, { id: "x", n: 0, u: "", t: 1, k: "sentar" })).toMatchObject({ ok: false });
    });
});

describe("revancha con los mismos asientos", () => {
    const sentados = [
        { uid: "beto", nombre: "Beto" },
        { uid: "ana", nombre: "Ana" },
    ];

    test("una base con sentados arranca ya iniciada en un juego de dos (colores cambiados)", () => {
        const e = motorMesa.inicial(baseDePartida("ajedrez", "ana", 3, {}, sentados));
        expect(e.asientos.map((a) => a?.uid)).toEqual(["beto", "ana"]);
        expect(e.iniciada).toBe(true);
        expect(e.turno).toBe(0);
        // mueve beto (blancas), no ana
        expect(motorMesa.aplicar(e, entrada("jugar", "ana", { m: "e2e4" }, 0))).toMatchObject({ ok: false });
        expect(motorMesa.aplicar(e, entrada("jugar", "beto", { m: "e2e4" }, 0))).toMatchObject({ ok: true });
    });

    test("un asiento a medias no inicia y el resto se sienta como siempre", () => {
        const e = motorMesa.inicial(baseDePartida("tres-en-raya", "ana", 3, {}, [{ uid: "ana", nombre: "Ana" }, null]));
        expect(e.iniciada).toBe(false);
        const r = motorMesa.aplicar(e, entrada("sentar", "beto", { nombre: "Beto" }, 0));
        expect(r.ok && r.estado.iniciada).toBe(true);
    });

    test("el dibujo conserva a los sentados pero no empieza solo", () => {
        const e = motorMesa.inicial(baseDePartida("dibujo", "ana", 3, {}, [...sentados, { uid: "carla", nombre: "Carla" }, ...new Array(5).fill(null)]));
        expect(e.asientos.filter(Boolean)).toHaveLength(3);
        expect(e.iniciada).toBe(false);
    });

    test("nunca se fía de sentados manipulados: sin uid, duplicados y de más", () => {
        const base = {
            ...baseDePartida("tres-en-raya", "ana", 1),
            sentados: [{ uid: "x".repeat(200) }, { uid: "ana" }, { uid: "ana" }, "raro", null],
        };
        const e = motorMesa.inicial(base);
        expect(e.asientos).toHaveLength(2);
        expect(e.asientos[0]).toBeNull();
        expect(e.asientos[1]?.uid).toBe("ana");
        // un juego de tres o más (dibujo) no admite la misma persona en dos asientos
        const d = motorMesa.inicial({ ...baseDePartida("dibujo", "ana", 1), sentados: [{ uid: "ana" }, { uid: "ana" }] });
        expect(d.asientos.filter(Boolean)).toHaveLength(1);
    });
});
