// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compararVersiones, urlDeConsulta, validarPatronTag } from "../actualizaciones";
import { fichasIaConUpstreamGitHub } from "../fuentes-ia-locales";
import { RECOMMENDED_PACKAGE_IDS } from "../defaults-seed";
import { allPackages, findPackage, install, isInstalled, STARSEED_IA_TOOLS_REPO, STARSEED_LABS_REPO } from "../packages";
import {
    CONTRATO_1026,
    DECISIONES_1026,
    DUPLICADAS_1026,
    FICHAS_REPOS_1026,
    FICHAS_VIEJAS_SEGUIMIENTO_1026,
    FUSIONADAS_1026,
    IDS_SIEMBRA_1026,
    LICENCIAS_VERIFICADAS_1026,
    TANDA_1026_FICHAS,
} from "../repos-1026";

const RAIZ = path.resolve(__dirname, "../../../..");

const nueva = (id: string) => FICHAS_REPOS_1026.find((p) => p.id === id)!;

describe("tanda 1026 · las cuentas", () => {
    it("5 fichas = 4 nuevas + 1 fusionada con una ficha vieja (Open Generative AI)", () => {
        expect(TANDA_1026_FICHAS).toHaveLength(5);
        expect(FICHAS_REPOS_1026.map((p) => p.id).sort()).toEqual(["lib-cap", "lib-open-higgsfield-ai", "lib-openproject", "lib-weknora"]);
        expect(FUSIONADAS_1026).toEqual({ "lib-open-generative-ai": "iatool-open-generative-ai" });
    });

    it("ningún id se repite, ni dentro de la tanda ni contra el resto de la Biblioteca", () => {
        const ids = TANDA_1026_FICHAS.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        const catalogo = allPackages().map((p) => p.id);
        expect(new Set(catalogo).size).toBe(catalogo.length);
        for (const f of FICHAS_REPOS_1026) expect(catalogo.filter((id) => id === f.id)).toHaveLength(1);
        // La fusionada no se crea otra vez: vive en su ficha vieja.
        expect(catalogo).not.toContain("lib-open-generative-ai");
        expect(catalogo).toContain("iatool-open-generative-ai");
    });

    it("el JSON explica qué se pidió, qué se decidió y de dónde sale cada licencia", () => {
        expect(Object.keys(DUPLICADAS_1026)).toEqual(
            expect.arrayContaining(["Autom8AI/Open-Higgsfield-AI", "Anil-matcha/Open-Generative-AI", "CapSoftware/Cap"]),
        );
        expect(DECISIONES_1026.length).toBeGreaterThanOrEqual(4);
        expect(Object.keys(LICENCIAS_VERIFICADAS_1026).sort()).toEqual(["audiovisual", "conocimiento", "grabacion", "proyectos"]);
        for (const texto of Object.values(LICENCIAS_VERIFICADAS_1026)) expect(texto).toMatch(/2026-10-26/);
    });
});

