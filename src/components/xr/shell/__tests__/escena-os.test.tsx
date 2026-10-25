/**
 * XR1010G · ESCENA OS: `debeAutoEntrar` en los cuatro casos del contrato, `modoBotonDe`, `alturaOjosDe`,
 * la página fina (`/xr/os` sólo exporta `default`), el enlace «Salir al sistema» siempre presente y el
 * auto-entre real con el almacén simulado (un rechazo del navegador no se repite). El lienzo 3D
 * (three/R3F/drei/xr) va simulado, como `escena-compartida.test.tsx`; jsdom (sin WebGL).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { DATOS_SIN_SONDEO } from "../sondeo-navegador";
import { evaluarCapacidades, planificarEntrada, type CapacidadesXR, type DatosNavegador, type PlanEntrada } from "@/lib/xr/capacidades";
import type { ModoXR } from "@/lib/xr/tipos";

vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => <a href={href} {...resto}>{children}</a>,
}));

const h = vi.hoisted(() => ({
    resultado: null as unknown as { estado: "listo"; datos: DatosNavegador; capacidades: CapacidadesXR; plan: PlanEntrada },
    almacen: null as unknown as { enterAR: Mock<() => Promise<unknown>>; enterVR: Mock<() => Promise<unknown>>; onSessionEnd: (cb: () => void) => () => void },
    opcionDynamic: null as Record<string, unknown> | null,
}));

vi.mock("next/dynamic", () => ({
    default: (_carga: unknown, opcion: Record<string, unknown>) =>
        function EscenaCargada() {
            h.opcionDynamic = opcion;
            return <div data-testid="escena-os" />;
        },
}));

vi.mock("@react-three/fiber", () => ({
    Canvas: ({ children }: { children?: ReactNode }) => <div data-testid="lienzo-3d">{children}</div>,
    useThree: () => ({ camera: { position: { y: 1.67 } } }),
}));

vi.mock("@react-three/xr", () => ({
    XR: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    XROrigin: () => null,
    useXR: () => null,
}));

vi.mock("@react-three/drei", () => ({
    OrbitControls: () => <div data-testid="orbit-controls" />,
}));

vi.mock("../boton-entrada-xr", () => ({
    BotonEntradaXR: () => <div data-testid="boton-entrada-simulado" />,
}));

vi.mock("../almacen-xr", () => ({
    obtenerAlmacenXR: vi.fn(async () => h.almacen),
    soltarAlmacenXR: vi.fn(),
}));

vi.mock("../use-capacidades-xr", () => ({
    useCapacidadesXR: () => h.resultado,
}));

import { debeAutoEntrar, alturaOjosDe, modoBotonDe, default as EscenaOS } from "../escena-os";
import PaginaXROS from "@/app/(app)/xr/os/page";

const QUEST: DatosNavegador = {
    ...DATOS_SIN_SONDEO, ua: "Mozilla/5.0 OculusBrowser/39.2 Chrome/136 VR Safari/537.36 Quest 3",
    seguro: true, tieneXR: true, vr: true, ar: true, webgl2: true, instalada: true,
};
const IPHONE: DatosNavegador = {
    ...DATOS_SIN_SONDEO, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1",
    seguro: true, webgl2: true,
};
const ESCRITORIO: DatosNavegador = {
    ...DATOS_SIN_SONDEO, ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0", seguro: true,
    tieneXR: true, vr: true, ar: false, webgl2: true,
};

/** capacidades + plan reales (el núcleo puro) para unos datos de navegador dados, con el modo que
 * la URL pide traducido a su modo concreto (lo mismo que hace `EscenaOS` con el sondeo). */
function resultadoDe(datos: DatosNavegador, modo: ModoXR | "auto" = "auto") {
    const capacidades = evaluarCapacidades(datos, { modo });
    return { estado: "listo" as const, datos, capacidades, plan: planificarEntrada(capacidades, { instalada: datos.instalada }) };
}

beforeEach(() => {
    h.resultado = resultadoDe(ESCRITORIO);
    h.almacen = { enterAR: vi.fn(async () => undefined), enterVR: vi.fn(async () => undefined), onSessionEnd: () => () => undefined };
    h.opcionDynamic = null;
});
afterEach(cleanup);

