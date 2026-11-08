"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EstaNeurona — Ajustes › Neuronas › «Esta neurona» (VER1107B · 2026-11-07).
 * Contrato: architecture/centro-versiones-1105.md §8.5.
 *
 * Lo que este aparato sabe de sí mismo, cada dato SOLO si se conoce (nada inventado): versión de la app
 * nativa instalada, medio y app (OS / Café / Nexus), build y sha de la web (`/version.json`), sistema
 * operativo y su versión, arquitectura, equipo o modelo, Tauri, servidor local y capas, y la última
 * comprobación de actualizaciones.
 * Botones (solo en las apps nativas): «Buscar actualizaciones» (solo busca: el mismo camino que la
 * ventana), «Actualizar» (escritorio: descarga e instala con el updater y luego «Reiniciar para
 * aplicar»; Android: el .apk de la misma firma, que se instala encima con los datos donde están).
 * (ACT1108A · §9) Fila «Canal» si la app es del canal de pruebas («Canal de pruebas · 0.5.1-prueba.23»)
 * y, en Android, «Instalar la X aquí»: descarga y verificación dentro de la app y el instalador del
 * sistema (que pide confirmar); sin actualizador interno, el .apk a mano.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RUTA_VERSION } from "@/components/actualizaciones/seccion-version";
import { Cpu, Download, GitMerge, Loader2, RotateCw, Search } from "lucide-react";
import { EVENTO_ABRIR_BIENVENIDA_NEURONA } from "@/lib/neurons/neurona-bienvenida";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoServidorLocal } from "@/components/nativa/estado-servidor-local";
import { comprobarActualizacion, type ResultadoComprobar } from "@/lib/actualizaciones/comprobar";
import { textoAlDia } from "@/lib/actualizaciones/decision-aviso";
import {
  EVENTO_COMPROBACION,
  guardarUltimaComprobacion,
  haceCuanto,
  leerUltimaComprobacion,
  type UltimaComprobacion,
} from "@/lib/actualizaciones/ultima-comprobacion";
import { leerInstalada, type Instalada } from "@/lib/actualizaciones/version-por-medio";
import { actualizarEscritorio, reiniciarParaActualizar } from "@/lib/nativa/actualizador";
import { actualizarApkEnApp, instalarApkDescargado, textoEstadoApk } from "@/lib/nativa/actualizador-apk";
import { etiquetaCanal } from "@/lib/actualizaciones/canal-pruebas";
import { NOMBRE_MEDIO } from "@/lib/neurons/info-publica";
import { textoEstadoActualizacion } from "@/lib/pwa/actualizacion-nativa-logica";

interface VersionWeb {
  build: string | null;
  sha: string | null;
  version: string | null;
}

const NOMBRE_APP: Record<string, string> = { os: "StarSeed OS", cafe: "StarSeed Café", nexus: "StarSeed Nexus" };
const NOMBRE_SO: Record<string, string> = { macos: "macOS", windows: "Windows", linux: "Linux", android: "Android", ios: "iOS" };

export interface FilaInfo {
  etiqueta: string;
  valor: string;
}

/** Las filas que se enseñan: solo las que se conocen. Pura. */
export function filasEstaNeurona(inst: Instalada | null, web: VersionWeb | null): FilaInfo[] {
  const filas: FilaInfo[] = [];
  const i = inst?.info ?? null;
  const nativa = inst && inst.fuente && inst.fuente !== "version.json" ? inst.version : null;
  if (nativa) filas.push({ etiqueta: "Versión de la app", valor: nativa });
  // (ACT1108A) Solo se dice el canal cuando es el de pruebas (el oficial es lo normal).
  const canal = nativa ? etiquetaCanal(nativa) : null;
  if (canal) filas.push({ etiqueta: "Canal", valor: canal });
  if (inst) {
    const app = i?.sistema ? NOMBRE_APP[i.sistema] : undefined;
    filas.push({ etiqueta: "Medio", valor: `${NOMBRE_MEDIO[inst.medio]}${app ? ` · ${app}` : ""}` });
  }
  if (web?.build) {
    const extra = [web.version, web.sha ? web.sha.slice(0, 7) : null].filter(Boolean).join(" · ");
    filas.push({ etiqueta: "Web", valor: `build ${web.build}${extra ? ` (${extra})` : ""}` });
  }
  if (i?.plataforma) filas.push({ etiqueta: "Sistema operativo", valor: `${NOMBRE_SO[i.plataforma] ?? i.plataforma}${i.so_version ? ` ${i.so_version}` : ""}` });
  if (i?.arquitectura) filas.push({ etiqueta: "Arquitectura", valor: i.arquitectura });
  if (i?.modelo) filas.push({ etiqueta: "Modelo", valor: i.modelo });
  if (i?.equipo) filas.push({ etiqueta: "Equipo", valor: i.equipo });
  if (i?.tauri_version) filas.push({ etiqueta: "Tauri", valor: i.tauri_version });
  return filas;
}

