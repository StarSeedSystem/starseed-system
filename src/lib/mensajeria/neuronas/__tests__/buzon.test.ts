import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Buzón de la malla (MSJ1107A): envío según los ajustes de medio, espera y reintento, canal de la
 * cuenta con acuse medido y chats con el servidor primero. Sin red: los enlaces reales y el canal
 * de la cuenta se simulan; la decisión (`mediosParaEnviar`) y el recorrido del plan son los de verdad.
 */

const manejadores = new Map<string, (p: unknown) => void>();

vi.mock("@/lib/mensajeria/medios/enviar", async (original) => ({
    ...(await original<typeof import("@/lib/mensajeria/medios/enviar")>()),
    candidatosMalla: vi.fn(async () => []),
    enviarPorPasoMalla: vi.fn(),
}));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: vi.fn(async () => "yo") }));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "mac" }));
vi.mock("@/lib/sync/realtime-sync", () => ({
    onAccountBroadcast: vi.fn((evento: string, cb: (p: unknown) => void) => {
        manejadores.set(evento, cb);
        return () => manejadores.delete(evento);
    }),
    sendAccountBroadcast: vi.fn(async () => undefined),
}));

function almacenFalso(): Storage {
    const m = new Map<string, string>();
    return {
        get length() {
            return m.size;
        },
        clear: () => m.clear(),
        getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
        key: (i: number) => Array.from(m.keys())[i] ?? null,
        removeItem: (k: string) => void m.delete(k),
        setItem: (k: string, v: string) => void m.set(k, String(v)),
    };
}

async function cargar() {
    const enviar = await import("@/lib/mensajeria/medios/enviar");
    const rs = await import("@/lib/sync/realtime-sync");
    const buzon = await import("../buzon");
    const prefs = await import("@/lib/mensajeria/medios/preferencias-store");
    return {
        buzon,
        prefs,
        candidatosMalla: vi.mocked(enviar.candidatosMalla),
        enviarPorPasoMalla: vi.mocked(enviar.enviarPorPasoMalla),
        sendAccountBroadcast: vi.mocked(rs.sendAccountBroadcast),
    };
}

const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    manejadores.clear();
    vi.stubGlobal("localStorage", almacenFalso());
});

describe("buzón de neuronas", () => {
    it("automático: sale por el enlace más directo y guarda por dónde viajó, con lo medido", async () => {
        const { buzon, candidatosMalla, enviarPorPasoMalla, sendAccountBroadcast } = await cargar();
        candidatosMalla.mockResolvedValue([
            { enlaceId: "cuenta:tab", medio: "wifi-local", etiqueta: "Tablet", abierto: true, llega: true, rttMs: 10, ruta: "misma-red-local" },
        ]);
        enviarPorPasoMalla.mockResolvedValue({
            ok: true,
            confirmado: true,
            detalle: "entregado y confirmado",
            via: { medio: "wifi-local", direccion: "sale", latenciaMs: 14, latenciaFuente: "acuse", confirmado: true, confirmadoPor: "destino" },
        });
        const m = await buzon.enviarANeurona({ clave: "n:tab", destino: { neuronDeviceId: "tab" }, texto: "  hola  " });
        expect(m.estado).toBe("confirmado");
        expect(enviarPorPasoMalla).toHaveBeenCalledWith(
            expect.objectContaining({ enlaceId: "cuenta:tab", medio: "wifi-local" }),
            { neuronDeviceId: "tab" },
            "neurona",
            expect.objectContaining({ mid: m.id, txt: "hola", de: expect.objectContaining({ n: "mac", u: "yo" }), para: { n: "tab", u: undefined } }),
        );
        expect(sendAccountBroadcast).not.toHaveBeenCalled();
        const guardado = buzon.bandejaMalla().conv["n:tab"].mensajes[0];
        expect(guardado.via).toMatchObject({ medio: "wifi-local", latenciaMs: 14, intentos: [expect.objectContaining({ ok: true })] });
        // Persistido con clave versionada (funciona sin internet).
        expect(localStorage.getItem("starseed.mensajeria.malla.v1")).toContain(m.id);
    });

    it("solo métodos elegidos sin ninguno disponible: espera, dice por qué y sale al reintentar", async () => {
        const { buzon, prefs, candidatosMalla, enviarPorPasoMalla, sendAccountBroadcast } = await cargar();
        prefs.cambiarPreferenciasChat("neurona:n:tab", { modo: "elegidos", elegidos: ["lora"], siNinguno: "esperar" });
        candidatosMalla.mockResolvedValue([{ enlaceId: "cuenta:tab", medio: "wifi-local", etiqueta: "Tablet", abierto: true, llega: true }]);
        const m = await buzon.enviarANeurona({ clave: "n:tab", destino: { neuronDeviceId: "tab" }, texto: "por radio" });
        expect(m.estado).toBe("en-espera");
        expect(m.aviso).toMatch(/en espera/);
        expect(m.descartados).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ enlaceId: "cuenta:tab", motivo: "no está entre tus medios elegidos" }),
                { medio: "lora", motivo: "no hay ningún enlace de este tipo ahora" },
            ]),
        );
        expect(enviarPorPasoMalla).not.toHaveBeenCalled();
        expect(sendAccountBroadcast).not.toHaveBeenCalled();

        candidatosMalla.mockResolvedValue([{ enlaceId: "lora", medio: "lora", etiqueta: "Radio LoRa", abierto: true, llega: true }]);
        enviarPorPasoMalla.mockResolvedValue({
            ok: true,
            confirmado: false,
            detalle: "en cola de la radio (mesh)",
            via: { medio: "lora", direccion: "sale", confirmado: false },
        });
        expect(await buzon.reintentarPendientes()).toBe(1);
        const ahora = buzon.bandejaMalla().conv["n:tab"].mensajes[0];
        expect(ahora).toMatchObject({ estado: "enviado", via: { medio: "lora" }, intentos: 2 });
    });

    it("avisar: si no hay camino, no se envía y queda como fallido con su motivo", async () => {
        const { buzon, prefs, candidatosMalla } = await cargar();
        prefs.cambiarPreferenciasGlobales({ modo: "elegidos", elegidos: ["bluetooth"], siNinguno: "avisar" });
        candidatosMalla.mockResolvedValue([]);
        const m = await buzon.enviarANeurona({ clave: "n:tab", destino: { neuronDeviceId: "tab" }, texto: "hola" });
        expect(m.estado).toBe("fallido");
        expect(m.aviso).toBe("Ninguno de tus medios elegidos está disponible ahora.");
        expect(buzon.bandejaMalla().conv["n:tab"].mensajes).toHaveLength(1);
    });

    it("canal de la cuenta: mide la ida y vuelta con el acuse, recibe, acusa y descarta lo que es para otra neurona", async () => {
        const { buzon, candidatosMalla, sendAccountBroadcast } = await cargar();
        candidatosMalla.mockResolvedValue([]);
        sendAccountBroadcast.mockImplementation(async (evento: string, p: unknown) => {
            if (evento === "neurona-msg") setTimeout(() => manejadores.get("neurona-acuse")?.({ mid: (p as { mid: string }).mid }), 5);
        });
        const m = await buzon.enviarANeurona({ clave: "n:tab", destino: { neuronDeviceId: "tab" }, texto: "por el servidor" });
        expect(m.estado).toBe("confirmado");
        expect(m.via).toMatchObject({ medio: "servidor", latenciaFuente: "acuse", confirmado: true, confirmadoPor: "destino" });
        expect(typeof m.via?.latenciaMs).toBe("number");

        manejadores.get("neurona-msg")?.({ mid: "x1", txt: "desde la tablet", de: { n: "tab", nom: "Tablet", u: "yo" }, para: { n: "mac" } });
        manejadores.get("neurona-msg")?.({ mid: "x2", txt: "para otra", de: { n: "tab", u: "yo" }, para: { n: "otra" } });
        await esperar(10);
        const conv = buzon.bandejaMalla().conv["n:tab"].mensajes;
        expect(conv.map((x) => x.id)).toEqual([m.id, "x1"]);
        expect(conv[1]).toMatchObject({ dir: "entra", deNombre: "Tablet", via: { medio: "servidor", direccion: "entra" } });
        expect(sendAccountBroadcast).toHaveBeenCalledWith("neurona-acuse", { mid: "x1", de: "mac" });
        expect(buzon.useNoLeidosNeuronas).toBeTypeOf("function");
    });
});

