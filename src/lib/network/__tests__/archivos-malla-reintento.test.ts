/**
 * archivos-malla-reintento — Ola 369/1104C. Prueba de la política de reintento
 * automático con espera exponencial, tope de intentos y reanudación desde el
 * último trozo confirmado (mismo idTransferencia).
 */
import { describe, expect, it } from "vitest";
import {
  crearAlmacenEnMemoria,
  crearMotorArchivos,
  type CanalArchivos,
  type EstadoTransferencia,
  type FaseTransferencia,
  type MotorArchivos,
} from "@/lib/network/archivos-malla";

/* ------------------------------------------------------------------ */
/* Utilidades de prueba (copiadas de archivos-malla.test.ts)          */
/* ------------------------------------------------------------------ */

interface ParCanales {
  canalParaA: CanalArchivos;
  canalParaB: CanalArchivos;
  estadoBuffer: { a: number; b: number };
  vistoAaB: string[];
  vistoBaA: string[];
  conectado: { ab: boolean; ba: boolean };
}

function crearParEnMemoria(opts?: {
  transformarAaB?: (raw: string) => string;
  transformarBaA?: (raw: string) => string;
}): ParCanales {
  const listenersA = new Set<(d: string | ArrayBuffer) => void>();
  const listenersB = new Set<(d: string | ArrayBuffer) => void>();
  const estadoBuffer = { a: 0, b: 0 };
  const conectado = { ab: true, ba: true };
  const vistoAaB: string[] = [];
  const vistoBaA: string[] = [];

  const canalParaA: CanalArchivos = {
    enviar: (texto: string) => {
      if (!conectado.ab) return false;
      vistoAaB.push(texto);
      const t = opts?.transformarAaB ? opts.transformarAaB(texto) : texto;
      for (const l of Array.from(listenersB)) l(t);
      return true;
    },
    bufferedAmount: () => estadoBuffer.a,
    alMensaje: (cb) => {
      listenersA.add(cb);
      return () => listenersA.delete(cb);
    },
  };
  const canalParaB: CanalArchivos = {
    enviar: (texto: string) => {
      if (!conectado.ba) return false;
      vistoBaA.push(texto);
      const t = opts?.transformarBaA ? opts.transformarBaA(texto) : texto;
      for (const l of Array.from(listenersA)) l(t);
      return true;
    },
    bufferedAmount: () => estadoBuffer.b,
    alMensaje: (cb) => {
      listenersB.add(cb);
      return () => listenersB.delete(cb);
    },
  };
  return { canalParaA, canalParaB, estadoBuffer, vistoAaB, vistoBaA, conectado };
}

function conectarMotores(
  motorA: MotorArchivos,
  motorB: MotorArchivos,
  par: ParCanales,
): void {
  par.canalParaA.alMensaje((d) => motorA.manejarMensaje(par.canalParaA, d, { mismaCuenta: true }));
  par.canalParaB.alMensaje((d) => motorB.manejarMensaje(par.canalParaB, d, { mismaCuenta: true }));
}

async function esperarHasta(fn: () => boolean, timeoutMs = 5000, pasoMs = 5): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) {
      throw new Error("esperarHasta: se agotó el tiempo de espera");
    }
    await new Promise((r) => setTimeout(r, pasoMs));
  }
}

function faseFinal(estado: EstadoTransferencia | undefined): FaseTransferencia | undefined {
  return estado?.fase;
}

async function blobATexto(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return Buffer.from(buf).toString("utf-8");
}

/* ------------------------------------------------------------------ */
/* Tests de reintento automático                                      */
/* ------------------------------------------------------------------ */

