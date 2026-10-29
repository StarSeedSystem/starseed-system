// PG1013I · ProtoGenesis en Mi Genesis y en PoliGenesis (jsdom, sin red ni disco).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { guardarEncargo, type RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import type { Encargo } from "@/lib/protogenesis/encargo";
import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ rawConfig: {}, updateConfig: vi.fn(), bgScopeMode: "global" }),
}));
vi.mock("@/lib/genesis/puertos-os", () => ({ puertosDelOs: () => ({}), contextoDeMiCuenta: () => ({ contexto: {} }) }));
vi.mock("@/components/genesis/panel-operaciones", () => ({ PanelOperaciones: () => <div data-testid="panel-operaciones" /> }));
vi.mock("@/components/genesis/atajos-genesis", () => ({ AtajosGenesis: () => null }));
vi.mock("@/components/genesis/seccion-bots", () => ({ SeccionBotsGenesis: () => null }));
vi.mock("@/lib/genesis/historial", () => ({
  anotar: async () => undefined,
  marcarDeshecha: async () => undefined,
  leerHistorial: async () => ({ entradas: [], donde: "cuenta" }),
}));
vi.mock("@/lib/genesis/entidades", () => ({
  misEntidades: async () => ({
    ok: true,
    lista: [{ tipo: "grupo", id: "g1", slug: "semilla", nombre: "Semilla", rol: "owner", rango: 4, dueña: true }],
  }),
  modoDe: async () => ({ democratico: false, explicito: true }),
  propuestasDe: async () => ({ ok: true, lista: [] }),
  proponer: async () => ({ ok: true, id: "p1" }),
  propuestaAprobada: () => false,
}));
vi.mock("@/components/astraura-bots/bots-entidad", () => ({ BotsEntidad: () => null }));
vi.mock("@/components/protomolecula/gobierno", () => ({ GobiernoProtoResumen: () => <div data-testid="gobierno-proto-resumen" /> }));

const DESCRIPCION = "La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final.";

function registro(id: string, ambito: Encargo["ambito"], moleculaId: string, entidadId?: string): RegistroEncargo {
  const encargo: Encargo = {
    id,
    moleculaId,
    ambito,
    ...(entidadId ? { entidadId } : {}),
    intencion: `Encargo ${id}`,
    criterios: [{ tipo: "formato", texto: "formato glb" }],
    autor: { tipo: "persona", id: "yo" },
    origen: "texto",
    creadoEn: Date.now(),
  };
  return { encargo, plan: null, estados: {}, asignaciones: [], actualizadoEn: Date.now() };
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("ProtoGenesis en Mi Genesis y PoliGenesis", () => {
  it("Mi Genesis enseña sus encargos personales y abre el panel de cada molécula", async () => {
    guardarEncargo(localStorage, registro("per-1", "personal", "m-per"));
    guardarEncargo(localStorage, registro("gr-1", "grupo", "m-grupo", "g1"));

    render(<MiGenesis />);

    expect(await screen.findByRole("heading", { name: "ProtoGenesis de mis moléculas" })).toBeInTheDocument();
    expect(screen.getByText(DESCRIPCION)).toBeInTheDocument();
    expect(await screen.findByText("Encargo per-1")).toBeInTheDocument();
    expect(screen.queryByText("Encargo gr-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir panel ProtoGenesis de Encargo per-1" }));
    expect(await screen.findByRole("heading", { name: "Panel ProtoGenesis" })).toBeInTheDocument();
  });

  it("PoliGenesis enseña los encargos de la entidad, su gobierno y abre el panel", async () => {
    guardarEncargo(localStorage, registro("gr-2", "grupo", "m-grupo", "g1"));
    guardarEncargo(localStorage, registro("per-2", "personal", "m-per"));

    render(<PoliGenesis />);

    expect(await screen.findByRole("heading", { name: "ProtoGenesis de esta entidad" })).toBeInTheDocument();
    expect(screen.getByText(DESCRIPCION)).toBeInTheDocument();
    expect(screen.getByTestId("gobierno-proto-resumen")).toBeInTheDocument();
    expect(await screen.findByText("Encargo gr-2")).toBeInTheDocument();
    expect(screen.queryByText("Encargo per-2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir panel ProtoGenesis de Encargo gr-2" }));
    expect(await screen.findByRole("heading", { name: "Panel ProtoGenesis" })).toBeInTheDocument();
  });
});
