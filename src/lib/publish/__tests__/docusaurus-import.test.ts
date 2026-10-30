import { describe, expect, it } from "vitest";
import { aNodosEdu, leerDocusaurus } from "../docusaurus-import";
import { docusaurusDesdeEntradas } from "../docusaurus-export";
import type { EntradaDoc } from "../docusaurus-export";

const archivo = (path: string, content: string) => ({ path, content });

describe("leerDocusaurus", () => {
  it("pendiente", () => {
    expect(typeof leerDocusaurus).toBe("function");
    expect(typeof aNodosEdu).toBe("function");
  });
});
