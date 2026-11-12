import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * LLA1112A-rc · la llamada aguanta perder el Wi-Fi (prueba .39).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Caso real: al apagarse el Wi-Fi de la tableta la llamada acabó en «fallo» con el enlace
 * Bluetooth ABIERTO; y el timbre se ancló a un enlace WebRTC medio abierto aunque había otro
 * enlace vivo; quien llama esperó 12 s a un enlace que nunca se abriría teniendo otro abierto.
 * Aquí cada motor es una copia propia del módulo (`vi.resetModules`) con enlaces pares en
 * memoria, como en `llamada-directa-dos-motores.test.ts`.
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
    baja: () => void;
}

function extremo(id: string, de: Motor, hacia: Motor, abierto = true): Extremo {
    const oyentes = new Set<(d: string | ArrayBuffer) => void>();
    const e: Extremo = {
        id,
        par: { nombre: hacia.nombre, neuronDeviceId: hacia.neurona, origen: "red-local-nativa" },
        desde: Date.now(),
        otro: null,
        pistas: [],
        baja: () => undefined,
        abierto: () => abierto,
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
    e.baja = de.reg.registrarEnlaceLocal(e);
    return e;
}

function enlazar(sesion: string, a: Motor, b: Motor, abiertoB = true): [Extremo, Extremo] {
    const ea = extremo(`local:${sesion}`, a, b, true);
    const eb = extremo(`local:${sesion}`, b, a, abiertoB);
    ea.otro = eb;
    eb.otro = ea;
    return [ea, eb];
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

const pasa = () => new Promise((r) => setTimeout(r, 0));

let mac: Motor;
let tableta: Motor;

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

describe("la llamada aguanta perder el Wi-Fi (LLA1112A-rc · prueba .39)", () => {
    it("en curso: se apaga el Wi-Fi y la llamada sigue por el Bluetooth abierto (los dos lados)", async () => {
        const [wifiMac, wifiTab] = enlazar("wifi", mac, tableta);
        const [bleMac, bleTab] = enlazar("ble", mac, tableta);
        mac.ld.asegurarEscuchaLlamadas();
        tableta.ld.asegurarEscuchaLlamadas();

        expect((await mac.ld.llamarPorEnlace(wifiMac.id, false)).ok).toBe(true);
        await pasa();
        expect(tableta.ld.estadoLlamadaDirecta().fase).toBe("entrante");
        expect((await tableta.ld.contestarLlamada()).ok).toBe(true);
        await pasa();
        await pasa();
        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: wifiMac.id });
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: wifiTab.id });

        wifiMac.baja();
        wifiTab.baja();
        await pasa();

        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: bleMac.id });
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: bleTab.id });
        expect(bleMac.pistas.at(-1)).toBeTruthy();
        expect(bleTab.pistas.at(-1)).toBeTruthy();
    });

    it("en curso: si no queda ningún otro enlace, sigue acabando en «fallo» como antes", async () => {
        const [wifiMac] = enlazar("wifi", mac, tableta);
        mac.ld.asegurarEscuchaLlamadas();
        tableta.ld.asegurarEscuchaLlamadas();

        expect((await mac.ld.llamarPorEnlace(wifiMac.id, false)).ok).toBe(true);
        await pasa();
        expect((await tableta.ld.contestarLlamada()).ok).toBe(true);
        await pasa();
        await pasa();

        wifiMac.baja();
        tableta.reg.quitarEnlaceLocal("local:wifi");
        await pasa();

        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "terminada", fin: "fallo" });
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "terminada", fin: "fallo" });
    });

    it("sonando: el timbre no se ancla a un enlace medio abierto si hay otro enlace vivo", async () => {
        const [, wifiTab] = enlazar("wifi", mac, tableta, false);
        const [, bleTab] = enlazar("ble", mac, tableta);
        tableta.ld.asegurarEscuchaLlamadas();

        await mac.ld.llamarPorEnlace("local:wifi", false);
        await pasa();

        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "entrante", enlaceId: bleTab.id });
    });

    it("contestaron y señalan un enlace que no se abrirá: se pasa al enlace vivo sin esperar los 12 s", async () => {
        vi.useFakeTimers();
        const [bleMac] = enlazar("ble", mac, tableta);
        mac.ld.asegurarEscuchaLlamadas();
        tableta.ld.asegurarEscuchaLlamadas();

        expect((await mac.ld.llamarPorEnlace(bleMac.id, false)).ok).toBe(true);
        await vi.advanceTimersByTimeAsync(10);
        expect(tableta.ld.estadoLlamadaDirecta().fase).toBe("entrante");
        const id = mac.ld.estadoLlamadaDirecta().id as string;

        mac.ld.recibirSenalLlamada({ neurona: "nTab", nombre: "Maggaboard" }, { t: "ll.aceptar", id, enlace: "local:nunca" });
        await vi.advanceTimersByTimeAsync(200);

        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: bleMac.id });
        expect(bleMac.pistas.at(-1)).toBeTruthy();
    });
});
