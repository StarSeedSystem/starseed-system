/**
 * EscenaOS (`/xr/os`, XR1010G · contrato `architecture/starseed-xr.md` §3 a y c). El lienzo 3D
 * (three/R3F/XR/drei) va simulado como en `escena-compartida.test.tsx`; el almacén (almacen-xr)
 * y el sondeo (use-capacidades-xr) se inyectan para poder controlar el plan de entrada.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { PlanEntrada } from "@/lib/xr/capacidades";
import type { ModoXR } from "@/lib/xr/tipos";

vi.mock("@react-three/fiber", () => ({
    Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="lienzo">{children}</div>,
    useThree: () => ({ camera: { position: { y: 1.72 } } }),
}));
vi.mock("@react-three/xr", () => ({
    XR: ({ children }: { children: React.ReactNode }) => <div data-testid="xr-raiz">{children}</div>,
    XROrigin: () => <div data-testid="xr-origen" />,
    useXR: () => ({ session: null }),
}));
vi.mock("@react-three/drei", () => ({ OrbitControls: () => <div data-testid="orbit-controls" /> }));
vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...resto}>{children}</a>
    ),
}));
/* El almacén y el sondeo se inyectan (sin red, sin WebXR real). */
vi.mock("../almacen-xr", () => ({ obtenerAlmacenXR: vi.fn() }));
vi.mock("../use-capacidades-xr", () => ({
    useCapacidadesXR: vi.fn(() => ({ estado: h.estado, datos: {}, capacidades: h.capacidades, plan: h.plan })),
}));

import { EscenaOS, debeAutoEntrar, modoBotonDe, alturaOjosDe } from "../escena-os";
import { obtenerAlmacenXR } from "../almacen-xr";
import { useCapacidadesXR } from "../use-capacidades-xr";

const h = vi.hoisted(() => ({
    estado: "listo" as "sondeando" | "listo",
    capacidades: { modos: ["vr-inmersivo"] as ModoXR[] },
    plan: null as unknown as PlanEntrada,
    almacen: null as { enterVR: ReturnType<typeof vi.fn>; enterAR: ReturnType<typeof vi.fn>; onSessionEnd: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } | null,
}));

function planDe(extra: Partial<PlanEntrada> = {}): PlanEntrada {
    return { estrategia: "auto-al-abrir", modo: "vr-inmersivo", requiereGesto: false, botonUniversal: true, motivo: "PWA instalada en Quest", ...extra };
}

beforeEach(() => {
    h.estado = "listo";
    h.capacidades = { modos: ["vr-inmersivo"] as ModoXR[] };
    h.plan = planDe();
    h.almacen = null;
    vi.mocked(obtenerAlmacenXR).mockReset().mockImplementation(async () => {
        if (h.almacen === null) {
            h.almacen = {
                enterVR: vi.fn(async () => undefined),
                enterAR: vi.fn(async () => undefined),
                onSessionEnd: vi.fn(() => () => undefined),
                destroy: vi.fn(),
            };
        }
        return h.almacen as never;
    });
});

afterEach(cleanup);

describe("debeAutoEntrar", () => {
    test("URL con modo y Quest con la PWA instalada → entra en el modo que el plan dice", () => {
        expect(debeAutoEntrar({ modo: "vr", plan: planDe({ modo: "vr-inmersivo" }), yaIntentado: false })).toBe("vr-inmersivo");
        expect(debeAutoEntrar({ modo: "ar", plan: planDe({ modo: "ar-passthrough" }), yaIntentado: false })).toBe("ar-passthrough");
    });

    test("sin modo en la URL no entra solo", () => {
        expect(debeAutoEntrar({ modo: null, plan: planDe(), yaIntentado: false })).toBeNull();
    });

    test("ya se intentó antes: no se vuelve a insinuar", () => {
        expect(debeAutoEntrar({ modo: "vr", plan: planDe(), yaIntentado: true })).toBeNull();
    });

    test("plan que exige gesto (no instalada) o de pantalla: nada de auto", () => {
        expect(debeAutoEntrar({ modo: "vr", plan: planDe({ estrategia: "boton-universal", requiereGesto: true }), yaIntentado: false })).toBeNull();
        expect(debeAutoEntrar({ modo: "vr", plan: planDe({ estrategia: "solo-pantalla", modo: "3d-pantalla" }), yaIntentado: false })).toBeNull();
    });

    test("iPhone (modo en URL pero plan que no puede): devuelve null", () => {
        expect(debeAutoEntrar({ modo: "vr", plan: planDe({ estrategia: "solo-pantalla", modo: "3d-pantalla", requiereGesto: false }), yaIntentado: false })).toBeNull();
    });
});

describe("modos helpers", () => {
    test("modoBotonDe traduce la URL al modo disponible o cae en auto", () => {
        expect(modoBotonDe("vr", ["vr-inmersivo"])).toBe("vr-inmersivo");
        expect(modoBotonDe("ar", ["ar-passthrough"])).toBe("ar-passthrough");
        expect(modoBotonDe("ar", ["vr-inmersivo"])).toBe("auto");
        expect(modoBotonDe(null, ["vr-inmersivo"])).toBe("auto");
    });

    test("alturaOjosDe sanea metros no finitos, cortos y largos a 0,8–2,2", () => {
        expect(alturaOjosDe(NaN)).toBe(1.7);
        expect(alturaOjosDe(0.2)).toBe(0.8);
        expect(alturaOjosDe(3.9)).toBe(2.2);
        expect(alturaOjosDe(1.72342)).toBe(1.72);
    });
});

describe("EscenaOS", () => {
    test("pinta lienzo, origen, botón insertado y «Salir al sistema» a /dashboard", () => {
        render(<EscenaOS modo="vr" />);
        expect(screen.getByTestId("lienzo")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Salir al sistema" })).toHaveAttribute("href", "/dashboard");
        expect(screen.getByTestId("orbit-controls")).toBeInTheDocument();
    });

    test("auto-entrada: una sola vez, entra en VR con el almacén compartido", async () => {
        render(<EscenaOS modo="vr" />);
        await waitFor(() => expect(screen.getByTestId("xr-origen")).toBeInTheDocument());
        expect(h.almacen?.enterVR).toHaveBeenCalledTimes(1);
        expect(h.almacen?.enterAR).not.toHaveBeenCalled();
    });

    test("sin modo en la URL no entra solo aunque el plan pudiese", async () => {
        const { obtenerAlmacenXR } = await import("../almacen-xr");
        render(<EscenaOS modo={null} />);
        await waitFor(() => expect(obtenerAlmacenXR).toHaveBeenCalled());
        expect(h.almacen?.enterVR).not.toHaveBeenCalled();
        expect(h.almacen?.enterAR).not.toHaveBeenCalled();
    });

    test("modo AR pedido: entra en AR (passthrough u mano) si el plan lo dice", async () => {
        h.plan = planDe({ modo: "ar-passthrough" });
        render(<EscenaOS modo="ar" />);
        await waitFor(() => expect(h.almacen?.enterAR).toHaveBeenCalledTimes(1));
        expect(h.almacen?.enterVR).not.toHaveBeenCalled();
    });

    test("el enlace «Salir al sistema» sigue visible durante y después de lo que pase", async () => {
        render(<EscenaOS modo="vr" />);
        await waitFor(() => expect(screen.getByRole("link", { name: "Salir al sistema" })).toBeInTheDocument());
    });
});