describe("chats por el servidor o por la malla", () => {
    it("automático con internet: el servidor primero, sin despertar la malla, y guarda la vía medida", async () => {
        const { buzon, candidatosMalla } = await cargar();
        const res = await buzon.enviarMensajeChat({ hiloId: "h1", tipo: "dm", otros: ["ana"], texto: "hola", enviarServidor: async () => ({ id: "srv1" }) });
        expect(res).toMatchObject({ ok: true, servidorId: "srv1" });
        expect(candidatosMalla).not.toHaveBeenCalled();
        expect(buzon.bandejaMalla().vias.srv1).toMatchObject({ medio: "servidor", direccion: "sale", latenciaFuente: "servidor", confirmadoPor: "servidor" });
    });

    it("si el servidor falla, prueba la malla hacia la otra persona y guarda el mensaje aquí", async () => {
        const { buzon, candidatosMalla, enviarPorPasoMalla } = await cargar();
        candidatosMalla.mockResolvedValue([{ enlaceId: "par:v1", medio: "p2p-internet", etiqueta: "Vínculo entre cuentas", abierto: true, llega: true }]);
        enviarPorPasoMalla.mockResolvedValue({
            ok: true,
            confirmado: true,
            detalle: "entregado y confirmado",
            via: { medio: "p2p-internet", direccion: "sale", confirmado: true, confirmadoPor: "destino" },
        });
        const res = await buzon.enviarMensajeChat({ hiloId: "h1", tipo: "dm", otros: ["ana"], texto: "sin servidor", enviarServidor: async () => null });
        expect(res.ok).toBe(true);
        expect(res.local).toMatchObject({ estado: "confirmado", clave: "dm:h1" });
        expect(enviarPorPasoMalla).toHaveBeenCalledWith(
            expect.objectContaining({ enlaceId: "par:v1" }),
            { uid: "ana" },
            "chat-malla",
            expect.objectContaining({ h: "h1", txt: "sin servidor" }),
        );
        expect(res.via?.intentos?.map((i) => [i.medio, i.ok])).toEqual([["p2p-internet", true]]);
    });

    it("los adjuntos solo viajan por el servidor: con «solo malla» se avisa y no queda nada en espera", async () => {
        const { buzon, prefs } = await cargar();
        prefs.cambiarPreferenciasChat("dm:h1", { modo: "elegidos", elegidos: ["wifi-local"], siNinguno: "esperar" });
        const enviarServidor = vi.fn(async () => ({ id: "no" }));
        const res = await buzon.enviarMensajeChat({ hiloId: "h1", tipo: "dm", otros: ["ana"], texto: "", soloServidor: true, enviarServidor });
        expect(res.ok).toBe(false);
        expect(res.aviso).toMatch(/adjuntos/);
        expect(enviarServidor).not.toHaveBeenCalled();
        expect(buzon.bandejaMalla().conv["dm:h1"]?.mensajes ?? []).toHaveLength(0);
    });
});
