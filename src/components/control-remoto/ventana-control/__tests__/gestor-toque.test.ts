import { beforeEach, describe, expect, it } from "vitest";
import { GestorToque } from "../gestor-toque";
import type { EntradaControl } from "../tipos";

type Gesto = Extract<EntradaControl, { tipo: "gesto" }>;

function mundo(maxDedos = 10) {
    let t = 1000;
    const enviados: Gesto[] = [];
    let cola: (() => void)[] = [];
    let temporizadores: { f: () => void; en: number }[] = [];
    const g = new GestorToque({
        enviar: (e) => enviados.push(e),
        ahora: () => t,
        fotograma: (f) => {
            cola.push(f);
            return () => { cola = cola.filter((x) => x !== f); };
        },
        esperar: (f, ms) => {
            const x = { f, en: t + ms };
            temporizadores.push(x);
            return () => { temporizadores = temporizadores.filter((y) => y !== x); };
        },
        maxDedos: () => maxDedos,
    });
    return {
        g, enviados,
        avanza(ms: number) {
            t += ms;
            for (const x of temporizadores.filter((y) => y.en <= t)) { temporizadores = temporizadores.filter((y) => y !== x); x.f(); }
        },
        fotograma() { const c = cola; cola = []; c.forEach((f) => f()); },
        pendientes: () => cola.length,
    };
}

let m: ReturnType<typeof mundo>;
beforeEach(() => { m = mundo(); });

describe("VEN1115L · ratón, un dedo", () => {
    it("pulsar, mover y soltar: un gesto por fotograma con sigue:true y uno final con sigue:false", () => {
        m.g.abajo("p1", 0.1, 0.2);
        m.avanza(10);
        m.g.mover("p1", 0.2, 0.3);
        m.avanza(10);
        m.g.mover("p1", 0.3, 0.4);
        expect(m.enviados).toHaveLength(0); // nada hasta el fotograma
        m.fotograma();
        expect(m.enviados).toEqual([{ tipo: "gesto", sigue: true, dedos: [{ id: 0, puntos: [[0.1, 0.2, 0], [0.2, 0.3, 10], [0.3, 0.4, 10]] }] }]);
        m.avanza(20);
        m.g.levantar("p1", 0.4, 0.5);
        expect(m.enviados).toHaveLength(2);
        expect(m.enviados[1]).toEqual({ tipo: "gesto", sigue: false, dedos: [{ id: 0, puntos: [[0.4, 0.5, 20]] }] });
        expect(m.g.hayDedos()).toBe(false);
        m.fotograma();
        expect(m.enviados).toHaveLength(2);
    });

    it("muchos movimientos en un fotograma son una sola orden", () => {
        m.g.abajo("p1", 0, 0);
        for (let i = 1; i <= 20; i++) { m.avanza(1); m.g.mover("p1", i / 100, 0); }
        m.fotograma();
        expect(m.enviados).toHaveLength(1);
        expect(m.enviados[0].dedos[0].puntos).toHaveLength(21);
    });

    it("no pasa de unas 60 órdenes por segundo aunque haya fotogramas más rápidos", () => {
        m.g.abajo("p1", 0, 0);
        m.fotograma();
        m.avanza(5);
        m.g.mover("p1", 0.5, 0.5);
        m.fotograma(); // 5 ms después del último envío: espera al siguiente
        expect(m.enviados).toHaveLength(1);
        m.avanza(12);
        m.fotograma();
        expect(m.enviados).toHaveLength(2);
    });

    it("un clic sin mover es un apoyo y una suelta", () => {
        m.g.abajo("p1", 0.5, 0.5);
        m.g.levantar("p1", 0.5, 0.5);
        expect(m.enviados.map((e) => e.sigue)).toEqual([false]);
        expect(m.enviados[0].dedos[0].puntos).toEqual([[0.5, 0.5, 0]]);
    });
});

