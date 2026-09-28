// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AJUSTES_DEFECTO, type AjustesMensajeria, type AjustesMensajeriaApi } from "@/lib/mensajeria/ajustes-tipos";

// ── Dobles: el almacén (C7) y lo que no es de esta pantalla ──────────────────
const api = vi.hoisted(() => ({ actual: null as unknown as AjustesMensajeriaApi }));

vi.mock("@/lib/mensajeria/ajustes-store", () => ({ useAjustesMensajeria: () => api.actual }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("@/hooks/use-nivel-movimiento", () => ({ useNivelMovimiento: () => "minimo" }));
vi.mock("@/components/files/universal-file-picker", () => ({
    AttachFilePickerButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("@/components/messages/info/ajustes-hilo", () => ({
    AjustesHiloPanel: ({ hiloId }: { hiloId: string }) => <p>Panel del hilo {hiloId}</p>,
}));
vi.mock("@/lib/mail/os-mail", () => ({
    getLinkedExternalEmail: vi.fn(async () => "yo@ejemplo.com"),
    setLinkedExternalEmail: vi.fn(async () => true),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AjustesMensajeriaDialog } from "../ajustes-mensajeria";

function crearApi(ajustes: Partial<AjustesMensajeria> = {}): AjustesMensajeriaApi {
    const doc: AjustesMensajeria = { ...AJUSTES_DEFECTO, ...ajustes };
    return {
        listo: true,
        ajustes: doc,
        cambiar: vi.fn(),
        cambiarHilo: vi.fn(),
        restablecerHilo: vi.fn(),
        restablecerTodo: vi.fn(),
        efectivos: vi.fn() as unknown as AjustesMensajeriaApi["efectivos"],
    };
}

function dialogo(): HTMLElement {
    return screen.getByTestId("ajustes-mensajeria");
}

describe("AjustesMensajeriaDialog (C3)", () => {
    beforeEach(() => {
        api.actual = crearApi();
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("abre en Chats con la vista previa en vivo y cambia «Enviar con Enter» por la API", () => {
        render(<AjustesMensajeriaDialog open onOpenChange={() => {}} />);
        const d = dialogo();
        expect(within(d).getByTestId("vista-previa-chat")).toBeTruthy();
        fireEvent.click(within(d).getByRole("switch", { name: "Enviar con Enter" }));
        expect(api.actual.cambiar).toHaveBeenCalledWith("chats", { enviarConEnter: false });
    });

    it("la apariencia se cambia entera (fusión por bloque): tamaño de letra y color de burbuja", () => {
        render(<AjustesMensajeriaDialog open onOpenChange={() => {}} />);
        fireEvent.click(within(dialogo()).getByRole("radio", { name: "Muy grande" }));
        expect(api.actual.cambiar).toHaveBeenCalledWith("chats", {
            apariencia: { ...AJUSTES_DEFECTO.chats.apariencia, tamanoLetra: "xl" },
        });
        fireEvent.click(within(dialogo()).getByRole("radio", { name: "Color #10B981" }));
        expect(api.actual.cambiar).toHaveBeenLastCalledWith("chats", {
            apariencia: { ...AJUSTES_DEFECTO.chats.apariencia, colorBurbuja: "#10B981" },
        });
    });

    it("Privacidad › «Solo contactos» manda lo demás a Solicitudes", async () => {
        render(<AjustesMensajeriaDialog open onOpenChange={() => {}} />);
        fireEvent.click(within(dialogo()).getByRole("button", { name: /Privacidad/ }));
        const radio = await screen.findByRole("radio", { name: "Solo contactos" });
        fireEvent.click(radio);
        expect(api.actual.cambiar).toHaveBeenCalledWith("privacidad", { escribirme: "contactos" });
    });

    it("abre directamente en la sección pedida (Correos) y cambia la vista", async () => {
        render(<AjustesMensajeriaDialog open onOpenChange={() => {}} seccionInicial="correos" />);
        expect(await screen.findByLabelText("Firma de tus correos")).toBeTruthy();
        fireEvent.click(screen.getByRole("radio", { name: "Lista" }));
        expect(api.actual.cambiar).toHaveBeenCalledWith("correos", { vista: "lista" });
    });

    it("«Restablecer todo» pide confirmación antes de actuar", () => {
        render(<AjustesMensajeriaDialog open onOpenChange={() => {}} />);
        fireEvent.click(within(dialogo()).getByRole("button", { name: "Restablecer todo" }));
        expect(api.actual.restablecerTodo).not.toHaveBeenCalled();
        fireEvent.click(within(dialogo()).getByRole("button", { name: "Sí, restablecer" }));
        expect(api.actual.restablecerTodo).toHaveBeenCalledTimes(1);
    });

    it("Chats personalizados lista los hilos con ajustes propios y los restablece", async () => {
        api.actual = crearApi({
            hilos: {
                "hilo-1": { fijado: true, apodo: "Huerto", actualizado: "2026-09-28T10:00:00.000Z" },
                "hilo-vacio": { actualizado: "2026-09-28T10:00:00.000Z" },
            },
        });
        render(<AjustesMensajeriaDialog open onOpenChange={() => {}} seccionInicial="personalizados" />);
        const lista = await screen.findByRole("list", { name: "Chats con ajustes propios" });
        expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
        expect(lista.textContent).toContain("Apodo «Huerto»");
        fireEvent.click(within(lista).getByRole("button", { name: /Restablecer/ }));
        expect(api.actual.restablecerHilo).toHaveBeenCalledWith("hilo-1");
    });

    it("mientras el almacén carga, no enseña controles que se pisarían", () => {
        api.actual = { ...crearApi(), listo: false };
        render(<AjustesMensajeriaDialog open onOpenChange={() => {}} />);
        expect(within(dialogo()).getByText("Cargando tus ajustes…")).toBeTruthy();
        expect(within(dialogo()).queryByRole("switch")).toBeNull();
    });

    it("en móvil es una hoja con índice de secciones y botón de volver", async () => {
        vi.stubGlobal("matchMedia", (q: string) => ({
            matches: q.includes("max-width"),
            media: q,
            addEventListener: () => {},
            removeEventListener: () => {},
        }));
        render(<AjustesMensajeriaDialog open onOpenChange={() => {}} />);
        const d = dialogo();
        expect(within(d).queryByTestId("vista-previa-chat")).toBeNull();
        fireEvent.click(within(d).getByRole("button", { name: /Notificaciones/ }));
        expect(await within(d).findByRole("button", { name: /Ajustes/ })).toBeTruthy();
        expect(within(d).getByText("Horas de silencio")).toBeTruthy();
    });
});
