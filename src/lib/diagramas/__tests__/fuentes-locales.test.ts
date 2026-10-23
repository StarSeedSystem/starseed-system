// Pruebas puras de fuentes-locales (contrato architecture/diagramas.md §3-4, tarea D).
// Solo entrada → salida: sin red, sin disco, sin navegador; describe/it/expect de vitest
// porque globals está en false. La lista de fuentes llega inyectada, como en producción.

import { describe, it, expect } from "vitest";
import { familiasPedidas, sustituirFuentes, type FuenteDisponible } from "../fuentes-locales";

const LINK_GOOGLE =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600' +
  '&family=Instrument+Serif:ital@0;1&family=Noto+Sans+KR:wght@400&display=swap">';

const FUENTES_OS: FuenteDisponible[] = [
  { family: "Geist", categoria: "sans", dataUrl: "data:font/woff2;base64,AAAA", pesos: "400;500;600" },
  { family: "Noto Sans KR", categoria: "sans", dataUrl: "data:font/woff2;base64,BBBB" },
];

describe("familiasPedidas", () => {
  it("extrae las familias del link en orden, desdobla + a espacio y desduplica", () => {
    const conImporte =
      '<style>@import url(\'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400' +
      '&family=Geist:wght@700&display=swap\');</style>';
    expect(familiasPedidas(LINK_GOOGLE + conImporte)).toEqual([
      "Geist",
      "Instrument Serif",
      "Noto Sans KR",
    ]);
  });

  it("devuelve vacío cuando el HTML no pide Google Fonts", () => {
    expect(familiasPedidas("<div style=\"font-family:'Geist',sans-serif\">hola</div>")).toEqual([]);
  });
});

describe("sustituirFuentes", () => {
  it("infla @font-face con data URL para las familias que el OS sirve", () => {
    const salida = sustituirFuentes(LINK_GOOGLE, FUENTES_OS);
    expect(salida).toContain("font-family: 'Geist';");
    expect(salida).toContain("src: url('data:font/woff2;base64,AAAA') format('woff2');");
    expect(salida.match(/font-weight: \d+;/g) || []).toEqual([
      "font-weight: 400;",
      "font-weight: 500;",
      "font-weight: 600;",
    ]);
  });

  it("sirve la fuente sin pesos declarados en una sola cara sin font-weight", () => {
    const salida = sustituirFuentes(LINK_GOOGLE, FUENTES_OS);
    expect(salida).toContain("font-family: 'Noto Sans KR';");
    expect(salida).toContain("data:font/woff2;base64,BBBB");
  });

  it("alias a la pila de sistema equivalente si el OS no tiene la fuente", () => {
    const salida = sustituirFuentes(LINK_GOOGLE, FUENTES_OS);
    expect(salida).toContain("font-family: 'Instrument Serif';");
    expect(salida).toContain(
      "src: local('Georgia'), local('Times New Roman'), local('Droid Serif'), local('Noto Serif');"
    );
  });

  it("quita el link y cada @import de terceros; el resto del HTML queda igual", () => {
    const html =
      LINK_GOOGLE +
      '<style>@import url(\'https://fonts.googleapis.com/css2?family=Geist:wght@400&display=swap\');' +
      "svg { fill: #2d3142; }</style><div class=\"diagrama\">hola</div>";
    const salida = sustituirFuentes(html, FUENTES_OS);
    expect(salida).not.toContain("fonts.googleapis");
    expect(salida).not.toContain("@import");
    expect(salida).toContain("svg { fill: #2d3142; }");
    expect(salida).toContain('<div class="diagrama">hola</div>');
  });

  it("neutraliza un src de fonts.gstatic ya presente en el HTML", () => {
    const css =
      '<style>@font-face { font-family: \'Vieja\'; src: local(\'Nope\'), ' +
      "url('https://fonts.gstatic.com/s/vieja/v1/a.woff2') format('woff2'); }</style>";
    const salida = sustituirFuentes(css, FUENTES_OS);
    expect(salida).toContain("url(data:,)");
    expect(salida).not.toContain("fonts.gstatic");
  });

  it("mete el bloque de caras dentro del head y es idempotente", () => {
    const html =
      "<!DOCTYPE html><html><head><title>t</title>" + LINK_GOOGLE + "</head><body>hola</body></html>";
    const salida = sustituirFuentes(html, FUENTES_OS);
    const estilo = salida.indexOf('<style data-fuentes="locales">');
    expect(estilo).toBeGreaterThan(-1);
    expect(estilo).toBeLessThan(salida.indexOf("</head>"));
    expect(familiasPedidas(salida)).toEqual([]);
    expect(sustituirFuentes(salida, FUENTES_OS)).toBe(salida);
  });

  it("sin </head> mete el bloque al principio del fragmento", () => {
    const fragmento =
      '<div class="diagrama">' + LINK_GOOGLE + "<svg role=\"img\">x</svg></div>";
    expect(
      sustituirFuentes(fragmento, FUENTES_OS).startsWith('<style data-fuentes="locales">')
    ).toBe(true);
  });

  it("un peso en rango del catálogo se declara como «400 700» en una sola cara", () => {
    const salida = sustituirFuentes(LINK_GOOGLE, [
      { family: "Geist", categoria: "sans", dataUrl: "data:font/woff2;base64,R", pesos: "400-700" },
    ]);
    expect(salida).toContain("font-weight: 400 700;");
  });
});