/** Texto de un resultado de «Buscar actualizaciones». Pura. */
export function textoResultado(r: ResultadoComprobar): string {
  const d = r.decision;
  if (d.tipo === "ventana") {
    const canal = r.canal === "pruebas" ? " del canal de pruebas" : "";
    return `StarSeed OS ${d.version}${canal} está lista para instalar (tienes la ${r.instalada}).`;
  }
  if (d.tipo === "preparando") return d.texto;
  return d.motivo;
}

/** «instalador»: Android ya tiene el APK verificado; «apk-manual»: queda descargar el .apk a mano. */
type Fase = "" | "buscando" | "instalando" | "lista" | "instalador" | "apk-manual";

export function EstaNeurona() {
  const [inst, setInst] = useState<Instalada | null>(null);
  const [web, setWeb] = useState<VersionWeb | null>(null);
  const [ultima, setUltima] = useState<UltimaComprobacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoComprobar | null>(null);
  const [fase, setFase] = useState<Fase>("");
  const [mensaje, setMensaje] = useState("");
  const [, setReloj] = useState(0);

  useEffect(() => {
    let vivo = true;
    void leerInstalada()
      .then((i) => vivo && setInst(i))
      .catch(() => undefined);
    void fetch("/version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, unknown> | null) => {
        const t = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
        if (vivo && d) setWeb({ build: t(d.build), sha: t(d.sha), version: t(d.version) });
      })
      .catch(() => undefined);
    setUltima(leerUltimaComprobacion());
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

  const buscar = useCallback(async () => {
    setFase("buscando");
    setMensaje("Buscando en el canal de esta app…");
    const r = await comprobarActualizacion({ forzar: true }).catch(() => null);
    setFase("");
    setResultado(r);
    setMensaje(r ? textoResultado(r) : "No se pudo comprobar ahora.");
  }, []);

  const actualizar = useCallback(async () => {
    if (!resultado || resultado.decision.tipo !== "ventana") return;
    if (fase === "lista") {
      const r = await reiniciarParaActualizar();
      if (!r.ok) setMensaje(r.motivo);
      return;
    }
    setFase("instalando");
    setMensaje("Descargando e instalando la versión nueva…");
    const r = await actualizarEscritorio((e) => {
      const t = textoEstadoActualizacion(e);
      if (t) setMensaje(t);
    });
    if (!r.ok) {
      setFase("");
      setMensaje(r.motivo);
      return;
    }
    if (r.valor.listaParaReiniciar) {
      setFase("lista");
      setMensaje("Lista. Reinicia para aplicarla: tus datos y ajustes se quedan donde están.");
      return;
    }
    const texto = textoAlDia(resultado.instalada, resultado.decision.version);
    guardarUltimaComprobacion({ resultado: "al-dia", instalada: resultado.instalada, publicada: resultado.decision.version, texto });
    setFase("");
    setResultado(null);
    setMensaje(texto);
  }, [fase, resultado]);

  // (ACT1108A) Android: descarga y verifica DENTRO de la app y abre el instalador del sistema (que pide
  // confirmar). Sin el actualizador interno (APK anterior) o si falla, queda el .apk a mano.
  const actualizarAndroid = useCallback(async () => {
    if (!resultado || resultado.decision.tipo !== "ventana") return;
    const apk = resultado.decision.apk;
    if (fase === "instalador") {
      const r = await instalarApkDescargado();
      setMensaje(r.ok ? "Android te pide confirmar: pulsa «Instalar». Tus datos se quedan donde están." : r.motivo);
      return;
    }
    setFase("instalando");
    setMensaje("Buscando la versión nueva…");
    const r = await actualizarApkEnApp({ onEstado: (e) => setMensaje(textoEstadoApk(e)) });
    if (r.estado === "sin-actualizador") {
      setFase("apk-manual");
      setMensaje("Esta app no trae el actualizador interno: descarga el .apk de la misma firma y ábrelo.");
      return;
    }
    if (r.estado === "error") {
      setFase(apk ? "apk-manual" : "");
      setMensaje(r.motivo);
      return;
    }
    const f = r.final;
    if (f.fase === "al-dia" && apk && resultado.canal !== "pruebas") {
      setFase("apk-manual"); // el canal oficial aún no publica el manifiesto del APK
      setMensaje("Descarga el .apk de la misma firma y ábrelo: se instala encima, con tus datos donde están.");
      return;
    }
    setMensaje(textoEstadoApk(f));
    setFase(f.fase === "error" ? (apk ? "apk-manual" : "") : f.fase === "al-dia" || f.fase === "instalada" ? "" : "instalador");
  }, [fase, resultado]);

  const filas = filasEstaNeurona(inst, web);
  const ofrecida = resultado?.decision.tipo === "ventana" ? resultado.decision : null;

  return (
    <Card className="bg-background/40 backdrop-blur-sm border-[#39FF14]/20" aria-labelledby="titulo-esta-neurona">
      <CardHeader className="pb-3">
        <CardTitle id="titulo-esta-neurona" className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4 text-[#39FF14]" aria-hidden /> Esta neurona
        </CardTitle>
        <CardDescription>Lo que este aparato sabe de sí mismo: versión, medio, sistema y aparato. Solo lo que se conoce.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {filas.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
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
          <p className="text-xs text-muted-foreground">Leyendo este aparato…</p>
        )}
        {inst && inst.fuente && inst.fuente !== "version.json" && (
          <p className="text-[10px] text-muted-foreground">
            Versión leída de la app nativa ({inst.fuente === "info_neurona" ? "info_neurona" : inst.fuente === "getVersion" ? "getVersion: app anterior" : "plugin:app|version"}).
          </p>
        )}
        {inst && nativa && !inst.version && (
          <p className="text-xs text-amber-200/90">Esta app no dice su versión: no se compara con lo publicado ni se abre ninguna ventana.</p>
        )}

        <EstadoServidorLocal />

        {/* (NEU1107B) La ventana «Esta neurona» a mano: detectar registros de este aparato desde otros
            medios, fusionarlos y editar lo básico. Contrato: architecture/neurona-bienvenida.md. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_BIENVENIDA_NEURONA));
              } catch {
                /* sin ventana */
              }
            }}
          >
            <GitMerge className="h-4 w-4" aria-hidden /> Revisar las neuronas de este aparato
          </Button>
          <span className="text-[11px] text-muted-foreground">Fusiona los registros repetidos de este aparato y ajusta lo básico.</span>
        </div>

        {ultima && (
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground/80">Última comprobación:</span> {haceCuanto(ultima.en)} · {ultima.texto}
          </p>
        )}
        {/* (ACT1108B) La versión y las actualizaciones tienen su propia sección en Ajustes (primer nivel). */}
        <p className="text-xs">
          <Link href={RUTA_VERSION} className="cursor-pointer text-emerald-300 underline-offset-2 hover:underline">
            Abrir Ajustes › Versión y actualizaciones
          </Link>
        </p>

        {nativa ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => void buscar()} disabled={fase === "buscando" || fase === "instalando"}>
              {fase === "buscando" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-1 h-4 w-4" aria-hidden />}
              Buscar actualizaciones
            </Button>
            {ofrecida && inst?.medio === "escritorio" && (
              <Button size="sm" className="cursor-pointer" onClick={() => void actualizar()} disabled={fase === "instalando"}>
                {fase === "lista" ? <RotateCw className="mr-1 h-4 w-4" aria-hidden /> : fase === "instalando" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Download className="mr-1 h-4 w-4" aria-hidden />}
                {fase === "lista" ? "Reiniciar para aplicar" : `Actualizar a la ${ofrecida.version}`}
              </Button>
            )}
            {ofrecida && inst?.medio === "android" && fase !== "apk-manual" && (
              <Button size="sm" className="cursor-pointer" onClick={() => void actualizarAndroid()} disabled={fase === "instalando"}>
                {fase === "instalando" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Download className="mr-1 h-4 w-4" aria-hidden />}
                {fase === "instalador" ? "Abrir el instalador" : `Instalar la ${ofrecida.version} aquí`}
              </Button>
            )}
            {ofrecida && inst?.medio === "android" && fase === "apk-manual" && ofrecida.apk && (
              <Button asChild size="sm" className="cursor-pointer">
                <a href={ofrecida.apk} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-1 h-4 w-4" aria-hidden /> Descargar la {ofrecida.version} (.apk)
                </a>
              </Button>
            )}
            {ofrecida && <Badge className="bg-amber-500/15 text-amber-200 border-amber-400/30 text-[10px]">Nueva versión disponible</Badge>}
          </div>
        ) : (
          inst && (
            <p className="text-xs text-muted-foreground">
              En la web y en la app web instalada la versión nueva llega sola (aviso del service worker). Las apps nativas se actualizan desde aquí.
            </p>
          )
        )}
        {mensaje && (
          <p role="status" aria-live="polite" className="text-xs text-foreground/85">
            {mensaje}
          </p>
        )}
        {ofrecida && inst?.medio === "android" && (
          <p className="text-[10px] text-muted-foreground">
            Se descarga y se comprueba dentro de la app (o, en una app anterior, como .apk). Android siempre te pide confirmar «Instalar». Es la
            misma firma: se instala encima, con tus datos donde están.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default EstaNeurona;
