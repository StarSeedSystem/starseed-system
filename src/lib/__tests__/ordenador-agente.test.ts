import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PLAN_ESTADO,
  carpetaDeEstado,
  lineaDiario,
  elegirBackend,
  type FormaTrabajo,
  type EntradaDiario,
} from "@/lib/agentes/ordenador-agente";

const TODO_PERMITIDO = { privado: false, permitePago: true, cuentaCloudflare: true };
describe("PLAN_ESTADO", () => {
  it("declara la carpeta de estado como datos con la red fija en none", () => {
    expect(PLAN_ESTADO).toEqual({
      memoria: "memoria.md", notas: "notas/", resultados: "resultados/",
      diario: "diario.jsonl", red: "none",
    });
  });
});

describe("carpetaDeEstado", () => {
  it("compone agentes/<id saneado>/<alcance>/ y no deja salir de la carpeta", () => {
    expect(carpetaDeEstado("Agente Uno!", "personal")).toBe("agentes/agente-uno/personal/");
    expect(carpetaDeEstado("BRAVO_2", "perfil")).toBe("agentes/bravo-2/perfil/");
    expect(carpetaDeEstado("  grupo--x  ", "grupo")).toBe("agentes/grupo-x/grupo/");
    expect(carpetaDeEstado("publico", "publica")).toBe("agentes/publico/publica/");
    const carpeta = carpetaDeEstado("a/../b", "personal");
    expect(carpeta).toBe("agentes/a-b/personal/");
    expect(carpeta).not.toContain("..");
    expect(carpeta.slice("agentes/".length, -"/personal/".length)).not.toContain("/");
  });

  it("lanza en español con un id vacío o que no deja nada usable", () => {
    expect(() => carpetaDeEstado("", "personal")).toThrow(Error);
    expect(() => carpetaDeEstado("   ", "personal")).toThrow(/vacío/i);
    expect(() => carpetaDeEstado("...", "personal")).toThrow(/vacío/i);
    expect(() => carpetaDeEstado("!!!", "personal")).toThrow(/vacío/i);
  });
});

describe("lineaDiario", () => {
  const BASE: EntradaDiario = { t: 1700000000000, op: "escribir", ruta: "notas/idea.md", bytes: 42 };

  it("devuelve una sola línea JSON que se puede reconstruir", () => {
    const linea = lineaDiario(BASE);
    expect(linea).not.toContain("\n");
    expect(linea).not.toContain("\r");
    expect(JSON.parse(linea)).toEqual(BASE);
  });

  it("omite los bytes ausentes y no deja un salto literal en la ruta", () => {
    const sinBytes = lineaDiario({ t: 1, op: "listar", ruta: "resultados/" });
    expect(sinBytes).not.toContain("bytes");
    expect(JSON.parse(sinBytes)).toEqual({ t: 1, op: "listar", ruta: "resultados/" });
    const conSalto = lineaDiario({ t: 2, op: "leer", ruta: "notas/a\nb.md" });
    expect(conSalto).not.toContain("\n");
    expect(JSON.parse(conSalto).ruta).toBe("notas/a\nb.md");
  });

  it("rechaza rutas absolutas, con «..», con barra invertida o vacías", () => {
    expect(() => lineaDiario({ ...BASE, ruta: "/etc/passwd" })).toThrow(/absoluta/i);
    expect(() => lineaDiario({ ...BASE, ruta: "notas/../../fuera" })).toThrow(/\.\./);
    expect(() => lineaDiario({ ...BASE, ruta: "notas\\idea.md" })).toThrow(/barra invertida/i);
    expect(() => lineaDiario({ ...BASE, ruta: "   " })).toThrow(/vacía/i);
  });
});
describe("elegirBackend", () => {
  it("elige el backend por la forma del trabajo cuando todo está permitido", () => {
    expect(elegirBackend("archivos-y-datos", TODO_PERMITIDO).backend).toBe("aislado-shell");
    expect(elegirBackend("codigo-js", TODO_PERMITIDO).backend).toBe("aislado-js");
    expect(elegirBackend("linux-completo", TODO_PERMITIDO).backend).toBe("contenedor");
  });

  it("dice en el motivo que la salida de red queda en none", () => {
    const formas: FormaTrabajo[] = ["archivos-y-datos", "codigo-js", "linux-completo"];
    for (const forma of formas) {
      const { motivo } = elegirBackend(forma, TODO_PERMITIDO);
      expect(motivo.length).toBeGreaterThan(0);
      expect(motivo).toContain("none");
    }
  });

  it("lo privado se queda en la neurona y gana a cualquier otra negativa", () => {
    const ctx = { privado: true, permitePago: false, cuentaCloudflare: false };
    const decision = elegirBackend("linux-completo", ctx);
    expect(decision).toEqual({
      backend: null,
      motivo: "lo privado se queda en la neurona",
    });
  });

  it("sin pago no enciende nada, y sin cuenta tampoco", () => {
    expect(
      elegirBackend("codigo-js", { privado: false, permitePago: false, cuentaCloudflare: false }),
    ).toEqual({
      backend: null,
      motivo: "Cloudflare Computer pide el plan Workers Paid: el ámbito no permite pago",
    });
    expect(
      elegirBackend("archivos-y-datos", { privado: false, permitePago: true, cuentaCloudflare: false }),
    ).toEqual({
      backend: null,
      motivo: "falta la cuenta de Cloudflare de la persona (el OS no abre cuentas)",
    });
  });
});

describe("pureza del módulo", () => {
  const RUTA = path.join(process.cwd(), "src/lib/agentes/ordenador-agente.ts");
  const FUENTE = readFileSync(RUTA, "utf8");

  it("no importa node:* ni Cloudflare, y nunca dice Mando", () => {
    expect(FUENTE).not.toMatch(/from\s+["']node:/);
    expect(FUENTE).not.toMatch(/require\(\s*["']node:/);
    expect(FUENTE).not.toMatch(/@cloudflare\/computer/);
    expect(FUENTE).not.toContain("Mando");
  });
});
