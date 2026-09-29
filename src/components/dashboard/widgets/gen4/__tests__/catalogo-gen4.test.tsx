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
const empujar = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: empujar, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }) }));
const crearEscena = vi.fn(async (titulo: string): Promise<any> => ({ refId: "e-nueva", ruta: `/escena/e-nueva?t=${titulo.length}` }));
vi.mock("@/lib/vivo/escena3d", () => ({ crearVivoEscena3d: crearEscena }));
const crearDoc = vi.fn(async (titulo: string): Promise<any> => ({ refId: "d-nuevo", ruta: "/documento/d-nuevo" }));
const crearPres = vi.fn(async (titulo: string): Promise<any> => { throw new Error("No se pudo crear. Inicia sesión e inténtalo de nuevo."); });
vi.mock("@/lib/vivo/documento", () => ({ crearVivoDocumento: crearDoc }));
vi.mock("@/lib/vivo/presentacion", () => ({ crearVivoPresentacion: crearPres }));
vi.mock("@/lib/vivo/tabla", () => ({ crearVivoTabla: vi.fn() }));
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

const consultar = vi.fn(async (input: any, op?: any): Promise<any> => {
    op?.onProgress?.("Dictamen", 5, 6);
    return {
        topic: input.title, at: 1, ms: 10, failed: 1, singleSource: true, sourcesUsed: ["Fuente libre"], reviews: [],
        opinions: ["ontocratico", "ecologico", "abundancia", "simbiotico", "empatico"].map((id, i) => ({ perspective: { id }, ok: i !== 3, verdict: i % 2 ? "con_enmiendas" : "a_favor", sourceLabel: "Fuente libre" })),
        synthesis: { ok: true, verdict: "con_enmiendas", text: "Apoyo con dos enmiendas: priorizar a quien no tiene placas." },
    };
});
vi.mock("@/lib/aurora/council", () => ({ consultCouncil: consultar }));

let casosRed: { list: any[]; degraded: boolean } = { list: [], degraded: false };
const cargarCasos = vi.fn(async () => casosRed);
const crearCaso = vi.fn(async (input: any): Promise<any> => {
    const nuevo = { id: "med-n", title: input.title, description: "", participants: input.participants, facilitator: null, stage: "solicitada", createdAt: "2026-09-29T10:00:00Z", updates: [] };
    casosRed = { list: [nuevo, ...casosRed.list], degraded: false };
    localStorage.setItem("starseed.politics.mediation.v1", JSON.stringify(casosRed.list));
    return { ok: true, degraded: false };
});
let comunes: any[] = [];
let falloComunes = false;
const cargarComunes = vi.fn(async () => { if (falloComunes) throw new Error("sin red"); return { list: comunes, degraded: false }; });
const guardarComun = vi.fn(async (input: any): Promise<any> => {
    const i = comunes.findIndex((r) => r.id === input.id);
    const e = { ...input, updatedAt: "2026-09-29T10:00:00Z" };
    comunes = i < 0 ? [...comunes, e] : comunes.map((r, k) => (k === i ? e : r));
    return { ok: true, degraded: false };
});
vi.mock("@/lib/governance/political", () => ({
    loadMediationCases: cargarCasos, createMediationCase: crearCaso,
    loadCommonsResources: cargarComunes, upsertCommonsResource: guardarComun, labelForUser: async () => "Alex",
}));

import { EnMarco, MEDIDAS } from "../../gen5/_catalogo/prueba-marco";
import { _vaciarCompartidos } from "../../gen5/_catalogo/recurso";
import { IdentityVaultWidget } from "../identity-vault-widget";
import { UniversalLibraryWidget } from "../universal-library-widget";
import { MentorMatchWidget } from "../mentor-match-widget";
import { ElderCouncilWidget } from "../elder-council-widget";
import { CONSEJEROS } from "../elder-council-partes";
import { RestorativeCourtWidget } from "../restorative-court-widget";
import { MultiverseHubWidget } from "../multiverse-hub-widget";
import { CreativeStudioWidget } from "../creative-studio-widget";
import { BarterMarketWidget } from "../barter-market-widget";

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

