/**
 * DSN1025F · Pruebas de la exportación a Docusaurus (módulo puro: sin red ni disco).
 */
import { describe, it, expect } from "vitest";
import type { EduNode } from "@/lib/education/curriculum";
import { TEMAS_SISTEMA, type TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import {
  escaparMd,
  slugDoc,
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  docusaurusDesdeEdu,
  type EntradaDoc,
} from "@/lib/publish/docusaurus-export";

const entrada = (extra: Partial<EntradaDoc> = {}): EntradaDoc => ({
  id: "doc-1", titulo: "Guía de arranque", cuerpo: "El cuerpo de la guía.", ...extra,
});

const NODOS_EDU: EduNode[] = [
  { id: "cat-x", kind: "category", name: "Ciencia", parentId: null, blurb: "El estudio del universo." },
  { id: "top-x", kind: "topic", name: "Física", parentId: "cat-x" },
  { id: "sub-x", kind: "subtopic", name: "Mecánica Clásica", parentId: "top-x", blurb: "El estudio del movimiento." },
];

describe("escaparMd y slugDoc", () => {
  it("escapa {x}, <script>, «import » y «export »", () => {
    expect(escaparMd("{x}")).toBe("&#123;x&#125;");
    expect(escaparMd("<script>")).toBe("&lt;script&gt;");
    expect(escaparMd("import x from 'y'")).toBe("&#105;mport x from 'y'");
    expect(escaparMd("export const a = 1")).toBe("&#101;xport const a = 1");
  });

  it("da slugs en minúsculas ASCII", () => {
    expect(slugDoc("Mecánica Clásica")).toBe("mecanica-clasica");
    expect(slugDoc("  Protomolécula  ")).toBe("protomolecula");
  });
});
