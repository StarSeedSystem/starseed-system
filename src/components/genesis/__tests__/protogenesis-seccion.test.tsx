import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { guardarEncargo, type RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import type { Encargo } from "@/lib/protogenesis/encargo";
import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/genesis/panel-operaciones", () => ({ PanelOperaciones: () => <div data-testid="panel-operaciones" /> }));
vi.mock("@/components/genesis/atajos-genesis", () => ({ AtajosGenesis: () => null }));
vi.mock("@/components/genesis/seccion-bots", () => ({ SeccionBotsGenesis: () => null }));
vi.mock("@/components/astraura-bots/bots-entidad", () => ({ BotsEntidad: () => null }));
vi.mock("@/components/protomolecula/gobierno", () => ({
    GobiernoProtoResumen: () => <div data-testid="gobierno-proto-resumen" />,
}));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ rawConfig: {}, updateConfig: () => undefined, bgScopeMode: "personal" }),
}));
vi.mock("@/lib/genesis/puertos-os", () => ({
    puertosDelOs: () => ({}),
    contextoDeMiCuenta: () => ({ contexto: {} }),
}));
vi.mock("@/lib/genesis/entidades", () => ({
    misEntidades: async () => ({
        ok: true,
        lista: [{ id: "e1", slug: "semilla", nombre: "Semilla", tipo: "grupo", rol: "owner", rango: 4, dueña: true }],
    }),
    modoDe: async () => ({ democratico: false, explicito: true }),
    propuestasDe: async () => ({ ok: true, lista: [] }),
    propuestaAprobada: () => false,
    proponer: async () => ({ ok: false, motivo: "no en esta prueba" }),
}));
vi.mock("@/lib/genesis/historial", () => ({
    leerHistorial: async () => ({ entradas: [] }),
    anotar: async () => undefined,
}));

function registro(id: string, moleculaId: string, ambito: "personal" | "grupo"): RegistroEncargo {
    const encargo: Encargo = {
        id,
        moleculaId,
        ambito,
        intencion: `Crear ${id}`,
        criterios: [{ tipo: "formato", texto: "formato glb" }],
        autor: { tipo: "persona", id: "yo" },
        origen: "texto",
        creadoEn: Date.now(),
    };
    return { encargo, plan: null, estados: {}, asignaciones: [], actualizadoEn: Date.now() };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("ProtoGenesis en Mi Genesis y PoliGenesis", () => {
    it("Mi Genesis enseña los encargos propios y abre su panel personal", () => {
        expect(guardarEncargo(window.localStorage, registro("pg-personal", "mol-1", "personal"))).toBe(true);
        render(<MiGenesis />);
        expect(screen.getByRole("heading", { name: "ProtoGenesis de mis moléculas" })).toBeInTheDocument();
        expect(screen.getByText(/La génesis de cada creación/)).toBeInTheDocument();
        expect(screen.getByText("Crear pg-personal")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Abrir ProtoGenesis" }));
        expect(screen.getByRole("heading", { name: "Panel ProtoGenesis" })).toBeInTheDocument();
        expect(screen.getByText("personal")).toBeInTheDocument();
    });

    it("PoliGenesis enseña los encargos de la entidad, su gobierno y abre el panel de grupo", async () => {
        expect(guardarEncargo(window.localStorage, registro("pg-grupo", "e1", "grupo"))).toBe(true);
        render(<PoliGenesis />);
        expect(await screen.findByRole("heading", { name: "ProtoGenesis de esta entidad" })).toBeInTheDocument();
        expect(screen.getByText(/La génesis de cada creación/)).toBeInTheDocument();
        expect(screen.getByTestId("gobierno-proto-resumen")).toBeInTheDocument();
        expect(await screen.findByText("Crear pg-grupo")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Abrir ProtoGenesis" }));
        expect(await screen.findByRole("heading", { name: "Panel ProtoGenesis" })).toBeInTheDocument();
        expect(screen.getByText("grupo")).toBeInTheDocument();
    });
});
