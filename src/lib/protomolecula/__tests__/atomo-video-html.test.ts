/** Átomo «video-html» (HFR1018D): definición, registro y PLAN puro del render de HyperFrames.
 *  Argumentos como lista de tokens (sin shell), telemetría fuera; sin red, sin navegador ni procesos. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { RESOLUCIONES, VIDEO_HTML, planRender } from "../atomos/video-html";
import { ATOMOS_PROPIOS } from "../atomos";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";

type Plan = ReturnType<typeof planRender>;
/** Los pares bandera→valor de los tokens, para leerlos en las pruebas. */
function pares(plan: Plan): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < plan.args.length - 1; i++) {
    if (plan.args[i].startsWith("--")) out.push([plan.args[i], plan.args[i + 1]]);
  }
  return out;
}
const valorDe = (plan: Plan, bandera: string): string | undefined => pares(plan).find(([f]) => f === bandera)?.[1];
const variablesDe = (plan: Plan): string[] => pares(plan).filter(([f]) => f === "--variables").map(([, v]) => v);

describe("átomo video-html · definición", () => {
  beforeEach(() => limpiarRegistro());
  it("declara el contrato de HyperFrames, se registra y está en el índice", () => {
    expect(VIDEO_HTML).toMatchObject({
      herramientaId: "hyperframes", categoria: "video", integracion: "servicio-local", control: "total",
      ficha: { licencia: "Apache-2.0" },
    });
    expect(VIDEO_HTML.parametros.map((p) => p.id)).toEqual(["duracion", "resolucion", "fps", "calidad", "formato", "variables"]);
    expect(VIDEO_HTML.entradas).toEqual(expect.arrayContaining(["texto", "imagen", "audio", "video", "datos", "voz"]));
    expect(VIDEO_HTML.salidas).toEqual(expect.arrayContaining(["video", "fotogramas"]));
    expect(VIDEO_HTML.parametros.find((p) => p.id === "duracion")).toMatchObject({ min: 1, max: 600, unidad: "s", defecto: 30 });
    expect(registrarAtomo(VIDEO_HTML)).toEqual({ ok: true });
    expect(ATOMOS_PROPIOS).toContain(VIDEO_HTML);
  });
  it("el módulo es puro, sin claves ni IPs, y cabe en 120 líneas", () => {
    const src = readFileSync(path.join(__dirname, "..", "atomos", "video-html.ts"), "utf8");
    expect(src.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
    expect(src).not.toMatch(/from ["'](react|next|node:|fs|path|child_process)/);
    expect(src).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|localStorage|navigator|setTimeout|spawn)\b|Date\.now|Math\.random|\bany\b/);
    expect(src).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|sk-[A-Za-z0-9]{10}|Bearer\s/);
  });
});

describe("planRender", () => {
  it("argumentos por defecto como lista de tokens, y telemetría fuera", () => {
    const plan = planRender();
    expect(valorDe(plan, "--format")).toBe("mp4");
    expect(valorDe(plan, "--quality")).toBe("draft");
    expect(valorDe(plan, "--fps")).toBe("30");
    expect(valorDe(plan, "--resolution")).toBe(RESOLUCIONES.landscape);
    expect(valorDe(plan, "--duration")).toBe("30s");
    expect(variablesDe(plan)).toEqual([]);
    expect(plan.entorno).toEqual({ HYPERFRAMES_NO_TELEMETRY: "1" });
    expect(plan.fotogramas).toBe(30 * 30);
  });
  it("es puro: misma entrada, mismo plan, y la entrada no cambia", () => {
    const valores = { duracion: 90, resolucion: "portrait", fps: "60", variables: "idioma=es, tema=oscuro" };
    const copia = { ...valores };
    expect(planRender(valores)).toEqual(planRender({ ...valores }));
    expect(valores).toEqual(copia);
  });
  it("resolución, fps, calidad y formato elegidos llegan a los tokens", () => {
    const plan = planRender({ resolucion: "4k", fps: "24", formato: "gif", calidad: "delivery" });
    expect(valorDe(plan, "--resolution")).toBe(RESOLUCIONES["4k"]);
    expect(valorDe(plan, "--fps")).toBe("24");
    expect(valorDe(plan, "--format")).toBe("gif");
    expect(valorDe(plan, "--quality")).toBe("delivery");
  });
  it("un valor inválido vuelve al defecto y la duración se acota a 1–600 s", () => {
    const raro = planRender({ resolucion: "panoramica", fps: 300, formato: "avi", calidad: "ultra", duracion: 9999 });
    expect(valorDe(raro, "--format")).toBe("mp4");
    expect(valorDe(raro, "--quality")).toBe("draft");
    expect(valorDe(raro, "--resolution")).toBe(RESOLUCIONES.landscape);
    expect(valorDe(raro, "--duration")).toBe("600s");
    expect(planRender({ duracion: 0 }).fotogramas).toBe(30); // 1 s al mínimo, 30 fps por defecto
  });
  it("las variables van a los tokens, una bandera por par; las malformadas se descartan con aviso", () => {
    const plan = planRender({ variables: " idioma=es , tema=oscuro , roto , =raro " });
    expect(variablesDe(plan)).toEqual(["idioma=es", "tema=oscuro"]);
    expect(plan.variables).toEqual({ idioma: "es", tema: "oscuro" });
    expect(plan.avisos.join(" ")).toContain("Variable inválida descartada: «roto»");
  });
});
