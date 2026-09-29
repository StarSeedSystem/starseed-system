import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B · familia cívica (Ola 0929): Ágora, Gobernanza directa y
// Delegación líquida con datos REALES del motor (Supabase simulado aquí),
// un diseño por tamaño, estados honestos y acciones reales (votar, revocar).
// ════════════════════════════════════════════════════════════════

if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
    });
}

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { widgets: { marco: "libre" }, animations: { enabled: false } } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));

let sesion: { uid: string | null; ready: boolean } = { uid: "u1", ready: true };
vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => sesion }));

// ── Supabase: tablas en memoria con filtros eq/in (lo justo para los cargadores) ──
type Fila = Record<string, any>;
let tablas: Record<string, Fila[]> = {};
let fallar: Set<string> = new Set();
vi.mock("@/utils/supabase/client", () => {
    function consulta(tabla: string) {
        let filas = [...(tablas[tabla] ?? [])];
        const c: any = {
            select: () => c,
            order: () => c,
            limit: () => c,
            is: () => c,
            gt: () => c,
            eq: (col: string, v: unknown) => { filas = filas.filter((f) => !(col in f) || f[col] === v); return c; },
            in: (col: string, vs: unknown[]) => { filas = filas.filter((f) => !(col in f) || vs.includes(f[col])); return c; },
            then: (ok: any, ko: any) => Promise.resolve(fallar.has(tabla) ? { data: null, error: { message: "402" } } : { data: filas, error: null }).then(ok, ko),
        };
        return c;
    }
    return { createClient: () => ({ from: (t: string) => consulta(t) }) };
});

const castVote = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/governance/engine", () => ({ castVote: (...a: unknown[]) => castVote(...(a as [])) }));
const revokeDelegation = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/governance/delegations", () => ({ revokeDelegation: (...a: unknown[]) => revokeDelegation(...(a as [])) }));

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { __reiniciarCacheB, caducado, leerCompartido, TTL_MINIMO_MS } from "../_paquete-b/cache-compartida";
import {
    conVotoLocal, duracionCorta, etiquetaTema, normalizarPropuesta, ordenarAgora, reparto, resumenCivico, tiempoDe, vidaDelegacion,
} from "../_paquete-b/datos-civicos";
import { asientosHemiciclo, recuentoGrupos, sentar } from "../_paquete-b/hemiciclo";
import { AgoraCausalWidget } from "../agora-causal-widget";
import { LiquidDelegationWidget, iniciales } from "../liquid-delegation-widget";
import { PoliticalSummaryWidget } from "../../political-summary-widget";

