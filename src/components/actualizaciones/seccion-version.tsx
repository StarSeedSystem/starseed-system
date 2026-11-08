"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1108B · 2026-11-08) Ajustes › «Versión y actualizaciones» — la sección de primer nivel.
 * Contrato: architecture/centro-versiones-1105.md §9.
 *
 * Antes la versión y «Buscar actualización» estaban dentro de Configuración › Neuronas › Esta neurona y
 * nadie los encontraba. Aquí, a la vista (ancla `#version-actualizaciones`, también en el buscador de
 * Ajustes), con lo mismo que enseñan la ventana «Hay una versión nueva» y el botón «Actualizar» de la
 * Librería: leen el MISMO estado en vivo (`lib/actualizaciones/estado-vivo.ts`).
 *   · versión y canal (oficial / pruebas) y aparato;
 *   · última comprobación (cuándo y qué salió, en español) y «Buscar ahora»;
 *   · progreso de descarga, «Instalar y reiniciar» (escritorio) o «Instalar» (Android, con la nota de
 *     «Instalar apps desconocidas»);
 *   · interruptor «Buscar actualizaciones automáticamente» (por defecto sí);
 *   · errores con «Reintentar».
 * En la web y la PWA la versión nueva llega sola: la sección lo dice y enseña la versión de la web.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, RotateCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { canalDe, etiquetaCanal } from "@/lib/actualizaciones/canal-pruebas";
import { etiquetaFase, leerEstadoVivo, ocupado, pedirActualizar, suscribirEstadoVivo, type EstadoVivo } from "@/lib/actualizaciones/estado-vivo";
import { guardarAutomatica, leerAutomatica } from "@/lib/actualizaciones/planificador-auto";
import { EVENTO_COMPROBACION, haceCuanto, leerUltimaComprobacion, type UltimaComprobacion } from "@/lib/actualizaciones/ultima-comprobacion";
import { leerInstalada, type Instalada } from "@/lib/actualizaciones/version-por-medio";
import { NOMBRE_MEDIO } from "@/lib/neurons/info-publica";
import { EVENTO_BUSCAR_ACTUALIZACION } from "@/lib/neurons/pedir-actualizacion";
import { OS_VERSION } from "@/lib/version/os-release";

/** El ancla de la sección en /cuenta (también la usa el buscador de Ajustes y los enlaces). */
export const ANCLA_VERSION = "version-actualizaciones";
export const RUTA_VERSION = `/cuenta?section=${ANCLA_VERSION}#${ANCLA_VERSION}`;

const NOMBRE_SO: Record<string, string> = { macos: "macOS", windows: "Windows", linux: "Linux", android: "Android", ios: "iOS" };

/** Los datos que se enseñan arriba (versión, canal, aparato): solo los que se conocen. Pura. */
export function filasVersion(inst: Instalada | null): Array<{ etiqueta: string; valor: string }> {
  const filas: Array<{ etiqueta: string; valor: string }> = [];
  if (!inst) return filas;
  const nativa = inst.fuente && inst.fuente !== "version.json" ? inst.version : null;
  filas.push({ etiqueta: "Versión instalada", valor: nativa ?? `${OS_VERSION} (web)` });
  filas.push({ etiqueta: "Canal", valor: nativa ? (canalDe(nativa) === "pruebas" ? (etiquetaCanal(nativa) ?? "Canal de pruebas") : "Oficial") : "Oficial" });
  filas.push({ etiqueta: "Medio", valor: NOMBRE_MEDIO[inst.medio] });
  const i = inst.info;
  const aparato = [i?.modelo ?? i?.equipo ?? null, i?.plataforma ? `${NOMBRE_SO[i.plataforma] ?? i.plataforma}${i.so_version ? ` ${i.so_version}` : ""}` : null, i?.arquitectura ?? null]
    .filter(Boolean)
    .join(" · ");
  if (aparato) filas.push({ etiqueta: "Aparato", valor: aparato });
  return filas;
}

/** La acción principal según el estado y el medio. Pura. */
export function accionPrincipal(
  estado: Pick<EstadoVivo, "fase" | "error">,
  medio: Instalada["medio"] | null,
): { texto: string; tipo: "buscar" | "actualizar" } {
  if (estado.fase === "lista") return { texto: "Instalar y reiniciar", tipo: "actualizar" };
  if (estado.fase === "instalador") return { texto: "Instalar", tipo: "actualizar" };
  if (estado.fase === "disponible") return { texto: medio === "android" ? "Descargar e instalar" : "Actualizar ahora", tipo: "actualizar" };
  if (estado.fase === "error") return { texto: "Reintentar", tipo: "buscar" };
  return { texto: "Buscar ahora", tipo: "buscar" };
}

