import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const NUEVOS = {
  "comfyui-selfhost": { repo: "Comfy-Org/ComfyUI", category: "custom", auth: "localEndpoint", estado: "available", recomendado: true },
  "libretranslate-selfhost": { repo: "LibreTranslate/LibreTranslate", category: "custom", auth: "localEndpoint", estado: "available", recomendado: true },
  "coolify-selfhost": { repo: "coollabsio/coolify", category: "dev", auth: "apiKey", estado: "needs-auth", recomendado: false },
  "openhands-agent-server": { repo: "OpenHands/OpenHands", category: "dev", auth: "localEndpoint", estado: "needs-auth", recomendado: false },
  "archivebox-selfhost": { repo: "ArchiveBox/ArchiveBox", category: "memory", auth: "localEndpoint", estado: "available", recomendado: false },
} as const;

const PATRONES_DE_CLAVE = [
  /sk-[A-Za-z0-9]{8,}/,
  /gh[pousr]_[A-Za-z0-9]{8,}/,
  /Bearer\s+[A-Za-z0-9._-]{12,}/,
  /\b[a-f0-9]{32,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

describe("registry-1020d · conectores autoalojados de la 4.ª tanda", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los cinco existen, son OSS, gratuitos y con su repo canónico", () => {
    for (const [id, esperado] of Object.entries(NUEVOS)) {
      const c = CONNECTORS_BY_ID[id];
      expect(c, `falta ${id}`).toBeDefined();
      expect(c.repo).toBe(`https://github.com/${esperado.repo}`);
      expect(c.kind).toBe("oss");
      expect(c.free).toBe(true);
      expect(c.category).toBe(esperado.category);
      expect(c.authType).toBe(esperado.auth);
      expect(c.status).toBe(esperado.estado);
      expect(c.configHint).toBeTruthy();
    }
  });

  it("solo ComfyUI y LibreTranslate vienen recomendados", () => {
    for (const [id, esperado] of Object.entries(NUEVOS)) {
      expect(CONNECTORS_BY_ID[id].recommended, id).toBe(esperado.recomendado);
    }
  });

  it("la configuración usa nombres de variable, nunca valores de clave", () => {
    const comfy = CONNECTORS_BY_ID["comfyui-selfhost"];
    const libre = CONNECTORS_BY_ID["libretranslate-selfhost"];
    const coolify = CONNECTORS_BY_ID["coolify-selfhost"];
    expect(comfy.configHint).toContain("COMFYUI_URL");
    expect(libre.configHint).toContain("LIBRETRANSLATE_URL");
    expect(libre.description).toContain("LIBRETRANSLATE_API_KEY");
    expect(coolify.configHint).toContain("COOLIFY_URL");
    expect(coolify.configHint).toContain("COOLIFY_API_TOKEN");
  });

  it("ningún campo de los cinco lleva un valor de clave", () => {
    for (const id of Object.keys(NUEVOS)) {
      const texto = JSON.stringify(CONNECTORS_BY_ID[id]);
      for (const patron of PATRONES_DE_CLAVE) {
        expect(texto, `${id} parece llevar una clave`).not.toMatch(patron);
      }
    }
  });

  it("las descripciones son honestas con lo verificado y lo pendiente", () => {
    expect(CONNECTORS_BY_ID["comfyui-selfhost"].description).toMatch(/grafo/i);
    expect(CONNECTORS_BY_ID["coolify-selfhost"].description).toMatch(/solo lectura/i);
    expect(CONNECTORS_BY_ID["openhands-agent-server"].description).toMatch(/pendiente/i);
    expect(CONNECTORS_BY_ID["archivebox-selfhost"].description).toMatch(/archive\.org va APAGADO/i);
  });
});
