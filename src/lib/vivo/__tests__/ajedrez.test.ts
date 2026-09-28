/**
 * Motor de ajedrez: el generador de movimientos se valida contra los recuentos de referencia
 * (perft) de la posición inicial y de las cuatro posiciones «difíciles» de la comunidad, que
 * ejercitan el enroque, la captura al paso (incluida la clavada) y las promociones; además, casos
 * concretos de cada regla especial y del final de partida.
 */
import { describe, expect, test } from "vitest";
import {
    FEN_INICIAL,
    aFEN,
    aSAN,
    aUci,
    aplicarMov,
    casillaDe,
    desdeFEN,
    enJaque,
    finDePartida,
    materialInsuficiente,
    movDesdeUci,
    movimientosLegales,
    nombreCasilla,
    perft,
    posicionInicial,
    type PosAjedrez,
} from "../juegos/ajedrez";

function jugar(pos: PosAjedrez, ...ucis: string[]): PosAjedrez {
    let p = pos;
    for (const u of ucis) {
        const m = movDesdeUci(p, u);
        if (!m) throw new Error(`Movimiento ilegal en la prueba: ${u} en ${aFEN(p)}`);
        p = aplicarMov(p, m);
    }
    return p;
}

const ucisLegales = (p: PosAjedrez) => movimientosLegales(p).map(aUci).sort();

