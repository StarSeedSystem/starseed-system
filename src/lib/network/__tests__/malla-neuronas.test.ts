/**
 * malla-neuronas — funciones puras (Ola 366). Sin DOM ni red: decisión de
 * auto-vínculo, clasificación de RAM, detección de origen local y el guard
 * del mensaje de "ficha". (Ola 375 · RDV13) También el filtro de BLE fresco y
 * la decisión de reenvío del resumen del radar compartido.
 */
import { describe, expect, test } from "vitest";
import type { BleDetection } from "@/ai/astraura/mesh/signals";
import {
  RADAR_LOCAL_CADA_MS,
  RADAR_REENVIO_MS,
  claseRam,
  decidirAutovinculo,
  deteccionesBleRecientes,
  esMensajeFicha,
  esOrigenLocal,
  hayQueEnviarRadar,
  type NeuronaParaMalla,
  type PeerEstadoLite,
} from "@/lib/network/malla-neuronas";

describe("decidirAutovinculo", () => {
  const yo: NeuronaParaMalla = { neuronId: "n-yo", syncDeviceId: "s-yo", online: true, isThisDevice: true };

  test("con SOLO este dispositivo online, no hay nadie con quien vincularse", () => {
    expect(decidirAutovinculo([yo], {})).toEqual([]);
  });

  test("con ≥2 online, propone conectar a las demás (nunca a mí mismo)", () => {
    const otra: NeuronaParaMalla = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    expect(decidirAutovinculo([yo, otra], {})).toEqual(["s-b"]);
  });

  test("salta una neurona OFFLINE (estale) aunque exista", () => {
    const offline: NeuronaParaMalla = { neuronId: "n-c", syncDeviceId: "s-c", online: false, isThisDevice: false };
    expect(decidirAutovinculo([yo, offline], {})).toEqual([]);
  });

  test("salta una neurona sin syncDeviceId publicado todavía", () => {
    const sinSync: NeuronaParaMalla = { neuronId: "n-d", online: true, isThisDevice: false };
    expect(decidirAutovinculo([yo, sinSync], {})).toEqual([]);
  });

  test("deduplica por syncDeviceId", () => {
    const dup1: NeuronaParaMalla = { neuronId: "n-e1", syncDeviceId: "s-e", online: true, isThisDevice: false };
    const dup2: NeuronaParaMalla = { neuronId: "n-e2", syncDeviceId: "s-e", online: true, isThisDevice: false };
    expect(decidirAutovinculo([yo, dup1, dup2], {})).toEqual(["s-e"]);
  });

  test("se SALTA un peer ya conectado o conectando (no relanza la oferta)", () => {
    const b: NeuronaParaMalla = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    const c: NeuronaParaMalla = { neuronId: "n-c", syncDeviceId: "s-c", online: true, isThisDevice: false };
    const peers: Record<string, PeerEstadoLite> = {
      "s-b": { state: "connected" },
      "s-c": { state: "connecting" },
    };
    expect(decidirAutovinculo([yo, b, c], peers)).toEqual([]);
  });

  test("SÍ reintenta un peer 'failed' o 'closed'", () => {
    const b: NeuronaParaMalla = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    expect(decidirAutovinculo([yo, b], { "s-b": { state: "failed" } })).toEqual(["s-b"]);
    expect(decidirAutovinculo([yo, b], { "s-b": { state: "closed" } })).toEqual(["s-b"]);
  });
});

describe("claseRam", () => {
  test.each([
    [undefined, "desconocida"],
    [0, "desconocida"],
    [-1, "desconocida"],
    [2, "≤4 GB"],
    [4, "≤4 GB"],
    [8, "8 GB"],
    [16, "16 GB"],
    [32, ">16 GB"],
  ] as const)("claseRam(%s) === %s", (mem, esperado) => {
    expect(claseRam(mem)).toBe(esperado);
  });
});

describe("esOrigenLocal", () => {
  test.each([
    ["localhost", true],
    ["127.0.0.1", true],
    ["::1", true],
    ["starseed-os.vercel.app", false],
    ["192.168.1.5", false],
  ] as const)("esOrigenLocal(%s) === %s", (host, esperado) => {
    expect(esOrigenLocal(host)).toBe(esperado);
  });
});

describe("esMensajeFicha", () => {
  test("acepta una ficha bien formada", () => {
    expect(
      esMensajeFicha({
        t: "malla:ficha",
        ficha: { syncDeviceId: "s-1", neuronDeviceId: "n-1" },
      }),
    ).toBe(true);
  });

  test("rechaza payloads ajenos o corruptos", () => {
    expect(esMensajeFicha(null)).toBe(false);
    expect(esMensajeFicha("texto")).toBe(false);
    expect(esMensajeFicha({ t: "malla:hb", at: 1 })).toBe(false);
    expect(esMensajeFicha({ t: "malla:ficha", ficha: { syncDeviceId: "s-1" } })).toBe(false);
  });
});

