/**
 * (BLE1108B) El motor de archivos sobre un portador lento y que se corta (el Bluetooth directo del 08-11):
 *  - contrapresión: el remitente espera el «listo» del canal antes de CADA trozo y manda uno confirmado a la vez;
 *  - un corte a mitad de archivo → vuelve el enlace → sigue donde se quedó y el SHA-256 coincide;
 *  - la ventana de aceptar sale en cuanto llega la oferta, también si esta no cabía en una trama o se perdió.
 *   NODE_ENV=test npx vitest run src/lib/network/__tests__/archivos-malla-ble.test.ts
 */
import { describe, expect, it } from "vitest";
import { crearAlmacenEnMemoria, crearMotorArchivos, esperarListoConPlazo, type CanalArchivos, type MotorArchivos } from "@/lib/network/archivos-malla";
import { agruparEnvios, enviosPorDecidir } from "@/lib/network/envios-entrantes";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256(b: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await b.arrayBuffer());
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

interface Portador {
  a: CanalArchivos;
  b: CanalArchivos;
  maxEnVuelo: () => number;
  llamadasListo: () => number;
  datosAB: () => number;
  cortar: () => void;
  volver: () => void;
  /** Ofertas A→B que se pierden en el aire (acusadas por la radio, perdidas más arriba). */
  perderOfertas: (n: number) => void;
  /** (BLE1108C) Cuántas veces el motor siguió sin esperar más la señal «listo». */
  tardes: () => number;
}

/** Dos canales con acuse, retardo por mensaje y un interruptor de enlace (el «ligado» del motor BLE). */
function portador(opt: { retardoMs?: number; maxTexto?: number; rutaA?: string; rutaB?: string; nuncaListo?: boolean } = {}): Portador {
  const oyentes = { a: new Set<(d: string | ArrayBuffer) => void>(), b: new Set<(d: string | ArrayBuffer) => void>() };
  let arriba = true;
  let enVuelo = 0;
  let maxVuelo = 0;
  let listo = 0;
  let datos = 0;
  let perder = 0;
  let tardes = 0;
  const retardo = opt.retardoMs ?? 5;
  const canal = (yo: "a" | "b"): CanalArchivos => {
    const otro = yo === "a" ? "b" : "a";
    const entregar = async (t: string): Promise<boolean> => {
      if (!arriba) return false;
      if (yo === "a") {
        try {
          const m = JSON.parse(t) as { t?: string };
          if (m.t === "archivo.oferta" && perder > 0) {
            perder--;
            return true;
          }
          if (m.t === "archivo.chunk") datos++;
        } catch {
          /* texto libre */
        }
      }
      if (yo === "a") {
        enVuelo++;
        maxVuelo = Math.max(maxVuelo, enVuelo);
      }
      await esperar(retardo);
      if (yo === "a") enVuelo--;
      if (!arriba) return false;
      oyentes[otro].forEach((l) => l(t));
      return true;
    };
    return {
      enviar: (t) => {
        void entregar(t);
        return arriba;
      },
      enviarConAcuse: entregar,
      esperarListo: async () => {
        if (yo === "a") listo++;
        // (BLE1108C) Un portador cuya señal «listo» nunca llega (CoreBluetooth sin aviso, Android sin callback).
        if (opt.nuncaListo) return new Promise<boolean>(() => {});
        for (let i = 0; i < 400 && !arriba; i++) await esperar(5);
        return arriba;
      },
      ...(opt.nuncaListo ? { enlaceArriba: () => arriba, alListoTarde: () => void tardes++ } : {}),
      ...(opt.maxTexto ? { maxTextoBytes: () => opt.maxTexto as number } : {}),
      rutaMedida: () => (yo === "a" ? opt.rutaA : opt.rutaB) ?? null,
      alMensaje: (cb) => {
        oyentes[yo].add(cb);
        return () => oyentes[yo].delete(cb);
      },
    };
  };
  const a = canal("a");
  const b = canal("b");
  return {
    a,
    b,
    maxEnVuelo: () => maxVuelo,
    llamadasListo: () => listo,
    datosAB: () => datos,
    cortar: () => {
      arriba = false;
    },
    volver: () => {
      arriba = true;
    },
    perderOfertas: (n) => {
      perder = n;
    },
    tardes: () => tardes,
  };
}

function par(p: Portador, cfg: { chunk?: number; reenvioOfertaMs?: number; auto?: boolean } = {}) {
  const completados: Array<{ id: string; blob: Blob }> = [];
  const motorA: MotorArchivos = crearMotorArchivos({
    almacen: crearAlmacenEnMemoria(),
    tamanoChunkBase64: cfg.chunk ?? 1024,
    reenvioOfertaMs: cfg.reenvioOfertaMs ?? 40,
  });
  const motorB: MotorArchivos = crearMotorArchivos({
    almacen: crearAlmacenEnMemoria(),
    politica: () => (cfg.auto === false ? "preguntar" : "auto-aceptar"),
    onCompletado: (e, blob) => completados.push({ id: e.id, blob }),
  });
  p.a.alMensaje((d) => motorA.manejarMensaje(p.a, d));
  p.b.alMensaje((d) =>
    motorB.manejarMensaje(p.b, d, {
      mismaCuenta: true,
      etiquetaOrigen: "Maggaboard (Bluetooth directo)",
      verificarPermiso: () => true,
      via: "Bluetooth directo",
    }),
  );
  return { motorA, motorB, completados };
}

