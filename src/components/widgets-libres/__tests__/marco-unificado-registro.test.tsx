/**
 * Auditoría de humo (Ola L6): TODOS los tipos del registro se pintan dentro del marco
 * unificado en s, m y l sin romperse. Los datos se simulan de forma genérica (Supabase,
 * fetch, APIs del navegador que jsdom no trae); un tipo que no pueda pintarse en jsdom va
 * a la lista explícita con su motivo, nunca se salta en silencio.
 */
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    medida: { width: 240, height: 240 },
    marco: "libre" as "libre" | "clasico",
    pendientes: 0,
}));

// ── Tamaño forzado (la misma lógica de tiers que el hook real) ──
vi.mock("@/components/dashboard/kit/use-element-size", () => {
    const tier = (px: number) => (px < 200 ? "micro" : px < 340 ? "compact" : px < 560 ? "regular" : "expanded");
    return {
        useElementSize: () => ({
            ref: { current: null },
            size: { ...h.medida, tier: tier(h.medida.width), vTier: tier(h.medida.height), landscape: h.medida.width >= h.medida.height * 1.15 },
        }),
    };
});

// ── Apariencia: lo que leen los widgets, y cualquier otra función como no-op ──
vi.mock("@/context/appearance-context", () => {
    const widgets = () => ({
        marco: h.marco, designMode: "theme", compact: false, bgStyle: "glass", borderStyle: "thin", headerStyle: "simple",
        shadows: "md", glassOpacity: 0.6, innerGlow: "none", noiseTexture: false, weatherVariant: "minimal",
        culturalFeedStyle: "cards", calculatorTheme: "glass", feedSource: "all", ashostGraphType: "line", ashostColor: "#06B6D4", ashostSpeed: 1,
    });
    const base: Record<string, unknown> = {
        animations: { enabled: false, hover: false },
        background: { type: "gradient", layers: [] },
        themeStore: { savedThemes: [], osTheme: "starseed", activeMode: "primary" },
    };
    const config = () => new Proxy({ ...base, widgets: widgets() }, {
        get: (t, k) => (typeof k === "string" && !(k in t) ? {} : (t as any)[k]),
    });
    const noop = () => {};
    return {
        useAppearance: () => new Proxy({ config: config() } as Record<string, unknown>, {
            get: (t, k) => (k in t ? (t as any)[k] : noop),
        }),
        AppearanceProvider: ({ children }: { children: React.ReactNode }) => children,
    };
});

// ── Supabase: consultas encadenables que devuelven vacío, canales mudos, sin sesión ──
vi.mock("@/utils/supabase/client", () => {
    const resultado = () => Promise.resolve({ data: [], error: null, count: 0 });
    const consulta = (): any => new Proxy(function () {}, {
        get(_t, k) {
            if (k === "then") { const p = resultado(); return p.then.bind(p); }
            if (k === "catch") { const p = resultado(); return p.catch.bind(p); }
            if (k === "finally") { const p = resultado(); return p.finally.bind(p); }
            if (k === "single" || k === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
            return () => consulta();
        },
        apply: () => consulta(),
    });
    const canal: any = {
        on: () => canal, subscribe: (cb?: (s: string) => void) => { cb?.("CLOSED"); return canal; },
        unsubscribe: async () => "ok", send: async () => "ok", track: async () => "ok", untrack: async () => "ok",
        presenceState: () => ({}),
    };
    const cliente = {
        from: () => consulta(),
        rpc: () => consulta(),
        channel: () => canal,
        removeChannel: async () => "ok",
        removeAllChannels: async () => [],
        getChannels: () => [],
        auth: {
            getUser: async () => ({ data: { user: null }, error: null }),
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        storage: {
            from: () => ({
                list: async () => ({ data: [], error: null }),
                getPublicUrl: () => ({ data: { publicUrl: "" } }),
                createSignedUrl: async () => ({ data: null, error: null }),
                upload: async () => ({ data: null, error: null }),
                download: async () => ({ data: null, error: null }),
            }),
        },
        functions: { invoke: async () => ({ data: null, error: null }) },
    };
    return { createClient: () => cliente };
});

// ── Navegación de Next ──
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _p, ...r }: any) => <a href={typeof href === "string" ? href : String(href?.pathname ?? "#")} {...r}>{children}</a> }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} }),
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    redirect: () => {},
    notFound: () => {},
}));

// ── next/dynamic → React.lazy, para pintar de verdad los widgets perezosos ──
vi.mock("next/dynamic", async () => {
    const R = await import("react");
    return {
        default: (cargar: () => Promise<any>, opciones?: { loading?: () => React.ReactNode }) => {
            const Perezoso = R.lazy(async () => {
                h.pendientes++;
                try {
                    const m = await cargar();
                    const C = typeof m === "function" || (m && m.$$typeof) ? m : m?.default;
                    return { default: C ?? (() => null) };
                } finally {
                    h.pendientes--;
                }
            });
            return function Dinamico(props: any) {
                return R.createElement(R.Suspense, { fallback: opciones?.loading ? opciones.loading() : null }, R.createElement(Perezoso, props));
            };
        },
    };
});

