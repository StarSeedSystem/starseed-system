import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPORT_PATH = resolve(
  process.cwd(),
  "memory/aprendizaje-externos/n8n-export/2026-10-11/starseed-producci-n-puentes.json"
);

import { describe, it, expect } from "vitest";

decribe("n8n export structure", () => {
  const data = JSON.parse(readFileSync(EXPORT_PATH, "utf-8"));

  test("contains nodes", () => {
    expect(data.nodes).toBeDefined();
    expect(Array.isArray(data.nodes)).toBeTruthy();
    expect(data.nodes.length).toBeGreaterThanOrEqual(3);
  });

  test("contains 3 webhooks", () => {
    const webhooks = data.nodes.filter(
      (n: any) => n.type === "n8n-nodes-base.webhook"
    );
    expect(webhooks.length).toBe(3);
  });

  test("contains 3 set nodes with required assignments", () => {
    const sets = data.nodes.filter(
      (n: any) => n.type === "n8n-nodes-base.set"
    );
    expect(sets.length).toBe(3);
    sets.forEach((s: any) => {
      const assignments = s.parameters.assignments.assignments;
      const names = assignments.map((a: any) => a.name);
      expect(names).toContain("evento");
      expect(names).toContain("sha");
      expect(names).toContain("medios");
      expect(names).toContain("tareas");
      expect(names).toContain("momento");
      expect(names).toContain("datos");
    });
  });
});