function bytes(n: number): Blob {
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 31 + 7) & 0xff;
  return new Blob([u]);
}

describe("contrapresión sobre un portador lento", () => {
  it("espera el «listo» antes de cada trozo, manda uno confirmado a la vez y el archivo llega íntegro", async () => {
    const p = portador({ retardoMs: 8 });
    const { motorA, completados } = par(p);
    const blob = bytes(6 * 1024);
    const r = await motorA.enviarArchivo(p.a, blob, "clip.bin", { tipo: "dispositivo" });
    expect(r.ok).toBe(true);
    for (let i = 0; i < 300 && completados.length === 0; i++) await esperar(10);
    expect(completados).toHaveLength(1);
    expect(await sha256(completados[0].blob)).toBe(await sha256(blob));
    expect(p.maxEnVuelo()).toBeLessThanOrEqual(1);
    expect(p.llamadasListo()).toBeGreaterThanOrEqual(p.datosAB());
    expect(p.datosAB()).toBeGreaterThanOrEqual(6);
  });
});

describe("una señal «listo» que nunca llega no bloquea el enlace (BLE1108C)", () => {
  it("con el enlace arriba el archivo llega íntegro, y cada trozo sin señal queda anotado como tarde", async () => {
    const p = portador({ retardoMs: 3, nuncaListo: true });
    const { motorA, completados } = par(p);
    const blob = bytes(3 * 1024);
    const r = await motorA.enviarArchivo(p.a, blob, "clip.bin", { tipo: "dispositivo" });
    expect(r.ok).toBe(true);
    for (let i = 0; i < 300 && completados.length === 0; i++) await esperar(10);
    expect(completados).toHaveLength(1);
    expect(await sha256(completados[0].blob)).toBe(await sha256(blob));
    expect(p.tardes()).toBeGreaterThanOrEqual(3);
  });

  it("esperarListoConPlazo: sin enlace espera la señal real; con enlace sigue a los pocos ms", async () => {
    let arriba = false;
    let tarde = 0;
    let suelta: (v: boolean) => void = () => {};
    const canal = {
      enviar: () => true,
      alMensaje: () => () => {},
      esperarListo: () => new Promise<boolean>((res) => (suelta = res)),
      enlaceArriba: () => arriba,
      alListoTarde: () => void tarde++,
    } as CanalArchivos;
    const sinEnlace = esperarListoConPlazo(canal, 20);
    await esperar(60);
    let resuelto = false;
    void sinEnlace.then(() => (resuelto = true));
    await esperar(5);
    expect(resuelto).toBe(false);
    suelta(false);
    expect(await sinEnlace).toBe(false);
    expect(tarde).toBe(0);
    arriba = true;
    expect(await esperarListoConPlazo(canal, 20)).toBe(true);
    expect(tarde).toBe(1);
  });
});

describe("corte a mitad de archivo", () => {
  it("al volver el enlace sigue desde lo confirmado y el SHA-256 final coincide", async () => {
    const p = portador({ retardoMs: 6 });
    const { motorA, completados } = par(p);
    const blob = bytes(12 * 1024);
    const hash = await sha256(blob);
    const envio = motorA.enviarArchivo(p.a, blob, "video.bin", { tipo: "dispositivo" });
    for (let i = 0; i < 500 && p.datosAB() < 4; i++) await esperar(2);
    expect(p.datosAB()).toBeGreaterThanOrEqual(4);
    p.cortar();
    await esperar(150);
    expect(completados).toHaveLength(0);
    const antes = p.datosAB();
    p.volver();
    await envio.catch(() => undefined);
    for (let i = 0; i < 800 && completados.length === 0; i++) await esperar(10);
    expect(completados).toHaveLength(1);
    expect(await sha256(completados[0].blob)).toBe(hash);
    expect(completados[0].blob.size).toBe(blob.size);
    // No se empezó de cero: tras volver no se repitió todo el archivo.
    expect(p.datosAB() - antes).toBeLessThan(12 + 2);
  });
});

