import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * LLA1112A · la conversación directa sobrevive a que su enlace se caiga (apagar el Wi-Fi de la tableta) y vuelva.
 * Caso real (prueba 39, 04:29:15–04:29:50 UTC): «La llamada falló… Se perdió el enlace directo» al apagar el Wi-Fi de la
 * tableta en mitad de una llamada directa. Antes: `suscribirEnlacesLocales` acababa la conversación en el acto.
 */

type ModLlamada = typeof import("@/lib/malla/llamada-directa");
type ModRegistro = typeof import("@/lib/malla/registro-enlaces-locales");
type Enlace = import("@/lib/malla/registro-enlaces-locales").EnlaceLocalVivo;

interface Motor {
    neurona: string;
    nombre: string;
    ld: ModLlamada;
    reg: ModRegistro;
}

async function motor(neurona: string, nombre: string): Promise<Motor> {
    vi.resetModules();
    const reg = await import("@/lib/malla/registro-enlaces-locales");
    const ld = await import("@/lib/malla/llamada-directa");
    return { neurona, nombre, ld, reg };
}

interface Extremo extends Enlace {
    pistas: Array<MediaStream | null>;
    entrar(d: string): void;
    otro: Extremo | null;
}

function extremo(id: string, de: Motor, hacia: Motor): Extremo {
    const oyentes = new Set<(d: string | ArrayBuffer) => void>();
    const e: Extremo = {
        id,
        par: { nombre: hacia.nombre, neuronDeviceId: hacia.neurona, origen: "red-local-nativa" },
        desde: Date.now(),
        otro: null,
        pistas: [],
        abierto: () => true,
        rttMs: () => 5,
        ruta: () => null,
        capacidadKbps: () => null,
        enviar: (t) => {
            const o = e.otro;
            if (o) queueMicrotask(() => o.entrar(t));
            return true;
        },
        enviarBinario: () => true,
        bufferedAmount: () => 0,
        alMensaje: (cb) => {
            oyentes.add(cb);
            return () => oyentes.delete(cb);
        },
        ponerPistas: async (s) => {
            e.pistas.push(s);
            return true;
        },
        alFlujoRemoto: () => () => undefined,
        cerrar: () => undefined,
        entrar: (d) => {
            for (const f of Array.from(oyentes)) f(d);
        },
    };
    de.reg.registrarEnlaceLocal(e);
    return e;
}

function enlazar(sesion: string, a: Motor, b: Motor): [Extremo, Extremo] {
    const ea = extremo(`local:${sesion}`, a, b);
    const eb = extremo(`local:${sesion}`, b, a);
    ea.otro = eb;
    eb.otro = ea;
    return [ea, eb];
}

function respaldo(yo: Motor, otro: () => Motor) {
    return {
        yo: () => ({ neurona: yo.neurona, nombre: yo.nombre }),
        enviar: (neurona: string, o: Record<string, unknown>) => {
            const b = otro();
            if (neurona === b.neurona) queueMicrotask(() => b.ld.recibirSenalLlamada({ neurona: yo.neurona, nombre: yo.nombre }, o));
        },
    };
}

function streamFalso(): MediaStream {
    const pista = { kind: "audio", enabled: true, stop: vi.fn() };
    return {
        getTracks: () => [pista],
        getAudioTracks: () => [pista],
        getVideoTracks: () => [],
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
    } as unknown as MediaStream;
}

const pasa = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
};

let mac: Motor;
let tableta: Motor;

async function enCurso(): Promise<[Extremo, Extremo]> {
    const par = enlazar("wifi-1", mac, tableta);
    mac.ld.fijarRespaldoLlamadas(respaldo(mac, () => tableta));
    tableta.ld.fijarRespaldoLlamadas(respaldo(tableta, () => mac));
    mac.ld.asegurarEscuchaLlamadas();
    tableta.ld.asegurarEscuchaLlamadas();
    expect((await mac.ld.llamarPorEnlace(par[0].id, true)).ok).toBe(true);
    await pasa();
    expect((await tableta.ld.contestarLlamada()).ok).toBe(true);
    await pasa();
    await pasa();
    expect(mac.ld.estadoLlamadaDirecta().fase).toBe("en-curso");
    expect(tableta.ld.estadoLlamadaDirecta().fase).toBe("en-curso");
    return par;
}

beforeEach(async () => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => streamFalso()) } });
    mac = await motor("nMac", "MaggaBook");
    tableta = await motor("nTab", "Maggaboard");
});

afterEach(() => {
    mac.ld.colgarLlamada();
    tableta.ld.colgarLlamada();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("LLA1112A · la llamada directa no cuelga porque su enlace se caiga", () => {
    it("se cae el enlace (Wi-Fi apagado): sigue en curso, dice que reconecta y no dice que falló", async () => {
        const [enMac, enTab] = await enCurso();
        vi.useFakeTimers();
        mac.reg.quitarEnlaceLocal(enMac.id);
        tableta.reg.quitarEnlaceLocal(enTab.id);
        await pasa();
        for (const m of [mac, tableta]) {
            const e = m.ld.estadoLlamadaDirecta();
            expect(e.fase).toBe("en-curso");
            expect(e.fin).toBeNull();
            expect(e.enlaceId).toBeNull();
            expect(e.motivo).toMatch(/Reconectando/);
        }
        // Antes de la espera, sigue.
        vi.advanceTimersByTime(mac.ld.ESPERA_VUELTA_ENLACE_MS - 1000);
        expect(mac.ld.estadoLlamadaDirecta().fase).toBe("en-curso");
    });

    it("vuelve el Wi-Fi (enlace nuevo con la misma neurona): la conversación sigue por él con las pistas puestas", async () => {
        const [enMac, enTab] = await enCurso();
        mac.reg.quitarEnlaceLocal(enMac.id);
        tableta.reg.quitarEnlaceLocal(enTab.id);
        await pasa();
        const [nMac, nTab] = enlazar("wifi-2", mac, tableta);
        await pasa();
        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: nMac.id, motivo: null });
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: nTab.id, motivo: null });
        expect(nMac.pistas.at(-1)).toBeTruthy();
        expect(nTab.pistas.at(-1)).toBeTruthy();
    });

    it("si ningún enlace vuelve en la espera, acaba como fallo y lo dice", async () => {
        const [enMac] = await enCurso();
        vi.useFakeTimers();
        mac.reg.quitarEnlaceLocal(enMac.id);
        await pasa();
        vi.advanceTimersByTime(mac.ld.ESPERA_VUELTA_ENLACE_MS + 10);
        const e = mac.ld.estadoLlamadaDirecta();
        expect(e.fase).toBe("terminada");
        expect(e.fin).toBe("fallo");
        expect(e.motivo).toMatch(/no volvió en 20 s/);
    });

    it("con otro enlace vivo con esa neurona, se pasa a él sin esperar", async () => {
        const [enMac] = await enCurso();
        const [otro] = enlazar("lan-2", mac, tableta);
        mac.reg.quitarEnlaceLocal(enMac.id);
        await pasa();
        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: otro.id, motivo: null });
    });
});
