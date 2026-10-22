/**
 * SP092941b · Los formularios de creación anuncian cada campo a los lectores
 * de pantalla: los <label> van ligados a su input (htmlFor ↔ id) y los campos
 * sin etiqueta visible llevan un aria-label fijo.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={String(href)}>{children}</a>
    ),
}));

vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({
        boards: [{ id: "local-1", name: "Pizarra local", widgets: [] }],
        setActiveBoard: vi.fn(),
    }),
}));

vi.mock("@/context/control-panel-context", () => ({
    useControlPanel: () => ({ setActiveTab: vi.fn(), setIsOpen: vi.fn() }),
}));

vi.mock("@/lib/canvas/canvas", () => ({
    listCanvases: () =>
        Promise.resolve([{ id: "nube-1", title: "Pizarra nube", blocks: [], shared: false }]),
}));

vi.mock("@/lib/os-social", () => ({
    createPost: () => Promise.resolve({ ok: true }),
}));

import { SourcePicker } from "@/components/creation/source-picker";
import { PizarrasPanel } from "@/components/creation/pizarras-panel";

afterEach(cleanup);

describe("Formularios de creación accesibles", () => {
    it("la URL y su etiqueta del selector de fuente quedan ligadas por id", async () => {
        render(<SourcePicker open onPick={vi.fn()} kinds={["url"]} />);
        const inputUrl = await screen.findByLabelText("URL");
        const inputEtiqueta = screen.getByLabelText("Etiqueta (opcional)");
        const labelUrl = screen.getByText("URL", { selector: "label" });
        const labelEtiqueta = screen.getByText("Etiqueta (opcional)", { selector: "label" });
        expect(labelUrl.getAttribute("for")).toBe(inputUrl.getAttribute("id"));
        expect(inputUrl.getAttribute("id")).toBeTruthy();
        expect(labelEtiqueta.getAttribute("for")).toBe(inputEtiqueta.getAttribute("id"));
        expect(inputEtiqueta.getAttribute("id")).toBeTruthy();
    });

    it("el input de archivo oculto del dispositivo lleva nombre accesible fijo", () => {
        render(<SourcePicker open onPick={vi.fn()} kinds={["device"]} />);
        expect(screen.getByLabelText("Archivo del dispositivo")).toBeInTheDocument();
    });

    it("el comentario de la publicación tiene etiqueta accesible", async () => {
        render(<PizarrasPanel />);
        const compartir = (await screen.findAllByText("Compartir como publicación"))[0];
        fireEvent.click(compartir);
        expect(
            await screen.findByLabelText("Comentario de la publicación (opcional)"),
        ).toBeInTheDocument();
    });
});
