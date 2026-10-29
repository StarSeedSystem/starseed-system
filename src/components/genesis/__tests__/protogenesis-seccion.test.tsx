import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Encargos de ejemplo: uno personal y otro de la entidad (sin tocar el almacén real).
const { encargoPersonal, encargoEntidad } = vi.hoisted(() => {
    const base = (id: string, moleculaId: string, ambito: "personal" | "grupo", intencion: string) => ({
        encargo: {
            id,
            moleculaId,
            ambito,
            intencion,
            criterios: [{ tipo: "formato" as const, texto: "glb" }],
            autor: { tipo: "persona" as const, id: "yo" },
            origen: "texto" as const,
            creadoEn: 1,
        },
        plan: null,
        estados: {},
        asignaciones: [],
        actualizadoEn: 1,
    });
    return {
        encargoPersonal: base("PG1", "mol-1", "personal", "Crear una escena"),
        encargoEntidad: base("PG2", "grupo-1", "grupo", "Montar el vídeo del grupo"),
    };
});

vi.mock("@/lib/protogenesis/almacen-encargos", () => ({
    almacenNavegador: () => ({}),
    cargarEncargos: (_a: unknown, moleculaId?: string) => {
        const lista = [encargoPersonal, encargoEntidad];
        return moleculaId ? lista.filter((r) => r.encargo.moleculaId === moleculaId) : lista;
    },
    guardarEncargo: () => true,
}));

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ rawConfig: {}, updateConfig: () => undefined, bgScopeMode: "personal" }),
}));

vi.mock("@/lib/genesis/puertos-os", () => ({
    puertosDelOs: () => ({}),
    contextoDeMiCuenta: () => ({ contexto: {} }),
}));

vi.mock("../panel-operaciones", () => ({ PanelOperaciones: () => <div data-testid="panel-operaciones" /> }));
vi.mock("../atajos-genesis", () => ({ AtajosGenesis: () => null }));
vi.mock("../seccion-bots", () => ({ SeccionBotsGenesis: () => <div data-testid="seccion-bots" /> }));

vi.mock("@/lib/genesis/entidades", () => ({
    misEntidades: async () => ({
        ok: true,
        lista: [{ tipo: "grupo", id: "grupo-1", slug: "huerto", nombre: "Huerto", rol: "owner", rango: 4, dueña: true }],
    }),
    modoDe: async () => ({ democratico: true, explicito: true }),
    propuestasDe: async () => ({ ok: true, lista: [] }),
    propuestaAprobada: () => false,
    proponer: async () => ({ ok: false, motivo: "no" }),
}));

vi.mock("@/lib/genesis/historial", () => ({
    leerHistorial: async () => ({ entradas: [], donde: "cuenta" }),
    anotar: async () => "cuenta",
}));

vi.mock("@/lib/genesis/aplicar", () => ({
    aplicarOperacion: async () => ({ ok: false, motivo: "no" }),
}));

vi.mock("@/components/astraura-bots/bots-entidad", () => ({ BotsEntidad: () => null }));
vi.mock("@/components/protomolecula/gobierno", () => ({ GobiernoProtoResumen: () => <div data-testid="gobierno-resumen" /> }));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));

import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";

afterEach(() => {
    cleanup();
});

describe("ProtoGenesis en Mi Genesis y PoliGenesis", () => {
    it("Mi Genesis enseña la sección «ProtoGenesis de mis moléculas» y sus encargos", async () => {
        render(<MiGenesis />);

        expect(screen.getByRole("heading", { name: "ProtoGenesis de mis moléculas" })).toBeInTheDocument();
        expect(screen.getByText(/un director, varios agentes a la vez y tu decisión al final/)).toBeInTheDocument();
        expect(await screen.findByText("Crear una escena")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Abrir panel" })).toBeInTheDocument();
    });

    it("PoliGenesis enseña la sección de la entidad, su gobierno y sus encargos", async () => {
        render(<PoliGenesis />);

        expect(await screen.findByRole("heading", { name: "ProtoGenesis de esta entidad" })).toBeInTheDocument();
        expect(screen.getByText(/un director, varios agentes a la vez y tu decisión al final/)).toBeInTheDocument();
        expect(await screen.findByText("Montar el vídeo del grupo")).toBeInTheDocument();
        expect(screen.getByTestId("gobierno-resumen")).toBeInTheDocument();
    });
});
