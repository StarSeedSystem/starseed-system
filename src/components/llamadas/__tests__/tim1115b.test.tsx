// @vitest-environment jsdom
/**
 * TIM1115B · Prueba 43 (15-11, Mac ↔ tableta Maggaboard), en el orden del registro (`enlaces.log`):
 *  05:23:42 la Mac llama (A) y nadie contesta · 05:24:32 la Mac cuelga · 05:24:41 `fallo señal colgar sin enlace tras 4 intentos`
 *  05:24:52 llamada nueva (B) · 05:25:04 se contesta B en la tableta… y el timbre seguía sonando.
 * Dos aparatos con las piezas de verdad (almacén, tarjeta del timbre, sonido, canal de la Mac, oyente de la tableta); solo se
 * falsean el audio, la decisión de silencios, la presencia y el enlace (que cae y vuelve a las horas del registro).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";

const h = vi.hoisted(() => ({ activos: 0, creados: 0, picoSimultaneo: 0 }));

vi.mock("@/lib/llamadas/sonido", () => ({
    crearTono: () => {
        h.creados += 1;
        let vivo = false;
        return {
            iniciar() {
                if (vivo) return;
                vivo = true;
                h.activos += 1;
                h.picoSimultaneo = Math.max(h.picoSimultaneo, h.activos);
            },
            parar() {
                if (!vivo) return;
                vivo = false;
                h.activos -= 1;
            },
        };
    },
    vibrar: () => undefined,
}));
vi.mock("@/lib/llamadas/nativa/use-decision-timbre", () => ({ useDecisionTimbre: () => ({ sonidoWeb: true, tarjetaWeb: true, entradaSilenciada: null }) }));
vi.mock("@/lib/llamadas/use-presencia", () => ({ usePresentesLlamada: () => null, useEnPantalla: () => true }));
vi.mock("@/lib/llamadas/acciones", () => ({ aceptarTimbre: vi.fn(), rechazarTimbre: vi.fn() }));
vi.mock("@/components/llamadas/avatar-llamada", () => ({ AvatarLlamada: () => null }));
vi.mock("@/components/llamadas/menu-silenciar", () => ({ BotonesIgnorarSilenciar: () => null }));
vi.mock("@/components/llamadas/entrada-silenciada", () => ({ EntradaSilenciada: () => null }));
vi.mock("sonner", () => ({ toast: { message: vi.fn() } }));
vi.mock("framer-motion", () => ({
    motion: { section: ({ children }: { children?: unknown }) => <section>{children as never}</section> },
}));

import { TimbreLlamada } from "@/components/llamadas/timbre";
import { abrirCanalLlamadaPorTransporte } from "@/lib/llamadas/canal-enlace-transporte";
import { __reiniciarLlamadas, agregarTimbre, leerLlamadas, ponerActiva, useLlamadas, type TimbreEntrante } from "@/lib/llamadas/store";
import { __fijarDepsSonido, pedirSonido, SONIDO_MAX_MS, sonandoTimbre } from "@/lib/llamadas/timbre-sonido";
import { vigilarColgarDeTimbres } from "@/lib/llamadas/timbre-colgar";

const MAC = "neurona-mac";
const SES_A = "aaaaaaaa-llamada-1";
const SES_B = "bbbbbbbb-llamada-2";

function Lista() {
    const { timbres } = useLlamadas();
    return (
        <>
            {timbres.map((t) => (
                <TimbreLlamada key={t.sesionId} timbre={t} miUid="tableta-uid" />
            ))}
        </>
    );
}

const timbre = (sesionId: string): TimbreEntrante => ({
    sesionId,
    tipo: "audio",
    hiloId: "",
    tipoHilo: "dm",
    tituloHilo: null,
    mensajeId: `m-${sesionId}`,
    llamante: { uid: "mac-uid", nombre: "Mac", avatar: null },
    silenciado: false,
    llegada: Date.now(),
    neurona: MAC,
});

/** Un enlace que se cae y vuelve; lo que sale por él llega al oyente de la tableta. */
function enlace() {
    const oyentes = new Set<(m: { cuerpo: unknown; origen: { tipo: string } }) => void>();
    const estado = { arriba: true, intentos: 0 };
    return {
        estado,
        depsMac: {
            enviar: async (_n: string, cuerpo: unknown) => {
                estado.intentos += 1;
                if (!estado.arriba) return { ok: false };
                oyentes.forEach((cb) => cb({ cuerpo, origen: { tipo: "ble" } }));
                return { ok: true, via: "ble" };
            },
            alRecibir: () => () => undefined,
            hayEnlace: () => estado.arriba,
            yo: () => MAC,
        },
        alRecibirTableta: (cb: (m: { cuerpo: unknown; origen: { tipo: string } }) => void) => {
            oyentes.add(cb);
            return () => oyentes.delete(cb);
        },
    };
}

let lineas: string[];
beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-11-15T05:23:42Z") });
    h.activos = 0;
    h.creados = 0;
    h.picoSimultaneo = 0;
    lineas = [];
    __reiniciarLlamadas();
    __fijarDepsSonido({});
    fijarSumideroDiagnostico((l) => lineas.push(`${l.hito} ${l.detalle}`));
});
afterEach(() => {
    cleanup();
    fijarSumideroDiagnostico(null);
    __fijarDepsSonido(null);
    vi.useRealTimers();
});

const avanzar = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const poner = (t: TimbreEntrante) => act(() => agregarTimbre(t));
const contestar = (sesionId: string) =>
    act(() => ponerActiva({ sesionId, tipo: "audio", hiloId: null, titulo: "x", mensajeId: null, adjunto: null, esCreador: false, token: null, motor: {} as never, minimizada: false } as never));

