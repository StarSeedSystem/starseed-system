/**
 * Pruebas de docusaurus-export (tarea DSN1025F).
 * Todo es puro: entrada → salida, sin red, sin disco, sin reloj.
 */

import { describe, it, expect } from "vitest";
import type { EduNode } from "@/lib/education/curriculum";
import {
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  docusaurusDesdeEdu,
  escaparMd,
  slugDoc,
} from "@/lib/publish/docusaurus-export";
import type { ArchivoDocs } from "@/lib/publish/docusaurus-export";

const entrada = {
  id: "saludo",
  titulo: "Saludo",
  cuerpo: "Hola. Este es el cuerpo.",
};

function nodoGeneral(
  id: string,
  name: string,
  parentId: string | null,
  blurb?: string,
): EduNode {
  return { id, kind: "category", name, parentId, blurb };
}

describe("docusaurus-export · front matter", () => {
  it("lleva el título entre comillas aunque tenga «:» o comillas", () => {
    const [archivo] = docusaurusDesdeEntradas([
      { ...entrada, titulo: 'Guía: "el uso" del OS' },
    ]);
    expect(archivo.content).toContain(
      `title: ${JSON.stringify('Guía: "el uso" del OS')}`,
    );
  });

  it("escribe id, sidebar_position y description entre comillas", () => {
    const [archivo] = docusaurusDesdeEntradas([
      { ...entrada, orden: 3, descripcion: "Qué es el OS" },
    ]);
    expect(archivo.content).toContain('id: "saludo"');
    expect(archivo.content).toContain("sidebar_position: 3");
    expect(archivo.content).toContain('description: "Qué es el OS"');
  });
});

describe("docusaurus-export · escapado", () => {
  it("escapa {x}, <script> y la primera letra de «import»", () => {
    expect(escaparMd("{x}")).toBe("&#123;x&#125;");
    expect(escaparMd("<script>alert()</script>")).toBe(
      "&lt;script&gt;alert()&lt;/script&gt;",
    );
    expect(escaparMd("import x from 'y'")).toBe("&#105;mport x from 'y'");
    expect(escaparMd("export const y = 1")).toBe("&#101;xport const y = 1");
  });

  it("el cuerpo exportado sale escapado, no como código", () => {
    const [archivo] = docusaurusDesdeEntradas([
      { ...entrada, cuerpo: "Uso <script> y {x}; empieza: import x from 'y'" },
    ]);
    expect(archivo.content).toContain("&lt;script&gt;");
    expect(archivo.content).toContain("&#123;x&#125;");
    expect(archivo.content).toContain("&#105;mport x from 'y'");
  });

  it("crea slugs ASCII sin acentos", () => {
    expect(slugDoc("Física Cuántica")).toBe("fisica-cuantica");
    expect(slugDoc("  ¿Qué es esto? ")).toBe("que-es-esto");
  });
});

describe("docusaurus-export · colisiones de slug", () => {
  it("dos entradas con el mismo título dan «-2»", () => {
    const archivos = docusaurusDesdeEntradas([
      { ...entrada },
      { ...entrada, cuerpo: "Otro cuerpo." },
    ]);
    const rutas = archivos.filter((a) => a.path.endsWith(".md")).map((a) => a.path);
    expect(rutas).toContain("docs/saludo.md");
    expect(rutas).toContain("docs/saludo-2.md");
  });
});

describe("docusaurus-export · guía", () => {
  const temas = [
    {
      key: "protomolecula",
      titulo: "Protomolécula",
      cuerpo: "Une programas abiertos en un panel.",
      voz: "Une programas en un panel.",
      ruta: "/protomolecula",
      preguntaAurora: "Aurora, abre la Protomolécula",
      puntos: ["moléculas vivas", "átomos = herramientas"],
    },
    {
      key: "malla",
      titulo: "Redes mesh",
      cuerpo: "Tus aparatos forman una malla.",
      voz: "La malla une aparatos.",
      ruta: "/red-mesh",
      preguntaAurora: "Aurora, abre la red mesh",
      puntos: ["autovínculo", "sin internet: QR o código"],
    },
  ];

  it("un archivo por tema, en orden, con sus puntos y «Dónde:»", () => {
    const archivos = docusaurusDesdeGuia(temas, "Guía del sistema");
    const docs = archivos.filter((a) => a.path === "docs/guia-del-sistema/protomolecula.md");
    expect(docs).toHaveLength(1);
    expect(docs[0].content).toContain("sidebar_position: 1");
    expect(docs[0].content).toContain("- moléculas vivas");
    expect(docs[0].content).toContain("Dónde: /protomolecula");
    expect(docs[0].content).toContain("Pregunta a Astraura: Aurora, abre la Protomolécula");
    const malla = archivos.filter((a) => a.path === "docs/guia-del-sistema/malla.md");
    expect(malla).toHaveLength(1);
    expect(malla[0].content).toContain("sidebar_position: 2");
  });
});

