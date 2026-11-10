// ESC1110B — La bienvenida: un botón por tipo de elemento (todos a su flujo real), Astraura como
// acción principal, salida y vuelta con transición, y movimiento reducido.
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { BienvenidaEscritorio, EmptyDesktopState, TIPOS_ELEMENTO, variantesBienvenida } from "../desktop-empty";
import type { Desktop, DesktopIconKind } from "../desktop-store";
import { SIMBOLO_OFICIAL, archivoDesdeRecurso } from "@/components/brand/simbolo-archivo";

const escritorio = { id: "d1", name: "Inicio" } as unknown as Desktop;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function props(extra: Partial<React.ComponentProps<typeof EmptyDesktopState>> = {}) {
    return {
        desktop: escritorio,
        onAddApps: vi.fn(), onAddWidgets: vi.fn(), onExploreLibrary: vi.fn(),
        onAdd: vi.fn(), onNewNote: vi.fn(),
        ...extra,
    };
}

describe("botones de la bienvenida", () => {
    it("cubre cada tipo que admite el escritorio (DesktopIconKind + notas)", () => {
        // Si alguien añade un tipo nuevo de icono, esta lista obliga a pensar su botón.
        const tipos: Record<DesktopIconKind, string> = { app: "apps", widget: "widgets", file: "files", link: "web", folder: "folder" };
        const ids = TIPOS_ELEMENTO.map((t) => t.id);
        for (const tab of Object.values(tipos)) expect(ids).toContain(tab);
        expect(ids).toContain("nota");
    });

    it("cada botón abre el flujo real de su tipo; la nota se crea al momento", () => {
        const p = props();
        render(<EmptyDesktopState {...p} />);
        for (const t of TIPOS_ELEMENTO) fireEvent.click(screen.getByTestId(`anadir-${t.id}`));
        expect((p.onAdd as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0])).toEqual(["apps", "widgets", "files", "web", "folder"]);
        expect(p.onNewNote).toHaveBeenCalledTimes(1);
    });

    it("sin `onAdd` usa los callbacks de siempre y NO pinta botones sin flujo (ninguno muerto)", () => {
        const p = props({ onAdd: undefined, onNewNote: undefined });
        render(<EmptyDesktopState {...p} />);
        fireEvent.click(screen.getByTestId("anadir-apps"));
        fireEvent.click(screen.getByTestId("anadir-widgets"));
        fireEvent.click(screen.getByTestId("anadir-files"));
        expect(p.onAddApps).toHaveBeenCalled();
        expect(p.onAddWidgets).toHaveBeenCalled();
        expect(p.onExploreLibrary).toHaveBeenCalled();
        expect(screen.queryByTestId("anadir-web")).toBeNull();
        expect(screen.queryByTestId("anadir-nota")).toBeNull();
    });

    it("la acción principal se llama Astraura (como el resto de la interfaz) y abre su exocórtex", () => {
        const oyente = vi.fn();
        window.addEventListener("starseed:open-aurora-exocortex", oyente);
        render(<EmptyDesktopState {...props()} />);
        fireEvent.click(screen.getByRole("button", { name: /Pídele a Astraura que lo arme/ }));
        expect(oyente).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/Aurora/)).toBeNull();
        window.removeEventListener("starseed:open-aurora-exocortex", oyente);
    });

    it("un símbolo propio se rotula como del perfil, página o grupo", () => {
        const propio = archivoDesdeRecurso("svg", '<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2"/></svg>', "Mío").archivo;
        render(<EmptyDesktopState {...props({ archivo: propio, rotulo: "Símbolo propio de este perfil" })} />);
        expect(screen.getByTestId("rotulo-simbolo-propio").textContent).toBe("Símbolo propio de este perfil");
        expect(screen.getByTestId("simbolo-starseed-3d").dataset.propio).toBe("si");
        expect(screen.getByTestId("simbolo-propio-fijo").getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
        expect(screen.queryByTestId("simbolo-starseed-fijo")).toBeNull(); // nunca la marca oficial en su lugar
    });
});

describe("salida y vuelta", () => {
    it("se retira sola al llegar el primer elemento y vuelve cuando se vacía", async () => {
        const p = props();
        const { rerender } = render(<BienvenidaEscritorio vacio {...p} archivo={SIMBOLO_OFICIAL} />);
        expect(screen.getByTestId("bienvenida-escritorio")).toBeTruthy();
        rerender(<BienvenidaEscritorio vacio={false} {...p} archivo={SIMBOLO_OFICIAL} />);
        await waitFor(() => expect(screen.queryByTestId("bienvenida-escritorio")).toBeNull());
        await act(async () => { rerender(<BienvenidaEscritorio vacio {...p} archivo={SIMBOLO_OFICIAL} />); });
        expect(screen.getByTestId("bienvenida-escritorio")).toBeTruthy();
    });

    it("la salida le cede el espacio: el símbolo sube, se abre y se disuelve; con movimiento reducido, solo opacidad", () => {
        const v = variantesBienvenida(false);
        expect(v.simbolo.saliendo).toMatchObject({ opacity: 0, y: -18 });
        expect((v.simbolo.saliendo as { scale: number }).scale).toBeGreaterThan(1);
        expect(v.texto.saliendo).toMatchObject({ opacity: 0 });
        const r = variantesBienvenida(true);
        for (const fase of [r.simbolo, r.texto, r.fondo]) {
            expect(Object.keys(fase.saliendo as object).filter((k) => k !== "transition")).toEqual(["opacity"]);
            expect(Object.keys(fase.oculto as object)).toEqual(["opacity"]);
        }
    });
});
