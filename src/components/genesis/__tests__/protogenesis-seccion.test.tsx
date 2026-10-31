// Pruebas jsdom de la sección ProtoGenesis en Mi Genesis y PoliGenesis (PG1013I).
// jsdom trae localStorage de verdad: el almacén de encargos es el real; lo que toca
// Supabase se dobla, así que ninguna prueba tira de red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import type { EntidadGestionable } from "@/lib/genesis/entidades";
import type { PuertosGenesis } from "@/lib/genesis/aplicar";
import { guardarEncargo, type RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import type { Encargo } from "@/lib/protogenesis/encargo";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: { themeStore: { activeMode: "flat" }, styling: { crystalPreset: "none" } },
        rawConfig: {}, updateConfig: vi.fn(), bgScopeMode: "cuenta",
    }),
}));

/** Puertos en memoria, con la forma exacta que exige PanelOperaciones. */
const puertosFalsos: PuertosGenesis = (() => {
    const nadaPerfil = async () => ({ ok: false as const, motivo: "sin red" });
    const nadaEntidad = async () => ({ ok: false as const, motivo: "sin red" });
    return {
        perfil: { leer: nadaPerfil, escribir: async () => ({ ok: false, filas: 0 }) },
        entidad: { crearPagina: async () => ({ ok: false, motivo: "sin red" }), leer: nadaEntidad, escribir: async () => ({ ok: false, filas: 0 }), contarPublicaciones: async () => null, borrarPagina: async () => ({ ok: false, motivo: "sin red" }) },
        dock: { leer: () => [], guardar: () => undefined, iconoValido: () => true },
        tableros: { listar: () => [], leerWidgets: () => [], guardarWidgets: () => undefined, widgetConocido: () => null },
        agentes: { crear: () => null, borrar: () => false, vincular: () => false, desvincular: () => undefined },
        ahora: () => Date.now(),
        nuevoId: () => `e-${Math.random().toString(36).slice(2, 8)}`,
    };
})();

vi.mock("@/lib/genesis/puertos-os", () => ({
    puertosDelOs: () => puertosFalsos,
    contextoDeMiCuenta: async () => ({ contexto: {}, paginasPropias: [] }),
}));
vi.mock("@/lib/genesis/historial", () => ({
    anotar: vi.fn(async () => "cuenta"),
    leerHistorial: vi.fn(async () => ({ entradas: [], donde: "cuenta" })),
    marcarDeshecha: vi.fn(),
}));
const ENTIDAD: EntidadGestionable = { tipo: "grupo", id: "g1", slug: "semilla", nombre: "Semilla", rol: "gestor", rango: 3, dueña: false };
vi.mock("@/lib/genesis/entidades", () => ({
    misEntidades: vi.fn(async () => ({ ok: true as const, lista: [ENTIDAD] })),
    modoDe: vi.fn(async () => ({ democratico: false, explicito: true })),
    proponer: vi.fn(),
    propuestasDe: vi.fn(async () => ({ ok: true as const, lista: [] })),
    propuestaAprobada: (estado: string) => estado === "approved",
}));
vi.mock("@/lib/governance/engine", () => ({ createProposal: vi.fn() }));
vi.mock("@/components/astraura-bots/bots-entidad", () => ({ BotsEntidad: () => null }));
vi.mock("@/components/genesis/seccion-bots", () => ({ SeccionBotsGenesis: () => null }));
// El gobierno de la entidad se dobla: sin sesión y con reglas del OS, sin tocar Supabase.
vi.mock("@/lib/protomolecula/gobierno/entorno", () => ({
    SERVICIOS_POR_DEFECTO: { cargar: vi.fn(async () => null), guardar: vi.fn(), personas: vi.fn(async () => []) },
}));

import { misEntidades } from "@/lib/genesis/entidades";
import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";

const SEMILLA: Encargo = {
    id: "pg-1", moleculaId: "mol-1", ambito: "personal", intencion: "un fresco que salude a la primavera",
    criterios: [{ tipo: "formato", texto: "formato png" }], autor: { tipo: "persona", id: "cuenta-1" },
    origen: "texto", creadoEn: 1,
};

/** Guarda un encargo de verdad en el localStorage de jsdom. */
function sembrar(encargo: Encargo) {
    const registro: RegistroEncargo = { encargo, plan: null, estados: {}, asignaciones: [], actualizadoEn: 1 };
    expect(guardarEncargo(localStorage, registro)).toBe(true);
}

afterEach(cleanup);
beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe("Sección ProtoGenesis en Mi Genesis (PG1013I)", () => {
    it("aparece con la explicación, el encargo guardado y abre el panel del ámbito personal", async () => {
        sembrar(SEMILLA);
        render(<MiGenesis />);
        expect(await screen.findByRole("heading", { name: "ProtoGenesis de mis moléculas" })).toBeInTheDocument();
        expect(screen.getByText(/La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final/)).toBeInTheDocument();
        expect(screen.getByText("un fresco que salude a la primavera")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Abrir panel" }));
        expect(await screen.findByText("Panel ProtoGenesis")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Aceptar en mi molécula" })).toBeInTheDocument();
    });
});

describe("Sección ProtoGenesis en PoliGenesis (PG1013I)", () => {
    it("aparece para la entidad con el resumen de gobierno y abre el panel con su rol", async () => {
        sembrar({ ...SEMILLA, ambito: "grupo", entidadId: "g1" });
        render(<PoliGenesis />);
        expect(await screen.findByRole("heading", { name: "ProtoGenesis de esta entidad" })).toBeInTheDocument();
        expect(screen.getByTestId("gobierno-resumen")).toBeInTheDocument();
        expect(await screen.findByText("un fresco que salude a la primavera")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Abrir panel" }));
        expect(await screen.findByText("Panel ProtoGenesis")).toBeInTheDocument();
        expect(screen.getByText("grupo")).toBeInTheDocument();
    });

    it("una página también monta su gobierno y conserva los encargos con moleculaId heredado", async () => {
        const pagina: EntidadGestionable = { ...ENTIDAD, tipo: "pagina", id: "p1", slug: "pagina-semilla", nombre: "Página Semilla" };
        vi.mocked(misEntidades).mockResolvedValueOnce({ ok: true, lista: [pagina] });
        // Los encargos anteriores a PG1013I guardaban la entidad como moleculaId, sin entidadId.
        sembrar({ ...SEMILLA, moleculaId: "p1", ambito: "grupo" });
        render(<PoliGenesis />);
        expect(await screen.findByRole("heading", { name: "ProtoGenesis de esta entidad" })).toBeInTheDocument();
        expect(screen.getByTestId("gobierno-resumen")).toBeInTheDocument();
        expect(await screen.findByText("un fresco que salude a la primavera")).toBeInTheDocument();
    });
});
