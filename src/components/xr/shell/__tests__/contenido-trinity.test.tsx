import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";

const h = vi.hoisted(() => ({
    rig: null as Record<string, unknown> | null,
    menu: null as Record<string, unknown> | null,
    audio: [] as Record<string, unknown>[],
}));

vi.mock("../rig-trinity", () => ({
    RigTrinity: (p: { contenido: Record<string, unknown> }) => {
        h.rig = p as unknown as Record<string, unknown>;
        return <div data-testid="rig">{Object.entries(p.contenido).map(([n, v]) => (
            <div key={n} data-nodo={n}>{v as React.ReactNode}</div>))}</div>;
    },
}));
vi.mock("../orbe-voz", () => ({ OrbeVoz: () => <div data-testid="orbe-voz" /> }));
vi.mock("../horizon-montado", () => ({ HorizonMontado: () => <div data-testid="horizon" /> }));
vi.mock("../nodo-logic", () => ({ NodoLogic: () => <div data-testid="logic" /> }));
vi.mock("../dock-3d", () => ({ Dock3D: () => <div data-testid="dock" /> }));
vi.mock("../mundo-render", () => ({ default: () => <div data-testid="mundo-render" /> }));
vi.mock("../pantalla-3d", () => ({ Pantalla3D: () => <div data-testid="pantalla-3d" /> }));
vi.mock("../pizarra-3d", () => ({ Pizarra3D: () => <div data-testid="pizarra-3d" /> }));
vi.mock("../use-audio-espacial", () => ({ useAudioEspacial: (o: Record<string, unknown>) => { h.audio.push(o); return {}; } }));
vi.mock("@/components/vivo/espacial/use-sesion-escena", () => ({ useSesionEscena: () => ({ sesion: null, avatares: { yo: null, otros: [] } }) }));
vi.mock("@/components/vivo/espacial/avatar-remoto-xr", () => ({ AvatarRemotoXR: () => null }));
vi.mock("../menu-mano", () => ({
    MenuMano: (p: Record<string, unknown>) => {
        h.menu = p;
        return <div data-testid="menu-mano"><button type="button">Salir</button><button type="button">Recentrar</button></div>;
    },
}));

import { ContenidoTrinity, armarContenido, contextoDeAcciones, debeMontarMundo } from "../contenido-trinity";

const MUNDO = {
    version: 1, tipo: "mundo-xr", nombre: "Sala de prueba", spawns: [{ id: "entrada", pos: [0, 0, 0], yaw: 0 }],
    pantallas: [{ id: "p1", pos: [0, 1, -2], rot: [0, 0, 0], ancho: 2, fuente: { tipo: "llamada" }, sonido: "mudo" }],
    pizarras: [{ id: "z1", pos: [0, 1, -2], rot: [0, 0, 0], ancho: 2, alto: 1 }],
} as unknown as MundoSpec;

beforeEach(() => { h.rig = null; h.menu = null; h.audio = []; });
afterEach(cleanup);

describe("armarContenido", () => {
    it("devuelve los cuatro nodos y el menú de mano cuando todos tienen contenido", () => {
        const r = armarContenido({ zenith: "Z", horizon: "H", logic: "L", anchor: "A", menuMano: "M" });
        expect(Object.keys(r.contenido).sort()).toEqual(["anchor", "horizon", "logic", "zenith"]);
        expect(r.menuMano).toBe("M");
    });
    it("omite una pieza ausente sin romper el resto del rig", () => {
        const r = armarContenido({ zenith: "Z", anchor: "A" });
        expect(r.contenido.zenith).toBe("Z");
        expect("horizon" in r.contenido).toBe(false);
        expect(r.menuMano).toBeNull();
    });
});

describe("debeMontarMundo", () => {
    it("sin mundo abierto no se monta el render", () => {
        expect(debeMontarMundo(null)).toBe(false);
        expect(debeMontarMundo(undefined)).toBe(false);
    });
    it("con un MundoSpec válido sí se monta; con otra cosa, no", () => {
        expect(debeMontarMundo(MUNDO)).toBe(true);
        expect(debeMontarMundo({ tipo: "otra-cosa" } as unknown as MundoSpec)).toBe(false);
    });
});

describe("contextoDeAcciones", () => {
    it("siempre trae las acciones del núcleo, incluida salir", () => {
        const c = contextoDeAcciones();
        for (const clave of ["salir", "recentrar", "abrirMenuMano", "hablar", "teletransporte"]) {
            expect(typeof c[clave as keyof typeof c]).toBe("function");
        }
    });
    it("los callbacks inyectados mandan sobre los de por defecto", () => {
        const salir = vi.fn(async () => undefined);
        expect(contextoDeAcciones({ salir }).salir).toBe(salir);
    });
});

describe("ContenidoTrinity", () => {
    it("los cuatro nodos y el menú de mano reciben contenido", () => {
        render(<ContenidoTrinity modo="vr-inmersivo" nivel="media" />);
        expect(screen.getByTestId("rig")).toBeInTheDocument();
        for (const nodo of ["zenith", "horizon", "logic", "anchor"]) {
            expect(document.querySelector(`[data-nodo="${nodo}"]`)).not.toBeNull();
        }
        for (const id of ["orbe-voz", "horizon", "logic", "dock", "menu-mano"]) {
            expect(screen.getByTestId(id)).toBeInTheDocument();
        }
        expect((h.menu?.nodo as { id: string }).id).toBe("menuMano");
    });
    it("sin un mundo abierto no se monta el render ni sus pantallas", () => {
        render(<ContenidoTrinity modo="vr-inmersivo" nivel="media" />);
        expect(screen.queryByTestId("mundo-render")).toBeNull();
        expect(screen.queryByTestId("pantalla-3d")).toBeNull();
    });
    it("con un MundoSpec válido se monta el render, su pantalla y su pizarra", () => {
        render(<ContenidoTrinity modo="vr-inmersivo" nivel="media" mundo={MUNDO} />);
        expect(screen.getByTestId("mundo-render")).toBeInTheDocument();
        expect(screen.getByTestId("pantalla-3d")).toBeInTheDocument();
        expect(screen.getByTestId("pizarra-3d")).toBeInTheDocument();
    });
    it("una pieza ausente (sin parámetros) no rompe la escena y deja salir", () => {
        render(<ContenidoTrinity modo="3d-pantalla" nivel="minima" parametros={null} />);
        expect(screen.getByTestId("horizon")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
        expect(typeof (h.menu?.contexto as { salir: () => void }).salir).toBe("function");
    });
    it("el audio espacial recibe el nivel y la sala abierta", () => {
        render(<ContenidoTrinity modo="vr-inmersivo" nivel="alta" refSala="11111111-1111-1111-1111-111111111111" />);
        expect(h.audio.at(-1)).toMatchObject({ nivel: "alta", salaId: "11111111-1111-1111-1111-111111111111" });
    });
});