export function SeccionVersion() {
  const estado = useSyncExternalStore(suscribirEstadoVivo, leerEstadoVivo, leerEstadoVivo);
  const [inst, setInst] = useState<Instalada | null>(null);
  const [ultima, setUltima] = useState<UltimaComprobacion | null>(null);
  const [auto, setAuto] = useState(true);
  const [, setReloj] = useState(0);

  useEffect(() => {
    let vivo = true;
    void leerInstalada()
      .then((i) => vivo && setInst(i))
      .catch(() => undefined);
    setUltima(leerUltimaComprobacion());
    setAuto(leerAutomatica());
    const alComprobar = (e: Event) => setUltima((e as CustomEvent<UltimaComprobacion>).detail ?? leerUltimaComprobacion());
    window.addEventListener(EVENTO_COMPROBACION, alComprobar);
    const reloj = setInterval(() => setReloj((n) => n + 1), 60_000);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_COMPROBACION, alComprobar);
      clearInterval(reloj);
    };
  }, []);

  const nativa = inst?.medio === "escritorio" || inst?.medio === "android";
  const accion = accionPrincipal(estado, inst?.medio ?? null);
  const trabajando = ocupado(estado);
  const filas = filasVersion(inst);

  const pulsar = () => {
    if (accion.tipo === "actualizar") pedirActualizar({ origen: "ajustes" });
    else window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR_ACTUALIZACION));
  };

  const cambiarAuto = (v: boolean) => {
    setAuto(v);
    guardarAutomatica(v);
  };

  const sinRed = estado.fase === "error" && estado.error?.esperarRed;

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      {filas.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {filas.map((f) => (
            <div key={f.etiqueta} className="flex min-w-0 gap-2">
              <dt className="shrink-0 text-muted-foreground">{f.etiqueta}</dt>
              <dd className="min-w-0 truncate font-mono text-foreground/90" title={f.valor}>
                {f.valor}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Leyendo este aparato…</p>
      )}

      {nativa ? (
        <>
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <Badge variant="outline" className="gap-1">
              {trabajando ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : estado.fase === "error" ? (sinRed ? <WifiOff className="h-3 w-3" aria-hidden /> : <AlertTriangle className="h-3 w-3" aria-hidden />) : estado.fase === "al-dia" ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : null}
              {etiquetaFase(estado.fase)}
            </Badge>
            {estado.version && (estado.fase === "disponible" || estado.fase === "lista" || estado.fase === "descargando") && (
              <span className="font-mono text-xs">{estado.version}</span>
            )}
          </div>

          {estado.mensaje && (
            <p role="status" className={estado.fase === "error" ? "text-sm text-red-400" : "text-sm text-foreground/85"}>
              {estado.mensaje}
            </p>
          )}

          {estado.fase === "descargando" && (
            <div className="space-y-1">
              <Progress value={estado.progreso ?? 0} aria-label="Progreso de la descarga" />
              <p className="text-xs text-muted-foreground">{estado.progreso === null ? "Descargando…" : `${estado.progreso} %`}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="cursor-pointer gap-1.5" onClick={pulsar} disabled={trabajando || estado.fase === "descargando"}>
              {trabajando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : accion.tipo === "buscar" ? <RefreshCw className="h-4 w-4" aria-hidden /> : estado.fase === "lista" ? <RotateCw className="h-4 w-4" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              {accion.texto}
            </Button>
            {accion.tipo === "actualizar" && (
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR_ACTUALIZACION))} disabled={trabajando}>
                Buscar ahora
              </Button>
            )}
          </div>

          {inst?.medio === "android" && (
            <p className="text-xs text-muted-foreground">
              Android siempre te pide confirmar «Instalar» y, la primera vez, permitir a StarSeed OS «Instalar apps desconocidas» (Ajustes del sistema › Apps › StarSeed OS).
              Es la misma firma: tus datos se quedan donde están.
            </p>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <label htmlFor="busqueda-automatica" className="min-w-0 text-sm">
              Buscar actualizaciones automáticamente
              <span className="block text-xs text-muted-foreground">A los 20 segundos de abrir la app y cada 6 horas. Nunca se instala nada sin que lo aceptes.</span>
            </label>
            <Switch id="busqueda-automatica" checked={auto} onCheckedChange={cambiarAuto} aria-label="Buscar actualizaciones automáticamente" />
          </div>
        </>
      ) : (
        inst && (
          <p className="text-sm text-muted-foreground">
            En la web y en la app web instalada la versión nueva llega sola (aviso del service worker). Las apps de escritorio y de Android se actualizan desde aquí.
          </p>
        )
      )}

      {ultima && (
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground/80">Última comprobación:</span> {haceCuanto(ultima.en)} · {ultima.texto}
        </p>
      )}
      {nativa && !ultima && <p className="text-xs text-muted-foreground">Aún no se ha comprobado en este aparato.</p>}
    </div>
  );
}

export default SeccionVersion;