import { WidgetRegistry } from "@/components/dashboard/widget-registry";
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import { TIPOS_CON_DISENO_LIBRE } from "@/components/widgets-libres/registro-libre";
import { acentoDeTipo } from "@/components/widgets-libres/acentos-categoria";
import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";

/**
 * Tipos que NO pueden pintarse en jsdom, con su motivo. Vacía hoy: si un día un widget
 * necesita WebGL real o similar, entra aquí con su razón y la prueba lo cuenta aparte.
 */
const NO_RENDERIZABLES_EN_JSDOM: Readonly<Record<string, string>> = {
    // Escena three.js / @react-three/fiber a partir de «m»: jsdom no tiene WebGL
    // («Error creating WebGL context»). En «s» sí se pinta (sin escena) y se comprueba abajo.
    WEATHER_HOLISTIC: "necesita WebGL (three.js) a partir de «m»; jsdom no lo tiene",
};
/** Tamaños que sí se pueden comprobar de un tipo listado. */
const TAMANOS_POSIBLES: Readonly<Record<string, readonly string[]>> = { WEATHER_HOLISTIC: ["s"] };

const TAMANOS = { s: 150, m: 240, l: 360 } as const;
const LIBRES = new Set<string>(TIPOS_CON_DISENO_LIBRE);
const TODOS = Object.keys(WIDGET_MANIFEST) as WidgetType[];
const CLASICOS = TODOS.filter((t) => !LIBRES.has(t));

// ── Entorno del navegador que jsdom no trae ──
const consola = { error: console.error, warn: console.warn, log: console.log, info: console.info };
let mensajes: string[] = [];
beforeAll(() => {
    for (const k of ["error", "warn", "log", "info"] as const) {
        console[k] = (...a: unknown[]) => { mensajes.push(`${k}: ${a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ").slice(0, 300)}`); };
    }
    const g = globalThis as any;
    g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
    window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as any;
    g.fetch = vi.fn(async () => ({ ok: false, status: 503, statusText: "sin red en pruebas", headers: new Headers(), json: async () => ({}), text: async () => "", arrayBuffer: async () => new ArrayBuffer(0), blob: async () => new Blob() }));
    class AudioCtx { state = "suspended"; currentTime = 0; sampleRate = 44100; destination = {}; createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; } createOscillator() { return { frequency: { value: 0, setValueAtTime() {} }, type: "sine", connect() {}, disconnect() {}, start() {}, stop() {} }; } createAnalyser() { return { fftSize: 256, frequencyBinCount: 128, connect() {}, disconnect() {}, getByteFrequencyData() {}, getByteTimeDomainData() {}, getFloatFrequencyData() {} }; } createMediaElementSource() { return { connect() {}, disconnect() {} }; } createBiquadFilter() { return { frequency: { value: 0 }, Q: { value: 0 }, connect() {}, disconnect() {} }; } createStereoPanner() { return { pan: { value: 0 }, connect() {}, disconnect() {} }; } resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); } }
    g.AudioContext = AudioCtx; g.webkitAudioContext = AudioCtx;
    HTMLCanvasElement.prototype.getContext = (() => null) as any;
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
    Element.prototype.scrollIntoView = function () {};
    window.scrollTo = (() => {}) as any;
    g.requestIdleCallback = (cb: () => void) => setTimeout(cb, 0);
    g.cancelIdleCallback = (id: number) => clearTimeout(id);
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (_ok: unknown, ko?: (e: unknown) => void) => ko?.({ code: 1, message: "sin permiso en pruebas" }), watchPosition: () => 0, clearWatch() {} } });
    g.WebSocket = class { readyState = 3; send() {} close() {} addEventListener() {} removeEventListener() {} };
    g.EventSource = class { readyState = 2; close() {} addEventListener() {} removeEventListener() {} };
    if (!URL.createObjectURL) (URL as any).createObjectURL = () => "blob:prueba";
    if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = () => {};
});
afterAll(() => { Object.assign(console, consola); });
afterEach(() => { cleanup(); h.marco = "libre"; });

class Cortafuegos extends React.Component<{ alFallar: (e: unknown) => void; children: React.ReactNode }, { fallo: boolean }> {
    state = { fallo: false };
    static getDerivedStateFromError() { return { fallo: true }; }
    componentDidCatch(e: unknown) { this.props.alFallar(e); }
    render() { return this.state.fallo ? <div data-fallo="" /> : this.props.children; }
}

