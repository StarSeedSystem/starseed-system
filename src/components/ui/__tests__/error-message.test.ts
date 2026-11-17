import { describe, it, expect } from "vitest";
import { describirError } from "../error-message";
import { contextoErrorDeArea } from "@/lib/mando/areas";

describe("describirError", () => {
  it("usa un título de respaldo cuando el mensaje viene vacío", () => {
    const mensaje = describirError({ mensaje: "   " });
    expect(mensaje.titulo).toBe("Algo no salió como esperaba.");
    expect(mensaje.tono).toBe("error");
    expect(mensaje.detalle).toContain("No se guardó ningún cambio");
  });

  it("antepone el nombre del contexto y conserva una sola frase", () => {
    const mensaje = describirError({
      mensaje: "  No pude guardar el estado del rito  ",
      contexto: {
        nombre: "Rito y bienvenida",
        salida: "Puedes posponer la guía y retomarla después.",
      },
    });
    expect(mensaje.titulo).toBe("Rito y bienvenida · No pude guardar el estado del rito.");
    expect(mensaje.sugerencia).toBe("Puedes posponer la guía y retomarla después.");
  });

  it("cambia detalle y salida según el tono, y compone el anuncio accesible", () => {
    const mensaje = describirError({ mensaje: "Sin red", tono: "aviso" });
    expect(mensaje.detalle).toContain("resto del OS");
    expect(mensaje.sugerencia).toContain("Ajustes");
    expect(mensaje.anuncio).toBe(`${mensaje.titulo} ${mensaje.detalle} ${mensaje.sugerencia}`);
  });

  it("respeta detalle y sugerencia explícitos sin duplicar la puntuación final", () => {
    const mensaje = describirError({
      mensaje: "Falló el envío",
      detalle: "El correo no llegó…",
      sugerencia: "Reintenta en un minuto.",
    });
    expect(mensaje.detalle).toBe("El correo no llegó…");
    expect(mensaje.sugerencia).toBe("Reintenta en un minuto.");
  });
});

describe("contextoErrorDeArea", () => {
  it("toma nombre y acento de las áreas reales del OS", () => {
    const contexto = contextoErrorDeArea("rito");
    expect(contexto.nombre).toBe("Rito y bienvenida");
    expect(contexto.color).toBe("violet");
    expect(contexto.salida.length).toBeGreaterThan(10);
  });

  it("reconoce los contextos propios de esta tarea: mando y diseño", () => {
    expect(contextoErrorDeArea("mando")).toMatchObject({ nombre: "Mando (Genesis)", color: "cyan" });
    expect(contextoErrorDeArea("diseno")).toMatchObject({ nombre: "Diseño", color: "magenta" });
  });

  it("cae en un contexto general honesto cuando el área no existe", () => {
    const contexto = contextoErrorDeArea("area-inexistente");
    expect(contexto.nombre).toBe("StarSeed OS");
    expect(contexto.color).toBe("rose");
    expect(contexto.salida).toContain("Vuelve a intentarlo");
  });
});
