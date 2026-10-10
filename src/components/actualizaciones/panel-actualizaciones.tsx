"use client";

/**
 * Panel «Actualizaciones» con sus tres variantes (contrato §6):
 *   · ActualizacionesMetaGenesis — pestaña de MetaGenesis: el OS por capa (lo que sirve el
 *     servidor frente a lo que tiene esta neurona), aplicar aquí, prueba de humo, neuronas y canaria.
 *   · ActualizacionesGenesis     — Mi Genesis: cómo llegan a MIS neuronas el OS y mi perfil.
 *   · ActualizacionesPoliGenesis — PoliGenesis: los sistemas de una entidad (datos e interfaz).
 * Todo lo que se pinta está medido (presencia, /version.json, /sw-v7.js, esta neurona) o lo
 * guardó la persona; lo que no se mide dice «sin dato».
 * SOP: architecture/actualizaciones-por-capas-sop.md
 */

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, Stethoscope, Vote, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { aplicarCapa, pruebaDeHumo, type ResultadoAplicar } from "@/lib/actualizaciones/aplicadores";
import { guardarNeuronaElegida, idSistema, leerNeuronaElegida } from "@/lib/actualizaciones/almacen-politicas";
import { CAPAS_ORDEN, NOMBRE_CAPA, type CapaActualizacion } from "@/lib/actualizaciones/manifiesto";
import { evaluarHumo } from "@/lib/actualizaciones/planificador";
import type { TipoEntidad } from "@/lib/actualizaciones/politica";
import { NATIVE_VERSION, OS_VERSION } from "@/lib/version/os-release";
import { BloqueSistema } from "./bloque-sistema";
import { TablaNeuronas } from "./tabla-neuronas";
import { useEstadoActualizaciones } from "./use-estado-actualizaciones";

const BOTON = "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/70 transition-colors duration-200 hover:border-white/25 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-50";
const CAPAS_DECLARATIVAS: readonly CapaActualizacion[] = ["datos", "interfaz"];
const CAPAS_MEDIBLES: readonly CapaActualizacion[] = ["interfaz", "sw", "nativa"];

function useCanaria() {
  const [canaria, setCanaria] = useState<string | null>(null);
  useEffect(() => setCanaria(leerNeuronaElegida()), []);
  return [canaria, (id: string | null) => { guardarNeuronaElegida(id); setCanaria(id); }] as const;
}

type Estado = ReturnType<typeof useEstadoActualizaciones>;

function SeccionNeuronas({ capas, e }: { capas: readonly CapaActualizacion[]; e: Estado }) {
  const [canaria, setCanaria] = useCanaria();
  return (
    <section aria-label="Neuronas" className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
      <h4 className="text-[13px] font-semibold text-white/90">Tus neuronas</h4>
      <TablaNeuronas neuronas={e.neuronas} atrasos={e.atrasos} capas={capas} canariaId={canaria} onCanaria={setCanaria} presenciaConectada={e.presenciaConectada} />
    </section>
  );
}

/** Fila «servidor frente a esta neurona» de una capa, con su botón de aplicar aquí. */
function FilaCapa({ capa, servidor, aqui, nueva, onAplicar, ocupado, rotulo = "Servidor" }: {
  capa: CapaActualizacion; servidor: string; aqui: string; nueva: boolean; onAplicar: () => void; ocupado: boolean; rotulo?: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
      <span className="w-24 font-medium text-white/85">{NOMBRE_CAPA[capa]}</span>
      <span className="text-white/45">{rotulo} <span className="font-mono text-white/75">{servidor}</span></span>
      <span className="text-white/45">Aquí <span className="font-mono text-white/75">{aqui}</span></span>
      <span className={cn("rounded-full px-1.5 text-[9px] font-semibold", nueva ? "bg-amber-400/15 text-amber-200" : "bg-emerald-400/10 text-emerald-200")}>
        {nueva ? "HAY NUEVA" : "AL DÍA"}
      </span>
      <button type="button" className={cn(BOTON, "ml-auto")} disabled={ocupado} onClick={onAplicar}>
        <Zap className="h-3 w-3" aria-hidden /> Aplicar aquí
      </button>
    </li>
  );
}

