import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { AiGeneratedWidget } from "../../ai-generated-widget";

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); });

const vacio = { id: "w1", settings: {} } as any;
const lleno = {
    id: "w2",
    settings: {
        customHtml: "<div id='reloj'>12:00</div><script>parent.document.cookie</script>",
        forgePrompt: "Un reloj de sol para mi huerto",
        ontology: { title: "Reloj solar", description: "La hora según el sol", themeColor: "#f59e0b" },
    },
} as any;

describe("Widget forjado con IA", () => {
    it.each(TODAS)("vacío invita a forjar en %s", (clase) => {
        montarEn(clase, <AiGeneratedWidget widget={vacio} />);
        expect(document.querySelector("[data-widget-e='AI_GENERATED']")?.getAttribute("data-clase")).toBe(clase);
        expect(screen.getAllByRole("button", { name: /Forjar un widget con IA|Abrir La Fragua/ }).length).toBeGreaterThan(0);
    });

    it("el botón abre la Fragua global en cualquier pantalla", () => {
        const oido = vi.fn();
        window.addEventListener("starseed:open-forge", oido);
        montarEn("l", <AiGeneratedWidget widget={vacio} />);
        fireEvent.click(screen.getByRole("button", { name: "Abrir La Fragua" }));
        expect(oido).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("link", { name: "Centro de creación" }).getAttribute("href")).toBe("/crear?area=fragua");
        window.removeEventListener("starseed:open-forge", oido);
    });

    it.each(["s", "m", "l", "xl", "panoramico", "torre"] as const)("lleno en %s: iframe aislado, sin mismo origen", (clase) => {
        montarEn(clase, <AiGeneratedWidget widget={lleno} />);
        const iframe = document.querySelector("iframe") as HTMLIFrameElement;
        expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
        expect(iframe.getAttribute("sandbox")).not.toMatch(/same-origin/);
        expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
        expect(iframe.getAttribute("srcdoc")).toContain("12:00");
        expect(iframe.getAttribute("title")).toBe("Reloj solar");
    });

    it("en micro lleno enseña el emblema, no un iframe ilegible", () => {
        montarEn("micro", <AiGeneratedWidget widget={lleno} />);
        expect(document.querySelector("iframe")).toBeNull();
        expect(screen.getByText("Reloj solar")).toBeTruthy();
    });

    it("en l: detalles con lo que pediste, recargar y forjar otro", () => {
        const oido = vi.fn();
        window.addEventListener("starseed:open-forge", oido);
        montarEn("l", <AiGeneratedWidget widget={lleno} />);
        expect(screen.getByRole("status").textContent).toMatch(/Cargando Reloj solar/);
        act(() => { fireEvent.load(document.querySelector("iframe")!); });
        expect(screen.queryByRole("status")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Detalles" }));
        expect(screen.getByText("Un reloj de sol para mi huerto")).toBeTruthy();
        expect(screen.getByText(/Corre aislado/)).toBeTruthy();
        const antes = document.querySelector("iframe");
        fireEvent.click(screen.getByRole("button", { name: "Recargar el widget" }));
        expect(document.querySelector("iframe")).not.toBe(antes);
        fireEvent.click(screen.getByRole("button", { name: "Forjar otro" }));
        expect(oido).toHaveBeenCalledTimes(1);
        window.removeEventListener("starseed:open-forge", oido);
    });

    it("si el tablero pasa onEditRequest, el botón edita ese widget", () => {
        const editar = vi.fn();
        montarEn("l", <AiGeneratedWidget widget={lleno} onEditRequest={editar} />);
        fireEvent.click(screen.getByRole("button", { name: "Editar con IA" }));
        expect(editar).toHaveBeenCalledWith(lleno);
    });
});
