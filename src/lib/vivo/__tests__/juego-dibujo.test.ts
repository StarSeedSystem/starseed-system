/**
 * Dibujo-adivina cooperativo: rondas, puntos, el compromiso hash de la palabra (revelación
 * honesta o ronda anulada), plazos, y las utilidades (SHA-256, palabras, comparación de intentos).
 */
import { describe, expect, test } from "vitest";
import {
    BONUS_TODOS,
    ESPERA_ELEGIR_MS,
    ESPERA_SALTAR_MS,
    PUNTOS_DIBUJANTE,
    compromisoDePalabra,
    puntosDelGrupo,
    puntosPorAcierto,
    type TableroDibujo,
} from "../juegos/dibujo";
import { baseDePartida, motorMesa, type EstadoMesa } from "../juegos/mesa";
import { PALABRAS_DIBUJO, esAcierto, esCercano, normalizarPalabra, opcionesDePalabras } from "../juegos/palabras";
import { sha256Hex } from "../juegos/sha256";
import { entrada } from "@/lib/vivo/__pruebas__/juego-utiles";

const T0 = 1_000_000;

function mesaDibujo(n = 3, opciones = {}): EstadoMesa {
    let e = motorMesa.inicial(baseDePartida("dibujo", "ana", 1, opciones));
    const nombres = ["ana", "beto", "carla", "dani"];
    for (let i = 0; i < n; i++) {
        const r = motorMesa.aplicar(e, entrada("sentar", nombres[i], { nombre: nombres[i] }, i, T0 + i));
        if (!r.ok) throw new Error(r.motivo);
        e = r.estado;
    }
    return e;
}

let contador = 0;
function paso(e: EstadoMesa, k: string, u: string, d: Record<string, string | number> | undefined, t: number) {
    contador += 1;
    return motorMesa.aplicar(e, { id: `d${contador}`, n: e.n, u, t, k, ...(d ? { d } : {}) });
}
function ok(e: EstadoMesa, k: string, u: string, d: Record<string, string | number> | undefined, t: number): EstadoMesa {
    const r = paso(e, k, u, d, t);
    if (!r.ok) throw new Error(`${k} de ${u}: ${r.motivo}`);
    return r.estado;
}
const tab = (e: EstadoMesa) => e.tablero as TableroDibujo;

/** Ronda 0 en curso: ana dibuja «gato» y el plazo empieza en T0+10_000. */
function rondaEnCurso(n = 3, opciones = {}) {
    let e = mesaDibujo(n, opciones);
    e = ok(e, "empezar", "ana", undefined, T0 + 5_000);
    e = ok(e, "elegir", "ana", { c: compromisoDePalabra("gato", "sal1") }, T0 + 10_000);
    return e;
}

describe("empezar", () => {
    test("no empieza solo, hacen falta dos personas y solo empieza quien está sentado", () => {
        const e = mesaDibujo(1);
        expect(e.iniciada).toBe(false);
        expect(paso(e, "empezar", "ana", undefined, T0).ok).toBe(false);
        const dos = mesaDibujo(2);
        expect(dos.iniciada).toBe(false);
        expect(paso(dos, "empezar", "mirón", undefined, T0).ok).toBe(false);
        const listo = ok(dos, "empezar", "beto", undefined, T0 + 1);
        expect(listo.iniciada).toBe(true);
        expect(tab(listo).fase).toBe("eligiendo");
        expect(tab(listo).dibujante).toBe(0);
        expect(tab(listo).totalRondas).toBe(2);
        expect(tab(listo).orden).toEqual([0, 1]);
    });

    test("con varias vueltas cada persona dibuja varias veces", () => {
        const e = ok(mesaDibujo(3, { vueltas: 2 }), "empezar", "ana", undefined, T0);
        expect(tab(e).totalRondas).toBe(6);
    });

    test("nadie más puede sentarse cuando ya empezó", () => {
        const e = ok(mesaDibujo(2), "empezar", "ana", undefined, T0);
        expect(paso(e, "sentar", "carla", { nombre: "Carla" }, T0 + 1).ok).toBe(false);
    });
});

