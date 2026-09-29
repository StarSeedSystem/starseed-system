import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

// ── Tamaño medido forzado ──
let medida = { width: 380, height: 325 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
let ubicacion: any = null;
vi.mock("@/modules/weather/context/weather-location-context", () => ({
    useWeatherLocationOpcional: () => ubicacion,
    WeatherLocationProvider: ({ children }: any) => children,
}));

// ── Sesión local y tablas de la nube simuladas (sin red) ──
let usuario: any = null;
vi.mock("@/lib/consumo/usuario", () => ({
    usuarioActual: async () => usuario,
    uidActual: async () => usuario?.id ?? null,
    uidEnCache: () => usuario?.id ?? null,
    usuarioVerificado: async () => usuario,
}));
let tablas: Record<string, any[]> = {};
let fallo: string | null = null;
const peticiones: string[] = [];
function constructor(tabla: string): any {
    const b: any = new Proxy(function () {}, {
        get: (_t, p) => (p === "then"
            ? (ok: any) => ok(fallo ? { data: null, error: { message: fallo } } : { data: tablas[tabla] ?? [], error: null })
            : b),
        apply: () => b,
    });
    return b;
}
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: (t: string) => { peticiones.push(t); return constructor(t); },
        auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel() {},
    }),
}));

import { EnMarco, MEDIDAS } from "../../gen5/_catalogo/prueba-marco";
import { _vaciarCompartidos } from "../../gen5/_catalogo/recurso";
import { IdentityVaultWidget } from "../identity-vault-widget";

function pintar(ui: React.ReactElement, clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase} acento="#94a3b8">{ui}</EnMarco>);
}

beforeEach(() => {
    localStorage.clear();
    _vaciarCompartidos();
    ubicacion = null;
    usuario = null;
    tablas = {};
    fallo = null;
    peticiones.length = 0;
});
afterEach(() => { cleanup(); });

const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("Bóveda de Identidad", () => {
    it.each(TODAS)("sin sesión (%s) lo dice y ofrece entrar, sin pedir nada a la nube", async (clase) => {
        pintar(<IdentityVaultWidget />, clase);
        expect(await screen.findByRole("region", { name: /sin sesión/ })).toBeTruthy();
        if (clase !== "micro") expect(screen.getByRole("link", { name: /Entrar/ }).getAttribute("href")).toBe("/login?next=/dashboard");
        expect(peticiones).toHaveLength(0);
    });
    it.each(TODAS)("con sesión y facetas (%s) enseña la faceta en uso", async (clase) => {
        usuario = { id: "u1", email: "alexbordon@gmail.com", app_metadata: { provider: "google" }, created_at: "2025-11-02T10:00:00Z" };
        tablas.os_account_profiles = [
            { id: "p1", name: "Alex Bordón", handle: "alex", visibility: "public", is_default: true },
            { id: "p2", name: "Taller de sonido", visibility: "contacts", is_default: false },
        ];
        pintar(<IdentityVaultWidget />, clase);
        expect(await screen.findByRole("region", { name: /2 facetas \(1 pública\), usando «Alex Bordón»/ })).toBeTruthy();
    });
    it("cambia la faceta de este dispositivo y la recuerda en local", async () => {
        usuario = { id: "u1", email: "a@b.c" };
        tablas.os_account_profiles = [
            { id: "p1", name: "Alex Bordón", visibility: "public", is_default: true },
            { id: "p2", name: "Taller de sonido", visibility: "contacts" },
        ];
        pintar(<IdentityVaultWidget />, "xl");
        fireEvent.click(await screen.findByRole("button", { name: "Usar la faceta Taller de sonido en este dispositivo" }));
        expect(localStorage.getItem("starseed.profile.active.v1")).toBe("p2");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/usando «Taller de sonido»/);
    });
    it("la lectura de facetas es UNA y se comparte entre instancias", async () => {
        usuario = { id: "u1", email: "a@b.c" };
        tablas.os_account_profiles = [{ id: "p1", name: "Alex", visibility: "public", is_default: true }];
        pintar(<><IdentityVaultWidget /><IdentityVaultWidget /></>, "l");
        await screen.findAllByRole("region", { name: /1 faceta / });
        expect(peticiones.filter((t) => t === "os_account_profiles")).toHaveLength(1);
    });
    it("sin facetas invita a crear el perfil; si la fuente falla, lo dice con reintento", async () => {
        usuario = { id: "u1", email: "a@b.c" };
        pintar(<IdentityVaultWidget />, "m");
        expect(await screen.findByText(/aún no tiene facetas/)).toBeTruthy();
        cleanup();
        _vaciarCompartidos();
        localStorage.clear();
        fallo = "Failed to fetch";
        pintar(<IdentityVaultWidget />, "m");
        expect(await screen.findByRole("alert")).toBeTruthy();
    });
});
