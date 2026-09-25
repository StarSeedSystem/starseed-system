import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apps-oficiales/ultima-version", async () => {
    const real = await vi.importActual<typeof import("@/lib/apps-oficiales/ultima-version")>("@/lib/apps-oficiales/ultima-version");
    const oficiales = await vi.importActual<typeof import("@/lib/apps-oficiales/apps-oficiales")>("@/lib/apps-oficiales/apps-oficiales");
    return {
        ...real,
        useUltimaVersion: (id: string) => ({
            release: oficiales.APPS_OFICIALES[id]?.respaldo ?? null,
            instalables: [],
            origen: "github",
            cargando: false,
        }),
    };
});

import { AppOficial, ESPERA_IFRAME_MS, claveVista } from "../app-oficial";

function PortAntiguo() {
    return <p>port integrado</p>;
}

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("AppOficial", () => {
    it("abre la web oficial con sus permisos y la versión viva", () => {
        render(<AppOficial appId="omnifrecuencias" integrada={PortAntiguo} />);
        const iframe = screen.getByTitle("Omnifrecuencias · versión oficial en línea");
        expect(iframe.getAttribute("src")).toBe("https://omnifrecuencias.vercel.app");
        expect(iframe.getAttribute("allow")).toContain("microphone");
        expect(iframe.hasAttribute("sandbox")).toBe(false);
        expect(screen.getByText(/Versión oficial en línea · v2\.0\.0 · publicada el 22 sep/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Código fuente" }).getAttribute("href")).toBe(
            "https://github.com/StarSeedSystem/generador_frecuencias",
        );
        expect(screen.getByRole("status").textContent).toContain("Cargando la versión oficial de Omnifrecuencias");
    });

    it("el conmutador muestra el port, lo rotula y recuerda la elección", () => {
        const { unmount } = render(<AppOficial appId="audiomorphic" integrada={PortAntiguo} />);
        const conmutador = screen.getByRole("switch", { name: /Versión integrada del OS/ });
        expect(conmutador.getAttribute("aria-checked")).toBe("false");
        fireEvent.click(conmutador);
        expect(screen.getByText("port integrado")).toBeTruthy();
        expect(screen.getByText(/más antigua; es la que usa el fondo del OS/, { selector: "span:not(.sr-only)" })).toBeTruthy();
        expect(screen.queryByTitle(/versión oficial en línea/)).toBeNull();
        expect(localStorage.getItem(claveVista("audiomorphic"))).toBe("integrada");
        unmount();

        render(<AppOficial appId="audiomorphic" integrada={PortAntiguo} />);
        expect(screen.getByText("port integrado")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Volver a la versión oficial" }));
        expect(localStorage.getItem(claveVista("audiomorphic"))).toBe("oficial");
    });

    it("si la web no carga en 12 s ofrece pestaña nueva y versión integrada", () => {
        vi.useFakeTimers();
        render(<AppOficial appId="audiomorphic" integrada={PortAntiguo} />);
        act(() => {
            vi.advanceTimersByTime(ESPERA_IFRAME_MS + 10);
        });
        expect(screen.getByRole("alert").textContent).toContain("no ha cargado en 12 segundos");
        fireEvent.click(screen.getByRole("button", { name: "Usar la versión integrada" }));
        expect(screen.getByText("port integrado")).toBeTruthy();
    });

    it("sin port no ofrece el conmutador", () => {
        render(<AppOficial appId="omnifrecuencias" />);
        expect(screen.queryByRole("switch")).toBeNull();
    });
});
