import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosNavegador } from "@/lib/xr/capacidades";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";
import { DATOS_SIN_SONDEO } from "@/components/xr/shell/sondeo-navegador";
import type { ResultadoCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { TarjetaXR } from "../tarjeta-xr";

const h = vi.hoisted(() => ({ push: vi.fn(), usar: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/components/xr/shell/use-capacidades-xr", () => ({ useCapacidadesXR: h.usar }));

const UA_QUEST = "Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/38.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const UA_ESCRITORIO = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/134.0 Safari/537.36";

function aparato(ua: string, extra: Partial<DatosNavegador>, estado: "listo" | "sondeando" = "listo"): ResultadoCapacidadesXR {
    const datos: DatosNavegador = { ...DATOS_SIN_SONDEO, ua, seguro: true, tieneXR: true, webgl2: true, ...extra };
    const capacidades = evaluarCapacidades(datos);
    return { estado, datos, capacidades, plan: planificarEntrada(capacidades, { instalada: datos.instalada }) };
}

beforeEach(() => {
    h.push.mockReset();
    h.usar.mockReset();
});
afterEach(cleanup);

describe("TarjetaXR · Centro de Control", () => {
    it("con soporte real ofrece entrar y navega a /xr/os", () => {
        h.usar.mockReturnValue(aparato(UA_QUEST, { vr: true, ar: true }));
        render(<TarjetaXR />);
        fireEvent.click(screen.getByTestId("fila-xr-vr"));
        expect(h.push).toHaveBeenCalledWith("/xr/os?modo=vr");
        fireEvent.click(screen.getByTestId("fila-xr-ar"));
        expect(h.push).toHaveBeenCalledWith("/xr/os?modo=ar");
    });

    it("sin WebXR sigue presente: dice por qué y lleva al diagnóstico", () => {
        h.usar.mockReturnValue(aparato(UA_ESCRITORIO, { tieneXR: false, vr: false, ar: false }));
        render(<TarjetaXR />);
        expect(screen.getByTestId("tarjeta-xr")).toBeTruthy();
        expect(screen.getByText("Realidad aumentada / virtual")).toBeTruthy();
        expect(screen.getByText(/no tiene WebXR/)).toBeTruthy();
        fireEvent.click(screen.getByTestId("fila-xr-diagnostico"));
        expect(h.push).toHaveBeenCalledWith("/xr/diagnostico");
    });

    it("sondeando también está presente, con «Comprobando»", () => {
        h.usar.mockReturnValue(aparato(UA_ESCRITORIO, { tieneXR: false, vr: null, ar: null }, "sondeando"));
        render(<TarjetaXR />);
        expect(screen.getByText(/Comprobando/)).toBeTruthy();
    });
});
