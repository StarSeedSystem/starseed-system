import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * NEU1107A · exportaciones aditivas de la malla para los chats de neuronas:
 *  · `llamarPorEnlace(…, { pistaPantalla })`: la pantalla (pedida en el gesto) va como el vídeo de
 *    la llamada directa y el timbre lo dice; si no se puede llamar, la pantalla se suelta;
 *  · `suscribirLlamadaDirecta`: el registro del chat sigue la llamada fuera de React;
 *  · `abrirCanalDatos`: canal en vivo por UN enlace P2P, sin esperar acuse; relé y LoRa no.
 * Enlace local falso (registro real) y medios del navegador simulados.
 */

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "yo" }));
vi.mock("@/lib/network/vinculos-entre-cuentas", () => ({
    vinculosActivos: () => [],
    onMensajeDePar: () => () => undefined,
    enviarAPar: () => false,
}));
vi.mock("@/ai/astraura/mesh/store", () => ({ getMeshState: () => ({ status: "off" }) }));

import { __vaciarRegistroEnlacesLocales, registrarEnlaceLocal, type EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import { colgarLlamada, estadoLlamadaDirecta, llamarPorEnlace, suscribirLlamadaDirecta } from "@/lib/malla/llamada-directa";
import { abrirCanalDatos } from "@/lib/malla/transporte-universal";

function enlaceFalso(id: string, abierto = true): EnlaceLocalVivo & { enviados: string[] } {
    const enviados: string[] = [];
    return {
        enviados,
        id,
        par: { nombre: "Tablet", syncDeviceId: "B" },
        desde: 0,
        abierto: () => abierto,
        rttMs: () => 6,
        ruta: () => null,
        capacidadKbps: () => null,
        enviar: (t: string) => {
            enviados.push(t);
            return true;
        },
        enviarBinario: () => true,
        bufferedAmount: () => 0,
        alMensaje: () => () => undefined,
        ponerPistas: async () => true,
        alFlujoRemoto: () => () => undefined,
        cerrar: () => undefined,
    } as EnlaceLocalVivo & { enviados: string[] };
}

function pistaFalsa() {
    return { kind: "video", stop: vi.fn(), onended: null as null | (() => void) } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
}

function streamFalso() {
    const pistas: MediaStreamTrack[] = [];
    return {
        addTrack: vi.fn((p: MediaStreamTrack) => pistas.push(p)),
        removeTrack: vi.fn(),
        getTracks: () => pistas,
        getAudioTracks: () => [],
        getVideoTracks: () => pistas,
    } as unknown as MediaStream;
}

afterEach(() => {
    colgarLlamada();
    __vaciarRegistroEnlacesLocales();
    vi.unstubAllGlobals();
});

describe("llamada directa con pantalla compartida", () => {
    it("la pantalla va como vídeo, el timbre lo dice y el cambio se oye fuera de React", async () => {
        const e = enlaceFalso("local:p1");
        registrarEnlaceLocal(e);
        const stream = streamFalso();
        const getUserMedia = vi.fn(async () => stream);
        vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
        const vistos: string[] = [];
        const baja = suscribirLlamadaDirecta((s) => vistos.push(s.fase));
        const pantalla = pistaFalsa();

        const r = await llamarPorEnlace("local:p1", false, { pistaPantalla: pantalla });

        expect(r).toEqual({ ok: true });
        // Solo el micro (la cámara no hace falta: el vídeo es la pantalla).
        expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
        expect(stream.addTrack).toHaveBeenCalledWith(pantalla);
        const sonar = JSON.parse(e.enviados.find((t) => t.includes('"ll.sonar"')) ?? "{}");
        expect(sonar).toMatchObject({ t: "ll.sonar", video: true, pantalla: true });
        expect(estadoLlamadaDirecta()).toMatchObject({ fase: "llamando", video: true, pantalla: true });
        expect(vistos).toContain("llamando");
        baja();
        colgarLlamada();
        expect(vistos).not.toContain("terminada");
        expect(pantalla.stop).toHaveBeenCalled();
    });

    it("si el enlace no está abierto, no llama y suelta la pantalla", async () => {
        registrarEnlaceLocal(enlaceFalso("local:p2", false));
        const pantalla = pistaFalsa();
        const r = await llamarPorEnlace("local:p2", false, { pistaPantalla: pantalla });
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/no está abierto/);
        expect(pantalla.stop).toHaveBeenCalled();
    });
});

describe("abrirCanalDatos — canal en vivo por un enlace P2P", () => {
    it("va por el enlace local, sin esperar acuse, y dice que el relé no lleva transmisiones", async () => {
        const e = enlaceFalso("local:d1");
        registrarEnlaceLocal(e);
        const r = await abrirCanalDatos({ syncDeviceId: "B", identidadRele: "fp" }, "neurona-flujo");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.canal.enlace).toMatchObject({ id: "local:d1", tipo: "local", etiqueta: "Tablet", rttMs: 6 });
        expect(r.canal.enviar({ t: "fd.trozo", id: "f", n: 0, d: "hola" })).toBe(true);
        const sobre = JSON.parse(e.enviados.at(-1) ?? "{}");
        expect(sobre).toMatchObject({ t: "tu.msg", v: 1, c: "neurona-flujo", b: { t: "fd.trozo", d: "hola" } });
        expect(r.canal.enCola()).toBe(0);
    });

    it("sin enlace P2P hacia ese aparato lo dice (y el relé queda descartado con su motivo)", async () => {
        vi.stubGlobal("navigator", { onLine: true });
        const r = await abrirCanalDatos({ syncDeviceId: "Z", identidadRele: "fp" }, "neurona-flujo");
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.motivo).toMatch(/ningún enlace P2P/);
        expect(r.descartados.find((d) => d.tipo === "rele")?.motivo).toMatch(/no lleva transmisiones en vivo/);
    });
});
