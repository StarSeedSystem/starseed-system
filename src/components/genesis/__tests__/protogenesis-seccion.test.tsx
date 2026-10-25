// Pruebas jsdom de las secciones «ProtoGenesis» en Mi Genesis y PoliGenesis (PG1013I).
// Los vecinos pesados (Supabase, chat, bots) van dobles; lo que se comprueba es la
// sección: la explicación de una línea, los encargos guardados y el acceso al panel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import type { Encargo } from "@/lib/protogenesis/encargo";
import { CLAVE_INDICE, PREFIJO_ENCARGO } from "@/lib/protogenesis/almacen-encargos";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ rawConfig: {}, updateConfig: () => undefined, bgScopeMode: "cuenta" }),
}));
vi.mock("@/lib/genesis/puertos-os", () => ({
    puertosDelOs: (_a?: unknown) => ({}),
    contextoDeMiCuenta: () => ({ contexto: {} }),
}));
vi.mock("@/components/genesis/panel-operaciones", () => ({
    PanelOperaciones: (_props: Record<string, unknown>) => <div data-testid="panel-operaciones" />,
}));
vi.mock("@/components/genesis/seccion-bots", () => ({
    SeccionBotsGenesis: () => <div data-testid="seccion-bots" />,
}));
vi.mock("@/components/genesis/atajos-genesis", () => ({
    AtajosGenesis: (_props: Record<string, unknown>) => null,
}));
vi.mock("@/components/astraura-bots/bots-entidad", () => ({
    BotsEntidad: (_props: Record<string, unknown>) => <div data-testid="bots-entidad" />,
}));
vi.mock("@/lib/genesis/historial", () => ({
    anotar: async () => "aparato",
    leerHistorial: async () => ({ entradas: [], donde: "aparato" }),
}));
vi.mock("@/lib/genesis/aplicar", () => ({
    aplicarOperacion: async () => ({ ok: false as const, motivo: "prueba", entrada: {}, resultado: "" }),
}));
vi.mock("@/lib/genesis/entidades", () => ({
    misEntidades: async () => ({
        ok: true as const,
        lista: [{ tipo: "grupo", id: "ent-1", slug: "aldea", nombre: "Aldea", rol: "owner", rango: 4, dueña: true }],
    }),
    modoDe: async () => ({ democratico: false, explicito: false }),
    proponer: async () => ({ ok: false as const, motivo: "prueba" }),
    propuestasDe: async () => ({ ok: true as const, lista: [] }),
    propuestaAprobada: (estado: string) => estado === "passed" || estado === "executed",
}));

function encargoDe(id: string, moleculaId: string, ambito: Encargo["ambito"], intencion: string): Encargo {
    return { id, moleculaId, ambito, intencion, criterios: [{ tipo: "formato", texto: "formato glb" }], autor: { tipo: "persona", id: "yo" }, origen: "texto", creadoEn: 1 };
}

function registroDe(encargo: Encargo): RegistroEncargo {
    return { encargo, plan: null, estados: {}, asignaciones: [], actualizadoEn: 1 };
}

function sembrar(registro: RegistroEncargo) {
    localStorage.setItem(PREFIJO_ENCARGO + registro.encargo.id, JSON.stringify(registro));
    const ids = JSON.parse(localStorage.getItem(CLAVE_INDICE) ?? "[]") as string[];
    if (!ids.includes(registro.encargo.id)) ids.push(registro.encargo.id);
    localStorage.setItem(CLAVE_INDICE, JSON.stringify(ids));
}

const EXPLICACION = "La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final.";

beforeEach(() => {
    sembrar(registroDe(encargoDe("enc-pers-1", "mol-pers-1", "personal", "una escena 3D de la aldea")));
    sembrar(registroDe(encargoDe("enc-gru-1", "ent-1", "grupo", "el himno de la entidad")));
});

afterEach(() => {
    cleanup();
    localStorage.clear();
});

import { MiGenesis } from "../mi-genesis";
import { PoliGenesis } from "../poligenesis";

describe("Secciones «ProtoGenesis» en Mi Genesis y PoliGenesis (PG1013I)", () => {
    it("las dos secciones aparecen, cada una con su encargo y la explicación de una línea", async () => {
        render(
            <>
                <MiGenesis />
                <PoliGenesis />
            </>,
        );
        expect(await screen.findByRole("heading", { name: "ProtoGenesis de mis moléculas" })).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "ProtoGenesis de esta entidad" })).toBeInTheDocument();
        expect(screen.getAllByText(EXPLICACION)).toHaveLength(2);
        expect(await screen.findByText("una escena 3D de la aldea")).toBeInTheDocument();
        expect(await screen.findByText("el himno de la entidad")).toBeInTheDocument();
    });

    it("en Mi Genesis el acceso abre el panel del encargo personal con decisión del dueño", async () => {
        render(<MiGenesis />);
        expect(await screen.findByText("una escena 3D de la aldea")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Abrir panel de una escena 3D de la aldea" }));
        expect(await screen.findByRole("heading", { name: "Panel ProtoGenesis" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Cerrar panel" }));
        await waitFor(() => {
            expect(screen.queryByRole("heading", { name: "Panel ProtoGenesis" })).not.toBeInTheDocument();
        });
    });

    it("en PoliGenesis el acceso abre el panel de grupo con la decisión del gobierno de la entidad", async () => {
        render(<PoliGenesis />);
        const abrir = await screen.findByRole("button", { name: "Abrir panel de el himno de la entidad" });
        fireEvent.click(abrir);
        expect(await screen.findByRole("heading", { name: "Panel ProtoGenesis" })).toBeInTheDocument();
        // dueña de una entidad jerárquica: la decisión es aceptar (rango 4, modo aplicar).
        expect(await screen.findByRole("button", { name: "Aceptar en mi molécula" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Cerrar panel" }));
        await waitFor(() => {
            expect(screen.queryByRole("button", { name: "Aceptar en mi molécula" })).not.toBeInTheDocument();
        });
    });
});
