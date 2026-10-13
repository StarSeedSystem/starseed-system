import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";

function atomo(herramientaId: string, categoria: CategoriaAtomo = "imagen", extra: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return { herramientaId, nombre: herramientaId, categoria, integracion: "libreria-js", control: "total", parametros: [parametro], entradas: [], salidas: [], ...extra };
}

type CategoriaAtomo = 
  | "imagen"
  | "audio"
  | "video"
  | "3d"
  | "arquitectura"
  | "fisicas"
  | "juegos"
  | "vr-ar"
  | "codigo"
  | "ia";

interface Parametro {
  id: string;
  nombre: string;
  tipo: "numero" | "entero" | "booleano" | "opcion" | "disparo";
}

interface DefinicionAtomo {
  herramientaId: string;
  nombre: string;
  categoria: CategoriaAtomo;
  integracion: string;
  control: string;
  parametros: Parametro[];
  entradas: string[];
  salidas: string[];
  vista?: any;
  proximamente?: string;
  ficha?: { web?: string; repo?: string; licencia?: string };
}

describe("fichasProtomolecula - orden absoluto", () => {
  beforeEach(() => limpiarRegistro());

  it("ordena las fichas según el orden especificado en el contrato (posiciones absolutas)", () => {
    // Registrar un átomo para cada uno de los primeros 10 grupos en ORDEN_GRUPOS_PROTO
    const categoriasYGrupos = [
      { categoria: "raster-pintura", nombre: "Herramienta de Imagen 1", grupoEsperado: "imagen" },
      { categoria: "audio-edicion", nombre: "Herramienta de Audio 1", grupoEsperado: "audio" },
      { categoria: "video-composicion", nombre: "Herramienta de Video 1", grupoEsperado: "video" },
      { categoria: "modelado-3d", nombre: "Herramienta de 3D 1", grupoEsperado: "3d" },
      { categoria: "arquitectura-cad", nombre: "Herramienta de Arquitectura 1", grupoEsperado: "arquitectura" },
      { categoria: "fisicas", nombre: "Herramienta de Físicas 1", grupoEsperado: "fisicas" },
      { categoria: "motores-juego", nombre: "Herramienta de Juegos 1", grupoEsperado: "juegos" },
      { categoria: "xr", nombre: "Herramienta de VR/AR 1", grupoEsperado: "vr-ar" },
      { categoria: "editor-codigo", nombre: "Herramienta de Código 1", grupoEsperado: "codigo" },
      { categoria: "ia-generativa", nombre: "Herramienta de IA 1", grupoEsperado: "ia" },
    ];

    // Registrar todos los átomos
    for (const { categoria, nombre } of categoriasYGrupos) {
      registrarAtomo(atomo(nombre.toLowerCase().replace(/\s/g, '-'), categoria, { nombre }));
    }

    const resultado = fichasProtomolecula();

    // Debemos tener exactamente 10 fichas (uno por cada categoría registrada)
    expect(resultado.length).toBe(10);

    // Verificar que la ficha en posición 0 pertenece al grupo "imagen"
    expect(resultado[0].categoria).toBe("imagen");
    // Verificar que la ficha en posición 6 pertenece al grupo "juegos"
    expect(resultado[6].categoria).toBe("juegos");
    // Verificar que la ficha en posición 9 pertenece al grupo "ia"
    expect(resultado[9].categoria).toBe("ia");
  });
});