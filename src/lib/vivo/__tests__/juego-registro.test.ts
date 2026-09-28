/**
 * El diario compartido: validar lo que llega, repetirlo, y fusionar versiones de forma
 * determinista (mismo resultado fusionen en el orden que fusionen).
 */
import { describe, expect, test } from "vitest";
import {
    LIMITE_ENTRADAS,
    compararEntradas,
    docVacio,
    esJsonPlano,
    fusionarDocs,
    fusionarLogs,
    fusionarRegistros,
    ganaRegistro,
    reconstruir,
    sanearDoc,
    sanearEntrada,
    sanearRegistro,
    validarRegistro,
} from "../juegos/registro";
import { motorMesa, type EstadoMesa } from "../juegos/mesa";
import type { Entrada, Registro } from "../juegos/tipos";
import { buscarMotorJuegos } from "@/lib/vivo/__pruebas__/juego-red-falsa";
import { entrada, registroDe } from "@/lib/vivo/__pruebas__/juego-utiles";

const sentadosAB = (): Entrada[] => [
    entrada("sentar", "ana", { nombre: "Ana" }, 0, 10),
    entrada("sentar", "beto", { nombre: "Beto" }, 1, 20),
];

describe("sanearEntrada", () => {
    test("acepta una entrada bien formada y descarta lo que sobra", () => {
        const e = sanearEntrada({ id: "a", n: 3, u: "ana", t: 5, k: "jugar", d: { c: 4 }, extra: "no" });
        expect(e).toEqual({ id: "a", n: 3, u: "ana", t: 5, k: "jugar", d: { c: 4 } });
    });

    test.each([
        ["sin id", { n: 0, u: "a", t: 0, k: "x" }],
        ["n negativo", { id: "a", n: -1, u: "a", t: 0, k: "x" }],
        ["n fraccionario", { id: "a", n: 1.5, u: "a", t: 0, k: "x" }],
        ["n gigante", { id: "a", n: LIMITE_ENTRADAS + 1, u: "a", t: 0, k: "x" }],
        ["sin usuario", { id: "a", n: 0, u: "", t: 0, k: "x" }],
        ["t infinito", { id: "a", n: 0, u: "a", t: Infinity, k: "x" }],
        ["t negativo", { id: "a", n: 0, u: "a", t: -5, k: "x" }],
        ["k vacío", { id: "a", n: 0, u: "a", t: 0, k: "" }],
        ["id larguísimo", { id: "x".repeat(60), n: 0, u: "a", t: 0, k: "x" }],
        ["datos que no son objeto", { id: "a", n: 0, u: "a", t: 0, k: "x", d: [1] }],
        ["datos con función", { id: "a", n: 0, u: "a", t: 0, k: "x", d: { f: () => 1 } }],
        ["datos con undefined", { id: "a", n: 0, u: "a", t: 0, k: "x", d: { f: undefined } }],
        ["datos enormes", { id: "a", n: 0, u: "a", t: 0, k: "x", d: { s: "z".repeat(30_000) } }],
        ["no es objeto", "hola"],
        ["null", null],
    ])("rechaza %s", (_nombre, x) => {
        expect(sanearEntrada(x)).toBeNull();
    });

    test("esJsonPlano rechaza ciclos, NaN y profundidad excesiva", () => {
        const ciclo: Record<string, unknown> = {};
        ciclo.yo = ciclo;
        expect(esJsonPlano(ciclo)).toBe(false);
        expect(esJsonPlano({ a: NaN })).toBe(false);
        let hondo: unknown = 1;
        for (let i = 0; i < 20; i++) hondo = { a: hondo };
        expect(esJsonPlano(hondo)).toBe(false);
        expect(esJsonPlano({ a: [1, "x", null, true, { b: 2 }] })).toBe(true);
    });
});

