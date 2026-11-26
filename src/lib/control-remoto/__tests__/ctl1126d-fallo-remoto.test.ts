import { describe, it, expect } from "vitest";
import {
  extraerInformacionFallo,
  crearRegistroEvento,
  crearAvisoControlador,
  type DetalleFallo,
} from "../aviso-fallo-remoto";

describe("CTL1126D · aviso de fallo remoto", () => {
  describe("extraerInformacionFallo", () => {
    it("extrae la ruta y el mensaje del error", () => {
      const error = new Error("Fallo al cargar Señales") as Error & { digest?: string };
      error.digest = "abc123";
      const detalle = extraerInformacionFallo(error, "/senales");

      expect(detalle.codigo).toBe("CTL1126D");
      expect(detalle.ruta).toBe("/senales");
      expect(detalle.mensaje).toBe("Fallo al cargar Señales");
    });

    it("trunca el mensaje a 100 caracteres", () => {
      const longMensaje = "x".repeat(150);
      const error = new Error(longMensaje) as Error & { digest?: string };
      const detalle = extraerInformacionFallo(error, "/test");

      expect(detalle.mensaje.length).toBe(100);
    });

    it("usa el código de fallo CTL1126D", () => {
      const error = new Error("test") as Error & { digest?: string };
      const detalle = extraerInformacionFallo(error, "/ruta");

      expect(detalle.codigo).toBe("CTL1126D");
    });
  });

  describe("crearRegistroEvento", () => {
    it("crea un evento de registro con los datos correctos", () => {
      const detalle: DetalleFallo = {
        codigo: "CTL1126D",
        ruta: "/senales",
        mensaje: "Fallo al conectar",
      };
      const evento = crearRegistroEvento(detalle);

      expect(evento.tipo).toBe("fallo");
      expect(evento.texto).toBe("fallo en el aparato: /senales · Fallo al conectar");
      expect(evento.datos).toEqual({
        codigo: "CTL1126D",
        ruta: "/senales",
        digest: "CTL1126D",
      });
    });

    it("no incluye la pila completa del error", () => {
      const detalle: DetalleFallo = {
        codigo: "CTL1126D",
        ruta: "/test",
        mensaje: "error de prueba",
      };
      const evento = crearRegistroEvento(detalle);

      expect(evento.texto).not.toContain("stack");
      expect(evento.texto).not.toContain("at " as any);
    });
  });

  describe("crearAvisoControlador", () => {
    it("crea un aviso para el controlador sin datos personales", () => {
      const detalle: DetalleFallo = {
        codigo: "CTL1126D",
        ruta: "/senales",
        mensaje: "Fallo al mostrar datos",
      };
      const aviso = crearAvisoControlador(detalle);

      expect(aviso).not.toBeNull();
      expect(aviso!.tipo).toBe("fallo");
      expect(aviso!.ruta).toBe("/senales");
      expect(aviso!.mensaje).toBe("Fallo al mostrar datos");
      expect(aviso!.codigo).toBe("CTL1126D");
    });

    it("el mensaje es legible por el usuario final", () => {
      const detalle: DetalleFallo = {
        codigo: "CTL1126D",
        ruta: "/dashboard",
        mensaje: "Error de red",
      };
      const aviso = crearAvisoControlador(detalle);

      expect(aviso!.mensaje).toBe("Error de red");
    });
  });

  describe("integración de flujo", () => {
    it("flujo completo: error → detalle → registro → aviso", () => {
      const error = new Error("Fallo en Señales") as Error & { digest?: string };
      error.digest = "digest123";

      const detalle = extraerInformacionFallo(error, "/senales");
      const registro = crearRegistroEvento(detalle);
      const aviso = crearAvisoControlador(detalle);

      expect(detalle.ruta).toBe("/senales");
      expect(registro.texto).toContain("/senales");
      expect(aviso!.mensaje).toContain("Señales");
    });
  });
});