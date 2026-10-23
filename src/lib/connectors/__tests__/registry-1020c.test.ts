import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const NUEVOS = [
  { id: "penpot-selfhost", repo: "penpot/penpot", categoria: "custom", auth: "apiKey" },
  { id: "pocketbase-local", repo: "pocketbase/pocketbase", categoria: "storage", auth: "localEndpoint" },
  { id: "openmaic-aulas", repo: "THU-MAIC/OpenMAIC", categoria: "custom", auth: "localEndpoint" },
  { id: "nextcloud-aio", repo: "nextcloud/all-in-one", categoria: "storage", auth: "apiKey" },
  { id: "chatwoot-buzon", repo: "chatwoot/chatwoot", categoria: "chat", auth: "apiKey" },
  { id: "paperclip-oficina", repo: "paperclipai/paperclip", categoria: "dev", auth: "localEndpoint" },
];

describe("registry-1020c · conectores autoalojables", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los 6 presentes con repo de GitHub y los campos pedidos", () => {
    for (const n of NUEVOS) {
      const c = CONNECTORS_BY_ID[n.id];
      expect(c, `falta ${n.id}`).toBeDefined();
      expect(c.repo).toMatch(/^https:\/\/github\.com\//);
      expect(c.repo).toContain(n.repo);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.category).toBe(n.categoria);
      expect(c.authType).toBe(n.auth);
      expect(c.configHint).toBeTruthy();
    }
  });

  it("Chatwoot aclara que no es mensajería entre miembros", () => {
    expect(CONNECTORS_BY_ID["chatwoot-buzon"].description).toMatch(/no es mensajería entre miembros/i);
  });

  it("salvaguardas honestas de OpenMAIC y Paperclip", () => {
    expect(CONNECTORS_BY_ID["openmaic-aulas"].description).toMatch(/una instancia por grupo/i);
    expect(CONNECTORS_BY_ID["paperclip-oficina"].description).toContain("PAPERCLIP_TELEMETRY_DISABLED=1");
  });
});
