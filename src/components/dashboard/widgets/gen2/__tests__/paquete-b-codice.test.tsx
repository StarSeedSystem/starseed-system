import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929) · Códice akáshico con TU registro real: recuentos
// sin traer filas (archivos, memorias, cerebros, baúles) y lo último guardado.
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

let tablas: Record<string, any[]> = {};
let rotas = new Set<string>();
vi.mock("@/utils/supabase/client", () => {
    function consulta(tabla: string) {
        const c: any = {
            select: () => c, eq: () => c, order: () => c, limit: () => c,
            then: (ok: any, ko: any) => Promise.resolve(rotas.has(tabla) ? { data: null, error: { message: "404" }, count: null } : { data: tablas[tabla] ?? [], error: null, count: (tablas[tabla] ?? []).length }).then(ok, ko),
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
import { AkashicCodexWidget, iconoMime, totalCodice } from "../akashic-codex-widget";

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento: "#e0a43a", acento2: "#23d5ab", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

const ahora = new Date().toISOString();
beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    sesion = { uid: "u1", ready: true };
    rotas = new Set(["memories"]);
    tablas = {
        os_files: [{ name: "plano-huerto.pdf", mime: "application/pdf", created_at: ahora }, { name: "asamblea.jpg", mime: "image/jpeg", created_at: ahora }],
        brains: [{ id: "b1" }],
        vaults: [{ id: "v1" }, { id: "v2" }],
    };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("códice (puros)", () => {
    it("suma lo que hay y sabe el icono de cada archivo", () => {
        expect(totalCodice({ cuentas: { archivos: 2, memorias: null, cerebros: 1, baules: 2 } })).toBe(5);
        expect(iconoMime("image/png").displayName ?? "img").toBeTruthy();
        expect(iconoMime(null)).toBe(iconoMime("application/pdf"));
    });
});

describe("Códice akáshico", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("cuenta tu registro real en %s", async (clase) => {
        render(enMarco(clase, <AkashicCodexWidget />));
        expect((await screen.findAllByLabelText(/Guardas 5 entidades: 2 archivos, sin dato memorias, 1 cerebros, 2 baúles/)).length).toBeGreaterThan(0);
    });
    it("en l lleva cada tipo a su casa y enseña los últimos archivos", async () => {
        render(enMarco("l", <AkashicCodexWidget />));
        expect(await screen.findByRole("link", { name: "Baúles: 2. Abrir" })).toHaveAttribute("href", "/baules");
        expect(screen.getByText("plano-huerto.pdf")).toBeInTheDocument();
    });
    it("sin sesión invita a entrar; vacío honesto si no hay nada", async () => {
        sesion = { uid: null, ready: true };
        const { unmount } = render(enMarco("m", <AkashicCodexWidget />));
        expect(await screen.findByText("Tu registro es tuyo")).toBeInTheDocument();
        unmount();
        __reiniciarCacheB();
        sesion = { uid: "u1", ready: true };
        tablas = {};
        render(enMarco("m", <AkashicCodexWidget />));
        expect(await screen.findByText("Tu registro está por escribir")).toBeInTheDocument();
    });
    it("error honesto si no se puede leer nada", async () => {
        rotas = new Set(["os_files", "memories", "brains", "vaults"]);
        render(enMarco("m", <AkashicCodexWidget />));
        expect(await screen.findByText("No se pudo leer tu registro ahora.")).toBeInTheDocument();
    });
});
