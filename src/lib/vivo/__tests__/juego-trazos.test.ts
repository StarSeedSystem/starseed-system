/** El lienzo del Dibujo-adivina: aplicar mensajes, huecos, fotos, límites y saneado. */
import { describe, expect, test } from "vitest";
import {
    ALTO_LIENZO,
    ANCHO_LIENZO,
    MAX_NUMEROS_LIENZO,
    MAX_NUMEROS_TRAZO,
    MAX_TRAZOS,
    PALETA,
    adoptarFoto,
    aplicarMensajeLienzo,
    añadirPunto,
    claveRonda,
    conviene,
    lienzoAJson,
    lienzoDesdeJson,
    lienzoVacio,
    loteDe,
    lotesDeLienzo,
    nuevoTrazoLocal,
    quitarUltimoTrazo,
    sanearLote,
    sanearMensajeLienzo,
    totalNumeros,
    type Lienzo,
    type MensajeLienzo,
} from "../juegos/dibujo-trazos";

const R = claveRonda("reg1", 0);

function dibujar(l: Lienzo, puntos: [number, number][], c = 1, g = 1): { l: Lienzo; i: number } {
    const n = nuevoTrazoLocal(l, c, g, puntos[0][0], puntos[0][1]);
    if (!n) throw new Error("lleno");
    let cur = n.lienzo;
    for (const [x, y] of puntos.slice(1)) cur = añadirPunto(cur, n.trazo.i, x, y, 0);
    return { l: cur, i: n.trazo.i };
}

describe("dibujar en local", () => {
    test("un trazo crece punto a punto y descarta los que no aportan", () => {
        let { l, i } = dibujar(lienzoVacio(R), [[10, 10], [50, 50]]);
        expect(l.trazos[0].p).toEqual([10, 10, 50, 50]);
        const antes = l;
        l = añadirPunto(l, i, 50.4, 50.4, 2); // a menos de 2 unidades
        expect(l).toBe(antes);
        l = añadirPunto(l, i, 60, 60, 2);
        expect(l.trazos[0].p).toHaveLength(6);
    });

    test("las coordenadas se acotan al lienzo y se redondean", () => {
        const { l } = dibujar(lienzoVacio(R), [[-50, 20.6], [5000, 9999]]);
        expect(l.trazos[0].p).toEqual([0, 21, ANCHO_LIENZO, ALTO_LIENZO]);
    });

    test("deshacer quita el último trazo", () => {
        let { l } = dibujar(lienzoVacio(R), [[1, 1], [9, 9]]);
        ({ l } = dibujar(l, [[5, 5], [30, 30]]));
        const r = quitarUltimoTrazo(l);
        expect(r?.quitado).toBe(1);
        expect(r?.lienzo.trazos).toHaveLength(1);
        expect(quitarUltimoTrazo(lienzoVacio(R))).toBeNull();
    });

    test("respeta los límites de trazos y de puntos", () => {
        let l = lienzoVacio(R);
        for (let k = 0; k < MAX_TRAZOS; k++) {
            const n = nuevoTrazoLocal(l, 0, 0, k % 1000, 5);
            if (!n) throw new Error("no debería llenarse aún");
            l = n.lienzo;
        }
        expect(nuevoTrazoLocal(l, 0, 0, 1, 1)).toBeNull();
        const { l: largo, i } = dibujar(lienzoVacio(R), [[0, 0]]);
        let cur = largo;
        for (let k = 1; k < MAX_NUMEROS_TRAZO; k++) cur = añadirPunto(cur, i, k % 1000, (k * 7) % 750, 0);
        expect(cur.trazos[0].p.length).toBeLessThanOrEqual(MAX_NUMEROS_TRAZO);
        expect(totalNumeros(cur)).toBeLessThanOrEqual(MAX_NUMEROS_LIENZO);
    });
});

