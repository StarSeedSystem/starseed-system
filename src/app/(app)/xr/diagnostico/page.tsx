"use client";
import { useState, useEffect, useCallback } from "react";
import { useCapacidadesXR } from "@/lib/xr/onboarding"; // XR1010B
import { guardarSesionXR, usarSesionXR } from "@/lib/xr/onboarding-store"; // XR1010D
import { crearMedidor } from "@/lib/xr/onboarding-medidor"; // XR1010AE
import { construirInforme } from "@/lib/xr/diagnostico";

export default function DiagnosticoXRPage() {
  const { capacidades } = useCapacidadesXR();
  const sesion = usarSesionXR();
  const [reporte, setReporte] = useState<null | ReturnType<typeof construirInforme>>(null);
  const [estado, setEstado] = useState<"inactivo" | "esperando" | "midiendo" | "listo">("inactivo");
  const [error, setError] = useState<string | null>(null);

  const iniciarMedicion = useCallback(async () => {
    if (!sesion) {
      setError("Debe entrar primero en una sesión VR/AR.");
      return;
    }
    setEstado("midiendo");
    setError(null);
    const plan = {
      estrategia: "boton-universal",
      modo: sesion.modo,
      requiereGesto: true,
      botonUniversal: true,
      motivo: "Diagnóstico del visor real",
    };
    const medidor = await crearMedidor(sesion);
    const inicio = Date.now();
    const muestreos: Array<{t: number, fps: number, frameMs: number}> = [];
    const interval = setInterval(() => {
      if (medidor.disponible && medidor.acumuladoFps > 0) {
        muestreos.push({
          t: Date.now() - inicio,
          fps: medidor.acumuladoFps,
          frameMs: medidor.acumuladoFrameMs,
        });
      }
    }, 1000);
    await new Promise(resolve => setTimeout(resolve, 10000));
    clearInterval(interval);
    const frameMsMedia = muestreos.length > 0
      ? muestreos.reduce((s, v) => s + v.frameMs, 0) / muestreos.length
      : 0;
    const frameMsP95 = muestreos.length > 0
      ? muestreos.map(v => v.frameMs).sort((a, b) => a - b)[Math.floor(muestreos.length * 0.95)]
      : 0;
    const calidad = {
      nivel: sesion.calidad?.nivel || "media",
      modo: "auto" as const,
      frameMsMedia,
      frameMsP95,
    };
    const entradas = Array.from(new Set(sesion.entradas || []));
    const entradasEstandar = entradas.filter(v => /^[a-z-]+$/.test(v));
    const datos = {
      datos: {
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
        seguro: typeof window !== "undefined" ? window.isSecureContext : true,
        tieneXR: !!capacidades?.visor,
        vr: capacidades?.modo === "vr-inmersivo" ? true : null,
        ar: capacidades?.modo === "ar-passthrough" || capacidades?.modo === "ar-mano" ? true : null,
        ofreceSesion: !!capacidades?.ofrecerSesion,
        tactil: typeof navigator !== "undefined" && 'maxTouchPoints' in navigator && navigator.maxTouchPoints > 0,
        webgl2: typeof WebGLRenderingContext !== "undefined",
        webgpu: typeof navigator !== "undefined" && 'getGPUAdapter' in navigator,
        instalada: typeof window !== "undefined" && window.matchMedia?.('(display-mode: standalone)').matches,
      },
      capacidades,
      plan,
      sesion: {
        modo: sesion.modo,
        funcionesConcedidas: Array.isArray(sesion.funcionesConcedidas) ? sesion.funcionesConcedidas : [],
        frecuenciasSoportadas: Array.isArray(sesion.frecuenciasSoportadas) ? sesion.frecuenciasSoportadas : [],
        frecuenciaActual: sesion.frecuenciaActual,
        foveacion: sesion.foveacion,
      },
      calidad,
      entradas: entradasEstandar,
      microfono: "sin-probar" as const,
      ahora: Date.now(),
    };
    const informe = construirInforme(datos);
    setReporte(informe);
    setEstado("listo");
  }, [sesion, capacidades]);

  const copiarInforme = useCallback(() => {
    if (!reporte?.texto) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(reporte.texto);
    } else {
      const area = document.createElement("textarea");
      area.value = reporte.texto;
      area.style.position = "absolute";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
  }, [reporte]);

  useEffect(() => {
    if (sesion && estado === "inactivo") {
      setEstado("esperando");
    }
  }, [sesion, estado]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
        <div className="max-w-md rounded-lg border border-red-500/30 bg-red-900/20 p-6 text-red-200">
          <h2 className="mb-2 text-lg font-semibold">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!sesion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
        <div className="max-w-md rounded-lg border border-gray-700 bg-gray-800/50 p-6 text-gray-300">
          <h2 className="mb-2 text-lg font-semibold">No hay sesión XR</h2>
          <p className="mb-4">Debe entrar primero en VR o AR para medir el diagnóstico.</p>
          <div className="text-sm text-gray-400">Plataforma: {capacidades?.plataforma || "desconocida"}</div>
          <div className="text-sm text-gray-400">Modo recomendado: {capacidades?.recomendado || "¿?"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-900 p-4">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
          <h1 className="text-2xl font-bold text-white">Diagnóstico XR del Visor Real</h1>
          <p className="mt-1 text-gray-400">Mide las funciones WebXR realmente concedidas por este dispositivo</p>

          {estado === "esperando" && (
            <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-900/20 p-4">
              <p className="text-blue-200">Sesión detectada: {sesion.modo}</p>
              <p className="mt-1 text-sm text-gray-300">Plataforma: {capacidades?.plataforma}</p>
              <button
                onClick={iniciarMedicion}
                className="mt-3 cursor-pointer rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-500"
              >
                Entrar en VR/AR para medir
              </button>
            </div>
          )}

          {estado === "midiendo" && (
            <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-900/20 p-4">
              <p className="text-yellow-200">Midiendo rendimiento (10 s)…</p>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-700">
                <div className="h-full rounded-full bg-yellow-500 animate-pulse" style={{ width: '100%' }}></div>
              </div>
            </div>
          )}

          {estado === "listo" && reporte && (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-900/20 p-4">
                <h2 className="text-lg font-semibold text-green-200">Informe Generado</h2>
                <p className="mt-1 text-sm text-gray-300">
                  Fecha: {new Date(reporte.fecha).toLocaleString()} • Plataforma: {capacidades?.plataforma}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                  {reporte.secciones.map((s) => (
                    <div key={s.nombre} className="rounded border border-gray-700 bg-gray-900/50 p-3">
                      <div className="mb-2 font-medium text-white">{s.nombre}</div>
                      <div className="space-y-1">
                        {s.lineas.map((l) => (
                          <div key={l.clave} className="flex justify-between">
                            <span className="text-gray-300">{l.clave}</span>
                            <span className={
                              `font-medium ${l.estado === "ok" ? "text-green-400" : l.estado === "aviso" ? "text-yellow-400" : l.estado === "fallo" ? "text-red-400" : "text-gray-400"}
                            }>
                              {l.valor}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={copiarInforme}
                  className="mt-4 cursor-pointer rounded bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-500"
                >
                  Copiar informe
                </button>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-4 font-mono text-sm">
                <div className="mb-1 font-medium text-gray-300">Texto plano (copiar y pegar):</div>
                <pre className="overflow-x-auto whitespace-pre-wrap text-gray-400">{reporte.texto}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
