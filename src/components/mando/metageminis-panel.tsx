"use client";

/*
 * MetaGeminisPanel — la sección de MetaGeminis dentro de MetaGenesis (2026-10-10).
 * MetaGeminis es el agente social de MetaGenesis: investiga dónde hay donantes, voluntarios, fondos y redes de
 * agentes, prepara propuestas y campañas (con piezas audiovisuales del Estudio) y NUNCA envía ni publica nada sin
 * que un dueño lo apruebe aquí. Muestra: la cola «Para aprobar», las piezas de campaña, el directorio investigado,
 * los resultados por rama y agente, y el estado de las donaciones. Contrato: architecture/metageminis.md.
 *
 * Los datos salen de las tablas de supabase/migrations/20261011090000_metageminis.sql (solo las leen miembros de
 * MetaGenesis). Si esa migración aún no está aplicada, cada parte lo dice con claridad en vez de pintar ceros.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AvisoError, AvisoSinTabla } from "@/components/metageminis/aviso-sin-tabla";
import { ColaAprobar } from "@/components/metageminis/cola-aprobar";
import { DirectorioVista } from "@/components/metageminis/directorio-vista";
import { DonacionesEstado } from "@/components/metageminis/donaciones-estado";
import { PiezasCampana } from "@/components/metageminis/piezas-campana";
import { ResultadosRamas } from "@/components/metageminis/resultados-ramas";
import { miAccesoMetaGenesis } from "@/lib/metagenesis/accesos";
import { confirmarEnlace, decidirBorrador, decidirPieza, marcarHecho, type Carga, type RespuestaOp, type TablaId } from "@/lib/metageminis/datos";
import { usarDatosMeta } from "@/lib/metageminis/usar-datos";

export type SeccionMeta = "aprobar" | "piezas" | "directorio" | "resultados" | "donaciones";

export interface AccionesPanel {
  decidirBorrador: (id: string, aprobar: boolean, motivo?: string) => Promise<RespuestaOp>;
  decidirPieza: (id: string, aprobar: boolean, motivo?: string) => Promise<RespuestaOp>;
  marcarHecho: (tabla: "borrador" | "pieza", id: string) => Promise<RespuestaOp>;
  confirmarEnlace: (id: string, activo: boolean) => Promise<RespuestaOp>;
}

export interface PropsPanel {
  /** Para pruebas: sustituye la lectura de las tablas. */
  cargar?: () => Promise<Carga>;
  /** Para pruebas: sustituye la comprobación de acceso. */
  acceso?: () => Promise<{ miembro: boolean; dueno: boolean } | null>;
  acciones?: Partial<AccionesPanel>;
  /** Cada cuántos ms se recarga sola (0 = nunca). */
  recargarCadaMs?: number;
  seccionInicial?: SeccionMeta;
  hoy?: Date;
}

const ACCIONES_REALES: AccionesPanel = {
  decidirBorrador: (id, aprobar, motivo) => decidirBorrador(id, aprobar, motivo),
  decidirPieza: (id, aprobar, motivo) => decidirPieza(id, aprobar, motivo),
  marcarHecho: (tabla, id) => marcarHecho(tabla, id),
  confirmarEnlace: (id, activo) => confirmarEnlace(id, activo),
};

const SECCIONES: { id: SeccionMeta; etiqueta: string }[] = [
  { id: "aprobar", etiqueta: "Para aprobar" },
  { id: "piezas", etiqueta: "Piezas de campaña" },
  { id: "directorio", etiqueta: "Directorio" },
  { id: "resultados", etiqueta: "Resultados" },
  { id: "donaciones", etiqueta: "Donaciones" },
];

function ausente(carga: Carga, ...ids: TablaId[]): boolean {
  return ids.some((id) => carga.sinTabla.includes(id));
}

