// PG1013I · Prueba de la sección ProtoGenesis en Mi Genesis y en PoliGenesis.
// jsdom: sin red, sin disco (los módulos con side-effects se sustituyen por stubs).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { guardarEncargo, type RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import type { Encargo } from "@/lib/protogenesis/encargo";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ rawConfig: {}, updateConfig: () => undefined, bgScopeMode: "todo" }),
}));
vi.mock("@/components/genesis/seccion-bots", () => ({ SeccionBotsGenesis: () => null }));
vi.mock("@/components/astraura-bots/bots-entidad", () => ({ BotsEntidad: () => null }));
vi.mock("@/lib/genesis/historial", () => ({
  anotar: async () => "aparato",
  leerHistorial: async () => ({ entradas: [], donde: "aparato" }),
  marcarDeshecha: async () => undefined,
}));
vi.mock("@/lib/genesis/entidades", () => ({
  misEntidades: async () => ({
    ok: true as const,
    lista: [{ tipo: "grupo", id: "g1", slug: "semilla", nombre: "Semilla", rol: "owner", rango: 4, dueña: true }],
  }),
  modoDe: async () => ({ democratico: false, explicito: true }),
  propuestasDe: async () => ({ ok: true as const, lista: [] }),
  propuestaAprobada: (e: string) => e === "approved",
  proponer: async () => ({ ok: false as const, motivo: "prueba" }),
}));

import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";

const AHORA = Date.parse("2026-10-26T12:00:00Z");

/** Encargo válido (pasa `validarEncargo`) con su registro completo. */
function registro(encargo: Encargo): RegistroEncargo {
  return { encargo, plan: null, estados: {}, asignaciones: [], actualizadoEn: AHORA };
}

function encargoDe(id: string, moleculaId: string, ambito: Encargo["ambito"], intencion: string): Encargo {
  return {
    id,
    moleculaId,
    ambito,
    intencion,
    criterios: [{ tipo: "formato", texto: "formato glb" }],
    autor: { tipo: "persona", id: "cuenta" },
    origen: "texto",
    creadoEn: AHORA,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Sección ProtoGenesis en Mi Genesis", () => {
  it("aparece con su explicación y los encargos personales de la cuenta", async () => {
    const a = localStorage;
    guardarEncargo(a, registro(encargoDe("e1", "m1", "personal", "una escena orbital")));
    guardarEncargo(a, registro(encargoDe("e2", "g-mol", "grupo", "logo del grupo")));
    render(<MiGenesis />);

    expect(await screen.findByRole("heading", { name: "ProtoGenesis de mis moléculas" })).toBeInTheDocument();
    expect(screen.getByTestId("protogenesis-explicacion")).toHaveTextContent(
      "La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final.",
    );
    expect(await screen.findByText("una escena orbital")).toBeInTheDocument();
    // Los de grupo no son de Mi Genesis: los decide su entidad en PoliGenesis.
    expect(screen.queryByText("logo del grupo")).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir panel ProtoGenesis" })).toBeInTheDocument();
  });

  it("el acceso del encargo abre el panel ProtoGenesis y se cierra", async () => {
    guardarEncargo(localStorage, registro(encargoDe("e1", "m1", "personal", "una escena orbital")));
    render(<MiGenesis />);

    fireEvent.click(await screen.findByTestId("abrir-protogenesis-e1"));
    expect(await screen.findByText("Panel ProtoGenesis")).toBeInTheDocument();
    // Ámbito personal con la persona dueña: se acepta en la propia molécula (§2.7).
    expect(screen.getByRole("button", { name: "Aceptar en mi molécula" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar panel" }));
    await waitFor(() => expect(screen.queryByText("Panel ProtoGenesis")).toBeNull());
  });
});

describe("Sección ProtoGenesis en PoliGenesis", () => {
  it("aparece con su explicación, el resumen del gobierno de la entidad y sus encargos", async () => {
    guardarEncargo(localStorage, registro(encargoDe("e1", "gmol", "grupo", "escena de bienvenida")));
    render(<PoliGenesis />);

    expect(await screen.findByRole("heading", { name: "ProtoGenesis de esta entidad" })).toBeInTheDocument();
    expect(screen.getByTestId("protogenesis-explicacion")).toHaveTextContent(
      "La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final.",
    );
    // El gobierno de la Protomolécula del grupo se MONTA, no se duplica (Ola 1026P).
    expect(await screen.findByTestId("gobierno-proto-poligenesis")).toBeInTheDocument();
    expect(screen.getByTestId("chip-origen")).toBeInTheDocument();
    expect(await screen.findByText("escena de bienvenida")).toBeInTheDocument();
  });

  it("el acceso del encargo abre el panel con el rol y el modo de la entidad", async () => {
    guardarEncargo(localStorage, registro(encargoDe("e1", "gmol", "grupo", "escena de bienvenida")));
    render(<PoliGenesis />);

    fireEvent.click(await screen.findByTestId("abrir-protogenesis-e1"));
    expect(await screen.findByText("Panel ProtoGenesis")).toBeInTheDocument();
    // Jerárquica y la cuenta es dueña: se aplica con confirmación (§2.7).
    expect(screen.getByRole("button", { name: "Aceptar en mi molécula" })).toBeInTheDocument();
  });
});