const caso = (id: string, title: string, stage: string, extra: any = {}) => ({ id, title, description: "", participants: ["Ana", "Luis"], facilitator: null, stage, createdAt: "2026-09-20T10:00:00Z", updates: [], ...extra });

describe("Círculos de Paz", () => {
    beforeEach(() => { casosRed = { list: [], degraded: false }; cargarCasos.mockClear(); crearCaso.mockClear(); });

    it.each(TODAS)("sin casos (%s) lo dice y no inventa ninguno", async (clase) => {
        pintar(<RestorativeCourtWidget />, clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/0 abiertos y 0 con acuerdo/);
        await vi.waitFor(() => expect(cargarCasos).toHaveBeenCalledTimes(1));
    });

    it("pinta los casos reales de la red, abiertos primero, y pasa de uno a otro", async () => {
        casosRed = { list: [caso("m3", "Reparto de la leña", "acuerdo"), caso("m1", "Uso del huerto comunal", "en_circulo", { facilitator: "Naima" }), caso("m2", "Ruido en el taller", "solicitada")], degraded: false };
        pintar(<RestorativeCourtWidget />, "xl");
        const region = await screen.findByRole("region", { name: /2 abiertos y 1 con acuerdo\. «Uso del huerto comunal»: en círculo de paz/ });
        expect(region).toBeTruthy();
        expect(screen.getByText(/facilita Naima/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Caso siguiente" }));
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/«Ruido en el taller»: solicitud recibida/);
        fireEvent.click(screen.getByRole("button", { name: /Reparto de la leña/ }));
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/«Reparto de la leña»: acuerdo alcanzado/);
        expect(screen.getByRole("link", { name: /Área Política/ }).getAttribute("href")).toBe("/network/politics");
    });

    it("pide un Círculo de Paz de verdad con sus participantes", async () => {
        pintar(<RestorativeCourtWidget />, "l");
        fireEvent.click(screen.getByRole("button", { name: "Pedir un Círculo de Paz" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Título del caso" }), { target: { value: "Turnos del horno comunal" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Participantes" }), { target: { value: "Ana, Luis; Ana" } });
        fireEvent.submit(screen.getByRole("form", { name: "Pedir un Círculo de Paz" }));
        expect(await screen.findByText(/Círculo de Paz pedido/)).toBeTruthy();
        expect(crearCaso).toHaveBeenCalledWith({ title: "Turnos del horno comunal", description: "", participants: ["Ana", "Luis"] });
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/1 abierto y 0 con acuerdo\. «Turnos del horno comunal»/);
    });

    it("sin red enseña la copia local y lo avisa", async () => {
        localStorage.setItem("starseed.politics.mediation.v1", JSON.stringify([caso("m1", "Uso del huerto comunal", "facilitador_asignado")]));
        casosRed = { list: [caso("m1", "Uso del huerto comunal", "facilitador_asignado")], degraded: true };
        pintar(<RestorativeCourtWidget />, "l");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/1 abierto/);
        expect(await screen.findByText(/Casos guardados en este dispositivo/)).toBeTruthy();
    });

    it("en S es un acceso directo al Área Política", () => {
        pintar(<RestorativeCourtWidget />, "s");
        expect(screen.getByRole("link", { name: /Abrir los Círculos de Paz: 0 abiertos/ }).getAttribute("href")).toBe("/network/politics");
    });
});

const hace = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const ESPACIOS = [
    { id: "e1", title: "Jardín de cristal", kind: "escena", updated_at: hace(2) },
    { id: "d1", title: "Manifiesto del barrio", kind: "dashboard", app: "documento", updated_at: hace(3) },
    { id: "j1", title: "Tarde de juegos", kind: "dashboard", vivo: "juego", updated_at: hace(20) },
    { id: "e2", title: "Templo sonoro", kind: "escena", updated_at: hace(50) },
];

