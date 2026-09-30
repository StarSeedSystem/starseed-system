import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    osTheme: "default",
    theme: "dark",
    guardados: [] as any[],
    updateSection: vi.fn(),
    setTheme: vi.fn(),
    loadTheme: vi.fn(),
    deleteTheme: vi.fn(),
    saveTheme: vi.fn(),
    updateConfig: vi.fn(),
    undo: vi.fn(),
    abiertos: [] as any[],
}));

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: h.theme, setTheme: h.setTheme }) }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: { themeStore: { osTheme: h.osTheme, savedThemes: h.guardados, activeMode: "primary" }, background: { layers: [] } },
        updateSection: h.updateSection, updateConfig: h.updateConfig, saveTheme: h.saveTheme, loadTheme: h.loadTheme, deleteTheme: h.deleteTheme,
        undo: h.undo, canUndo: true, exportTheme: vi.fn(), importTheme: vi.fn(async () => {}),
    }),
}));
vi.mock("../../../apps/content/content-opener", () => ({
    useContentOpener: () => ({ open: (r: any) => h.abiertos.push(r), openMany: (rs: any[]) => h.abiertos.push(...rs), windowEl: null }),
}));

import { TODAS, dice, entornoNavegador, montarEn } from "../pruebas-render";
import { paletaDeGuardado } from "../temas";
import { ThemeSelectorWidget } from "../../theme-selector-widget";
import { ThemeManagerWidget } from "../../theme-manager-widget";
import { UniversalOpenerWidget, urlValida } from "../../universal-opener-widget";

beforeAll(entornoNavegador);
beforeEach(() => { h.osTheme = "default"; h.theme = "dark"; h.guardados = []; h.abiertos = []; });
afterEach(() => { cleanup(); window.localStorage.clear(); vi.clearAllMocks(); });

const widget = { id: "w", dashboard_id: "d", widget_type: "UNIVERSAL_OPENER", layout: { x: 0, y: 0, w: 4, h: 5, i: "w" }, settings: {}, created_at: "" } as any;

describe("Selector de aspecto", () => {
    it.each(TODAS)("se pinta en %s", (clase) => {
        const { container } = montarEn(clase, <ThemeSelectorWidget />);
        expect(container.querySelector("[data-widget-e='THEME_SELECTOR']")?.getAttribute("data-clase")).toBe(clase);
    });

    it("aplica una identidad de un toque y permite deshacer", () => {
        montarEn("l", <ThemeSelectorWidget />);
        fireEvent.click(screen.getByRole("button", { name: "Identidad StarSeed Café" }));
        expect(h.updateSection).toHaveBeenCalledWith("themeStore", { osTheme: "cafe" });
        fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
        expect(h.updateSection).toHaveBeenLastCalledWith("themeStore", { osTheme: "default" });
    });

    it("cambia la atmósfera con next-themes y marca la actual", () => {
        montarEn("l", <ThemeSelectorWidget />);
        expect(screen.getByRole("button", { name: /Atmósfera Obsidiana \(actual\)/ })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Atmósfera Cristal líquido/ }));
        expect(h.setTheme).toHaveBeenCalledWith("liquid-crystal");
    });

    it("en micro el orbe pasa a la siguiente identidad", () => {
        montarEn("micro", <ThemeSelectorWidget />);
        fireEvent.click(screen.getByRole("button", { name: /Cambiar a StarSeed Café/ }));
        expect(h.updateSection).toHaveBeenCalledWith("themeStore", { osTheme: "cafe" });
    });
});

describe("Archivo de temas", () => {
    it.each(TODAS)("sin temas invita a guardar el actual en %s", (clase) => {
        montarEn(clase, <ThemeManagerWidget />);
        expect(dice("Aún no has guardado ningún aspecto")).toBeTruthy();
    });

    it("aplica por id (no por nombre), ordena y borra con confirmación", () => {
        h.guardados = [
            { id: "t1", name: "Noche Café", createdAt: 1, config: { themeStore: { osTheme: "cafe" } } },
            { id: "t2", name: "Holograma", createdAt: 2, config: { themeStore: { osTheme: "omnifrecuencias" } } },
        ];
        montarEn("l", <ThemeManagerWidget />);
        fireEvent.click(screen.getByRole("button", { name: "Aplicar Noche Café" }));
        expect(h.loadTheme).toHaveBeenCalledWith("t1");
        expect(screen.getByRole("status").textContent).toMatch(/Aplicado: Noche Café/);
        fireEvent.click(screen.getByRole("button", { name: "Bajar Noche Café" }));
        expect(h.updateConfig.mock.calls[0][0].themeStore.savedThemes.map((t: any) => t.id)).toEqual(["t2", "t1"]);
        fireEvent.click(screen.getByRole("button", { name: "Eliminar Holograma" }));
        expect(h.deleteTheme).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
        expect(h.deleteTheme).toHaveBeenCalledWith("t2");
    });

    it("la vista previa sale de la configuración guardada", () => {
        const v = paletaDeGuardado({ themeStore: { osTheme: "cafe" } as any, background: { type: "living", living: { colors: ["#123456", "#abcdef"] } } as any });
        expect(v.serif).toBe(true);
        expect(v.paleta[2]).toBe("#123456");
        expect(v.fondo).toBe("living");
    });
});

describe("Visor universal", () => {
    it.each(TODAS)("se pinta en %s", (clase) => {
        const { container } = montarEn(clase, <UniversalOpenerWidget widget={widget} />);
        expect(container.querySelector("[data-widget-e='UNIVERSAL_OPENER']")?.getAttribute("data-clase")).toBe(clase);
    });

    it("valida la URL, dice qué es y la guarda en recientes", () => {
        expect(urlValida("javascript:alert(1)")).toBeNull();
        expect(urlValida("ejemplo")).toBeNull();
        expect(urlValida("starseed.org/a.pdf")).toBe("https://starseed.org/a.pdf");
        montarEn("m", <UniversalOpenerWidget widget={widget} />);
        const campo = screen.getByRole("textbox", { name: "Dirección a abrir" });
        fireEvent.change(campo, { target: { value: "https://upload.wikimedia.org/x/foto.png" } });
        expect(screen.getByText("Imagen")).toBeTruthy();
        fireEvent.submit(campo.closest("form")!);
        expect(h.abiertos[0].url).toBe("https://upload.wikimedia.org/x/foto.png");
        fireEvent.change(campo, { target: { value: "hola" } });
        fireEvent.submit(campo.closest("form")!);
        expect(screen.getByRole("alert").textContent).toMatch(/no parece una dirección web/);
    });

    it("sin recientes lo dice y enseña los formatos rotulados", () => {
        montarEn("l", <UniversalOpenerWidget widget={widget} />);
        expect(screen.getByText(/Aún vacío/)).toBeTruthy();
        act(() => { fireEvent.click(screen.getByRole("tab", { name: "Formatos" })); });
        expect(screen.getByText("muestras de formatos")).toBeTruthy();
    });
});
