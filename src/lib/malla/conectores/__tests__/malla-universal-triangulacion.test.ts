import { describe, expect, it } from "vitest";
import { fichaDeTipo } from "../fichas";
import { isNeverSyncedKey } from "@/lib/settings-sync";
import { isSyncedKey } from "@/lib/sync/realtime-sync";
import {
  PROTOCOLOS_UNIVERSALES_KEY,
  configUniversalPorDefecto,
  ordenarProtocolosPorTarea,
  sanearConfigUniversal,
} from "../protocolos-universales";
import {
  dividirSegmentosParaAntenas,
  planificarTriangulacionContenido,
  type EnlaceCandidato,
  type NodoAlmacenCandidato,
} from "../triangulacion-contenido";

const enl = (par: Partial<EnlaceCandidato> & Pick<EnlaceCandidato, "id" | "tipo">): EnlaceCandidato => ({
  etiqueta: par.id,
  alcanza: { difusion: true },
  abierto: true,
  sinInternet: true,
  admite: { mensaje: true, archivo: true, flujo: false },
  ...par,
});

const NODO_PROPIO: NodoAlmacenCandidato = {
  neuronaId: "maggabook",
  etiqueta: "MaggaBook",
  esPublico: false,
  perteneceACuenta: true,
  espacioLibreMb: 4096,
  cargaPct: 10,
  disponibleAhora: true,
  enlaces: [
    enl({ id: "loc-1", tipo: "local", rttMs: 3, capacidadKbps: 120_000, admite: { mensaje: true, archivo: true, flujo: true } }),
    enl({ id: "wd-1", tipo: "wifi-direct", ruta: "misma-red-local", rttMs: 4, capacidadKbps: 90_000, admite: { mensaje: true, archivo: true, flujo: true } }),
  ],
};

const NODO_PUBLICO_1: NodoAlmacenCandidato = {
  neuronaId: "pub-alpha",
  etiqueta: "Nodo Público Alpha",
  esPublico: true,
  perteneceACuenta: false,
  espacioLibreMb: 8192,
  cargaPct: 15,
  disponibleAhora: true,
  enlaces: [
    enl({ id: "rns-1", tipo: "reticulum", rttMs: 60, capacidadKbps: 15 }),
    enl({ id: "tit-1", tipo: "titanio", rttMs: 18, capacidadKbps: 25_000, admite: { mensaje: true, archivo: true, flujo: true } }),
  ],
};

const NODO_PUBLICO_2: NodoAlmacenCandidato = {
  neuronaId: "pub-beta",
  etiqueta: "Nodo Público Beta",
  esPublico: true,
  perteneceACuenta: false,
  espacioLibreMb: 2048,
  cargaPct: 35,
  disponibleAhora: true,
  enlaces: [enl({ id: "mesh-1", tipo: "lora", rttMs: 120, capacidadKbps: 4 })],
};

describe("Malla universal P2P, protocolos abiertos y triangulación", () => {
  it("expone fichas para reticulum, meshtastic, meshcore, wifi-direct y titanio sin romper lora", () => {
    expect(fichaDeTipo("lora").mtu).toBe(200);
    expect(fichaDeTipo("reticulum")).toMatchObject({ mtu: 500, cifrado: "propio", coste: "gratis" });
    expect(fichaDeTipo("meshtastic")).toMatchObject({ mtu: 237, permisos: ["bluetooth", "antena-lora"] });
    expect(fichaDeTipo("meshcore")).toMatchObject({ mtu: 255, alcanceM: 12_000 });
    expect(fichaDeTipo("wifi-direct")).toMatchObject({ llevaFlujos: true, tiempoAire: "libre" });
    expect(fichaDeTipo("titanio")).toMatchObject({ llevaFlujos: true, cifrado: "propio" });
  });

  it("nunca sincroniza la configuración local de protocolos universales y sanea entradas personalizadas", () => {
    expect(isNeverSyncedKey(PROTOCOLOS_UNIVERSALES_KEY)).toBe(true);
    expect(isSyncedKey(PROTOCOLOS_UNIVERSALES_KEY)).toBe(false);

    const saneado = sanearConfigUniversal({
      modoMultiAntenaSimultanea: false,
      cuotaPublicaMb: 999_999,
      protocolos: {
        reticulum: { id: "reticulum", prioridad: 99, habilitado: true },
        "custom-lora-hf": {
          id: "custom-lora-hf",
          nombre: "HF Reticulum",
          familia: "personalizado",
          habilitado: true,
          rol: "control-bajo-consumo",
          prioridad: 80,
          endpoint: "tcp://10.0.0.5:4242",
          mtuBytes: 420,
          permiteCapaPublica: true,
          permiteCapaPrivada: false,
          formatosAdmitidos: ["lxmf", "cbor"],
        },
      },
    });
    expect(saneado.cuotaPublicaMb).toBe(102_400);
    expect(saneado.protocolos["custom-lora-hf"]).toMatchObject({
      nombre: "HF Reticulum",
      permiteCapaPrivada: false,
    });

    const ordenPublico = ordenarProtocolosPorTarea(saneado, "senal-control", "publica").map((p) => p.id);
    const ordenPrivado = ordenarProtocolosPorTarea(saneado, "senal-control", "privada").map((p) => p.id);
    expect(ordenPublico).toContain("custom-lora-hf");
    expect(ordenPrivado).not.toContain("custom-lora-hf");
  });

  it("aísla la capa privada solo a neuronas de la cuenta y triangula la pública entre antenas en paralelo", () => {
    const cfg = configUniversalPorDefecto();
    const candidatos = [NODO_PROPIO, NODO_PUBLICO_1, NODO_PUBLICO_2];

    const planPrivado = planificarTriangulacionContenido(
      {
        contenidoId: "nota-privada",
        capa: "privada",
        destino: "archivo",
        tipo: "documento",
        formato: "cbor",
        bytesTotal: 120_000,
      },
      cfg,
      candidatos,
    );
    expect(planPrivado.viable).toBe(true);
    expect(planPrivado.nodosReplicacion.map((n) => n.neuronaId)).toEqual(["maggabook"]);

    const planPublico = planificarTriangulacionContenido(
      {
        contenidoId: "canal-streaming-1",
        capa: "publica",
        destino: "canal-directo",
        tipo: "video",
        formato: "binario-libre",
        bytesTotal: 3_000_000,
        requiereEnVivo: true,
      },
      cfg,
      candidatos,
    );
    expect(planPublico.viable).toBe(true);
    expect(planPublico.viaControl?.rol).toBe("control-bajo-consumo");
    expect(planPublico.viasDatos.length).toBeGreaterThanOrEqual(2);
    expect(planPublico.nodosReplicacion.length).toBeGreaterThanOrEqual(2);
    expect(planPublico.estrategia).toBe("multiantena-paralela-triangulada");
    expect(planPublico.segmentos.reduce((acc, s) => acc + s.bytes, 0)).toBe(3_000_000);
  });

  it("distribuye los bytes exactos cuando se reparten segmentos entre múltiples antenas", () => {
    const cfg = configUniversalPorDefecto();
    const vias = [cfg.protocolos["red-local"], cfg.protocolos["wifi-direct"], cfg.protocolos["titanio"]];
    const segs = dividirSegmentosParaAntenas(512_345, vias);
    expect(segs).toHaveLength(3);
    expect(segs[0].desdeByte).toBe(0);
    expect(segs.at(-1)!.hastaByte).toBe(512_345);
    expect(segs.reduce((a, b) => a + b.bytes, 0)).toBe(512_345);
  });
});
