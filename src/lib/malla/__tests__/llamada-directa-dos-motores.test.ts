import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * LLA1108A · dos motores de llamada directa en memoria (la Mac y la tableta).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Caso real (08-11, 0.5.1-prueba.22): la Mac llamó a «Maggaboard» por Mensajes › Neuronas. La burbuja
 * llegó por el canal TCP 47071 con acuse («Enviado ✓ Recibido ✓») y en la tableta decía «Sonando», pero
 * nada dejaba contestar: el timbre que sí abre «Contestar» (`ll.sonar`) iba UNA vez, sin acuse, por el
 * enlace WebRTC que la Mac tenía registrado (medio abierto: la tableta acababa de estar en segundo
 * plano). Y la burbuja no sabía hacer sonar nada. A los 45 s: «Sin respuesta · nadie contestó».
 *
 * Cada motor es una copia propia del módulo (`vi.resetModules`) con su registro de enlaces. Los enlaces
 * son pares en memoria; el «canal de la app» (TCP 47071 o el mejor enlace del transporte universal) es
 * el respaldo inyectado.
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
        // Medio abierto: el canal acepta el envío y nadie lo recibe (el otro extremo ya no existe).
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

/** Un enlace WebRTC vivo entre los dos (misma sesión a los dos lados, como `local:nativo-…`). */
function enlazar(sesion: string, a: Motor, b: Motor): [Extremo, Extremo] {
    const ea = extremo(`local:${sesion}`, a, b);
    const eb = extremo(`local:${sesion}`, b, a);
    ea.otro = eb;
    eb.otro = ea;
    return [ea, eb];
}

