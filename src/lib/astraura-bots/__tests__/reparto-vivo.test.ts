import { describe, it, expect } from "vitest";
import { entradaRepartoDesde } from "@/lib/astraura-bots/adaptadores/reparto-vivo";

describe("entradaRepartoDesde", () => {
  it("web sin capas → par o externo según privacidad", () => {
    const dep = {
      perfilDelMedio: () => ({ plataforma: "web", base: { ramGb: 8, cpuCores: 4, gpuDisponible: false } }),
      presupuestoMedio: () => ({ disco_mb: 12, ram_mb: 0, capas_guardables: ["reflejo"], segundo_plano: false, motivo: "web" }),
      capasInstaladas: () => [],
      nodosCapas: () => [],
      preferenciasCapas: () => ({ activo: true, capas: { local: false, mesh: false, nube: false, colectiva: false }, nivelador: 80, especifico: null }),
      apisFreeCatalog: () => [],
      presupuestoPago: () => ({ disponible: 0 }),
    };
    const entrada = entradaRepartoDesde(dep);
    expect(entrada.tipoCapa).toBe("reflejo");
    expect(entrada.dificultad).toBe(0.5);
    expect(entrada.disponibleParaPago).toBe(false);
  });
});