describe("la ventana de aceptar sale con la oferta", () => {
  it("la oferta llega y el envío queda «por decidir» enseguida, con su vía", async () => {
    const p = portador();
    const { motorA, motorB } = par(p, { auto: false });
    await motorA.enviarArchivo(p.a, bytes(3 * 1024), "video.mp4", { tipo: "dispositivo" }, { tipoMime: "video/mp4" });
    const t0 = Date.now();
    for (let i = 0; i < 200 && motorB.ofertasPendientes().length === 0; i++) await esperar(5);
    expect(Date.now() - t0).toBeLessThan(1000);
    const envios = agruparEnvios(motorB.listaTransferencias());
    expect(enviosPorDecidir(envios)).toHaveLength(1);
    expect(envios[0].via).toBe("Bluetooth directo");
  });

  it("si la primera oferta se pierde en el aire, la repetición la hace aparecer sin esperar minutos", async () => {
    const p = portador();
    p.perderOfertas(2);
    const { motorA, motorB } = par(p, { auto: false, reenvioOfertaMs: 30 });
    void motorA.enviarArchivo(p.a, bytes(2048), "video.mp4", { tipo: "dispositivo" });
    const t0 = Date.now();
    for (let i = 0; i < 300 && motorB.ofertasPendientes().length === 0; i++) await esperar(5);
    expect(motorB.ofertasPendientes()).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it("la repetición no duplica la ventana: una sola oferta pendiente por transferencia", async () => {
    const p = portador();
    const { motorA, motorB } = par(p, { auto: false, reenvioOfertaMs: 20 });
    void motorA.enviarArchivo(p.a, bytes(2048), "video.mp4", { tipo: "dispositivo" });
    await esperar(300);
    expect(motorB.ofertasPendientes()).toHaveLength(1);
    expect(motorB.listaTransferencias().filter((t) => t.rol === "recibir")).toHaveLength(1);
  });

  it("una oferta que no cabe en una trama del portador se aligera (sin vista) y aun así se ve", async () => {
    const p = portador({ maxTexto: 700 });
    const { motorA, motorB } = par(p, { auto: false });
    const vista = { tipo: "imagen", dataUrl: "data:image/jpeg;base64," + "A".repeat(5000) } as never;
    void motorA.enviarArchivo(p.a, bytes(2048), "foto.jpg", { tipo: "dispositivo" }, { tipoMime: "image/jpeg", vista });
    for (let i = 0; i < 300 && motorB.ofertasPendientes().length === 0; i++) await esperar(5);
    expect(motorB.ofertasPendientes()).toHaveLength(1);
    expect(motorB.listaTransferencias().find((t) => t.rol === "recibir")?.vista).toBeUndefined();
  });
});

describe("la ruta se acuerda entre los dos lados (BLE1108B)", () => {
  async function transferencia(p: Portador) {
    const { motorA, motorB, completados } = par(p);
    const r = await motorA.enviarArchivo(p.a, bytes(2048), "foto.png", { tipo: "dispositivo" });
    for (let i = 0; i < 300 && completados.length === 0; i++) await esperar(5);
    return { r, motorA, motorB };
  }

  it("los dos motores guardan la misma etiqueta y la transferencia queda verificada por ambos", async () => {
    const p = portador({ rutaA: "misma-red-local", rutaB: "misma-red-local" });
    const { r, motorA, motorB } = await transferencia(p);
    const emisor = motorA.estadoDe(r.id);
    const receptor = motorB.estadoDe(r.id);
    expect(emisor).toMatchObject({ rutaEnlace: "misma-red-local", rutaEnlaceOtro: "misma-red-local", rutaEnlaceVerificada: true });
    expect(receptor).toMatchObject({ rutaEnlace: "misma-red-local", rutaEnlaceOtro: "misma-red-local", rutaEnlaceVerificada: true });
  });

  it("si miden distinto no se dice «verificada»: cada lado ve la otra y que no coinciden", async () => {
    const p = portador({ rutaA: "internet-directo", rutaB: "misma-red-local" });
    const { r, motorA, motorB } = await transferencia(p);
    expect(motorA.estadoDe(r.id)).toMatchObject({ rutaEnlace: "internet-directo", rutaEnlaceOtro: "misma-red-local", rutaEnlaceVerificada: false });
    expect(motorB.estadoDe(r.id)).toMatchObject({ rutaEnlace: "misma-red-local", rutaEnlaceOtro: "internet-directo", rutaEnlaceVerificada: false });
  });

  it("de punta a punta con el clasificador: tableta (srflx) y Mac (host/prflx) en la misma LAN guardan la misma etiqueta", async () => {
    const { resumirRuta } = await import("@/lib/network/estadisticas-enlace");
    const stat = (tl: string, dl: string, tr: string, dr: string) => [
      { id: "par", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "l", remoteCandidateId: "r" },
      { id: "l", type: "local-candidate", candidateType: tl, address: dl },
      { id: "r", type: "remote-candidate", candidateType: tr, address: dr },
    ];
    const tableta = resumirRuta(stat("srflx", "192.168.1.20", "host", "192.168.1.30"), 1).clase;
    const mac = resumirRuta(stat("host", "192.168.1.30", "prflx", "192.168.1.20"), 1).clase;
    const p = portador({ rutaA: tableta, rutaB: mac });
    const { r, motorA, motorB } = await transferencia(p);
    expect(motorA.estadoDe(r.id)?.rutaEnlace).toBe(motorB.estadoDe(r.id)?.rutaEnlace);
    expect(motorA.estadoDe(r.id)?.rutaEnlaceVerificada).toBe(true);
  });
});