describe("VEN1115L · pantalla táctil, varios dedos", () => {
    it("cada dedo lleva su propio id y se juntan en la misma orden", () => {
        m.g.abajo("p7", 0.2, 0.2);
        m.g.abajo("p9", 0.8, 0.8);
        m.avanza(8);
        m.g.mover("p7", 0.25, 0.25);
        m.g.mover("p9", 0.75, 0.75);
        m.fotograma();
        expect(m.enviados).toHaveLength(1);
        expect(m.enviados[0].dedos.map((d) => d.id)).toEqual([0, 1]);
        expect(m.enviados[0].sigue).toBe(true);
    });

    it("más dedos de los que admite el aparato se ignoran", () => {
        const w = mundo(2);
        expect(w.g.abajo("a", 0, 0)).toBe(true);
        expect(w.g.abajo("b", 1, 1)).toBe(true);
        expect(w.g.abajo("c", 0.5, 0.5)).toBe(false);
        w.fotograma();
        expect(w.enviados[0].dedos).toHaveLength(2);
    });

    it("UNI1115M · al levantar un dedo habiendo otro, el otro sigue abajo y el levantado ya no se nombra", () => {
        m.g.abajo("a", 0.1, 0.1);
        m.g.abajo("b", 0.9, 0.9);
        m.g.levantar("a", 0.1, 0.1);
        // 1.º el último punto de los dos (sigue), 2.º ya sin «a»: lo nativo lo suelta al instante; «b» no se re-apoya
        expect(m.enviados).toHaveLength(2);
        expect(m.enviados[0].sigue).toBe(true);
        expect(m.enviados[0].dedos.map((d) => d.id)).toEqual([0, 1]);
        expect(m.enviados[1]).toEqual({ tipo: "gesto", sigue: true, dedos: [{ id: 1, puntos: [[0.9, 0.9, 0]] }] });
        expect(m.g.hayDedos()).toBe(true);
        m.g.levantar("b", 0.9, 0.9);
        expect(m.enviados.at(-1)).toEqual({ tipo: "gesto", sigue: false, dedos: [{ id: 1, puntos: [[0.9, 0.9, 0]] }] });
    });
    it("UNI1115M · cada gesto que sigue nombra todos los dedos apoyados (el que no se movió repite su punto)", () => {
        m.g.abajo("a", 0.1, 0.1);
        m.g.abajo("b", 0.9, 0.9);
        m.fotograma();
        m.avanza(20);
        m.g.mover("a", 0.2, 0.2);
        m.fotograma();
        const u = m.enviados.at(-1)!;
        expect(u.sigue).toBe(true);
        expect(u.dedos.map((d) => d.id)).toEqual([0, 1]);
        expect(u.dedos[1].puntos).toEqual([[0.9, 0.9, 0]]);
    });
});

describe("VEN1115L · finales: puntero perdido, desenfoque, cierre", () => {
    it("un puntero perdido (sin punto final) termina el dedo donde estaba", () => {
        m.g.abajo("p1", 0.3, 0.3);
        m.fotograma();
        m.g.levantar("p1");
        expect(m.enviados.at(-1)).toEqual({ tipo: "gesto", sigue: false, dedos: [{ id: 0, puntos: [[0.3, 0.3, 0]] }] });
        expect(m.g.hayDedos()).toBe(false);
    });

    it("terminarTodo levanta cada dedo con un solo gesto final", () => {
        m.g.abajo("a", 0.1, 0.1);
        m.g.abajo("b", 0.7, 0.2);
        m.fotograma();
        m.g.terminarTodo();
        const f = m.enviados.at(-1)!;
        expect(f.sigue).toBe(false);
        expect(f.dedos.map((d) => d.id)).toEqual([0, 1]);
        expect(m.g.hayDedos()).toBe(false);
        m.g.terminarTodo(); // idempotente
        expect(m.enviados.at(-1)).toBe(f);
    });

    it("sin dedos, terminarTodo no envía nada", () => {
        m.g.terminarTodo();
        expect(m.enviados).toEqual([]);
    });
});

