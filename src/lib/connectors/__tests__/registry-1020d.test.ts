import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";
import type { Connector } from "../model";

const NUEVOS = [
  {
    id: "comfyui-flujos",
    repo: "Comfy-Org/ComfyUI",
    nombreVariable: "COMFYUI_URL",
    recommended: true,
  },
  {
    id: "libretranslate-local",
    repo: "LibreTranslate/LibreTranslate",
    nombreVariable: "LIBRETRANSLATE_URL",
    recommended: true,
  },
  {
    id: "coolify-servidores",
    repo: "coollabsio/coolify",
    nombreVariable: "COOLIFY_URL",
    recommended: false,
  },
  {
    id: "openhands-agent-server",
    repo: "OpenHands/OpenHands",
    nombreVariable: null,
    recommended: false,
  },
  {
    id: "archivebox-archivo",
    repo: "ArchiveBox/ArchiveBox",
    nombreVariable: null,
    recommended: false,
  },
];

describe("registry-1020d · conectores autoalojados (Ola 1020U)", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los cinco existen con su repo canónico", () => {
    for (const n of NUEVOS) {
      const c: Connector | undefined = CONNECTORS_BY_ID[n.id];
      expect(c, `falta ${n.id}`).toBeDefined();
      expect(c.repo).toMatch(/^https:\/\/github\.com\//);
      expect(c.repo).toContain(n.repo);
      expect(c.kind).toBe("oss");
      expect(c.free).toBe(true);
      expect(c.description).toBeTruthy();
      expect(c.configHint).toBeTruthy();
    }
  });

  it("recommended solo ComfyUI y LibreTranslate", () => {
    for (const n of NUEVOS) {
      expect(CONNECTORS_BY_ID[n.id].recommended).toBe(n.recommended);
    }
  });

  it("ninguno lleva un valor de clave: solo nombres de variables", () => {
    const valorClave = /(sk|ghp|figd|xoxb|AKIA)[-_][A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9_]{10,}|Bearer\s+"<[^>]*>"/;
    for (const n of NUEVOS) {
      const c = CONNECTORS_BY_ID[n.id];
      const texto = JSON.stringify({
        description: c.description,
        configHint: c.configHint,
        docsUrl: c.docsUrl,
      });
      expect(texto, `${n.id} parece llevar un valor de clave`).not.toMatch(valorClave);
    }
    expect(CONNECTORS_BY_ID["comfyui-flujos"].configHint).toContain("COMFYUI_URL");
    expect(CONNECTORS_BY_ID["libretranslate-local"].configHint).toContain("LIBRETRANSLATE_URL");
    expect(CONNECTORS_BY_ID["libretranslate-local"].configHint).toContain(
      "LIBRETRANSLATE_API_KEY",
    );
    expect(CONNECTORS_BY_ID["coolify-servidores"].configHint).toContain("COOLIFY_URL");
    expect(CONNECTORS_BY_ID["coolify-servidores"].configHint).toContain("COOLIFY_API_TOKEN");
  });

  it("honestidad de Coolify, OpenHands y ArchiveBox", () => {
    expect(CONNECTORS_BY_ID["coolify-servidores"].description).toMatch(/SOLO LECTURA/);
    expect(CONNECTORS_BY_ID["coolify-servidores"].description).toMatch(/rutas exactas de despliegue/);
    expect(CONNECTORS_BY_ID["openhands-agent-server"].description).toMatch(
      /pendiente de verificar su API/,
    );
    expect(CONNECTORS_BY_ID["archivebox-archivo"].description).toMatch(/archive\.org/);
    expect(CONNECTORS_BY_ID["archivebox-archivo"].description).toMatch(/APAGADO/);
  });

  it("LibreTranslate declara la clave opcional, ComfyUI sin clave", () => {
    expect(CONNECTORS_BY_ID["libretranslate-local"].authType).toBe("localEndpoint");
    expect(CONNECTORS_BY_ID["libretranslate-local"].description).toMatch(/opcional/);
    expect(CONNECTORS_BY_ID["comfyui-flujos"].description).toMatch(/sin clave|datos/);
  });
});