describe("una ronda", () => {
    test("solo dibuja quien toca; el plazo cuenta desde que elige la palabra", () => {
        let e = ok(mesaDibujo(3), "empezar", "ana", undefined, T0);
        expect(paso(e, "elegir", "beto", { c: compromisoDePalabra("gato", "s") }, T0 + 1).ok).toBe(false);
        expect(paso(e, "elegir", "ana", { c: "no-es-un-hash" }, T0 + 1).ok).toBe(false);
        e = ok(e, "elegir", "ana", { c: compromisoDePalabra("gato", "s") }, T0 + 2_000);
        expect(tab(e).fase).toBe("dibujando");
        expect(tab(e).hasta).toBe(T0 + 2_000 + tab(e).duracionMs);
    });

    test("los aciertos dan puntos según la rapidez; el dibujante suma por cada acierto", () => {
        let e = rondaEnCurso();
        const inicio = T0 + 10_000;
        const dur = tab(e).duracionMs;
        e = ok(e, "acierto", "ana", { s: 1 }, inicio + 1_000);
        expect(tab(e).puntos[1]).toBe(puntosPorAcierto(dur - 1_000, dur));
        expect(tab(e).puntos[0]).toBe(PUNTOS_DIBUJANTE);
        e = ok(e, "acierto", "ana", { s: 2 }, inicio + dur - 1_000);
        // Han acertado todas las personas que adivinan: bonus para todo el grupo.
        expect(tab(e).puntos[2]).toBe(puntosPorAcierto(1_000, dur) + BONUS_TODOS);
        expect(tab(e).puntos[0]).toBe(PUNTOS_DIBUJANTE * 2 + BONUS_TODOS);
        expect(puntosDelGrupo(tab(e))).toBe(tab(e).puntos.reduce((a, b) => a + b, 0));
    });

    test("puntosPorAcierto: de 10 al instante a 5 al final, y acotado", () => {
        expect(puntosPorAcierto(75_000, 75_000)).toBe(10);
        expect(puntosPorAcierto(0, 75_000)).toBe(5);
        expect(puntosPorAcierto(-5, 75_000)).toBe(5);
        expect(puntosPorAcierto(999_999, 75_000)).toBe(10);
        expect(puntosPorAcierto(1, 0)).toBe(5);
    });

    test("no se puede acertar dos veces, acertar como dibujante, ni anotar un acierto sin ser el dibujante", () => {
        let e = rondaEnCurso();
        const t = T0 + 11_000;
        expect(paso(e, "acierto", "beto", { s: 2 }, t).ok).toBe(false);
        expect(paso(e, "acierto", "ana", { s: 0 }, t).ok).toBe(false);
        expect(paso(e, "acierto", "ana", { s: 7 }, t).ok).toBe(false);
        e = ok(e, "acierto", "ana", { s: 1 }, t);
        expect(paso(e, "acierto", "ana", { s: 1 }, t + 1).ok).toBe(false);
    });

    test("un acierto fuera de plazo se rechaza", () => {
        const e = rondaEnCurso();
        expect(paso(e, "acierto", "ana", { s: 1 }, T0 + 10_000 + tab(e).duracionMs + 60_000).ok).toBe(false);
    });

    test("revelar con la sal correcta cierra la ronda y guarda la palabra", () => {
        let e = rondaEnCurso();
        e = ok(e, "acierto", "ana", { s: 1 }, T0 + 12_000);
        e = ok(e, "revelar", "ana", { p: "gato", s: "sal1" }, T0 + 20_000);
        expect(tab(e).fase).toBe("revelada");
        expect(tab(e).palabra).toBe("gato");
        expect(tab(e).anulada).toBe(false);
        expect(tab(e).rondas).toEqual([{ dibujante: 0, palabra: "gato", aciertos: 1, anulada: false }]);
    });

    test("una palabra que no coincide con el compromiso ANULA la ronda y devuelve los puntos", () => {
        let e = rondaEnCurso();
        e = ok(e, "acierto", "ana", { s: 1 }, T0 + 12_000);
        expect(puntosDelGrupo(tab(e))).toBeGreaterThan(0);
        e = ok(e, "revelar", "ana", { p: "perro", s: "sal1" }, T0 + 20_000);
        expect(tab(e).anulada).toBe(true);
        expect(tab(e).palabra).toBeNull();
        expect(tab(e).puntos.every((p) => p === 0)).toBe(true);
    });

    test("la pista de letras es pública y, si no cuadra al revelar, la ronda se anula", () => {
        let e = ok(mesaDibujo(3), "empezar", "ana", undefined, T0 + 5_000);
        e = ok(e, "elegir", "ana", { c: compromisoDePalabra("gato", "sal1"), l: 4 }, T0 + 10_000);
        expect(tab(e).largo).toBe(4);
        const honesta = ok(e, "revelar", "ana", { p: "gato", s: "sal1" }, T0 + 20_000);
        expect(tab(honesta).anulada).toBe(false);
        // mismo compromiso, pero la pista mentía: 4 letras dichas, palabra de 4… con otra pista distinta
        let f = ok(mesaDibujo(3), "empezar", "ana", undefined, T0 + 5_000);
        f = ok(f, "elegir", "ana", { c: compromisoDePalabra("gato", "sal1"), l: 7 }, T0 + 10_000);
        expect(tab(ok(f, "revelar", "ana", { p: "gato", s: "sal1" }, T0 + 20_000)).anulada).toBe(true);
        // pista absurda: se ignora
        let g = ok(mesaDibujo(3), "empezar", "ana", undefined, T0 + 5_000);
        g = ok(g, "elegir", "ana", { c: compromisoDePalabra("gato", "sal1"), l: 999 }, T0 + 10_000);
        expect(tab(g).largo).toBeNull();
    });

    test("solo el dibujante revela", () => {
        const e = rondaEnCurso();
        expect(paso(e, "revelar", "beto", { p: "gato", s: "sal1" }, T0 + 20_000).ok).toBe(false);
    });

    test("saltar solo vale pasado el plazo (o el tiempo de elegir), y anula la ronda", () => {
        const e = rondaEnCurso();
        const hasta = tab(e).hasta as number;
        expect(paso(e, "saltar", "beto", {}, hasta + ESPERA_SALTAR_MS - 1).ok).toBe(false);
        const saltada = ok(e, "saltar", "beto", {}, hasta + ESPERA_SALTAR_MS);
        expect(tab(saltada).fase).toBe("revelada");
        expect(tab(saltada).anulada).toBe(true);

        const eligiendo = ok(mesaDibujo(3), "empezar", "ana", undefined, T0 + 100);
        expect(paso(eligiendo, "saltar", "carla", {}, T0 + 100 + ESPERA_ELEGIR_MS - 1).ok).toBe(false);
        expect(ok(eligiendo, "saltar", "carla", {}, T0 + 100 + ESPERA_ELEGIR_MS).n).toBe(eligiendo.n + 1);
    });

    test("pasar a la siguiente ronda rota el dibujante, y solo desde «revelada»", () => {
        let e = rondaEnCurso();
        expect(paso(e, "siguiente", "beto", {}, T0 + 15_000).ok).toBe(false);
        e = ok(e, "revelar", "ana", { p: "gato", s: "sal1" }, T0 + 20_000);
        e = ok(e, "siguiente", "beto", {}, T0 + 25_000);
        expect(tab(e).fase).toBe("eligiendo");
        expect(tab(e).ronda).toBe(1);
        expect(tab(e).dibujante).toBe(1);
        expect(tab(e).aciertos).toEqual([]);
        expect(e.turno).toBe(1);
    });

    test("tras la última ronda la partida termina, con ganador por puntos o sin él si empatan", () => {
        let e = ok(mesaDibujo(2), "empezar", "ana", undefined, T0);
        for (let ronda = 0; ronda < 2; ronda++) {
            const dibujante = ronda === 0 ? "ana" : "beto";
            const otro = ronda === 0 ? 1 : 0;
            const t = T0 + 100_000 * (ronda + 1);
            e = ok(e, "elegir", dibujante, { c: compromisoDePalabra("luna", "s") }, t);
            e = ok(e, "acierto", dibujante, { s: otro }, t + 1_000);
            e = ok(e, "revelar", dibujante, { p: "luna", s: "s" }, t + 5_000);
            e = ok(e, "siguiente", "ana", {}, t + 6_000);
        }
        expect(tab(e).fase).toBe("fin");
        // Ronda simétrica: mismos puntos para los dos, así que empatan.
        expect(e.fin).toEqual({ tipo: "terminada", ganador: null, motivo: "Fin de las rondas" });
        expect(e.turno).toBeNull();
    });

    test("gana quien más puntos tiene al final", () => {
        let e = ok(mesaDibujo(2), "empezar", "ana", undefined, T0);
        e = ok(e, "elegir", "ana", { c: compromisoDePalabra("luna", "s") }, T0 + 1_000);
        e = ok(e, "acierto", "ana", { s: 1 }, T0 + 2_000);
        e = ok(e, "revelar", "ana", { p: "luna", s: "s" }, T0 + 3_000);
        e = ok(e, "siguiente", "ana", {}, T0 + 4_000);
        e = ok(e, "elegir", "beto", { c: compromisoDePalabra("sol", "s") }, T0 + 5_000);
        e = ok(e, "revelar", "beto", { p: "sol", s: "s" }, T0 + 6_000); // nadie acierta
        e = ok(e, "siguiente", "ana", {}, T0 + 7_000);
        expect(e.fin?.ganador).toBe(1);
    });

    test("no hay rendición en el Dibujo-adivina y los datos raros no rompen nada", () => {
        const e = rondaEnCurso();
        expect(paso(e, "rendirse", "ana", {}, T0 + 12_000).ok).toBe(false);
        expect(paso(e, "revelar", "ana", { p: "x".repeat(100), s: "s" }, T0 + 12_000).ok).toBe(false);
        expect(paso(e, "revelar", "ana", { p: "", s: "s" }, T0 + 12_000).ok).toBe(false);
        expect(paso(e, "volar", "ana", {}, T0 + 12_000).ok).toBe(false);
    });
});

