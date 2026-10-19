import { describe, it, expect } from "vitest";
import { traducirOperacionASDK } from "@/lib/video-html/operaciones-sdk";

describe("traducirOperacionASDK", () => {
  const operacionBase = {
    id: "test-op",
    objetivo: {
      atomoId: "video1",
      parametroId: "texto"
    },
    autor: {
      tipo: "persona",
      id: "user1",
      nombre: "Usuario de Prueba"
    },
    origen: "mano",
    t: Date.now()
  };

  it("debe traducir operación exacta de texto a setText", () => {
    const operacion = {
      ...operacionBase,
      accion: {
        tipo: "exacta",
        valor: "Hola Mundo"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "setText",
      target: "video1::texto",
      value: "Hola Mundo"
    });
  });

  it("debe traducir operación exacta de color a setStyle", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "color"
      },
      accion: {
        tipo: "exacta",
        valor: "#ff0000"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "setStyle",
      target: "video1::color",
      styles: {
        color: "#ff0000"
      }
    });
  });

  it("debe traducir operación exacta de ancho a setStyle", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "width"
      },
      accion: {
        tipo: "exacta",
        valor: "100px"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "setStyle",
      target: "video1::width",
      styles: {
        width: "100px"
      }
    });
  });

  it("debe traducir operación exacta de start a setTiming", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "start"
      },
      accion: {
        tipo: "exacta",
        valor: 5
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    // Nota: La duración por defecto es 1, en una implementación real vendría de otro parámetro
    expect(resultado).toEqual({
      tipo: "setTiming",
      target: "video1::start",
      start: 5,
      duration: 1
    });
  });

  it("debe traducir operación exacta de src a setAttribute", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "src"
      },
      accion: {
        tipo: "exacta",
        valor: "https://example.com/video.mp4"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "setAttribute",
      target: "video1::src",
      name: "src",
      value: "https://example.com/video.mp4"
    });
  });

  it("debe traducir operación exacta de variable a setVariableValue", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "title"
      },
      accion: {
        tipo: "exacta",
        valor: "Mi Video"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "setVariableValue",
      id: "title",
      value: "Mi Video"
    });
  });

  it("debe rechazar operación con propiedad onClick", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "onClick"
      },
      accion: {
        tipo: "exacta",
        valor: "alert('hola')"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "rechazado",
      motivo: "Propiedad no permitida: onClick"
    });
  });

  it("debe rechazar operación con propiedad onmouseover", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "onmouseover"
      },
      accion: {
        tipo: "exacta",
        valor: "console.log('sobre')"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "rechazado",
      motivo: "Propiedad no permitida: onmouseover"
    });
  });

  it("debe rechazar operación con animación GSAP", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "gsapTween"
      },
      accion: {
        tipo: "exacta",
        valor: "{x: 100}"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "rechazado",
      motivo: "Animación GSAP no permitida: gsapTween"
    });
  });

  it("debe rechazar acción relativa", () => {
    const operacion = {
      ...operacionBase,
      accion: {
        tipo: "relativa",
        cantidad: 10,
        modo: "delta"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "rechazado",
      motivo: "Acciones relativas no implementadas (requieren valor actual)"
    });
  });

  it("debe rechazar acción de alternar", () => {
    const operacion = {
      ...operacionBase,
      accion: {
        tipo: "alternar"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "rechazado",
      motivo: "Acciones de alternar no implementadas (requieren valor actual)"
    });
  });

  it("debe manejar disparo de play", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "play"
      },
      accion: {
        tipo: "disparo"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "setAttribute",
      target: "video1::play",
      name: "data-action",
      value: "play"
    });
  });

  it("debe rechazar disparo no mapeado", () => {
    const operacion = {
      ...operacionBase,
      objetivo: {
        ...operacionBase.objetivo,
        parametroId: "accionDesconocida"
      },
      accion: {
        tipo: "disparo"
      }
    };

    const resultado = traducirOperacionASDK(operacion);
    expect(resultado).toEqual({
      tipo: "rechazado",
      motivo: "Disparo no válido para el parámetro: accionDesconocida"
    });
  });
});