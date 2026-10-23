// Pruebas del canal Codeberg (GDL1020A). Codeberg es Forgejo, con una API
// compatible con Gitea; el `fetch` va simulado, sin red real. La ruta exacta de
// gallery-dl en Codeberg NO está verificada: se usa un repo de ejemplo.

import { describe, it, expect } from "vitest";
import { consultarCodeberg, leerVersion, leerVersionCodeberg, rutaTrasladoCodeberg, urlDeConsulta } from "../actualizaciones";

const TRASLADO = "codeberg:ejemplo/repo-de-ejemplo";
const URL_RELEASES = "https://codeberg.org/api/v1/repos/ejemplo/repo-de-ejemplo/releases?limit=1";
const URL_TAGS = "https://codeberg.org/api/v1/repos/ejemplo/repo-de-ejemplo/tags?limit=1";
const RELEASE = [{ tag_name: "v1.28.0", published_at: "2026-10-20T10:00:00Z" }];
const LEÍDA = (version: string, fecha: string | null) => ({ version, fecha, error: null });

interface PlanUrl { ok?: boolean; json: unknown; }

/* Fetch simulado: respuesta planificada por URL; la URL no prevista falla. */
function fetchDePrueba(plan: Record<string, PlanUrl>) {
    const urls: string[] = [];
    let opciones: RequestInit | undefined;
    const fetchFn = (async (url: string, init?: RequestInit) => {
        const vista = plan[String(url)];
        urls.push(String(url));
        opciones = init;
        if (!vista) throw new Error(`URL no prevista en la simulación: ${url}`);
        return { ok: vista.ok !== false, status: vista.ok === false ? 404 : 200, json: async () => vista.json };
    }) as unknown as typeof fetch;
    return {
        fetchFn,
        urlsVistas: (): string[] => [...urls],
        opcionesVistas: (): RequestInit | undefined => opciones,
    };
}

function esperarResultadoHonesto(
    leida: { version: string | null; fecha: string | null; error: string | null },
    trozo: string,
): void {
    expect(leida.version).toBeNull();
    expect(leida.fecha).toBeNull();
    expect(leida.error).toEqual(expect.stringContaining(trozo));
}

describe("rutaTrasladoCodeberg", () => {
    it("acepta codeberg:dueño/repo y rechaza cualquier otra forma", () => {
        expect(rutaTrasladoCodeberg(TRASLADO)).toBe("ejemplo/repo-de-ejemplo");
        expect(rutaTrasladoCodeberg(undefined)).toBeNull();
        expect(rutaTrasladoCodeberg("github:a/b")).toBeNull();
        expect(rutaTrasladoCodeberg("codeberg:sin-dueño")).toBeNull();
    });
});

describe("leerVersionCodeberg", () => {
    it("lee una release (tag_name) o una etiqueta (name); nada raro, null", () => {
        expect(leerVersionCodeberg(RELEASE)).toEqual({ version: "v1.28.0", fecha: "2026-10-20T10:00:00Z" });
        expect(leerVersionCodeberg([{ name: "v0.28.11" }])).toEqual({ version: "v0.28.11", fecha: null });
        expect(leerVersionCodeberg([])).toBeNull();
        expect(leerVersionCodeberg({ raro: true })).toBeNull();
    });
});

describe("la mudanza la siguen las funciones puras", () => {
    const VIEJO = "https://github.com/ejemplo/repo-de-ejemplo";

    it("urlDeConsulta con trasladadoA apunta a las releases de Codeberg", () => {
        expect(urlDeConsulta(VIEJO, { trasladadoA: TRASLADO })).toBe(URL_RELEASES);
    });

    it("un traslado mal escrito se ignora: queda el canal de GitHub", () => {
        expect(urlDeConsulta(VIEJO, { trasladadoA: "codeberg:x" })).toBe(
            "https://api.github.com/repos/ejemplo/repo-de-ejemplo/commits?per_page=1",
        );
    });

    it("leerVersion lee la release de Codeberg aunque el upstream sea el viejo", () => {
        expect(leerVersion(VIEJO, RELEASE, { trasladadoA: TRASLADO })).toEqual({
            version: "v1.28.0",
            fecha: "2026-10-20T10:00:00Z",
        });
    });
});

describe("consultarCodeberg con fetch simulado", () => {
    it("saca la versión de releases con la cabecera json", async () => {
        const p = fetchDePrueba({ [URL_RELEASES]: { json: RELEASE } });
        expect(await consultarCodeberg(TRASLADO, p.fetchFn)).toEqual(LEÍDA("v1.28.0", "2026-10-20T10:00:00Z"));
        expect(p.urlsVistas()).toEqual([URL_RELEASES]);
        expect(new Headers(p.opcionesVistas()?.headers).get("accept")).toBe("application/json");
    });

    it("si no hay versiones, respalda en tags", async () => {
        const p = fetchDePrueba({ [URL_RELEASES]: { json: [] }, [URL_TAGS]: { json: [{ name: "v0.28.11" }] } });
        expect(await consultarCodeberg(TRASLADO, p.fetchFn)).toEqual(LEÍDA("v0.28.11", null));
        expect(p.urlsVistas()).toEqual([URL_RELEASES, URL_TAGS]);
    });

    it("también respalda en tags cuando releases responde con error", async () => {
        const p = fetchDePrueba({ [URL_RELEASES]: { ok: false, json: null }, [URL_TAGS]: { json: [{ name: "v0.28.11" }] } });
        expect(await consultarCodeberg(TRASLADO, p.fetchFn)).toEqual(LEÍDA("v0.28.11", null));
        expect(p.urlsVistas()).toEqual([URL_RELEASES, URL_TAGS]);
    });

    it("desde tags no vuelve a pedir releases", async () => {
        const p = fetchDePrueba({ [URL_TAGS]: { json: [{ name: "v0.28.11" }] } });
        expect(await consultarCodeberg(TRASLADO, p.fetchFn, "tags")).toEqual(LEÍDA("v0.28.11", null));
        expect(p.urlsVistas()).toEqual([URL_TAGS]);
    });

    it("sin versiones ni etiquetas lo dice, sin inventar nada", async () => {
        const p = fetchDePrueba({ [URL_RELEASES]: { json: [] }, [URL_TAGS]: { json: [] } });
        esperarResultadoHonesto(await consultarCodeberg(TRASLADO, p.fetchFn), "No hay versión ni etiqueta");
    });

    it("un fallo de red se cuenta tal cual y no se inventa versión", async () => {
        const p = fetchDePrueba({});
        esperarResultadoHonesto(await consultarCodeberg(TRASLADO, p.fetchFn), "fallo en la petición");
    });

    it("un traslado sin dueño/repo ni se consulta", async () => {
        const p = fetchDePrueba({});
        esperarResultadoHonesto(await consultarCodeberg("codeberg:media-palabra", p.fetchFn), "codeberg:dueño/repo");
        expect(p.urlsVistas()).toEqual([]);
    });
});