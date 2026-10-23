// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { FICHAS_IA_LOCALES, RUTA_RECURSOS_IA, fichasIaConUpstreamGitHub } from "../fuentes-ia-locales";
import { REPO_DECISIONES } from "../fuentes-decision";
import { STARSEED_LABS_REPO, findPackage, install, isInstalled, type LibraryPackage } from "../packages";
import { urlDeConsulta } from "../actualizaciones";
import { modeloPorId } from "@/lib/recursos-ia/catalogo";

const tf = FICHAS_IA_LOCALES.find((p) => p.id === "ai-turbo-fieldfare")!;

describe("ficha de TurboFieldfare en la Biblioteca", () => {
    it("es una fuente de IA del repo StarSeed Labs con upstream, licencia, requisitos y etiquetas", () => {
        expect(tf.kind).toBe("ai-source");
        expect(tf.sourceRepoId).toBe("starseed-labs");
        expect(STARSEED_LABS_REPO.packages.some((p) => p.id === tf.id)).toBe(true);
        expect(findPackage(tf.id)).toBeDefined();
        expect(tf.payload.upstream).toBe("https://github.com/drumih/turbo-fieldfare");
        expect(String(tf.payload.licencia)).toMatch(/Apache-2\.0/);
        const req = String(tf.payload.requisitos);
        for (const trozo of ["Apple Silicon", "macOS 26", "Metal 4", "Xcode 26", "Swift 6.2", "15 GB", "2 GB", "solo texto"]) {
            expect(req, trozo).toContain(trozo);
        }
        expect(tf.tags).toEqual(expect.arrayContaining(["ia", "local", "apple-silicon", "moe", "gemma", "ssd"]));
        expect(tf.payload.route).toBe(RUTA_RECURSOS_IA);
        expect(RUTA_RECURSOS_IA).toBe("/agent?tab=recursos-ia");
        expect(tf.comingSoon).toBeFalsy();
    });

    it("apunta a un modelo que existe en el catálogo de Recursos de IA", () => {
        const modelo = modeloPorId(String(tf.payload.modeloRecursosIa));
        expect(modelo?.upstream).toBe(tf.payload.upstream);
    });

    it("su id no choca con las fuentes de decisiones", () => {
        expect(REPO_DECISIONES.packages.some((p) => p.id === tf.id)).toBe(false);
    });
});

describe("instalar TurboFieldfare", () => {
    afterEach(() => localStorage.clear());

    it("lleva al panel Recursos de IA y NO lo marca como instalado", async () => {
        const res = await install(tf);
        expect(res.ok).toBe(true);
        expect(res.action).toBe("route");
        expect(res.href).toBe("/agent?tab=recursos-ia");
        expect(res.message).toMatch(/aún no está instalado/);
        expect(isInstalled(tf.id)).toBe(false);
    });

    it("una fuente de IA sin catálogo ni ruta sigue fallando como antes", async () => {
        const rota: LibraryPackage = { ...tf, id: "ai-rota", payload: { upstream: "https://github.com/x/y" } };
        const res = await install(rota);
        expect(res.ok).toBe(false);
        expect(isInstalled("ai-rota")).toBe(false);
    });
});

describe("comprobación automática de versión", () => {
    it("solo entran las ai-source con upstream de GitHub", () => {
        const otra: LibraryPackage = { ...tf, id: "hf", payload: { upstream: "https://huggingface.co/a/b" } };
        const app: LibraryPackage = { ...tf, id: "app", kind: "app" };
        expect(fichasIaConUpstreamGitHub([tf, otra, app]).map((p) => p.id)).toEqual(["ai-turbo-fieldfare"]);
    });

    it("TurboFieldfare se consulta por commits (no tiene releases)", () => {
        expect(urlDeConsulta(String(tf.payload.upstream), tf.payload)).toBe(
            "https://api.github.com/repos/drumih/turbo-fieldfare/commits?per_page=1",
        );
    });

    it("la ruta de actualizaciones la incluye y lee su último commit", async () => {
        const fetchFalso = vi.fn(async (url: string) => {
            if (url.includes("drumih/turbo-fieldfare")) {
                return new Response(JSON.stringify([{ sha: "abcdef1234567", commit: { committer: { date: "2026-10-20T10:00:00Z" } } }]), { status: 200 });
            }
            return new Response("[]", { status: 404 });
        });
        vi.stubGlobal("fetch", fetchFalso);
        try {
            const { GET } = await import("@/app/api/library/actualizaciones/route");
            const datos = (await (await GET()).json()) as { fuentes: { id: string; remota: string | null; fecha: string | null; upstream: string }[] };
            const entrada = datos.fuentes.find((f) => f.id === "ai-turbo-fieldfare");
            expect(entrada).toBeDefined();
            expect(entrada!.upstream).toBe("https://github.com/drumih/turbo-fieldfare");
            expect(entrada!.remota).toBe("abcdef1");
            expect(entrada!.fecha).toBe("2026-10-20T10:00:00Z");
            // Las fuentes de decisiones siguen dentro, una sola vez cada una.
            const ids = datos.fuentes.map((f) => f.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids).toContain("openjev");
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
