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

let contactos: { listo: boolean; contactos: any[]; error: string | null } = { listo: true, contactos: [], error: null };
vi.mock("@/lib/contactos/store", () => ({ useContactos: () => ({ ...contactos, sinSesion: false, categorias: [], listas: [] }) }));
const asignar = vi.fn((ctx: any, id: string | null) => {
    const a = JSON.parse(localStorage.getItem("starseed.aurora.personality.active.v1") || '{"porSeccion":{}}');
    a.porSeccion[ctx.seccion] = id ?? undefined;
    localStorage.setItem("starseed.aurora.personality.active.v1", JSON.stringify(a));
});
vi.mock("@/lib/aurora/personalities", () => ({ setActivePersonality: asignar }));

const consultar = vi.fn(async (input: any, op: any) => {
    op?.onProgress?.("Dictamen", 5, 6);
    return {
        topic: input.title, at: 1, ms: 10, failed: 1, singleSource: true, sourcesUsed: ["Fuente libre"], reviews: [],
        opinions: ["ontocratico", "ecologico", "abundancia", "simbiotico", "empatico"].map((id, i) => ({ perspective: { id }, ok: i !== 3, verdict: i % 2 ? "con_enmiendas" : "a_favor", sourceLabel: "Fuente libre" })),
        synthesis: { ok: true, verdict: "con_enmiendas", text: "Apoyo con dos enmiendas: priorizar a quien no tiene placas." },
    };
});
vi.mock("@/lib/aurora/council", () => ({ consultCouncil: consultar }));

import { EnMarco, MEDIDAS } from "../../gen5/_catalogo/prueba-marco";
import { _vaciarCompartidos } from "../../gen5/_catalogo/recurso";
import { IdentityVaultWidget } from "../identity-vault-widget";
import { UniversalLibraryWidget } from "../universal-library-widget";
import { MentorMatchWidget } from "../mentor-match-widget";
import { ElderCouncilWidget } from "../elder-council-widget";
import { CONSEJEROS } from "../elder-council-partes";

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

describe("Biblioteca Universal", () => {
    it.each(TODAS)("vacía (%s): lo dice con el recuento real del catálogo y ofrece explorar", async (clase) => {
        pintar(<UniversalLibraryWidget />, clase);
        const region = await screen.findByRole("region", { name: /0 elementos en tu biblioteca .* de \d+ paquetes del catálogo/ }, { timeout: 4000 });
        expect(region).toBeTruthy();
        if (clase !== "micro") expect(screen.getByRole("link", { name: /Explorar/ }).getAttribute("href")).toBe("/library?tab=destacado");
    });
    it("con recursos guardados e instalados, los pone en la estantería y busca en el catálogo", async () => {
        const t = Date.now();
        localStorage.setItem("starseed.library.saved", JSON.stringify([{ id: "s1", kind: "articulo", title: "Constitución comentada", url: "/info/constitution", savedAt: t }]));
        localStorage.setItem("starseed.library.installed.v1", JSON.stringify({ "app-red-mesh": { installedAt: t - 10, version: "1", kind: "app" } }));
        pintar(<UniversalLibraryWidget />, "xl");
        await screen.findByRole("region", { name: /2 elementos en tu biblioteca \(1 guardados, 1 instalados\)/ }, { timeout: 4000 });
        expect(screen.getByRole("img", { name: /Estantería con 2 elementos/ })).toBeTruthy();
        expect(screen.getByText("Constitución comentada").closest("a")!.getAttribute("href")).toBe("/info/constitution");
        fireEvent.change(screen.getByRole("textbox", { name: /Buscar en el catálogo/ }), { target: { value: "mesh" } });
        expect(screen.getByRole("list", { name: "Resultados del catálogo" }).textContent).toMatch(/instalado/);
        fireEvent.change(screen.getByRole("textbox", { name: /Buscar en el catálogo/ }), { target: { value: "zzqqxx" } });
        expect(screen.getByText(/resultado vacío/)).toBeTruthy();
    });
    it.each(["s", "m", "l", "panoramico", "torre"] as ClaseTamano[])("con cosas se pinta en %s", async (clase) => {
        localStorage.setItem("starseed.library.saved", JSON.stringify([{ id: "s1", kind: "app", title: "Red 3D", url: "/red-3d", savedAt: 1 }]));
        pintar(<UniversalLibraryWidget />, clase);
        expect(await screen.findByRole("region", { name: /1 elementos en tu biblioteca/ }, { timeout: 4000 })).toBeTruthy();
    });
});