describe("Multiverso", () => {
    beforeEach(() => { empujar.mockClear(); crearEscena.mockClear(); });

    it.each(TODAS)("sin sesión (%s) no inventa mundos ni presencias", async (clase) => {
        pintar(<MultiverseHubWidget />, clase);
        await screen.findByRole("region", { name: /sin sesión/ });
        expect(peticiones).not.toContain("os_spaces");
    });

    it("pinta tus escenas 3D y salas de juego reales (no los documentos) y los portales de la red", async () => {
        usuario = { id: "u1" };
        tablas = { os_spaces: ESPACIOS };
        pintar(<MultiverseHubWidget />, "xl");
        await screen.findByRole("region", { name: /3 mundos tuyos \(2 escenas 3D y 1 sala de juego\)/ });
        expect(screen.getByRole("link", { name: /Jardín de cristal/ }).getAttribute("href")).toBe("/escena/e1");
        expect(screen.getByRole("link", { name: /Tarde de juegos/ }).getAttribute("href")).toBe("/juego/j1");
        expect(screen.queryByText("Manifiesto del barrio")).toBeNull();
        expect(screen.getByRole("link", { name: /Mundo de avatares/ }).getAttribute("href")).toBe("/mundo-avatares");
        expect(screen.getByText(/Este navegador no ofrece WebXR/)).toBeTruthy();
        expect(peticiones.filter((t) => t === "os_spaces")).toHaveLength(1);
    });

    it("sin mundos lo dice y crea una escena de verdad, entrando en ella", async () => {
        usuario = { id: "u1" };
        tablas = { os_spaces: [] };
        pintar(<MultiverseHubWidget />, "l");
        expect(await screen.findByText("Aún no has creado ningún mundo")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Crear una escena 3D nueva" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Nombre de la escena" }), { target: { value: "Plaza del sol" } });
        fireEvent.submit(screen.getByRole("form", { name: "Crear una escena 3D" }));
        await vi.waitFor(() => expect(empujar).toHaveBeenCalledWith("/escena/e-nueva?t=13"));
        expect(crearEscena).toHaveBeenCalledWith("Plaza del sol");
        expect(await screen.findByRole("region", { name: /1 mundo tuyo \(1 escena 3D/ })).toBeTruthy();
    });

    it("si la nube no responde lo dice (error) y deja reintentar", async () => {
        usuario = { id: "u1" };
        fallo = "timeout";
        pintar(<MultiverseHubWidget />, "m");
        expect(await screen.findByRole("region", { name: /error, no se pudieron leer tus mundos/ })).toBeTruthy();
        expect(screen.getByRole("alert")).toBeTruthy();
    });
});

