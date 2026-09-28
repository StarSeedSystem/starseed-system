import { describe, expect, it } from "vitest";
import {
    avataresDePresencia,
    colorDeClave,
    crearEmisorPose,
    crearEstrangulador,
    intervaloPara,
    mismosAvatares,
    sanearPose,
    type Pose,
} from "@/lib/vivo/espacial/avatares";

/** Reloj de mentira con temporizadores manuales. */
function reloj() {
    let t = 0;
    let sig = 0;
    const tareas = new Map<number, { en: number; fn: () => void }>();
    return {
        ahora: () => t,
        programar: (fn: () => void, ms: number) => {
            const id = ++sig;
            tareas.set(id, { en: t + ms, fn });
            return id;
        },
        cancelar: (id: unknown) => {
            tareas.delete(id as number);
        },
        avanzar(ms: number) {
            const fin = t + ms;
            for (;;) {
                const proxima = [...tareas.entries()].filter(([, v]) => v.en <= fin).sort((a, b) => a[1].en - b[1].en)[0];
                if (!proxima) break;
                t = proxima[1].en;
                tareas.delete(proxima[0]);
                proxima[1].fn();
            }
            t = fin;
        },
    };
}

const pose = (x: number, giro = 0): Pose => ({ p: [x, 1.6, 0], q: [0, Math.sin(giro / 2), 0, Math.cos(giro / 2)] });

describe("emisor de pose · presupuesto de tráfico", () => {
    it("no pasa de 10 Hz aunque la cámara se mueva a 60 fps", () => {
        const r = reloj();
        const enviados: Pose[] = [];
        const e = crearEmisorPose({ enviar: (p) => enviados.push(p), ...r });
        e.fijarOtros(1);
        enviados.length = 0;
        for (let f = 0; f < 60; f++) {
            e.actualizar(pose(f * 0.05));
            r.avanzar(1000 / 60);
        }
        r.avanzar(200);
        // 1 s de movimiento continuo → como mucho 10 envíos + el de cola.
        expect(enviados.length).toBeLessThanOrEqual(11);
        expect(enviados.length).toBeGreaterThanOrEqual(9);
        // El último enviado es la pose final (nadie se queda con una posición vieja).
        expect(enviados[enviados.length - 1].p[0]).toBeCloseTo(59 * 0.05);
    });

    it("no envía nada si no te mueves", () => {
        const r = reloj();
        let n = 0;
        const e = crearEmisorPose({ enviar: () => n++, ...r });
        e.actualizar(pose(0));
        e.fijarOtros(2);
        const tras = n;
        for (let f = 0; f < 120; f++) {
            e.actualizar(pose(0.001)); // temblor de menos de 1 cm
            r.avanzar(16);
        }
        expect(n).toBe(tras);
    });

    it("a solas no emite ni una pose (nadie la recibiría)", () => {
        const r = reloj();
        let n = 0;
        const e = crearEmisorPose({ enviar: () => n++, ...r });
        for (let f = 0; f < 60; f++) {
            e.actualizar(pose(f));
            r.avanzar(16);
        }
        expect(n).toBe(0);
    });

    it("con la pestaña oculta se para y al volver sigue", () => {
        const r = reloj();
        let n = 0;
        const e = crearEmisorPose({ enviar: () => n++, ...r });
        e.fijarOtros(1);
        e.pausar();
        for (let f = 0; f < 60; f++) {
            e.actualizar(pose(f));
            r.avanzar(16);
        }
        expect(n).toBe(0);
        e.reanudar();
        e.actualizar(pose(100));
        expect(n).toBe(1);
    });

    it("cuando entra alguien, le manda una pose aunque estés quieto", () => {
        const r = reloj();
        let n = 0;
        const e = crearEmisorPose({ enviar: () => n++, ...r });
        e.actualizar(pose(3));
        e.fijarOtros(1);
        expect(n).toBe(1);
        r.avanzar(500);
        e.fijarOtros(2);
        expect(n).toBe(2);
    });

    it("con mucha gente baja la frecuencia", () => {
        expect(intervaloPara(0)).toBe(0);
        expect(intervaloPara(1)).toBe(100);
        expect(intervaloPara(5)).toBe(150);
        expect(intervaloPara(12)).toBe(250);
        const r = reloj();
        let n = 0;
        const e = crearEmisorPose({ enviar: () => n++, ...r });
        e.fijarOtros(10);
        n = 0;
        for (let f = 0; f < 60; f++) {
            e.actualizar(pose(f));
            r.avanzar(1000 / 60);
        }
        expect(n).toBeLessThanOrEqual(5);
    });
});

describe("estrangulador de arrastres", () => {
    it("primero ya, luego como mucho cada intervalo, y el último siempre llega", () => {
        const r = reloj();
        const vistos: number[] = [];
        const s = crearEstrangulador<number>((v) => vistos.push(v), 100, r);
        for (let i = 0; i < 30; i++) {
            s.empujar(i);
            r.avanzar(10);
        }
        r.avanzar(200);
        expect(vistos[0]).toBe(0);
        expect(vistos[vistos.length - 1]).toBe(29);
        expect(vistos.length).toBeLessThanOrEqual(5);
    });
});

describe("avatares · saneado y presencia", () => {
    it("normaliza el cuaternión y rechaza basura", () => {
        const p = sanearPose({ p: [1, 2, 3], q: [0, 0, 0, 2] });
        expect(p?.q).toEqual([0, 0, 0, 1]);
        expect(sanearPose({ p: [1, 2], q: [0, 0, 0, 1] })).toBeNull();
        expect(sanearPose({ p: [1, 2, "x"], q: [0, 0, 0, 1] })).toBeNull();
    });

    it("lista a los demás (sin mí), con la última meta de cada clave y color estable", () => {
        const estado = {
            "yo:1": [{ nombre: "Yo" }],
            "ana:2": [{ nombre: "Ana vieja", desde: 5 }, { nombre: "Ana", desde: 5, modo: "vr" }],
            "leo:3": [{ nombre: "Leo", desde: 1, color: "no-es-color" }],
        };
        const lista = avataresDePresencia(estado, "yo:1");
        expect(lista.map((a) => a.nombre)).toEqual(["Leo", "Ana"]);
        expect(lista[1].modo).toBe("vr");
        expect(lista[0].color).toBe(colorDeClave("leo:3"));
        expect(mismosAvatares(lista, avataresDePresencia(estado, "yo:1"))).toBe(true);
    });
});