export function ActualizacionesMetaGenesis() {
  const e = useEstadoActualizaciones();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const corta = (b: string | null) => (b ? b.slice(0, 14) : "sin dato");

  const aplicar = async (capa: CapaActualizacion) => {
    setOcupado(capa);
    const r: ResultadoAplicar = await aplicarCapa(capa, { sistema: "starseed-os", requiere: { reinicio: [], recarga: true, reinstalar: false } }, { permitirRelanzar: true });
    setResultado(`${NOMBRE_CAPA[capa]}: ${r.texto}`);
    setOcupado(null);
    void e.comprobar();
  };
  const humo = async () => {
    setOcupado("humo");
    const h = evaluarHumo(await pruebaDeHumo());
    setResultado(h.ok ? "Prueba de humo superada: el OS carga y publica su versión." : `Prueba de humo fallida: ${h.fallos.join(" ")}`);
    setOcupado(null);
  };

  return (
    <div className="space-y-3" data-testid="actualizaciones-metagenesis">
      <section aria-label="StarSeed OS por capa" className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-[13px] font-semibold text-white/90">StarSeed OS · versión {OS_VERSION}</h4>
          <button type="button" className={cn(BOTON, "ml-auto")} onClick={() => void e.comprobar()} disabled={e.leyendo}>
            {e.leyendo ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />} Comprobar
          </button>
          <button type="button" className={BOTON} onClick={() => void humo()} disabled={!!ocupado}>
            <Stethoscope className="h-3 w-3" aria-hidden /> Prueba de humo
          </button>
        </div>
        {e.servidor.error && <p className="text-[10px] text-amber-200/85">{e.servidor.error}</p>}
        <ul className="space-y-1.5">
          <FilaCapa capa="interfaz" servidor={corta(e.servidor.buildServidor)} aqui={corta(e.servidor.buildPestana)} nueva={e.hayBuildNueva} ocupado={!!ocupado} onAplicar={() => void aplicar("interfaz")} />
          <FilaCapa capa="sw" servidor={e.servidor.swServidor ?? "sin dato"} aqui={e.local.sw ?? "sin dato"} nueva={!!e.servidor.swServidor && !!e.local.sw && e.servidor.swServidor !== e.local.sw} ocupado={!!ocupado} onAplicar={() => void aplicar("sw")} />
          <FilaCapa capa="nativa" rotulo="Publicada" servidor={NATIVE_VERSION} aqui={e.local.nativa ?? "no es la app nativa"} nueva={!!e.local.nativa && e.local.nativa !== NATIVE_VERSION} ocupado={!!ocupado || !e.local.nativa} onAplicar={() => void aplicar("nativa")} />
        </ul>
        {resultado && <p role="status" className="text-[11px] text-white/75">{resultado}</p>}
        <p className="text-[10px] leading-snug text-white/45">
          Publicar una versión nueva del OS se hace en «Publicar»; un cambio de núcleo lo aprueba un dueño o la votación de desarrolladores.
          Datos, servicios y modelos aún no declaran versión desde el navegador: se muestran «sin dato» en vez de inventarla.
        </p>
      </section>
      <BloqueSistema sistemaId={idSistema("os")} tipo="os" nombre="StarSeed OS" nivel="meta" capas={CAPAS_ORDEN}
        nota="Cómo llega cada capa del OS a las neuronas de esta cuenta. La interfaz ya obedece esta política al detectar un despliegue nuevo." />
      <SeccionNeuronas capas={CAPAS_MEDIBLES} e={e} />
    </div>
  );
}

export function ActualizacionesGenesis({ uid }: { uid?: string | null }) {
  const e = useEstadoActualizaciones();
  return (
    <div className="space-y-3" data-testid="actualizaciones-genesis">
      <BloqueSistema sistemaId={idSistema("os")} tipo="os" nombre="StarSeed OS en mis neuronas" nivel="meta" capas={CAPAS_ORDEN}
        nota="Lo publica MetaGenesis; tú decides cuándo llega a cada una de tus neuronas." />
      <BloqueSistema sistemaId={idSistema("perfil", uid ?? "yo")} tipo="perfil" nombre="Mi perfil y mi interfaz" nivel="genesis" capas={CAPAS_DECLARATIVAS} />
      <SeccionNeuronas capas={CAPAS_MEDIBLES} e={e} />
    </div>
  );
}

export interface EntidadActualizable {
  tipo: Exclude<TipoEntidad, "perfil" | "os">;
  slug: string;
  nombre: string;
}

export function ActualizacionesPoliGenesis({ entidad, democratico, puedeGestionar }: { entidad: EntidadActualizable; democratico: boolean; puedeGestionar: boolean }) {
  return (
    <div className="space-y-3" data-testid="actualizaciones-poligenesis">
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-white/60">
        {democratico ? <Vote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden /> : <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />}
        {democratico
          ? "Entidad democrática: ninguna versión de sus sistemas se publica sin votación; lo ya aprobado llega a cada miembro según su política."
          : "Entidad jerárquica: publica quien la gestiona. Sus versiones solo tocan datos e interfaz, nunca el núcleo del OS."}
      </p>
      <BloqueSistema sistemaId={idSistema(entidad.tipo, entidad.slug)} tipo={entidad.tipo} nombre={entidad.nombre} nivel="poli" capas={CAPAS_DECLARATIVAS}
        soloLectura={!puedeGestionar} nota={puedeGestionar ? undefined : "Solo quien gestiona la entidad cambia esta política."} />
    </div>
  );
}

export default ActualizacionesMetaGenesis;
