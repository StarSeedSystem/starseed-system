import { describe, it, expect } from "vitest";
import type { CapacidadesNodo } from "../../network/capacidades-nodo";
import type { Candidato } from "../../protomolecula/planificador-computo";
import type { LinkedServer } from "../../brains/servers";
import {
  capacidadesNodoToOfertaNeurona,
  capacidadDeServidor,
  linkedServerToOfertaNeurona,
  candidatoToOfertaNeurona,
   ofertaNeuronaToCandidato,
   candidatosDesdePlan,
} from "../adaptadores";
import type { OfertaNeurona, PlanResultado } from "../oferta";



describe("adaptadores", () => {
  describe("capacidadesNodoToOfertaNeurona", () => {
    it("should convert CapacidadesNodo to OfertaNeurona", () => {
      const nodo: CapacidadesNodo = {
        nodoId: "nodo1",
        medio: "mac",
        needle: { version: "1.0" },
        bitnet: { tokPorS: 10, ctx: 100, ocupado: false },
        jev: true,
        ramLibreMb: 2048,
        cpu: 50,
        t: 1234567890,
        capas: ["layer1@1.0"],
        tokS: { "layer1@1.0": 5 },
        bateriaPct: 80,
        enSegundoPlano: false,
        ambitos: ["propio", "cuenta"],
      };

      const oferta = capacidadesNodoToOfertaNeurona(nodo);

      expect(oferta.nodoId).toBe("nodo1");
      expect(oferta.medio).toBe("mac");
      expect(oferta.computo.ramLibreMb).toBe(2048);
      expect(oferta.computo.gpu).toBe(false);
      expect(oferta.almacen.prestaMb).toBe(0);
      expect(oferta.energia.bateriaPct).toBe(80);
      expect(oferta.presta.cuenta).toBe(false); // Porque en nuestra implementación lo ponemos a false
      expect(oferta.t).toBe(1234567890);
    });
  });

  describe("linkedServerToOfertaNeurona", () => {
    it("should convert LinkedServer (compute) to OfertaNeurona", () => {
      const servidor: LinkedServer = {
        id: "srv1",
        owner: "user1",
        name: "Server 1",
        kind: "service",
        endpoint: "http://example.com",
        keyRef: "key1",
        config: { port: 8080 },
        status: "conectado",
        shared: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        link: {
          role: "compute",
          priority: 1,
          sync: { direction: "both", auto: true },
        },
      };

      const oferta = linkedServerToOfertaNeurona(servidor);

      expect(oferta.nodoId).toBe("srv1");
      expect(oferta.cuentaId).toBe("user1");
      expect(oferta.medio).toBe("nube");
      // Sin capacidad declarada no se inventa ninguna: el servidor queda no elegible.
      expect(oferta.computo.nucleos).toBe(0);
      expect(oferta.computo.ramLibreMb).toBe(0);
      expect(oferta.computo.gpu).toBe(false);
      expect(oferta.almacen.prestaMb).toBe(0);
       expect(oferta.presta.cuenta).toBe(true);
       expect(oferta.presta.publico).toBe(true); // Porque el servidor tiene owner y está compartido
      expect(oferta.t).toBeGreaterThan(0);
    });

    it("should convert LinkedServer (storage) to OfertaNeurona", () => {
      const servidor: LinkedServer = {
        id: "srv2",
        owner: "user2",
          name: "Server 2",
          kind: "service",
          endpoint: "http://example2.com",
        keyRef: "key2",
        config: { port: 8081 },
        status: "conectado",
        shared: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        link: {
          role: "storage",
          priority: 2,
          sync: { direction: "pull", auto: false },
        },
      };

      const oferta = linkedServerToOfertaNeurona(servidor);

      expect(oferta.nodoId).toBe("srv2");
      expect(oferta.cuentaId).toBe("user2");
      expect(oferta.medio).toBe("nube");
      expect(oferta.computo.nucleos).toBe(0);
      expect(oferta.computo.ramLibreMb).toBe(0);
      // Sin capacidad declarada tampoco se inventa el almacén.
      expect(oferta.almacen.prestaMb).toBe(0);
      expect(oferta.presta.cuenta).toBe(true);
      expect(oferta.presta.publico).toBe(false); // Porque shared es false
      expect(oferta.t).toBeGreaterThan(0);
    });

    const servidorConCapacidad = (
      role: "compute" | "storage",
      capacidad: Record<string, unknown>
    ): LinkedServer => ({
      id: "srv-cap",
      owner: "user1",
      name: "Servidor con capacidad",
      kind: "service",
      endpoint: "http://example.com",
      keyRef: "key1",
      config: { port: 8080, capacidad },
      status: "conectado",
      shared: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
      link: { role, priority: 1, sync: { direction: "both", auto: true } },
    });

    it("usa la capacidad declarada por su dueño", () => {
      const oferta = linkedServerToOfertaNeurona(
        servidorConCapacidad("compute", {
          nucleos: 4,
          ramLibreMb: 8192,
          gpu: true,
          vramMb: 6144,
          arquitectura: "amd64",
          fuente: "declarada",
        })
      );

      expect(oferta.computo.nucleos).toBe(4);
      expect(oferta.computo.ramLibreMb).toBe(8192);
      expect(oferta.computo.gpu).toBe(true);
      expect(oferta.computo.vramMb).toBe(6144);
      expect(oferta.almacen.prestaMb).toBe(0);
    });

    it("usa la capacidad medida y su fecha", () => {
      const servidor = servidorConCapacidad("storage", {
        prestaMb: 51200,
        arquitectura: "arm64",
        fuente: "medida",
        medidaEn: "2026-10-20T18:00:00Z",
      });

      const oferta = linkedServerToOfertaNeurona(servidor);

      expect(oferta.almacen.prestaMb).toBe(51200);
      expect(oferta.computo.nucleos).toBe(0);
      expect(capacidadDeServidor(servidor.config)).toEqual({
        prestaMb: 51200,
        arquitectura: "arm64",
        fuente: "medida",
        medidaEn: "2026-10-20T18:00:00Z",
      });
    });

    it("deja el servidor a cero cuando no hay capacidad", () => {
      const oferta = linkedServerToOfertaNeurona(servidorConCapacidad("compute", {}));

      expect(oferta.computo.nucleos).toBe(0);
      expect(oferta.computo.ramLibreMb).toBe(0);
      expect(oferta.computo.gpu).toBe(false);
      expect(oferta.computo.vramMb).toBeUndefined();
      expect(oferta.almacen.prestaMb).toBe(0);
    });

    it("ignora los datos inválidos en vez de inventarlos", () => {
      const oferta = linkedServerToOfertaNeurona(
        servidorConCapacidad("compute", {
          nucleos: -2,
          ramLibreMb: Number.NaN,
          gpu: "sí",
          vramMb: "4096",
          prestaMb: Infinity,
          arquitectura: "x86",
          fuente: "estimada",
          medidaEn: "   ",
        })
      );

      expect(oferta.computo.nucleos).toBe(0);
      expect(oferta.computo.ramLibreMb).toBe(0);
      expect(oferta.computo.gpu).toBe(false);
      expect(oferta.computo.vramMb).toBeUndefined();
      expect(oferta.almacen.prestaMb).toBe(0);
      expect(
        capacidadDeServidor({
          capacidad: {
            ramLibreMb: 2048,
            nucleos: "ocho",
            arquitectura: "amd64",
          },
        })
      ).toEqual({ ramLibreMb: 2048, arquitectura: "amd64" });
    });
  });

  describe("candidatoToOfertaNeurona", () => {
    it("should convert Candidato to OfertaNeurona", () => {
      const candidato: Candidato = {
        tipo: "neurona-procesador",
        neuronaId: "neurona1",
        libreMB: 4096,
        gpu: true,
        consentimiento: true,
        cuentaPropia: true,
        ocupacion: 20,
      };

      const oferta = candidatoToOfertaNeurona(candidato);

      expect(oferta.nodoId).toBe("neurona1");
      expect(oferta.computo.ramLibreMb).toBe(4096);
      expect(oferta.computo.gpu).toBe(true);
      expect(oferta.presta.cuenta).toBe(true);
      expect(oferta.presta.publico).toBe(false); // Porque cuentaPropia es true -> publico: !cuentaPropia -> false
      expect(oferta.t).toBeGreaterThan(0);
    });
  });

  describe("ofertaNeuronaToCandidato", () => {
    it("should convert OfertaNeurona to Candidato", () => {
      const oferta: OfertaNeurona = {
        nodoId: "nodo1",
        cuentaId: "user1",
        medio: "mac",
        computo: {
          nucleos: 2,
          ramLibreMb: 2048,
          gpu: true,
          vramMb: 4096,
          motores: ["motor1"],
        },
        almacen: {
          prestaMb: 5000,
          volumenes: ["vol1"],
        },
        apps: [{ id: "app1", version: "1.0" }],
        enlaces: {
          subidaKbps: 1000,
          bajadaKbps: 1000,
          latenciaMs: { "vecino1": 10 },
        },
        energia: {
          bateriaPct: 90,
          cargando: true,
          enUso: false,
        },
        presta: {
          cuenta: true,
          grupos: ["grupo1"],
          publico: true,
          topes: {
            cpuPct: 80,
            ramMb: 4096,
            discoMb: 10000,
            horas: { inicio: 0, fin: 23 },
            soloCargando: false,
          },
        },
        t: 1234567890,
      };

      const candidato = ofertaNeuronaToCandidato(oferta);

      expect(candidato.tipo).toBe("neurona-procesador"); // Porque tiene gpu: true
      expect(candidato.neuronaId).toBe("nodo1");
      expect(candidato.libreMB).toBe(2048);
      expect(candidato.gpu).toBe(true);
      expect(candidato.consentimiento).toBe(true); // Porque oferta.presta.publico es true
      expect(candidato.cuentaPropia).toBe(true);
      expect(candidato.ocupacion).toBe(0);
    });
  });

  describe("candidatosDesdePlan", () => {
    it("should convert plan to Candidato array", () => {
      const plan: PlanResultado[] = [
        { ofertaId: "nodo1", motivo: "Reason 1" },
        { ofertaId: "nodo2", motivo: "Reason 2" },
      ];

      const ofertasDisponibles: OfertaNeurona[] = [
        {
          nodoId: "nodo1",
          cuentaId: "user1",
          medio: "mac",
          computo: {
            nucleos: 2,
            ramLibreMb: 2048,
            gpu: true,
            vramMb: 4096,
            motores: [],
          },
          almacen: { prestaMb: 5000, volumenes: [] },
          apps: [],
          enlaces: {},
          energia: { bateriaPct: 90, cargando: true, enUso: false },
          presta: {
            cuenta: true,
            grupos: [],
            publico: true,
            topes: { cpuPct: 80, ramMb: 4096, discoMb: 10000, horas: undefined, soloCargando: false },
          },
          t: 1234567890,
        },
        {
          nodoId: "nodo2",
          cuentaId: "user2",
          medio: "linux",
          computo: {
            nucleos: 4,
            ramLibreMb: 4096,
            gpu: false,
            vramMb: undefined,
            motores: [],
          },
          almacen: { prestaMb: 10000, volumenes: [] },
          apps: [],
          enlaces: {},
          energia: { bateriaPct: undefined, cargando: false, enUso: true },
          presta: {
            cuenta: false,
            grupos: [],
            publico: true,
            topes: { cpuPct: 0, ramMb: 0, discoMb: 0, horas: undefined, soloCargando: false },
          },
          t: 1234567891,
        },
      ];

      const candidatos = candidatosDesdePlan(plan, ofertasDisponibles);

      expect(candidatos).toHaveLength(2);
      expect(candidatos[0].neuronaId).toBe("nodo1");
      expect(candidatos[0].tipo).toBe("neurona-procesador");
      expect(candidatos[0].libreMB).toBe(2048);
      expect(candidatos[0].gpu).toBe(true);
      expect(candidatos[1].neuronaId).toBe("nodo2");
      expect(candidatos[1].tipo).toBe("neurona-nas"); // Sin GPU pero con ram
      expect(candidatos[1].libreMB).toBe(4096);
      expect(candidatos[1].gpu).toBe(false);
    });
  });
});