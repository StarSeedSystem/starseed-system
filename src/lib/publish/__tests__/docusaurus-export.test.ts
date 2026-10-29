/**
 * Pruebas del exportador a Docusaurus (DSN1025F) — módulo PURO, sin red ni disco.
 */
import { describe, it, expect } from "vitest";
import {
  escaparMd,
  slugDoc,
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  docusaurusDesdeEdu,
} from "@/lib/publish/docusaurus-export";
import { TEMAS_SISTEMA } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

const leemeDe = (salida: { path: string; content: string }[]): string => {
  const leeme = salida.find((a) => a.path.endsWith("LEEME-DOCUSAURUS.md"));
  expect(leeme).toBeDefined();
  return leeme!.content;
};

const docPorRuta = (salida: { path: string; content: string }[], path: string): string => {
  const archivo = salida.find((a) => a.path === path);
  expect(archivo).toBeDefined();
  return archivo!.content;
};

describe("escaparMd y slugDoc", () => {
  it("escapa llaves, ángulos y la primera letra de import/export", () => {
    const texto = "{x}\n<script>\nimport x from 'y'\nexport const y = 1";
    expect(escaparMd(texto)).toBe("&#123;x&#125;\n&lt;script&gt;\n&#105;mport x from 'y'\n&#101;xport const y = 1");
  });

  it("da slugs ASCII en minúsculas", () => {
    expect(slugDoc("Redes mesh")).toBe("redes-mesh");
    expect(slugDoc("Protomolécula")).toBe("protomolecula");
  });

  it("front matter: título entre comillas aunque lleve dos puntos o comillas", () => {
    const salida = docusaurusDesdeEntradas([
      { id: "guia", titulo: 'Guía: "hola"', cuerpo: "texto" },
    ]);
    expect(docPorRuta(salida, "docs/guia-hola.md")).toContain('title: "Guía: \\"hola\\""');
  });
});

describe("docusaurusDesdeEntradas", () => {
  it("dos entradas con el mismo título dan sufijo -2", () => {
    const salida = docusaurusDesdeEntradas(
      [
        { id: "a", titulo: "Motivo", cuerpo: "primero" },
        { id: "b", titulo: "Motivo", cuerpo: "segundo" },
      ],
      { raiz: "sitio" },
    );
    expect(docPorRuta(salida, "sitio/docs/motivo.md")).toContain("primero");
    expect(docPorRuta(salida, "sitio/docs/motivo-2.md")).toContain("segundo");
  });

  it("el grupo crea su _category_.json con label, position y collapsed en false", () => {
    const salida = docusaurusDesdeEntradas([
      { id: "x", titulo: "Prueba", cuerpo: "cuerpo", grupo: "Grupo de prueba" },
    ]);
    const categoria = docPorRuta(salida, "docs/grupo-de-prueba/_category_.json");
    expect(JSON.parse(categoria)).toEqual({
      label: "Grupo de prueba",
      position: 1,
      collapsed: false,
    });
  });

  it("el resultado es idéntico en dos llamadas", () => {
    const entradas = [
      { id: "a", titulo: "Azul", cuerpo: "{azul}", grupo: "Colores" },
      { id: "b", titulo: "Águila", cuerpo: "<alas>", grupo: "Aves" },
    ];
    expect(docusaurusDesdeEntradas(entradas)).toEqual(docusaurusDesdeEntradas(entradas));
  });
});

describe("docusaurusDesdeGuia", () => {
  it("un archivo por tema, en orden, con sus puntos y «Dónde:»", () => {
    const salida = docusaurusDesdeGuia(TEMAS_SISTEMA, "Guía del sistema");
    const esperadas = TEMAS_SISTEMA.map((tema, i) => `docs/guia-del-sistema/${slugDoc(tema.titulo)}.md`);
    esperadas.forEach((ruta, i) => {
      const contenido = docPorRuta(salida, ruta);
      expect(contenido).toContain(`title: ${JSON.stringify(TEMAS_SISTEMA[i].titulo)}`);
      expect(contenido).toContain(`sidebar_position: ${i + 1}`);
      for (const punto of TEMAS_SISTEMA[i].puntos) {
        expect(contenido).toContain(`- ${punto}`);
      }
      expect(contenido).toContain(`Dónde: ${TEMAS_SISTEMA[i].ruta}`);
      expect(contenido).toContain(`Pregunta a Astraura: ${TEMAS_SISTEMA[i].preguntaAurora}`);
    });
    expect(salida.filter((a) => a.path.startsWith("docs/guia-del-sistema/") && a.path.endsWith(".md")).length).toBe(
      TEMAS_SISTEMA.length,
    );
  });
});

describe("docusaurusDesdeEdu", () => {
  it("un árbol de 3 niveles da carpetas con _category_.json y hoja en .md", () => {
    const nodos: EduNode[] = [
      { id: "c1", kind: "category", name: "Astronomía", parentId: null, blurb: "El cielo." },
      { id: "t1", kind: "topic", name: "Cosmología", parentId: "c1", blurb: "El universo." },
      { id: "s1", kind: "subtopic", name: "Big Bang", parentId: "t1", blurb: "El inicio." },
      { id: "s2", kind: "subtopic", name: "Materia oscura", parentId: "t1" },
    ];
    const salida = docusaurusDesdeEdu(nodos);
    const categoriaRaiz = JSON.parse(docPorRuta(salida, "docs/astronomia/_category_.json"));
    expect(categoriaRaiz).toEqual({ label: "Astronomía", position: 1, collapsed: false });
    const categoriaTema = JSON.parse(docPorRuta(salida, "docs/astronomia/cosmologia/_category_.json"));
    expect(categoriaTema).toEqual({ label: "Cosmología", position: 1, collapsed: false });
    expect(docPorRuta(salida, "docs/astronomia/cosmologia/big-bang.md")).toContain("El inicio.");
    docPorRuta(salida, "docs/astronomia/cosmologia/materia-oscura.md");
    expect(docPorRuta(salida, "docs/astronomia/index.md")).toContain("El cielo.");
  });

  it("ninguna ruta termina en .mdx ni .js ni toca configuración", () => {
    const todas = [
      ...docusaurusDesdeGuia(TEMAS_SISTEMA, "Guía del sistema"),
      ...docusaurusDesdeEdu([
        { id: "c", kind: "category", name: "Ciencia", parentId: null },
        { id: "s", kind: "subtopic", name: "Física", parentId: "c" },
      ]),
      ...docusaurusDesdeEntradas([{ id: "x", titulo: "Prueba", cuerpo: "{x}" }]),
    ];
    for (const archivo of todas) {
      expect(archivo.path.endsWith(".mdx")).toBe(false);
      expect(archivo.path.endsWith(".js")).toBe(false);
      expect(archivo.path.includes("sidebars")).toBe(false);
      expect(archivo.path.includes("docusaurus.config")).toBe(false);
    }
  });

  it("el LEEME nombra los pasos manuales y aporta el formato detectado", () => {
    const leeme = leemeDe(docusaurusDesdeGuia(TEMAS_SISTEMA, "Guía del sistema"));
    expect(leeme).toContain("npm create docusaurus@latest sitio classic");
    expect(leeme).toContain("format: 'detect'");
    expect(leeme).toContain("NO_UPDATE_NOTIFIER=1");
    expect(leeme).toContain("Alex");
  });
});
