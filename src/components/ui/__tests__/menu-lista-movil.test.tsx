// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Bot, Mic } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MenuListaMovil } from "@/components/ui/menu-lista-movil";

const OPCIONES = [
    { id: "chat", label: "Chat Multiagéntico & Voz", icon: Bot, hint: "Conversa con Astraura" },
    { id: "voz", label: "VoiceStudio & Forja de Sonido", icon: Mic },
    { id: "gobernanza", label: "Gobernanza de la Red" },
];

afterEach(cleanup);

describe("MenuListaMovil", () => {
    it("el botón enseña la opción actual con su nombre completo", () => {
        render(<MenuListaMovil titulo="Secciones" opciones={OPCIONES} valor="voz" onCambiar={() => {}} />);
        const boton = screen.getByRole("button", { name: "Secciones: VoiceStudio & Forja de Sonido" });
        expect(boton.textContent).toContain("VoiceStudio & Forja de Sonido");
    });

    it("abre la lista completa, marca la actual y elige otra", () => {
        const onCambiar = vi.fn();
        render(<MenuListaMovil titulo="Secciones" opciones={OPCIONES} valor="chat" onCambiar={onCambiar} />);
        fireEvent.click(screen.getByRole("button", { name: /Secciones/ }));
        const hoja = screen.getByRole("dialog", { name: "Secciones" });
        expect(hoja.textContent).toContain("Gobernanza de la Red");
        expect(hoja.textContent).toContain("Conversa con Astraura");
        const actual = [...hoja.querySelectorAll("button[aria-current='true']")];
        expect(actual).toHaveLength(1);
        expect(actual[0].textContent).toContain("Chat Multiagéntico & Voz");
        fireEvent.click(screen.getByText("Gobernanza de la Red"));
        expect(onCambiar).toHaveBeenCalledWith("gobernanza");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("se cierra con Escape y elegir la actual no la vuelve a cambiar", () => {
        const onCambiar = vi.fn();
        render(<MenuListaMovil titulo="Secciones" opciones={OPCIONES} valor="chat" onCambiar={onCambiar} />);
        fireEvent.click(screen.getByRole("button", { name: /Secciones/ }));
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Secciones/ }));
        fireEvent.click(screen.getAllByText("Chat Multiagéntico & Voz").at(-1)!);
        expect(onCambiar).not.toHaveBeenCalled();
    });
});
