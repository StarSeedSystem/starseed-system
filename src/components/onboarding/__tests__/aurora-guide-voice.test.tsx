/**
 * La voz de la guía NO se traga los fallos (IMG · «catch silencioso en auroraTranscript»).
 * QUÉ: `auroraTranscript()` envolvía la lectura del puente en un `catch` mudo que
 * devolvía "": un motor caído era INDISTINGUIBLE de «Aurora todavía no ha hablado»
 * (la guía con el badge «Escuchando» mintiendo).
 * CÓMO: la lectura se CLASIFICA (ok · sin-puente · fallo) y de ahí sale un aviso
 * honesto: la persona sabe que la voz no está y sigue con los botones (nadie en bucle).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/otra-pagina" }));
vi.mock("next/image", () => ({ default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} /> }));
vi.mock("@/context/perimeter-context", () => ({ usePerimeter: () => ({ activeEdge: null, setActiveEdge: vi.fn() }) }));
vi.mock("@/lib/sync/realtime-sync", () => ({ cuandoCuentaFiable: () => () => undefined }));
vi.mock("@/lib/consumo/usuario", () => ({ usuarioActual: async () => null }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } }) }));
vi.mock("../demo-paso", () => ({ DemoPaso: () => <div /> }));
// La voz solo se CALLA (narrar y escuchar no tocan audio ni motores reales); el resto del
// módulo es el de verdad: el puente sale de `window.STARSEED_AURORA`.
vi.mock("../aurora-guide-voice", async (original) => ({
    ...(await original<typeof import("../aurora-guide-voice")>()),
    auroraSpeak: () => undefined,
    auroraEnsureListening: () => undefined,
}));

import { AuroraGuide } from "../aurora-guide";
import { abrirGuia } from "@/lib/onboarding/guia-acceso";
import {
    auroraBridge,
    auroraTranscript,
    componerTranscript,
    leerEstadoVoz,
    textoAvisoVoz,
} from "../aurora-guide-voice";

/** El puente global de Aurora, tal y como lo lee la voz. */
type PuenteGlobal = { STARSEED_AURORA?: unknown };
const puente = () => window as unknown as PuenteGlobal;

/** Un puente cuyo motor revienta al pedirle el estado. */
function motorCaido() {
    puente().STARSEED_AURORA = { getState: () => { throw new Error("motor caído"); } };
}

beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (q: string) => ({
            matches: q.includes("reduced-motion"),
            media: q,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
        }),
    });
});
afterEach(() => {
    cleanup();
    delete puente().STARSEED_AURORA;
});

describe("lectura de la voz de Aurora · sin catch silencioso", () => {
    it("compone el transcript (lo dicho + lo provisional) sin espacios de sobra", () => {
        expect(componerTranscript("siguiente", "")).toBe("siguiente");
        expect(componerTranscript("siguiente", "por favor")).toBe("siguiente por favor");
        expect(componerTranscript(undefined, undefined)).toBe("");
    });

    it("una lectura con estado es OK y trae el texto", () => {
        const lectura = leerEstadoVoz({ getState: () => ({ transcript: "siguiente", interim: "por favor", listening: true }) });
        expect(lectura.estado).toBe("ok");
        expect(lectura.texto).toBe("siguiente por favor");
        expect(lectura.escuchando).toBe(true);
        expect(textoAvisoVoz(lectura)).toBeNull();
    });

    it("si el motor revienta, la lectura lo DICE (el fallo ya no se traga)", () => {
        const lectura = leerEstadoVoz({ getState: () => { throw new Error("el motor de voz está caído"); } });
        expect(lectura.estado).toBe("fallo");
        expect(lectura.motivo).toContain("el motor de voz está caído");
        expect(lectura.texto).toBe("");
    });

    it("sin puente, o sin estado aún, no es un fallo (pero tampoco hay voz)", () => {
        expect(leerEstadoVoz(null).estado).toBe("sin-puente");
        expect(leerEstadoVoz({ getState: () => null }).estado).toBe("ok");
        expect(textoAvisoVoz(leerEstadoVoz(null))).toContain("Aurora");
    });

    it("el aviso de fallo dice qué hacer: la guía sigue en texto y no deja bucle", () => {
        const aviso = textoAvisoVoz(leerEstadoVoz({ getState: () => { throw new Error("boom"); } }));
        expect(aviso).toContain("sigue en texto");
        expect(aviso).toContain("botones");
    });

    it("auroraTranscript no lanza aunque el motor esté caído", () => {
        motorCaido();
        expect(auroraTranscript()).toBe("");
        expect(leerEstadoVoz(auroraBridge()).estado).toBe("fallo");
    });
});

describe("la guía con la voz caída", () => {
    it("lo dice en la tarjeta y el badge no dice «Escuchando»", async () => {
        motorCaido();
        render(<AuroraGuide />);
        act(() => { abrirGuia({ desde: "boton" }); });
        await act(async () => {
            screen.getByRole("button", { name: /Con la voz de Aurora/ }).click();
            await new Promise((r) => setTimeout(r, 800));
        });
        expect(screen.getByTestId("guia-voz-fallo")).toHaveTextContent("sigue en texto");
        expect(screen.queryByText("Escuchando")).toBeNull();
        expect(screen.getByText("sin voz")).toBeInTheDocument();
    });
});
