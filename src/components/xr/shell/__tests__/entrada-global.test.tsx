import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosNavegador } from "@/lib/xr/capacidades";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";
import { DATOS_SIN_SONDEO } from "../sondeo-navegador";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(), useRouter: vi.fn() }));
vi.mock("../use-capacidades-xr", () => ({ useCapacidadesXR: vi.fn() }));

import { usePathname, useRouter } from "next/navigation";
import { useCapacidadesXR } from "../use-capacidades-xr";
import { EntradaGlobalXR } from "../entrada-global";

const UA_QUEST = "Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/38.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";
const CLAVE = "starseed.xr.boton.oculto.v1";
const OCULTAR = "Ocultar el botón de entrada a VR y AR";

const ruta = vi.mocked(usePathname);
const enrutar = vi.mocked(useRouter);
const usar = vi.mocked(useCapacidadesXR);
const empujar = vi.fn();

/** Lo que devolvería el hook real con un aparato dado (misma tubería del núcleo). */
function darAparato(extra: Partial<DatosNavegador> = {}, listo = true) {
    const datos: DatosNavegador = { ...DATOS_SIN_SONDEO, ua: UA_QUEST, seguro: true, tieneXR: true, webgl2: true, ...extra };
    const capacidades = evaluarCapacidades(datos);
    return {
        estado: listo ? ("listo" as const) : ("sondeando" as const),
        datos,
        capacidades,
        plan: planificarEntrada(capacidades, { instalada: datos.instalada }),
    };
}

beforeEach(() => {
    window.localStorage.clear();
    empujar.mockReset();
    enrutar.mockReturnValue({ push: empujar } as never);
    ruta.mockReturnValue("/dashboard");
    usar.mockReturnValue(darAparato({ vr: true, ar: true }));
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("EntradaGlobalXR", () => {
    it.each(["/genesis", "/xr/os"])("no se pinta en %s", (r) => {
        ruta.mockReturnValue(r);
        render(<EntradaGlobalXR />);
        expect(screen.queryByTestId("entrada-global-xr")).toBeNull();
        expect(screen.queryByText("Entrar en VR")).toBeNull();
    });

    it("se pinta con un modo inmersivo disponible", () => {
        render(<EntradaGlobalXR />);
        expect(screen.getByTestId("entrada-global-xr")).toBeTruthy();
        expect(screen.getByText("Entrar en VR")).toBeTruthy();
        expect(screen.getByRole("button", { name: OCULTAR })).toBeTruthy();
    });

    it("no pinta nada si el aparato no tiene VR ni AR (ni botón muerto ni aviso)", () => {
        usar.mockReturnValue(darAparato({ ua: UA_IPHONE, tieneXR: false, vr: false, ar: false }));
        render(<EntradaGlobalXR />);
        expect(screen.queryByTestId("entrada-global-xr")).toBeNull();
        expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    it("mientras sondea no adelanta el botón", () => {
        usar.mockReturnValue(darAparato({ vr: true, ar: true }, false));
        render(<EntradaGlobalXR />);
        expect(screen.queryByTestId("entrada-global-xr")).toBeNull();
    });

    it("ocultar se recuerda en localStorage y sobrevive a volver a montar", () => {
        const { unmount } = render(<EntradaGlobalXR />);
        fireEvent.click(screen.getByRole("button", { name: OCULTAR }));
        expect(screen.queryByTestId("entrada-global-xr")).toBeNull();
        expect(window.localStorage.getItem(CLAVE)).toBe("1");
        unmount();
        render(<EntradaGlobalXR />);
        expect(screen.queryByTestId("entrada-global-xr")).toBeNull();
    });

    it("con un localStorage que lanza, ocultar funciona igual sin romper la entrada", () => {
        const leer = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("sin almacenamiento"); });
        const escribir = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("sin almacenamiento"); });
        render(<EntradaGlobalXR />);
        expect(screen.getByText("Entrar en VR")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: OCULTAR }));
        expect(screen.queryByTestId("entrada-global-xr")).toBeNull();
        leer.mockRestore();
        escribir.mockRestore();
    });

    it("pulsar navega a /xr/os con el modo, sin abrir la sesión aquí", () => {
        render(<EntradaGlobalXR />);
        fireEvent.click(screen.getByText("Entrar en VR"));
        expect(empujar).toHaveBeenLastCalledWith("/xr/os?modo=vr");
        fireEvent.click(screen.getByText("Entrar en AR"));
        expect(empujar).toHaveBeenLastCalledWith("/xr/os?modo=ar");
    });

    it("ni la entrada global ni el botón universal importan el motor 3D", () => {
        const fuente = (nombre: string) => readFileSync(`src/components/xr/shell/${nombre}`, "utf8");
        for (const texto of [fuente("entrada-global.tsx"), fuente("boton-entrada-xr.tsx")]) {
            expect(texto).not.toMatch(/from\s+["']three["']/);
            expect(texto).not.toContain("@react-three");
            expect(texto).not.toContain("@pmndrs/uikit");
        }
    });
});
