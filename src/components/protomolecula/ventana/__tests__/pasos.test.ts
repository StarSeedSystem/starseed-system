import { describe, expect, it } from "vitest";
import type { OperacionPedida } from "@/lib/protomolecula/peticion/contrato";
import { describirPaso, permiteReglasLocales, permiteReintento, textoFallo, textoVeredicto } from "../pasos";

const grupo = { tipo: "grupo" as const, id: "g1", nombre: "Semilla" };

describe("describirPaso", () => {
  const casos: [OperacionPedida, string][] = [
    [{ tipo: "crear-objeto-3d", descripcion: "un tótem", animado: true }, "Crear un objeto 3D animado"],
    [{ tipo: "crear-objeto-3d", descripcion: "un tótem", animado: false }, "Crear un objeto 3D"],
    [{ tipo: "generar-imagen", descripcion: "un bosque", formato: "9:16" }, "Generar una imagen (9:16)"],
    [{ tipo: "editar-entidad", objetivo: { tipo: "archivo", id: "a1", nombre: "notas.md" }, cambio: "más corto", modo: "rama" }, "Editar archivo «notas.md» en una rama"],
    [{ tipo: "editar-entidad", objetivo: grupo, cambio: "tema oscuro", modo: "directo" }, "Editar grupo «Semilla» directamente"],
    [{ tipo: "insertar-en", destino: grupo, que: "una molécula" }, "Insertar en grupo «Semilla»"],
    [{ tipo: "abrir-en", donde: "xr" }, "Abrir en XR (realidad virtual o aumentada)"],
    [{ tipo: "abrir-en", donde: "pizarra", que: "Semilla" }, "Abrir en una pizarra"],
    [{ tipo: "fondo", descripcion: "aurora" }, "Cambiar el fondo"],
    [{ tipo: "dictar-molecula", orden: "sube la mezcla" }, "Dar una orden a la molécula"],
    [{ tipo: "proponer-metagenesis", que: "un botón nuevo" }, "Proponer a MetaGenesis"],
  ];
  it.each(casos)("%j", (op, titulo) => {
    expect(describirPaso(op).titulo).toBe(titulo);
  });
});

describe("textos honestos", () => {
  it("sin IA dice lo que se puede hacer con las reglas locales y lo que no", () => {
    const t = textoFallo("sin-ia", "");
    expect(t).toContain("Sin IA disponible: puedo hacerlo con las reglas locales");
    expect(t).toContain("herramientas de abajo");
    expect(permiteReglasLocales("sin-ia")).toBe(true);
  });

  it("cada fallo tiene su texto y ninguno promete lo que no hace", () => {
    for (const tipo of ["sin-ia", "sin-contexto", "vacia", "fuera-de-vocabulario", "tope", "tarda", "fallo"] as const) {
      expect(textoFallo(tipo, "motivo X").length).toBeGreaterThan(10);
    }
    expect(textoFallo("tope", "20 por hora")).toContain("20 por hora");
    expect(textoFallo("fallo", "")).toContain("No se aplicó nada");
    expect(permiteReintento("fuera-de-vocabulario")).toBe(false);
    expect(permiteReglasLocales("vacia")).toBe(false);
  });

  it("el veredicto se cuenta en lenguaje claro", () => {
    expect(textoVeredicto({ decision: "aplicar", motivo: "", confirmar: true }).boton).toBe("Aplicar");
    expect(textoVeredicto({ decision: "proponer", motivo: "", confirmar: true }).titulo).toMatch(/no cambia nada/);
    expect(textoVeredicto({ decision: "votar", motivo: "", confirmar: true }).boton).toMatch(/votación/);
    expect(textoVeredicto({ decision: "denegar", motivo: "", confirmar: false }).tono).toBe("denegar");
  });
});