describe("Estudio Creativo", () => {
    beforeEach(() => { empujar.mockClear(); crearDoc.mockClear(); crearPres.mockClear(); });

    it.each(TODAS)("sin sesión (%s) no inventa proyectos", async (clase) => {
        pintar(<CreativeStudioWidget />, clase);
        await screen.findByRole("region", { name: /sin sesión/ });
        expect(peticiones).not.toContain("os_spaces");
    });

    it("pinta tus obras reales (no las escenas) con su tipo y comparte la lectura con el Multiverso", async () => {
        usuario = { id: "u1" };
        tablas = { os_spaces: [...ESPACIOS, { id: "t1", title: "Inventario", kind: "dashboard", vivo: "tabla", updated_at: hace(1) }, { id: "b1", title: "Lluvia de ideas", kind: "board", updated_at: hace(90) }] };
        pintar(<><CreativeStudioWidget /><MultiverseHubWidget /></>, "xl");
        await screen.findByRole("region", { name: /Estudio Creativo: 3 obras \(1 documento, 1 tabla y 1 pizarra\)\. La última: «Inventario»/ });
        await screen.findByRole("region", { name: /Multiverso: 3 mundos/ });
        expect(screen.getByRole("link", { name: /Manifiesto del barrio/ }).getAttribute("href")).toBe("/documento/d1");
        expect(screen.getByRole("link", { name: /Lluvia de ideas/ }).getAttribute("href")).toBe("/pizarra?board-space=b1");
        expect(peticiones.filter((t) => t === "os_spaces")).toHaveLength(1);
    });

    it("crea un documento de verdad y entra en él; si falla lo dice", async () => {
        usuario = { id: "u1" };
        tablas = { os_spaces: [] };
        pintar(<CreativeStudioWidget />, "l");
        expect(await screen.findByText("Aún no has creado ninguna obra")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Crear una obra nueva" }));
        expect(screen.getByRole("link", { name: /Pizarra/ }).getAttribute("href")).toBe("/pizarra");
        fireEvent.click(screen.getByRole("button", { name: /^Presentación/ }));
        fireEvent.submit(screen.getByRole("form", { name: "Crear presentación" }));
        expect(await screen.findByRole("alert")).toBeTruthy();
        expect(empujar).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Elegir otro tipo" }));
        fireEvent.click(screen.getByRole("button", { name: /^Documento/ }));
        fireEvent.change(screen.getByRole("textbox", { name: "Título" }), { target: { value: "Carta a la asamblea" } });
        fireEvent.submit(screen.getByRole("form", { name: "Crear documento" }));
        await vi.waitFor(() => expect(empujar).toHaveBeenCalledWith("/documento/d-nuevo"));
        expect(crearDoc).toHaveBeenCalledWith("Carta a la asamblea");
        expect(await screen.findByRole("region", { name: /1 obra \(1 documento\)\. La última: «Carta a la asamblea»/ })).toBeTruthy();
    });
});

describe("Trueque y Procomún", () => {
    const rec = (id: string, name: string, status: string, extra: any = {}) => ({ id, name, type: "Herramienta", status, updatedAt: "", ...extra });
    beforeEach(() => { comunes = []; falloComunes = false; guardarComun.mockClear(); cargarComunes.mockClear(); });

    it.each(TODAS)("sin recursos (%s) lo dice sin inventar anuncios", async (clase) => {
        pintar(<BarterMarketWidget />, clase);
        await screen.findByRole("region", { name: /aún no hay recursos comunes/ });
    });

    it("usa un recurso libre (queda a tu nombre) y devuelve lo tuyo, con el procomún real", async () => {
        usuario = { id: "u1" };
        comunes = [rec("r1", "Taladro", "Disponible", { notes: "en el cobertizo" }), rec("r2", "Bici de carga", "En uso", { assignedTo: "u1", assignedLabel: "Alex" }), rec("r3", "Sala", "En uso", { assignedTo: "u2", assignedLabel: "Naima" }), rec("r4", "Batería", "Mantenimiento")];
        pintar(<BarterMarketWidget />, "xl");
        await screen.findByRole("region", { name: /1 libre de 4 \(2 en uso, 1 en mantenimiento\)\. Tienes 1 en uso/ });
        expect(screen.getByText(/en uso por Naima/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Usar «Taladro»" }));
        await screen.findByRole("region", { name: /0 libres de 4 .*Tienes 2 en uso/ });
        expect(guardarComun).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", status: "En uso", assignedTo: "u1", assignedLabel: "Alex", notes: "en el cobertizo" }));
        fireEvent.click(screen.getByRole("button", { name: "Devolver «Bici de carga»" }));
        await screen.findByRole("region", { name: /1 libre de 4 .*Tienes 1 en uso/ });
        expect(guardarComun).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r2", status: "Disponible", assignedTo: null }));
    });

    it("ofrece algo al procomún", async () => {
        usuario = { id: "u1" };
        pintar(<BarterMarketWidget />, "l");
        fireEvent.click(await screen.findByRole("button", { name: "Ofrecer algo al procomún" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Qué ofreces" }), { target: { value: "Escalera de 3 m" } });
        fireEvent.change(screen.getByRole("combobox", { name: "Tipo de recurso" }), { target: { value: "Herramienta" } });
        fireEvent.submit(screen.getByRole("form", { name: "Ofrecer al procomún" }));
        await screen.findByRole("region", { name: /1 libre de 1/ });
        expect(guardarComun).toHaveBeenCalledWith(expect.objectContaining({ name: "Escalera de 3 m", type: "Herramienta", status: "Disponible" }));
    });

    it("si la red no responde lo dice (error)", async () => {
        falloComunes = true;
        pintar(<BarterMarketWidget />, "m");
        expect(await screen.findByRole("region", { name: /error, no se pudieron leer/ })).toBeTruthy();
    });
});