describe("perft — el generador cuenta lo mismo que las referencias", () => {
    test("posición inicial: 20 / 400 / 8902 / 197281", () => {
        const p = posicionInicial();
        expect(perft(p, 1)).toBe(20);
        expect(perft(p, 2)).toBe(400);
        expect(perft(p, 3)).toBe(8902);
        expect(perft(p, 4)).toBe(197281);
    });

    test("Kiwipete (enroques, capturas, clavadas): 48 / 2039 / 97862", () => {
        const p = desdeFEN("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
        expect(perft(p, 1)).toBe(48);
        expect(perft(p, 2)).toBe(2039);
        expect(perft(p, 3)).toBe(97862);
    });

    test("posición 3 (al paso con clavada, finales de torre): 14 / 191 / 2812 / 43238", () => {
        const p = desdeFEN("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
        expect(perft(p, 1)).toBe(14);
        expect(perft(p, 2)).toBe(191);
        expect(perft(p, 3)).toBe(2812);
        expect(perft(p, 4)).toBe(43238);
    });

    test("posición 4 (promociones y enroques en jaque): 6 / 264 / 9467", () => {
        const p = desdeFEN("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
        expect(perft(p, 1)).toBe(6);
        expect(perft(p, 2)).toBe(264);
        expect(perft(p, 3)).toBe(9467);
    });

    test("posición 5 (coronación con captura): 44 / 1486 / 62379", () => {
        const p = desdeFEN("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8");
        expect(perft(p, 1)).toBe(44);
        expect(perft(p, 2)).toBe(1486);
        expect(perft(p, 3)).toBe(62379);
    });
});

describe("FEN y casillas", () => {
    test("la posición inicial vuelve a su FEN y las casillas tienen nombre", () => {
        expect(aFEN(posicionInicial())).toBe(FEN_INICIAL);
        expect(casillaDe("a1")).toBe(0);
        expect(casillaDe("h8")).toBe(63);
        expect(nombreCasilla(28)).toBe("e4");
        expect(casillaDe("i9")).toBe(-1);
    });

    test("un FEN roto lanza, y el resto de la partida no depende de eso", () => {
        expect(() => desdeFEN("esto no es un fen")).toThrow();
        const p = desdeFEN("r3k2r/8/8/8/8/8/8/R3K2R b Kq e3 12 30");
        expect(aFEN(p)).toBe("r3k2r/8/8/8/8/8/8/R3K2R b Kq e3 12 30");
    });
});

describe("enroque", () => {
    const base = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";

    test("ambos enroques son legales con el camino libre", () => {
        const l = ucisLegales(desdeFEN(base));
        expect(l).toContain("e1g1");
        expect(l).toContain("e1c1");
    });

    test("el enroque mueve también la torre y pierde los derechos del bando", () => {
        const p = jugar(desdeFEN(base), "e1g1");
        expect(p.t[casillaDe("g1")]).toBe(6);
        expect(p.t[casillaDe("f1")]).toBe(4);
        expect(p.t[casillaDe("h1")]).toBe(0);
        expect(p.enroque & 3).toBe(0);
        expect(p.enroque & 12).toBe(12);
        const largo = jugar(desdeFEN(base), "e1c1");
        expect(largo.t[casillaDe("c1")]).toBe(6);
        expect(largo.t[casillaDe("d1")]).toBe(4);
        expect(largo.t[casillaDe("a1")]).toBe(0);
    });

    test("no se puede enrocar con una pieza en medio", () => {
        const l = ucisLegales(desdeFEN("r3k2r/8/8/8/8/8/8/R2QK1NR w KQkq - 0 1"));
        expect(l).not.toContain("e1g1");
        expect(l).not.toContain("e1c1");
    });

    test("no se puede enrocar estando en jaque", () => {
        const l = ucisLegales(desdeFEN("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1"));
        expect(l).not.toContain("e1g1");
        expect(l).not.toContain("e1c1");
    });

    test("no se puede pasar por una casilla atacada, pero sí enrocar largo si solo se ataca b1", () => {
        // Torre negra en f8 ataca f1: el corto pasa por f1 (ilegal). El largo sigue permitido.
        const pasando = ucisLegales(desdeFEN("4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1"));
        expect(pasando).not.toContain("e1g1");
        expect(pasando).toContain("e1c1");
        // Torre negra en b8 ataca b1: el rey no pasa por b1, así que el largo es legal.
        const soloB1 = ucisLegales(desdeFEN("1r2k3/8/8/8/8/8/8/R3K2R w KQ - 0 1"));
        expect(soloB1).toContain("e1c1");
    });

    test("no se puede caer en casilla atacada al enrocar", () => {
        const l = ucisLegales(desdeFEN("4k1r1/8/8/8/8/8/8/R3K2R w KQ - 0 1"));
        expect(l).not.toContain("e1g1");
    });

    test("mover la torre o el rey (o que la capturen) pierde el derecho", () => {
        let p = jugar(desdeFEN(base), "h1h2", "e8e7", "h2h1", "e7e8");
        expect(ucisLegales(p)).not.toContain("e1g1");
        expect(ucisLegales(p)).toContain("e1c1");
        p = jugar(desdeFEN("r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1"), "g2h1");
        expect(p.enroque & 1).toBe(0);
    });

    test("con los derechos del FEN pero sin torre en su casilla, no hay enroque", () => {
        const l = ucisLegales(desdeFEN("4k3/8/8/8/8/8/8/4K3 w KQ - 0 1"));
        expect(l).not.toContain("e1g1");
    });
});

describe("captura al paso", () => {
    test("es legal justo después del avance doble y caduca si no se toma", () => {
        let p = desdeFEN("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1");
        p = jugar(p, "d7d5");
        expect(p.alPaso).toBe(casillaDe("d6"));
        expect(ucisLegales(p)).toContain("e5d6");
        const tras = jugar(p, "e5d6");
        expect(tras.t[casillaDe("d5")]).toBe(0);
        expect(tras.t[casillaDe("d6")]).toBe(1);
        // Si se juega otra cosa, el derecho desaparece.
        const otra = jugar(p, "e1e2", "e8e7");
        expect(ucisLegales(otra)).not.toContain("e5d6");
    });

    test("también para las negras", () => {
        let p = desdeFEN("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1");
        p = jugar(p, "e2e4");
        expect(ucisLegales(p)).toContain("d4e3");
        const tras = jugar(p, "d4e3");
        expect(tras.t[casillaDe("e4")]).toBe(0);
        expect(tras.t[casillaDe("e3")]).toBe(-1);
    });

    test("es ilegal si deja al propio rey en jaque (clavada en la fila)", () => {
        const p = desdeFEN("8/8/8/KPp4r/8/8/8/4k3 w - c6 0 1");
        expect(ucisLegales(p)).not.toContain("b5c6");
    });
});

describe("promoción", () => {
    test("un peón que llega a la última fila ofrece las cuatro piezas", () => {
        const l = ucisLegales(desdeFEN("8/P7/8/8/8/8/8/k6K w - - 0 1"));
        expect(l.filter((u) => u.startsWith("a7a8")).sort()).toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
    });

    test("un movimiento de peón a la última fila sin pieza elegida no es legal", () => {
        expect(movDesdeUci(desdeFEN("8/P7/8/8/8/8/8/k6K w - - 0 1"), "a7a8")).toBeNull();
    });

    test("corona en dama, en caballo (subpromoción) y captura coronando", () => {
        const base = desdeFEN("1n6/P7/8/8/8/8/8/k6K w - - 0 1");
        expect(jugar(base, "a7a8q").t[casillaDe("a8")]).toBe(5);
        expect(jugar(base, "a7a8n").t[casillaDe("a8")]).toBe(2);
        const captura = jugar(base, "a7b8r");
        expect(captura.t[casillaDe("b8")]).toBe(4);
        expect(captura.t[casillaDe("a7")]).toBe(0);
    });

    test("las negras coronan hacia la fila 1", () => {
        const p = jugar(desdeFEN("K6k/8/8/8/8/8/p7/8 b - - 0 1"), "a2a1q");
        expect(p.t[casillaDe("a1")]).toBe(-5);
    });
});

describe("jaque, mate y ahogado", () => {
    test("el mate del loco termina con victoria de las negras", () => {
        const p = jugar(posicionInicial(), "f2f3", "e7e5", "g2g4", "d8h4");
        expect(enJaque(p)).toBe(true);
        expect(finDePartida(p)).toEqual({ tipo: "mate", ganador: 1 });
        expect(movimientosLegales(p)).toHaveLength(0);
    });

    test("el mate del pastor termina con victoria de las blancas", () => {
        const p = jugar(posicionInicial(), "e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7");
        expect(finDePartida(p)).toEqual({ tipo: "mate", ganador: 0 });
    });

    test("rey ahogado: sin movimientos y sin jaque son tablas", () => {
        const p = desdeFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
        expect(enJaque(p)).toBe(false);
        expect(finDePartida(p)).toEqual({ tipo: "tablas", motivo: "ahogado" });
    });

    test("en jaque solo valen los movimientos que lo resuelven", () => {
        const p = desdeFEN("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
        expect(enJaque(p)).toBe(true);
        // El rey se mueve fuera de la columna o captura la torre (que no está defendida).
        expect(ucisLegales(p)).toEqual(["e1d1", "e1e2", "e1f1"]);
        // Con la torre defendida por un alfil, capturar deja de ser legal.
        const defendida = desdeFEN("4k3/8/8/8/6b1/8/4r3/4K3 w - - 0 1");
        expect(ucisLegales(defendida)).toEqual(["e1d1", "e1f1"]);
    });

    test("una pieza clavada no puede abandonar la línea del rey", () => {
        const p = desdeFEN("4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1");
        expect(ucisLegales(p).filter((u) => u.startsWith("e2"))).toEqual([]);
    });
});

describe("tablas automáticas", () => {
    test("material insuficiente", () => {
        expect(materialInsuficiente(desdeFEN("8/8/8/4k3/8/8/8/4K3 w - - 0 1").t)).toBe(true);
        expect(materialInsuficiente(desdeFEN("8/8/8/4k3/8/8/8/3BK3 w - - 0 1").t)).toBe(true);
        expect(materialInsuficiente(desdeFEN("8/8/8/4k3/8/8/8/3NK3 w - - 0 1").t)).toBe(true);
        // Alfiles del mismo color de casilla (c1 y f8 son oscuras).
        expect(materialInsuficiente(desdeFEN("5b2/8/8/4k3/8/8/8/2B1K3 w - - 0 1").t)).toBe(true);
        // Alfiles de distinto color: se puede mate.
        expect(materialInsuficiente(desdeFEN("2b5/8/8/4k3/8/8/8/2B1K3 w - - 0 1").t)).toBe(false);
        expect(materialInsuficiente(desdeFEN("8/8/8/4k3/8/8/4P3/4K3 w - - 0 1").t)).toBe(false);
        expect(finDePartida(desdeFEN("8/8/8/4k3/8/8/8/4K3 w - - 0 1"))).toEqual({ tipo: "tablas", motivo: "material" });
    });

    test("regla de los 50 movimientos (100 medios)", () => {
        expect(finDePartida(desdeFEN("4k3/8/8/8/8/8/4R3/4K3 w - - 99 80"))).toBeNull();
        expect(finDePartida(desdeFEN("4k3/8/8/8/8/8/4R3/4K3 w - - 100 80"))).toEqual({ tipo: "tablas", motivo: "cincuenta" });
    });

    test("triple repetición", () => {
        let p = desdeFEN("4k3/8/8/8/8/8/R7/4K3 w - - 0 1");
        const ida = ["a2a3", "e8d8", "a3a2", "d8e8"];
        p = jugar(p, ...ida);
        expect(finDePartida(p)).toBeNull();
        p = jugar(p, ...ida);
        expect(finDePartida(p)).toEqual({ tipo: "tablas", motivo: "repeticion" });
    });

    test("un movimiento de peón rompe la cuenta de repeticiones", () => {
        let p = desdeFEN("4k3/p7/8/8/8/8/R7/4K3 w - - 0 1");
        p = jugar(p, "a2a3", "e8d8", "a3a2", "d8e8", "a2a3", "e8d8", "a3a2", "a7a6", "e1d1");
        expect(p.rep.length).toBeLessThan(4);
    });
});

describe("notación", () => {
    test("SAN en español: peón, pieza, captura, enroque, coronación, jaque y mate", () => {
        const inicio = posicionInicial();
        expect(aSAN(inicio, movDesdeUci(inicio, "e2e4")!)).toBe("e4");
        expect(aSAN(inicio, movDesdeUci(inicio, "g1f3")!)).toBe("Cf3");

        const cap = jugar(inicio, "e2e4", "d7d5");
        expect(aSAN(cap, movDesdeUci(cap, "e4d5")!)).toBe("exd5");

        const enroque = desdeFEN("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
        expect(aSAN(enroque, movDesdeUci(enroque, "e1g1")!)).toBe("O-O");
        expect(aSAN(enroque, movDesdeUci(enroque, "e1c1")!)).toBe("O-O-O");

        const corona = desdeFEN("8/P7/8/8/8/8/8/k6K w - - 0 1");
        expect(aSAN(corona, movDesdeUci(corona, "a7a8q")!)).toBe("a8=D+");

        const mate = jugar(posicionInicial(), "e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6");
        expect(aSAN(mate, movDesdeUci(mate, "h5f7")!)).toBe("Dxf7#");
    });

    test("desambigua con la columna, la fila o ambas", () => {
        const dosTorres = desdeFEN("4k3/8/8/8/8/8/8/R6R w - - 0 1");
        expect(aSAN(dosTorres, movDesdeUci(dosTorres, "a1d1")!)).toBe("Tad1");
        expect(aSAN(dosTorres, movDesdeUci(dosTorres, "h1d1")!)).toBe("Thd1");
        const columna = desdeFEN("4k3/8/8/8/R7/8/8/R3K3 w - - 0 1");
        expect(aSAN(columna, movDesdeUci(columna, "a1a2")!)).toBe("T1a2");
        const ambas = desdeFEN("7k/8/2Q1Q3/8/2Q5/8/8/4K3 w - - 0 1");
        expect(aSAN(ambas, movDesdeUci(ambas, "c6d5")!)).toBe("Dc6d5");
    });

    test("movDesdeUci rechaza cadenas mal formadas y movimientos ilegales", () => {
        const p = posicionInicial();
        expect(movDesdeUci(p, "e2e5")).toBeNull();
        expect(movDesdeUci(p, "z9z9")).toBeNull();
        expect(movDesdeUci(p, "")).toBeNull();
        expect(movDesdeUci(p, "e7e5")).toBeNull(); // pieza del rival
        expect(movDesdeUci(p, 42 as unknown as string)).toBeNull();
    });
});

describe("pureza y determinismo", () => {
    test("aplicar un movimiento no muta la posición de partida", () => {
        const p = posicionInicial();
        const antes = JSON.stringify(p);
        jugar(p, "e2e4", "e7e5", "g1f3");
        expect(JSON.stringify(p)).toBe(antes);
    });

    test("la misma secuencia da exactamente la misma posición serializada", () => {
        const secuencia = ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6"];
        const a = JSON.stringify(jugar(posicionInicial(), ...secuencia));
        const b = JSON.stringify(jugar(posicionInicial(), ...secuencia));
        expect(a).toBe(b);
        expect(JSON.parse(a)).toEqual(JSON.parse(b));
    });
});