describe("docusaurus-export · educación", () => {
  const arbol = [
    nodoGeneral("c-1", "Ciencia", null, "Estudio del universo."),
    nodoGeneral("t-1", "Física", "c-1", "Las leyes del movimiento."),
    nodoGeneral("s-1", "Mecánica Clásica", "t-1", "Cuerpos y fuerzas."),
    nodoGeneral("s-2", "Termodinámica", "t-1", "Calor y entropía."),
  ];

  it("árbol de 3 niveles: carpetas con _category_.json y .md con su blurb", () => {
    const archivos = docusaurusDesdeEdu(arbol);
    const rutas = archivos.map((a) => a.path);
    const esperadas = [
      "docs/ciencia/_category_.json",
      "docs/ciencia/fisica/_category_.json",
      "docs/ciencia/fisica/index.md",
      "docs/ciencia/fisica/mecanica-clasica.md",
      "docs/ciencia/fisica/termodinamica.md",
      "docs/LEEME-DOCUSAURUS.md",
    ];
    for (const ruta of esperadas) expect(rutas).toContain(ruta);
    const porRuta = Object.fromEntries(archivos.map((a) => [a.path, a]));
    expect(porRuta["docs/ciencia/_category_.json"].content).toContain('"label": "Ciencia"');
    expect(porRuta["docs/ciencia/_category_.json"].content).toContain('"collapsed": false');
    expect(porRuta["docs/ciencia/fisica/mecanica-clasica.md"].content).toContain(
      "Cuerpos y fuerzas.",
    );
  });
});

describe("docusaurus-export · límites y pureza", () => {
  it("ninguna ruta termina en .mdx ni .js", () => {
    const fuentes: ArchivoDocs[][] = [
      docusaurusDesdeEntradas([{ ...entrada, grupo: "Grupo uno" }]),
      docusaurusDesdeEntradas([{ ...entrada }]),
      docusaurusDesdeEdu([
        nodoGeneral("c-1", "Ciencia", null),
        nodoGeneral("s-1", "Mecánica", "c-1"),
      ]),
    ];
    for (const files of fuentes) {
      for (const archivo of files) {
        expect(archivo.path.endsWith(".mdx")).toBe(false);
        expect(archivo.path.endsWith(".js")).toBe(false);
      }
    }
  });

  it("el LEEME nombra los pasos manuales y format: 'detect'", () => {
    const archivos = docusaurusDesdeEntradas([{ ...entrada }]);
    const leeme = archivos.find((a) => a.path.endsWith("LEEME-DOCUSAURUS.md"));
    expect(leeme).toBeDefined();
    expect(leeme?.content).toContain("npm create docusaurus@latest sitio classic");
    expect(leeme?.content).toContain("{ format: 'detect' }");
    expect(leeme?.content).toContain("NO_UPDATE_NOTIFIER=1");
    expect(leeme?.content).toContain("palabra de Alex");
  });

  it("la misma llamada dos veces da el mismo resultado", () => {
    const a = docusaurusDesdeEntradas([{ ...entrada, grupo: "Grupo" }]);
    const b = docusaurusDesdeEntradas([{ ...entrada, grupo: "Grupo" }]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(docusaurusDesdeEdu([
      nodoGeneral("c-1", "Ciencia", null),
    ]))).toBe(JSON.stringify(docusaurusDesdeEdu([
      nodoGeneral("c-1", "Ciencia", null),
    ])));
  });
});
