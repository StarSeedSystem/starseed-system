import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929) · Alquimia cívica: borrador honesto (plantilla) que se
// abre relleno en Decisiones y propuestas parecidas REALES del Ágora.
// ════════════════════════════════════════════════════════════════

if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
    });
}
vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { widgets: { marco: "libre" }, animations: { enabled: false } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => ({ uid: "u1", ready: true }) }));

let tablas: Record<string, any[]> = {};
let fallar = false;
vi.mock("@/utils/supabase/client", () => {
    function consulta(tabla: string) {
        let filas = [...(tablas[tabla] ?? [])];
        const c: any = {
            select: () => c, order: () => c, limit: () => c,
            eq: (col: string, v: unknown) => { filas = filas.filter((f) => !(col in f) || f[col] === v); return c; },
            in: (col: string, vs: unknown[]) => { filas = filas.filter((f) => !(col in f) || vs.includes(f[col])); return c; },
            then: (ok: any, ko: any) => Promise.resolve(fallar ? { data: null, error: { message: "402" } } : { data: filas, error: null }).then(ok, ko),
        };
        return c;
    }
    return { createClient: () => ({ from: (t: string) => consulta(t) }) };
});

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { parseProposalParams } from "@/lib/governance/links";
import { __reiniciarCacheB } from "../../gen2/_paquete-b/cache-compartida";
import { palabrasClave, parecidas, redactar } from "../../gen2/_paquete-b/alquimia";
import { normalizarPropuesta } from "../../gen2/_paquete-b/datos-civicos";
import { CivicAlchemyWidget, enlacePropuesta } from "../civic-alchemy-widget";

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento: "#dc143c", acento2: "#23d5ab", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

const T0 = Date.now();
beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    fallar = false;
    tablas = {
        proposals: [
            { id: "p1", scope: "community", scope_ref: "barrio", title: "Toldos de sombra en la plaza", description: "Poner sombra para el verano", kind: "decision", options: [], params: { votingEndsAt: new Date(T0 + 30 * 3_600_000).toISOString() }, status: "open", result: null, created_at: new Date(T0 - 3_600_000).toISOString() },
            { id: "p2", scope: "global", scope_ref: null, title: "Biblioteca de semillas", description: null, kind: "decision", options: [], params: {}, status: "passed", result: null, created_at: new Date(T0 - 99_000_000).toISOString() },
        ],
        proposal_votes: [],
    };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("alquimia (puros)", () => {
    it("saca las palabras con sentido y redacta un borrador honesto", () => {
        expect(palabrasClave("La plaza no tiene sombra, y la PLAZA arde")).toEqual(["plaza", "sombra", "arde"]);
        const r = redactar("la plaza no tiene sombra en verano. Los mayores no pueden estar");
        expect(r.titulo).toBe("La plaza no tiene sombra en verano");
        expect(r.descripcion).toMatch(/^Problema: /);
    });
    it("encuentra parecidas reales y arma el enlace del motor", () => {
        const lista = tablas.proposals.map((f) => normalizarPropuesta(f as any, [], null));
        expect(parecidas("no hay sombra en la plaza", lista)[0].p.id).toBe("p1");
        expect(parecidas("zzzz", lista)).toEqual([]);
        const url = new URL(enlacePropuesta("no hay sombra en la plaza", "community"), "https://os.test");
        expect(url.pathname).toBe("/decisiones");
        expect(parseProposalParams(url.searchParams)).toMatchObject({ open: true, scope: "community", initial: { title: "No hay sombra en la plaza" } });
    });
});

describe("Alquimia cívica", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("se compone en %s y abre Decisiones", async (clase) => {
        render(enMarco(clase, <CivicAlchemyWidget />));
        if (clase === "micro") {
            expect(await screen.findByRole("link", { name: "Abrir una propuesta nueva en Decisiones" })).toHaveAttribute("href", "/decisiones?nueva=1");
            return;
        }
        fireEvent.change(await screen.findByLabelText("¿Qué te preocupa?"), { target: { value: "La plaza no tiene sombra en verano" } });
        const convertir = await screen.findByText("Convertir en propuesta");
        expect(convertir.closest("a")?.getAttribute("href")).toMatch(/^\/decisiones\?nueva=1/);
    });
    it("en l enseña el borrador y la parecida del Ágora para sumarse", async () => {
        render(enMarco("l", <CivicAlchemyWidget />));
        fireEvent.change(await screen.findByLabelText("¿Qué te preocupa?"), { target: { value: "La plaza no tiene sombra en verano" } });
        expect(await screen.findByText(/Borrador \(plantilla/)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole("list", { name: "Propuestas parecidas" })).toBeInTheDocument());
        expect(screen.getByText("Toldos de sombra en la plaza")).toBeInTheDocument();
    });
    it("vacío: nadie lo ha propuesto; error del Ágora: se puede proponer igual", async () => {
        const { unmount } = render(enMarco("l", <CivicAlchemyWidget />));
        fireEvent.change(await screen.findByLabelText("¿Qué te preocupa?"), { target: { value: "Faltan bicicletas compartidas" } });
        expect(await screen.findByText("Nadie lo ha propuesto aún: puede ser la primera.")).toBeInTheDocument();
        unmount();
        __reiniciarCacheB();
        window.localStorage.clear();
        fallar = true;
        render(enMarco("l", <CivicAlchemyWidget />));
        expect(await screen.findByText(/No se pudo mirar el Ágora ahora; puedes proponer igual/)).toBeInTheDocument();
    });
});
