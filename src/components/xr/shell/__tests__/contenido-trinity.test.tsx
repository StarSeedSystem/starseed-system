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

const { refSala, controlador, candidatos, sesionEscena } = vi.hoisted(() => ({
    refSala: vi.fn((): string | null => null),
    controlador: vi.fn((): unknown => null),
    candidatos: vi.fn(() => []),
    sesionEscena: vi.fn(),
}));
vi.mock("../ejecutor-mundo", () => ({ refSalaDeUrl: refSala }));
vi.mock("@/lib/vivo/xr-mundo", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/vivo/xr-mundo")>();
    return { ...actual, leerMundo: vi.fn(async () => null) };
});
vi.mock("@/ai/astraura/router", () => ({ astrauraChat: vi.fn(async () => ({ text: "" })) }));
vi.mock("@/lib/protomolecula/controlador-activo", () => ({ controladorActivo: controlador }));
vi.mock("@/lib/protomolecula/registro-atomos", () => ({ candidatosDe: candidatos }));
vi.mock("@/components/vivo/espacial/use-sesion-escena", () => ({ useSesionEscena: sesionEscena }));
vi.mock("@/components/vivo/espacial/avatar-remoto-xr", () => ({ AvatarRemotoXR: () => <div data-testid="avatar" />, rangoCercania: () => new Map() }));
vi.mock("../use-audio-espacial", () => ({ useAudioEspacial: vi.fn() }));
vi.mock("../rig-trinity", () => ({
    RigTrinity: ({ contenido }: { contenido: Record<string, ReactNode> }) => (
        <div data-testid="rig">{(["zenith", "horizon", "logic", "anchor"] as const).map((k) => <div key={k} data-testid={`nodo-${k}`}>{contenido[k]}</div>)}</div>
    ),
}));
vi.mock("../panel-cristal", async () => { const { createContext } = await import("react"); return { NivelCalidadContext: createContext("media") }; });
vi.mock("../orbe-astraura", () => ({ OrbeAstraura: () => <div data-testid="orbe" /> }));
vi.mock("../flujo-voz", () => ({ FlujoVoz: () => <div data-testid="flujo" /> }));
vi.mock("../horizon-montado", () => ({ HorizonMontado: () => <div data-testid="horizonte" /> }));
vi.mock("../parametros-3d", () => ({ Parametros3D: () => <div data-testid="parametros" /> }));
vi.mock("../nodo-logic", () => ({ NodoLogic: () => <div data-testid="logic" /> }));
vi.mock("../dock-3d", () => ({ Dock3D: () => <div data-testid="dock" /> }));
vi.mock("../menu-mano", () => ({ MenuMano: () => <div data-testid="menu-mano" /> }));
vi.mock("../mundo-render", () => ({ default: () => <div data-testid="mundo-render" /> }));
vi.mock("../uispec-uikit", () => ({ UiSpec3D: () => <div data-testid="uispec" /> }));
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
const datos: DatosNavegador = { ...DATOS_SIN_SONDEO, ua: "Quest 3", seguro: true, tieneXR: true, webgl2: true };
const mundo = () => mundoDesdePlantilla("bosque con luciérnagas");

beforeEach(() => {
    refSala.mockReturnValue(null);
    controlador.mockReturnValue(null);
    candidatos.mockReturnValue([]);
    sesionEscena.mockReturnValue({ sesion: null, avatares: { yo: null, otros: [] }, adns: {} });
    const capacidades = evaluarCapacidades(datos);
    vi.mocked(useCapacidadesXR).mockReturnValue({ estado: "sondeando", datos, capacidades, plan: planificarEntrada(capacidades, { instalada: datos.instalada }) } as ResultadoCapacidadesXR);
});
afterEach(cleanup);

