import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// FBM1116 · «modo banco» ahora lo usa el dueño para el reparto de internet compartido por megas: la función de las llamadas de
// prueba se llama «modo de pruebas de llamadas» / «banco de pruebas de llamadas» en todo texto que lee una persona.
const TAB = "11111111-2222-4333-8444-555555555555";
const MAC = "99999999-2222-4333-8444-555555555555";
const banco = vi.hoisted(() => ({ v: null as null | { con: string; hasta: number; restantes: number } }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
vi.mock("@/lib/control-remoto/canal", () => ({
    leerPermisoLocal: () => ({ encendido: false, nivel: "controlar", controladores: [], pendientes: [] }),
    guardarPermisoLocal: () => undefined,
    puertaControl: () => null,
    presentarmeA: async () => ({ ok: true }),
}));
vi.mock("@/lib/chats-genesis/firma-aparato", () => ({ aparatoLocal: async () => ({ codigo: "A1B2" }), codigoDe: async () => "E5F6" }));
vi.mock("@/lib/neurons/neurons", () => ({
    thisDeviceId: () => MAC,
    listNeurons: async () => [{ id: TAB, name: "Maggaboard", kind: "tablet", capabilities: { platform: "Android" }, online: true, isThisDevice: false }],
}));
vi.mock("@/lib/banco-llamadas/app", () => ({
    estadoBanco: () => banco.v,
    ultimoInforme: () => ({ v: 1, t: 1, llave: true, objetivo: TAB, codigo: "A1B2", sesion: { estado: "aceptada", motivo: null, t: 1 }, armada: null }),
    informarBanco: () => undefined,
    armarBanco: () => true,
    apagarBanco: () => undefined,
}));

import { BandaControl, ControlEntreNeuronasPanel } from "../banda-control";
import { pasosQueFaltan } from "@/lib/banco-llamadas/pasos";

afterEach(() => {
    cleanup();
    banco.v = null;
});

describe("FBM1116 · el nombre de la función en los textos", () => {
    it("el panel ofrece «Modo de pruebas de llamadas hacia esa neurona» y, armado, «Apagar el modo de pruebas de llamadas»", async () => {
        render(<ControlEntreNeuronasPanel />);
        await waitFor(() => expect(screen.getByText(/Modo de pruebas de llamadas hacia esa neurona/)).toBeInTheDocument());
        cleanup();
        banco.v = { con: TAB, hasta: Date.now() + 3_600_000, restantes: 9 };
        render(<ControlEntreNeuronasPanel />);
        await waitFor(() => expect(screen.getByText("Apagar el modo de pruebas de llamadas")).toBeInTheDocument());
        expect(document.body.textContent ?? "").not.toMatch(/modo banco/i);
    });

    it("la banda fija dice «Modo de pruebas de llamadas»", async () => {
        banco.v = { con: TAB, hasta: Date.now() + 3_600_000, restantes: 9 };
        render(<BandaControl />);
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Modo de pruebas de llamadas"));
        expect(document.body.textContent ?? "").not.toMatch(/modo banco/i);
    });

    it("los pasos que faltan usan el nombre nuevo", () => {
        const textos = [
            ...pasosQueFaltan({ informe: { v: 1, t: 1, llave: true, objetivo: TAB, codigo: "A", sesion: { estado: "aceptada", motivo: null, t: 1 }, armada: null }, destino: TAB, codigo: null, ahora: 1 }),
            ...pasosQueFaltan({ informe: { v: 1, t: 1, llave: true, objetivo: TAB, codigo: "A", sesion: { estado: "aceptada", motivo: null, t: 1 }, armada: { con: TAB, hasta: 0, restantes: 1 } }, destino: TAB, codigo: null, ahora: 1 }),
        ].map((p) => p.texto);
        expect(textos.some((t) => /modo de pruebas de llamadas/i.test(t))).toBe(true);
        for (const t of textos) expect(t).not.toMatch(/modo banco/i);
    });

    it("ningún archivo de la función dice «modo banco» (ni en comentarios)", () => {
        for (const f of ["src/components/control-remoto/banda-control.tsx", "src/lib/banco-llamadas/pasos.ts", "src/lib/banco-llamadas/app.ts", "src/lib/banco-llamadas/actor.ts", "src/app/layout.tsx", "architecture/ronda-automatica-llamadas.md", "scripts/puente/banco_llamadas.py", "scripts/puente/banco_llamadas_logica.py"]) {
            expect(readFileSync(join(process.cwd(), f), "utf8"), f).not.toMatch(/modo banco/i);
        }
    });
});
