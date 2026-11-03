import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { mundoDesdePlantilla } from "@/lib/vivo/xr-mundo";
import { evaluarCapacidades, planificarEntrada, type DatosNavegador } from "@/lib/xr/capacidades";
import { DATOS_SIN_SONDEO } from "../sondeo-navegador";
import type { ContextoAcciones } from "../acciones-xr";
import { MontajeTrinity, mundoMontable } from "../contenido-trinity";
import { EscenaOS } from "../escena-os";
import { useCapacidadesXR, type ResultadoCapacidadesXR } from "../use-capacidades-xr";
import { useAudioEspacial } from "../use-audio-espacial";

vi.mock("../rig-trinity", () => ({
    RigTrinity: ({ contenido }: { contenido: Record<string, ReactNode> }) => (
        <div data-testid="rig">
            {(["zenith", "horizon", "logic", "anchor"] as const).map((k) => <div key={k} data-testid={`nodo-${k}`}>{contenido[k]}</div>)}
        </div>
    ),
}));
vi.mock("../panel-cristal", async () => {
    const { createContext } = await import("react");
    return { NivelCalidadContext: createContext("media") };
});
vi.mock("../orbe-astraura", () => ({ OrbeAstraura: () => <div data-testid="orbe" /> }));
vi.mock("../flujo-voz", () => ({ FlujoVoz: () => <div data-testid="flujo" /> }));
vi.mock("../nodo-horizon", () => ({ NodoHorizon: () => <div data-testid="horizonte" /> }));
vi.mock("../parametros-3d", () => ({ Parametros3D: () => <div data-testid="parametros" /> }));
vi.mock("../nodo-logic", () => ({ NodoLogic: () => <div data-testid="logic" /> }));
vi.mock("../dock-3d", () => ({ Dock3D: () => <div data-testid="dock" /> }));
vi.mock("../menu-mano", () => ({ MenuMano: () => <div data-testid="menu-mano" /> }));
vi.mock("../mundo-render", () => ({ default: () => <div data-testid="mundo-render" /> }));
vi.mock("../zonas-portales", () => ({ ZonasPortales: () => <div data-testid="zonas" /> }));
vi.mock("../pantalla-3d", () => ({ Pantalla3D: () => <div data-testid="pantalla" /> }));
vi.mock("../pizarra-3d", () => ({ Pizarra3D: () => <div data-testid="pizarra" /> }));
vi.mock("../avatar-xr", () => ({ AvatarXR: () => <div data-testid="avatar" /> }));
vi.mock("../use-audio-espacial", () => ({ useAudioEspacial: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="dinamico-simulado" /> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@react-three/fiber", () => ({ Canvas: ({ children }: { children?: ReactNode }) => <div>{children}</div>, useThree: (s: (x: { camera: { position: { y: number } } }) => unknown) => s({ camera: { position: { y: 1.7 } } }) }));
vi.mock("@react-three/xr", () => ({ XR: ({ children }: { children?: ReactNode }) => <div>{children}</div>, XROrigin: () => null, useXR: (s: (x: { session: null }) => unknown) => s({ session: null }) }));
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null }));
vi.mock("../use-capacidades-xr", () => ({ useCapacidadesXR: vi.fn() }));
vi.mock("../almacen-xr", () => ({ obtenerAlmacenXR: vi.fn() }));
vi.mock("@/lib/astraura-bots/adaptadores/ejecutor-acciones", () => ({ EVENTO_CAPA_BOT: "starseed:bot", capasPanelAhora: () => [] }));
const ACCIONES: ContextoAcciones = {
    recentrar: vi.fn(), salir: vi.fn(async () => undefined), abrirMenuMano: vi.fn(), abrirDock: vi.fn(),
    hablar: vi.fn(), atras: vi.fn(), seleccionar: vi.fn(), agarrar: vi.fn(), teletransporte: vi.fn(), girar: vi.fn(),
};
const conCandidatos = { obtener: () => ({ molecula: { ambito: "global", valores: {} } }), suscribir: () => () => undefined } as never;
const mundo = () => mundoDesdePlantilla("bosque con luciérnagas");

