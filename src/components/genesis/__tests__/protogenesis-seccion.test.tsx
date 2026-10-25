/**
 * ProtoGenesis · secciones en Mi Genesis y en PoliGenesis (PG1013I).
 * Prueba de interfaz (jsdom): cada sección aparece con los encargos guardados en el
 * almacén del navegador, explica en una línea qué es ProtoGenesis y cada encargo
 * abre su PanelProtoGenesis. La lógica vive en src/lib/protogenesis.
 * Contrato: architecture/protogenesis.md §2 y §3.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { almacenNavegador, guardarEncargo, type RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import type { Encargo } from "@/lib/protogenesis/encargo";
import type { EntidadGestionable } from "@/lib/genesis/entidades";

// Dependencias pesadas o de red: sustituidas para que la prueba sea de interfaz.
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ rawConfig: {}, updateConfig: vi.fn(), bgScopeMode: "cuenta" }),
}));
vi.mock("@/lib/genesis/puertos-os", () => ({
    puertosDelOs: () => ({ entidad: { leer: async () => ({ ok: false, valores: {} }) } }),
    contextoDeMiCuenta: () => ({ contexto: {} }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/genesis/panel-operaciones", () => ({ PanelOperaciones: () => null }));
vi.mock("@/components/genesis/seccion-bots", () => ({ SeccionBotsGenesis: () => null }));
vi.mock("@/components/astraura-bots/bots-entidad", () => ({ BotsEntidad: () => null }));
vi.mock("@/lib/genesis/entidades", () => ({
    misEntidades: vi.fn(),
    modoDe: vi.fn(),
    proponer: vi.fn(),
    propuestaAprobada: (estado: string) => estado === "passed" || estado === "executed",
    propuestasDe: vi.fn(),
}));
vi.mock("@/lib/genesis/aplicar", () => ({ aplicarOperacion: vi.fn() }));
vi.mock("@/lib/genesis/historial", () => ({
    anotar: vi.fn(),
    leerHistorial: async () => ({ entradas: [], donde: "cuenta" }),
}));

import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";
import { misEntidades, modoDe, propuestasDe } from "@/lib/genesis/entidades";

/** Un encargo guardable con lo que pasa la validación y overrides por prueba. */
function registro(parcial: Partial<Encargo>): RegistroEncargo {
    const creadoEn = 1_760_000_000_000;
    const encargo: Encargo = {
        id: "PG-prueba-1",
        moleculaId: "mol-1",
        ambito: "personal",
        intencion: "Una escena con un sintetizador",
        criterios: [{ tipo: "formato", texto: "formato glb" }],
        autor: { tipo: "persona", id: "yo" },
        origen: "texto",
        creadoEn,
        ...parcial,
    };
    return { encargo, plan: null, estados: {}, asignaciones: [], actualizadoEn: creadoEn };
}

const EXPLICACION = "La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final.";

const entidad: EntidadGestionable = {
    tipo: "grupo",
    id: "g1",
    slug: "grupo-uno",
    nombre: "Grupo Uno",
    rol: "gestor",
    rango: 3,
    dueña: false,
};

function guardar(parcial: Partial<Encargo>): void {
    const almacen = almacenNavegador();
    if (!almacen) throw new Error("el navegador de la prueba no trae localStorage");
    expect(guardarEncargo(almacen, registro(parcial))).toBe(true);
}

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.resetAllMocks();
});

describe("ProtoGenesis en Mi Genesis (PG1013I)", () => {
    it("enseña la sección con los encargos guardados y abre el panel de uno", async () => {
        guardar({}); // personal por defecto
        render(<MiGenesis />);
        expect(await screen.findByText("ProtoGenesis de mis moléculas")).toBeInTheDocument();
        expect(screen.getByText(EXPLICACION)).toBeInTheDocument();
        expect(screen.getByText("Una escena con un sintetizador")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("abrir-protogenesis"));
        expect(await screen.findByText("Panel ProtoGenesis")).toBeInTheDocument();
    });
});

describe("ProtoGenesis en PoliGenesis (PG1013I)", () => {
    it("enseña la sección de la entidad y abre el panel de uno", async () => {
        vi.mocked(misEntidades).mockResolvedValue({ ok: true, lista: [entidad] });
        vi.mocked(modoDe).mockResolvedValue({ democratico: false, explicito: false });
        vi.mocked(propuestasDe).mockResolvedValue({ ok: true, lista: [] });
        guardar({ ambito: "grupo", entidadId: "g1", moleculaId: "mol-g", intencion: "Un vídeo de anuncio del grupo" });
        render(<PoliGenesis />);
        expect(await screen.findByText("ProtoGenesis de las moléculas de esta entidad")).toBeInTheDocument();
        expect(screen.getByText(EXPLICACION)).toBeInTheDocument();
        expect(screen.getByText("Un vídeo de anuncio del grupo")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("abrir-protogenesis"));
        expect(await screen.findByText("Panel ProtoGenesis")).toBeInTheDocument();
    });
});