describe("palabras e intentos", () => {
    test("el banco de palabras no tiene repetidas ni vacías", () => {
        expect(new Set(PALABRAS_DIBUJO.map(normalizarPalabra)).size).toBe(PALABRAS_DIBUJO.length);
        expect(PALABRAS_DIBUJO.length).toBeGreaterThanOrEqual(100);
        expect(PALABRAS_DIBUJO.every((p) => p.trim().length >= 3)).toBe(true);
    });

    test("tres opciones distintas, con cualquier azar", () => {
        for (const azar of [() => 0, () => 0.999999, Math.random, () => 0.5]) {
            const o = opcionesDePalabras(azar, 3);
            expect(o).toHaveLength(3);
            expect(new Set(o).size).toBe(3);
        }
    });

    test("acierto: sin acentos ni mayúsculas, plural y una errata en palabras largas", () => {
        expect(esAcierto("GATO", "gato")).toBe(true);
        expect(esAcierto("arbol", "árbol")).toBe(true);
        expect(esAcierto("gatos", "gato")).toBe(true);
        expect(esAcierto("globo aerostatico", "globo aerostático")).toBe(true);
        expect(esAcierto("mariposs", "mariposa")).toBe(true); // una errata
        expect(esAcierto("gata", "gato")).toBe(false); // errata en palabra corta: no vale
        expect(esAcierto("perro", "gato")).toBe(false);
        expect(esAcierto("", "gato")).toBe(false);
    });

    test("cercano: casi, pero no es", () => {
        expect(esCercano("mariposas", "mariposa")).toBe(false); // ya es acierto
        expect(esCercano("maripo", "mariposa")).toBe(true); // dos letras menos: casi
        expect(esCercano("maripos", "mariposa")).toBe(false); // una errata ya cuenta como acierto
        expect(esCercano("un elefante", "elefante")).toBe(true); // contiene la palabra, pero no es un acierto
        expect(esAcierto("un elefante", "elefante")).toBe(false);
        expect(esCercano("xyz", "elefante")).toBe(false);
    });

    test("el compromiso depende de la palabra normalizada y de la sal", () => {
        expect(compromisoDePalabra("Gato", "s")).toBe(compromisoDePalabra("gato", "s"));
        expect(compromisoDePalabra("gato", "s")).not.toBe(compromisoDePalabra("gato", "t"));
        expect(compromisoDePalabra("gato", "s")).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("sha256", () => {
    test("vectores de referencia", () => {
        expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
        );
    });

    test("mensajes largos y con acentos (UTF-8)", () => {
        expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
        expect(sha256Hex("árbol")).toBe(sha256Hex("árbol"));
        expect(sha256Hex("árbol")).not.toBe(sha256Hex("arbol"));
    });
});

describe("mensajes efímeros del dibujo", () => {
    test("sanea intentos: sin control, recortados, y rechaza lo raro", async () => {
        const { sanearIntento, sanearVeredicto, veredictoDe } = await import("../juegos/dibujo-mensajes");
        expect(sanearIntento({ i: "a1", u: "beto", x: "  un   gato\n" })).toEqual({ i: "a1", u: "beto", x: "un gato" });
        expect(sanearIntento({ i: "a1", u: "beto", x: "x".repeat(200) })?.x).toHaveLength(60);
        expect(sanearIntento({ i: "hola mundo", u: "beto", x: "a" })).toBeNull();
        expect(sanearIntento({ i: "a1", u: "", x: "a" })).toBeNull();
        expect(sanearIntento({ i: "a1", u: "beto", x: "   " })).toBeNull();
        expect(sanearIntento([])).toBeNull();
        expect(sanearVeredicto({ i: "a1", u: "beto", ok: true })).toEqual({ i: "a1", u: "beto", ok: true });
        // un veredicto de acierto NUNCA lleva el texto
        expect(sanearVeredicto({ i: "a1", u: "beto", ok: true, x: "gato" })).toEqual({ i: "a1", u: "beto", ok: true });
        expect(sanearVeredicto({ i: "a1", u: "beto", ok: false })).toBeNull();
        expect(sanearVeredicto({ i: "a1", u: "beto", ok: false, x: "perro", cerca: true })).toEqual({ i: "a1", u: "beto", ok: false, x: "perro", cerca: true });
        expect(veredictoDe({ i: "a1", u: "beto", x: "Gato" }, "gato")).toEqual({ i: "a1", u: "beto", ok: true });
        expect(veredictoDe({ i: "a1", u: "beto", x: "perro" }, "gato")).toEqual({ i: "a1", u: "beto", ok: false, x: "perro" });
        expect(veredictoDe({ i: "a1", u: "beto", x: "maripo" }, "mariposa")).toMatchObject({ ok: false, cerca: true });
    });
});