const persona = (id: string, nombre: string, extra: object = {}) => ({ id, nombre, relacion: "mentoria", favorito: false, actualizado: "2026-09-01T00:00:00Z", telefonos: [], correos: [], enlaces: [], categorias: [], listas: [], ...extra });

describe("Mentoría Híbrida", () => {
    beforeEach(() => { contactos = { listo: true, contactos: [], error: null }; asignar.mockClear(); });
    it.each(TODAS)("sin mentores (%s): lo dice y ofrece añadir, con la mentora IA siempre a mano", async (clase) => {
        pintar(<MentorMatchWidget />, clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/0 personas mentoras/);
        if (["m", "l", "xl", "panoramico", "torre"].includes(clase)) {
            expect(screen.getByRole("link", { name: /Añadir en Contactos/ }).getAttribute("href")).toBe("/contactos?nuevo=1");
        }
    });
    it("lista tus contactos de mentoría (favorito primero) con su ficha y el mensaje directo", () => {
        contactos.contactos = [
            persona("c1", "Sol Herrera", { actualizado: "2026-09-09T00:00:00Z" }),
            persona("c2", "Naima Solá", { favorito: true, username: "naima", relacionDetalle: "Mediación" }),
            { ...persona("c3", "Ana Amiga"), relacion: "amistad" },
        ];
        pintar(<MentorMatchWidget />, "xl");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/2 personas mentoras, destaca Naima Solá/);
        expect(screen.getByRole("link", { name: "Abrir la ficha de Naima Solá" }).getAttribute("href")).toBe("/contactos?c=c2");
        expect(screen.getByRole("link", { name: "Escribir a Naima Solá" }).getAttribute("href")).toBe("/messages?to=naima");
        expect(screen.queryByText("Ana Amiga")).toBeNull();
    });
    it("enciende y apaga a Aurora como mentora de Educación", async () => {
        pintar(<MentorMatchWidget />, "l");
        fireEvent.click(screen.getByRole("button", { name: "Hacer de Aurora tu mentora en Educación" }));
        await screen.findByRole("button", { name: "Quitar a Aurora el modo mentora en Educación" });
        expect(asignar).toHaveBeenCalledWith({ scope: "seccion", seccion: "educacion" }, "preset-mentora-sabia");
    });
    it("mientras la libreta carga, lo dice", () => {
        contactos.listo = false;
        pintar(<MentorMatchWidget />, "m");
        expect(screen.getByText("Cargando tu libreta…")).toBeTruthy();
    });
});

describe("Consejo de Sabios", () => {
    it.each(TODAS)("sin consultas (%s) la mesa espera tu pregunta", (clase) => {
        pintar(<ElderCouncilWidget />, clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/aún no has consultado/);
    });
    it("convoca al Consejo real, guarda el informe resumido y ofrece llevarlo a propuesta", async () => {
        pintar(<ElderCouncilWidget />, "xl");
        fireEvent.change(screen.getByRole("textbox", { name: /Pregunta o propuesta/ }), { target: { value: "Reparto del excedente solar" } });
        fireEvent.submit(screen.getByRole("textbox", { name: /Pregunta o propuesta/ }).closest("form")!);
        expect(await screen.findByText("Con enmiendas", { selector: "p" })).toBeTruthy();
        expect(consultar).toHaveBeenCalledWith({ title: "Reparto del excedente solar" }, expect.objectContaining({ review: false }));
        expect(screen.getByText(/Una sola fuente razonó las cinco voces \(Fuente libre\) · 1 dictamen sin respuesta/)).toBeTruthy();
        expect(screen.getByRole("link", { name: /Llevar «Reparto del excedente solar» a una propuesta/ }).getAttribute("href")).toMatch(/^\/decisiones\?nueva=1/);
        expect(JSON.parse(localStorage.getItem("starseed.consejo.ultimo.v1")!).dictamenes).toHaveLength(5);
    });
    it("si ningún consejero responde, lo dice como error", async () => {
        consultar.mockImplementationOnce(async (input: any) => ({ topic: input.title, at: 1, ms: 1, failed: 5, singleSource: true, sourcesUsed: [], reviews: [],
            opinions: CONSEJEROS.map((k) => ({ perspective: { id: k.id }, ok: false, verdict: "indeterminado" })), synthesis: { ok: false, verdict: "indeterminado", text: "" } }));
        pintar(<ElderCouncilWidget />, "l");
        fireEvent.change(screen.getByRole("textbox", { name: /Pregunta o propuesta/ }), { target: { value: "¿Algo?" } });
        fireEvent.submit(screen.getByRole("textbox", { name: /Pregunta o propuesta/ }).closest("form")!);
        expect(await screen.findByRole("alert")).toBeTruthy();
    });
});
