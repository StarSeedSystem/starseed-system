/**
 * Tests para el filtro de entrada de Astraura (Ola 1102A)
 */
import { describe, expect, it } from "vitest";
import {
  PropuestaImaginacion,
  filtroAstraura,
  familiaAstraura,
  filtrarPorTipoArchivo,
  filtrarPorFamiliaRepetida,
  filtrarPorTope,
  tieneAutorizacionInventada,
  etiquetaMedidorAstraura,
} from "@/lib/mando/imaginacion-tipos";

const hoy = new Date().toISOString().split("T")[0];

const lasDeAstraura: PropuestaImaginacion[] = [
  {
    id: "1",
    fuente: "astraura" as const,
    titulo: "Optimización ARM NEON para kernel",
    cuerpo: "Implementación del kernel",
    archivos: ["kernel.c", "README.md"],
    utilidad: 0.8,
    importancia: "media" as const,
    estado: "nueva" as const,
    motivo: "",
    t: hoy + "T10:00:00Z",
    agente: "bitnet",
    tipo: "codigo" as const,
    ambito: "metagenesis" as const,
    referencias: [],
    version: 1,
    version_de: "",
    reimaginacion: undefined,
    decidida: "",
    hasta: "",
  },
  {
    id: "2",
    fuente: "astraura" as const,
    titulo: "⚡ [AUTORIZADO] Optimización ARM NEON para kernel",
    cuerpo: "Implementación",
    archivos: ["kernel.rs"],
    utilidad: 0.7,
    importancia: "alta" as const,
    estado: "nueva" as const,
    motivo: "",
    t: hoy + "T11:00:00Z",
    agente: "bitnet",
    tipo: "codigo" as const,
    ambito: "metagenesis" as const,
    referencias: [],
    version: 1,
    version_de: "",
    reimaginacion: undefined,
    decidida: "",
    hasta: "",
  },
  {
    id: "3",
    fuente: "astraura" as const,
    titulo: "Esquema de Agente Mutado: Hephaestus-NEON",
    cuerpo: "Nuevo esquema",
    archivos: ["schema.rs"],
    utilidad: 0.9,
    importancia: "media" as const,
    estado: "nueva" as const,
    motivo: "",
    t: hoy + "T12:00:00Z",
    agente: "bitnet",
    tipo: "diseno" as const,
    ambito: "metagenesis" as const,
    referencias: [],
    version: 1,
    version_de: "",
    reimaginacion: undefined,
    decidida: "",
    hasta: "",
  },
  {
    id: "4",
    fuente: "astraura" as const,
    titulo: "Otro kernel NEON: kernel",
    cuerpo: "Mismo kernel",
    archivos: ["kernel.c"],
    utilidad: 0.6,
    importancia: "baja" as const,
    estado: "nueva" as const,
    motivo: "",
    t: hoy + "T13:00:00Z",
    agente: "bitnet",
    tipo: "codigo" as const,
    ambito: "metagenesis" as const,
    referencias: [],
    version: 1,
    version_de: "",
    reimaginacion: undefined,
    decidida: "",
    hasta: "",
  },
];

describe("filtroAstraura (Ola 1102A)", () => {
  it("filtra por tipo de archivo (solo C, C++, Rust, Zig, kernel)", () => {
    const todosLosArchivos = lasDeAstraura.flatMap((p) => p.archivos || []);
    const resultados = filtrarPorTipoArchivo(todosLosArchivos);
    expect(resultados.entrada).toBe(4);
    expect(resultados.descartada).toBe(1);
  });

  it("extrae familia de título sin autorización ni símbolos", () => {
    expect(familiaAstraura("Optimización ARM NEON para kernel")).toBe("optimizacion arm neon");
    expect(familiaAstraura("⚡ [AUTORIZADO] Optimización ARM NEON para kernel")).toBe("optimizacion arm neon");
    expect(familiaAstraura("Esquema de Agente Mutado: Hephaestus-NEON")).toBe("esquema de agente");
    expect(familiaAstraura("kernel.c: corregir bug")).toBe("kernel");
  });

  it("detecta autorización inventada en título o cuerpo", () => {
    const conAuth = lasDeAstraura[1];
    expect(tieneAutorizacionInventada(conAuth)).toBe(true);
    const sinAuth = lasDeAstraura[0];
    expect(tieneAutorizacionInventada(sinAuth)).toBe(false);
  });

  it("muestra la etiqueta correcta del medidor", () => {
    const f: any = {
      fecha: hoy,
      vistas: lasDeAstraura.length,
      entran: 3,
      filtradas: {
        tipoArchivo: { entrada: 3, descartada: 1 },
        familiaRepetida: { entrada: 3, descartada: 0 },
        tope: { entrada: 3, descartada: 0 },
      },
      autorizacionInventada: true,
    };
    expect(etiquetaMedidorAstraura(f)).toBe("Filtradas de Astraura hoy: 3 (familia 0 · tipo 0 · tope 3)");
  });
});
