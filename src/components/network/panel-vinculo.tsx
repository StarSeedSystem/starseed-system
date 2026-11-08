"use client";

/**
 * PanelVinculo + ListaVinculos — lo que se sabe de las neuronas vinculadas (2026-11-07 · VIN1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/sincronizacion-neuronas.md` §8. Pedido de Alex (07-11): desde la ficha de la
 * señal, las Señales, el Radar y las Neuronas ver los tipos de conexión disponibles entre neuronas,
 * la latencia de cada uno, las sincronizaciones activas y su estado, las capacidades y capas de
 * conciencia compartidas y los ajustes.
 *
 *  · `PanelVinculo`  — UNA neurona vinculada: vías con su latencia («Medir ahora»), sincronizaciones,
 *                      capacidades y capas compartidas, y ajustes (recordar, reconectar sola, vías
 *                      permitidas, olvidar). Si no está vinculada, lo dice y no inventa nada.
 *  · `ListaVinculos` — TODAS las vinculadas con su mejor vía y latencia; cada fila se despliega en su panel.
 *
 * Lo decide `src/lib/malla/panel-vinculo.ts` (puro, con pruebas); el estado vivo es del motor
 * (`sincronizacion-neuronas-motor.ts`). Aquí solo se enseña y se pulsa.
 */

