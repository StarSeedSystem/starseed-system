import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

describe("registry-1020c · conectores autoalojables", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("los 6 nuevos conectores presentes con repo de GitHub", () => {
    const nuevos = [
      { id: "penpot-selfhost", repoEsperado: "penpot/penpot" },
      { id: "pocketbase-local", repoEsperado: "pocketbase/pocketbase" },
      { id: "openmaic-aulas", repoEsperado: "THU-MAIC/OpenMAIC" },
      { id: "nextcloud-aio", repoEsperado: "nextcloud/all-in-one" },
      { id: "chatwoot-buzon", repoEsperado: "chatwoot/chatwoot" },
      { id: "paperclip-oficina", repoEsperado: "paperclipai/paperclip" },
    ];
    for (const item of nuevos) {
      expect(CONNECTORS_BY_ID[item.id], `falta ${item.id}`).toBeDefined();
      const c = CONNECTORS_BY_ID[item.id];
      expect(c.repo, `repo de ${item.id}`).toMatch(/github\.com/);
      expect(c.repo, `repo contiene upstream de ${item.id}`).toContain(item.repoEsperado);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.description).toBeDefined();
      expect(c.description!.length).toBeGreaterThan(10);
    }
  });

  it("authType y configHint según contrato", () => {
    const mapa: Record<string, { authType: string; configHint: string }> = {
      "penpot-selfhost": { authType: "apiKey", configHint: "http://<host>:9001" },
      "pocketbase-local": { authType: "localEndpoint", configHint: "http://127.0.0.1:8090" },
      "openmaic-aulas": { authType: "localEndpoint", configHint: "http://<host>:3000" },
      "nextcloud-aio": { authType: "apiKey", configHint: "https://<tu-dominio>/remote.php/dav" },
      "chatwoot-buzon": { authType: "apiKey", configHint: "http://<host>:3000/api/v1" },
      "paperclip-oficina": { authType: "localEndpoint", configHint: "http://127.0.0.1:3100" },
    };
    for (const [id, esperado] of Object.entries(mapa)) {
      const c = CONNECTORS_BY_ID[id];
      expect(c.authType).toBe(esperado.authType);
      expect(c.configHint).toBe(esperado.configHint);
    }
  });

  it("Chatwoot dice que no es mensajería entre miembros", () => {
    const c = CONNECTORS_BY_ID["chatwoot-buzon"];
    const desc = (c.description || "").toLowerCase();
    expect(desc).toContain("mensajería entre miembros");
  });

  it("descripciones honestas: licencia, alojamiento y salvaguarda", () => {
    const mapa: Record<string, string[]> = {
      "penpot-selfhost": ["mpl-2.0", "tu servidor"],
      "pocketbase-local": ["mit", "compatibilidad"],
      "openmaic-aulas": ["mit", "aislamiento entre usuarios"],
      "nextcloud-aio": ["agpl", "contraseña de aplicación"],
      "chatwoot-buzon": ["mit", "enterprise"],
      "paperclip-oficina": ["mit", "paperclip_telemetry_disabled"],
    };
    for (const [id, frases] of Object.entries(mapa)) {
      const c = CONNECTORS_BY_ID[id];
      const desc = (c.description || "").toLowerCase();
      for (const frase of frases) {
        expect(desc, `${id} menciona «${frase}»`).toContain(frase);
      }
    }
  });
});