describe("tanda 1026 · cada ficha", () => {
    it("trae repo de GitHub, canal, licencia, versión, aviso y contrato", () => {
        for (const p of FICHAS_REPOS_1026) {
            expect(p.kind, p.id).toBe("project");
            expect(p.id, p.id).toMatch(/^lib-[a-z0-9-]+$/);
            expect(String(p.payload.upstream), p.id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
            expect(p.payload.externalUrl, p.id).toBe(p.payload.upstream);
            expect(["releases", "tags", "commits"], p.id).toContain(p.payload.canal);
            expect(String(p.payload.licencia).length, p.id).toBeGreaterThan(1);
            expect(p.version.length, p.id).toBeGreaterThan(0);
            expect(p.version, p.id).not.toMatch(/\s/);
            expect(String(p.payload.aviso).length, p.id).toBeGreaterThan(10);
            expect(p.description.length, p.id).toBeGreaterThan(40);
            expect(p.payload.contrato, p.id).toBe(CONTRATO_1026);
            expect(String(p.payload.requisitos).length, p.id).toBeGreaterThan(10);
        }
    });

    it("las licencias son las verificadas el 2026-10-26, con lo que cada una exige", () => {
        expect(String(nueva("lib-weknora").payload.licencia)).toMatch(/^MIT/);
        expect(String(nueva("lib-openproject").payload.licencia)).toMatch(/^GPL-3\.0/);
        expect(String(nueva("lib-openproject").payload.licencia)).toMatch(/Enterprise.*pago/);
        expect(String(nueva("lib-cap").payload.licencia)).toMatch(/^AGPL-3\.0/);
        expect(String(nueva("lib-cap").payload.licencia)).toMatch(/uso comercial/);
        expect(String(nueva("lib-open-higgsfield-ai").payload.licencia)).toMatch(/MIT.*sin archivo LICENSE|solo en su README/);
    });

    it("cada icono existe en el mapa de la tienda (si no, la tarjeta cae al icono genérico)", () => {
        const tienda = readFileSync(path.join(RAIZ, "src/components/library/package-store.tsx"), "utf8");
        const bloque = /const ICON_MAP[^=]*=\s*\{([\s\S]*?)\n\};/.exec(tienda)?.[1] ?? "";
        const conocidos = new Set(bloque.replace(/\/\/[^\n]*/g, "").split(/[\s,]+/).filter(Boolean));
        expect(conocidos.size).toBeGreaterThan(40);
        for (const p of FICHAS_REPOS_1026) expect(conocidos.has(p.icon), `${p.id}: icono «${p.icon}»`).toBe(true);
    });

    it("instalar solo registra el enlace y NINGUNA ficha dice que corre aquí", () => {
        for (const p of FICHAS_REPOS_1026) {
            expect(p.payload.route, p.id).toBeUndefined();
            expect(p.payload.skillId, p.id).toBeUndefined();
            expect(p.comingSoon, p.id).toBeFalsy();
            expect(p.payload.corre_aqui, p.id).toBe(false);
        }
        for (const f of TANDA_1026_FICHAS) expect(f.corre_aqui, f.id).toBe(false);
    });

    it("lo que la tienda enseña (la descripción) dice lo que hay que saber antes de fiarse", () => {
        const higgs = nueva("lib-open-higgsfield-ai");
        expect(higgs.free).toBe(false);
        expect(higgs.description).toMatch(/kie\.ai/);
        expect(higgs.description).toMatch(/fal\.ai/);
        expect(higgs.description).toMatch(/PIN/);
        expect(higgs.description).toMatch(/No sirve tal cual/);
        const cap = nueva("lib-cap");
        expect(cap.description).toMatch(/uso comercial/);
        expect(cap.description).toMatch(/licencia de pago/);
        const wk = nueva("lib-weknora");
        expect(wk.description).toMatch(/Hoy no hay ninguna instancia/);
        expect(wk.description).toMatch(/solo lectura/);
        const op = nueva("lib-openproject");
        expect(op.description).toMatch(/GPL-3\.0/);
        expect(op.description).toMatch(/Vikunja/);
        // «Gratis» solo donde el servicio que necesita también lo es.
        expect(wk.free).toBe(true);
        expect(op.free).toBe(true);
        expect(cap.free).toBe(true);
    });

    it("el texto visible no usa los nombres prohibidos de Genesis ni emojis", () => {
        const todo = JSON.stringify([...FICHAS_REPOS_1026, ...FICHAS_VIEJAS_SEGUIMIENTO_1026]);
        expect(todo).not.toMatch(new RegExp(["Puente de", "Centro de"].map((p) => `${p} ${["Man", "do"].join("")}`).join("|")));
        expect(todo).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it("las claves de los servicios se nombran por su variable de entorno, nunca con un valor", () => {
        const texto = readFileSync(path.join(RAIZ, "config/repos-libreria-1026.json"), "utf8");
        expect(texto).not.toMatch(/\b(sk|ghp|gsk|xox[bp])[-_][A-Za-z0-9]{16,}/);
        expect(texto).toMatch(/WEKNORA_API_KEY/);
        expect(texto).toMatch(/OPENPROJECT_API_KEY/);
    });
});

describe("tanda 1026 · el canal de versiones de cada una", () => {
    it("la comprobación llega a todas: URL de consulta de GitHub y patrón de etiqueta válido", () => {
        expect(fichasIaConUpstreamGitHub(FICHAS_REPOS_1026)).toHaveLength(FICHAS_REPOS_1026.length);
        expect(fichasIaConUpstreamGitHub(FICHAS_VIEJAS_SEGUIMIENTO_1026)).toHaveLength(1);
        for (const p of [...FICHAS_REPOS_1026, ...FICHAS_VIEJAS_SEGUIMIENTO_1026]) {
            const payload = p.payload as { canal?: unknown; patronTag?: unknown };
            const url = urlDeConsulta(String(p.payload.upstream), payload);
            expect(url, p.id).toMatch(/^https:\/\/api\.github\.com\/repos\//);
            if (payload.patronTag !== undefined) {
                expect(validarPatronTag(payload.patronTag).error, p.id).toBeNull();
                expect(url, p.id).toMatch(/\/tags\?/);
            }
        }
    });

    it("cada una usa el canal que su repo de verdad publica", () => {
        const higgs = nueva("lib-open-higgsfield-ai");
        expect(higgs.payload.canal).toBe("commits"); // sin etiquetas ni lanzamientos
        expect(higgs.version).toMatch(/^[0-9a-f]{7}$/);
        expect(compararVersiones(higgs.version, `${higgs.version}aaaaaaaaaaaa`)).toBe("igual");
        expect(compararVersiones(higgs.version, "0".repeat(40))).toBe("hay-actualizacion");

        const wk = nueva("lib-weknora");
        expect(wk.payload.canal).toBe("releases");
        expect(wk.version).toBe("v0.8.3");
        expect(urlDeConsulta(String(wk.payload.upstream), wk.payload)).toBe("https://api.github.com/repos/Tencent/WeKnora/releases/latest");

        const op = nueva("lib-openproject");
        expect(op.version).toBe("v17.9.3");
        expect(urlDeConsulta(String(op.payload.upstream), op.payload)).toBe("https://api.github.com/repos/opf/openproject/tags?per_page=100");

        const cap = nueva("lib-cap");
        expect(cap.version).toBe("cap-v0.6.1");
        expect(urlDeConsulta(String(cap.payload.upstream), cap.payload)).toBe("https://api.github.com/repos/CapSoftware/Cap/tags?per_page=100");
    });

    it("los patrones de etiqueta casan con la versión y no con sprints, candidatas ni nocturnas", () => {
        const patronOp = validarPatronTag(nueva("lib-openproject").payload.patronTag).patron!;
        expect(patronOp.test("v17.9.3")).toBe(true);
        expect(patronOp.test("v16.0.0")).toBe(true);
        for (const ruido of ["v17.9.3-rc.1", "sprint-2026-10", "v17.9", "17.9.3", "stable/17"]) expect(patronOp.test(ruido), ruido).toBe(false);

        const patronCap = validarPatronTag(nueva("lib-cap").payload.patronTag).patron!;
        expect(patronCap.test("cap-v0.6.1")).toBe(true);
        for (const ruido of ["cap-v0.6.1-beta.1", "v0.6.1", "nightly-2026-10-25", "cap-v0.6"]) expect(patronCap.test(ruido), ruido).toBe(false);
    });
});

describe("tanda 1026 · Open Generative AI actualiza su ficha vieja en su sitio", () => {
    const vieja = () => STARSEED_IA_TOOLS_REPO.packages.find((p) => p.id === "iatool-open-generative-ai")!;

    it("conserva el id, el tipo y el sitio, y gana la versión real, el canal y el texto corregido", () => {
        const f = vieja();
        expect(f).toBeDefined();
        expect(f.kind).toBe("repo");
        expect(f.version).toBe("v2.0.0");
        expect(f.payload.canal).toBe("releases");
        expect(f.payload.upstream).toBe("https://github.com/Anil-matcha/Open-Generative-AI");
        expect(f.payload.externalUrl).toBe("https://github.com/Anil-matcha/Open-Generative-AI");
        expect(String(f.payload.licencia)).toMatch(/^MIT/);
        expect(f.payload.corre_aqui).toBe(false);
        expect(f.name).not.toMatch(/referencia/);
        // El texto viejo prometía «420+ modelos sobre Muapi» y nada más: ahora dice lo local y lo de pago.
        expect(f.description).not.toMatch(/420\+/);
        for (const trozo of ["stable-diffusion.cpp", "Wan2GP", "Muapi", "Pollinations", "8 GB"]) expect(f.description, trozo).toContain(trozo);
        // Sigue siendo «con clave» en la nube: la insignia «Gratis» no se la ponemos.
        expect(f.free).toBe(false);
    });

    it("no se duplica y el enlace de referencia sigue en las capacidades de generación audiovisual", () => {
        expect(allPackages().filter((p) => p.id === "iatool-open-generative-ai")).toHaveLength(1);
        expect(findPackage("iatool-open-generative-ai")?.version).toBe("v2.0.0");
        const skills = readFileSync(path.join(RAIZ, "src/ai/astraura/skills.ts"), "utf8");
        expect(skills).toContain("iatool-open-generative-ai");
    });

    it("la ficha de seguimiento de la ruta lleva el mismo id, versión y payload", () => {
        const [seguimiento] = FICHAS_VIEJAS_SEGUIMIENTO_1026;
        expect(seguimiento.id).toBe("iatool-open-generative-ai");
        expect(seguimiento.version).toBe(vieja().version);
        expect(seguimiento.payload.upstream).toBe(vieja().payload.upstream);
        expect(seguimiento.payload.patronTag).toBeUndefined();
    });
});

describe("tanda 1026 · en la Biblioteca y preinstaladas", () => {
    afterEach(() => localStorage.clear());

    it("las 4 nuevas viven en el repo de laboratorio y se encuentran por id", () => {
        for (const f of FICHAS_REPOS_1026) {
            expect(STARSEED_LABS_REPO.packages.find((p) => p.id === f.id), f.id).toBeDefined();
            expect(findPackage(f.id), f.id).toBeDefined();
        }
    });

    it("todas se siembran por defecto, incluida la vieja fusionada (regla de Alex: preinstaladas)", () => {
        expect([...IDS_SIEMBRA_1026].sort()).toEqual(
            ["iatool-open-generative-ai", "lib-cap", "lib-open-higgsfield-ai", "lib-openproject", "lib-weknora"],
        );
        for (const id of IDS_SIEMBRA_1026) expect(RECOMMENDED_PACKAGE_IDS).toContain(id);
    });

    it("instalar guarda el enlace y marca la ficha como instalada sin abrir rutas del OS", async () => {
        const ficha = findPackage("lib-weknora")!;
        const res = await install(ficha);
        expect(res.ok).toBe(true);
        expect(res.action).toBe("external");
        expect(res.href).toBe(ficha.payload.externalUrl);
        expect(isInstalled("lib-weknora")).toBe(true);
    });
});

describe("tanda 1026 · la ruta de actualizaciones las comprueba", () => {
    it("lee la versión real de cada upstream (commits, release y etiquetas con patrón) sin duplicar ids", async () => {
        const fetchFalso = vi.fn(async (url: string) => {
            if (url.includes("Autom8AI/Open-Higgsfield-AI/commits")) {
                return new Response(JSON.stringify([{ sha: "d32d022aaaaaaaaaaaa", commit: { committer: { date: "2026-10-25T09:00:00Z" } } }]), { status: 200 });
            }
            if (url.includes("Tencent/WeKnora/releases/latest")) {
                return new Response(JSON.stringify({ tag_name: "v0.8.4", published_at: "2026-10-30T00:00:00Z" }), { status: 200 });
            }
            if (url.includes("opf/openproject/tags")) {
                return new Response(JSON.stringify([{ name: "sprint-2026-10" }, { name: "v17.9.4" }, { name: "v17.9.3" }]), { status: 200 });
            }
            if (url.includes("CapSoftware/Cap/tags")) {
                return new Response(JSON.stringify([{ name: "nightly-2026-10-25" }, { name: "cap-v0.6.2" }]), { status: 200 });
            }
            if (url.includes("Anil-matcha/Open-Generative-AI/releases/latest")) {
                return new Response(JSON.stringify({ tag_name: "v2.0.0", published_at: "2026-05-23T00:00:00Z" }), { status: 200 });
            }
            return new Response("[]", { status: 404 });
        });
        vi.stubGlobal("fetch", fetchFalso);
        try {
            const { GET } = await import("@/app/api/library/actualizaciones/route");
            const datos = (await (await GET()).json()) as {
                fuentes: { id: string; instalada: string; remota: string | null; fecha: string | null; estado: string }[];
            };
            const por = (id: string) => datos.fuentes.find((f) => f.id === id)!;

            expect(por("lib-open-higgsfield-ai").remota).toBe("d32d022");
            expect(por("lib-open-higgsfield-ai").estado).toBe("igual");
            expect(por("lib-open-higgsfield-ai").fecha).toBe("2026-10-25T09:00:00Z");

            expect(por("lib-weknora").remota).toBe("v0.8.4");
            expect(por("lib-weknora").instalada).toBe("v0.8.3");
            expect(por("lib-weknora").fecha).toBe("2026-10-30T00:00:00Z");

            // El sprint se salta por el patrón; la primera etiqueta de versión es la remota.
            expect(por("lib-openproject").remota).toBe("v17.9.4");
            expect(por("lib-cap").remota).toBe("cap-v0.6.2");

            // La ficha vieja fusionada se comprueba una sola vez, con su id de siempre.
            expect(por("iatool-open-generative-ai").remota).toBe("v2.0.0");
            expect(datos.fuentes.some((f) => f.id === "lib-open-generative-ai")).toBe(false);

            const ids = datos.fuentes.map((f) => f.id);
            expect(new Set(ids).size).toBe(ids.length);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("tanda 1026 · el módulo es puro (CLAUDE.md, trampa 11)", () => {
    it("no usa node:*, ni «use client», ni lee el disco: entra al paquete del navegador y al servidor", () => {
        const fuente = readFileSync(path.join(RAIZ, "src/lib/library/repos-1026.ts"), "utf8");
        expect(fuente).not.toMatch(/^\s*import[^;]*from\s+["']node:/m);
        expect(fuente).not.toMatch(/^\s*["']use client["']/m);
        expect(fuente).not.toMatch(/\breadFileSync\b|\bfs\./);
        expect(fuente).toMatch(/from "..\/..\/..\/config\/repos-libreria-1026\.json"/);
    });
});
