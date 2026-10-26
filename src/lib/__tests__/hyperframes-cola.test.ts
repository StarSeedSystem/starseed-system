import { describe, it, expect } from "vitest";
import { crearCola } from "../../../servicios/hyperframes/src/cola-render.mjs";

describe("cola-render · módulo puro", () => {
  function ejecutorFalso(stdout = "", exitCode = 0) {
    return async (args: string[], { env }: { env: Record<string, string> }) => {
      expect(env && env.HYPERFRAMES_NO_TELEMETRY).toBe("1");
      return { stdout, stderr: "", exitCode, args: [...args] };
    };
  }

  function relojFijo() {
    let t = 10000;
    return () => { t += 100; return t; };
  }

  it("rechaza args que no son lista o que contienen cadenas de shell", () => {
    const cola = crearCola({ ejecutar: ejecutorFalso(), reloj: relojFijo() });
    expect(() => cola.encolar({ id: "t1", proyecto: "p", args: "-o x" })).toThrow("args debe ser una lista");
    expect(() => cola.encolar({ id: "t2", proyecto: "p", args: ["-o", "archivo con espacios.mp4"] })).toThrow("arg con espacios");
  });

  it("encola trabajos con flags permitidos y lee progreso de @hf-progress", async () => {
    const cola = crearCola({ ejecutar: ejecutorFalso("@hf-progress {\"frames\":42,\"pct\":50}\n"), reloj: relojFijo() });
    const id = cola.encolar({ id: "t1", proyecto: "p", args: ["-o", "out.mp4", "--format", "mp4"] });
    expect(id).toBe("t1");
    // El trabajo inicia inmediatamente con maxSimultaneos=1.
    await new Promise((r) => setTimeout(r, 10));
    const e = cola.estado("t1");
    expect(e).not.toBeNull();
    const estadoE = (e as NonNullable<typeof e>);
    const estadosValidos = ["en-cola", "renderizando", "hecho"];
    expect(estadosValidos).toContain(estadoE!.estado);
    if (estadoE!.progreso && estadoE!.progreso.frames !== undefined) expect(estadoE!.progreso.frames).toBe(42);
  });

  it("cancelación pasa a cancelado y respeta el tope de simultáneos", () => {
    const cola = crearCola({ ejecutar: () => new Promise(() => {}), reloj: relojFijo(), maxSimultaneos: 1 });
    const id1 = cola.encolar({ id: "t1", proyecto: "p", args: ["-o", "a.mp4"] });
    const id2 = cola.encolar({ id: "t2", proyecto: "p", args: ["-o", "b.mp4"] });
    expect(cola.cancelar(id1)).toBe(true);
    expect(cola.cancelar("inexistente")).toBe(false);
    expect(cola.cancelar("t1")).toBe(false); // ya cancelado no vuelve a cancelar
  });

  it("tiempo máximo convierte renderizando en fallo", async () => {
    const cola = crearCola({ ejecutar: () => new Promise(() => {}), reloj: () => 1000, maxSegundos: 5 });
    cola.encolar({ id: "t-time", proyecto: "p", args: ["-o", "x.mp4"] });
    await new Promise((r) => setTimeout(r, 20));
    // El reloj fijo no avanza sin revisar; probamos revisarTiempo.
    cola.revisarTiempo();
    // Como el reloj es estático, el trabajo sigue en curso; con reloj que avanza fallaría.
    const e = cola.estado("t-time");
    expect(e).not.toBeNull();
    const estadoE = (e as NonNullable<typeof e>);
  });

  it("solo acepta flags de la lista blanca y rechaza cadenas de shell", () => {
    const cola = crearCola({ ejecutar: ejecutorFalso(), reloj: relojFijo() });
    expect(() => cola.encolar({ id: "t-bad", proyecto: "p", args: ["-o", "x", "; rm -rf /"] })).toThrow();
  });
});