describe("debeAutoEntrar y ayudas puras", () => {
    test("Quest con la PWA instalada: ?modo=vr entra VR al abrir y ?modo=ar entra AR", () => {
        const vr = resultadoDe(QUEST, "vr-inmersivo");
        expect(vr.plan.estrategia).toBe("auto-al-abrir");
        expect(debeAutoEntrar({ modo: "vr", plan: vr.plan, yaIntentado: false })).toBe("vr-inmersivo");
        expect(debeAutoEntrar({ modo: "ar", plan: resultadoDe(QUEST, "ar-passthrough").plan, yaIntentado: false })).toBe("ar-passthrough");
    });

    test("sin modo en la URL, o ya intentado, o con gesto exigido: no entra sola", () => {
        const plan = resultadoDe(QUEST, "vr-inmersivo").plan;
        expect(debeAutoEntrar({ modo: null, plan, yaIntentado: false })).toBeNull();
        expect(debeAutoEntrar({ modo: "vr", plan, yaIntentado: true })).toBeNull();
        const escritorio = resultadoDe(ESCRITORIO, "vr-inmersivo"); // el navegador exige un gesto
        expect(escritorio.plan.requiereGesto).toBe(true);
        expect(debeAutoEntrar({ modo: "vr", plan: escritorio.plan, yaIntentado: false })).toBeNull();
    });

    test("iPhone: el plan es solo-pantalla; ?modo no lo fuerza y ?modo=ar también da null", () => {
        const resultado = resultadoDe(IPHONE, "vr-inmersivo");
        expect(resultado.plan.estrategia).toBe("solo-pantalla");
        expect(debeAutoEntrar({ modo: "vr", plan: resultado.plan, yaIntentado: false })).toBeNull();
        expect(debeAutoEntrar({ modo: "ar", plan: resultadoDe(IPHONE, "ar-passthrough").plan, yaIntentado: false })).toBeNull();
    });

    test("modoBotonDe elige el AR que el aparato tiene y alturaOjosDe sanea", () => {
        const quest = evaluarCapacidades(QUEST, { modo: "auto" });
        expect(modoBotonDe("ar", quest.modos)).toBe("ar-passthrough");
        expect(modoBotonDe("vr", ["3d-pantalla"])).toBe("auto");
        expect(modoBotonDe(null, quest.modos)).toBe("auto");
        expect(alturaOjosDe(0.3)).toBe(0.8);
        expect(alturaOjosDe(3)).toBe(2.2);
        expect(alturaOjosDe(Number.NaN)).toBe(1.7);
        expect(alturaOjosDe(1.668)).toBe(1.67);
    });
});

describe("EscenaOS y la página /xr/os", () => {
    test("la página es fina: sólo exporta default y carga la escena con next/dynamic sin SSR", () => {
        render(<PaginaXROS />);
        expect(screen.getByTestId("escena-os")).toBeInTheDocument();
        expect(h.opcionDynamic?.ssr).toBe(false);
        return import("@/app/(app)/xr/os/page").then((m) => {
            expect(Object.keys(m).every((k) => k === "default")).toBe(true);
        });
    });

    test("«Salir al sistema» es SIEMPRE visible, apunta a /dashboard y el botón va insertado", () => {
        render(<EscenaOS />);
        const salir = screen.getByTestId("salir-sistema");
        expect(salir).toHaveAttribute("href", "/dashboard");
        expect(salir).toHaveTextContent("Salir al sistema");
        expect(screen.getByTestId("boton-entrada-simulado")).toBeInTheDocument();
    });

    test("sin WebXR (iPhone) la escena se ve en pantalla con OrbitControls y no hay sesi\u00f3n", () => {
        h.resultado = resultadoDe(IPHONE);
        render(<EscenaOS />);
        expect(screen.getByTestId("orbit-controls")).toBeInTheDocument();
        return waitFor(() => expect(h.almacen.enterVR).not.toHaveBeenCalled());
    });

    test("Quest con la PWA instalada y ?modo=vr: auto-entra VR del almac\u00e9n UNA vez", async () => {
        h.resultado = resultadoDe(QUEST, "vr-inmersivo");
        render(<EscenaOS modo="vr" />);
        await waitFor(() => expect(h.almacen.enterVR).toHaveBeenCalledTimes(1));
        expect(h.almacen.enterAR).not.toHaveBeenCalled();
    });

    test("un rechazo del navegador en el auto-entre deja el motivo y no se insiste", async () => {
        h.resultado = resultadoDe(QUEST, "vr-inmersivo");
        h.almacen = {
            enterAR: vi.fn(async () => undefined),
            enterVR: vi.fn(async () => { throw new Error("User gesture required"); }),
            onSessionEnd: () => () => undefined,
        };
        render(<EscenaOS modo="vr" />);
        await screen.findByTestId("fallo-auto-entrar");
        expect(h.almacen.enterVR).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("salir-sistema")).toBeInTheDocument();
    });

    test("?modo=vr en escritorio se queda en pantalla si el plan pide gesto", () => {
        h.resultado = resultadoDe(ESCRITORIO, "vr-inmersivo");
        render(<EscenaOS modo="vr" />);
        expect(screen.getByTestId("orbit-controls")).toBeInTheDocument();
        return waitFor(() => expect(h.almacen.enterVR).not.toHaveBeenCalled());
    });
});
