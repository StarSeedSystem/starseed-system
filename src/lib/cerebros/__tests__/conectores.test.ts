import { describe, expect, it } from "vitest";
import {
  alternarEnCerebro,
  claveConectores,
  cuentaPorEstado,
  reunirConectores,
  type ConectorCerebro,
  type ConectorCerebroEstado
} from "../conectores";

describe("conectores lógica pura", () => {
  describe("reunirConectores", () => {
    it("debe convertir correctamente los estados de conectores", () => {
      const f = {
        conectores: [
          { id: "conn1", name: "Connector 1", status: "connected" },
          { id: "conn2", name: "Connector 2", status: "needs-auth" },
          { id: "conn3", name: "Connector 3", status: "available" },
          { id: "conn4", name: "Connector 4", status: "error" }
        ],
        integraciones: [],
        mcp: [],
        externos: [],
        canales: []
      };
      
      const result = reunirConectores(f, [], Date.now());
      
      expect(result[0]).toEqual({
        id: "conector:conn1",
        nombre: "Connector 1",
        tipo: "conector",
        estado: "conectado",
        enCerebro: false,
        enlace: "/conexiones"
      });
      
      expect(result[1]).toEqual({
        id: "conector:conn2",
        nombre: "Connector 2",
        tipo: "conector",
        estado: "falta-clave",
        enCerebro: false,
        enlace: "/conexiones"
      });
      
      expect(result[2]).toEqual({
        id: "conector:conn3",
        nombre: "Connector 3",
        tipo: "conector",
        estado: "disponible",
        enCerebro: false,
        enlace: "/conexiones"
      });
      
      expect(result[3]).toEqual({
        id: "conector:conn4",
        nombre: "Connector 4",
        tipo: "conector",
        estado: "error",
        enCerebro: false,
        enlace: "/conexiones"
      });
    });

    it("debe convertir correctamente los estados de integraciones", () => {
      const f = {
        conectores: [],
        integraciones: [
          { id: "int1", name: "Integration 1", configurada: true, error: null },
          { id: "int2", name: "Integration 2", configurada: false, error: null },
          { id: "int3", name: "Integration 3", configurada: true, error: "Algún error" }
        ],
        mcp: [],
        externos: [],
        canales: []
      };
      
      const result = reunirConectores(f, [], Date.now());
      
      expect(result[0]).toEqual({
        id: "integracion:int1",
        nombre: "Integration 1",
        tipo: "integracion",
        estado: "disponible",
        enCerebro: false,
        enlace: "/conexiones"
      });
      
      expect(result[1]).toEqual({
        id: "integracion:int2",
        nombre: "Integration 2",
        tipo: "integracion",
        estado: "falta-clave",
        enCerebro: false,
        enlace: "/conexiones"
      });
      
      expect(result[2]).toEqual({
        id: "integracion:int3",
        nombre: "Integration 3",
        tipo: "integracion",
        estado: "error",
        enCerebro: false,
        enlace: "/conexiones"
      });
    });

    it("debe convertir correctamente los estados de MCP", () => {
      const f = {
        conectores: [],
        integraciones: [],
        mcp: [
          { id: "mcp1", name: "MCP 1", enlazada: true },
          { id: "mcp2", name: "MCP 2", enlazada: false }
        ],
        externos: [],
        canales: []
      };
      
      const result = reunirConectores(f, [], Date.now());
      
      expect(result[0]).toEqual({
        id: "mcp:mcp1",
        nombre: "MCP 1",
        tipo: "mcp",
        estado: "conectado",
        enCerebro: false,
        enlace: "/conexiones"
      });
      
      expect(result[1]).toEqual({
        id: "mcp:mcp2",
        nombre: "MCP 2",
        tipo: "mcp",
        estado: "falta-clave",
        enCerebro: false,
        enlace: "/conexiones"
      });
    });

    it("debe convertir correctamente los estados de externos", () => {
      const ahora = Date.now();
      const pasado = new Date(ahora - 86400000).toISOString(); // ayer
      const futuro = new Date(ahora + 86400000).toISOString(); // mañana
      
      const f = {
        conectores: [],
        integraciones: [],
        mcp: [],
        externos: [
          { id: "ext1", nombre: "External 1", revocado: false, expira_en: futuro },
          { id: "ext2", nombre: "External 2", revocado: true, expira_en: futuro },
          { id: "ext3", nombre: "External 3", revocado: false, expira_en: pasado },
          { id: "ext4", nombre: "External 4", revocado: false, expira_en: null }
        ],
        canales: []
      };
      
      const result = reunirConectores(f, [], ahora);
      
      // ext1: no revocado, no caducado -> disponible
      expect(result.find(r => r.id === "externo:ext1")?.estado).toBe("disponible");
      // ext2: revocado -> error
      expect(result.find(r => r.id === "externo:ext2")?.estado).toBe("error");
      // ext3: no revocado, pero caducado -> error
      expect(result.find(r => r.id === "externo:ext3")?.estado).toBe("error");
      // ext4: no revocado, sin expiración -> disponible
      expect(result.find(r => r.id === "externo:ext4")?.estado).toBe("disponible");
    });

    it("debe convertir correctamente los estados de canales", () => {
      const f = {
        conectores: [],
        integraciones: [],
        mcp: [],
        externos: [],
        canales: [
          { id: "canal1", name: "Canal 1", activo: true },
          { id: "canal2", name: "Canal 2", activo: false }
        ]
      };
      
      const result = reunirConectores(f, [], Date.now());
      
      expect(result.find(r => r.id === "canal:canal1")?.estado).toBe("conectado");
      expect(result.find(r => r.id === "canal:canal2")?.estado).toBe("disponible");
    });

    it("debe marcar correctamente enCerebro", () => {
      const f = {
        conectores: [
          { id: "conn1", name: "Connector 1", status: "connected" },
          { id: "conn2", name: "Connector 2", status: "needs-auth" }
        ],
        integraciones: [],
        mcp: [],
        externos: [],
        canales: []
      };
      
      const enCerebro = ["conector:conn1"];
      const result = reunirConectores(f, enCerebro, Date.now());
      
      expect(result[0].enCerebro).toBe(true);  // conn1 está en enCerebro
      expect(result[1].enCerebro).toBe(false); // conn2 no está en enCerebro
    });

    it("debe ordenar correctamente por estado y luego por nombre", () => {
      const f = {
        conectores: [
          { id: "zconn", name: "Z Connector", status: "disponible" },
          { id: "aconn", name: "A Connector", status: "conectado" },
          { id: "bconn", name: "B Connector", status: "error" },
          { id: "cconn", name: "C Connector", status: "falta-clave" }
        ],
        integraciones: [],
        mcp: [],
        externos: [],
        canales: []
      };
      
      const result = reunirConectores(f, [], Date.now());
      
      // Orden esperado: conectado, falta-clave, error, disponible
      // Dentro de cada estado, ordenado por nombre
      expect(result[0].id).toBe("conector:aconn"); // A Connector (conectado)
      expect(result[1].id).toBe("conector:cconn"); // C Connector (falta-clave)
      expect(result[2].id).toBe("conector:bconn"); // B Connector (error)
      expect(result[3].id).toBe("conector:zconn"); // Z Connector (disponible)
    });
  });

  describe("alternarEnCerebro", () => {
    it("debe agregar un ID cuando no está en el array", () => {
      const ids = ["a", "b"];
      const result = alternarEnCerebro(ids, "c");
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("debe eliminar un ID cuando está en el array", () => {
      const ids = ["a", "b", "c"];
      const result = alternarEnCerebro(ids, "b");
      expect(result).toEqual(["a", "c"]);
    });

    it("debe devolver un nuevo array sin modificar el original", () => {
      const ids = ["a", "b", "c"];
      const result = alternarEnCerebro(ids, "b");
      expect(result).not.toBe(ids);
      expect(ids).toEqual(["a", "b", "c"]); // original no modificado
    });
  });

  describe("claveConectores", () => {
    it("debe generar la clave correcta para un brainId", () => {
      expect(claveConectores("brain123")).toBe("starseed.brain.brain123.conectores");
    });
  });

  describe("cuentaPorEstado", () => {
    it("debe contar correctamente los conectores por estado", () => {
      const lista: ConectorCerebro[] = [
        { id: "1", nombre: "1", tipo: "conector", estado: "conectado", enCerebro: false, enlace: "/conexiones" },
        { id: "2", nombre: "2", tipo: "conector", estado: "conectado", enCerebro: false, enlace: "/conexiones" },
        { id: "3", nombre: "3", tipo: "conector", estado: "falta-clave", enCerebro: false, enlace: "/conexiones" },
        { id: "4", nombre: "4", tipo: "conector", estado: "error", enCerebro: false, enlace: "/conexiones" },
        { id: "5", nombre: "5", tipo: "conector", estado: "disponible", enCerebro: false, enlace: "/conexiones" },
        { id: "6", nombre: "6", tipo: "conector", estado: "disponible", enCerebro: false, enlace: "/conexiones" },
        { id: "7", nombre: "7", tipo: "conector", estado: "disponible", enCerebro: false, enlace: "/conexiones" }
      ];
      
      const cuenta = cuentaPorEstado(lista);
      expect(cuenta.conectado).toBe(2);
      expect(cuenta["falta-clave"]).toBe(1);
      expect(cuenta.error).toBe(1);
      expect(cuenta.disponible).toBe(3);
    });
  });
});