import { useEffect, useMemo, useState } from "react";
import { Activity, BrainCircuit, Gauge, Link2, Loader2, RefreshCw, Settings2, ShieldQuestion, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { BandaEnlaceWifi } from "@/components/malla/banda-enlace-wifi";
import {
  cambiarAjustesVinculo,
  medirVias,
  olvidarVinculo,
  recordarVinculo,
  useVinculosNeuronas,
  vinculosDeNeuronas,
  type VinculoVivo,
} from "@/lib/malla/sincronizacion-neuronas-motor";
import { alternarVia, viaPermitida, TODAS_LAS_VIAS } from "@/lib/malla/ajustes-vinculo";
import { misCapasAnunciadas } from "@/lib/malla/anuncio-capas";
import {
  ETIQUETA_VIA_CORTA,
  NOMBRE_CAPA,
  ambitoDeNeurona,
  compararCapas,
  esCuentaPropia,
  filasOrdenadas,
  haceCuanto,
  mejorVia,
  nivelLatencia,
  ordenarVias,
  resumenLista,
  separarCapacidades,
  sincronizacionActiva,
  textoLatencia,
  type DatosAmbito,
  type NivelLatencia,
} from "@/lib/malla/panel-vinculo";

const COLOR_NIVEL: Record<NivelLatencia, string> = {
  rapida: "bg-emerald-400",
  normal: "bg-amber-300",
  lenta: "bg-rose-400",
  "sin-medir": "bg-white/25",
};
const TEXTO_NIVEL: Record<NivelLatencia, string> = {
  rapida: "rápida",
  normal: "normal",
  lenta: "lenta",
  "sin-medir": "sin medir",
};

/** Reloj lento solo mientras hay algo montado: refresca los «hace 5 s». */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

/** El id de la cuenta con sesión (null si no hay o aún no se sabe). Solo para decir «tu cuenta». */
function useMiCuenta(dado?: string | null): string | null {
  const [uid, setUid] = useState<string | null>(dado ?? null);
  useEffect(() => {
    if (dado !== undefined) return;
    let vivo = true;
    void import("@/lib/consumo/usuario")
      .then((m) => m.uidActual())
      .then((id) => vivo && setUid(id ?? null))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [dado]);
  return dado !== undefined ? dado : uid;
}

/** Carga los vínculos guardados una vez (el hook solo lee lo que el motor ya tiene en memoria). */
function useVinculosCargados(): VinculoVivo[] {
  useEffect(() => {
    try {
      vinculosDeNeuronas();
    } catch {
      /* sin motor: la lista queda vacía */
    }
  }, []);
  return useVinculosNeuronas();
}

function Chip({ children, tono = "neutro" }: { children: React.ReactNode; tono?: "neutro" | "ok" | "info" | "aviso" }) {
  const clase = {
    neutro: "border-white/10 bg-white/[0.04] text-white/60",
    ok: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
    info: "border-sky-400/35 bg-sky-500/10 text-sky-200",
    aviso: "border-amber-400/35 bg-amber-500/10 text-amber-200",
  }[tono];
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] leading-tight", clase)}>{children}</span>;
}

function Seccion({ icono: Icono, titulo, children, accion }: { icono: typeof Activity; titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
          <Icono className="h-3.5 w-3.5 text-white/45" aria-hidden /> {titulo}
        </h4>
        {accion}
      </div>
      {children}
    </section>
  );
}

function FilaAjuste({ etiqueta, pista, checked, onChange }: { etiqueta: string; pista: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 p-2">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold leading-tight text-white/85">{etiqueta}</p>
        <p className="text-[10px] leading-snug text-white/45">{pista}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={etiqueta} />
    </div>
  );
}

export interface PanelVinculoProps {
  /** Id de neurona (`neuron_devices`) de la otra neurona. */
  neurona: string;
  /** De quién es, si el sitio donde se monta lo sabe (señal: `ownAccount`/`publico`). */
  ambito?: DatosAmbito;
  /** Cuenta propia, para deducir si el vínculo es de tu cuenta cuando el sitio no lo dice. */
  miCuenta?: string | null;
  className?: string;
}

export function PanelVinculo({ neurona, ambito, miCuenta, className }: PanelVinculoProps) {
  const cuenta = useMiCuenta(miCuenta);
  const confirmar = useConfirm();
  const vinculos = useVinculosCargados();
  const v = vinculos.find((x) => x.neurona === neurona);
  const ahora = useAhora();
  const [midiendo, setMidiendo] = useState(false);
  const mias = useMemo(() => misCapasAnunciadas(), [vinculos]);

  const datosAmbito: DatosAmbito = ambito ?? { propia: esCuentaPropia(v?.cuenta, cuenta) };
  const info = ambitoDeNeurona(datosAmbito);

  if (!v) {
    return (
      <div className={cn("rounded-xl border border-dashed border-white/12 bg-black/20 p-2.5 text-[11px] text-white/55", className)} data-testid="panel-vinculo-vacio">
        <p className="flex items-center gap-1.5 font-semibold text-white/70">
          <ShieldQuestion className="h-3.5 w-3.5" aria-hidden /> No está vinculada todavía
        </p>
        <p className="mt-1 leading-snug">
          Pulsa «Sincronizar ahora»: cuando las dos neuronas acepten, aquí verás sus vías, la latencia de cada una, las sincronizaciones y las capas compartidas.
        </p>
        <p className="mt-1 text-[10px] text-white/40">{info.etiqueta}</p>
      </div>
    );
  }

  const mejor = mejorVia(v.vias);
  const vias = ordenarVias(v.vias);
  const ultimaMedida = v.vias.reduce<number | null>((m, x) => (x.medidoEn != null && (m == null || x.medidoEn > m) ? x.medidoEn : m), null);
  const { capas, otras } = separarCapacidades(v.capacidades);
  const cmp = compararCapas(mias, v.capacidades);
  const curso = v.sincronizaciones.filter(sincronizacionActiva).length;

  const medir = async () => {
    setMidiendo(true);
    try {
      const r = await medirVias(v.neurona);
      const ok = r.filter((x) => x.disponible && typeof x.latenciaMs === "number").length;
      if (ok) toast.success(`Latencia medida en ${ok} vía${ok === 1 ? "" : "s"}`);
      else toast.message("No se pudo medir ninguna vía ahora", { description: "Ninguna está disponible o no contestó." });
    } catch {
      toast.error("No se pudo medir la latencia");
    } finally {
      setMidiendo(false);
    }
  };

  const olvidar = async () => {
    const ok = await confirmar({
      title: `Olvidar el vínculo con ${v.nombre}`,
      description: "Dejará de reconectarse sola y sus solicitudes volverán a preguntarse. Podéis vincularlas otra vez cuando queráis.",
      confirmText: "Olvidar vínculo",
      destructive: true,
    });
    if (ok) olvidarVinculo(v.neurona);
  };

  return (
    <div className={cn("space-y-3 rounded-xl border border-white/10 bg-black/25 p-3", className)} data-testid="panel-vinculo">
      <header className="flex flex-wrap items-center gap-1.5">
        <Link2 className="h-4 w-4 text-emerald-300" aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-bold text-white/90">{v.nombre}</h3>
        <Chip tono={mejor ? "ok" : "aviso"}>{mejor ? "con camino ahora" : "sin camino ahora"}</Chip>
        {v.recordado && <Chip tono="info">recordada</Chip>}
        {v.enRedLocal && <Chip tono="ok">en tu red</Chip>}
      </header>
      <p className="-mt-2 text-[10px] text-white/45">
        {info.etiqueta} · {[v.plataforma, v.medio === "app-nativa" ? "app nativa" : v.medio === "navegador" ? "navegador" : null].filter(Boolean).join(" · ") || "medio desconocido"}
      </p>
      {info.uso === "sin-dato" && <p className="-mt-2 text-[10px] text-white/35">{info.detalle}</p>}

      {/* (WFD1108A) «Enlace Wi-Fi directo: activo · N Mb/s», o abrirlo a mano (solo en la app nativa). */}
      <BandaEnlaceWifi neurona={v.neurona} nombre={v.nombre} manual />

      <Seccion
        icono={Gauge}
        titulo="Vías y latencia"
        accion={
          <button
            type="button"
            onClick={() => void medir()}
            disabled={midiendo}
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-[10px] text-white/75 transition-colors duration-200 hover:border-white/30 disabled:cursor-wait disabled:opacity-60"
          >
            {midiendo ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />}
            Medir ahora
          </button>
        }
      >
        <ul className="space-y-1" aria-live="polite">
          {vias.map((x) => {
            const nivel = x.disponible ? nivelLatencia(x.latenciaMs) : "sin-medir";
            return (
              <li key={x.via} className={cn("flex items-start gap-2 rounded-lg border px-2 py-1.5", x.disponible ? "border-white/8 bg-white/[0.03]" : "border-white/5 bg-transparent opacity-60")}>
                <span className={cn("mt-1 size-2 shrink-0 rounded-full", COLOR_NIVEL[nivel])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-white/85">
                    {ETIQUETA_VIA_CORTA[x.via]}
                    {mejor?.via === x.via && <Chip tono="ok">mejor</Chip>}
                    {!viaPermitida(v.ajustes, x.via) && <Chip tono="aviso">desactivada aquí</Chip>}
                  </p>
                  <p className="text-[10px] leading-snug text-white/45">{x.detalle || (x.disponible ? "disponible" : "no disponible ahora")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-semibold tabular-nums text-white/85">{x.disponible ? textoLatencia(x.latenciaMs) : "—"}</p>
                  <p className="text-[9px] text-white/35">{x.disponible ? (x.latenciaMs == null ? TEXTO_NIVEL[nivel] : `${TEXTO_NIVEL[nivel]} · ${haceCuanto(x.medidoEn, ahora)}`) : "no disponible"}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[10px] text-white/35">Última medida: {haceCuanto(ultimaMedida, ahora)}. Lo que no está medido dice «sin medir»; no se estima.</p>
      </Seccion>

      <Seccion icono={Activity} titulo={`Sincronizaciones${curso ? ` · ${curso} en curso` : ""}`}>
        {v.sincronizaciones.length === 0 ? (
          <p className="text-[10px] text-white/45">Sin sincronizaciones en esta sesión.</p>
        ) : (
          <ul className="space-y-1">
            {v.sincronizaciones.slice(0, 5).map((s) => (
              <li key={s.id} className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1.5">
                <p className="flex flex-wrap items-center gap-1 text-[11px] text-white/80">
                  <Chip tono={sincronizacionActiva(s) ? "info" : s.estado === "vinculada" ? "ok" : "neutro"}>{s.estado}</Chip>
                  <span>{s.direccion === "saliente" ? "Enviada" : "Recibida"}</span>
                  {s.auto && <Chip>automática</Chip>}
                  <span className="text-[9px] text-white/35">{haceCuanto(s.actualizada, ahora)}</span>
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-white/50">{s.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion icono={BrainCircuit} titulo="Capacidades y capas de conciencia">
        {cmp.sinAnuncio ? (
          <p className="text-[10px] text-white/45">
            Esta neurona no anuncia capas de conciencia (app anterior o con las capas apagadas): no se sabe cuáles comparte.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1" aria-label="Capas de conciencia">
            {cmp.compartidas.map((c) => (
              <Chip key={`c${c}`} tono="ok">{NOMBRE_CAPA[c]} · compartida</Chip>
            ))}
            {cmp.soloSuyas.map((c) => (
              <Chip key={`s${c}`} tono="info">{NOMBRE_CAPA[c]} · solo ella</Chip>
            ))}
            {cmp.soloMias.map((c) => (
              <Chip key={`m${c}`}>{NOMBRE_CAPA[c]} · solo tú</Chip>
            ))}
          </div>
        )}
        {capas.length > 0 && cmp.compartidas.length === 0 && <p className="text-[10px] text-white/45">Ninguna capa encendida coincide en las dos.</p>}
        {otras.length > 0 && (
          <div className="flex flex-wrap gap-1" aria-label="Capacidades anunciadas">
            {otras.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion icono={Settings2} titulo="Ajustes de este vínculo">
        <div className="space-y-1">
          <FilaAjuste etiqueta="Recordar esta neurona" pista="Se reconoce por su huella en futuros encuentros." checked={v.recordado} onChange={(x) => recordarVinculo(v.neurona, x)} />
          <FilaAjuste
            etiqueta="Reconectar sola"
            pista="Al reaparecer, la solicitud sale y se acepta sin preguntar. Apagado: siempre se pregunta."
            checked={v.ajustes.reconectarSola}
            onChange={(x) => cambiarAjustesVinculo(v.neurona, { reconectarSola: x })}
          />
        </div>
        <fieldset className="rounded-lg border border-white/5 bg-black/20 p-2">
          <legend className="px-1 text-[10px] font-semibold text-white/65">Vías permitidas para esta neurona</legend>
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
            {TODAS_LAS_VIAS.map((via) => (
              <label key={via} className="flex min-h-8 cursor-pointer items-center gap-2 text-[11px] text-white/75">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-emerald-400"
                  checked={viaPermitida(v.ajustes, via)}
                  onChange={() => cambiarAjustesVinculo(v.neurona, { viasPermitidas: alternarVia(v.ajustes, via).viasPermitidas })}
                />
                {ETIQUETA_VIA_CORTA[via]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-snug text-white/40">
            Vale para pedir y para contestar. Siempre queda al menos una. Se guarda solo en este aparato.
          </p>
        </fieldset>
        <button
          type="button"
          onClick={() => void olvidar()}
          className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-red-400/25 px-2.5 text-[11px] text-red-300/85 transition-colors duration-200 hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Olvidar vínculo
        </button>
      </Seccion>
    </div>
  );
}

export interface ListaVinculosProps {
  titulo?: string;
  /** Texto extra bajo el resumen (p. ej. lo que ese sitio no puede saber). */
  nota?: string;
  /** Cuenta propia, para decir «personal · privada» cuando el vínculo es de tu cuenta. */
  miCuenta?: string | null;
  className?: string;
}

/** Todas las neuronas vinculadas, con su mejor vía y latencia; cada fila despliega su panel. */
export function ListaVinculos({ titulo = "Neuronas vinculadas", nota, miCuenta, className }: ListaVinculosProps) {
  const cuenta = useMiCuenta(miCuenta);
  const vinculos = useVinculosCargados();
  const filas = useMemo(() => filasOrdenadas(vinculos), [vinculos]);
  const [midiendo, setMidiendo] = useState(false);

  const medirTodas = async () => {
    setMidiendo(true);
    try {
      await Promise.allSettled(filas.map((f) => medirVias(f.neurona)));
    } finally {
      setMidiendo(false);
    }
  };

  return (
    <section className={cn("space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3", className)} data-testid="lista-vinculos" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[12px] font-bold text-white/90">
            <Link2 className="h-4 w-4 text-emerald-300" aria-hidden /> {titulo}
          </h3>
          <p className="text-[10px] text-white/50">{resumenLista(filas)}</p>
        </div>
        {filas.length > 0 && (
          <button
            type="button"
            onClick={() => void medirTodas()}
            disabled={midiendo}
            className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-[10px] text-white/75 transition-colors duration-200 hover:border-white/30 disabled:cursor-wait disabled:opacity-60"
          >
            {midiendo ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />}
            Medir todas
          </button>
        )}
      </div>
      {filas.length === 0 ? (
        <p className="text-[11px] leading-snug text-white/50">
          Aún no hay neuronas vinculadas. En el Radar o el mapa de señales, abre una neurona y pulsa «Sincronizar ahora».
        </p>
      ) : (
        <ul className="space-y-1">
          {filas.map((f) => {
            const v = vinculos.find((x) => x.neurona === f.neurona);
            return (
              <li key={f.neurona}>
                <details className="group rounded-xl border border-white/8 bg-white/[0.02]">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5">
                    <span className={cn("size-2 shrink-0 rounded-full", f.activa ? COLOR_NIVEL[f.nivel] : "bg-white/15")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-white/85">{f.nombre}</span>
                      <span className="block truncate text-[10px] text-white/45">
                        {f.resumen} · {f.medioTexto}
                      </span>
                    </span>
                    {f.enCurso > 0 && <Chip tono="info">{f.enCurso} en curso</Chip>}
                    {f.recordado && <Chip>recordada</Chip>}
                  </summary>
                  <div className="px-2 pb-2">
                    {v && <PanelVinculo neurona={f.neurona} miCuenta={cuenta} />}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {nota && <p className="text-[10px] leading-snug text-white/35">{nota}</p>}
    </section>
  );
}

export default PanelVinculo;
