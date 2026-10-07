import { describe, it, expect } from "vitest";
import { vistaPublica } from "../vista-publica";
import { type Visibilidad } from "../ambito";

type EstadoOla = {
  nombre: string;
  avance: number;
  tareas: {
    id: string;
    titulo: string;
    estado: string;
    prompt?: string;
    archivos?: string[];
    registro?: unknown;
    proveedor?: string;
  }[];
};

const agora = Date.now();

type EstadoIntegrada = {
  titulo: string;
  fecha: string;
  archivos?: string[];
  commit?: string;
};

type EstadoMotor = {
  estado: string;
  ultimo_reporte: string;
  proveedores?: string[];
};

type Medidores = {
  creditos?: unknown;
};

type ChatEntrada = {
  canal: string;
  autor: string;
  texto: string;
};

type EstadoAmbito = {
  ambito: {
    nombre: string;
    visibilidad: Visibilidad;
  };
  olas: EstadoOla[];
  integradas: EstadoIntegrada[];
  motor: EstadoMotor;
  medidores?: Medidores;
  chat: ChatEntrada[];
};

describe("vistaPublica", () => {
  const ahora = Date.now();

  const estadoBase: EstadoAmbito = {
    ambito: {
      nombre: "testScope",
      visibilidad: "publico",
    },
    olas: [
      {
        nombre: "ola1",
        avance: 50,
        tareas: [
          {
            id: "t1",
            titulo: "Tarea 1",
            estado: "completada",
            prompt: "PROMPT-SECRETO",
            archivos: ["ruta/privada.ts"],
            registro: { datos: "privados" },
            proveedor: "proveedor-x",
          },
        ],
      },
    ],
    integradas: [
      {
        titulo: "Integración 1",
        fecha: "2024-01-01T00:00:00.000Z",
        archivos: ["privado.ts"],
        commit: "abc123",
      },
    ],
    motor: {
      estado: "activo",
      ultimo_reporte: new Date(agora - 5 * 60000).toISOString(),
      proveedores: ["proveedor-1"],
    },
    medidores: {
      creditos: 123.45,
    },
    chat: [
      {
        canal: "interno",
        autor: "admin",
        texto: "Mensaje interno",
      },
      {
        canal: "publico",
        autor: "usuario",
        texto: "Mensaje público visible",
      },
    ],
  };

  it("visibilidad privada → null", () => {
    const privado: EstadoAmbito = {
      ...estadoBase,
      ambito: { ...estadoBase.ambito, visibilidad: "privado" },
    };
    expect(vistaPublica(privado)).toBe(null);
  });

  it("visibilidad miembros → null", () => {
    const miembros: EstadoAmbito = {
      ...estadoBase,
      ambito: { ...estadoBase.ambito, visibilidad: "miembros" },
    };
    expect(vistaPublica(miembros)).toBe(null);
  });

  it("visibilidad público → resultados filtrados", () => {
    const resultado = vistaPublica(estadoBase);
    expect(resultado).not.toBe(null);
    expect(resultado.ambito.nombre).toBe("testScope");
    expect(resultado.ambito.visibilidad).toBe("publico");
    expect(resultado.olas[0].nombre).toBe("ola1");
    expect(resultado.olas[0].avance).toBe(50);
    expect(resultado.olas[0].tareas).toHaveLength(1);
    expect(resultado.olas[0].tareas[0].titulo).toBe("Tarea 1");
    expect(resultado.olas[0].tareas[0].estado).toBe("completada");
    expect(resultado.olas[0].tareas[0].id).toBe("t1");
    expect(resultado.integradas).toHaveLength(1);
    expect(resultado.integradas[0].titulo).toBe("Integración 1");
    expect(resultado.integradas[0].fecha).toBe("2024-01-01T00:00:00.000Z");
    expect(resultado.motor.estado).toBe("activo");
    expect(resultado.motor.haceMin).toBe(5);
    expect(resultado.avanceMedio).toBe(50);
    expect(resultado.chat).toHaveLength(1);
    expect(resultado.chat[0].autor).toBe("usuario");
    expect(resultado.chat[0].texto).toBe("Mensaje público visible");
    expect(resultado.chat[0].autor).toBeDefined();
    expect(resultado.chat[0].texto).toBeDefined();
  });

  it("SIN PROMPTS SECRETOS en JSON.stringify", () => {
    const resultado = vistaPublica(estadoBase);
    const json = JSON.stringify(resultado);
    expect(json).not.toContain("PROMPT-SECRETO");
    expect(json).not.toContain("ruta/privada.ts");
    expect(json).not.toContain("proveedor-x");
    expect(json).not.toContain("123.45");
    expect(json).not.toContain("Mensaje interno");
  });

  it("avance medio sin integradas vacío", () => {
    const sinOlas: EstadoAmbito = {
      ...estadoBase,
      olas: [],
    };
    const resultado = vistaPublica(sinOlas);
    expect(resultado).not.toBe(null);
    expect(resultado.avanceMedio).toBe(0);
  });

  it("chat sin mensajes públicos vacío", () => {
    const sinChatPublico: EstadoAmbito = {
      ...estadoBase,
      chat: [
        {
          canal: "interno",
          autor: "admin",
          texto: "Solo interno",
        },
      ],
    };
    const resultado = vistaPublica(sinChatPublico);
    expect(resultado.chat).toHaveLength(0);
  });
});