describe("TIM1115B · un solo sonido, y se calla al contestar", () => {
    it("A suena y su «colgar» nunca llega; llama B, se contesta B: no queda ningún sonido (antes seguía el de A)", async () => {
        render(<Lista />);
        await poner(timbre(SES_A)); // 05:23:42 · suena A
        expect(h.activos).toBe(1);
        await avanzar(70_000); // 05:24:52 · A ya no debería sonar, pero su «colgar» no llegó
        await poner(timbre(SES_B));
        await avanzar(12_000); // 05:25:04 · se contesta B
        await contestar(SES_B);
        expect(h.activos).toBe(0);
        expect(sonandoTimbre()).toBe(false);
        expect(lineas.some((l) => /^timbre-sonido fin motivo=contestada/.test(l))).toBe(true);
    });

    it("dos timbres a la vez: un único tono, y se calla al contestar uno de ellos", async () => {
        render(<Lista />);
        await poner(timbre(SES_A));
        await avanzar(2_000);
        await poner(timbre(SES_B));
        expect(h.picoSimultaneo).toBe(1);
        expect(h.activos).toBe(1);
        expect(lineas.filter((l) => /^timbre-sonido inicio/.test(l))).toHaveLength(1);
        await contestar(SES_A);
        expect(h.activos).toBe(0);
        expect(leerLlamadas().timbres.map((t) => t.sesionId)).toEqual([SES_B]); // su tarjeta sigue, sin sonido
    });

    it("si el «colgar» no llega, el sonido caduca solo (plazo de quien llama + margen), aunque nadie retire la petición", async () => {
        pedirSonido(SES_A); // sin tarjeta que lo retire: solo el plazo propio
        expect(sonandoTimbre()).toBe(true);
        await avanzar(SONIDO_MAX_MS - 1_000);
        expect(sonandoTimbre()).toBe(true);
        await avanzar(2_000);
        expect(sonandoTimbre()).toBe(false);
        expect(lineas.some((l) => /^timbre-sonido fin motivo=caducado/.test(l))).toBe(true);
    });

    it("la tarjeta de un timbre que nadie atiende se retira a los 45 s y su sonido con ella", async () => {
        render(<Lista />);
        await poner(timbre(SES_A));
        await avanzar(46_000);
        expect(h.activos).toBe(0);
        expect(leerLlamadas().timbres).toHaveLength(0);
    });
});

describe("TIM1115B · el «colgar» llega como el timbre", () => {
    it("el enlace cae al colgar: se reintenta por todos los enlaces y, al volver, retira el timbre y su sonido", async () => {
        const red = enlace();
        const baja = vigilarColgarDeTimbres({ alRecibir: red.alRecibirTableta });
        render(<Lista />);
        await poner(timbre(SES_A));
        expect(h.activos).toBe(1);
        red.estado.arriba = false; // 05:23:44 se cae el enlace
        const mac = abrirCanalLlamadaPorTransporte("tableta", SES_A, "clave-mac", red.depsMac);
        mac.enviar({ tipo: "colgar", de: "yo" });
        mac.soltar(); // el motor suelta el canal al colgar
        await avanzar(25_000); // mucho más que los 4 intentos de antes (≈ 9 s)
        expect(red.estado.intentos).toBeGreaterThan(4);
        expect(h.activos).toBe(1); // el aviso aún no pudo salir
        red.estado.arriba = true; // 05:25:00 vuelve Bluetooth
        await avanzar(5_000);
        expect(leerLlamadas().timbres).toHaveLength(0);
        expect(h.activos).toBe(0);
        expect(lineas.some((l) => /^colgar entregado via=ble intentos=\d+/.test(l))).toBe(true);
        baja();
    });

    it("un «colgar» que no sale en toda la ventana deja `colgar caducado`", async () => {
        const red = enlace();
        red.estado.arriba = false;
        const mac = abrirCanalLlamadaPorTransporte("tableta", SES_A, "clave-mac", red.depsMac);
        mac.enviar({ tipo: "colgar", de: "yo" });
        await avanzar(65_000);
        expect(lineas.some((l) => /^colgar caducado/.test(l))).toBe(true);
        expect(lineas.some((l) => /^fallo señal colgar/.test(l))).toBe(false);
    });

    it("un «colgar» tardío de A no toca a B; y un timbre de A que llega después de su «colgar» no suena", async () => {
        const red = enlace();
        const baja = vigilarColgarDeTimbres({ alRecibir: red.alRecibirTableta });
        render(<Lista />);
        await poner(timbre(SES_B));
        const macA = abrirCanalLlamadaPorTransporte("tableta", SES_A, "clave-mac", red.depsMac);
        macA.enviar({ tipo: "colgar", de: "yo" }); // «colgar» de A, tardío
        await avanzar(1_000);
        expect(leerLlamadas().timbres.map((t) => t.sesionId)).toEqual([SES_B]);
        expect(h.activos).toBe(1);
        await poner(timbre(SES_A)); // el timbre de A llega tarde, tras su «colgar»
        expect(leerLlamadas().timbres.map((t) => t.sesionId)).toEqual([SES_B]);
        baja();
    });

    it("un «colgar» de otra neurona no retira el timbre", async () => {
        const red = enlace();
        const baja = vigilarColgarDeTimbres({ alRecibir: red.alRecibirTableta });
        render(<Lista />);
        await poner(timbre(SES_A));
        const otra = abrirCanalLlamadaPorTransporte("tableta", SES_A, "clave-x", { ...red.depsMac, yo: () => "neurona-intrusa" });
        otra.enviar({ tipo: "colgar", de: "yo" });
        await avanzar(1_000);
        expect(leerLlamadas().timbres.map((t) => t.sesionId)).toEqual([SES_A]);
        baja();
    });
});
