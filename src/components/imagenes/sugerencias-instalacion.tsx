"use client";
/**
 * Tarjeta «Astraura te sugiere instalar…» (IMG1011E). Contrato: architecture/astraura-imagenes.md §5.
 *
 * Pregunta el hierro REAL al servicio local de imágenes de la neurona (IMG1011A); en la web solo usa
 * WebGPU y la memoria estimada del navegador, y lo dice. Muestra un modelo rápido, uno de calidad y uno
 * de texto, con el porqué, la licencia, el tamaño REAL de descarga (archivos exactos de Hugging Face) y
 * el espacio libre. Se instala con un toque vía el servicio local; si es «gated», explica cómo aceptar
 * los términos y poner el token. Renderiza solo si hay servicio local o algo que decir: sin datos, no inventa.
 */
import { useEffect, useMemo, useState } from "react";
import { HardDrive, Info, Sparkles } from "lucide-react";
import { FECHA_VERIFICACION_IMAGENES } from "@/lib/imagenes/modelos";
import { paqueteBase, type HierroImg, type Sugerencia } from "@/lib/imagenes/sugerencias";
import {
  archivosDelRepo, eligeArchivosDescarga, espacioSuficiente, gpuDesdeVendor, hierroDesdeSondasWeb,
  huellaSugerencias, leeHierroServicioLocal, textoGated, URL_SERVICIO_IMAGENES_POR_DEFECTO,
} from "@/lib/imagenes/adaptadores/hierro-local";

const BASE = process.env.NEXT_PUBLIC_ASTRAURA_IMAGENES_LOCAL_URL ?? URL_SERVICIO_IMAGENES_POR_DEFECTO;
const CLAVE_HUELLA = "astraura:sugerencia-imagenes-huella";
const gb = (b: number) => (b / 1024 ** 3).toFixed(1).replace(".", ",");

interface Estado { hierro: HierroImg; discoLibre: number | null; local: boolean }

/** Sondas de la web: navigator solo se toca aquí, en cliente, y lo que no dé queda desconocido. */
async function sondasWeb(): Promise<HierroImg | null> {
  type GpuMin = { requestAdapter?: () => Promise<{ info?: { vendor?: string } } | null> };
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: GpuMin; userAgentData?: { platform?: string } };
  let vendedor: string | null = null;
  try {
    vendedor = (await nav.gpu?.requestAdapter?.())?.info?.vendor ?? null;
  } catch { vendedor = null; }
  return hierroDesdeSondasWeb({
    webgpu: typeof nav.gpu !== "undefined", vendedorGpu: vendedor,
    memoriaGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    plataforma: nav.userAgentData?.platform ?? navigator.platform ?? null,
  });
}

async function instalar(s: Sugerencia): Promise<string> {
  try {
    const r = await fetch(`${BASE}/instalar`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelo: s.modelo.id, motor: s.motor, cuantizacion: s.cuantizacion }),
    });
    return r.ok ? "Pedido al servicio local: la descarga empieza con tu permiso y el espacio comprobado." : "El servicio local no aceptó el pedido.";
  } catch {
    return "No hay servicio local escuchando: instálalo desde la app nativa de esta neurona.";
  }
}

export default function SugerenciasInstalacion({ enLaMalla = [], comercial = false }: { enLaMalla?: string[]; comercial?: boolean }) {
  const [est, setEst] = useState<Estado | null>(null);
  const [tamanos, setTamanos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const paquete = useMemo(
    () => (est ? paqueteBase(est.hierro, { comercial, enLaMalla: est.local ? enLaMalla : [] }) : null),
    [est, comercial, enLaMalla],
  );

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const local = await leeHierroServicioLocal(BASE);
      const web = local ? null : await sondasWeb();
      if (!vivo || (!local && !web)) return;
      setEst(local
        ? { hierro: local, discoLibre: local.discoLibreBytes, local: true }
        : { hierro: web!, discoLibre: null, local: false });
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!paquete || !est) return;
    // La sugerencia sale una sola vez; vuelve si cambia el hierro, la malla o el catálogo (IMG1011G).
    const huella = huellaSugerencias(est.hierro, FECHA_VERIFICACION_IMAGENES, enLaMalla);
    try {
      if (localStorage.getItem(CLAVE_HUELLA) === huella) { setEst(null); return; }
      localStorage.setItem(CLAVE_HUELLA, huella);
    } catch { /* sin almacenamiento se muestra cada vez */ }
    let vivo = true;
    void (async () => {
      const t: Record<string, string> = {};
      for (const s of paquete.instalar) {
        const sel = eligeArchivosDescarga(s.modelo, s.cuantizacion, await archivosDelRepo(s.modelo.hf));
        t[s.modelo.id] = sel ? `≈ ${gb(sel.bytesTotales)} GB${sel.incompleto ? " (tamaño parcial)" : ""}` : "tamaño sin comprobar";
      }
      if (vivo) setTamanos(t);
    })();
    return () => { vivo = false; };
  }, [paquete, est, enLaMalla]);

  if (!paquete || !est) return null;
  const papel = { rapido: "Rápido", calidad: "Calidad", texto: "Texto legible" } as const;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 backdrop-blur">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-white/70" aria-hidden />
        <h3 className="text-sm font-semibold text-white">Astraura te sugiere instalar…</h3>
      </header>
      {!est.local && (
        <p className="mb-3 flex items-start gap-2 text-xs text-white/60">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Estás en la web: solo vemos WebGPU y una memoria aproximada. En la app instalada medimos el hierro real y se instala con un toque.
        </p>
      )}
      <ul className="space-y-3">
        {paquete.instalar.map((s) => (
            <li key={s.papel} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="font-medium text-white">{papel[s.papel]}: {s.modelo.nombre}</p>
              <p className="mt-1 text-xs text-white/60">{s.porQue}</p>
              <p className="mt-1 text-xs text-white/50">
                Licencia: {s.modelo.licencia} · Descarga: {tamanos[s.modelo.id] ?? "consultando…"}
                {est.discoLibre !== null ? ` · Espacio libre: ${gb(est.discoLibre)} GB` : " · Espacio libre: lo comprueba el instalador"}
              </p>
              {s.modelo.gated && <p className="mt-1 text-xs text-amber-200/80">{textoGated(s.modelo)}</p>}
              {est.local && (
                <button type="button" onClick={() => void instalar(s).then(setAviso)}
                  className="mt-2 cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white transition-colors duration-200 hover:bg-white/10">
                  Instalar en esta neurona
                </button>
              )}
            </li>
        ))}
      </ul>
      {paquete.desdeLaMalla.map((t) => <p key={t} className="mt-2 text-xs text-white/50">{t}</p>)}
      {paquete.nada && <p className="text-xs text-white/60">{paquete.nada}</p>}
      {aviso && <p className="mt-2 flex items-center gap-2 text-xs text-white/70"><HardDrive className="h-3.5 w-3.5" aria-hidden />{aviso}</p>}
    </section>
  );
}