describe("mensajes de difusión", () => {
    function emisor() {
        let l = lienzoVacio(R);
        let rev = 0;
        const enviados = new Map<number, number>();
        const mensajes: MensajeLienzo[] = [];
        return {
            get l() {
                return l;
            },
            trazo(puntos: [number, number][]) {
                const d = dibujar(l, puntos);
                l = d.l;
                const t = l.trazos.find((z) => z.i === d.i)!;
                const lote = loteDe(t, enviados.get(t.i) ?? 0)!;
                enviados.set(t.i, t.p.length);
                rev += 1;
                l = { ...l, rev };
                const m = { r: R, rev, l: [lote] };
                mensajes.push(m);
                return m;
            },
            borrar() {
                rev += 1;
                l = { ...l, trazos: [], rev };
                const m: MensajeLienzo = { r: R, rev, borrar: true };
                mensajes.push(m);
                return m;
            },
            quitar() {
                const q = quitarUltimoTrazo(l)!;
                rev += 1;
                l = { ...q.lienzo, rev };
                const m: MensajeLienzo = { r: R, rev, quitar: q.quitado };
                mensajes.push(m);
                return m;
            },
            mensajes,
        };
    }

    test("quien recibe en orden reproduce el mismo lienzo", () => {
        const e = emisor();
        e.trazo([[1, 1], [20, 20], [40, 5]]);
        e.trazo([[100, 100], [120, 130]]);
        e.quitar();
        e.trazo([[7, 7], [8, 90]]);
        let r = lienzoVacio();
        for (const m of e.mensajes) r = aplicarMensajeLienzo(r, m);
        expect(r.trazos).toEqual(e.l.trazos);
        expect(r.sig).toBe(e.l.sig);
        expect(r.rev).toBe(e.mensajes.length);
        expect(r.hueco).toBe(false);
    });

    test("un mensaje repetido o viejo no cambia nada (mismo objeto)", () => {
        const e = emisor();
        const m1 = e.trazo([[1, 1], [20, 20]]);
        const r = aplicarMensajeLienzo(lienzoVacio(), m1);
        expect(aplicarMensajeLienzo(r, m1)).toBe(r);
    });

    test("borrar vacía el lienzo, y se ignora un mensaje de otra ronda", () => {
        const e = emisor();
        let r = aplicarMensajeLienzo(lienzoVacio(), e.trazo([[1, 1], [20, 20]]));
        r = aplicarMensajeLienzo(r, e.borrar());
        expect(r.trazos).toHaveLength(0);
        const otra = aplicarMensajeLienzo(r, { r: claveRonda("reg1", 5), rev: 99, borrar: true });
        expect(otra).toBe(r);
    });

    test("un mensaje perdido se detecta (hueco) y una foto lo repara", () => {
        const e = emisor();
        const m1 = e.trazo([[1, 1], [20, 20]]);
        e.trazo([[50, 50], [70, 70]]); // se pierde
        const m3 = e.trazo([[300, 300], [310, 310]]);
        let r = aplicarMensajeLienzo(lienzoVacio(), m1);
        r = aplicarMensajeLienzo(r, m3);
        expect(r.hueco).toBe(true);
        expect(r.trazos).toHaveLength(2);
        const foto = lienzoDesdeJson(lienzoAJson({ ...e.l, hueco: false }))!;
        expect(conviene(r, foto)).toBe(true);
        const reparado = adoptarFoto(r, foto);
        expect(reparado.trazos).toEqual(e.l.trazos);
        expect(reparado.hueco).toBe(false);
    });

    test("un trozo que salta números de un trazo marca hueco sin corromper", () => {
        const e = emisor();
        const m1 = e.trazo([[1, 1], [20, 20]]);
        let r = aplicarMensajeLienzo(lienzoVacio(), m1);
        const salto: MensajeLienzo = { r: R, rev: 2, l: [{ i: 0, c: 1, g: 1, o: 10, p: [5, 5] }] };
        r = aplicarMensajeLienzo(r, salto);
        expect(r.trazos[0].p).toEqual([1, 1, 20, 20]);
        expect(r.hueco).toBe(true);
    });

    test("el solapamiento parcial solo añade lo nuevo", () => {
        let r = aplicarMensajeLienzo(lienzoVacio(), { r: R, rev: 1, l: [{ i: 0, c: 1, g: 1, o: 0, p: [1, 1, 2, 2] }] });
        r = aplicarMensajeLienzo(r, { r: R, rev: 2, l: [{ i: 0, c: 1, g: 1, o: 2, p: [2, 2, 3, 3] }] });
        expect(r.trazos[0].p).toEqual([1, 1, 2, 2, 3, 3]);
    });

    test("una foto vieja no pisa un lienzo más reciente", () => {
        const e = emisor();
        e.trazo([[1, 1], [20, 20]]);
        const vieja = lienzoDesdeJson(lienzoAJson(e.l))!;
        e.trazo([[100, 100], [200, 200]]);
        const actual = { ...e.l, hueco: false };
        expect(conviene(actual, vieja)).toBe(false);
        expect(adoptarFoto(actual, vieja)).toBe(actual);
    });
});

