import { describe, it, expect } from "vitest";
import { STARSEED_IA_TOOLS_REPO } from "../packages";

describe("Paquetes de repos · BOT1011Zf", () => {
  it("incluye OpenBot (CopilotKit) como repo con comingSoon", () => {
    const pkg = STARSEED_IA_TOOLS_REPO.packages.find((p) => p.id === "repo-openbot");
    expect(pkg, "falta repo-openbot").toBeDefined();
    expect(pkg?.kind).toBe("repo");
    expect(pkg?.comingSoon).toBe(true);
    expect(pkg?.payload?.githubRepo).toBe("CopilotKit/openbot");
  });

  it("incluye OpenDots (CopilotKit) como repo con comingSoon", () => {
    const pkg = STARSEED_IA_TOOLS_REPO.packages.find((p) => p.id === "repo-opendots");
    expect(pkg, "falta repo-opendots").toBeDefined();
    expect(pkg?.kind).toBe("repo");
    expect(pkg?.comingSoon).toBe(true);
    expect(pkg?.payload?.githubRepo).toBe("CopilotKit/OpenDots");
  });
});