/** El canal de la app entre las dos neuronas (lo que en la realidad es el TCP 47071). */
function respaldo(yo: Motor, otro: () => Motor, opciones: { asegurarEnlace?: (neurona: string) => Promise<Enlace | null> } = {}) {
    const enviados: Array<Record<string, unknown>> = [];
    return {
        enviados,
        r: {
            yo: () => ({ neurona: yo.neurona, nombre: yo.nombre }),
            enviar: (neurona: string, o: Record<string, unknown>) => {
                enviados.push(o);
                const b = otro();
                if (neurona === b.neurona) queueMicrotask(() => b.ld.recibirSenalLlamada({ neurona: yo.neurona, nombre: yo.nombre }, o));
            },
            asegurarEnlace: opciones.asegurarEnlace,
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

describe("llamada directa entre dos neuronas (LLA1108A)", () => {
    it("el timbre llega aunque el enlace WebRTC elegido esté medio abierto, y al contestar el audio va por un enlace vivo", async () => {
        // La Mac tiene un enlace viejo con la tableta que ya no lleva nada (medio abierto) y la tableta, ninguno.
        const viejo = extremo("local:nativo-viejo", mac, tableta);
        const rm = respaldo(mac, () => tableta);
        let nuevo: [Extremo, Extremo] | null = null;
        const rt = respaldo(tableta, () => mac, {
            // Al contestar, la tableta abre el enlace WebRTC por el canal local (MLT1107A).
            asegurarEnlace: async () => {
                nuevo = enlazar("nativo-nuevo", tableta, mac);
                return nuevo[0];
            },
        });
        mac.ld.fijarRespaldoLlamadas(rm.r);
        tableta.ld.fijarRespaldoLlamadas(rt.r);
        mac.ld.asegurarEscuchaLlamadas();
        tableta.ld.asegurarEscuchaLlamadas();

        const r = await mac.ld.llamarPorEnlace(viejo.id, false);
        expect(r.ok).toBe(true);
        await pasa();

        // La tableta SUENA con algo que contestar (antes: nada, solo la burbuja «Sonando»).
        const e = tableta.ld.estadoLlamadaDirecta();
        expect(e.fase).toBe("entrante");
        expect(e.nombre).toBe("MaggaBook");
        expect(e.neurona).toBe("nMac");
        expect(e.id).toBe(mac.ld.estadoLlamadaDirecta().id);

        const c = await tableta.ld.contestarLlamada();
        expect(c).toEqual({ ok: true });
        await pasa();
        await pasa();

        expect(nuevo).not.toBeNull();
        const [enTableta, enMac] = nuevo as unknown as [Extremo, Extremo];
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: "local:nativo-nuevo" });
        // La Mac deja el enlace viejo y pone su micro en el que abrió la tableta: audio en los dos sentidos.
        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "en-curso", enlaceId: "local:nativo-nuevo" });
        expect(enTableta.pistas.at(-1)).toBeTruthy();
        expect(enMac.pistas.at(-1)).toBeTruthy();
        expect(viejo.pistas.filter(Boolean)).toHaveLength(0);
    });

    it("la burbuja de la llamada (llegó por el TCP) también hace sonar, una sola vez aunque llegue también el timbre", async () => {
        const [enMac] = enlazar("nativo-a", mac, tableta);
        mac.ld.fijarRespaldoLlamadas(respaldo(mac, () => tableta).r);
        tableta.ld.fijarRespaldoLlamadas(respaldo(tableta, () => mac).r);
        mac.ld.asegurarEscuchaLlamadas();
        tableta.ld.asegurarEscuchaLlamadas();
        const rechazos: string[] = [];
        enMac.alMensaje((d) => {
            if (typeof d === "string" && d.includes('"ll.rechazar"')) rechazos.push(d);
        });

        await mac.ld.llamarPorEnlace(enMac.id, true);
        await pasa();
        const id = mac.ld.estadoLlamadaDirecta().id as string;
        // La burbuja llega después (por el canal TCP): el mismo id no vuelve a sonar ni se toma por «ocupado».
        tableta.ld.recibirSenalLlamada({ neurona: "nMac", nombre: "MaggaBook" }, { t: "ll.sonar", id, video: true });
        await pasa();
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "entrante", id, video: true });
        expect(rechazos).toHaveLength(0);
        expect(mac.ld.estadoLlamadaDirecta().fase).toBe("llamando");
    });

    it("rechazar llega a quien llama aunque no haya enlace WebRTC (por el canal de la app) y el registro lo dice", async () => {
        const viejo = extremo("local:nativo-viejo", mac, tableta);
        mac.ld.fijarRespaldoLlamadas(respaldo(mac, () => tableta).r);
        tableta.ld.fijarRespaldoLlamadas(respaldo(tableta, () => mac).r);
        mac.ld.asegurarEscuchaLlamadas();
        tableta.ld.asegurarEscuchaLlamadas();

        await mac.ld.llamarPorEnlace(viejo.id, false);
        await pasa();
        tableta.ld.rechazarLlamada();
        await pasa();
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "terminada", fin: "rechazada" });
        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "terminada", fin: "rechazada" });
    });

    it("sin contestar: a los 45 s quien llama cuelga y los dos lo apuntan como no contestada (no «rechazada»)", async () => {
        vi.useFakeTimers();
        const [enMac] = enlazar("nativo-b", mac, tableta);
        mac.ld.fijarRespaldoLlamadas(respaldo(mac, () => tableta).r);
        tableta.ld.fijarRespaldoLlamadas(respaldo(tableta, () => mac).r);
        mac.ld.asegurarEscuchaLlamadas();
        tableta.ld.asegurarEscuchaLlamadas();

        await mac.ld.llamarPorEnlace(enMac.id, false);
        await vi.advanceTimersByTimeAsync(10);
        expect(tableta.ld.estadoLlamadaDirecta().fase).toBe("entrante");
        await vi.advanceTimersByTimeAsync(45_000);
        expect(mac.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "terminada", fin: "sin-respuesta" });
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "terminada", fin: "sin-respuesta" });
    });

    it("con dos enlaces a la misma neurona, la llamada elige el más nuevo (el viejo pudo quedar medio abierto)", async () => {
        const viejo = extremo("local:nativo-1", mac, tableta);
        await new Promise((r) => setTimeout(r, 5));
        const nuevo = extremo("local:nativo-2", mac, tableta);
        expect(viejo.desde).toBeLessThan(nuevo.desde);
        expect(mac.reg.enlaceVivoMasNuevoCon("nTab")?.id).toBe("local:nativo-2");
        expect(mac.reg.enlaceVivoMasNuevoCon("otra")).toBeNull();
    });

    it("la señalización por el canal local se urge: tras un fallo no espera al reintento largo", async () => {
        const { pasoSenal } = await import("@/lib/malla/senal-nativa");
        const fallida = { fase: "fallida" as const, sesion: "nativo-abcdef", intentos: 3, desde: 0, reintentoEn: 120_000, motivo: "x" };
        const urgida = pasoSenal(fallida, { t: "urgir", ahora: 1_000 }).estado;
        expect(urgida).toMatchObject({ fase: "inactiva", reintentoEn: 1_000 });
        // Y el siguiente tic ofrece ya (si me toca).
        const tic = pasoSenal(urgida, { t: "tic", ahora: 1_001, posible: true, ofrezco: true, enlaceAbierto: false, sesionNueva: "nativo-ghijkl" });
        expect(tic.acciones).toEqual([{ a: "ofrecer", sesion: "nativo-ghijkl" }]);
        // Abierta: no toca nada.
        const abierta = { ...fallida, fase: "abierta" as const };
        expect(pasoSenal(abierta, { t: "urgir", ahora: 1_000 }).estado).toBe(abierta);
    });

    it("si quien llama ya no está, el timbre de la tableta caduca solo con el mismo tope", async () => {
        vi.useFakeTimers();
        tableta.ld.asegurarEscuchaLlamadas();
        tableta.ld.recibirSenalLlamada({ neurona: "nMac", nombre: "MaggaBook" }, { t: "ll.sonar", id: "x1" });
        expect(tableta.ld.estadoLlamadaDirecta().fase).toBe("entrante");
        await vi.advanceTimersByTimeAsync(tableta.ld.SIN_RESPUESTA_MS + 5_000);
        expect(tableta.ld.estadoLlamadaDirecta()).toMatchObject({ fase: "terminada", fin: "sin-respuesta" });
    });
});
