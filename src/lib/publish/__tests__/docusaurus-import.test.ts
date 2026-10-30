import { describe, expect, it } from "vitest";
import { aNodosEdu, leerDocusaurus, rutaDesdeCarpeta } from "../docusaurus-import";
import { docusaurusDesdeEntradas } from "../docusaurus-export";
import type { EntradaDoc } from "../docusaurus-export";

const archivo = (path: string, content: string) => ({ path, content });

describe("rutaDesdeCarpeta", () => {
  it("deja la carpeta docs/ seleccionada como raíz y corta lo anterior a docs", () => {
    expect(rutaDesdeCarpeta("docs/teoria/medida.md")).toBe("docs/teoria/medida.md");
    expect(rutaDesdeCarpeta("mi-sitio/docs/teoria/medida.md")).toBe("docs/teoria/medida.md");
    expect(rutaDesdeCarpeta("mis-sitios\\sitio1\\docs\\teoria\\medida.md")).toBe("docs/teoria/medida.md");
    expect(rutaDesdeCarpeta("carpeta/teoria/medida.md")).toBe("carpeta/teoria/medida.md");
  });
});

describe("leerDocusaurus · reglas de seguridad", () => {
  it("rechaza .mdx, código, configuración y tipos no admitidos con su motivo", () => {
    const r = leerDocusaurus([
      archivo("docs/guia.mdx", "# Guía"),
      archivo("sidebars.js", "module.exports = {};"),
      archivo("docusaurus.config.ts", "export default {};"),
      archivo("docs/grafico.png", "binario"),
      archivo("docs/aplicado.md", "# Aplicado"),
    ]);
    expect(r.rechazados).toContainEqual({ path: "docs/guia.mdx", motivo: "MDX es código" });
    expect(r.rechazados).toContainEqual({ path: "sidebars.js", motivo: "configuración: nunca se lee ni se ejecuta" });
    expect(r.rechazados).toContainEqual({ path: "docusaurus.config.ts", motivo: "configuración: nunca se lee ni se ejecuta" });
    expect(r.rechazados).toContainEqual({ path: "docs/grafico.png", motivo: "tipo no admitido" });
    expect(r.docs.map((d) => d.ruta)).toEqual(["docs/aplicado.md"]);
    expect(r.docs[0]?.titulo).toBe("Aplicado");
  });

  it("rechaza YAML con anclas y no confunde el cierre del front matter", () => {
    const r = leerDocusaurus([
      archivo("docs/ancla.md", "---\ntitle: Hola &ancla\n---\nCuerpo"),
      archivo("docs/bien.md", "---\ntitle: Bien\n---\n\n---\nCuerpo tras una línea de draws"),
    ]);
    expect(r.rechazados).toContainEqual({ path: "docs/ancla.md", motivo: "YAML avanzado" });
    expect(r.docs.map((d) => d.ruta)).toEqual(["docs/bien.md"]);
    expect(r.docs[0]?.titulo).toBe("Bien");
  });

  it("limpia <script>, líneas import/export y javascript: del cuerpo", () => {
    const r = leerDocusaurus([
      archivo(
        "docs/riesgo.md",
        "## Riesgo\n\n<script>alert(1)</script>\n\nimport x from 'y'\n\n[enlace](javascript:alert(1))\n\nTexto visible\n",
      ),
    ]);
    expect(r.docs).toHaveLength(1);
    const cuerpo = r.docs[0]?.cuerpo ?? "";
    expect(cuerpo).not.toContain("<script");
    expect(cuerpo).not.toContain("alert(1)");
    expect(cuerpo).not.toContain("from 'y'");
    expect(cuerpo).toContain("enlace");
    expect(cuerpo).toContain("Texto visible");
  });
});

