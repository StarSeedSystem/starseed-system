import { describe, it, expect } from "vitest";
import { getIntegration } from "@/lib/integrations/registry";

describe("integration-catalog · agent-reach (INV1025B)", () => {
  const agentReach = getIntegration("agent-reach");

  it("existe en el catálogo", () => {
    expect(agentReach).toBeDefined();
    expect(agentReach?.id).toBe("agent-reach");
  });

  it("usa el repo canónico Panniantong/Agent-Reach", () => {
    expect(agentReach?.docsUrl).toBe("https://github.com/Panniantong/Agent-Reach");
  });

  it("el texto de instalación menciona uv tool install y advierte sobre PyPI", () => {
    const note = agentReach?.freeHostingHint ?? "";
    expect(note).toContain("uv tool install");
    expect(note).toContain("https://github.com/Panniantong/Agent-Reach");
    expect(note).not.toContain("pip install agent-reach");
    expect(note).not.toContain("npx agent-reach");
  });

  it("capability read-web incluye GitHub y YouTube, no menciona Reddit/X/LinkedIn (requieren sesión)", () => {
    const capabilities = agentReach?.capabilities?.join(" ") ?? "";
    expect(capabilities).toContain("GitHub");
    expect(capabilities).toContain("YouTube");
    expect(capabilities).not.toContain("Reddit");
    expect(capabilities).not.toContain("LinkedIn");
  });
});