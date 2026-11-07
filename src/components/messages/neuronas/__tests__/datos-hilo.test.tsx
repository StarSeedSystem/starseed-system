// @vitest-environment jsdom
/**
 * Datos de cualquier formato en el chat de una neurona (NEU1107A): tarjetas de archivo (aceptar,
 * reanudar, progreso y confirmaciones), de llamada y de transmisión; botones de llamada (la
 * pantalla se pide en el mismo gesto) y arrastrar archivos al hilo. Motores simulados.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";
import type { ConversacionNeurona } from "@/lib/mensajeria/neuronas/agrupar";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("@/hooks/use-nivel-movimiento", () => ({ useNivelMovimiento: () => "minimo" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() } }));

const vivo = vi.hoisted(() => ({ actual: null as null | Record<string, unknown> }));
vi.mock("@/lib/mensajeria/neuronas/archivos-neurona", () => ({
    useArchivoVivo: () => vivo.actual,
    aceptarArchivo: vi.fn(async () => undefined),
    rechazarArchivo: vi.fn(async () => undefined),
    cancelarArchivo: vi.fn(async () => undefined),
    reintentarArchivoNeurona: vi.fn(async (m: unknown) => m),
    archivoDeAdjunto: vi.fn(async () => null),
    bajarArchivoServidor: vi.fn(async () => ({ ok: true })),
    enviarArchivosANeurona: vi.fn(async () => []),
    enviarArchivosAChatMalla: vi.fn(async () => []),
}));
vi.mock("@/lib/mensajeria/neuronas/llamadas-neurona", () => ({
    pedirPantalla: vi.fn(() => Promise.resolve(null)),
    llamarANeurona: vi.fn(async () => ({ ok: false, motivo: "No hay cómo llamar a esta neurona ahora." })),
    llamarEnChatMalla: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/mensajeria/neuronas/flujos-neurona", () => ({
    useFlujoNeurona: () => null,
    abrirFlujoNeurona: vi.fn(),
    cerrarFlujoNeurona: vi.fn(),
}));
const bandeja = vi.hoisted(() => ({ estado: { v: 1, conv: {} as Record<string, { mensajes: unknown[]; leidoHasta: number }>, vias: {} } }));
vi.mock("@/lib/mensajeria/neuronas/buzon", () => ({
    useBandejaMalla: () => bandeja.estado,
    marcarConversacionLeida: vi.fn(),
    fijarHiloAbierto: vi.fn(),
    enviarANeurona: vi.fn(),
    reintentarMensaje: vi.fn(),
    reintentarPendientes: vi.fn(async () => 0),
}));
vi.mock("@/components/messages/medios/bloque-medio", () => ({ BloqueMedioTransmision: () => null }));

import { toast } from "sonner";
import * as archivos from "@/lib/mensajeria/neuronas/archivos-neurona";
import * as llamadas from "@/lib/mensajeria/neuronas/llamadas-neurona";
import * as buzon from "@/lib/mensajeria/neuronas/buzon";
import { BotonesLlamadaNeurona, TarjetaArchivo, TarjetaFlujo, TarjetaLlamada } from "@/components/messages/neuronas/datos-hilo";
import { HiloNeurona } from "@/components/messages/neuronas/hilo-neurona";

const conv: ConversacionNeurona = { clave: "n:tab", nombre: "Tablet Android", destino: { neuronDeviceId: "tab" }, detalle: "", propia: true, enLinea: true };
const adjunto = { id: "arch_1", nombre: "plano.pdf", tipo: "application/pdf", tamano: 2048, modo: "p2p" as const };
const msg = (p: Partial<MensajeMalla>): MensajeMalla => ({ id: "m1", clave: "n:tab", dir: "entra", texto: "", at: 1, estado: "recibido", ...p });

beforeEach(() => {
    vivo.actual = null;
    bandeja.estado = { v: 1, conv: {}, vias: {} };
    vi.clearAllMocks();
});
afterEach(cleanup);

describe("tarjeta de archivo", () => {
    it("lo que te ofrecen espera a que lo aceptes (y lo dice)", () => {
        vivo.actual = { rol: "recibir", fase: "pendiente-aceptar", progreso: 0, trozos: 1, tamano: 2048, inicioMs: 0, actualizadoMs: 0 };
        render(<TarjetaArchivo m={msg({ adjunto })} />);
        expect(screen.getByText("plano.pdf")).toBeTruthy();
        expect(screen.getByText("Te lo ofrece: acéptalo para recibirlo")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Aceptar/ }));
        expect(archivos.aceptarArchivo).toHaveBeenCalledWith("arch_1");
        expect(screen.getByLabelText(/Enviado: sí; recibido: no; verificado: no/)).toBeTruthy();
    });

    it("enviando: barra de progreso, porcentaje y «Cancelar»", () => {
        vivo.actual = { rol: "enviar", fase: "transfiriendo", progreso: 5, trozos: 10, tamano: 2048, inicioMs: 0, actualizadoMs: 0 };
        render(<TarjetaArchivo m={msg({ dir: "sale", estado: "confirmado", adjunto })} />);
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
        expect(screen.getByText("Enviando · 50 %")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Cancelar/ }));
        expect(archivos.cancelarArchivo).toHaveBeenCalledWith("arch_1");
    });

    it("tras recargar, lo interrumpido se reanuda desde la copia de este aparato", () => {
        const m = msg({ dir: "sale", estado: "confirmado", adjunto, archivo: { fase: "interrumpido", porcentaje: 30 } });
        render(<TarjetaArchivo m={m} />);
        fireEvent.click(screen.getByRole("button", { name: /Reanudar/ }));
        expect(archivos.reintentarArchivoNeurona).toHaveBeenCalledWith(m);
    });

    it("del almacenamiento de la cuenta: se baja y se verifica a mano", () => {
        const m = msg({ adjunto: { ...adjunto, modo: "servidor", url: "https://x.supabase.co/a.pdf", sha256: "a".repeat(64) } });
        render(<TarjetaArchivo m={m} />);
        expect(screen.getByText("Disponible para bajar")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Bajar y verificar/ }));
        expect(archivos.bajarArchivoServidor).toHaveBeenCalledWith(m);
    });

    it("verificado: lo dice con SHA-256 y deja guardarlo", () => {
        render(<TarjetaArchivo m={msg({ adjunto, archivo: { fase: "verificado", guardado: true } })} />);
        expect(screen.getByText("Verificado (SHA-256)")).toBeTruthy();
        expect(screen.getByRole("button", { name: /Abrir \/ guardar PDF/ })).toBeTruthy();
    });
});

describe("tarjetas de llamada y de transmisión", () => {
    it("la llamada dice su tipo, su vía y cuánto duró", () => {
        render(
            <TarjetaLlamada
                m={msg({ dir: "sale", estado: "confirmado", llamada: { tipo: "video", via: "enlace-local" }, registroLlamada: { fase: "terminada", inicio: 1000, fin: 43_000 } })}
            />,
        );
        expect(screen.getByText("Videollamada saliente · sin internet")).toBeTruthy();
        expect(screen.getByText("Duró 0:42")).toBeTruthy();
    });

    it("una transmisión que esta pestaña no vio lo dice con honestidad", () => {
        render(<TarjetaFlujo m={msg({ flujo: { id: "f1", nombre: "Notas en vivo", formato: "texto" } })} />);
        expect(screen.getByText(/Lo vivo no se guarda/)).toBeTruthy();
    });
});

describe("botones de llamada", () => {
    it("la pantalla se pide en el mismo gesto y, si no se puede llamar, se dice por qué", async () => {
        render(<BotonesLlamadaNeurona conversacion={conv} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Compartir tu pantalla con Tablet Android" }));
        });
        expect(llamadas.pedirPantalla).toHaveBeenCalledTimes(1);
        expect(llamadas.llamarANeurona).toHaveBeenCalledWith(expect.objectContaining({ tipo: "pantalla", conversacion: conv }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No hay cómo llamar a esta neurona ahora."));
    });

    it("en el móvil no ofrece compartir pantalla", () => {
        render(<BotonesLlamadaNeurona conversacion={conv} compacto />);
        expect(screen.getByRole("button", { name: "Llamada de voz con Tablet Android" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Compartir tu pantalla/ })).toBeNull();
    });
});

describe("hilo de la neurona", () => {
    it("arrastrar varios archivos los manda todos a la neurona", async () => {
        const { container } = render(<HiloNeurona conversacion={conv} cerebros={[]} esMovil={false} />);
        expect(buzon.fijarHiloAbierto).toHaveBeenCalledWith("n:tab");
        const raiz = container.firstElementChild as HTMLElement;
        const a = new File(["hola"], "a.txt", { type: "text/plain" });
        const b = new File([new Uint8Array([1, 2, 3])], "b.bin");
        fireEvent.dragOver(raiz, { dataTransfer: { types: ["Files"], files: [a, b] } });
        expect(screen.getByTestId("soltar-archivos")).toBeTruthy();
        await act(async () => {
            fireEvent.drop(raiz, { dataTransfer: { types: ["Files"], files: [a, b] } });
        });
        expect(archivos.enviarArchivosANeurona).toHaveBeenCalledWith({ clave: "n:tab", destino: { neuronDeviceId: "tab" }, archivos: [a, b] });
        expect(screen.queryByTestId("soltar-archivos")).toBeNull();
    });

    it("pinta la tarjeta de un archivo y la de una llamada dentro de sus burbujas", () => {
        bandeja.estado = {
            v: 1,
            conv: {
                "n:tab": {
                    leidoHasta: 0,
                    mensajes: [
                        msg({ id: "x1", adjunto, archivo: { fase: "verificado", guardado: true } }),
                        msg({ id: "x2", dir: "sale", estado: "confirmado", llamada: { tipo: "audio", via: "sistema-llamadas", sesion: "s1" }, registroLlamada: { fase: "perdida" } }),
                    ],
                },
            },
            vias: {},
        };
        render(<HiloNeurona conversacion={conv} cerebros={[]} esMovil={false} />);
        expect(screen.getByTestId("tarjeta-archivo")).toBeTruthy();
        expect(screen.getByText("Llamada de voz saliente")).toBeTruthy();
        expect(screen.getByText("Sin respuesta")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Mandar archivos a Tablet Android" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Transmitir en vivo a Tablet Android" })).toBeTruthy();
    });
});