describe("sanearRegistro y sanearDoc", () => {
    test("un diario roto se corta en la primera entrada inválida", () => {
        const reg = registroDe("tres-en-raya");
        const bueno = sentadosAB();
        const r = sanearRegistro({ ...reg, log: [bueno[0], bueno[1], { id: "roto" }, entrada("jugar", "ana", { c: 0 }, 3)] });
        expect(r?.log).toHaveLength(2);
    });

    test("rechaza registros sin base, con gen no entera o con un diario gigante", () => {
        const reg = registroDe("tres-en-raya");
        expect(sanearRegistro({ ...reg, base: null })).toBeNull();
        expect(sanearRegistro({ ...reg, gen: 1.2 })).toBeNull();
        expect(sanearRegistro({ ...reg, gen: -1 })).toBeNull();
        expect(sanearRegistro({ ...reg, log: new Array(LIMITE_ENTRADAS + 1).fill(0) })).toBeNull();
        expect(sanearRegistro({ ...reg, id: "" })).toBeNull();
    });

    test("un documento que no es de una sala viva se ignora", () => {
        expect(sanearDoc({})).toBeNull();
        expect(sanearDoc({ vivo: { tipo: "documento" } })).toBeNull();
        expect(sanearDoc(null)).toBeNull();
        expect(sanearDoc([])).toBeNull();
        expect(sanearDoc({ vivo: { tipo: "juego" } })).toEqual(docVacio("juego"));
    });

    test("limpia historial y extras dudosos y respeta el tope del historial", () => {
        const resumen = (i: number) => ({ id: `r${i}`, juego: "ajedrez", gen: 1, t: i, nombres: ["a", "b"], uids: ["a", "b"], ganador: 0, motivo: "Jaque mate" });
        const doc = sanearDoc({
            vivo: { tipo: "juego" },
            historial: [...Array.from({ length: 50 }, (_, i) => resumen(i)), { id: 3 }, "x"],
            extras: {
                bueno: { v: 2, d: { a: 1 } },
                sinVersion: { d: 1 },
                conFuncion: { v: 1, d: () => 1 },
                [`x${"y".repeat(60)}`]: { v: 1, d: 1 },
            },
        });
        expect(doc?.historial).toHaveLength(30);
        expect(doc?.historial.at(-1)?.id).toBe("r49");
        expect(Object.keys(doc?.extras ?? {})).toEqual(["bueno", `x${"y".repeat(39)}`]);
    });

    test("no muta lo que recibe y es idempotente", () => {
        const reg = { ...registroDe("conecta-4"), log: sentadosAB() };
        const doc = { v: 1, vivo: { tipo: "juego" }, registro: reg, historial: [], extras: {} };
        const antes = JSON.stringify(doc);
        const uno = sanearDoc(doc);
        expect(JSON.stringify(doc)).toBe(antes);
        expect(sanearDoc(uno)).toEqual(uno);
    });
});

describe("reconstruir", () => {
    test("repite el diario y da el mismo estado siempre (determinismo)", () => {
        const reg: Registro = { ...registroDe("tres-en-raya"), log: [...sentadosAB(), entrada("jugar", "ana", { c: 4 }, 2, 30), entrada("jugar", "beto", { c: 0 }, 3, 40)] };
        const a = reconstruir(motorMesa, reg);
        const b = reconstruir(motorMesa, JSON.parse(JSON.stringify(reg)));
        expect(a.estado).toEqual(b.estado);
        expect(a.descartadas).toBe(0);
        expect(a.estado.n).toBe(4);
        expect(a.estado.turno).toBe(0);
    });

    test("se corta en la primera entrada ilegal y explica por qué", () => {
        const reg: Registro = {
            ...registroDe("tres-en-raya"),
            log: [...sentadosAB(), entrada("jugar", "ana", { c: 4 }, 2, 30), entrada("jugar", "ana", { c: 0 }, 3, 40), entrada("jugar", "beto", { c: 1 }, 4, 50)],
        };
        const r = reconstruir(motorMesa, reg);
        expect(r.log).toHaveLength(3);
        expect(r.descartadas).toBe(2);
        expect(r.motivo).toMatch(/turno/i);
    });

    test("un hueco en la numeración corta la cadena", () => {
        const reg: Registro = { ...registroDe("tres-en-raya"), log: [sentadosAB()[0], entrada("sentar", "beto", { nombre: "Beto" }, 2, 20)] };
        const r = reconstruir(motorMesa, reg);
        expect(r.log).toHaveLength(1);
        expect(r.motivo).toMatch(/hueco/i);
    });

    test("validarRegistro devuelve el mismo objeto si todo es válido", () => {
        const reg: Registro = { ...registroDe("tres-en-raya"), log: sentadosAB() };
        expect(validarRegistro(motorMesa, reg).registro).toBe(reg);
    });
});

