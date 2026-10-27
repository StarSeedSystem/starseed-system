"use client";

// Ruta /xr/diagnostico (contrato architecture/starseed-xr.md §3 l): informe REAL del buscador y de la
// sesión (enabledFeatures, refrescos, entradas, calidad, 10 s de fotogramas), micrófono solo si lo pide.
import { useCallback, useEffect, useState } from "react";
import { useCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { obtenerAlmacenXR } from "@/components/xr/shell/almacen-xr";
import { nivelInicial, perfilDeNivel } from "@/lib/xr/calidad";
import { modeloQuest, type DatosNavegador } from "@/lib/xr/capacidades";
import { construirInforme, type CalidadDiagnostica, type EstadoLinea, type InformeXR, type SesionDiagnostico } from "@/lib/xr/diagnostico";
type Medidas = { sesion: SesionDiagnostico; calidad: CalidadDiagnostica; entradas: string[] };
const CLASE: Record<EstadoLinea, string> =
  { ok: "text-emerald-400", aviso: "text-amber-400", fallo: "text-red-400", "sin-probar": "text-white/40" };
const BOTON = "cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-amber-50";
const esAr = (m: string): boolean => m === "ar-passthrough" || m === "ar-mano";
/** Medir los fotogramas que la sesión pinta durante ~ms con `session.requestAnimationFrame`. */
async function medirFotogramas(s: XRSession, ms: number): Promise<number[]> {
  return new Promise<number[]>((resolver) => {
    const deltas: number[] = []; let anterior = -1; const t0 = performance.now();
    const paso = (t: number) => {
      if (anterior >= 0) deltas.push(t - anterior);
      anterior = t;
      if (t - t0 >= ms) { resolver(deltas); return; }
      try { s.requestAnimationFrame(paso); } catch { resolver(deltas); }
    };
    try { s.requestAnimationFrame(paso); } catch { resolver(deltas); }
  });
}
export default function DiagnosticoXRPage() {
  const { estado, datos, capacidades, plan } = useCapacidadesXR();
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  const [microfono, setMicrofono] = useState<"concedido" | "denegado" | "sin-probar">("sin-probar");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [informe, setInforme] = useState<InformeXR | null>(null);
  const [copiado, setCopiado] = useState(false);
  const informeDe = useCallback((m: Medidas | null, micro: "concedido" | "denegado" | "sin-probar") => construirInforme({
    datos, capacidades, plan, sesion: m?.sesion, calidad: m?.calidad, entradas: m?.entradas, microfono: micro, ahora: Date.now(),
  }), [datos, capacidades, plan]);
  useEffect(() => { if (medidas) setInforme(informeDe(medidas, microfono)); }, [medidas, microfono, informeDe]);
  const entrarYMedir = useCallback(async () => {
    setOcupado(true); setError(null); setCopiado(false);
    try {
      if (!datos.tieneXR) throw new Error("sin WebXR");
      const perfil = perfilDeNivel(nivelInicial({ plataforma: capacidades.plataforma, modelo: modeloQuest(datos.ua) }));
      const almacen = await obtenerAlmacenXR({ perfil, capacidades });
      const sesion = esAr(plan.modo) ? await almacen.enterAR() : await almacen.enterVR();
      if (!sesion) throw new Error("el navegador no abrió la sesión");
      const deltas = await medirFotogramas(sesion, 10000);
      const media = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
      const orden = [...deltas].sort((a, b) => a - b);
      const p95 = orden[Math.min(orden.length - 1, Math.floor(orden.length * 0.95))] ?? media;
      setMedidas({
        sesion: { modo: plan.modo, funcionesConcedidas: Array.from(sesion.enabledFeatures ?? []), frecuenciasSoportadas: Array.from(sesion.supportedFrameRates ?? []) },
        calidad: { nivel: perfil.nivel, modo: "auto", frameMsMedia: media, frameMsP95: p95 },
        entradas: Array.from(sesion.inputSources).map((i) => i.targetRayMode),
      });
      sesion.end().catch(() => {});
    } catch (e) {
      setError(e instanceof Error && e.message === "sin WebXR"
        ? "sin WebXR: el informe de arriba enseña lo que sí se ve"
        : "no se pudo medir: revisa el visor y el permiso de la sesión");
    } finally { setOcupado(false); }
  }, [datos, capacidades, plan]);
  const probarMicro = useCallback(async () => {
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      flujo.getTracks().forEach((t) => t.stop());
      setMicrofono("concedido");
    } catch { setMicrofono("denegado"); }
  }, []);
  const copiar = useCallback(() => {
    const texto = informe?.texto;
    if (!texto) return;
    const respaldo = () => {
      const area = document.createElement("textarea");
      area.value = texto; document.body.appendChild(area); area.select();
      document.execCommand("copy"); document.body.removeChild(area); setCopiado(true);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(texto).then(() => setCopiado(true), respaldo); else respaldo();
  }, [informe]);
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-amber-50">Diagnóstico XR · lo que de verdad hay</h1>
        <p className="mt-1 text-sm text-white/50">
          Pulsa «Entrar en VR/AR para medir»: mide 10 s de fotogramas y lee lo que la sesión concedió de
          verdad ({`enabledFeatures`}). {estado === "sondeando" ? "Sondeando el navegador…" : plan.motivo}
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={entrarYMedir} disabled={ocupado || !plan.botonUniversal || estado === "sondeando"} className={BOTON + " font-semibold disabled:opacity-40"}>
          {ocupado ? "Midiendo 10 s…" : esAr(plan.modo) ? "Entrar en AR para medir" : "Entrar en VR para medir"}
        </button>
        <button type="button" onClick={probarMicro} className={BOTON}>Probar micrófono</button>
        {informe && (
          <button type="button" onClick={copiar} className={BOTON + " border-amber-300/40 bg-amber-300/10 text-amber-200 font-semibold"}>
            {copiado ? "Informe copiado" : "Copiar informe"}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {informe && (
        <div className="flex flex-col gap-4">
          {informe.secciones.map((s) => (
            <div key={s.nombre} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">{s.nombre}</h2>
              <ul className="mt-2 grid gap-1">
                {s.lineas.map((l) => (
                  <li key={l.clave} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-white/70">{l.clave}</span>
                    <span className={CLASE[l.estado]}>{l.valor}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}