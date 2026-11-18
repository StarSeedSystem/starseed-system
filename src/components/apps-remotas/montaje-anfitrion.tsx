"use client";
/**
 * (AUD1117 · F5) Anfitrión web de apps por la malla: escucha `ventana.pedir` de
 * otra neurona de la MISMA cuenta por el mesh compartido y transmite la ventana
 * que la persona presta (diálogo nativo de «Prestar») a la ventana remota del
 * cliente (cliente.ts / ventana-remota.tsx). Sin petición no hace nada: sin
 * petición no hay ni capturas ni intervalos. Se monta en
 * `malla-neuronas-mount.tsx`, junto a los demás servicios de la malla.
 */
import { useEffect } from "react";
import { adjuntarAnfitrionMalla, type DepsAnfitrionMalla } from "@/lib/apps-remotas/anfitrion-malla";
import { snapshotMallaNeuronas } from "@/lib/network/malla-neuronas";

/** Cadencia del `tic` de captura: la calidad real la fija el anfitrión (fps medido). */
const TIC_MS = 1000 / 30;

export function MontajeAnfitrion() {
  useEffect(() => {
    let parar: (() => void) | null = null;
    let tic: ReturnType<typeof setInterval> | null = null;
    let cancelado = false;
    void (async () => {
      const [{ getSharedMesh }, { esAppNativa, puenteNativo }, nativo] = await Promise.all([
        import("@/lib/network/lan-sync"),
        import("@/lib/nativa/puente"),
        import("@/lib/apps-remotas/nativo"),
      ]);
      if (cancelado) return;
      const mesh = getSharedMesh();
      if (!mesh) return;
      const invocar = async (cmd: string, args?: Record<string, unknown>) => {
        const r = await puenteNativo().llamar<unknown>(cmd, args);
        if (!r.ok) throw new Error(r.motivo);
        return r.valor;
      };
      let servidor: ReturnType<typeof adjuntarAnfitrionMalla>["servidor"] | null = null;
      const deps: Omit<DepsAnfitrionMalla, "enviar"> = {
        cuentaActual: () => mesh.userId,
        cuentaDe: (de) => {
          const propia = snapshotMallaNeuronas().misDispositivos.some((d) => (d.syncDeviceId ?? d.neuronId) === de);
          return propia ? mesh.userId : null;
        },
        abrir: async ({ de, app }) => {
          if (!esAppNativa()) return null;
          const nativa = await nativo.pedirPrestamo(invocar, { apps: [app], destino: de });
          const elegida = nativa.ventanas.find((v) => v.app_name === app) ?? nativa.ventanas[0];
          return {
            ventana: elegida ? String(elegida.id) : app,
            capturar: nativo.crearCapturaNativa(invocar, nativa),
            // Los cuadros viajan como mensajes `ventana.cuadro` por el canal de datos;
            // la pista WebRTC del lienzo (canvas.captureStream) la añade la ola nativa.
            crearPista: () => ({ stop() {} }),
            sesionNativa: () => true,
            duracionMs: nativa.duracion_max_ms > 0 ? nativa.duracion_max_ms : undefined,
          };
        },
        fps: 30,
        anchoMax: 1280,
        alEmpezar: () => {
          if (!tic) tic = setInterval(() => { void servidor?.tic(); }, TIC_MS);
        },
        alTerminar: () => {
          if (tic) { clearInterval(tic); tic = null; }
        },
      };
      const atado = adjuntarAnfitrionMalla(mesh, deps);
      servidor = atado.servidor;
      parar = () => {
        servidor?.cortar("Esta neurona dejó de prestar la ventana.");
        if (tic) { clearInterval(tic); tic = null; }
        atado.parar();
      };
    })();
    return () => {
      cancelado = true;
      parar?.();
      parar = null;
    };
  }, []);
  return null;
}

export default MontajeAnfitrion;
