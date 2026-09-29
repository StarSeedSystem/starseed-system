import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929): Nodo soberano (este dispositivo medido + tus
// neuronas reales), Córtex Astraura (avisos derivados de datos reales +
// los cinco sistemas de la neurona) y Portales de inmersión (rutas reales
// del OS + capacidades XR del dispositivo). Un diseño por tamaño.
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
let sesion: { uid: string | null; ready: boolean } = { uid: "u1", ready: true };
vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => sesion }));

let neuronas: any[] = [];
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: async () => neuronas }));
vi.mock("@/lib/astraura/neuron-persona-systems", () => ({
    ALL_PERSONAS: [],
    resolvePersonaSystems: () => ({
        llm: { modelo: "Astraura 1.58", fuente: "local" },
        astraura: { modo: "auto" },
        voz: { motor: "Kokoro" },
        cerebro: { usarMemorias: true, almacen: "auto" },
        senales: { porAntena: { lora: { enabled: true, salida: true } } },
    }),
    subscribeNeuronPersona: () => () => undefined,
}));
const abrirConfig = vi.fn();
vi.mock("@/lib/astraura/config-ui", () => ({ openAstrauraConfig: (t: string) => abrirConfig(t) }));

type Fila = Record<string, any>;
let tablas: Record<string, Fila[]> = {};
vi.mock("@/utils/supabase/client", () => {
    function consulta(tabla: string) {
        let filas = [...(tablas[tabla] ?? [])];
        const c: any = {
            select: () => c, order: () => c, limit: () => c, is: () => c, gt: () => c,
            eq: (col: string, v: unknown) => { filas = filas.filter((f) => !(col in f) || f[col] === v); return c; },
            in: (col: string, vs: unknown[]) => { filas = filas.filter((f) => !(col in f) || vs.includes(f[col])); return c; },
            then: (ok: any, ko: any) => Promise.resolve({ data: filas, error: null }).then(ok, ko),
        };
        return c;
    }
    return { createClient: () => ({ from: (t: string) => consulta(t) }) };
});

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { __reiniciarCacheB } from "../_paquete-b/cache-compartida";
import { calidadRed, gb, leerAgente, usoAlmacen } from "../_paquete-b/datos-nodo";
import { avisosCortex } from "../_paquete-b/cortex";
import { normalizarPropuesta } from "../_paquete-b/datos-civicos";
import { SovereignNodeWidget } from "../sovereign-node-widget";
import { AstrauraCortexWidget } from "../astraura-cortex-widget";
import { ImmersionPortalWidget, PORTALES, modoPortal } from "../immersion-portal-widget";

const H = 3_600_000;
const T0 = Date.now();

function enMarco(clase: ClaseTamano, ui: React.ReactElement, acento = "#94a3b8") {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento, acento2: "#23d5ab", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    sesion = { uid: "u1", ready: true };
    neuronas = [
        { id: "n1", name: "Mac de Alex", kind: "laptop", online: true, isThisDevice: true, capabilities: {} },
        { id: "n2", name: "Móvil", kind: "mobile", online: false, isThisDevice: false, capabilities: { ollama: true } },
    ];
    Object.defineProperty(navigator, "storage", { configurable: true, value: { estimate: async () => ({ usage: 2e9, quota: 8e9 }) } });
    Object.defineProperty(navigator, "getBattery", { configurable: true, value: async () => ({ level: 0.8, charging: true, addEventListener: () => undefined, removeEventListener: () => undefined }) });
    tablas = {
        proposals: [
            { id: "p1", scope: "global", scope_ref: null, title: "Huerto comunitario", description: null, kind: "decision", options: [], params: { votingEndsAt: new Date(T0 + 2 * H).toISOString() }, status: "open", result: null, created_at: new Date(T0 - 20 * H).toISOString() },
        ],
        proposal_votes: [],
        vote_delegations: [{ id: "d1", delegator_user: "u1", delegate_user: "ana", topic: "global", created_at: new Date(T0 - 80 * 24 * H).toISOString(), expires_at: new Date(T0 + 30 * H).toISOString() }],
        profiles: [{ user_id: "ana", display_name: "Ana", handle: "ana", avatar_url: null, id: "pf1" }],
        seed_market: [], grain_types: [], badges: [], profile_badges: [],
    };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("nodo (puros)", () => {
    it("lee el agente, el uso de almacén y la calidad de red", () => {
        expect(leerAgente("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148.0 Safari/537.36")).toEqual({ plataforma: "macOS", navegador: "Chrome 148" });
        expect(usoAlmacen({ almacenUsadoGb: 2, almacenCuotaGb: 8 })).toBe(0.25);
        expect(usoAlmacen({ almacenUsadoGb: null, almacenCuotaGb: 8 })).toBeNull();
        expect(calidadRed({ enLinea: false, conexion: null })).toBe(0);
        expect(calidadRed({ enLinea: true, conexion: { tipo: "4g", bajadaMbps: 10, latenciaMs: 50, ahorro: false } })).toBe(0.5);
        expect(gb(0.25)).toBe("250 MB");
    });
});

describe("Nodo soberano", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("mide este dispositivo y cuenta tus neuronas en %s", async (clase) => {
        render(enMarco(clase, <SovereignNodeWidget />));
        expect((await screen.findAllByRole("img", { name: /1 de 2 neuronas en línea/ })).length).toBeGreaterThan(0);
    });
    it("en l lista tus neuronas con su estado y el almacén real", async () => {
        render(enMarco("l", <SovereignNodeWidget />));
        expect(await screen.findByRole("list", { name: "Tus neuronas" })).toBeInTheDocument();
        expect(screen.getByText("Mac de Alex")).toBeInTheDocument();
        expect(screen.getByText(/dormida · IA/)).toBeInTheDocument();
        expect(await screen.findByText("25 %")).toBeInTheDocument();
        expect(screen.getByText("Neuronas").closest("a")).toHaveAttribute("href", "/cuenta");
    });
});

