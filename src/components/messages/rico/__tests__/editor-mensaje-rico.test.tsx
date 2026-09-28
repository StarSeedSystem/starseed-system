/**
 * EditorMensajeRico: envía texto con formato (negrita aplicada desde la barra sobre el modelo),
 * compone un lienzo con una ventana web, rechaza direcciones peligrosas, deshace, y captura una app
 * en vivo como elemento del lienzo (también como adjunto del chat).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DmAttachment } from "@/lib/messages/dm";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/messages/vivo/tarjeta-vivo", () => ({
    TarjetaVivo: ({ adjunto }: { adjunto: { name?: string } }) => <div data-testid="tarjeta-vivo">{adjunto.name}</div>,
}));
vi.mock("@/components/messages/vivo/boton-compartir-vivo", () => ({
    BotonCompartirVivo: ({ onEnviar }: { onEnviar: (r: { body: string; attachments: DmAttachment[] }) => void }) => (
        <button
            type="button"
            onClick={() =>
                onEnviar({
                    body: "Pizarra en vivo",
                    attachments: [{ kind: "vivo", tipoVivo: "pizarra", sesionId: "ses-1", route: "/vivo/ses-1", name: "Pizarra común", permiso: "editar" } as DmAttachment],
                })
            }
        >
            App en vivo
        </button>
    ),
}));

import { EditorMensajeRico } from "@/components/messages/rico/editor-mensaje-rico";
import { aplicarRango } from "@/components/messages/rico/doc-dom";

beforeAll(() => {
    class RO {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

afterEach(() => cleanup());

function montar(textoInicial?: string) {
    const onEnviar = vi.fn(async () => {});
    const onOpenChange = vi.fn();
    render(<EditorMensajeRico open onOpenChange={onOpenChange} hiloId="hilo-1" textoInicial={textoInicial} onEnviar={onEnviar} />);
    return { onEnviar, onOpenChange };
}

describe("EditorMensajeRico", () => {
    it("envía el texto inicial como documento con su texto plano", async () => {
        const { onEnviar, onOpenChange } = montar("Hola equipo");
        expect(screen.getByRole("dialog")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() => expect(onEnviar).toHaveBeenCalledTimes(1));
        expect(onEnviar).toHaveBeenCalledWith({
            body: "Hola equipo",
            formato: { v: 1, doc: { bloques: [{ tipo: "parrafo", tramos: [{ texto: "Hola equipo" }] }] } },
            attachments: [],
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("aplica negrita a la selección desde la barra (sobre el modelo, sin HTML)", async () => {
        const { onEnviar } = montar("Hola equipo");
        const editor = document.querySelector("[data-editor-doc]") as HTMLElement;
        expect(editor).toBeTruthy();
        act(() => {
            editor.focus();
            aplicarRango(editor, { inicio: { bloque: 0, item: 0, off: 5 }, fin: { bloque: 0, item: 0, off: 11 } });
        });
        fireEvent.click(screen.getByRole("button", { name: "Negrita (Ctrl+B)" }));
        expect(editor.querySelector("strong")?.textContent).toBe("equipo");
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() => expect(onEnviar).toHaveBeenCalledTimes(1));
        const [{ formato }] = onEnviar.mock.calls[0] as unknown as [{ formato: { doc: unknown } }];
        expect(formato.doc).toEqual({ bloques: [{ tipo: "parrafo", tramos: [{ texto: "Hola " }, { texto: "equipo", marcas: ["negrita"] }] }] });
    });

    it("convierte el párrafo en título y lista desde la barra", () => {
        montar("Plan");
        const editor = document.querySelector("[data-editor-doc]") as HTMLElement;
        act(() => {
            editor.focus();
            aplicarRango(editor, { inicio: { bloque: 0, item: 0, off: 2 }, fin: { bloque: 0, item: 0, off: 2 } });
        });
        fireEvent.change(screen.getByRole("combobox", { name: "Tipo de párrafo" }), { target: { value: "titulo2" } });
        expect(editor.querySelector("h2")?.textContent).toBe("Plan");
        fireEvent.click(screen.getByRole("button", { name: "Lista numerada" }));
        expect(editor.querySelector("ol > li")?.textContent).toBe("Plan");
    });

    it("compone un lienzo con una ventana web y rechaza javascript:", async () => {
        const { onEnviar } = montar();
        fireEvent.click(screen.getByRole("tab", { name: "Lienzo" }));
        fireEvent.click(screen.getByRole("button", { name: /Ventana web/ }));
        const url = await screen.findByLabelText("Dirección");
        fireEvent.change(url, { target: { value: "javascript:alert(1)" } });
        fireEvent.click(screen.getByRole("button", { name: "Añadir ventana" }));
        expect((await screen.findByRole("alert")).textContent).toMatch(/https:\/\//);
        fireEvent.change(url, { target: { value: "ejemplo.org/mapa" } });
        fireEvent.click(screen.getByRole("button", { name: "Añadir ventana" }));
        await waitFor(() => expect(document.querySelector('[data-escenario] [data-tipo="web"]')).toBeTruthy());
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() => expect(onEnviar).toHaveBeenCalledTimes(1));
        const [{ body, formato }] = onEnviar.mock.calls[0] as unknown as [{ body: string; formato: { lienzo: { elementos: { tipo: string; url: string }[] } } }];
        expect(body).toBe("[ventana: ejemplo.org]");
        expect(formato.lienzo.elementos[0]).toMatchObject({ tipo: "web", url: "https://ejemplo.org/mapa" });
    });

    it("deshace y rehace los cambios del lienzo", async () => {
        montar();
        fireEvent.click(screen.getByRole("tab", { name: "Lienzo" }));
        fireEvent.click(screen.getByRole("button", { name: /Rectángulo/ }));
        expect(document.querySelectorAll("[data-escenario] [data-tipo]")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
        expect(document.querySelectorAll("[data-escenario] [data-tipo]")).toHaveLength(2);
        fireEvent.click(screen.getByRole("button", { name: "Deshacer (Ctrl+Z)" }));
        expect(document.querySelectorAll("[data-escenario] [data-tipo]")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Deshacer (Ctrl+Z)" }));
        expect(document.querySelectorAll("[data-escenario] [data-tipo]")).toHaveLength(0);
        expect((screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Rehacer (Ctrl+Mayús+Z)" }));
        expect(document.querySelectorAll("[data-escenario] [data-tipo]")).toHaveLength(1);
    });

    it("la app en vivo entra en el lienzo y viaja como adjunto", async () => {
        const { onEnviar } = montar();
        fireEvent.click(screen.getByRole("tab", { name: "Lienzo" }));
        fireEvent.click(screen.getByRole("button", { name: "App en vivo" }));
        await waitFor(() => expect(document.querySelector('[data-escenario] [data-tipo="vivo"]')).toBeTruthy());
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() => expect(onEnviar).toHaveBeenCalledTimes(1));
        const [{ body, attachments }] = onEnviar.mock.calls[0] as unknown as [{ body: string; attachments: DmAttachment[] }];
        expect(body).toBe("[en vivo: Pizarra común]");
        expect(attachments).toHaveLength(1);
        expect(attachments[0]).toMatchObject({ kind: "vivo", sesionId: "ses-1", route: "/vivo/ses-1" });
    });
});
