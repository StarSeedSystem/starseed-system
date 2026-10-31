import { describe, it, expect } from "vitest";
import { getIntegration, type IntegrationDescriptorExt } from "@/lib/integrations/registry";

/** Reúne todos los textos de una entrada del registro para revisarlos. */
function textosDeEntrada(entry: IntegrationDescriptorExt | undefined): string[] {
  if (!entry) return [];
  const textos: string[] = [`ENTRADA ${entry.id}: ${entry.label}`];
  for (const c of entry.capabilities) textos.push(`CAP: ${c}`);
  for (const a of entry.actions) textos.push(`ACCION ${a.id}: ${a.label} — ${a.description}`);
  if (entry.freeHostingHint) textos.push(`HINT: ${entry.freeHostingHint}`);
  if (entry.notes) textos.push(`NOTAS: ${entry.notes}`);
  return textos;
}

describe("integration-catalog · agent-reach (INV1025B)", () => {
  const agentReach = getIntegration("agent-reach") as IntegrationDescriptorExt | undefined;

  it("existe en el catálogo", () => {
    expect(agentReach).toBeDefined();
    expect(agentReach?.id).toBe("agent-reach");
  });

  it("usa el repo canónico Panniantong/Agent-Reach", () => {
    expect(agentReach?.docsUrl).toBe("https://github.com/Panniantong/Agent-Reach");
  });

  it("ningún texto de la entrada manda a pip install agent-reach ni npx agent-reach", () => {
    for (const texto of textosDeEntrada(agentReach)) {
      expect(texto).not.toContain("pip install agent-reach");
      expect(texto).not.toContain("npx agent-reach");
    }
  });

  it("la instalación que manda es uv + zip de GitHub y advierte de PyPI", () => {
    const note = agentReach?.freeHostingHint ?? "";
    expect(note).toContain("uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip");
    expect(note).toContain("PyPI");
  });

  it("capabilities dicen la verdad: Exa/Jina (terceros), GitHub, YouTube, V2EX, Bilibili", () => {
    const caps = agentReach?.capabilities?.join(" ") ?? "";
    expect(caps).toContain("Exa");
    expect(caps).toContain("Jina");
    expect(caps).toContain("GitHub");
    expect(caps).toContain("YouTube");
    expect(caps).toContain("V2EX");
    expect(caps).toContain("Bilibili");
  });

  it("Reddit, X y LinkedIn aparecen en capabilities como APAGADOS por sesión (R1)", () => {
    const caps = agentReach?.capabilities?.join(" ") ?? "";
    expect(caps).toContain("Reddit");
    expect(caps).toContain("LinkedIn");
    expect(caps).toMatch(/apagados|Apagado/i);
    expect(caps).toMatch(/NEED_LOGIN_BLOQUEADO/);
  });

  it("las actions conservan los mismos ids de siempre", () => {
    const ids = (agentReach?.actions ?? []).map((a) => a.id);
    expect(ids).toEqual(["web-search", "read-web", "youtube-transcript", "github-read", "reddit-search", "health"]);
  });
});
