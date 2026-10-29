// Pruebas puras de la herramienta `diagrama.crear` (architecture/diagramas.md §3-2 y §4-F).
// Entrada → salida, sin red, sin disco y sin navegador. Skill MIT diagram-design.
import { describe, it, expect } from "vitest";
import { PERFIL_POR_DEFECTO, elegirTipo, pedidoDiagrama, recibirDiagrama } from "../herramienta-diagrama";

const HTML = `<!DOCTYPE html>
<html lang="es" data-diagrama="flowchart">
<head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist&display=swap">
<title>Flujo</title></head>
<body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><title>Flujo</title><desc>Ejemplo</desc><rect width="8" height="8"/></svg></body>
</html>`;

const ANIMADO = HTML.replace("</body>", '<script>document.title = "x";</script></body>');

describe("elegirTipo", () => {
  it("acepta el id y el nombre con o sin acentos", () => {
    expect(elegirTipo("", "gantt").tipo.id).toBe("gantt");
    expect(elegirTipo("", "Máquina de estados").tipo.id).toBe("state");
    expect(elegirTipo("", "entidad-relación").tipo.id).toBe("er");
  });

  it("deduce el tipo por la petición y cae en arquitectura", () => {
    expect(elegirTipo("Un flujo de decisión para el alta").tipo.id).toBe("flowchart");
    expect(elegirTipo("La arquitectura de componentes del OS").tipo.id).toBe("architecture");
    expect(elegirTipo("algo sin pistas").tipo.id).toBe("architecture");
  });

  it("avisa de un tipo desconocido y usa arquitectura", () => {
    const r = elegirTipo("", "no-existe");
    expect(r.tipo.id).toBe("architecture");
    expect(r.aviso).toContain("no-existe");
  });
});

describe("pedidoDiagrama", () => {
  const base = { perfil: PERFIL_POR_DEFECTO, tamano: "resumen" as const, animado: false };

  it("arma el contexto con tipo, guía, marca, lienzo y seguridad", () => {
    const p = pedidoDiagrama({ ...base, peticion: "Diagrama de secuencia del login" });
    expect(p.ok).toBe(true);
    expect(p.tipo.id).toBe("sequence");
    expect(p.rutaGuia).toBe("vendor/habilidades/diagram-design/references/type-sequence.md");
    expect(p.instrucciones).toContain('data-diagrama="sequence"');
    expect(p.instrucciones).toContain("viewBox «0 0 960 600»");
    expect(p.instrucciones).toContain(PERFIL_POR_DEFECTO.colores.accent);
    expect(p.instrucciones).toContain("references/type-sequence.md");
    expect(p.instrucciones).toContain("Sin animación");
    expect(p.instrucciones).toContain("Diagram Design");
    expect(p.avisos).toEqual([]);
  });

  it("cambia lienzo y movimiento según tamaño y animación", () => {
    const p = pedidoDiagrama({ ...base, peticion: "Plan de tareas", tamano: "completa", animado: true });
    expect(p.instrucciones).toContain("viewBox «0 0 1280 720»");
    expect(p.instrucciones).toContain('sandbox="allow-scripts"');
    expect(p.instrucciones).toContain("references/animation.md");
  });

  it("avisa y cae a resumen sin petición o con tamaño desconocido", () => {
    const sinPeticion = pedidoDiagrama({ ...base, peticion: "   " });
    expect(sinPeticion.ok).toBe(false);
    expect(sinPeticion.avisos.join(" ")).toContain("Falta la petición");

    const raro = pedidoDiagrama({ ...base, peticion: "arquitectura", tamano: "enorme" });
    expect(raro.tamano).toBe("resumen");
    expect(raro.avisos.join(" ")).toContain("enorme");
  });

  it("acepta un perfil de marca como texto tal cual", () => {
    const p = pedidoDiagrama({ ...base, peticion: "arquitectura", perfil: "Mi marca: paper #fff, accent #f00" });
    expect(p.instrucciones).toContain("Mi marca: paper #fff, accent #f00");
  });
});

describe("recibirDiagrama", () => {
  it("extrae el HTML de un cerco markdown y sustituye Google Fonts", () => {
    const r = recibirDiagrama(`Aquí va:\n\`\`\`html\n${HTML}\n\`\`\`\nEspero que sirva`);
    expect(r.ok).toBe(true);
    expect(r.tipo).toBe("flowchart");
    expect(r.sandbox).toBe("");
    expect(r.motivos).toEqual([]);
    expect(r.srcdoc).toBeDefined();
    expect(r.srcdoc).toContain("<svg");
    expect(r.srcdoc).toContain("Content-Security-Policy");
    expect(r.srcdoc).not.toContain("fonts.googleapis.com");
    expect(r.srcdoc).not.toContain("Aquí va");
    expect(r.srcdoc).not.toContain("Espero que sirva");
  });

  it("añade doctype, envuelve un SVG suelto y lee el tipo declarado", () => {
    const sinDoctype = recibirDiagrama(HTML.replace("<!DOCTYPE html>\n", ""));
    expect(sinDoctype.ok).toBe(true);
    expect(sinDoctype.motivos.join(" ")).toContain("DOCTYPE");

    const suelto = recibirDiagrama('<svg xmlns="http://www.w3.org/2000/svg"><title>Suelto</title><rect/></svg>');
    expect(suelto.ok).toBe(true);
    expect(suelto.tipo).toBeNull();
    expect(suelto.motivos.join(" ")).toContain("svg suelto");

    const comentario = '<!DOCTYPE html><html><body><!-- diagram-design tipo: gantt --><svg><title>G</title></svg></body></html>';
    expect(recibirDiagrama(comentario).tipo).toBe("gantt");
  });

  it("permite scripts solo cuando hay animación y sin allow-same-origin", () => {
    const r = recibirDiagrama(ANIMADO);
    expect(r.ok).toBe(true);
    expect(r.sandbox).toBe("allow-scripts");
    expect(r.sandbox).not.toContain("same-origin");
    expect(r.srcdoc).toContain("script-src 'unsafe-inline'");
  });

  it("limpia iframe, form, on*= y javascript:", () => {
    const malo = '<!DOCTYPE html><html data-diagrama="flowchart"><body onload="alert(1)">' +
      '<iframe src="https://x"></iframe><form action="javascript:alert(2)"></form>' +
      '<svg onload="alert(3)"><rect/></svg><a href="javascript:alert(4)">x</a></body></html>';
    const r = recibirDiagrama(malo);
    expect(r.ok).toBe(true);
    for (const prohibido of ["<iframe", "<form", "onload", "javascript:"]) {
      expect((r.srcdoc || "").toLowerCase()).not.toContain(prohibido);
    }
  });

  it("rechaza una respuesta sin HTML", () => {
    const r = recibirDiagrama("Lo siento, no puedo dibujar eso.");
    expect(r.ok).toBe(false);
    expect(r.srcdoc).toBeUndefined();
    expect(r.sandbox).toBe("");
    expect(r.motivos.join(" ")).toContain("no encontré");
  });

  it("respeta permitirAnimacion explícito y avisa de un tipo inventado", () => {
    const sinScripts = recibirDiagrama(ANIMADO, { permitirAnimacion: false });
    expect(sinScripts.sandbox).toBe("");
    expect(sinScripts.srcdoc).not.toContain("script-src");

    const raro = recibirDiagrama(HTML.replace('data-diagrama="flowchart"', 'data-diagrama="inventado"'));
    expect(raro.tipo).toBeNull();
    expect(raro.motivos.join(" ")).toContain("data-diagrama");
  });
});
