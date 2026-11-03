import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CONFORT_DEFECTO } from "@/lib/xr/confort";
import { validarMundo } from "@/lib/xr/mundo-spec";
import { mundoDesdePlantilla } from "@/lib/vivo/xr-mundo";
import type { ContextoAcciones } from "../acciones-xr";

const h = vi.hoisted(() => ({ contenido: null as unknown as Record<string, ReactNode>, controlador: null as unknown }));

vi.mock("../use-prefs-xr", () => ({ usePrefsXR: () => ({ confort: { ...CONFORT_DEFECTO, alturaOjos: 1.6 } }) }));
vi.mock("../orbe-astraura", () => ({ OrbeAstraura: () => <span data-testid="orbe" /> }));
vi.mock("../horizon-montado", () => ({ HorizonMontado: () => <span data-testid="horizon" /> }));
vi.mock("../nodo-logic", () => ({ NodoLogic: () => <span data-testid="logic" /> }));
vi.mock("../parametros-3d", () => ({ Parametros3D: () => <span data-testid="parametros" /> }));
vi.mock("../dock-3d", () => ({ default: () => <span data-testid="dock" /> }));
vi.mock("../menu-mano", () => ({ MenuMano: () => <span data-testid="menu-mano" /> }));
vi.mock("../flujo-voz", () => ({ FlujoVoz: () => <span data-testid="flujo-voz" /> }));
vi.mock("../mundo-render", () => ({ default: () => <div data-testid="mundo-render" /> }));
vi.mock("../pantalla-3d", () => ({ Pantalla3D: () => <span data-testid="pantalla" /> }));
vi.mock("../pizarra-3d", () => ({ Pizarra3D: () => <span data-testid="pizarra" />, crearEstadoPizarra: () => ({}) }));
vi.mock("@/lib/protomolecula/controlador-activo", () => ({ controladorActivo: () => h.controlador }));
vi.mock("@/lib/protomolecula/registro-atomos", () => ({ candidatosDe: () => [] }));
vi.mock("@/lib/vivo/xr-mundo", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/vivo/xr-mundo")>();
    return { ...actual, guardarMundo: vi.fn(), leerMundo: vi.fn(async () => null) };
});
vi.mock("../rig-trinity", () => ({
    RigTrinity: (p: { contenido: Record<string, ReactNode> }) => {
        h.contenido = p.contenido;
        return <div data-testid="rig">{[...["zenith", "horizon", "logic", "anchor"]].map((k) => <div key={k} data-testid={`n-${k}`}>{p.contenido[k]}</div>)}</div>;
    },
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@react-three/fiber", () => ({ Canvas: ({ children }: { children?: ReactNode }) => <div>{children}</div>, useThree: () => ({}) }));
vi.mock("@react-three/xr", () => ({ XR: ({ children }: { children?: ReactNode }) => <div>{children}</div>, XROrigin: () => null, useXR: () => null }));
vi.mock("@react-three/drei", () => ({ OrbitControls: () => null }));
vi.mock("../use-calidad-dinamica", () => ({ useCalidadDinamica: () => ({ nivel: "media", cambio: null, aviso: "" }) }));
vi.mock("../use-capacidades-xr", () => ({ useCapacidadesXR: () => ({ estado: "sondeando", datos: {}, capacidades: { modos: [], plataforma: "desconocida" }, plan: { estrategia: "solo-pantalla", modo: "3d-pantalla", requiereGesto: true, botonUniversal: true, motivo: "" } }) }));
vi.mock("../almacen-xr", () => ({ obtenerAlmacenXR: vi.fn() }));
vi.mock("@/lib/astraura-bots/adaptadores/ejecutor-acciones", () => ({ EVENTO_CAPA_BOT: "x", capasPanelAhora: () => [] }));
import { ContenidoTrinity, debeMontarMundo, piezasDelNodo, useMundoAbierto } from "../contenido-trinity";
import { EscenaOS } from "../escena-os";
const ACCIONES: ContextoAcciones = { recentrar: vi.fn(), salir: vi.fn(async () => undefined), abrirMenuMano: vi.fn(), abrirDock: vi.fn(), hablar: vi.fn(), atras: vi.fn(), seleccionar: vi.fn(), agarrar: vi.fn(), teletransporte: vi.fn(), girar: vi.fn() };
const mundo = mundoDesdePlantilla("un bosque", ["noche"]);
const mostrar = (extra: Record<string, unknown> = {}) => render(<ContenidoTrinity modo="vr-inmersivo" nivel="media" acciones={ACCIONES} {...extra} />);
beforeEach(() => { h.controlador = null; });
afterEach(cleanup);

describe("piezas de la Trinity", () => {
    it("cada cardinal y el menú de mano tienen su pieza, en orden", () => {
        const p = piezasDelNodo(["menu-mano", "dock", "logic", "horizon", "orbe", "flujo-voz"]);
        expect(p.zenith).toEqual(["orbe", "flujo-voz"]);
        expect(p.horizon).toEqual(["horizon"]);
        expect(p.logic).toEqual(["logic"]);
        expect(p.anchor).toEqual(["dock"]);
        expect(p.menuMano).toEqual(["menu-mano"]);
        expect(piezasDelNodo([])).toEqual({ zenith: [], horizon: [], logic: [], anchor: [], menuMano: [] });
    });

    it("los cuatro nodos reciben contenido en la escena", () => {
        mostrar();
        expect(screen.getByTestId("n-zenith")).toContainElement(screen.getByTestId("orbe"));
        expect(screen.getByTestId("n-horizon")).toContainElement(screen.getByTestId("horizon"));
        expect(screen.getByTestId("n-logic")).toContainElement(screen.getByTestId("logic"));
        expect(screen.getByTestId("n-anchor")).toContainElement(screen.getByTestId("dock"));
    });

    it("el menú de mano se monta en la muñeca cuando hay acciones", () => {
        mostrar();
        expect(screen.getByTestId("menu-mano")).toBeInTheDocument();
    });

    it("Zenith suma el flujo de voz cuando llega su contexto real", () => {
        const voz = { mundo: {}, compartir: {} } as unknown as Parameters<typeof ContenidoTrinity>[0]["voz"];
        mostrar({ voz });
        expect(screen.getByTestId("n-zenith")).toContainElement(screen.getByTestId("orbe"));
        expect(screen.getByTestId("n-zenith")).toContainElement(screen.getByTestId("flujo-voz"));
    });

    it("una pieza ausente (sin controlador) no rompe la escena ni deja huecos falsos", () => {
        mostrar();
        expect(screen.queryByTestId("parametros")).toBeNull();
        expect(screen.getByTestId("n-horizon")).toContainElement(screen.getByTestId("horizon"));
    });

    it("con un controlador activo sí aparecen los parámetros de la Protomécula", () => {
        h.controlador = { obtener: () => ({ molecula: { ambito: "privado", valores: {} } }) };
        mostrar();
        expect(screen.getByTestId("parametros")).toBeInTheDocument();
    });
});

describe("mundo abierto", () => {
    it("sin mundo no se monta el render ni se inventa un sustituto", () => {
        mostrar();
        expect(screen.queryByTestId("mundo-render")).toBeNull();
    });

    it("con un MundoSpec válido sí se monta el render", () => {
        expect(validarMundo(mundo).ok).toBe(true);
        mostrar({ mundo });
        expect(screen.getByTestId("mundo-render")).toBeInTheDocument();
    });

    it("un MundoSpec inválido tampoco se monta", () => {
        mostrar({ mundo: { version: 99, tipo: "otra-cosa" } });
        expect(screen.queryByTestId("mundo-render")).toBeNull();
        expect(debeMontarMundo(null)).toBe(false);
        expect(debeMontarMundo(mundo)).toBe(true);
    });

    it("el hook de mundo abierto arranca sin mundo y no rompe sin fila", () => {
        expect(typeof useMundoAbierto).toBe("function");
        mostrar();
        expect(screen.getByTestId("rig")).toBeInTheDocument();
    });
});

describe("salida", () => {
    it("el botón «Salir al sistema» sigue presente en la escena", () => {
        render(<EscenaOS modo="vr" />);
        expect(screen.getByRole("link", { name: "Salir al sistema" })).toHaveAttribute("href", "/dashboard");
    });
});
