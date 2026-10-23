import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const NUEVOS: Record<
  string,
  { category: string; authType: string; configHint: string; salvaguarda: RegExp }
> = {
  "penpot-selfhost": {
    category: "custom",
    authType: "apiKey",
    configHint: "http://<host>:9001",
    salvaguarda: /plugins/i,
  },
  "pocketbase-local": {
    category: "storage",
    authType: "localEndpoint",
    configHint: "http://127.0.0.1:8090",
    salvaguarda: /1\.0/i,
  },
  "openmaic-aulas": {
    category: "custom",
    authType: "localEndpoint",
    configHint: "http://<host>:3000",
    salvaguarda: /grupo de confianza/i,
  },
  "nextcloud-aio": {
    category: "storage",
    authType: "apiKey",
    configHint: "https://<tu-dominio>/remote.php/dav",
    salvaguarda: /pesada/i,
  },
  "chatwoot-buzon": {
    category: "chat",
    authType: "apiKey",
    configHint: "http://<host>:3000/api/v1",
    salvaguarda: /no.*mensajería entre miembros/i,
  },
  "paperclip-oficina": {
    category: "dev",
    authType: "localEndpoint",
    configHint: "http://127.0.0.1:3100",
    salvaguarda: /PAPERCLIP_TELEMETRY_DISABLED=1/,
  },
};

describe("registry-1020c · Hub de Conectores", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los 6 conectores existen con el patrón oss/available/gratis y su repo", () => {
    for (const [id, esperado] of Object.entries(NUEVOS)) {
      const c = CONNECTORS_BY_ID[id];
      expect(c, `falta ${id}`).toBeDefined();
      expect(c.category).toBe(esperado.category);
      expect(c.authType).toBe(esperado.authType);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.repo).toMatch(/^https:\/\/github\.com\//);
      expect(c.configHint).toBe(esperado.configHint);
    }
  });

  it("cada descripción dice licencia, alojamiento y salvaguarda", () => {
    const licencias: Record<string, RegExp> = {
      "penpot-selfhost": /MPL-2\.0/,
      "pocketbase-local": /MIT/,
      "openmaic-aulas": /MIT/,
      "nextcloud-aio": /AGPL-3\.0/,
      "chatwoot-buzon": /MIT/,
      "paperclip-oficina": /MIT/,
    };
    for (const [id, esperado] of Object.entries(NUEVOS)) {
      const desc = CONNECTORS_BY_ID[id].description ?? "";
      expect(desc).toMatch(esperado.salvaguarda);
      expect(desc, `licencia de ${id}`).toMatch(licencias[id]);
    }
    expect(CONNECTORS_BY_ID["chatwoot-buzon"].description).toMatch(
      /malla P2P/i,
    );
    expect(CONNECTORS_BY_ID["openmaic-aulas"].description).toMatch(
      /no aísla usuarios/i,
    );
  });
});