function stub(tipo: WidgetType): DashboardWidget {
    return { id: `w-${tipo}`, dashboard_id: "d-prueba", widget_type: tipo, layout: { x: 0, y: 0, w: 3, h: 3, i: `w-${tipo}` }, settings: {}, created_at: "2026-09-28T00:00:00Z" };
}

async function montar(tipo: WidgetType, lado: number) {
    h.medida = { width: lado, height: lado };
    const errores: unknown[] = [];
    mensajes = [];
    let vista!: ReturnType<typeof render>;
    await act(async () => {
        vista = render(<Cortafuegos alFallar={(e) => errores.push(e)}><WidgetRegistry widget={stub(tipo)} /></Cortafuegos>);
    });
    // Espera a los widgets perezosos (next/dynamic) hasta 8 s.
    for (let i = 0; i < 160 && h.pendientes > 0; i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return { vista, errores };
}

function describir(errores: unknown[]): string {
    return errores.map((e) => (e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 4).join("\n")}` : String(e))).join("\n---\n")
        + (mensajes.length ? `\n[consola]\n${mensajes.slice(0, 6).join("\n")}` : "");
}

const resumen = { pintados: 0, listados: 0, libres: 0 };
const conCascaron = new Set<string>();

describe(`Marco unificado · ${CLASICOS.length} tipos clásicos en s, m y l`, () => {
    it.each(CLASICOS)("%s", async (tipo) => {
        const listado = !!NO_RENDERIZABLES_EN_JSDOM[tipo];
        const tamanos = Object.entries(TAMANOS).filter(([c]) => !listado || (TAMANOS_POSIBLES[tipo] ?? []).includes(c));
        for (const [clase, lado] of tamanos) {
            const { vista, errores } = await montar(tipo, lado);
            expect(errores, `${tipo} en ${clase} se rompió:\n${describir(errores)}`).toEqual([]);
            const marco = vista.container.querySelector("[data-marco='unificado'][role='group']") as HTMLElement | null;
            expect(marco, `${tipo} en ${clase} no está dentro del marco`).not.toBeNull();
            expect(marco!.getAttribute("data-tipo")).toBe(tipo);
            expect(marco!.getAttribute("data-tamano")).toBe(clase);
            expect(marco!.getAttribute("data-familia")).toBe(acentoDeTipo(tipo).familia);
            expect(marco!.querySelector("[data-material-marco]"), `${tipo} sin material`).not.toBeNull();
            const texto = vista.container.textContent ?? "";
            expect(texto).not.toContain("Widget desconocido");
            // El cuerpo perezoso (next/dynamic) llegó a pintarse: no quedó el marcador de carga.
            expect(texto, `${tipo} en ${clase} se quedó cargando`).not.toMatch(/^Cargando(…|\.\.\.| mapa| 3D)/);
            if (marco!.querySelector("[data-widget-shell]")) conCascaron.add(tipo);
            vista.unmount();
        }
        if (listado) resumen.listados++; else resumen.pintados++;
    }, 60_000);
});

describe(`Los ${LIBRES.size} tipos con diseño libre conservan su propio material`, () => {
    it.each([...LIBRES])("%s", async (tipo) => {
        const { vista, errores } = await montar(tipo as WidgetType, TAMANOS.m);
        expect(errores, describir(errores)).toEqual([]);
        expect(vista.container.querySelector("[data-marco='unificado']")).toBeNull();
        expect(vista.container.querySelector("[data-forma]"), `${tipo} no pintó su WidgetLibre`).not.toBeNull();
        resumen.libres++;
    }, 60_000);
});

describe("Marco «clásico» (salida de emergencia)", () => {
    it.each(["AGORA_CAUSAL", "CALCULATOR", "WEATHER_TEMPERATURE", "CLOCK_DATE"] as WidgetType[])("%s vuelve a la tarjeta de siempre", async (tipo) => {
        h.marco = "clasico";
        const { vista, errores } = await montar(tipo, TAMANOS.m);
        expect(errores, describir(errores)).toEqual([]);
        expect(vista.container.querySelector("[data-marco='unificado']")).toBeNull();
    }, 60_000);
});

describe("Recuento", () => {
    it("cada tipo del manifiesto quedó pintado o listado con su motivo", () => {
        expect(resumen.pintados + resumen.listados).toBe(CLASICOS.length);
        expect(resumen.libres).toBe(LIBRES.size);
        expect(CLASICOS.length + LIBRES.size).toBe(TODOS.length);
        consola.info(`[marco-unificado] pintados ${resumen.pintados}/${CLASICOS.length} · listados ${resumen.listados} (${Object.keys(NO_RENDERIZABLES_EN_JSDOM).join(", ")}) · libres ${resumen.libres} · con WidgetShell ${conCascaron.size} · con cáscara propia absorbida ${CLASICOS.length - conCascaron.size}`);
        consola.info(`[marco-unificado] cáscara propia: ${CLASICOS.filter((t) => !conCascaron.has(t)).join(", ")}`);
    });
});