const H = 3_600_000;
const T0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function semillaTablas() {
    tablas = {
        proposals: [
            { id: "p1", scope: "global", scope_ref: null, title: "Huerto comunitario en la plaza", description: "Convertir el solar en huerto del barrio.", kind: "decision", options: [], params: { votingEndsAt: iso(T0 + 3 * H), threshold: 50, minParticipants: 3 }, status: "open", result: null, created_at: iso(T0 - 45 * H), resolved_at: null },
            { id: "p2", scope: "community", scope_ref: "barrio-norte", title: "Horario de la biblioteca común", description: null, kind: "decision", options: [{ id: "a", label: "Mañanas" }, { id: "b", label: "Tardes" }], params: { votingEndsAt: iso(T0 + 50 * H), threshold: 60, minParticipants: 2 }, status: "open", result: null, created_at: iso(T0 - 10 * H), resolved_at: null },
            { id: "p3", scope: "global", scope_ref: null, title: "Energía solar en el centro social", description: null, kind: "decision", options: [], params: {}, status: "passed", result: { winningChoice: "yes", tally: { counts: { yes: 5, no: 1 }, participants: 6 } }, created_at: iso(T0 - 200 * H), resolved_at: iso(T0 - 100 * H) },
            { id: "j1", scope: "global", scope_ref: null, title: "Consulta judicial", description: null, kind: "impugnacion", options: [], params: {}, status: "open", result: null, created_at: iso(T0 - H), resolved_at: null },
        ],
        proposal_votes: [
            { proposal_id: "p1", voter: "otra", choice: "yes" },
            { proposal_id: "p1", voter: "otro", choice: "no" },
            { proposal_id: "p2", voter: "u1", choice: "a" },
        ],
        vote_delegations: [
            { id: "d1", delegator_user: "u1", delegate_user: "ana", topic: "community:barrio-norte", created_at: iso(T0 - 24 * H), expires_at: iso(T0 + 30 * 24 * H) },
            { id: "d2", delegator_user: "luis", delegate_user: "u1", topic: "global", created_at: iso(T0 - 24 * H), expires_at: iso(T0 + 10 * 24 * H) },
            { id: "d3", delegator_user: "eva", delegate_user: "u1", topic: "global", created_at: iso(T0 - 24 * H), expires_at: iso(T0 + 10 * 24 * H) },
        ],
        profiles: [{ user_id: "ana", display_name: "Ana Lucía Ríos", handle: "ana", avatar_url: null }],
    };
}

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return (
        <ContextoMarco.Provider value={{ acento: "#dc143c", acento2: "#23d5ab", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>
            {ui}
        </ContextoMarco.Provider>
    );
}

beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    sesion = { uid: "u1", ready: true };
    fallar = new Set();
    semillaTablas();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── Puros ─────────────────────────────────────────────────────────────────────
describe("datos cívicos (puros)", () => {
    it("normaliza una propuesta Sí/No con sus voces directas y tu voto", () => {
        const p = normalizarPropuesta(tablas.proposals[0] as any, tablas.proposal_votes as any, "otra");
        expect(p.siNo).toBe(true);
        expect(p.opciones.map((o) => o.id)).toEqual(["yes", "no", "abstain"]);
        expect(p.conteo).toMatchObject({ yes: 1, no: 1, abstain: 0 });
        expect(p.participantes).toBe(2);
        expect(p.miVoto).toBe("yes");
        expect(p.cierra).toBe(T0 + 3 * H);
    });
    it("usa el recuento sellado por el servidor en las cerradas", () => {
        const p = normalizarPropuesta(tablas.proposals[2] as any, [], null);
        expect(p.conteo.yes).toBe(5);
        expect(p.participantes).toBe(6);
        expect(p.ganadora).toBe("yes");
    });
    it("calcula el tiempo que queda y la urgencia", () => {
        const p = normalizarPropuesta(tablas.proposals[0] as any, [], null);
        const t = tiempoDe(p, T0);
        expect(t.abierta).toBe(true);
        expect(t.urgente).toBe(true);
        expect(t.fraccion).toBeGreaterThan(0);
        expect(t.fraccion).toBeLessThan(0.1);
        expect(tiempoDe({ ...p, estado: "passed" }, T0).texto).toBe("cerrada");
        expect(duracionCorta(50 * H)).toBe("2 d 2 h");
        expect(duracionCorta(45 * 60_000)).toBe("45 min");
        expect(duracionCorta(0)).toBe("cierra ya");
    });
    it("resume tu soberanía y ordena por cierre", () => {
        const lista = ordenarAgora(tablas.proposals.slice(0, 3).map((f) => normalizarPropuesta(f as any, tablas.proposal_votes as any, "u1")));
        expect(lista[0].id).toBe("p1");
        const r = resumenCivico(lista, T0);
        expect(r).toMatchObject({ abiertas: 2, porVotar: 1, votadas: 1, aprobadas30: 1 });
        expect(r.proxima?.id).toBe("p1");
    });
    it("aplica tu voto local sin inventar voces", () => {
        const p = normalizarPropuesta(tablas.proposals[1] as any, tablas.proposal_votes as any, "u1");
        const q = conVotoLocal(p, "b");
        expect(q.conteo).toMatchObject({ a: 0, b: 1 });
        expect(q.participantes).toBe(p.participantes);
        expect(reparto(q).find((x) => x.id === "b")?.pct).toBe(1);
    });
    it("etiqueta temas y la vida de una delegación", () => {
        expect(etiquetaTema("community:barrio-norte")).toBe("Comunidad · barrio-norte");
        expect(etiquetaTema("global")).toBe("Toda la red");
        expect(vidaDelegacion({ creada: T0 - 10 * H, caduca: T0 + 10 * H }, T0).fraccion).toBeCloseTo(0.5, 5);
        expect(iniciales("Ana Lucía Ríos")).toBe("AR");
        expect(iniciales("@ana")).toBe("AN");
    });
    it("sienta cada propuesta en el hemiciclo, de izquierda a derecha", () => {
        for (const n of [1, 5, 12, 25, 40]) expect(asientosHemiciclo(n)).toHaveLength(n);
        const a = asientosHemiciclo(12);
        expect(a[0].angulo).toBeGreaterThanOrEqual(a[a.length - 1].angulo);
        const lista = tablas.proposals.slice(0, 3).map((f) => normalizarPropuesta(f as any, tablas.proposal_votes as any, "u1"));
        expect(sentar(lista).map((s) => s.grupo)).toEqual(["aprobada", "votada", "pendiente"]);
        expect(recuentoGrupos(lista)).toMatchObject({ aprobada: 1, votada: 1, pendiente: 1 });
    });
});

describe("caché compartida (contrato de consumo)", () => {
    it("caduca según el TTL y nunca por debajo de 5 min", () => {
        expect(caducado(0, 10 * 60_000)).toBe(true);
        expect(caducado(T0, 60_000, T0 + 2 * 60_000)).toBe(false);
        expect(caducado(T0, 60_000, T0 + TTL_MINIMO_MS)).toBe(true);
    });
    it("dos lectores de la misma clave comparten UNA petición y respetan el TTL", async () => {
        const cargar = vi.fn(async () => 42);
        await Promise.all([leerCompartido("x", cargar), leerCompartido("x", cargar)]);
        await leerCompartido("x", cargar);
        expect(cargar).toHaveBeenCalledTimes(1);
    });
});

// ── Ágora ─────────────────────────────────────────────────────────────────────
describe("Ágora", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("se compone en %s sin romperse y sin la consulta judicial", async (clase) => {
        render(enMarco(clase, <AgoraCausalWidget />));
        await waitFor(() => expect(screen.getAllByText(/Huerto comunitario|por votar|POR VOTAR/i).length).toBeGreaterThan(0));
        expect(screen.queryByText("Consulta judicial")).toBeNull();
    });

    it("en «s» vota Sí con un toque (voto real del motor)", async () => {
        render(enMarco("s", <AgoraCausalWidget />));
        const si = await screen.findByRole("button", { name: /Votar Sí: Huerto comunitario/ });
        await act(async () => { fireEvent.click(si); });
        await waitFor(() => expect(castVote).toHaveBeenCalledWith("p1", "yes"));
    });

    it("en «m» abre el detalle con reparto, quórum y enlace al Ágora", async () => {
        render(enMarco("m", <AgoraCausalWidget />));
        const fila = await screen.findByRole("button", { name: /Huerto comunitario en la plaza.*Abrir detalle/ });
        fireEvent.click(fila);
        expect(await screen.findByRole("button", { name: "Volver a la lista" })).toBeInTheDocument();
        expect(screen.getByText(/Quórum 2\/3/)).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Tu voto" })).toBeInTheDocument();
        expect(screen.getByText("Abrir en el Ágora").closest("a")).toHaveAttribute("href", "/network/politics");
    });

    it("en «l» filtra por pestañas y en «xl» muestra el detalle a la vez", async () => {
        const { unmount } = render(enMarco("l", <AgoraCausalWidget />));
        expect(await screen.findByRole("radiogroup", { name: "Filtrar propuestas" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("radio", { name: /Resueltas/ }));
        expect(await screen.findByText("Energía solar en el centro social")).toBeInTheDocument();
        unmount();
        __reiniciarCacheB();
        render(enMarco("xl", <AgoraCausalWidget />));
        expect(await screen.findByRole("region", { name: "Detalle de la propuesta" })).toBeInTheDocument();
    });

    it("sin sesión invita a entrar para votar", async () => {
        sesion = { uid: null, ready: true };
        render(enMarco("m", <AgoraCausalWidget />));
        fireEvent.click(await screen.findByRole("button", { name: /Huerto comunitario.*Abrir detalle/ }));
        expect(screen.getByText("Entra para votar").closest("a")).toHaveAttribute("href", "/login");
    });

    it("vacío honesto con «Proponer» cuando no hay propuestas", async () => {
        tablas.proposals = [];
        render(enMarco("m", <AgoraCausalWidget />));
        expect(await screen.findByText("El Ágora está en calma")).toBeInTheDocument();
        expect(screen.getByText("Proponer").closest("a")).toHaveAttribute("href", "/decisiones?nueva=1");
    });

    it("error honesto con reintento si la red falla", async () => {
        fallar = new Set(["proposals"]);
        render(enMarco("m", <AgoraCausalWidget />));
        expect(await screen.findByText("No se pudo leer el Ágora ahora mismo.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });
});

// ── Gobernanza directa ────────────────────────────────────────────────────────
describe("Gobernanza directa", () => {
    it.each(["s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("dibuja el hemiciclo real en %s", async (clase) => {
        render(enMarco(clase, <PoliticalSummaryWidget />));
        expect(await screen.findByRole("img", { name: /Hemiciclo de 3 decisiones: 2 en votación, 1 te faltan/ })).toBeInTheDocument();
    });
    it("en micro dice cuántas te faltan y en l trae la leyenda y «Votar ahora»", async () => {
        const { unmount } = render(enMarco("micro", <PoliticalSummaryWidget />));
        expect(await screen.findByRole("link", { name: /te faltan 1/ })).toHaveAttribute("href", "/network/politics");
        unmount();
        render(enMarco("l", <PoliticalSummaryWidget />));
        expect(await screen.findByRole("list", { name: "Leyenda del hemiciclo" })).toBeInTheDocument();
        expect(screen.getByText("Votar ahora").closest("a")).toHaveAttribute("href", "/network/politics");
    });
    it("vacío honesto sin decisiones", async () => {
        tablas.proposals = [];
        render(enMarco("m", <PoliticalSummaryWidget />));
        expect(await screen.findByText("Aún no hay decisiones en tu red")).toBeInTheDocument();
    });
});

// ── Delegación líquida ───────────────────────────────────────────────────────
describe("Delegación líquida", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("pinta el grafo real en %s", async (clase) => {
        render(enMarco(clase, <LiquidDelegationWidget />));
        expect((await screen.findAllByRole("img", { name: /Delegas tu voz en 1 tema · te confían 2 voces/ })).length).toBeGreaterThan(0);
    });
    it("recuperar tu voz pide confirmación y revoca de verdad", async () => {
        render(enMarco("m", <LiquidDelegationWidget />));
        fireEvent.click(await screen.findByRole("button", { name: /Recuperar tu voz en Comunidad · barrio-norte/ }));
        const revocar = screen.getByRole("button", { name: "Revocar" });
        await act(async () => { fireEvent.click(revocar); });
        await waitFor(() => expect(revokeDelegation).toHaveBeenCalledWith("d1"));
        expect(await screen.findByText(/vuelve a ser directa/)).toBeInTheDocument();
    });
    it("sin delegaciones: votas directo en todo (vacío honesto con CTA)", async () => {
        tablas.vote_delegations = [];
        render(enMarco("m", <LiquidDelegationWidget />));
        expect((await screen.findAllByText("Votas directo en todo")).length).toBeGreaterThan(0);
        expect(screen.getByText("Delegar un tema").closest("a")).toHaveAttribute("href", "/decisiones");
    });
    it("sin sesión invita a entrar", async () => {
        sesion = { uid: null, ready: true };
        render(enMarco("m", <LiquidDelegationWidget />));
        expect(await screen.findByText("Tu voz es tuya")).toBeInTheDocument();
    });
});
