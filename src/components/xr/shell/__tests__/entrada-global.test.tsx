import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosNavegador } from "@/lib/xr/capacidades";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";
import { DATOS_SIN_SONDEO } from "../sondeo-navegador";
import type { ResultadoCapacidadesXR } from "../use-capacidades-xr";
import { CLAVE_BOTON_OCULTO, EntradaGlobalXR } from "../entrada-global";
import { CLAVE_SUGERENCIA_XR } from "../sugerencia-entrada";
const nav = vi.hoisted(() => ({ ruta: "/dashboard", push: vi.fn() }));
const usar = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.ruta,
    useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("../use-capacidades-xr", () => ({ useCapacidadesXR: usar.fn }));

const UA_QUEST = "Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/38.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";
function aparato(ua: string, extra: Partial<DatosNavegador> = {}): ResultadoCapacidadesXR {
    const datos: DatosNavegador = { ...DATOS_SIN_SONDEO, ua, seguro: true, tieneXR: true, webgl2: true, ...extra };
    const capacidades = evaluarCapacidades(datos);
    const plan = planificarEntrada(capacidades, { instalada: datos.instalada });
    return { estado: "listo", datos, capacidades, plan };
}
function dar(ua: string, extra: Partial<DatosNavegador> = {}): void {
    usar.fn.mockReturnValue(aparato(ua, extra));
}
function visible(): boolean {
    return screen.queryByTestId("entrada-global-xr") !== null;
}
beforeEach(() => {
    nav.ruta = "/dashboard";
    nav.push.mockReset();
    usar.fn.mockReset();
    localStorage.clear();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
describe("EntradaGlobalXR · rutas sin entrada", () => {
    it("no pinta nada en /genesis", () => {
        dar(UA_QUEST, { vr: true, ar: true });
        nav.ruta = "/genesis";
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(false);
    });

    it("no pinta nada en /xr/os (la sesión ya está abierta allí)", () => {
        dar(UA_QUEST, { vr: true, ar: true });
        nav.ruta = "/xr/os";
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(false);
    });
});

describe("EntradaGlobalXR · visibilidad honesta", () => {
    it("con un modo inmersivo disponible pinta el botón de entrada", () => {
        dar(UA_QUEST, { vr: true, ar: true });
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(true);
        expect(screen.getByText("Entrar en VR")).toBeTruthy();
    });

    it("sin ningún modo inmersivo no pinta ni botón ni aspa (nada muerto)", () => {
        dar(UA_IPHONE, { tieneXR: false, vr: false, ar: false });
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(false);
        expect(screen.queryByRole("button")).toBeNull();
    });
});

describe("EntradaGlobalXR · sondeo", () => {
    it("mientras sondea (vr/ar en null) no pinta nada", () => {
        dar(UA_QUEST, { vr: null, ar: null });
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(false);
    });

    it("sin WebXR o con isSessionSupported falso no pinta nada", () => {
        dar(UA_QUEST, { tieneXR: false, vr: false, ar: false });
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(false);
    });
});

describe("EntradaGlobalXR · cerrar la sugerencia", () => {
    it("la x cierra, lo recuerda con clave versionada y vuelve pasados 14 días", () => {
        dar(UA_QUEST, { vr: true, ar: true });
        const { unmount } = render(<EntradaGlobalXR />);
        fireEvent.click(screen.getByRole("button", { name: /cerrar la sugerencia/i }));
        expect(visible()).toBe(false);
        expect(JSON.parse(localStorage.getItem(CLAVE_SUGERENCIA_XR) ?? "{}").v).toBe(2);
        unmount();

        render(<EntradaGlobalXR />);
        expect(visible()).toBe(false);
        cleanup();

        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 15 * 86_400_000);
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(true);
    });

    it("«No volver a sugerir» no vuelve ni pasado un año", () => {
        dar(UA_QUEST, { vr: true, ar: true });
        const { unmount } = render(<EntradaGlobalXR />);
        fireEvent.click(screen.getByRole("button", { name: /no volver a sugerir/i }));
        expect(visible()).toBe(false);
        unmount();

        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 365 * 86_400_000);
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(false);
    });

    it("respeta la clave antigua «1» y sobrevive a un localStorage que lanza", () => {
        dar(UA_QUEST, { vr: true, ar: true });
        localStorage.setItem(CLAVE_BOTON_OCULTO, "1");
        const { unmount } = render(<EntradaGlobalXR />);
        expect(visible()).toBe(false);
        unmount();
        localStorage.clear();

        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("almacenamiento bloqueado");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("almacenamiento bloqueado");
        });
        render(<EntradaGlobalXR />);
        expect(visible()).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: /cerrar la sugerencia/i }));
        expect(visible()).toBe(false);
    });
});

describe("EntradaGlobalXR · navegación a /xr/os", () => {
    it("«Entrar en VR» navega a /xr/os?modo=vr sin abrir la sesión aquí", () => {
        dar(UA_QUEST, { vr: true, ar: true });
        render(<EntradaGlobalXR />);
        fireEvent.click(screen.getByText("Entrar en VR"));
        expect(nav.push).toHaveBeenCalledWith("/xr/os?modo=vr");
    });

    it("«Entrar en AR» navega a /xr/os?modo=ar", () => {
        dar(UA_QUEST, { vr: true, ar: true });
        render(<EntradaGlobalXR />);
        fireEvent.click(screen.getByText("Entrar en AR"));
        expect(nav.push).toHaveBeenCalledWith("/xr/os?modo=ar");
    });
});

describe("EntradaGlobalXR · sin motores pesados", () => {
    it("ni entrada-global ni boton-entrada-xr importan three, @react-three ni uikit", () => {
        for (const archivo of ["../entrada-global.tsx", "../boton-entrada-xr.tsx"]) {
            const fuente = readFileSync(new URL(archivo, import.meta.url), "utf8");
            expect(fuente).not.toContain('from "three"');
            expect(fuente).not.toContain("@react-three");
            expect(fuente).not.toContain("@pmndrs/uikit");
        }
    });
});
