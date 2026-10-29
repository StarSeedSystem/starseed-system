// DGM1018F · Pruebas puras de la herramienta `diagrama.crear` (sin red, sin disco, sin `any`).
import { describe, it, expect } from "vitest";
import { pedidoDiagrama, recibirDiagrama, TIPOS_DIAGRAMA } from "../herramienta-diagrama";
import type { PerfilDiagrama } from "../perfil-marca";

const HTML_MARKA = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist&display=swap"><title>x</title>`;
const HTML = `<!DOCTYPE html>\n<html lang="es"><head><meta charset="utf-8">${HTML_MARKA}</head>\n<body><svg viewBox="0 0 40 40"><rect x="4" y="4" width="16" height="16"/></svg></body></html>`;
const RESPUESTA = `Aquí tienes el diagrama:\n\`\`\`html\n${HTML}\n\`\`\`\n¿Quieres cambios?`;
const PERFIL: PerfilDiagrama = {
  modo: "light",
  colores: { paper: "#f5f5f5", "paper-2": "#ececec", ink: "#2d3142", "ink-strong": "#111111", muted: "#4f5d75",
    soft: "#5a6580", rule: "#44475a", "rule-solid": "#2d3142", accent: "#bf4520", "accent-tint": "#eef1f4", link: "#2e5aa8" },
  contraste: {}, avisos: [],
  fuentes: { serif: "'Instrument Serif', serif", sans: "'Geist', sans-serif", mono: "'Geist Mono', monospace" },
  trazos: { thin: 0.8, default: 1, strong: 1.2 }, radios: { sm: 4, md: 6, lg: 8 },
};

describe("pedidoDiagrama", () => {
  it("usa el tipo pedido por alias en español", () => {
    const c = pedidoDiagrama({ peticion: "jerarquía del equipo", tipo: "organigrama" });
    expect(c.tipo).toBe("org-chart");
    expect(c.avisos).toHaveLength(0);
  });

  it("respeta un slug de la skill tal cual", () => {
    expect(TIPOS_DIAGRAMA).toContain("sankey");
    expect(pedidoDiagrama({ peticion: "reparto", tipo: "sankey" }).tipo).toBe("sankey");
  });

  it("con un tipo desconocido avisa y detecta a ojo por la petición", () => {
    const c = pedidoDiagrama({ peticion: "muéstrame la pila de capas del servidor", tipo: "collage" });
    expect(c.tipo).toBe("layers");
    expect(c.avisos[0]).toContain("No conozco el tipo");
  });

  it("sin ninguna señal cae en flowchart con aviso", () => {
    const c = pedidoDiagrama({ peticion: "hazme un diagrama" });
    expect(c.tipo).toBe("flowchart");
    expect(c.avisos.some((a) => a.includes("sin tipo claro"))).toBe(true);
  });

  it("la instrucción lleva la petición, la guía y las reglas del sandbox", () => {
    const c = pedidoDiagrama({ peticion: "flujo de alta del proyecto" });
    expect(c.instruccion).toContain("alta del proyecto");
    expect(c.instruccion.toLowerCase()).toContain("sandbox");
    expect(c.instruccion).toContain("no pidas Google Fonts");
  });

  it("con perfil de marca añade el bloque de perfil activo", () => {
    const c = pedidoDiagrama({ peticion: "org del grupo", tipo: "org-chart", perfil: PERFIL });
    expect(c.instruccion).toContain("diagram-design-profile");
  });

  it("con animado, la instrucción lo declara y mantiene sandbox sin permisos", () => {
    const c = pedidoDiagrama({ peticion: "cascada de ingresos", animado: true });
    expect(c.animado).toBe(true);
    expect(c.instruccion).toContain("JavaScript embebido");
  });

  it("respeta el tamaño pedido y usa «completa» por defecto", () => {
    const tarjeta = pedidoDiagrama({ peticion: "flujo de alta", tamano: "tarjeta" });
    expect(tarjeta.tamano).toBe("tarjeta");
    expect(tarjeta.instruccion).toContain("Tamaño: tarjeta");
    expect(pedidoDiagrama({ peticion: "flujo de alta" }).tamano).toBe("completa");
  });

  it("con petición vacía avisa y deja un tema genérico", () => {
    const c = pedidoDiagrama({ peticion: "   " });
    expect(c.avisos.some((a) => a.includes("Petición vacía"))).toBe(true);
    expect(c.instruccion).toContain("un diagrama del tema que venimos hablando");
  });
});

describe("recibirDiagrama", () => {
  it("extrae el HTML de la valla y lo aísla en sandbox sin permisos", () => {
    const r = recibirDiagrama(RESPUESTA, { tipo: "flowchart" });
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("");
    expect(r.tipo).toBe("flowchart");
    expect(r.srcdoc).toContain("Content-Security-Policy");
    expect(r.srcdoc).toContain("<svg");
  });

  it("sustituye las fuentes de Google por caras locales: sin peticiones a terceros", () => {
    const r = recibirDiagrama(RESPUESTA);
    expect(r.srcdoc).not.toContain("fonts.googleapis.com");
    expect(r.srcdoc).toContain("@font-face { font-family: 'Geist'");
  });

  it("acepta HTML suelto sin valla", () => {
    expect(recibirDiagrama(HTML).ok).toBe(true);
  });

  it("sin HTML devuelve ok false con motivo", () => {
    const r = recibirDiagrama("Te lo describiré mejor: un cuadro con dos flechas.");
    expect(r.ok).toBe(false);
    expect(r.srcdoc).toBeUndefined();
    expect(r.motivos[0]).toContain("no trae HTML");
  });

  it("avisa si el HTML no tiene <svg>", () => {
    const r = recibirDiagrama("```html\n<html><body><div>sin svg</div></body></html>```", { tipo: "layers" });
    expect(r.ok).toBe(false);
    expect(r.motivos.some((m) => m.includes("falta etiqueta <svg>"))).toBe(true);
    expect(r.tipo).toBe("layers");
  });

  it("con animado concede solo scripts y conserva el origen opaco", () => {
    const conScript = `<!DOCTYPE html><html><body><script>document.title = "movido";</script><svg><circle r="2"/></svg></body></html>`;
    const r = recibirDiagrama(`\`\`\`html\n${conScript}\n\`\`\``, { animado: true });
    expect(r.sandbox).toBe("allow-scripts");
    expect(r.srcdoc).toContain("script-src 'unsafe-inline'");
    expect(r.srcdoc).not.toContain("allow-same-origin");
  });

  it("un tipo desconocido en la respuesta cae en flowchart sin romper", () => {
    const r = recibirDiagrama(RESPUESTA, { tipo: "collage" });
    expect(r.ok).toBe(true); expect(r.tipo).toBe("flowchart");
  });
});
