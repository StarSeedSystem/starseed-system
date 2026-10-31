import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAN_ESTADO,
  carpetaDeEstado,
  elegirBackend,
  lineaDiario,
  type BackendOrdenador,
  type FormaTrabajo,
} from "@/lib/agentes/ordenador-agente";

const TODO_PERMITIDO = { privado: false, permitePago: true, cuentaCloudflare: true };

function fuenteDelModulo(): string {
  return readFileSync(new URL("../agentes/ordenador-agente.ts", import.meta.url), "utf8");
}

describe("diario de operaciones", () => {
  it("serializa una entrada como una sola línea JSON, sin saltos", () => {
    const linea = lineaDiario({ t: 1700000000000, op: "escribir", ruta: "notas/a\nb.txt", bytes: 12 });
    expect(linea).not.toContain("\n");
    expect(JSON.parse(linea)).toEqual({ t: 1700000000000, op: "escribir", ruta: "notas/a\nb.txt", bytes: 12 });
  });

  it("rechaza rutas absolutas, con «..» o con barras invertidas", () => {
    expect(() => lineaDiario({ t: 1, op: "leer", ruta: "/etc/passwd" })).toThrow(/absoluta/i);
    expect(() => lineaDiario({ t: 1, op: "leer", ruta: "../memoria.md" })).toThrow(/«\.\.»/);
    expect(() => lineaDiario({ t: 1, op: "leer", ruta: "notas\\x" })).toThrow(/barras invertidas/i);
  });
});

describe("elección del backend por la forma del trabajo", () => {
  const casos: Array<[FormaTrabajo, BackendOrdenador]> = [
    ["archivos-y-datos", "aislado-shell"],
    ["codigo-js", "aislado-js"],
    ["linux-completo", "contenedor"],
  ];

  it.each(casos)("%s se resuelve en %s con todo permitido", (forma, backend) => {
    const salida = elegirBackend(forma, TODO_PERMITIDO);
    expect(salida.backend).toBe(backend);
    expect(salida.motivo.length).toBeGreaterThan(0);
  });

  it("lo privado se queda en la neurona, por encima de cualquier otro permiso", () => {
    const salida = elegirBackend("linux-completo", {
      privado: true,
      permitePago: false,
      cuentaCloudflare: false,
    });
    expect(salida.backend).toBeNull();
    expect(salida.motivo).toBe("lo privado se queda en la neurona");
  });

  it("sin permiso de pago no se enciende el plan Workers Paid", () => {
    const salida = elegirBackend("codigo-js", {
      privado: false,
      permitePago: false,
      cuentaCloudflare: true,
    });
    expect(salida.backend).toBeNull();
    expect(salida.motivo).toBe(
      "Cloudflare Computer pide el plan Workers Paid: el ámbito no permite pago",
    );
  });

  it("sin cuenta de la persona no hay ordenador: el OS no abre cuentas", () => {
    const salida = elegirBackend("archivos-y-datos", {
      privado: false,
      permitePago: true,
      cuentaCloudflare: false,
    });
    expect(salida.backend).toBeNull();
    expect(salida.motivo).toBe(
      "falta la cuenta de Cloudflare de la persona (el OS no abre cuentas)",
    );
  });
});

const NOMBRE_VIEJO = "Man" + "do";

describe("el módulo es puro y habla en Genesis", () => {
  it("no importa nada de node:", () => {
    expect(fuenteDelModulo()).not.toMatch(/(?:from|require\()\s*["']node:/);
  });

  it(`no menciona «${NOMBRE_VIEJO}»`, () => {
    expect(fuenteDelModulo()).not.toContain(NOMBRE_VIEJO);
  });
});

describe("carpeta de estado del agente", () => {
  it("declara la carpeta como datos y fija la red en none", () => {
    expect(PLAN_ESTADO).toEqual({
      memoria: "memoria.md",
      notas: "notas/",
      resultados: "resultados/",
      diario: "diario.jsonl",
      red: "none",
    });
  });

  it("compone agentes/<id>/<alcance>/ con el id saneado", () => {
    expect(carpetaDeEstado("Agente 12/../X", "personal")).toBe("agentes/agente-12-x/personal/");
    expect(carpetaDeEstado("Aurora_7", "grupo")).toBe("agentes/aurora-7/grupo/");
    expect(carpetaDeEstado("nodo--uno", "publica")).toBe("agentes/nodo-uno/publica/");
  });

  it("solo deja minúsculas, dígitos y guiones, sin barras ni puntos", () => {
    const carpeta = carpetaDeEstado("../../etc/passwd", "perfil");
    const id = carpeta.split("/")[1];
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(id).not.toContain("..");
    expect(carpeta).toBe("agentes/etc-passwd/perfil/");
  });

  it("lanza un error en español si el id queda vacío o no tiene caracteres válidos", () => {
    expect(() => carpetaDeEstado("", "personal")).toThrow(/id del agente/i);
    expect(() => carpetaDeEstado("...", "personal")).toThrow(/id del agente/i);
    expect(() => carpetaDeEstado("///", "personal")).toThrow(/id del agente/i);
  });
});