describe("fusionar diarios", () => {
    const base = registroDe("tres-en-raya").base;
    const comun = sentadosAB();
    // Las dos personas juegan a la vez la jugada n=2: solo una puede ser la de ana en su turno.
    const anaCentro = entrada("jugar", "ana", { c: 4 }, 2, 30);
    const anaEsquina = entrada("jugar", "ana", { c: 0 }, 2, 25); // llegó antes (t menor)
    const betoTrasCentro = entrada("jugar", "beto", { c: 0 }, 3, 40);

    test("gana la candidata aceptada de menor (t,u,k,id) y la otra se descarta", () => {
        const r = fusionarLogs(motorMesa, base, [...comun, anaCentro, betoTrasCentro], [...comun, anaEsquina]);
        expect(r.log.map((e) => e.id)).toEqual([comun[0].id, comun[1].id, anaEsquina.id]);
        // la jugada de beto (sobre «centro») ya no es alcanzable: la casilla 0 está ocupada por ana
        expect(r.descartadas.map((e) => e.id).sort()).toEqual([anaCentro.id, betoTrasCentro.id].sort());
    });

    test("es simétrica y estable al repetir la fusión (orden y duplicados no importan)", () => {
        const A = [...comun, anaCentro, betoTrasCentro];
        const B = [...comun, anaEsquina];
        const ab = fusionarLogs(motorMesa, base, A, B).log.map((e) => e.id);
        const ba = fusionarLogs(motorMesa, base, B, A).log.map((e) => e.id);
        const aba = fusionarLogs(motorMesa, base, A, B, A).log.map((e) => e.id);
        expect(ba).toEqual(ab);
        expect(aba).toEqual(ab);
        const reFusion = fusionarLogs(motorMesa, base, fusionarLogs(motorMesa, base, A, B).log, B).log.map((e) => e.id);
        expect(reFusion).toEqual(ab);
    });

    test("todas las permutaciones de tres diarios dan lo mismo", () => {
        const C = [...comun, anaCentro];
        const D = [...comun, entrada("jugar", "ana", { c: 8 }, 2, 28)];
        const E = [...comun, anaEsquina, entrada("jugar", "beto", { c: 4 }, 3, 60)];
        const conjuntos = [C, D, E];
        const permutaciones = [
            [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
        ];
        const ids = permutaciones.map((p) => fusionarLogs(motorMesa, base, ...p.map((i) => conjuntos[i])).log.map((e) => e.id));
        for (const r of ids) expect(r).toEqual(ids[0]);
        expect(ids[0]).toHaveLength(4);
    });

    test("un diario que crece se suma sin perder nada", () => {
        const corto = [...comun, anaCentro];
        const largo = [...corto, betoTrasCentro];
        const r = fusionarLogs(motorMesa, base, corto, largo);
        expect(r.log.map((e) => e.id)).toEqual(largo.map((e) => e.id));
        expect(r.descartadas).toHaveLength(0);
    });

    test("una entrada ilegal en un diario ajeno no envenena la fusión", () => {
        const forjada = entrada("jugar", "beto", { c: 4 }, 2, 5); // no es el turno de beto
        const r = fusionarLogs(motorMesa, base, [...comun, anaCentro], [...comun, forjada]);
        expect(r.log.at(-1)?.id).toBe(anaCentro.id);
        expect(r.descartadas.map((e) => e.id)).toEqual([forjada.id]);
    });

    test("compararEntradas es un orden total consistente", () => {
        const xs = [
            { id: "b", n: 0, u: "u", t: 1, k: "a" },
            { id: "a", n: 0, u: "u", t: 1, k: "a" },
            { id: "a", n: 0, u: "v", t: 1, k: "a" },
            { id: "a", n: 0, u: "u", t: 0, k: "z" },
        ] as Entrada[];
        const ordenadas = xs.slice().sort(compararEntradas).map((e) => `${e.t}${e.u}${e.k}${e.id}`);
        expect(ordenadas).toEqual(xs.slice().reverse().sort(compararEntradas).map((e) => `${e.t}${e.u}${e.k}${e.id}`));
        expect(compararEntradas(xs[0], xs[0])).toBe(0);
    });
});

describe("fusionar registros y documentos", () => {
    const uno = registroDe("tres-en-raya", "ana", {}, "p1", 1);
    const dos: Registro = { ...registroDe("tres-en-raya", "ana", {}, "p2", 2), creada: 99 };

    test("gana la generación mayor (la revancha manda), sin mezclar diarios", () => {
        expect(ganaRegistro(dos, uno)).toBe(true);
        expect(ganaRegistro(uno, dos)).toBe(false);
        expect(fusionarRegistros(buscarMotorJuegos, uno, dos).registro?.id).toBe("p2");
        expect(fusionarRegistros(buscarMotorJuegos, dos, uno).registro?.id).toBe("p2");
    });

    test("a igual generación gana el más antiguo y, si empatan, el de menor id", () => {
        const viejo = { ...registroDe("tres-en-raya", "ana", {}, "zz", 1), creada: 5 };
        const nuevo = { ...registroDe("tres-en-raya", "ana", {}, "aa", 1), creada: 9 };
        expect(fusionarRegistros(buscarMotorJuegos, viejo, nuevo).registro?.id).toBe("zz");
        const a = { ...viejo, id: "a" };
        const b = { ...viejo, id: "b" };
        expect(fusionarRegistros(buscarMotorJuegos, a, b).registro?.id).toBe("a");
        expect(fusionarRegistros(buscarMotorJuegos, b, a).registro?.id).toBe("a");
    });

    test("con null gana el otro", () => {
        expect(fusionarRegistros(buscarMotorJuegos, null, uno).registro).toBe(uno);
        expect(fusionarRegistros(buscarMotorJuegos, uno, null).registro).toBe(uno);
        expect(fusionarRegistros(buscarMotorJuegos, null, null).registro).toBeNull();
    });

    test("mismo id y generación: se fusionan los diarios", () => {
        const a = { ...uno, log: sentadosAB() };
        const b = { ...uno, log: [sentadosAB()[0]] };
        const r = fusionarRegistros(buscarMotorJuegos, b, a);
        expect(r.registro?.log).toHaveLength(2);
    });

    test("documentos: historial por unión, extras por versión mayor, sin perder nada", () => {
        const r1 = { id: "r1", juego: "ajedrez", gen: 1, t: 10, nombres: ["a", "b"], uids: ["a", "b"], ganador: 0, motivo: "x" };
        const r2 = { id: "r2", juego: "ajedrez", gen: 2, t: 20, nombres: ["a", "b"], uids: ["a", "b"], ganador: 1, motivo: "y" };
        const A = { ...docVacio("juego"), historial: [r1], extras: { lienzo: { v: 3, d: "tres" }, solo: { v: 1, d: "a" } } };
        const B = { ...docVacio("juego"), historial: [r2, r1], extras: { lienzo: { v: 5, d: "cinco" } } };
        const ab = fusionarDocs(buscarMotorJuegos, A, B).doc;
        const ba = fusionarDocs(buscarMotorJuegos, B, A).doc;
        expect(ab?.historial.map((r) => r.id)).toEqual(["r1", "r2"]);
        expect(ab?.extras.lienzo).toEqual({ v: 5, d: "cinco" });
        expect(ab?.extras.solo).toEqual({ v: 1, d: "a" });
        expect(ba?.historial).toEqual(ab?.historial);
        expect(ba?.extras).toEqual(ab?.extras);
    });

    test("el resultado de fusionar no comparte estado mutable con los originales", () => {
        const A = { ...docVacio("juego"), registro: { ...uno, log: sentadosAB() } };
        const antes = JSON.stringify(A);
        fusionarDocs(buscarMotorJuegos, A, { ...docVacio("juego"), registro: { ...uno, log: [sentadosAB()[0]] } });
        expect(JSON.stringify(A)).toBe(antes);
    });
});

describe("las reglas se aplican igual en cualquier cliente", () => {
    test("una partida completa de tres en raya reconstruida dos veces da el mismo final", () => {
        const jugadas: [string, number][] = [["ana", 0], ["beto", 3], ["ana", 1], ["beto", 4], ["ana", 2]];
        const log = [...sentadosAB(), ...jugadas.map(([u, c], i) => entrada("jugar", u, { c }, i + 2, 100 + i))];
        const reg: Registro = { ...registroDe("tres-en-raya"), log };
        const e1 = reconstruir(motorMesa, reg).estado as EstadoMesa;
        const e2 = reconstruir(motorMesa, JSON.parse(JSON.stringify(reg))).estado as EstadoMesa;
        expect(e1).toEqual(e2);
        expect(e1.fin).toMatchObject({ tipo: "victoria", ganador: 0 });
        // y una jugada más, ilegal porque la partida terminó, no entra
        const extra: Registro = { ...reg, log: [...log, entrada("jugar", "beto", { c: 5 }, log.length, 999)] };
        expect(reconstruir(motorMesa, extra).descartadas).toBe(1);
    });
});
