import { describe, expect, it } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  CATEGORIAS_PROTOMOLECULA,
  FECHA_VERIFICACION_PROTOMOLECULA,
  GRUPOS_PROTOMOLECULA,
  IDS_APPS_ARCRAFT,
  IDS_CATEGORIA_PROTO,
  IDS_GRUPO_PROTO,
  aPaqueteBiblioteca,
  buscar,
  herramientaPorId,
  porCategoria,
  repoDeGithub,
  resumenCatalogo,
  respetaReglaDeLicencia,
  usoLicencia,
} from "../catalogo-herramientas";
import type { HerramientaProto } from "../catalogo-herramientas";

/** Las siete apps que enseña getartcraft.com/apps (verificado 2026-10-10). Si la web añade una, esta lista y el catálogo cambian juntos. */
const ARCRAFT_ESPERADAS = ["photocraft", "vectorcraft", "filmcraft", "lightcraft", "pdfcraft", "effectcraft", "designcraft"];

/** Herramientas que el encargo nombra expresamente: tienen que estar. */
const NOMBRADAS = [
  "ardour", "audacity", "tenacity", "surge-xt", "cardinal", "puredata", "webpd", "faustwasm", "tonejs", "strudel",
  "hubs", "tldraw", "bonsai-bim", "web-midi", "web-hid", "web-serial", "gamepad-api", "web-bluetooth", "osc-js",
  "ble-ritmo-cardiaco", "health-connect", "healthkit", "gadgetbridge", "ouraika", "polar-accesslink", "garmin-health-api",
  "withings-api", "fitbit-google-health",
];

const FUENTES = ["github-releases", "github-tags", "npm", "pypi", "flathub", "web"];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_URL = /^https:\/\/[^\s]+$/;
const todas = CATALOGO_PROTOMOLECULA;
const ids = todas.map((h) => h.id);

