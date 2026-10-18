import { describir, it, expect, antesDeCada } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo } from "../registro-atomos";

function crearAtomoValido(id: string, nombre: string, categoria: string = "protomolecula"): DefinicionAtomo {
  const parametro = { id: "p", nombre: "P", tipo: "numero" };
  return {
    herramientaId: id,
    nombre,
    categoria,
    integracion: "libreria-js",
    control: "total",
    parametros: [parametro],
    entradas: [],
    salidas: [],
  };
}

describir("debug-proximamente-atom", () => {
  antesDeCada(() => limpiarRegistro());

  it("should show proximamente when atom has proximamente field", () => {
    const atomo: DefinicionAtomo = {
      ...crearAtomoValido("proximate-tool", "Herramienta Próxima", "protomolecula"),
      proximamente: "Falta implementar el envoltorio nativo"
    };
    const registroResult = registrarAtomo(atomo);
    // console.log can be omitted in final test; but we keep for debugging if needed
    // console.log("Registro result:", registroResult);

    const resultado = fichasProtomolecula();
    // console.log("Resultado:", resultado);
    // console.log("Resultado length:", resultado.length);

    if (resultado.length > 0) {
      // console.log("First item:", resultado[0]);
      // console.log("Verified:", resultado[0].verified);
      // console.log("Description:", resultado[0].description);
    }

    expect(resultado[0].description).toContain("Próximamente: Falta implementar el envoltorio nativo");
    expect(resultado[0].verified).toBe(false);
  });
});