export function MetaGeminisPanel({ cargar, acceso = miAccesoMetaGenesis, acciones, recargarCadaMs = 60_000, seccionInicial, hoy }: PropsPanel) {
  const [yo, setYo] = useState<{ miembro: boolean; dueno: boolean } | null | undefined>(undefined);
  const [seccion, setSeccion] = useState<SeccionMeta | null>(seccionInicial ?? null);
  const a: AccionesPanel = { ...ACCIONES_REALES, ...acciones };

  const accesoRef = useRef(acceso);
  accesoRef.current = acceso;
  useEffect(() => {
    let vivo = true;
    accesoRef
      .current()
      .then((r) => vivo && setYo(r))
      .catch(() => vivo && setYo(null));
    return () => {
      vivo = false;
    };
  }, []);

  const miembro = yo?.miembro === true;
  const { carga, cargando, recargar } = usarDatosMeta(cargar, recargarCadaMs, miembro);
  const actual: SeccionMeta = seccion ?? (miembro ? "aprobar" : "directorio");
  const alCambiar = useCallback(() => void recargar(), [recargar]);

  const paraAprobar = carga ? carga.datos.borradores.filter((b) => b.estado === "para_aprobar").length : 0;
  const piezasParaAprobar = carga ? carga.datos.piezas.filter((p) => p.estado === "para_aprobar").length : 0;
  const cuenta: Partial<Record<SeccionMeta, number>> = { aprobar: paraAprobar, piezas: piezasParaAprobar };

  const aviso =
    yo === undefined ? (
      <p className="flex items-center gap-2 text-xs text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Comprobando tu acceso…
      </p>
    ) : yo === null ? (
      <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60" data-testid="meta-sin-sesion">
        Sin sesión de StarSeed no se pueden leer la cola, las piezas, los resultados ni las donaciones: esas tablas solo las leen miembros de MetaGenesis. Inicia
        sesión con tu cuenta. El directorio sí se puede consultar.
      </p>
    ) : !yo.miembro ? (
      <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60" data-testid="meta-no-miembro">
        Tu cuenta no está en la lista de MetaGenesis. Pide acceso a un dueño. El directorio sí se puede consultar.
      </p>
    ) : null;

  const esDueno = yo?.dueno === true;

  let contenido: React.ReactNode;
  if (actual === "directorio") {
    contenido = <DirectorioVista hoy={hoy} />;
  } else if (!miembro) {
    contenido = aviso;
  } else if (!carga) {
    contenido = (
      <p className="flex items-center gap-2 text-xs text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo MetaGeminis…
      </p>
    );
  } else if (!carga.sesion) {
    contenido = (
      <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60" data-testid="meta-sin-sesion">
        La base de datos no devuelve nada sin sesión iniciada. Inicia sesión con tu cuenta StarSeed y recarga.
      </p>
    );
  } else if (actual === "aprobar") {
    contenido = ausente(carga, "borradores") ? (
      <AvisoSinTabla que="Cola «Para aprobar»" tabla="metageminis_borradores" />
    ) : carga.errores.borradores ? (
      <AvisoError que="No se pudo leer la cola" motivo={carga.errores.borradores} />
    ) : (
      <ColaAprobar
        borradores={carga.datos.borradores}
        esDueno={esDueno}
        alCambiar={alCambiar}
        hoy={hoy}
        acciones={{
          aprobar: (id) => a.decidirBorrador(id, true),
          descartar: (id, motivo) => a.decidirBorrador(id, false, motivo),
          marcarEnviado: (id) => a.marcarHecho("borrador", id),
        }}
      />
    );
  } else if (actual === "piezas") {
    contenido = (
      <PiezasCampana
        piezas={carga.datos.piezas}
        campanas={carga.datos.campanas}
        sinTabla={ausente(carga, "piezas")}
        error={carga.errores.piezas}
        esDueno={esDueno}
        alCambiar={alCambiar}
        acciones={{
          aprobar: (id) => a.decidirPieza(id, true),
          descartar: (id, motivo) => a.decidirPieza(id, false, motivo),
          marcarPublicada: (id) => a.marcarHecho("pieza", id),
        }}
      />
    );
  } else if (actual === "resultados") {
    contenido = (
      <ResultadosRamas
        borradores={carga.datos.borradores}
        resultados={carga.datos.resultados}
        agentes={carga.datos.agentes}
        sinTablaBorradores={ausente(carga, "borradores")}
        sinTablaResultados={ausente(carga, "resultados")}
        sinTablaAgentes={ausente(carga, "agentes")}
        hallazgos={carga.datos.hallazgos}
        sinTablaHallazgos={ausente(carga, "hallazgos")}
      />
    );
  } else {
    contenido = (
      <DonacionesEstado
        donaciones={carga.datos.donaciones}
        enlaces={carga.datos.enlaces}
        sinTablaDonaciones={ausente(carga, "donaciones")}
        sinTablaEnlaces={ausente(carga, "enlaces")}
        esDueno={esDueno}
        alCambiar={alCambiar}
        confirmar={(id, activo) => a.confirmarEnlace(id, activo)}
      />
    );
  }

  return (
    <section className="space-y-4" data-testid="metageminis-panel">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.05] p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
          <div className="min-w-0 space-y-1.5 text-sm">
            <h3 className="font-semibold text-cyan-50">MetaGeminis</h3>
            <p className="text-xs leading-relaxed text-white/65">
              El agente social de MetaGenesis: busca donantes, voluntarios, fondos y aliados, y prepara propuestas, mensajes y campañas con piezas audiovisuales
              para el bien común. Siempre dice que es un agente de IA de StarSeed, escribe solo donde las normas del sitio lo permiten y{" "}
              <strong>no envía ni publica nada sin tu aprobación</strong>.
            </p>
          </div>
        </div>
      </div>

      {actual === "directorio" ? aviso : null}

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Secciones de MetaGeminis">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`mg-tab-${s.id}`}
            aria-selected={actual === s.id}
            aria-controls="mg-contenido"
            onClick={() => setSeccion(s.id)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300",
              actual === s.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-50" : "border-white/15 text-white/65 hover:bg-white/[0.06]",
            )}
          >
            {s.etiqueta}
            {cuenta[s.id] ? <span className="ml-1.5 rounded-full bg-amber-400/20 px-1.5 text-[10px] text-amber-100">{cuenta[s.id]}</span> : null}
          </button>
        ))}
        {miembro && (
          <Button size="sm" variant="ghost" className="ml-auto cursor-pointer gap-1" disabled={cargando} onClick={() => void recargar()} aria-label="Volver a leer MetaGeminis">
            {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            Actualizar
          </Button>
        )}
      </div>

      <div id="mg-contenido" role="tabpanel" aria-labelledby={`mg-tab-${actual}`}>
        {contenido}
      </div>
    </section>
  );
}

export default MetaGeminisPanel;