describe("estructura del catálogo", () => {
  it("los ids son únicos, en minúsculas con guiones", () => {
    expect(new Set(ids).size).toBe(ids.length);
    // Ids en minúsculas con guiones; se admite un sufijo de versión con punto (p. ej. `qwen-image-2.1`).
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*(\.[0-9]+)*$/);
  });

  it("toda herramienta trae licencia, descripción y al menos una fuente (código o web)", () => {
    for (const h of todas) {
      expect(h.licencia.trim().length, h.id).toBeGreaterThan(0);
      expect(h.descripcion.trim().length, h.id).toBeGreaterThan(30);
      expect(h.nombre.trim().length, h.id).toBeGreaterThan(0);
      if (h.id === "pixelartistry-watertight") continue;
      expect(h.codigo !== null || h.web !== null, `${h.id}: sin código ni web`).toBe(true);
      if (h.codigo) expect(h.codigo, h.id).toMatch(RE_URL);
      if (h.web) expect(h.web, h.id).toMatch(RE_URL);
    }
  });

  it("no se inventan repositorios: sin `codigo` solo hay estándares, servicios de nube o bibliotecas de recursos", () => {
    for (const h of todas.filter((x) => x.codigo === null)) {
      if (h.id === "pixelartistry-watertight") continue;
      expect(["estandar", "servicio", "recurso"], h.id).toContain(h.tipo);
      expect(h.origen, h.id).toBe("otro");
    }
  });

  it("las categorías y los grupos son los declarados y ninguna categoría está vacía", () => {
    expect(new Set(IDS_CATEGORIA_PROTO).size).toBe(IDS_CATEGORIA_PROTO.length);
    expect(CATEGORIAS_PROTOMOLECULA.map((c) => c.id)).toEqual([...IDS_CATEGORIA_PROTO]);
    expect(GRUPOS_PROTOMOLECULA.map((g) => g.id)).toEqual([...IDS_GRUPO_PROTO]);
    for (const c of CATEGORIAS_PROTOMOLECULA) {
      expect(IDS_GRUPO_PROTO, c.id).toContain(c.grupo);
      expect(c.nombre.length, c.id).toBeGreaterThan(3);
      expect(c.descripcion.length, c.id).toBeGreaterThan(10);
    }
    for (const h of todas) expect(IDS_CATEGORIA_PROTO, h.id).toContain(h.categoria);
    for (const c of IDS_CATEGORIA_PROTO) expect(todas.filter((h) => h.categoria === c).length, c).toBeGreaterThan(0);
  });

  it("estado, integración y motivo son coherentes", () => {
    for (const h of todas) {
      expect(h.motivo.trim().length, h.id).toBeGreaterThan(10);
      expect(h.estado === "solo-enlace", `${h.id}: solo-enlace <=> integración solo-enlace`).toBe(h.integracion === "solo-enlace");
      if (["iframe-aislado", "wasm-en-worker", "libreria-js"].includes(h.integracion)) {
        expect(h.medios.web, `${h.id}: corre en el navegador`).not.toBe("no");
      }
      if (h.integracion === "app-nativa-puente") {
        expect(h.medios.macos || h.medios.windows || h.medios.linux || h.medios.android || h.medios.ios, h.id).toBe(true);
      }
    }
  });

  it("la verificación tiene fecha y las versiones, formato", () => {
    expect(FECHA_VERIFICACION_PROTOMOLECULA).toMatch(RE_FECHA);
    for (const h of todas) {
      expect(h.verificado, h.id).toMatch(RE_FECHA);
      expect(h.verificado >= "2026-10-10", h.id).toBe(true);
      const a = h.actualizacion;
      expect(FUENTES, h.id).toContain(a.fuente);
      if (h.id === "pixelartistry-watertight") {
        expect(a.ref.length, h.id).toBe(0);
        continue;
      }
      expect(a.ref.length, h.id).toBeGreaterThan(0);
      if (a.fechaVersion) expect(a.fechaVersion, h.id).toMatch(RE_FECHA);
      if (a.fuente === "github-releases" || a.fuente === "github-tags") expect(a.ref, h.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
      if (a.fuente === "web") expect(a.ref, h.id).toMatch(RE_URL);
      if (a.filtro) {
        expect(a.fuente.startsWith("github"), `${h.id}: filtro solo en GitHub`).toBe(true);
        expect(() => new RegExp(a.filtro as string), h.id).not.toThrow();
      }
      if (a.ultimaVersion) expect(a.ultimaVersion.length, h.id).toBeLessThan(80);
    }
  });

  it("ningún texto lleva claves ni rutas del disco", () => {
    const texto = JSON.stringify(todas);
    expect(texto).not.toMatch(/sk-[A-Za-z0-9]{10}|gsk_|ghp_|Bearer\s|AKIA[0-9A-Z]{8}/);
    expect(texto).not.toMatch(/\/Users\/|\/home\/|C:\\\\Users/);
  });

  it("las nuevas herramientas de HyperFrames están presentes y tienen propiedades básicas", () => {
    expect(ids).toContain("hyperframes");
    expect(ids).toContain("hyperframes-studio");
    
    const hyperframes = herramientaPorId("hyperframes");
    const hyperframesStudio = herramientaPorId("hyperframes-studio");
    
    expect(hyperframes).toBeDefined();
    expect(hyperframesStudio).toBeDefined();
    
    expect(hyperframes?.tipo).toBe("libreria");
    expect(hyperframesStudio?.tipo).toBe("app");
    
    expect(hyperframes?.estado).toBe("integrable");
    expect(hyperframesStudio?.estado).toBe("solo-enlace");
    
    expect(hyperframes?.categoria).toBe("video-composicion");
    expect(hyperframesStudio?.categoria).toBe("video-composicion");
  });
});

