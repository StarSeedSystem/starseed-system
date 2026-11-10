/**
 * SUP0911G — Seguimiento de la supervisión: `archivo.ok` perdido en la red.
 * ═══════════════════════════════════════════════════════════════════════════════
 * El receptor verificó y mandó `archivo.ok`, pero ese mensaje se perdió (su cola
 * hacia el remitente se dio por caída). El remitente, con el cambio de esta
 * ola, manda una vez más `archivo.fin` y espera una gracia corta; si en esa
 * gracia llega el `ok`, la transferencia acaba «completada» como siempre.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  crearAlmacenEnMemoria,
  crearMotorArchivos,
  type AlmacenTrozos,
  type CanalArchivos,
  type EstadoTransferencia,
  type MotorArchivos,
} from "@/lib/network/archivos-malla";

const TERMINALES = new Set(["completada", "error", "rechazada", "cancelada"]);

async function esperarHasta(fn: () => boolean, timeoutMs: number, pasoMs = 10): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("esperarHasta: se agotó el tiempo de espera");
    await new Promise((r) => setTimeout(r, pasoMs));
  }
}

function binario(tamano: number): Uint8Array<ArrayBuffer> {
  const d = new Uint8Array(tamano);
  for (let i = 0; i < tamano; i++) d[i] = i % 256;
  return d;
}

const sha = (d: Uint8Array | ArrayBuffer) => {
  const bytes = d instanceof Uint8Array ? d : new Uint8Array(d);
  let h = 0;
  for (const b of bytes) h = (h * 31 + b) >>> 0;
  return h.toString(16).padStart(64, "0");
};

function enlaceLocalSimulado(): { a: CanalArchivos; b: CanalArchivos } {
  const oyentes = { a: new Set<(d: string | ArrayBuffer) => void>(), b: new Set<(d: string | ArrayBuffer) => void>() };
  const extremo = (yo: "a" | "b"): CanalArchivos => {
    const otro = yo === "a" ? "b" : "a";
    const entregar = (d: string | ArrayBuffer) => {
      setTimeout(() => {
        for (const l of Array.from(oyentes[otro])) l(d);
      }, 0);
      return true;
    };
    return {
      enviar: (t) => entregar(t),
      bufferedAmount: () => 0,
      alMensaje: (cb) => {
        oyentes[yo].add(cb);
        return () => oyentes[yo].delete(cb);
      },
    };
  };
  return { a: extremo("a"), b: extremo("b") };
}

interface Lados {
  motorA: MotorArchivos;
  motorB: MotorArchivos;
  canalA: CanalArchivos;
  recibidos: Map<string, Blob>;
  okPerdido: boolean;
  finContador: number;
  finEnviadoContador: number;
}

function crearLados(almacenB: AlmacenTrozos, opciones: { perderOk?: boolean; perderTodosFin?: boolean } = {}): Lados {
  const enlace = enlaceLocalSimulado();
  const recibidos = new Map<string, Blob>();
  let okPerdido = false;
  let finContador = 0;
  let finEnviadoContador = 0;
  const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), esperaVerificacionMs: () => 150 });
  const motorB: MotorArchivos = crearMotorArchivos({
    almacen: almacenB,
    onOfertaEntrante: (o) => motorB.aceptarOferta(o.id),
    onCompletado: (e, blob) => recibidos.set(e.id, blob),
  });
  const originalEnviarA = enlace.a.enviar;
  enlace.a.enviar = (t) => {
    if (typeof t === "string" && t.startsWith('{"t":"archivo.fin"')) {
      finEnviadoContador++;
    }
    return originalEnviarA(t);
  };
  enlace.a.alMensaje((d) => {
    if (typeof d !== "string") return;
    if (opciones.perderOk && d.startsWith('{"t":"archivo.ok"')) {
      if (!okPerdido) {
        okPerdido = true;
        return;
      }
    }
    motorA.manejarMensaje(enlace.a, d);
  });
  enlace.b.alMensaje((d) => {
    if (typeof d !== "string") return;
    if (d.startsWith('{"t":"archivo.fin"')) {
      finContador++;
    }
    if (opciones.perderTodosFin && d.startsWith('{"t":"archivo.fin"')) return;
    motorB.manejarMensaje(enlace.b, d, { mismaCuenta: false, verificarPermiso: () => true });
  });
  return {
    motorA,
    motorB,
    canalA: enlace.a,
    recibidos,
    get okPerdido() { return okPerdido; },
    get finContador() { return finContador; },
    get finEnviadoContador() { return finEnviadoContador; },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SUP0911G · archivo.ok perdido en la red", () => {
  it("el primer ok se pierde → el remitente reintenta fin y acaba completada; el receptor recibió fin dos veces y el archivo es íntegro", async () => {
    const l = crearLados(crearAlmacenEnMemoria(), { perderOk: true });
    const datos = binario(20_000);
    const r = await l.motorA.enviarArchivo(l.canalA, new Blob([datos]), "x.bin", { tipo: "dispositivo" });
    expect(r.ok).toBe(true);
    await esperarHasta(() => l.motorA.estadoDe(r.id)?.fase === "verificando", 5_000);
    await esperarHasta(() => l.motorA.estadoDe(r.id)?.fase === "completada", 5_000);
    const e = l.motorA.estadoDe(r.id);
    expect(e?.fase).toBe("completada");
    expect(l.finEnviadoContador).toBe(2);
    expect(l.finContador).toBe(2);
    const blob = l.recibidos.get(r.id);
    expect(blob).toBeDefined();
    expect(sha(await blob!.arrayBuffer())).toBe(sha(datos));
  });

  it("receptor descarta TODOS los fin → error sin-confirmacion, archivo para Reintentar, fin mandado exactamente dos veces", async () => {
    const l = crearLados(crearAlmacenEnMemoria(), { perderTodosFin: true });
    const datos = binario(20_000);
    const r = await l.motorA.enviarArchivo(l.canalA, new Blob([datos]), "y.bin", { tipo: "dispositivo" });
    expect(r.ok).toBe(true);
    await esperarHasta(() => l.motorA.estadoDe(r.id)?.fase === "verificando", 5_000);
    await esperarHasta(() => l.motorA.estadoDe(r.id)?.fase === "error", 5_000);
    const e = l.motorA.estadoDe(r.id);
    expect(e?.fase).toBe("error");
    expect(e?.codigo).toBe("sin-confirmacion");
    expect(e?.motivo).toMatch(/^Falló en el receptor: no confirmó/);
    expect(l.motorA.archivoDeEnvio(r.id)).toBeDefined();
    expect(l.finEnviadoContador).toBe(2);
    expect(l.finContador).toBe(2);
  });
});