import { describe, expect, it } from "vitest";
import { botonesNeurona, type NeuronaColmena, type Boton } from "@/lib/metagenesis/colmena";

const MAC: NeuronaColmena = {
  nodo: "mac-a1b2c3",
  vivo: true,
  so: "macos",
  enCurso: 0,
  contenedor: null,
};

describe("colmena-botones · botones de una neurona", () => {
  it("sin trabajo en curso, el botón de desconectar está deshabilitado", () => {
    const b = botonesNeurona(MAC);
    expect(b.desconectar).toMatchObject({ visible: true, habilitado: false, etiqueta: "Desconectar" });
    expect(b.desconectar.explica).toBe("No tiene trabajo en curso: puedes apagarlo sin más.");
    expect(b.desconectar.confirmar).toBe(false);
  });

  it("con contenedor activo y sin trabajo en curso, el botón de desconectar está habilitado", () => {
    const contenedorActivo: NeuronaColmena = {
      ...MAC,
      contenedor: { activo: true, agentes: 3, apto: true, motivo: "" },
    };
    const b = botonesNeurona(contenedorActivo);
    expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
    expect(b.contenedor).toMatchObject({ visible: true, habilitado: true, etiqueta: "Dejar de usar como contenedor" });
  });

  it("mostrar botón de desconectar cuando hay trabajo en curso con 1 agente", () => {
    const conUnAgente: NeuronaColmena = {
      ...MAC,
      enCurso: 1,
    };
    const b = botonesNeurona(conUnAgente);
    expect(b.desconectar).toMatchObject({ visible: true, habilitado: true, etiqueta: "Desconectar" });
    expect(b.desconectar.explica).toContain("1 agente");
    expect(b.desconectar.confirmar).toBe(true);
  });
});