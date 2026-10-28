/**
 * Escena OS («/xr/os», XR1010G parte 2) · el lienzo 3D (three/R3F/XR/drei) va simulado (
 * mismo patrón que `escena-compartida.test.tsx`): aquí se comprueba la LÓGICA exportada
 * (`debeAutoEntrar`, `alturaOjosDe`, `modoBotonDe`) y la capa 2D visible: botón insertado
 * y enlace «Salir al sistema» siempre presentes.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(cleanup);
import type { CapacidadesXR, DatosNavegador, PlanEntrada } from "@/lib/xr/capacidades";

const h = vi.hoisted(() => {
    let datos: DatosNavegador | null = null;
    return {
        fijarDatos(d: DatosNavegador) { datos = d; },
        useCapacidadesXR: () => {
            if (datos === null) throw new Error("datos sin fijar");
            return datos as { estado: "sondeando" | "listo"; datos: DatosNavegador; capacidades: CapacidadesXR; plan: PlanEntrada };
        },
    };
});

vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...resto}>
            {children}
        </a>
    ),
}));

vi.mock("@react-three/fiber", () => ({
    Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="lienzo-3d">{children}</div>,
    useThree: () => ({ camera: { position: { y: 1.72 } } }),
}));

vi.mock("@react-three/xr", () => ({
    XR: ({ children }: { children: React.ReactNode }) => <div data-testid="xr-raiz">{children}</div>,
    XROrigin: () => null,
    useXR: () => null, // sin sesión activa: el efecto de AlturaOjos no programa nada
}));

vi.mock("@react-three/drei", () => ({
    OrbitControls: () => <div data-testid="orbit-controls" />,
}));

vi.mock("../boton-entrada-xr", () => ({
    BotonEntradaXR: () => <button type="button" data-testid="boton-entrada-xr">Entrar en VR/AR</button>,
}));

vi.mock("../use-capacidades-xr", () => ({ useCapacidadesXR: h.useCapacidadesXR }));

import EscenaOS, { debeAutoEntrar, alturaOjosDe, modoBotonDe } from "../escena-os";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";

type Sondeo = { estado: "listo"; datos: DatosNavegador; capacidades: CapacidadesXR; plan: PlanEntrada };

/** Aparato de ejemplo; `datos` reales y el plan SALEN del núcleo puro (evaluar + planificar). */
function questDatos(): DatosNavegador {
    return { ua: "quest", seguro: true, tieneXR: true, vr: true, ar: false, ofreceSesion: false, tactil: false, webgl2: true, webgpu: false, instalada: true };
}

function datosQuest(instalada = true): Sondeo {
    const datos = questDatos();
    const capacidades = evaluarCapacidades(datos, { contexto: "sistema" });
    return { estado: "listo", datos, capacidades, plan: planificarEntrada(capacidades, { instalada }) };
}

/** iPhone: Safari no trae WebXR; solo 3D en pantalla. */
function datosApple(): Sondeo {
    const datos: DatosNavegador = { ua: "iphone", seguro: true, tieneXR: false, vr: null, ar: null, ofreceSesion: false, tactil: true, webgl2: true, webgpu: false, instalada: false };
    const capacidades = evaluarCapacidades(datos, { contexto: "sistema" });
    return { estado: "listo", datos, capacidades, plan: planificarEntrada(capacidades, { instalada: false }) };
}

type ModoXRLocal = Parameters<typeof modoBotonDe>[1][number];
/** Sondeo «listo» fijo para la capa 2D; el núcleo puro da datos y plan. */
function sondeoListo(t: Sondeo) { h.fijarDatos(t); }

describe("debeAutoEntrar (entrada automática del rito)", () => {
    it("entra con «?modo=vr» si el plan lo permite (Quest con la PWA instalada: tocar el icono ya es el gesto)", () => {
        const { plan } = datosQuest();
        expect(plan.estrategia).toBe("auto-al-abrir");
        expect(debeAutoEntrar({ modo: "vr", plan, yaIntentado: false })).toBe("vr-inmersivo");
    });

    it("no entra sin modo pedido en la URL", () => {
        expect(debeAutoEntrar({ modo: null, plan: datosQuest().plan, yaIntentado: false })).toBeNull();
    });

    it("no entra si ya se intentó antes: el navegador que rechaza no se vuelve a molestar", () => {
        expect(debeAutoEntrar({ modo: "vr", plan: datosQuest().plan, yaIntentado: true })).toBeNull();
    });

    it("en iPhone (solo pantalla) no hay entrada automática: el navegador no lo acepta ahí", () => {
        const sondeo = datosApple();
        expect(sondeo.plan.estrategia).toBe("solo-pantalla");
        expect(debeAutoEntrar({ modo: "vr", plan: sondeo.plan, yaIntentado: false })).toBeNull();
    });

    it("la URL pide un modo que el plan no da (vr pedido, plan de AR): no entra a ciegas", () => {
        const { plan } = datosQuest(true);
        expect(debeAutoEntrar({ modo: "vr", plan: { ...plan, modo: "ar-passthrough" }, yaIntentado: false })).toBeNull();
    });
});

describe("alturaOjosDe (recentrado, XR1010J) y modoBotonDe", () => {
    it("sanea la altura de ojos a metros (0,8–2,2) y por defecto 1,70", () => {
        expect(alturaOjosDe(1.725)).toBe(1.73);
        expect(alturaOjosDe(3)).toBe(2.2);
        expect(alturaOjosDe(0.3)).toBe(0.8);
        expect(alturaOjosDe(Number.NaN)).toBe(1.7);
    });

    it("modoBotonDe traduce el modo de la URL al que este aparato ofrece; si nada pide, «auto»", () => {
        const vrSolo = ["vr-inmersivo"] as readonly ModoXRLocal[];
        expect(modoBotonDe(null, vrSolo)).toBe("auto");
        expect(modoBotonDe("vr", vrSolo)).toBe("vr-inmersivo");
        expect(modoBotonDe("vr", [] as readonly ModoXRLocal[])).toBe("auto");
        expect(modoBotonDe("ar", ["ar-mano"] as readonly ModoXRLocal[])).toBe("ar-mano");
    });
});

describe("capa 2D del rito (siempre visible)", () => {
    it("el enlace «Salir al sistema» está presente y lleva a /dashboard", () => {
        sondeoListo(datosQuest());
        render(<EscenaOS modo="vr" />);
        const salir = screen.getByTestId("salir-sistema");
        expect(salir).toHaveAttribute("href", "/dashboard");
        expect(screen.getByTestId("boton-entrada-xr")).toBeInTheDocument();
    });

    it("sin WebXR (iPhone) la misma escena se ve en pantalla: ni XR activa ni fallo de auto-entrada", () => {
        sondeoListo(datosApple());
        render(<EscenaOS modo={null} />);
        expect(screen.getByTestId("escena-os")).toBeInTheDocument();
        expect(screen.getByTestId("orbit-controls")).toBeInTheDocument();
        expect(screen.queryByTestId("fallo-auto-entrar")).not.toBeInTheDocument();
    });

    it("el módulo exporta el componente como defecto y sus puras por nombre (contrato del archivo)", () => {
        expect(EscenaOS).toBeTypeOf("function");
        expect(alturaOjosDe(1.7)).toBe(1.7);
    });
});