describe("MontajeTrinity · nodos y menú", () => {
    it("cada cardinal recibe su contenido y el menú de mano se monta con acciones", () => {
        controlador.mockReturnValue({ obtener: () => ({ molecula: { atomos: [] } }) });
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" acciones={ACCIONES} />);
        expect(screen.getByTestId("nodo-zenith")).toContainElement(screen.getByTestId("orbe"));
        expect(screen.getByTestId("nodo-zenith")).toContainElement(screen.getByTestId("flujo"));
        expect(screen.getByTestId("nodo-horizon")).toContainElement(screen.getByTestId("horizonte"));
        expect(screen.getByTestId("nodo-horizon")).toContainElement(screen.getByTestId("parametros"));
        expect(screen.getByTestId("nodo-logic")).toContainElement(screen.getByTestId("logic"));
        expect(screen.getByTestId("nodo-anchor")).toContainElement(screen.getByTestId("dock"));
        expect(screen.getByTestId("menu-mano")).toBeInTheDocument();
    });

    it("el menú de mano no se pinta sin acciones", () => {
        render(<MontajeTrinity modo="3d-pantalla" nivel="baja" acciones={null} />);
        expect(screen.queryByTestId("menu-mano")).toBeNull();
    });

    it("una pieza ausente se omite sin romper la escena", () => {
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" omitir={["parametros", "dock", "menu"]} />);
        expect(screen.getByTestId("rig")).toBeInTheDocument();
        expect(screen.getByTestId("horizonte")).toBeInTheDocument();
        expect(screen.queryByTestId("parametros")).toBeNull();
        expect(screen.queryByTestId("dock")).toBeNull();
    });

    it("la página UiSpec se pinta en Logic y desaparece si no llega", () => {
        const { rerender } = render(<MontajeTrinity modo="vr-inmersivo" nivel="media" pagina={{ raiz: "hola" }} />);
        expect(screen.getByTestId("nodo-logic")).toContainElement(screen.getByTestId("uispec"));
        rerender(<MontajeTrinity modo="vr-inmersivo" nivel="media" pagina={null} />);
        expect(screen.queryByTestId("uispec")).toBeNull();
    });
});

describe("MontajeTrinity · mundo", () => {
    it("sin mundo no se monta el render del mundo", () => {
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" mundo={null} />);
        expect(screen.queryByTestId("mundo-render")).toBeNull();
    });

    it("un MundoSpec válido sí se monta y uno inválido se omite", () => {
        const { rerender } = render(<MontajeTrinity modo="vr-inmersivo" nivel="media" mundo={mundo()} />);
        expect(screen.getByTestId("mundo-render")).toBeInTheDocument();
        const roto = { ...mundo(), tipo: "otra-cosa" } as never;
        expect(mundoMontable(roto)).toBeNull();
        rerender(<MontajeTrinity modo="vr-inmersivo" nivel="media" mundo={roto} />);
        expect(screen.queryByTestId("mundo-render")).toBeNull();
    });
});

describe("MontajeTrinity · presencia y audio", () => {
    it("el audio espacial nace con el nivel y la sala de la URL", () => {
        refSala.mockReturnValue("sala-1");
        render(<MontajeTrinity modo="vr-inmersivo" nivel="alta" />);
        expect(vi.mocked(useAudioEspacial)).toHaveBeenLastCalledWith(expect.objectContaining({ nivel: "alta", salaId: "sala-1" }));
    });

    it("la presencia pinta avatares y el audio usa sus poses", () => {
        refSala.mockReturnValue("sala-1");
        const pose = { cabeza: { p: [1, 1.6, -2] as [number, number, number], q: [0, 0, 0, 1] as [number, number, number, number] }, izquierda: null, derecha: null };
        sesionEscena.mockReturnValue({
            sesion: { poses: new Map([["ana", { pose, recibida: 1 }]]) },
            avatares: { yo: null, otros: [{ clave: "ana", uid: null, nombre: "Ana", color: "#fff", modo: "vr", editor: false, desde: 0 }] },
            adns: {},
        });
        render(<MontajeTrinity modo="vr-inmersivo" nivel="media" />);
        console.log("RES", JSON.stringify(sesionEscena.mock.results.map((r) => r.value))); console.log("CALLS", JSON.stringify(vi.mocked(useAudioEspacial).mock.calls));
        expect(screen.getByTestId("avatar")).toBeInTheDocument();
        expect(vi.mocked(useAudioEspacial)).toHaveBeenLastCalledWith(expect.objectContaining({ salaId: "sala-1", poses: [{ id: "ana", pos: [1, 1.6, -2] }] }));
    });
});

describe("EscenaOS · montaje final", () => {
    it("el botón «Salir al sistema» sigue presente con la Trinity completa", () => {
        render(<EscenaOS modo="vr" />);
        expect(screen.getByRole("link", { name: "Salir al sistema" })).toHaveAttribute("href", "/dashboard");
    });
});