describe("saneado de lo que llega de fuera", () => {
    test("lote válido y lotes inválidos", () => {
        expect(sanearLote({ i: 0, c: 1, g: 1, o: 0, p: [1, 2, 3, 4] })).toEqual({ i: 0, c: 1, g: 1, o: 0, p: [1, 2, 3, 4] });
        expect(sanearLote({ i: 0, c: 99, g: 1, o: 0, p: [1, 2] })).toBeNull(); // color fuera de la paleta
        expect(sanearLote({ i: 0, c: 1, g: 9, o: 0, p: [1, 2] })).toBeNull();
        expect(sanearLote({ i: 0, c: 1, g: 1, o: 1, p: [1, 2] })).toBeNull(); // offset impar
        expect(sanearLote({ i: 0, c: 1, g: 1, o: 0, p: [1, 2, 3] })).toBeNull(); // impar
        expect(sanearLote({ i: 0, c: 1, g: 1, o: 0, p: [] })).toBeNull();
        expect(sanearLote({ i: 0, c: 1, g: 1, o: 0, p: [1, "x"] })).toBeNull();
        expect(sanearLote({ i: 0, c: 1, g: 1, o: 0, p: new Array(1000).fill(3) })).toBeNull();
        expect(sanearLote({ i: -1, c: 1, g: 1, o: 0, p: [1, 2] })).toBeNull();
        expect(sanearLote("hola")).toBeNull();
        expect(sanearLote({ i: 0, c: 1, g: 1, o: 0, p: [NaN, 2] })).toBeNull();
    });

    test("acota las coordenadas fuera del lienzo", () => {
        const l = sanearLote({ i: 0, c: 1, g: 1, o: 0, p: [-10, 99999, 1.6, 2.2] });
        expect(l?.p).toEqual([0, ALTO_LIENZO, 2, 2]);
    });

    test("mensaje: rechaza lo que no encaja", () => {
        expect(sanearMensajeLienzo({ r: R, rev: 1, borrar: true })).toEqual({ r: R, rev: 1, borrar: true });
        expect(sanearMensajeLienzo({ r: "", rev: 1 })).toBeNull();
        expect(sanearMensajeLienzo({ r: R, rev: -1 })).toBeNull();
        expect(sanearMensajeLienzo({ r: R, rev: 1, l: "x" })).toBeNull();
        expect(sanearMensajeLienzo({ r: R, rev: 1, l: [{ i: 0 }] })).toBeNull();
        expect(sanearMensajeLienzo({ r: R, rev: 1, l: new Array(200).fill({ i: 0, c: 1, g: 1, o: 0, p: [1, 2] }) })).toBeNull();
        expect(sanearMensajeLienzo({ r: R, rev: 1, quitar: 1.5 })).toBeNull();
        expect(sanearMensajeLienzo(null)).toBeNull();
    });

    test("foto: ida y vuelta, y rechazos", () => {
        let { l } = dibujar(lienzoVacio(R), [[1, 1], [5, 9], [40, 40]], 3, 2);
        l = { ...l, rev: 4 };
        const json = lienzoAJson(l);
        expect(lienzoDesdeJson(JSON.parse(JSON.stringify(json)))).toEqual({ ...l, hueco: false });
        expect(lienzoDesdeJson({ r: R, rev: 1, t: [[0, 99, 0, [1, 2]]] })).toBeNull();
        expect(lienzoDesdeJson({ r: R, rev: 1, t: [[0, 0, 0, [1, 2]], [0, 0, 0, [3, 4]]] })).toBeNull(); // id repetido
        expect(lienzoDesdeJson({ r: R, rev: 1, t: new Array(MAX_TRAZOS + 1).fill([0, 0, 0, [1, 2]]) })).toBeNull();
        expect(lienzoDesdeJson({ r: R, rev: 1, t: "x" })).toBeNull();
        expect(lienzoDesdeJson(null)).toBeNull();
    });
});

describe("repartir un lienzo grande", () => {
    test("los lotes reconstruyen el mismo lienzo y ningún mensaje pasa del tope", () => {
        let l = lienzoVacio(R);
        for (let k = 0; k < 6; k++) {
            const pts: [number, number][] = Array.from({ length: 200 }, (_, j) => [(j * 5 + k) % 1000, (j * 3 + k * 40) % 750]);
            l = dibujar(l, pts, k % PALETA.length, k % 4).l;
        }
        const mensajes = lotesDeLienzo(l, 300);
        expect(mensajes.length).toBeGreaterThan(1);
        for (const m of mensajes) expect(m.reduce((a, x) => a + x.p.length, 0)).toBeLessThanOrEqual(300);
        let r = lienzoVacio(R);
        mensajes.forEach((lotes, k) => {
            r = aplicarMensajeLienzo(r, { r: R, rev: k + 1, l: lotes });
        });
        expect(r.trazos).toEqual(l.trazos);
    });
});
