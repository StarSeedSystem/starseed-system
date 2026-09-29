import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929) · Ágora del don y Resonancia social con las
// publicaciones REALES de la Red (`posts`, simulado aquí): una sola lectura
// compartida, dones por etiqueta (#don / #pido), temas por calor real.
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

let filas: any[] = [];
let falla = false;
const pedidas: string[] = [];
vi.mock("@/utils/supabase/client", () => {
    function consulta(tabla: string) {
        pedidas.push(tabla);
        const c: any = {
            select: () => c, order: () => c, limit: () => c, eq: () => c,
            then: (ok: any, ko: any) => Promise.resolve(falla ? { data: null, error: { message: "402" } } : { data: filas, error: null }).then(ok, ko),
        };
        return c;
    }
    return { createClient: () => ({ from: (t: string) => consulta(t) }) };
});

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { __reiniciarCacheB } from "../../gen2/_paquete-b/cache-compartida";
import { donDe, enlaceComponer, extraerEtiquetas, resonancia } from "../../gen2/_paquete-b/datos-red";
import { GiftAgoraWidget } from "../gift-agora-widget";

const H = 3_600_000;
const T0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function enMarco(clase: ClaseTamano, ui: React.ReactElement, acento = "#10b981") {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento, acento2: "#7c5cff", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    falla = false;
    pedidas.length = 0;
    filas = [
        { id: "a1", author_name: "Ana", created_at: iso(T0 - H), titulo: "#don Semillas de tomate", cuerpo: "Tengo de sobra para el #huerto" },
        { id: "a2", author_name: "Luis", created_at: iso(T0 - 2 * H), titulo: "Necesito una escalera", cuerpo: "#pido para el sábado #huerto" },
        { id: "a3", author_name: "Eva", created_at: iso(T0 - 50 * H), titulo: "Asamblea del jueves", cuerpo: "Hablamos del #agua y del #huerto" },
        { id: "a4", author_name: "Iris", created_at: iso(T0 - 3 * H), titulo: "#ofrezco clases de guitarra", cuerpo: "" },
    ];
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("red (puros)", () => {
    it("extrae etiquetas y reconoce dones y peticiones", () => {
        expect(extraerEtiquetas("Hola #Huerto y #huerto, #agua_limpia")).toEqual(["huerto", "agua_limpia"]);
        const toSegundos = (x: any) => ({ id: x.id, autor: x.author_name, ts: Date.parse(x.created_at), titulo: x.titulo, cuerpo: x.cuerpo });
        expect(donDe(toSegundos(filas[0]))).toMatchObject({ tipo: "ofrezco", que: "Semillas de tomate" });
        expect(donDe(toSegundos(filas[1]))).toMatchObject({ tipo: "pido", que: "Necesito una escalera" });
        expect(donDe(toSegundos(filas[2]))).toBeNull();
        const r = resonancia(filas.map(toSegundos), T0);
        expect(r[0]).toMatchObject({ etiqueta: "huerto", n: 3 });
        expect(r.find((t) => t.etiqueta === "don")).toBeUndefined();
        expect(enlaceComponer("#don ")).toBe("/publicar?area=general&intent=%23don%20");
    });
});

describe("Ágora del don", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("cuenta dones reales en %s", async (clase) => {
        render(enMarco(clase, <GiftAgoraWidget />));
        await waitFor(() => expect(screen.queryAllByLabelText(/2 dones ofrecidos y 1 petición/).length + screen.queryAllByText(/Semillas de tomate|Se ofrece/).length).toBeGreaterThan(0));
    });
    it("en l filtra, ofrece con el Compositor y responde en la publicación", async () => {
        render(enMarco("l", <GiftAgoraWidget />));
        fireEvent.click(await screen.findByRole("radio", { name: /Se pide/ }));
        expect(screen.getByText("Necesito una escalera")).toBeInTheDocument();
        expect(screen.queryByText("Semillas de tomate")).toBeNull();
        expect(screen.getByRole("link", { name: "Responder a: Necesito una escalera" })).toHaveAttribute("href", "/post/a2");
        expect(screen.getByText("Ofrecer").closest("a")).toHaveAttribute("href", "/publicar?area=general&intent=%23don%20");
    });
    it("vacío honesto con cómo empezar", async () => {
        filas = [filas[2]];
        render(enMarco("m", <GiftAgoraWidget />));
        expect(await screen.findByText("Aún no hay dones en la red")).toBeInTheDocument();
    });
    it("error honesto con reintento", async () => {
        falla = true;
        render(enMarco("m", <GiftAgoraWidget />));
        expect(await screen.findByText("No se pudieron leer las publicaciones de la Red.")).toBeInTheDocument();
    });
});
