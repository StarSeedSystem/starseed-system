import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { BotonCerrar } from "../boton-cerrar";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../dialog";
import { OSWindow } from "@/components/dashboard/apps/os-window";
import { Sparkles } from "lucide-react";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

describe("BotonCerrar (la X común del OS)", () => {
    afterEach(() => cleanup());

    it("tiene nombre accesible en español, rótulo con atajo y no inicia arrastres", () => {
        const alCerrar = vi.fn();
        render(<BotonCerrar etiqueta="Cerrar el Centro de Control" atajo="Esc" onClick={alCerrar} />);
        const boton = screen.getByRole("button", { name: "Cerrar el Centro de Control" });
        expect(boton.getAttribute("title")).toBe("Cerrar el Centro de Control (Esc)");
        expect(boton.getAttribute("type")).toBe("button");
        expect(boton.hasAttribute("data-sin-arrastre")).toBe(true);
        fireEvent.click(boton);
        expect(alCerrar).toHaveBeenCalledTimes(1);
    });

    it("por defecto se llama «Cerrar» y reenvía la ref y las props nativas", () => {
        const ref = createRef<HTMLButtonElement>();
        render(<BotonCerrar ref={ref} disabled data-testid="x" acento="#f59e0b" />);
        const boton = screen.getByRole("button", { name: "Cerrar" });
        expect(ref.current).toBe(boton);
        expect((boton as HTMLButtonElement).disabled).toBe(true);
        expect(boton.style.getPropertyValue("--acento")).toBe("#f59e0b");
    });

    it("sirve como <Dialog.Close asChild>: la X de cualquier diálogo del OS cierra", async () => {
        const cambiar = vi.fn();
        render(
            <Dialog open onOpenChange={cambiar}>
                <DialogContent>
                    <DialogTitle>Prueba</DialogTitle>
                    <DialogDescription>Diálogo de prueba</DialogDescription>
                </DialogContent>
            </Dialog>,
        );
        const x = screen.getByRole("button", { name: "Cerrar" });
        expect(x.hasAttribute("data-boton-cerrar")).toBe(true);
        fireEvent.click(x);
        await waitFor(() => expect(cambiar).toHaveBeenCalledWith(false));
    });

    it("un diálogo CERRADO no marca la pantalla como ocupada (antes ocultaba el cromo Trinity para siempre)", async () => {
        const { rerender } = render(
            <Dialog open={false}>
                <DialogContent>
                    <DialogTitle>Oculto</DialogTitle>
                    <DialogDescription>Montado pero cerrado, como el de usePrompt</DialogDescription>
                </DialogContent>
            </Dialog>,
        );
        expect(document.body.dataset.ssModal).toBeUndefined();
        rerender(
            <Dialog open>
                <DialogContent>
                    <DialogTitle>Oculto</DialogTitle>
                    <DialogDescription>Ahora abierto</DialogDescription>
                </DialogContent>
            </Dialog>,
        );
        expect(document.body.dataset.ssModal).toBe("1");
        rerender(
            <Dialog open={false}>
                <DialogContent>
                    <DialogTitle>Oculto</DialogTitle>
                    <DialogDescription>Cerrado otra vez</DialogDescription>
                </DialogContent>
            </Dialog>,
        );
        await waitFor(() => expect(document.body.dataset.ssModal).toBeUndefined());
    });

    it("la ventana del OS (OSWindow) usa la X común y no la arrastra al pulsarla", () => {
        const alCerrar = vi.fn();
        render(
            <OSWindow title="Notas" icon={Sparkles} accent="#22d3ee" onClose={alCerrar}>
                <p>contenido</p>
            </OSWindow>,
        );
        const x = screen.getByRole("button", { name: "Cerrar ventana" });
        fireEvent.pointerDown(x, { clientX: 10, clientY: 10 });
        fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
        fireEvent.click(x);
        expect(alCerrar).toHaveBeenCalledTimes(1);
        const marco = x.closest("[style*='translate']") as HTMLElement;
        expect(marco.style.transform).toBe("translate(0px, 0px)");
    });
});