describe("VEN1115L · rueda y pellizco", () => {
    it("la rueda es un dedo que se arrastra y se levanta tras un silencio", () => {
        m.g.desplazar(0.5, 0.5, 0, -0.1);
        m.avanza(20);
        m.g.desplazar(0.5, 0.5, 0, -0.1);
        m.fotograma();
        m.enviados[0].dedos[0].puntos.map((p) => p[1]).forEach((y, i) => expect(y).toBeCloseTo([0.5, 0.4, 0.3][i]));
        expect(m.enviados[0].sigue).toBe(true);
        m.avanza(200);
        expect(m.enviados.at(-1)!.sigue).toBe(false);
        expect(m.g.hayDedos()).toBe(false);
    });

    it("al llegar al borde el trazo acaba y el siguiente giro empieza otro en el puntero", () => {
        m.g.desplazar(0.5, 0.05, 0, -0.2);
        expect(m.enviados.at(-1)!.sigue).toBe(false);
        expect(m.g.hayDedos()).toBe(false);
        m.g.desplazar(0.5, 0.6, 0, -0.1);
        expect(m.g.hayDedos()).toBe(true);
    });

    it("Ctrl + rueda son dos dedos alrededor del puntero que se separan o se juntan", () => {
        m.g.pellizcar(0.5, 0.5, -10); // abrir
        m.fotograma();
        const a = m.enviados[0];
        expect(a.dedos.map((d) => d.id)).toEqual([0, 1]);
        const x = (d: number, i: number) => a.dedos[d].puntos[i][0];
        expect(x(1, 0) - x(0, 0)).toBeCloseTo(0.2);
        expect(x(1, 1) - x(0, 1)).toBeGreaterThan(0.2);
        expect((x(0, 1) + x(1, 1)) / 2).toBeCloseTo(0.5); // centrado en el puntero
        m.avanza(200);
        expect(m.enviados.at(-1)!.sigue).toBe(false);
        expect(m.g.hayDedos()).toBe(false);
    });

    it("el pellizco no se hace con un solo dedo disponible y no envía nada", () => {
        const w = mundo(1);
        w.g.pellizcar(0.5, 0.5, 5);
        w.fotograma();
        expect(w.enviados).toEqual([]);
        expect(w.g.hayDedos()).toBe(false);
    });

    it("el pellizco acotado a la vista nunca sale de 0..1", () => {
        m.g.pellizcar(0.02, 0.5, -200);
        m.fotograma();
        for (const d of m.enviados[0].dedos) for (const p of d.puntos) { expect(p[0]).toBeGreaterThanOrEqual(0); expect(p[0]).toBeLessThanOrEqual(1); }
    });

    it("en escritorio, desplazar con dos dedos manda un gesto paralelo y clicDerecho envía dos dedos quietos", () => {
        m.g.desplazar(0.5, 0.5, 0, -0.08, true);
        m.fotograma();
        expect(m.enviados[0].dedos).toHaveLength(2);
        expect(m.enviados[0].sigue).toBe(true);
        expect(m.enviados[0].dedos[0].puntos.map((p) => p[1])).toEqual([0.5, 0.42]);
        expect(m.enviados[0].dedos[1].puntos.map((p) => p[1])).toEqual([0.5, 0.42]);
        m.avanza(200);
        expect(m.enviados.at(-1)!.sigue).toBe(false);

        const antes = m.enviados.length;
        expect(m.g.clicDerecho(0.3, 0.4)).toBe(true);
        expect(m.enviados[antes]).toMatchObject({ tipo: "gesto", sigue: false });
        expect(m.enviados[antes].dedos).toHaveLength(2);
    });

    it("en táctil, pasos mínimos de rueda se acumulan antes de tocar para evitar clics", () => {
        m.g.desplazar(0.5, 0.5, 0, -0.01, false);
        m.fotograma();
        expect(m.enviados).toHaveLength(0);
        m.g.desplazar(0.5, 0.5, 0, -0.03, false);
        m.fotograma();
        expect(m.enviados).toHaveLength(1);
        expect(m.enviados[0].dedos[0].puntos.map((p) => p[1])[1]).toBeCloseTo(0.46);
    });
});