const datos: DatosNavegador = { ...DATOS_SIN_SONDEO, ua: "Quest 3", seguro: true, tieneXR: true, webgl2: true };
beforeEach(() => {
    const capacidades = evaluarCapacidades(datos);
    vi.mocked(useCapacidadesXR).mockReturnValue({ estado: "sondeando", datos, capacidades, plan: planificarEntrada(capacidades, { instalada: datos.instalada }) } as ResultadoCapacidadesXR);
});
afterEach(cleanup);

describe("MontajeTrinity · los cuatro nodos y el menú", () => {
    it("Zenith lleva orbe y voz; Horizonte, parámetros; Logic y Anchor, su contenido", () => {
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" yo="ana" acciones={ACCIONES} controlador={conCandidatos} candidatos={[]} />);
        expect(screen.getByTestId("nodo-zenith")).toContainElement(screen.getByTestId("orbe"));
        expect(screen.getByTestId("nodo-zenith")).toContainElement(screen.getByTestId("flujo"));
        expect(screen.getByTestId("nodo-horizon")).toContainElement(screen.getByTestId("horizonte"));
        expect(screen.getByTestId("nodo-horizon")).toContainElement(screen.getByTestId("parametros"));
        expect(screen.getByTestId("nodo-logic")).toContainElement(screen.getByTestId("logic"));
        expect(screen.getByTestId("nodo-anchor")).toContainElement(screen.getByTestId("dock"));
    });

    it("el menú de mano recibe contenido cuando hay acciones y no se pinta sin ellas", () => {
        const { rerender } = render(<MontajeTrinity modo="3d-pantalla" nivel="baja" acciones={ACCIONES} />);
        expect(screen.getByTestId("menu-mano")).toBeInTheDocument();
        rerender(<MontajeTrinity modo="3d-pantalla" nivel="baja" acciones={null} />);
        expect(screen.queryByTestId("menu-mano")).toBeNull();
    });
});

describe("MontajeTrinity · mundos", () => {
    it("sin mundo abierto NO se monta el render ni las zonas", () => {
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" mundo={null} />);
        expect(screen.queryByTestId("mundo-render")).toBeNull();
        expect(screen.queryByTestId("zonas")).toBeNull();
    });

    it("con un MundoSpec válido sí se monta, con sus zonas y pizarras", () => {
        const m = { ...mundo(), pizarras: [{ id: "p1", pos: [0, 1, -2] as [number, number, number], rot: [0, 0, 0] as [number, number, number], ancho: 2, alto: 1 }] };
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" mundo={m} yo="ana" />);
        expect(screen.getByTestId("mundo-render")).toBeInTheDocument();
        expect(screen.getByTestId("zonas")).toBeInTheDocument();
        expect(screen.getByTestId("pizarra")).toBeInTheDocument();
    });

    it("un MundoSpec inválido no se monta y mundoMontable lo deja en null", () => {
        const roto = { ...mundo(), tipo: "otra-cosa" } as never;
        expect(mundoMontable(roto)).toBeNull();
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" mundo={roto} />);
        expect(screen.queryByTestId("mundo-render")).toBeNull();
    });
});

describe("MontajeTrinity · piezas ausentes y salida", () => {
    it("una pieza ausente se omite sin romper la escena", () => {
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" yo="ana" omitir={["parametros", "dock", "audio"]} />);
        expect(screen.getByTestId("rig")).toBeInTheDocument();
        expect(screen.getByTestId("horizonte")).toBeInTheDocument();
        expect(screen.queryByTestId("parametros")).toBeNull();
        expect(screen.queryByTestId("dock")).toBeNull();
    });

    it("el audio espacial nace con la calidad y la sala del mundo", () => {
        render(<MontajeTrinity modo="vr-inmersivo" nivel="alta" mundo={mundo()} />);
        expect(vi.mocked(useAudioEspacial)).toHaveBeenCalledWith(expect.objectContaining({ nivel: "alta", salaId: mundo().nombre }));
    });

    it("el botón «Salir al sistema» sigue presente con el montaje final", () => {
        render(<EscenaOS modo="vr" />);
        expect(screen.getByRole("link", { name: "Salir al sistema" })).toHaveAttribute("href", "/dashboard");
    });
});