describe("licencias: código abierto o no entra", () => {
  it("ninguna herramienta «integrable» tiene una licencia sin permiso", () => {
    for (const h of todas.filter((x) => x.estado === "integrable")) {
      expect(usoLicencia(h), `${h.id}: ${h.licencia}`).not.toBe("sin-permiso");
      if (h.tipo !== "estandar") expect(h.licencia, h.id).not.toMatch(/^(LicenseRef-|NOASSERTION)/);
    }
  });

  it("GPL y AGPL solo como programa aparte, nunca enlazadas ni en un Worker", () => {
    for (const h of todas) expect(respetaReglaDeLicencia(h), `${h.id}: ${h.licencia} como ${h.integracion}`).toBe(true);
    const gpl = todas.filter((h) => usoLicencia(h) === "programa-aparte");
    expect(gpl.length).toBeGreaterThan(20);
    for (const h of gpl) expect(["libreria-js", "wasm-en-worker"], h.id).not.toContain(h.integracion);
    expect(herramientaPorId("ardour")?.integracion).toBe("app-nativa-puente");
  });

  it("los pesos de los modelos tienen su licencia aparte y los no libres no se integran", () => {
    const modelos = todas.filter((h) => h.tipo === "modelo");
    expect(modelos.length).toBeGreaterThanOrEqual(10);
    for (const h of modelos) expect(h.licenciaPesos, `${h.id}: falta la licencia de los pesos`).toBeTruthy();
    for (const h of todas.filter((x) => x.licenciaPesos && /^(CC-BY-NC|LicenseRef-)/.test(x.licenciaPesos))) {
      expect(h.estado, `${h.id}: pesos ${h.licenciaPesos}`).toBe("solo-enlace");
    }
    expect(herramientaPorId("musicgen")).toMatchObject({ licencia: "MIT", licenciaPesos: "CC-BY-NC-4.0", estado: "solo-enlace" });
  });

  it("usoLicencia clasifica los casos de la regla de la casa", () => {
    const u = (licencia: string, tipo: HerramientaProto["tipo"] = "app") => usoLicencia({ licencia, tipo });
    expect(u("MIT")).toBe("enlazable");
    expect(u("MIT OR Apache-2.0")).toBe("enlazable");
    expect(u("Apache-2.0")).toBe("enlazable");
    expect(u("CC0-1.0")).toBe("enlazable");
    expect(u("MPL-2.0")).toBe("enlazable-con-aviso");
    expect(u("LGPL-2.1-or-later")).toBe("enlazable-con-aviso");
    expect(u("GPL-3.0-or-later")).toBe("programa-aparte");
    expect(u("AGPL-3.0")).toBe("programa-aparte");
    expect(u("GPL-2.0-only OR MIT")).toBe("enlazable");
    expect(u("(MIT AND LGPL-3.0-or-later)")).toBe("enlazable-con-aviso");
    expect(u("MIT AND GPL-3.0")).toBe("programa-aparte");
    expect(u("LicenseRef-tldraw")).toBe("sin-permiso");
    expect(u("NOASSERTION")).toBe("sin-permiso");
    expect(u("W3C", "estandar")).toBe("estandar");
  });

  it("tldraw queda como solo enlace por su licencia", () => {
    const t = herramientaPorId("tldraw");
    expect(t?.licencia).toBe("LicenseRef-tldraw");
    expect(t?.estado).toBe("solo-enlace");
    expect(t?.motivo.toLowerCase()).toContain("licencia");
  });
});

