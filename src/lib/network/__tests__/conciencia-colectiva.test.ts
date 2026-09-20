import { describe, it, expect } from "vitest";
import {
  anonimizar,
  loteDeExperiencias,
  recibidasSinDuplicar,
  fusionarManifiestos,
  crearTransporteMesh,
  esCapacidadesNodo,
  esExperiencia,
  esManifiestoAdaptador,
  type ManifiestoAdaptador,
  type MensajeConciencia,
} from "../conciencia-colectiva";
import { setupConcienciaSync } from "../lan-sync";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";
import type { Experiencia } from "@/lib/astraura/experiencias";

describe("conciencia-colectiva - funciones puras", () => {
  it("anonimizar borra entrada si el dominio es chat o persona", () => {
    const eChat: Experiencia = {
      id: "1",
      t: "2026-09-20 03:00:00",
      medio: "os-web",
      capa: "needle",
      tipo: "intencion",
      dominio: "chat",
      entrada: "mensaje privado",
      salida: "respuesta",
      confianza: 0.9,
      ms: 10,
      resultado: true,
    };
    const ePersona: Experiencia = { ...eChat, id: "2", dominio: "persona" };
    const eOtro: Experiencia = { ...eChat, id: "3", dominio: "general" };

    expect(anonimizar(eChat).entrada).toBe("");
    expect(anonimizar(ePersona).entrada).toBe("");
    expect(anonimizar(eOtro).entrada).toBe("mensaje privado");
  });

  it("loteDeExperiencias filtra resultado conocido, anonimiza y recorta", () => {
    const exps: Experiencia[] = [
      {
        id: "1",
        t: "t1",
        medio: "os-web",
        capa: "needle",
        tipo: "intencion",
        dominio: "chat",
        entrada: "secreto 1",
        salida: "s1",
        confianza: 0.8,
        ms: 5,
        resultado: true,
      },
      {
        id: "2",
        t: "t2",
        medio: "os-web",
        capa: "needle",
        tipo: "intencion",
        dominio: "general",
        entrada: "publico",
        salida: "s2",
        confianza: 0.8,
        ms: 5,
        resultado: null,
      },
      {
        id: "3",
        t: "t3",
        medio: "os-web",
        capa: "needle",
        tipo: "intencion",
        dominio: "persona",
        entrada: "secreto 2",
        salida: "s3",
        confianza: 0.9,
        ms: 5,
        resultado: false,
      },
    ];

    const lote = loteDeExperiencias(exps, 1);
    expect(lote).toHaveLength(1);
    expect(lote[0].id).toBe("1");
    expect(lote[0].entrada).toBe("");

    const loteCompleto = loteDeExperiencias(exps, 10);
    expect(loteCompleto).toHaveLength(2);
    expect(loteCompleto.map((x) => x.id)).toEqual(["1", "3"]);
    expect(loteCompleto[1].entrada).toBe("");
  });

  it("recibidasSinDuplicar ignora elementos ya conocidos o duplicados", () => {
    const e1 = { id: "a" } as Experiencia;
    const e2 = { id: "b" } as Experiencia;
    const e3 = { id: "c" } as Experiencia;

    const mias = [e1];
    const ajenas = [e1, e2, e2, e3];

    const unicas = recibidasSinDuplicar(mias, ajenas);
    expect(unicas.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("fusionarManifiestos selecciona el manifiesto ganador", () => {
    const base: ManifiestoAdaptador = {
      actual: "v1",
      sha: "sha1",
      t: 100,
      experiencias: 10,
      exactitud_dorado: 0.8,
      base: "needle3",
    };

    // Sin mio previo
    const f1 = fusionarManifiestos(null, base);
    expect(f1.sha).toBe("sha1");
    expect(f1.pendienteDescarga).toBe(true);

    // Mismo SHA -> se conserva mio
    const fMismo = fusionarManifiestos(base, { ...base });
    expect(fMismo).toBe(base);

    // Ajeno más nuevo y mejor exactitud -> gana ajeno
    const mejorAjeno: ManifiestoAdaptador = {
      ...base,
      actual: "v2",
      sha: "sha2",
      t: 200,
      exactitud_dorado: 0.9,
    };
    const f2 = fusionarManifiestos(base, mejorAjeno);
    expect(f2.sha).toBe("sha2");
    expect(f2.pendienteDescarga).toBe(true);

    // Ajeno más viejo / peor exactitud -> se conserva mio
    const peorAjeno: ManifiestoAdaptador = {
      ...base,
      actual: "v0",
      sha: "sha0",
      t: 50,
      exactitud_dorado: 0.7,
    };
    const f3 = fusionarManifiestos(base, peorAjeno);
    expect(f3).toBe(base);

    // Empate en tiempo y exactitud -> decide sha mayor
    const empateMenorSha: ManifiestoAdaptador = {
      ...base,
      sha: "sha0",
    };
    expect(fusionarManifiestos(base, empateMenorSha)).toBe(base);

    const empateMayorSha: ManifiestoAdaptador = {
      ...base,
      sha: "sha2",
    };
    const fEmpate = fusionarManifiestos(base, empateMayorSha);
    expect(fEmpate.sha).toBe("sha2");
    expect(fEmpate.pendienteDescarga).toBe(true);
  });

  it("crearTransporteMesh y setupConcienciaSync publican y reciben mensajes de los 3 temas", () => {
    let broadcastMsg = "";
    let messageHandler: ((deviceId: string, data: string) => void) | null = null;

    const mockMesh: MeshHandle = {
      myDeviceId: "nodo-1",
      userId: "u1",
      supported: true,
      signalingTransport: "realtime",
      connectToDevice: async () => ({ deviceId: "nodo-2", state: "connected", channelOpen: true, lastUpdate: Date.now() }),
      onPeer: (events) => {
        messageHandler = events.onMessage ?? null;
        return () => {
          messageHandler = null;
        };
      },
      sendToPeer: () => true,
      broadcast: (data: string) => {
        broadcastMsg = data;
        return 1;
      },
      getPeers: () => [],
      closeMesh: () => {},
    };

    let capRecibida = false;
    let expRecibida = false;
    let manifiestoRecibido = false;

    const sync = setupConcienciaSync(mockMesh, {
      onCapacidades: () => {
        capRecibida = true;
      },
      onNuevasExperiencias: (exps) => {
        if (exps.length > 0) expRecibida = true;
      },
      onNuevoManifiesto: () => {
        manifiestoRecibido = true;
      },
    });

    // Publicar capacidades
    sync.publicarCapacidades({
      nodoId: "nodo-1",
      medio: "mac",
      needle: { version: "3.0.0" },
      bitnet: null,
      jev: true,
      ramLibreMb: 1024,
      cpu: 10,
      t: Date.now(),
    });
    expect(broadcastMsg).toContain("astraura/capacidades");

    // Simular recepción
    if (messageHandler) {
      const msgCap: MensajeConciencia = {
        tema: "astraura/capacidades",
        origen: "nodo-2",
        payload: {
          nodoId: "nodo-2",
          medio: "nube",
          needle: null,
          bitnet: null,
          jev: false,
          ramLibreMb: 2048,
          cpu: 5,
          t: Date.now(),
        },
        t: Date.now(),
      };
      (messageHandler as (id: string, d: string) => void)("nodo-2", JSON.stringify(msgCap));
      expect(capRecibida).toBe(true);

      const msgExp: MensajeConciencia = {
        tema: "astraura/experiencias",
        origen: "nodo-2",
        payload: [
          {
            id: "exp-2",
            t: "t",
            medio: "mac",
            capa: "needle",
            tipo: "intencion",
            dominio: "general",
            entrada: "e",
            salida: "s",
            confianza: 0.9,
            ms: 10,
            resultado: true,
          },
        ],
        t: Date.now(),
      };
      (messageHandler as (id: string, d: string) => void)("nodo-2", JSON.stringify(msgExp));
      expect(expRecibida).toBe(true);

      const msgMan: MensajeConciencia = {
        tema: "astraura/adaptador",
        origen: "nodo-2",
        payload: {
          actual: "v2",
          sha: "sha2",
          t: 200,
          experiencias: 20,
          exactitud_dorado: 0.95,
          base: "needle3",
        },
        t: Date.now(),
      };
      (messageHandler as (id: string, d: string) => void)("nodo-2", JSON.stringify(msgMan));
      expect(manifiestoRecibido).toBe(true);
    }

    sync.unsubscribe();
  });

  it("validadores de forma aceptan solo payloads correctos y rechazan datos corruptos", () => {
    expect(esCapacidadesNodo(null)).toBe(false);
    expect(esCapacidadesNodo("invalido")).toBe(false);
    expect(esCapacidadesNodo({ nodoId: "n1", medio: "mac", t: 100 })).toBe(true);
    expect(esCapacidadesNodo({ nodoId: "", medio: "mac", t: 100 })).toBe(false);

    expect(esExperiencia(null)).toBe(false);
    expect(esExperiencia({})).toBe(false);
    expect(esExperiencia({ id: "exp-1" })).toBe(true);

    expect(esManifiestoAdaptador(null)).toBe(false);
    expect(esManifiestoAdaptador({ actual: "a", sha: "s", t: 1, exactitud_dorado: 0.8, base: "b" })).toBe(true);
    expect(esManifiestoAdaptador({ sha: "s" })).toBe(false);
  });

  it("recibidasSinDuplicar y fusionarManifiestos toleran payloads nulos o corruptos", () => {
    // @ts-expect-expected invalid payload tests
    expect(recibidasSinDuplicar([], null as unknown as Experiencia[])).toEqual([]);
    expect(recibidasSinDuplicar([], [null, "corrupto", { id: "ok-1" }] as unknown as Experiencia[])).toEqual([{ id: "ok-1" }]);

    const base: ManifiestoAdaptador = {
      actual: "v1",
      sha: "sha1",
      t: 100,
      experiencias: 10,
      exactitud_dorado: 0.8,
      base: "needle3",
    };
    expect(fusionarManifiestos(base, null as unknown as ManifiestoAdaptador)).toBe(base);
  });

  it("setupConcienciaSync ignora payloads corruptos sin lanzar excepciones", () => {
    let messageHandler: ((deviceId: string, data: string) => void) | null = null;
    const mockMesh: MeshHandle = {
      myDeviceId: "nodo-1",
      userId: "u1",
      supported: true,
      signalingTransport: "realtime",
      connectToDevice: async () => ({ deviceId: "n2", state: "connected", channelOpen: true, lastUpdate: Date.now() }),
      onPeer: (events) => {
        messageHandler = events.onMessage ?? null;
        return () => {
          messageHandler = null;
        };
      },
      sendToPeer: () => true,
      broadcast: () => 1,
      getPeers: () => [],
      closeMesh: () => {},
    };

    let llamadas = 0;
    const sync = setupConcienciaSync(mockMesh, {
      onCapacidades: () => llamadas++,
      onNuevasExperiencias: () => llamadas++,
      onNuevoManifiesto: () => llamadas++,
    });

    if (messageHandler) {
      const handler = messageHandler as (id: string, d: string) => void;

      // JSON invalido
      expect(() => handler("n2", "{bad json")).not.toThrow();

      // Payload null o string en capacidades
      expect(() => handler("n2", JSON.stringify({ tema: "astraura/capacidades", payload: null }))).not.toThrow();
      expect(() => handler("n2", JSON.stringify({ tema: "astraura/capacidades", payload: "texto" }))).not.toThrow();

      // Payload corrupto en experiencias
      expect(() => handler("n2", JSON.stringify({ tema: "astraura/experiencias", payload: null }))).not.toThrow();
      expect(() => handler("n2", JSON.stringify({ tema: "astraura/experiencias", payload: [null, 123] }))).not.toThrow();

      // Payload corrupto en adaptador
      expect(() => handler("n2", JSON.stringify({ tema: "astraura/adaptador", payload: { corrupto: true } }))).not.toThrow();

      expect(llamadas).toBe(0);
    }

    sync.unsubscribe();
  });
});