describe("Córtex (puros)", () => {
    it("deriva avisos reales y ordena por urgencia", () => {
        const agora = { uid: "u1", propuestas: [normalizarPropuesta(tablas.proposals[0] as any, [], "u1")] };
        const delegacion = { uid: "u1", dadas: [{ id: "d1", tema: "global", temaEtiqueta: "Toda la red", delegado: { id: "ana", nombre: "Ana", handle: "ana", avatar: null }, creada: T0 - 80 * 24 * H, caduca: T0 + 30 * H }], recibidas: [], totalRecibidas: 0 };
        const avisos = avisosCortex({ agora, delegacion, mercado: { serie: [{ dia: "a", eur: 1 }, { dia: "b", eur: 1.1 }], granos: [] } }, T0);
        expect(avisos.map((a) => a.tipo)).toEqual(["voto", "delegacion", "mercado"]);
        expect(avisos[0].prioridad).toBe(0);
        expect(avisosCortex({}, T0)).toEqual([]);
    });
});

describe("Córtex Astraura", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("muestra avisos reales en %s", async (clase) => {
        render(enMarco(clase, <AstrauraCortexWidget />, "#22d3ee"));
        await waitFor(() => expect(screen.getAllByText(/Te falta una votación|avisos de tu exocórtex|2/).length).toBeGreaterThan(0));
    });
    it("en l descarta un aviso y abre la configuración de un sistema", async () => {
        render(enMarco("l", <AstrauraCortexWidget />, "#22d3ee"));
        const descartar = await screen.findByRole("button", { name: /Descartar: Te falta una votación/ });
        fireEvent.click(descartar);
        expect(screen.queryByText("Te falta una votación")).toBeNull();
        fireEvent.click(await screen.findByRole("button", { name: /LLM/ }));
        await waitFor(() => expect(abrirConfig).toHaveBeenCalledWith("llm"));
    });
    it("todo en calma cuando no hay nada que atender (vacío honesto)", async () => {
        tablas.proposals = [];
        tablas.vote_delegations = [];
        render(enMarco("m", <AstrauraCortexWidget />, "#22d3ee"));
        expect(await screen.findByText(/Todo en calma: no te falta ninguna votación/)).toBeInTheDocument();
    });
});

describe("Portales de inmersión", () => {
    it("dice qué permite cada portal en este dispositivo", () => {
        expect(modoPortal({ xr: true }, { vr: true, ar: false, webgl2: true, webgpu: false })).toBe("listo para VR");
        expect(modoPortal({ xr: false }, { vr: true, ar: false, webgl2: true, webgpu: false })).toBe("en 3D en la pantalla");
        expect(modoPortal({}, null)).toBe("comprobando el visor…");
    });
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("abre rutas reales del OS en %s", async (clase) => {
        render(enMarco(clase, <ImmersionPortalWidget />, "#d946ef"));
        const enlaces = await screen.findAllByRole("link");
        const rutas = new Set(PORTALES.map((p) => p.ruta));
        expect(enlaces.every((a) => rutas.has(a.getAttribute("href") ?? ""))).toBe(true);
    });
    it("recuerda el último portal y lo pone primero", async () => {
        const { unmount } = render(enMarco("m", <ImmersionPortalWidget />, "#d946ef"));
        fireEvent.click(await screen.findByRole("link", { name: /Salas XR/ }));
        unmount();
        render(enMarco("micro", <ImmersionPortalWidget />, "#d946ef"));
        expect(await screen.findByRole("link", { name: "Abrir Salas XR" })).toHaveAttribute("href", "/sala-xr");
    });
});
