import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { guardarEncargo, type RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import type { Ambito } from "@/lib/protomolecula/tipos";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ rawConfig: {}, updateConfig: () => undefined, bgScopeMode: "global" }),
}));

vi.mock("@/lib/genesis/puertos-os", () => ({
  puertosDelOs: () => ({}),
  contextoDeMiCuenta: () => ({}),
}));

vi.mock("@/components/genesis/panel-operaciones", () => ({
  PanelOperaciones: () => <div data-testid="panel-operaciones" />,
}));

vi.mock("@/components/genesis/atajos-genesis", () => ({
  AtajosGenesis: () => null,
}));

vi.mock("@/components/genesis/seccion-bots", () => ({
  SeccionBotsGenesis: () => <div data-testid="seccion-bots" />,
}));

vi.mock("@/components/astraura-bots/bots-entidad", () => ({
  BotsEntidad: () => <div data-testid="bots-entidad" />,
}));

vi.mock("@/components/protomolecula/gobierno", () => ({
  GobiernoProtoResumen: ({ contexto }: { contexto: { entidad?: { nombre?: string } } }) => (
    <div data-testid="resumen-gobierno">{contexto.entidad?.nombre}</div>
  ),
}));

vi.mock("@/lib/genesis/entidades", () => ({
  misEntidades: async () => ({
    ok: true,
    lista: [{ tipo: "grupo", id: "g1", slug: "semilla", nombre: "Semilla", rol: "owner", rango: 4, dueña: true }],
  }),
  modoDe: async () => ({ democratico: false, explicito: true }),
  propuestasDe: async () => ({ ok: true, lista: [] }),
  proponer: async () => ({ ok: false, motivo: "no" }),
  propuestaAprobada: (estado: string) => estado === "approved",
}));

vi.mock("@/lib/genesis/historial", () => ({
  leerHistorial: async () => ({ entradas: [], donde: "cuenta" }),
  anotar: async () => "cuenta",
}));

vi.mock("@/lib/genesis/aplicar", () => ({
  aplicarOperacion: async () => ({ ok: false, motivo: "no" }),
}));

import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";

function registro(id: string, moleculaId: string, ambito: Ambito): RegistroEncargo {
  return {
    encargo: {
      id,
      moleculaId,
      ambito,
      intencion: `encargo ${id}`,
      criterios: [{ tipo: "formato", texto: "un formato" }],
      autor: { tipo: "persona", id: "yo" },
      origen: "texto",
      creadoEn: 1,
    },
    plan: null,
    estados: {},
    asignaciones: [],
    actualizadoEn: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  guardarEncargo(localStorage, registro("e1", "m1", "personal"));
  guardarEncargo(localStorage, registro("e2", "g1", "grupo"));
});

afterEach(() => {
  cleanup();
});

describe("Secciones de ProtoGenesis", () => {
  it("Mi Genesis enseña la sección y abre el panel de un encargo", async () => {
    render(<MiGenesis />);

    expect(await screen.findByText("ProtoGenesis de mis moléculas")).toBeInTheDocument();
    expect(screen.getByText(/La génesis de cada creación/)).toBeInTheDocument();

    fireEvent.click((await screen.findByText("encargo e1")).closest("button") as HTMLButtonElement);
    expect(await screen.findByText("Panel ProtoGenesis")).toBeInTheDocument();
  });

  it("PoliGenesis enseña la sección, su gobierno y abre el panel del grupo", async () => {
    render(<PoliGenesis />);

    expect(await screen.findByText("ProtoGenesis de esta entidad")).toBeInTheDocument();
    expect(screen.getByText(/La génesis de cada creación/)).toBeInTheDocument();
    expect(screen.getByTestId("resumen-gobierno")).toHaveTextContent("Semilla");

    fireEvent.click((await screen.findByText("encargo e2")).closest("button") as HTMLButtonElement);
    expect(await screen.findByText("Panel ProtoGenesis")).toBeInTheDocument();
  });
});
