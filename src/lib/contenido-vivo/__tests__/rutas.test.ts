import { describe, it, expect } from "vitest";
import { compararRutas, elegirRuta, type ContextoRutas } from "../rutas";

const contexto = (cambios: Partial<ContextoRutas> = {}): ContextoRutas => ({
  alcance: "publica",
  conectados: [],
  cupoHoy: {},
  creditosDisponibles: 1000,
  topeMes: 1000,
  gastadoMes: 0,
  neurona: { gpu: true, capaz3d: true },
  ajustes: { localPrimero: true, externosPermitidos: true },
  ...cambios,
});

const buscar = (tarea: "escena-3d" | "clip-pelicula", id: string, ctx: ContextoRutas) =>
  compararRutas(tarea, ctx).find((evaluada) => evaluada.ruta.id === id);

describe("elección de ruta de contenido vivo", () => {
  it("nunca elige una ruta externa en alcance personal", () => {
    const ctx = contexto({
      alcance: "personal",
      conectados: ["spline"],
      cupoHoy: { spline: 10 },
      ajustes: { localPrimero: false, externosPermitidos: true },
    });
    const elegida = elegirRuta("escena-3d", ctx);
    expect(elegida?.tipo).toBe("local");
    const externas = compararRutas("escena-3d", ctx).filter(
      (evaluada) => evaluada.ruta.tipo === "externo",
    );
    expect(externas.every((evaluada) => !evaluada.disponible)).toBe(true);
  });

  it("deja el motivo y el enlace cuando el servicio no está conectado", () => {
    const spline = buscar("escena-3d", "spline-mcp", contexto());
    expect(spline?.disponible).toBe(false);
    expect(spline?.puntuacion).toBe(0);
    expect(spline?.motivoNoDisponible).toContain("https://mcp.spline.design/mcp");
  });

  it("elige Higgsfield para una película con cupo y sin neurona capaz", () => {
    const ctx = contexto({
      conectados: ["higgsfield"],
      cupoHoy: { higgsfield: 5 },
      neurona: { gpu: false, capaz3d: false },
    });
    expect(elegirRuta("clip-pelicula", ctx)?.id).toBe("higgsfield-seedance-2-1080");
  });

  it("mantiene los gráficos vivos siempre en local", () => {
    const ctx = contexto({ conectados: ["spline", "higgsfield"] });
    const evaluadas = compararRutas("grafico-vivo", ctx);
    expect(evaluadas.length).toBeGreaterThan(0);
    expect(evaluadas.every((evaluada) => evaluada.ruta.tipo === "local")).toBe(true);
    expect(elegirRuta("grafico-vivo", ctx)?.id).toBe("hyperframes-grafico-vivo");
  });

  it("prefiere la local cuando queda a 0,1 de la mejor externa", () => {
    const base = {
      conectados: ["spline"],
      cupoHoy: { spline: 10 },
      neurona: { gpu: false, capaz3d: false },
    };
    const conLocalPrimero = contexto(base);
    const sinLocalPrimero = contexto({
      ...base,
      ajustes: { localPrimero: false, externosPermitidos: true },
    });
    expect(elegirRuta("escena-3d", conLocalPrimero)?.id).toBe("threejs-escena3d");
    expect(elegirRuta("escena-3d", sinLocalPrimero)?.id).toBe("spline-mcp");
  });

  it("descarta la ruta externa cuando no queda cupo hoy", () => {
    const spline = buscar(
      "escena-3d",
      "spline-mcp",
      contexto({
        conectados: ["spline"],
        cupoHoy: { spline: 0 },
        neurona: { gpu: false, capaz3d: false },
      }),
    );
    expect(spline?.disponible).toBe(false);
    expect(spline?.motivoNoDisponible).toContain("Sin cupo");
  });

  it("descarta la ruta externa cuando el ámbito no las permite", () => {
    const ctx = contexto({
      conectados: ["spline"],
      cupoHoy: { spline: 10 },
      neurona: { gpu: false, capaz3d: false },
      ajustes: { localPrimero: false, externosPermitidos: false },
    });
    expect(elegirRuta("escena-3d", ctx)?.id).toBe("threejs-escena3d");
    expect(buscar("escena-3d", "spline-mcp", ctx)?.motivoNoDisponible).toContain(
      "no están permitidos",
    );
  });

  it("no elige nada para una película sin GPU ni servicios conectados", () => {
    const ctx = contexto({ neurona: { gpu: false, capaz3d: false } });
    expect(elegirRuta("clip-pelicula", ctx)).toBeNull();
    expect(buscar("clip-pelicula", "clip-neurona-gpu", ctx)?.motivoNoDisponible).toContain("GPU");
  });

  it("ordena primero las disponibles y deja las descartadas en cero con razón", () => {
    const evaluadas = compararRutas("escena-3d", contexto());
    const primeraDescartada = evaluadas.findIndex((evaluada) => !evaluada.disponible);
    expect(primeraDescartada).toBeGreaterThan(-1);
    expect(
      evaluadas.slice(primeraDescartada).every(
        (evaluada) => !evaluada.disponible && evaluada.puntuacion === 0,
      ),
    ).toBe(true);
    expect(evaluadas.every((evaluada) => evaluada.razon.length > 0)).toBe(true);
  });
});
