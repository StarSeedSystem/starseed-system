import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  crearToken,
  procesarMensaje,
  mensajeParaMarco,
  destinoDe,
  esUrlEmbebible,
  type Marco,
  type EstadoLimite,
  type EntradaPuente,
} from "../puente-herramientas";
import type { Parametro } from "../tipos";

function crearMarcoConToken(token: string, origenEsperado: string | null = null): Marco {
  return {
    ventana: {}, // Simulado
    token,
    origenEsperado,
    parametros: [],
  };
}

function estadoLimiteInicial(): EstadoLimite {
  return {
    mensajesPorSegundo: 120,
    ultimoSegundo: 0,
    contadorMensajes: 0,
  };
}

function crearParametroValido(id: string, nombre: string, tipo: Parametro["tipo"]): Parametro {
  return { id, nombre, tipo };
}

describe("puente-herramientas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("crearToken", () => {
    it("genera un string hexadecimal de 32 caracteres (16 bytes)", () => {
      const mockAleatorio = vi.fn((n: number) => {
        const bytes = new Uint8Array(n);
        for (let i = 0; i < n; i++) bytes[i] = i + 1;
        return bytes;
      });

      const token = crearToken(mockAleatorio);
      expect(typeof token).toBe("string");
      expect(token.length).toBe(32); // 16 bytes * 2 caracteres hex cada uno
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
      expect(mockAleatorio).toHaveBeenCalledWith(16);
    });
  });

  describe("mensajeParaMarco", () => {
    it("crea un mensaje con la estructura correcta", () => {
      const payload = { foo: "bar", numero: 42 };
      const mensaje = mensajeParaMarco("hola", payload, "token123");
      
      expect(mensaje).toEqual({
        protomolecula: 1,
        tipo: "hola",
        canal: "token123",
        foo: "bar",
        numero: 42,
      });
    });
  });

  describe("destinoDe", () => {
    it("devuelve '*' para marcos con origen esperado null (sandbox sin allow-same-origin)", () => {
      const marco = crearMarcoConToken("token", null);
      expect(destinoDe(marco)).toBe("*");
    });

    it("devuelve el origen exacto para marcos con origen real", () => {
      const marco = crearMarcoConToken("token", "https://example.com");
      expect(destinoDe(marco)).toBe("https://example.com");
    });
  });

  describe("esUrlEmbebible", () => {
    const origenOS = "https://starseed-os.vercel.app";

    it("acepta URLs https:// válidas sin credenciales y distinto origen", () => {
      const resultado = esUrlEmbebible("https://herramienta.example.com/app", origenOS);
      expect(resultado.ok).toBe(true);
      expect(resultado.origen).toBe("https://herramienta.example.com");
    });

    it("rechaza URLs con protocolo http:", () => {
      const resultado = esUrlEmbebible("http://herramienta.example.com/app", origenOS);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("Solo se permiten URLs con protocolo https:");
    });

    it("rechaza URLs con credenciales", () => {
      const resultado = esUrlEmbebible("https://usuario:password@herramienta.example.com/app", origenOS);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("La URL no puede contener credenciales");
    });

    it("rechaza URLs del mismo origen que el OS", () => {
      const resultado = esUrlEmbebible("https://starseed-os.vercel.app/app", origenOS);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("La URL no puede ser del mismo origen que el OS");
    });

    it("rechaza URLs con esquema javascript:", () => {
      const resultado = esUrlEmbebible("javascript:alert('xss')", origenOS);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("Esquema de URL prohibido");
    });

    it("rechaza URLs con esquema data:", () => {
      const resultado = esUrlEmbebible("data:text/plain;base64,SGVsbG8=", origenOS);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("Esquema de URL prohibido");
    });

    it("rechaza URLs con esquema blob:", () => {
      const resultado = esUrlEmbebible("blob:https://example.com/123e4567-e89b-12d3-a456-426614174000", origenOS);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("Esquema de URL prohibido");
    });

    it("maneja URLs inválidas", () => {
      const resultado = esUrlEmbebible("no-es-una-url", origenOS);
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBe("URL inválida");
    });
  });

  describe("procesarMensaje", () => {
    const tokenValido = "a1b2c3d4e5f678901234567890123456"; // 32 chars hex
    const origenOS = "https://starseed-os.vercel.app";

    it("rechaza ventana ajena (source no coincide con ventana del marco)", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: {}, // Diferente de marco.ventana
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Source del evento no coincide");
    });

    it("rechaza token malo", () => {
      const marco = crearMarcoConToken("token-valido", "https://herramienta.example.com");
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana, // Coincide
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: "token-equivocado", // Token incorrecto
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Canal del mensaje no coincide");
    });

    it("rechaza origen malo en marco propio con sandbox sin allow-same-origin", () => {
      const marco = crearMarcoConToken(tokenValido, null); // Marco propio
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com", // No es "null"
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Origen esperado 'null'");
    });

    it("acepta origen 'null' en marco propio con sandbox sin allow-same-origin", () => {
      const marco = crearMarcoConToken(tokenValido, null); // Marco propio
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "null", // Correcto para sandbox sin allow-same-origin
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
          nombre: "Herramienta de prueba",
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).not.toBeNull();
      if (resultado.entrada) {
        expect(resultado.entrada.tipo).toBe("hola");
        expect(resultado.entrada.nombre).toBe("Herramienta de prueba");
      }
    });

    it("rechaza origen malo en marco con origen esperado real", () => {
      const marco = crearMarcoConToken(tokenValido, "https://herramienta-correcta.com");
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta-mala.com", // Incorrecto
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Origen inesperado");
    });

    it("acepta origen correcto en marco con origen esperado real", () => {
      const marco = crearMarcoConToken(tokenValido, "https://herramienta.example.com");
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com", // Correcto
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
          nombre: "Herramienta de prueba",
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).not.toBeNull();
      if (resultado.entrada) {
        expect(resultado.entrada.tipo).toBe("hola");
        expect(resultado.entrada.nombre).toBe("Herramienta de prueba");
      }
    });

    it("ignora tipos de mensaje desconocidos", () => {
      const marco = crearMarcoConToken(tokenValido, "https://herramienta.example.com");
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "tipo-desconocido", // Tipo desconocido
          canal: tokenValido,
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Tipo de mensaje desconocido ignorado");
    });

    it("rechaza mensajes que no son objetos", () => {
      const marco = crearMarcoConToken(tokenValido, "https://herramienta.example.com");
      const estadoInicial = estadoLimiteInicial();
      
      // Prueba con null
      let resultado = procesarMensaje(
        { origin: "https://herramienta.example.com", source: marco.ventana, data: null },
        marco,
        Date.now(),
        estadoInicial
      );
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Los datos del mensaje no son un objeto válido");

      // Prueba con cadena
      resultado = procesarMensaje(
        { origin: "https://herramienta.example.com", source: marco.ventana, data: "no-es-un-objeto" },
        marco,
        Date.now(),
        estadoInicial
      );
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Los datos del mensaje no son un objeto válido");

      // Prueba con número
      resultado = procesarMensaje(
        { origin: "https://herramienta.example.com", source: marco.ventana, data: 123 },
        marco,
        Date.now(),
        estadoInicial
      );
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Los datos del mensaje no son un objeto válido");
    });

    it("valida correctamente el mensaje hola", () => {
      const marco = crearMarcoConToken(tokenValido, "https://herramienta.example.com");
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
          nombre: "Herramienta de prueba",
          parametros: [
            crearParametroValido("volumen", "Volumen", "numero"),
            crearParametroValido("filtro", "Filtro", "opcion"),
          ],
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).not.toBeNull();
      if (resultado.entrada && resultado.entrada.tipo === "hola") {
        expect(resultado.entrada.nombre).toBe("Herramienta de prueba");
        expect(Array.isArray(resultado.entrada.parametros)).toBe(true);
        expect(resultado.entrada.parametros?.length).toBe(2);
      }
    });

    it("valida correctamente el mensaje cambio", () => {
      const marco = crearMarcoConToken(tokenValido, "https://herramienta.example.com");
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "cambio",
          canal: tokenValido,
          parametroId: "volumen",
          valor: 0.5,
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).not.toBeNull();
      if (resultado.entrada && resultado.entrada.tipo === "cambio") {
        expect(resultado.entrada.parametroId).toBe("volumen");
        expect(resultado.entrada.valor).toBe(0.5);
      }
    });

    it("valida correctamente el mensaje exportar", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "exportar",
          canal: tokenValido,
          formato: "png",
          datos: { ancho: 800, alto: 600 },
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).not.toBeNull();
      if (resultado.entrada && resultado.entrada.tipo === "exportar") {
        expect(resultado.entrada.formato).toBe("png");
        expect(resultado.entrada.datos).toEqual({ ancho: 800, alto: 600 });
      }
    });

    it("valida correctamente el mensaje listo", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "listo",
          canal: tokenValido,
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).not.toBeNull();
      if (resultado.entrada && resultado.entrada.tipo === "listo") {
        expect(resultado.entrada.canal).toBe(tokenValido);
      }
    });

    it("valida correctamente el mensaje error", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "error",
          canal: tokenValido,
          mensaje: "Algo salió mal",
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).not.toBeNull();
      if (resultado.entrada && resultado.entrada.tipo === "error") {
        expect(resultado.entrada.mensaje).toBe("Algo salió mal");
      }
    });

    it("rechaza mensaje hola con nombre no válido", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
          nombre: 123, // No es cadena
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("El campo 'nombre' en mensaje hola debe ser una cadena");
    });

    it("rechaza mensaje cambio con parametroId no válido", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "cambio",
          canal: tokenValido,
          parametroId: "", // Cadena vacía
          valor: 0.5,
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("El campo 'parametroId' en mensaje cambio es requerido");
    });

    it("rechaza mensaje exportar con formato no válido", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "exportar",
          canal: tokenValido,
          formato: "", // Cadena vacía
          datos: {},
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("El campo 'formato' en mensaje exportar es requerido");
    });

    it("rechaza mensaje error con mensaje no válido", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "error",
          canal: tokenValido,
          mensaje: "", // Cadena vacía
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("El campo 'mensaje' en mensaje error es requerido");
    });

    it("aplica límite de frecuencia correctamente", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = {
        ...estadoLimiteInicial(),
        mensajesPorSegundo: 3, // Límite bajo para testing
      };
      const ahora = 1000; // Segundo 1

      // Enviar 3 mensajes (límite exacto)
      for (let i = 0; i < 3; i++) {
        const ev = {
          origin: "https://herramienta.example.com",
          source: marco.ventana,
          data: {
            protomolecula: 1,
            tipo: "hola",
            canal: tokenValido,
          },
        };
        
        const resultado = procesarMensaje(ev, marco, ahora + i, {...estadoInicial});
        // Los primeros 3 deberían pasar
        if (i < 2) {
          expect(resultado.entrada).not.toBeNull();
        } else {
          // El tercero debería ser el último válido
          expect(resultado.entrada).not.toBeNull();
        }
      }

      // El cuarto mensaje debería ser rechazado por límite de frecuencia
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
        },
      };
      
      const resultado = procesarMensaje(ev, marco, ahora + 3, {
        ...estadoInicial,
        ultimoSegundo: 1,
        contadorMensajes: 3, // Ya hemos enviado 3 en este segundo
      });
      
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Límite de frecuencia excedido");
    });

    it("recupera del límite de frecuencia en el siguiente segundo", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = {
        ...estadoLimiteInicial(),
        mensajesPorSegundo: 2, // Límite bajo para testing
      };
      const segundo1 = 1000; // Segundo 1
      const segundo2 = 2000; // Segundo 2

      // Llegar al límite en el segundo 1
      for (let i = 0; i < 2; i++) {
        const ev = {
          origin: "https://herramienta.example.com",
          source: marco.ventana,
          data: {
            protomolecula: 1,
            tipo: "hola",
            canal: tokenValido,
          },
        };
        
        procesarMensaje(ev, marco, segundo1 + i, {
          ...estadoInicial,
          ultimoSegundo: 1,
          contadorMensajes: i, // Ya hemos enviado i mensajes en este segundo
        });
      }

      // Intentar enviar uno más en el segundo 1 (debería fallar)
      const evOverflow = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
        },
      };
      
      const resultadoOverflow = procesarMensaje(evOverflow, marco, segundo1 + 2, {
        ...estadoInicial,
        ultimoSegundo: 1,
        contadorMensajes: 2, // Ya hemos enviado 2 (límite alcanzado)
      });
      
      expect(resultadoOverflow.entrada).toBeNull();
      expect(resultadoOverflow.motivo).toContain("Límite de frecuencia excedido");

      // Enviar un mensaje en el segundo 2 (debería pasar)
      const evValido = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "hola",
          canal: tokenValido,
        },
      };
      
      const resultadoValido = procesarMensaje(evValido, marco, segundo2, {
        ...estadoInicial,
        ultimoSegundo: 2,
        contadorMensajes: 0, // Nuevo segundo, contador reset
      });
      
      expect(resultadoValido.entrada).not.toBeNull();
      expect(resultadoValido.entrada?.tipo).toBe("hola");
    });

    it("rechaza mensaje que excede el tamaño máximo de JSON (64 KB)", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      
      // Crear un payload grande que exceda 64 KB
      const payloadGrande = {
        protomolecula: 1,
        tipo: "hola",
        canal: tokenValido,
        datos: "x".repeat(70000), // 70 KB debería ser suficiente
      };
      
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: payloadGrande,
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Tamanho del mensaje excede el límite de 64 KB");
    });

    it("rechaza mensaje exportar que excede el tamaño máximo de datos (2 MB)", () => {
      const marco = crearMarcoConToken(tokenValido);
      const estadoInicial = estadoLimiteInicial();
      
      // Crear datos grandes que excedan 2 MB
      const datosGrandes = {
        datos: "x".repeat(2500000), // 2.5 MB debería ser suficiente
      };
      
      const ev = {
        origin: "https://herramienta.example.com",
        source: marco.ventana,
        data: {
          protomolecula: 1,
          tipo: "exportar",
          canal: tokenValido,
          formato: "bin",
          ...datosGrandes,
        },
      };

      const resultado = procesarMensaje(ev, marco, Date.now(), estadoInicial);
      expect(resultado.entrada).toBeNull();
      expect(resultado.motivo).toContain("Tamanho de los datos en mensaje exportar excede el límite de 2 MB");
    });
  });
});