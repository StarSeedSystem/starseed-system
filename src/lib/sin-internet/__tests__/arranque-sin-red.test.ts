import { describe, expect, it, vi } from "vitest";
import { crearArranque, ESPERA_DRENAJE_MS, recienLigadas, type DepsArranque, type LigaduraMin } from "../arranque-sin-red";

function montar(ligaduras: LigaduraMin[] = []) {
    const estado = { ligaduras, oyente: null as null | (() => void), temporizadores: [] as Array<{ f: () => void; ms: number; vivo: boolean }> };
    const aprender = vi.fn(async () => 1);
    const drenar = vi.fn(async () => 2);
    const espejo = vi.fn(async () => undefined);
    const deps: DepsArranque = {
        espejo,
        aprender,
        drenar,
        ligaduras: () => estado.ligaduras,
        suscribir: (cb) => {
            estado.oyente = cb;
            return () => {
                estado.oyente = null;
            };
        },
        poner: (f, ms) => {
            const t = { f, ms, vivo: true };
            estado.temporizadores.push(t);
            return t;
        },
        quitar: (h) => {
            (h as { vivo: boolean }).vivo = false;
        },
    };
    const correr = () => estado.temporizadores.filter((t) => t.vivo).forEach((t) => ((t.vivo = false), t.f()));
    return { estado, deps, aprender, drenar, espejo, correr };
}

describe("drenar el buzón al ligarse una neurona", () => {
    it("recienLigadas: solo las que no estaban", () => {
        expect(recienLigadas(new Set(["a"]), [{ neurona: "a", huella: "id:1" }, { neurona: "b", huella: "id:2" }])).toEqual(["b"]);
    });

    it("al quedar ligada la Mac, se aprende su huella y el buzón se reintenta solo (una vez, agrupado)", async () => {
        const m = montar();
        const a = crearArranque(m.deps);
        await Promise.resolve();
        await Promise.resolve();
        expect(m.espejo).toHaveBeenCalledTimes(1);
        expect(m.drenar).not.toHaveBeenCalled(); // nadie ligado todavía: los mensajes siguen «esperando»

        // El enlace sube (Bluetooth y red local casi a la vez).
        m.estado.ligaduras = [{ neurona: "mac", huella: "id:aaa", porCuenta: true, at: 1 }];
        await a.alCambiar();
        await a.alCambiar();
        expect(m.aprender).toHaveBeenCalledWith(m.estado.ligaduras);
        expect(m.estado.temporizadores.filter((t) => t.vivo)).toHaveLength(1);
        expect(m.estado.temporizadores[0].ms).toBe(ESPERA_DRENAJE_MS);
        m.correr();
        await Promise.resolve();
        expect(m.drenar).toHaveBeenCalledTimes(1);
    });

    it("sin neuronas nuevas no se vuelve a drenar; si cae y vuelve, sí", async () => {
        const m = montar([{ neurona: "mac", huella: "id:aaa", porCuenta: true }]);
        const a = crearArranque(m.deps);
        await new Promise((r) => setTimeout(r, 0));
        m.correr();
        const tras1 = m.drenar.mock.calls.length;
        expect(tras1).toBe(1);
        await a.alCambiar();
        m.correr();
        expect(m.drenar).toHaveBeenCalledTimes(tras1);
        m.estado.ligaduras = [];
        await a.alCambiar();
        m.estado.ligaduras = [{ neurona: "mac", huella: "id:aaa", porCuenta: true }];
        await a.alCambiar();
        m.correr();
        expect(m.drenar).toHaveBeenCalledTimes(tras1 + 1);
    });

    it("parar() cancela el reintento pendiente y la suscripción", async () => {
        const m = montar();
        const a = crearArranque(m.deps);
        m.estado.ligaduras = [{ neurona: "mac", huella: "id:aaa" }];
        await a.alCambiar();
        a.parar();
        m.correr();
        expect(m.drenar).not.toHaveBeenCalled();
        expect(m.estado.oyente).toBeNull();
    });
});