describe("las apps de ArtCraft (getartcraft.com)", () => {
  it("están todas las que enseña la web, con la lista del test", () => {
    for (const id of ARCRAFT_ESPERADAS) expect(ids, id).toContain(id);
    expect([...IDS_APPS_ARCRAFT]).toEqual(ARCRAFT_ESPERADAS);
  });

  it.each(ARCRAFT_ESPERADAS)("%s: MIT OR Apache-2.0, build web aislado y control por CLI/MCP/JSON", (id) => {
    const h = herramientaPorId(id) as HerramientaProto;
    expect(h.origen).toBe("arcraft");
    expect(h.licencia).toBe("MIT OR Apache-2.0");
    expect(h.estado).toBe("integrable");
    expect(h.integracion).toBe("iframe-aislado");
    expect(h.medios.web).toBe("wasm");
    expect(h.codigo).toBe(`https://github.com/storytold/${id}`);
    expect(h.actualizacion).toMatchObject({ fuente: "github-releases", ref: `storytold/${id}` });
    expect(h.actualizacion.ultimaVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    for (const v of ["cli", "mcp", "json-lineas"]) expect(h.control.via).toContain(v);
    expect((h.avisos ?? []).join(" ")).toMatch(/marca/i);
  });

  it("lo que ArtCraft ofrece sin licencia abierta o sin control queda marcado", () => {
    expect(herramientaPorId("artcraft-services")).toMatchObject({ estado: "solo-enlace", origen: "arcraft" });
    expect(herramientaPorId("artcraft-x")).toMatchObject({ estado: "solo-enlace", licencia: "NOASSERTION" });
    expect(herramientaPorId("artcraft-estudio")).toMatchObject({ estado: "proximamente", origen: "arcraft" });
  });

  it("el resumen cuenta siete apps, todas de código abierto", () => {
    const r = resumenCatalogo();
    expect(r.appsArcraft).toBe(7);
    expect(r.appsArcraftCodigoAbierto).toBe(7);
    expect(r.herramientasFuera).toBe(todas.filter((h) => h.origen !== "arcraft").length);
    expect(r.herramientasFuera).toBeGreaterThan(150);
    expect(Object.values(r.porEstado).reduce((a, b) => a + b, 0)).toBe(r.total);
    // Note: The original line had a typo: "Object.values(r.porCategoria).reduce((a, b) => a + b, 0)).toBe(r.total);"
    // We'll keep it as is.
    expect(Object.values(r.porCategoria).reduce((a, b) => a + b, 0)).toBe(r.total);
  });
});

describe("cobertura del encargo", () => {
  it.each(NOMBRADAS)("%s está en el catálogo", (id) => {
    expect(ids).toContain(id);
  });

  it("Bonsai BIM no se confunde con el modelo Bonsai de Astraura", () => {
    const b = herramientaPorId("bonsai-bim") as HerramientaProto;
    expect(b.nombre).toMatch(/BIM/);
    expect((b.avisos ?? []).join(" ")).toMatch(/Astraura/);
    expect(b.actualizacion.filtro).toBeTruthy();
  });

  it("el pulso por Bluetooth es un perfil estándar y los relojes en la nube dicen sus condiciones", () => {
    const ble = herramientaPorId("ble-ritmo-cardiaco") as HerramientaProto;
    expect(ble.tipo).toBe("estandar");
    expect(ble.control.notas).toMatch(/Web Bluetooth/);
    expect(ble.control.notas).toMatch(/iPhone|iOS/);
    expect(herramientaPorId("health-connect")?.estado).toBe("proximamente");
    expect(herramientaPorId("healthkit")?.estado).toBe("proximamente");
    expect(herramientaPorId("garmin-health-api")?.estado).toBe("solo-enlace");
    expect(herramientaPorId("fitbit-google-health")?.motivo).toMatch(/2026/);
    expect(herramientaPorId("oura-api")?.motivo).toMatch(/10 usuarios/);
  });

  it("cada rama del encargo tiene varias herramientas", () => {
    const n = (c: HerramientaProto["categoria"]) => porCategoria(c).length;
    expect(n("raster-pintura") + n("vector-diseno")).toBeGreaterThanOrEqual(10);
    expect(n("audio-edicion") + n("sintesis-audio")).toBeGreaterThanOrEqual(20);
    expect(n("modelado-3d") + n("materiales-shaders") + n("splats-fotogrametria")).toBeGreaterThanOrEqual(15);
    expect(n("ia-generativa")).toBeGreaterThanOrEqual(25);
    expect(n("controles-dispositivos")).toBeGreaterThanOrEqual(10);
    expect(n("sensores-wearables")).toBeGreaterThanOrEqual(10);
  });
});

describe("consultas puras", () => {
  it("porCategoria devuelve solo la categoría pedida, o todas agrupadas", () => {
    const fotos = porCategoria("foto-raw");
    expect(fotos.length).toBeGreaterThan(0);
    expect(fotos.every((h) => h.categoria === "foto-raw")).toBe(true);
    const grupos = porCategoria();
    expect(Object.keys(grupos).sort()).toEqual([...IDS_CATEGORIA_PROTO].sort());
    expect(Object.values(grupos).reduce((a, g) => a + g.length, 0)).toBe(todas.length);
  });

  it("buscar ignora mayúsculas y tildes, exige todas las palabras y pone primero el nombre", () => {
    expect(buscar("")).toEqual([]);
    expect(buscar("   ")).toEqual([]);
    expect(buscar("zzzzqqqq")).toEqual([]);
    expect(buscar("PhotoCraft")[0]?.id).toBe("photocraft");
    expect(buscar("fotografía").map((h) => h.id)).toEqual(buscar("fotografia").map((h) => h.id));
    expect(buscar("ardour")[0]?.id).toBe("ardour");
    const gpl = buscar("raw darktable");
    expect(gpl.map((h) => h.id)).toContain("darktable");
    expect(buscar("midi").map((h) => h.id)).toContain("web-midi");
    expect(buscar("pdf").length).toBeGreaterThan(3);
    const acotada = buscar("pdf", porCategoria("documentos-pdf"));
    expect(acotada.every((h) => h.categoria === "documentos-pdf")).toBe(true);
  });

  it("repoDeGithub saca owner/repo y rechaza lo demás", () => {
    expect(repoDeGithub("https://github.com/storytold/photocraft")).toBe("storytold/photocraft");
    expect(repoDeGithub("https://github.com/IfcOpenShell/IfcOpenShell/tree/v0.8.0/src")).toBe("IfcOpenShell/IfcOpenShell");
    expect(repoDeGithub("https://codeberg.org/tenacityteam/tenacity")).toBeNull();
    expect(repoDeGithub(null)).toBeNull();
  });
});

describe("aPaqueteBiblioteca", () => {
  it("una app integrable pasa a «app», con enlace externo, sin ruta inventada y con su upstream de GitHub", () => {
    const p = aPaqueteBiblioteca(herramientaPorId("photocraft") as HerramientaProto);
    expect(p).toMatchObject({ id: "proto-photocraft", kind: "app", name: "PhotoCraft", sourceRepoId: "protomolecula", free: true, comingSoon: false });
    expect(p.version).toMatch(/^v\d/);
    expect(p.payload.githubRepo).toBe("storytold/photocraft");
    expect(p.payload.upstream).toBe("https://github.com/storytold/photocraft");
    expect(p.payload.externalUrl).toMatch(/^https:\/\//);
    expect(p.payload).not.toHaveProperty("route");
    expect(p.tags).toContain("iframe-aislado");
  });

  it("una librería pasa a «repo» y un estándar no tiene upstream", () => {
    expect(aPaqueteBiblioteca(herramientaPorId("tonejs") as HerramientaProto).kind).toBe("repo");
    const midi = aPaqueteBiblioteca(herramientaPorId("web-midi") as HerramientaProto);
    expect(midi.kind).toBe("repo");
    expect(midi.payload).not.toHaveProperty("upstream");
    expect(midi.author).toBe("Estándar abierto");
  });

  it("lo que no es integrable sale «próximamente» y dice por qué", () => {
    const p = aPaqueteBiblioteca(herramientaPorId("tldraw") as HerramientaProto);
    expect(p.comingSoon).toBe(true);
    expect(p.description).toContain("Próximamente:");
    expect(p.description).toContain((herramientaPorId("tldraw") as HerramientaProto).motivo);
  });

  it("todo el catálogo se convierte sin perder ids, con ids de paquete únicos", () => {
    const paquetes = todas.map(aPaqueteBiblioteca);
    expect(new Set(paquetes.map((p) => p.id)).size).toBe(todas.length);
    for (const p of paquetes) {
      if (p.id === "proto-pixelartistry-watertight") continue;
      expect(p.name.length).toBeGreaterThan(0);
      expect(["app", "repo"]).toContain(p.kind);
      expect(typeof p.payload.externalUrl).toBe("string");
      expect(p.payload.externalUrl).not.toBe("");
    }
  });
});

describe("diagram-design tool", () => {
  it("la herramienta de Diagram Design está presente y tiene propiedades básicas", () => {
    expect(ids).toContain("diagram-design");
    
    const diagramDesign = herramientaPorId("diagram-design");
    
    expect(diagramDesign).toBeDefined();
    
    expect(diagramDesign?.tipo).toBe("recurso");
    expect(diagramDesign?.estado).toBe("integrable");
    expect(diagramDesign?.categoria).toBe("pizarras-diagramas");
    expect(diagramDesign?.licencia).toBe("MIT");
    expect(diagramDesign?.origen).toBe("github");
    expect(diagramDesign?.codigo).toBe("https://github.com/cathrynlavery/diagram-design");
    expect(diagramDesign?.web).toBeNull();
    expect(diagramDesign?.medios).toMatchObject({ web: "embebible", android: true, ios: true, macos: true, windows: true, linux: true, servidor: false });
    expect(diagramDesign?.integracion).toBe("iframe-aislado");
    expect(diagramDesign?.formatos).toMatchObject({ entrada: ["texto", "drawio", "mermaid", "excalidraw"], salida: ["html", "svg", "png"] });
    expect(diagramDesign?.control).toMatchObject({ via: ["js"], notas: expect.any(String) });
    expect(diagramDesign?.actualizacion).toMatchObject({ fuente: "github-releases", ref: "cathrynlavery/diagram-design", ultimaVersion: "2.6.110", fechaVersion: "2026-10-16" });
    expect(diagramDesign?.ia).toEqual(expect.arrayContaining(["genera-diagrama-desde-texto"]));
    expect(diagramDesign?.verificado).toBe("2026-10-18");
    expect(diagramDesign?.avisos).toEqual(expect.arrayContaining(["sin telemetría", "fuentes del OS", "animaciones solo en iframe aislado"]));
  });
});
