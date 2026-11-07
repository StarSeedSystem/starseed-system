import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * NEU1107A · lo que viaja con los datos en el buzón: anuncio de archivos y llamadas en chats y
 * grupos por la malla («chat-malla»), un timbre que no espera y la recepción de un archivo en un
 * chat. Enlaces simulados; la decisión de medios y el recorrido del plan son los de verdad.
 */

vi.mock("@/lib/mensajeria/medios/enviar", async (original) => ({
    ...(await original<typeof import("@/lib/mensajeria/medios/enviar")>()),
    candidatosMalla: vi.fn(async () => []),
    enviarPorPasoMalla: vi.fn(),
}));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: vi.fn(async () => "yo") }));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "mac" }));
vi.mock("@/lib/sync/realtime-sync", () => ({ onAccountBroadcast: () => () => undefined, sendAccountBroadcast: vi.fn(async () => undefined) }));
// El seguimiento de la transferencia (motor de archivos) no es de esta prueba.
vi.mock("../archivos-neurona", () => ({ alAnunciarArchivo: vi.fn(async () => undefined), iniciarArchivosNeurona: () => () => undefined }));

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
    const buzon = await import("../buzon");
    const bandeja = await import("../bandeja");
    return { buzon, bandeja, candidatosMalla: vi.mocked(enviar.candidatosMalla), enviarPorPasoMalla: vi.mocked(enviar.enviarPorPasoMalla) };
}

const adjunto = { id: "arch_9", nombre: "foto.jpg", tipo: "image/jpeg", tamano: 900, modo: "p2p" as const };

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", almacenFalso());
});

describe("chats y grupos por la malla", () => {
    it("el anuncio de un archivo sale por «chat-malla» hacia esa persona, con su vía medida", async () => {
        const { buzon, candidatosMalla, enviarPorPasoMalla } = await cargar();
        candidatosMalla.mockResolvedValue([{ enlaceId: "local:ana", medio: "local", etiqueta: "Móvil de Ana", abierto: true, llega: true, rttMs: 5 }]);
        enviarPorPasoMalla.mockResolvedValue({
            ok: true,
            confirmado: true,
            detalle: "entregado y confirmado",
            via: { medio: "local", direccion: "sale", latenciaMs: 7, latenciaFuente: "acuse", confirmado: true, confirmadoPor: "destino" },
        });
        const m = {
            id: "m1", clave: "dm:h1", dir: "sale" as const, texto: "", at: 5, estado: "enviando" as const,
            destino: { uid: "ana" }, destinatarios: ["ana"], clavePrefs: "dm:h1", adjunto,
        };
        buzon.guardarMensajeMalla(m);
        const r = await buzon.anunciarEnChatMalla(m);
        expect(r.estado).toBe("confirmado");
        expect(candidatosMalla).toHaveBeenCalledWith({ uid: "ana" });
        expect(enviarPorPasoMalla).toHaveBeenCalledWith(
            expect.objectContaining({ enlaceId: "local:ana" }),
            { uid: "ana" },
            "chat-malla",
            expect.objectContaining({ mid: "m1", h: "h1", txt: "", adj: adjunto, de: { u: "yo" } }),
        );
        expect(buzon.mensajeMalla("dm:h1", "m1")?.via).toMatchObject({ medio: "local", latenciaMs: 7 });
    });

    it("la burbuja de una llamada no espera: sin enlace, falla y dice por qué", async () => {
        const { buzon, candidatosMalla } = await cargar();
        candidatosMalla.mockResolvedValue([]);
        const m = {
            id: "m2", clave: "dm:h1", dir: "sale" as const, texto: "", at: 5, estado: "enviando" as const, urgente: true,
            destino: { uid: "ana" }, clavePrefs: "dm:h1", llamada: { tipo: "audio" as const, via: "enlace-local" as const },
        };
        buzon.guardarMensajeMalla(m);
        const r = await buzon.anunciarEnChatMalla(m);
        expect(r.estado).toBe("fallido");
        expect(r.aviso).toBe("Ningún medio permitido está disponible ahora.");
    });

    it("un archivo que llega por «chat-malla» se guarda en ese chat (sin texto) con su anuncio", async () => {
        const { bandeja } = await cargar();
        const c = bandeja.leerCuerpoChatMalla({ v: 1, mid: "m3", h: "h1", txt: "", de: { u: "ana" }, adj: adjunto });
        expect(c).toMatchObject({ mid: "m3", h: "h1", adj: adjunto });
        expect(bandeja.leerCuerpoChatMalla({ v: 1, mid: "m4", h: "h1", txt: "  ", de: {} })).toBeNull();
        expect(bandeja.leerCuerpoChatMalla({ v: 1, mid: "m5", h: "h1", txt: "", ll: { tipo: "video", via: "enlace-local", pantalla: true } })?.ll).toEqual({
            tipo: "video",
            via: "enlace-local",
            pantalla: true,
        });
    });
});

describe("neuronas: timbre urgente", () => {
    it("un mensaje urgente (timbre o anuncio de flujo) no se queda «en espera»", async () => {
        const { buzon, candidatosMalla } = await cargar();
        candidatosMalla.mockResolvedValue([]);
        const m = await buzon.enviarANeurona({ clave: "c:otra", destino: { uid: "otra" }, texto: "", llamada: { tipo: "audio", via: "sistema-llamadas", sesion: "s1" }, urgente: true });
        expect(m.estado).toBe("fallido");
        expect(m.aviso).toMatch(/Ningún medio permitido está disponible ahora/);
    });
});
