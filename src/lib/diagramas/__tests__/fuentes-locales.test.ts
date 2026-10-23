// Pruebas puras de la sustitución de fuentes de diagramas (PURO).
// Contrato: architecture/diagramas.md §3 (:「fuentes servidas por el OS, sin
// Google Fonts」) y vendor/habilidades/diagram-design/ (MIT; modo «system»).
// Regla: sin red; sin navegador real; sin `any`; nada que pida a terceros.

import { describe, it, expect } from "vitest";
import {
  extraerFamiliasGoogle,
  pilaSistema,
  cambiarDeclaraciones,
  sustituirFuentes,
  type FuenteLocal,
} from "../fuentes-locales";

const GEIST: FuenteLocal = {
  familia: "Geist Mono",
  caras: [{ url: "data:font/woff2;base64,QUJD", formato: "woff2", peso: "400 700" }],
};
const INTER: FuenteLocal = {
  familia: "Inter",
  caras: [
    { url: "data:font/woff2;base64,QUJD", formato: "woff2", peso: "400", estilo: "normal" },
    { url: "data:font/woff2;base64,REVG", formato: "woff2", peso: "400", estilo: "italic" },
  ],
};

describe("sustituirFuentes: nunca deja una petición a terceros", () => {
  it("elimina los <link> y @import a fonts.googleapis.com/fonts.gstatic.com", () => {
    const html =
      `<head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400&amp;family=Geist+Mono:wght@400&display=swap" rel="stylesheet">` +
      `</head><style>@import url("https://fonts.gstatic.com/s/inter/v1.woff2");</style><p hola>Hola</p>`;
    const r = sustituirFuentes(html, [INTER, GEIST]);
    expect(r.html).not.toMatch(/fonts\.googleapis\.com/);
    expect(r.html).not.toMatch(/fonts\.gstatic\.com/);
    expect(r.html).toContain("Hola");
  });

  it("no toca las <link> locales ni los @import internos", () => {
    const html =
      `<link rel="stylesheet" href="/temas/tokens.css">` +
      `<style>@import "/temas/base.css";</style>`;
    const r = sustituirFuentes(html, []);
    expect(r.html).toContain("/temas/tokens.css");
    expect(r.html).toContain("/temas/base.css");
    expect(r.html).not.toContain("@font-face");
  });

  it("borra los url() remotos y deja los data: o relativos", () => {
    const html = `<style>@font-face{src:url("https://external.example.com/f.woff2") format("woff2");}` +
      `@font-face{src:url("data:font/woff2;base64,QUJD") format("woff2");}` +
      `@font-face{src:url("/static/f.woff2") format("woff2");}</style>`;
    const r = sustituirFuentes(html, []);
    expect(r.html).not.toContain("external.example.com");
    expect(r.html).toContain("data:font/woff2;base64,QUJD");
    expect(r.html).toContain("/static/f.woff2");
  });
});

describe("sustituirFuentes: fuentes servidas por el OS", () => {
  it("inyecta @font-face con data URL y la familia queda servida", () => {
    const html = `<head></head>` +
      `<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap">` +
      `<div style="font-family:'Geist Mono',monospace">A{1}=2</div>`;
    const r = sustituirFuentes(html, [GEIST]);
    expect(r.servidas).toEqual(["Geist Mono"]);
    expect(r.deSistema).toEqual([]);
    expect(r.html).toContain("@font-face{font-family:'Geist Mono';");
    expect(r.html).toContain('src:url("data:font/woff2;base64,QUJD") format("woff2")');
    expect(r.html).toContain("font-weight:400 700");
    expect(r.html).toContain("<head>");
  });

  it("escribe las dos caras (normal e itálica) de una familia", () => {
    const html = `<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap">`;
    const r = sustituirFuentes(html, [INTER]);
    expect(r.html.match(/@font-face/g)?.length).toBe(2);
    expect(r.html).toContain("font-style:italic");
  });

  it("inyecta en <head> si hay, o al principio si no hay <head>", () => {
    const sinHead = `<link href="https://fonts.googleapis.com/css2?family=Geist+Mono&display=swap">` +
      `<div style="font-family:'Geist Mono'">x</div>`;
    const r1 = sustituirFuentes(sinHead, [GEIST]);
    expect(r1.html.startsWith("<style>@font-face")).toBe(true);
  });

  it("una familia pedida con <link> pero no disponible va a la pila de sistema", () => {
    const html = `<link href="https://fonts.googleapis.com/css2?family=VT323:wght@400&display=swap">` +
      `<div style="font-family:'VT323',monospace">ok</div>`;
    const r = sustituirFuentes(html, []);
    expect(r.deSistema).toEqual(["VT323"]);
    expect(r.servidas).toEqual([]);
    expect(r.html).not.toContain("@font-face");
    expect(r.html).not.toMatch(/font-family\s*:\s*'VT323'/);
  });
});

describe("pila de sistema equivalente", () => {
  it("Maquilla cada familia al tipo de letra adecuado", () => {
    expect(pilaSistema("Geist Mono")).toContain("monospace");
    expect(pilaSistema("JetBrains Code")).toContain("monospace");
    expect(pilaSistema("Lora")).toContain("serif");
    expect(pilaSistema("Fraunces Display")).toContain("Georgia");
    expect(pilaSistema("Caveat")).toMatch(/cursive/);
    expect(pilaSistema("Inter")).toContain("sans-serif");
    expect(pilaSistema("Desconocida XYZ")).toContain("sans-serif");
  });

  it("cambia solo la familia pedida, no las demás de la declaración", () => {
    const html = `<div style="font-family:'VT323','Geist Mono',monospace">x</div>`;
    const r = cambiarDeclaraciones(html, "VT323", "ui-monospace, monospace");
    expect(r).toContain("ui-monospace");
    expect(r).toContain("'Geist Mono'");
    expect(r).not.toMatch(/'VT323'/);
  });
});

describe("extracción de familias de Google Fonts", () => {
  it("lee css2 y css1 con pesos, + como espacio y &amp; entity", () => {
    const html =
      `<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&amp;family=Fraunces:opsz,wght@144,300&display=swap">` +
      `<style>@import url("https://fonts.googleapis.com/css?family=Fira+Code&display=swap");</style>`;
    const r = extraerFamiliasGoogle(html);
    expect(r).toEqual(["Geist Mono", "Fraunces", "Fira Code"]);
  });

  it("devuelve [] sin peticiones y demuestra que sustituirFuentes es puRO en doble pasada", () => {
    const html = `<p>Sin fuentes remotas</p>`;
    expect(extraerFamiliasGoogle(html)).toEqual([]);
    const unaVez = sustituirFuentes(html, []);
    const dosVeces = sustituirFuentes(unaVez.html, [GEIST]);
    expect(dosVeces.html).toBe(unaVez.html);
    expect(dosVeces.servidas).toEqual([]);
  });
});
