import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosNavegador, PlanEntrada } from "@/lib/xr/capacidades";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";
import { DATOS_SIN_SONDEO } from "../sondeo-navegador";
import type { ResultadoCapacidadesXR } from "../use-capacidades-xr";

vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...resto}>{children}</a>
    ),
}));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="escena-simulada" /> }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@react-three/fiber", () => ({
    Canvas: ({ children }: { children?: React.ReactNode }) => <div data-testid="canvas-xr">{children}</div>,
    useThree: (sel: (s: { camera: { position: { y: number } } }) => unknown) => sel({ camera: { position: { y: 1.7 } } }),
    useFrame: () => undefined,
}));
vi.mock("@react-three/xr", () => ({
    XR: ({ children }: { children?: React.ReactNode }) => <div data-testid="xr-store">{children}</div>,
    XROrigin: () => null,
    useXR: (sel: (s: { session: null }) => unknown) => sel({ session: null }),
}));
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null }));
vi.mock("../use-capacidades-xr", () => ({ useCapacidadesXR: vi.fn() }));
vi.mock("../almacen-xr", () => ({ obtenerAlmacenXR: vi.fn() }));

import * as pagina from "@/app/(app)/xr/os/page";
import { EscenaOS, alturaOjosDe, debeAutoEntrar, modoBotonDe } from "../escena-os";
import { useCapacidadesXR } from "../use-capacidades-xr";

const UA_QUEST = "Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/38.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";

/** Lo que `useCapacidadesXR` devolvería con ese UA (misma tubería del núcleo puro). */
function resultado(ua: string, extra: Partial<DatosNavegador> = {}, estado: "listo" | "sondeando" = "listo"): ResultadoCapacidadesXR {
    const datos: DatosNavegador = { ...DATOS_SIN_SONDEO, ua, seguro: true, tieneXR: true, webgl2: true, ...extra };
    const capacidades = evaluarCapacidades(datos);
    const plan = planificarEntrada(capacidades, { instalada: datos.instalada });
    return { estado, datos, capacidades, plan };
}

function plan(extra: Partial<PlanEntrada> = {}): PlanEntrada {
    return { estrategia: "auto-al-abrir", modo: "vr-inmersivo", requiereGesto: false, botonUniversal: true, motivo: "", ...extra };
}

const usar = vi.mocked(useCapacidadesXR);

beforeEach(() => { usar.mockReset(); });
afterEach(cleanup);

describe("debeAutoEntrar", () => {
    it("Quest con la PWA instalada y ?modo=vr entra sola en VR", () => {
        const { plan: p } = resultado(UA_QUEST, { vr: true, ar: false, instalada: true });
        expect(p.estrategia).toBe("auto-al-abrir");
        expect(debeAutoEntrar({ modo: "vr", plan: p, yaIntentado: false })).toBe("vr-inmersivo");
    });

    it("Quest con la PWA instalada y ?modo=ar entra sola en AR", () => {
        const { plan: p } = resultado(UA_QUEST, { vr: false, ar: true, instalada: true });
        expect(p.estrategia).toBe("auto-al-abrir");
        expect(debeAutoEntrar({ modo: "ar", plan: p, yaIntentado: false })).toBe("ar-passthrough");
    });

    it("sin modo en la URL no entra sola, aunque sea Quest instalada", () => {
        expect(debeAutoEntrar({ modo: null, plan: plan(), yaIntentado: false })).toBeNull();
    });

    it("si ya se intentó no se insiste: un rechazo no se reintenta", () => {
        expect(debeAutoEntrar({ modo: "vr", plan: plan(), yaIntentado: true })).toBeNull();
    });

    it("en iPhone (solo pantalla) devuelve null", () => {
        const { plan: p } = resultado(UA_IPHONE, { tieneXR: false, vr: false, ar: false });
        expect(p.estrategia).toBe("solo-pantalla");
        expect(debeAutoEntrar({ modo: "ar", plan: p, yaIntentado: false })).toBeNull();
    });

    it("un plan que exige gesto no entra solo", () => {
        expect(debeAutoEntrar({ modo: "vr", plan: plan({ estrategia: "boton-universal", requiereGesto: true }), yaIntentado: false })).toBeNull();
    });
});

describe("alturaOjosDe / modoBotonDe", () => {
    it("sanea la altura de ojos a 0,8–2,2 m y cae en 1,7 si no es finita", () => {
        expect(alturaOjosDe(1.65)).toBe(1.65);
        expect(alturaOjosDe(0.1)).toBe(0.8);
        expect(alturaOjosDe(9)).toBe(2.2);
        expect(alturaOjosDe(Number.NaN)).toBe(1.7);
    });

    it("elige el modo del botón que el aparato sí tiene", () => {
        expect(modoBotonDe("vr", ["vr-inmersivo", "ar-passthrough"])).toBe("vr-inmersivo");
        expect(modoBotonDe("ar", ["ar-mano"])).toBe("ar-mano");
        expect(modoBotonDe("ar", ["vr-inmersivo"])).toBe("auto");
        expect(modoBotonDe(null, [])).toBe("auto");
    });
});

describe("/xr/os · página", () => {
    it("solo exporta default y dynamic: una función de más rompe .next/types", () => {
        const permitidas = ["default", "metadata", "dynamic"];
        expect(Object.keys(pagina).every((clave) => permitidas.includes(clave))).toBe(true);
        expect(typeof pagina.default).toBe("function");
        expect(pagina.dynamic).toBe("force-dynamic");
    });
});

describe("EscenaOS", () => {
    it("el enlace «Salir al sistema» está siempre visible y lleva a /dashboard", () => {
        usar.mockReturnValue(resultado(UA_QUEST, { vr: true, ar: false }, "sondeando"));
        render(<EscenaOS modo="vr" />);
        const salir = screen.getByRole("link", { name: "Salir al sistema" });
        expect(salir.getAttribute("href")).toBe("/dashboard");
        expect(screen.getByTestId("canvas-xr")).toBeTruthy();
    });
});