describe("deteccionesBleRecientes (RDV13)", () => {
  const ahora = 1_000_000_000;
  const det = (id: string, at: number): BleDetection => ({
    id,
    name: id,
    rssi: null,
    txPower: null,
    uuids: [],
    at,
    viaPicker: false,
  });

  test("solo cuenta lo oído hace menos de 60 s (nunca lo del futuro)", () => {
    const dets = [
      det("fresca", ahora - 10_000),
      det("al-limite", ahora - 59_999),
      det("caducada", ahora - 60_000),
      det("muy-vieja", ahora - 120_000),
      det("del-futuro", ahora + 5_000),
    ];
    expect(deteccionesBleRecientes(dets, ahora).map((d) => d.id)).toEqual(["fresca", "al-limite"]);
  });

  test("respeta una ventana distinta si se la dan", () => {
    const dets = [det("a", ahora - 30_000), det("b", ahora - 90_000)];
    expect(deteccionesBleRecientes(dets, ahora, 60_000).map((d) => d.id)).toEqual(["a"]);
    expect(deteccionesBleRecientes(dets, ahora, 120_000).map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("hayQueEnviarRadar (RDV13)", () => {
  const huella = "h-igual";

  test("sin envío previo, siempre envía (primera vez)", () => {
    expect(hayQueEnviarRadar(huella, null, 1_000)).toBe(true);
  });

  test("misma huella recién enviada, no vuelve a molestar el canal", () => {
    expect(hayQueEnviarRadar(huella, { huella, at: 1_000 }, 1_000 + RADAR_LOCAL_CADA_MS)).toBe(false);
  });

  test("huella distinta envía aunque el último fuera hace un segundo", () => {
    expect(hayQueEnviarRadar("h-nueva", { huella, at: 1_000 }, 1_001)).toBe(true);
  });

  test("misma huella se renueva a los 5 min exactos, ni un ms antes", () => {
    const ultimo = { huella, at: 1_000 };
    expect(hayQueEnviarRadar(huella, ultimo, 1_000 + RADAR_REENVIO_MS - 1)).toBe(false);
    expect(hayQueEnviarRadar(huella, ultimo, 1_000 + RADAR_REENVIO_MS)).toBe(true);
  });

  test("un reenvío personalizado también caduca a su tiempo", () => {
    expect(hayQueEnviarRadar(huella, { huella, at: 100 }, 100 + 10_000, 10_000)).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────── */
/* Publicación de la ficha al arrancar la malla (AUD1117 · F5)            */
/* ─────────────────────────────────────────────────────────────────────── */

import {
  crearControlPublicacionCapacidades,
  publicadorFichaActivo,
  registrarPublicadorFicha,
  retirarPublicadorFicha,
  type PublicadorFicha,
} from "@/lib/network/malla-neuronas";

interface PublicadorFalso extends PublicadorFicha {
  detenciones: number;
}

function publicadorFalso(): PublicadorFalso {
  const p: PublicadorFalso = {
    detener: () => {
      p.detenciones++;
    },
    detenciones: 0,
  };
  return p;
}

describe("crearControlPublicacionCapacidades (AUD1117 · F5)", () => {
  test("con la capa mesh ENCENDIDA, arranca la publicación UNA sola vez", () => {
    let capa = true;
    let inicios = 0;
    const creado: { valor: PublicadorFalso | null } = { valor: null };
    const control = crearControlPublicacionCapacidades({
      capaEncendida: () => capa,
      iniciar: () => {
        inicios++;
        creado.valor = publicadorFalso();
        return creado.valor;
      },
    });
    control.sincronizar();
    control.sincronizar();
    control.sincronizar();
    expect(inicios).toBe(1);
    expect(control.activo()).toBe(true);
    expect(publicadorFichaActivo()).toBe(creado.valor);
    control.apagar();
    expect(publicadorFichaActivo()).toBeNull();
  });

  test("con la capa mesh APAGADA, no arranca nada", () => {
    const control = crearControlPublicacionCapacidades({
      capaEncendida: () => false,
      iniciar: () => {
        throw new Error("no debió arrancar");
      },
    });
    control.sincronizar();
    expect(control.activo()).toBe(false);
    expect(publicadorFichaActivo()).toBeNull();
  });

  test("al APAGAR la capa se detiene y se retira el publicador", () => {
    let capa = true;
    const creado: { valor: PublicadorFalso | null } = { valor: null };
    const control = crearControlPublicacionCapacidades({
      capaEncendida: () => capa,
      iniciar: () => {
        creado.valor = publicadorFalso();
        return creado.valor;
      },
    });
    control.sincronizar();
    capa = false;
    control.sincronizar();
    expect(creado.valor?.detenciones).toBe(1);
    expect(control.activo()).toBe(false);
    expect(publicadorFichaActivo()).toBeNull();
  });

  test("al apagar la capa detiene TAMBIÉN el publicador registrado por otro (panel)", () => {
    let capa = true;
    const delPanel = publicadorFalso();
    expect(registrarPublicadorFicha(delPanel)).toBe(true);
    const control = crearControlPublicacionCapacidades({
      capaEncendida: () => capa,
      iniciar: () => publicadorFalso(),
    });
    control.sincronizar();
    expect(control.activo()).toBe(false);
    capa = false;
    control.sincronizar();
    expect(delPanel.detenciones).toBe(1);
    expect(publicadorFichaActivo()).toBeNull();
  });

  test("si YA hay un publicador activo (el del panel), no arranca otro", () => {
    const delPanel = publicadorFalso();
    expect(registrarPublicadorFicha(delPanel)).toBe(true);
    let inicios = 0;
    const control = crearControlPublicacionCapacidades({
      capaEncendida: () => true,
      iniciar: () => {
        inicios++;
        return publicadorFalso();
      },
    });
    control.sincronizar();
    expect(inicios).toBe(0);
    expect(publicadorFichaActivo()).toBe(delPanel);
    retirarPublicadorFicha(delPanel);
    delPanel.detener();
  });

  test("el registro no admite dos publicadores; retirar solo quita el propio", () => {
    const a = publicadorFalso();
    const b = publicadorFalso();
    expect(registrarPublicadorFicha(a)).toBe(true);
    expect(registrarPublicadorFicha(b)).toBe(false);
    expect(publicadorFichaActivo()).toBe(a);
    retirarPublicadorFicha(b);
    expect(publicadorFichaActivo()).toBe(a);
    retirarPublicadorFicha(a);
    expect(publicadorFichaActivo()).toBeNull();
  });
});