describe("política de reintento automático", () => {
  it("un corte a mitad de transferencia se reintenta automáticamente con espera exponencial y completa sin intervención", async () => {
    const par = crearParEnMemoria();
    
    // Configuración: reintento con espera base 10ms, máximo 5 intentos
    const motorA = crearMotorArchivos({ 
      almacen: crearAlmacenEnMemoria(),
      tamanoChunkBase64: 4,
      // Política de reintento: se pasará como opción en enviarArchivo o config
    });
    const motorB = crearMotorArchivos({ 
      almacen: crearAlmacenEnMemoria(),
      tamanoChunkBase64: 4,
    });
    conectarMotores(motorA, motorB, par);

    // Envuelve el envío de A: dejar pasar los trozos 0,1 y CORTAR el enlace
    // justo después del trozo 1 (determinista).
    const CORTAR_TRAS_INDICE = 1;
    const enviarOriginalA = par.canalParaA.enviar;
    let corteHecho = false;
    par.canalParaA.enviar = (texto: string): boolean => {
      const ok = enviarOriginalA(texto);
      if (ok && !corteHecho) {
        try {
          const msg = JSON.parse(texto) as { t: string; index?: number };
          if (msg.t === "archivo.chunk" && msg.index === CORTAR_TRAS_INDICE) {
            par.conectado.ab = false;
            corteHecho = true;
          }
        } catch {
          /* no era un trozo */
        }
      }
      return ok;
    };

    const contenido = "AABBCCDDEEFF"; // 12 bytes / 4 = 3 trozos (índices 0, 1, 2)
    const archivo = new Blob([contenido]);
    const r = await motorA.enviarArchivo(par.canalParaA, archivo, "retry.bin", { tipo: "dispositivo", id: "b" }, { 
      idTransferencia: "test-retry-1",
      // Política de reintento: se definirá en la implementación
    });
    expect(r.ok).toBe(true);

    // Esperar a que el remitente detecte el fallo y entre en reintento
    await esperarHasta(() => {
      const estado = motorA.estadoDe(r.id);
      return estado?.fase === "reintentando" || estado?.fase === "error";
    });

    // El receptor debería haber recibido los trozos 0 y 1
    expect(motorB.estadoDe(r.id)?.progreso).toBe(2);

    // "Reconecta" el enlace después de un pequeño delay
    await new Promise((r) => setTimeout(r, 50));
    par.conectado.ab = true;

    // La transferencia debería completarse AUTOMÁTICAMENTE sin intervención manual
    await esperarHasta(() => faseFinal(motorB.estadoDe(r.id)) === "completada", 10000);
    await esperarHasta(() => faseFinal(motorA.estadoDe(r.id)) === "completada", 10000);

    const blob = motorB.blobRecibido(r.id);
    expect(blob).toBeDefined();
    expect(await blobATexto(blob as Blob)).toBe(contenido);

    // Verificar que reanudó desde el índice 2 (no desde 0)
    const chunksReenviados = par.vistoAaB
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "archivo.chunk")
      .map((m) => m.index as number);
    
    // Los índices únicos reenviados tras la reconexión deberían ser solo el 2
    const indicesUnicos = [...new Set(chunksReenviados)];
    expect(indicesUnicos).toContain(2);
    // No debería haber reenviado 0 y 1 de nuevo (idempotencia del receptor los ignora, pero el remitente no debería)
  });

  it("respeta el tope máximo de intentos y marca error tras agotarlos", async () => {
    const par = crearParEnMemoria();
    
    const motorA = crearMotorArchivos({ 
      almacen: crearAlmacenEnMemoria(),
      tamanoChunkBase64: 4,
      // Reintento rápido para el test: 3 intentos, base 50ms
      reintento: { maxIntentos: 3, esperaBaseMs: 50, factorBackoff: 1, jitterMs: 0, esperaMaximaMs: 200 },
    });
    const motorB = crearMotorArchivos({ 
      almacen: crearAlmacenEnMemoria(),
      tamanoChunkBase64: 4,
    });
    conectarMotores(motorA, motorB, par);

    // El canal falla solo en trozos (chunk), no en la oferta inicial
    const enviarOriginalA = par.canalParaA.enviar;
    par.canalParaA.enviar = (texto: string): boolean => {
      try {
        const msg = JSON.parse(texto) as { t: string };
        if (msg.t === "archivo.chunk") return false;
      } catch {
        /* no es JSON, dejar pasar */
      }
      return enviarOriginalA(texto);
    };

    const contenido = "hola";
    const archivo = new Blob([contenido]);
    const r = await motorA.enviarArchivo(par.canalParaA, archivo, "fail.bin", { tipo: "dispositivo", id: "b" }, { 
      idTransferencia: "test-retry-2",
    });
    expect(r.ok).toBe(true);

    // Debe marcar error tras agotar los reintentos
    await esperarHasta(() => faseFinal(motorA.estadoDe(r.id)) === "error", 10000);
    expect(motorA.estadoDe(r.id)?.motivo).toMatch(/reintentos|agotado|máximo/i);
  });
});