describe("leerDocusaurus · ida y vuelta con docusaurusDesdeEntradas", () => {
  it("devuelve los mismos títulos, el mismo orden y las mismas carpetas", () => {
    const entradas: EntradaDoc[] = [
      { id: "intro", titulo: "Introducción", grupo: "Fundamentos", orden: 1, cuerpo: "Hola y bienvenida" },
      { id: "avanzado", titulo: "Avanzado", grupo: "Fundamentos", orden: 2, cuerpo: "Temas con detalle" },
      { id: "ajustes", titulo: "Ajustes", grupo: "Fundamentos", orden: 3, cuerpo: "Cómo ajustar" },
    ];
    const r = leerDocusaurus(docusaurusDesdeEntradas(entradas));
    const sinLeeme = r.docs.filter((d) => !d.titulo.startsWith("LEEME"));
    expect(sinLeeme).toHaveLength(entradas.length);
    expect(sinLeeme.map((d) => d.titulo)).toEqual(entradas.map((e) => e.titulo));
    expect(sinLeeme.map((d) => d.orden)).toEqual(entradas.map((e) => e.orden));
    expect(sinLeeme.map((d) => d.carpetas)).toEqual(entradas.map(() => ["fundamentos"]));
    expect(r.categorias).toEqual([{ ruta: "fundamentos", label: "Fundamentos", orden: null }]);
  });

  it("categoriza _category_.json válido y rechaza el JSON inválido", () => {
    const r = leerDocusaurus([
      archivo("docs/teoria/_category_.json", JSON.stringify({ label: "Teoría", position: 2 })),
      archivo("docs/teoria/medida.md", "---\ntitle: Medida\nsidebar_position: 1\n---\nMide"),
      archivo("docs/roto/_category_.json", "{ label: sin comillas"),
      archivo("docs/otra.md", "# Otra"),
    ]);
    expect(r.rechazados).toContainEqual({ path: "docs/roto/_category_.json", motivo: "JSON inválido" });
    expect(r.docs.map((d) => d.orden)).toEqual([1, null]);
    expect(r.categorias.find((c) => c.ruta === "teoria")).toEqual({ ruta: "teoria", label: "Teoría", orden: 2 });
  });

  it("rechaza por límites: 500 archivos como mucho y 200 KB por archivo", () => {
    const exceso = Array.from({ length: 501 }, (_, i) =>
      archivo(`docs/f${String(i).padStart(4, "0")}.md`, `# Archivo ${i}`),);
    const rExceso = leerDocusaurus(exceso);
    expect(rExceso.docs).toHaveLength(500);
    expect(rExceso.rechazados).toEqual([{ path: "docs/f0500.md", motivo: "límite de 500 archivos" }]);
    const grande = archivo("docs/colosal.md", `# Colosal\n\n${"x".repeat(200 * 1024)}`);
    const rGrande = leerDocusaurus([grande]);
    expect(rGrande.docs).toEqual([]);
    expect(rGrande.rechazados).toEqual([{ path: "docs/colosal.md", motivo: "supera los 200 KB" }]);
  });
});

describe("aNodosEdu", () => {
  it("convierte carpetas y documentos en nodos con parentId coherente", () => {
    const r = leerDocusaurus([
      archivo("docs/teoria/_category_.json", JSON.stringify({ label: "Teoría", position: 1 })),
      archivo("docs/teoria/medida/_category_.json", JSON.stringify({ label: "Medida", position: 1 })),
      archivo("docs/teoria/medida/escala.md", "---\ntitle: Escala\nsidebar_position: 1\n---\nMide*\n\n_riesgo_\n`código`"),
      archivo("docs/teoria/medida/profunda/tercer.md", "---\ntitle: Tercer\n---\n¿Qué es esto?"),
      archivo("docs/practica.md", "# Práctica"),
    ]);
    const nodos = aNodosEdu(r), ids = new Set(nodos.map((n) => n.id));
    expect(new Set(ids).size).toBe(nodos.length);
    for (const n of nodos) expect(n.custom).toBe(true);
    for (const n of nodos) expect(n.parentId === null || ids.has(n.parentId)).toBe(true);
    const teoria = nodos.find((n) => n.name === "Teoría");
    expect(teoria).toMatchObject({ kind: "category", parentId: null, id: "docusaurus:carpeta:teoria" });
    const medida = nodos.find((n) => n.name === "Medida");
    expect(medida).toMatchObject({ kind: "topic", parentId: "docusaurus:carpeta:teoria" });
    const escala = nodos.find((n) => n.name === "Escala");
    expect(escala).toMatchObject({ kind: "subtopic", parentId: "docusaurus:carpeta:teoria/medida", blurb: "Mide riesgo código" });
    const tercer = nodos.find((n) => n.name === "Tercer");
    expect(tercer?.id).toBe("docusaurus:docs/teoria/medida/profunda/tercer.md");
    expect(tercer?.parentId).toBe("docusaurus:carpeta:teoria/medida/profunda");
    expect(nodos.find((n) => n.id === "docusaurus:carpeta:teoria/medida/profunda")).toMatchObject({ kind: "subtopic", parentId: "docusaurus:carpeta:teoria/medida" });
    const practica = nodos.find((n) => n.name === "Práctica");
    expect(practica).toMatchObject({ id: "docusaurus:docs/practica.md", parentId: null });
  });

  it("corta el blurb a 280 caracteres sin marcas", () => {
    const r = leerDocusaurus([archivo("docs/largo.md", `# Largo\n\n${"a".repeat(300)}`)]);
    const nodos = aNodosEdu(r);
    expect(nodos[0]?.blurb).toHaveLength(280);
    expect(nodos[0]?.blurb).not.toContain("#");
  });
});
