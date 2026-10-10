"use client";

/**
 * Contenido del Mapa 3D de señales reales: junta las fuentes reales (`useMapaVivo`), las antenas
 * propias y las preferencias de vista, y las reparte entre el lienzo (3D o plano), los filtros, la
 * lista y la ficha de lo elegido. Una sola selección manda en todo —«Tú», un aparato, un medio o
 * una señal—: lo que pulsas en el mapa se abre en la lista y viceversa.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, Info, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMeshState } from "@/ai/astraura/mesh";
import { startBleScan, stopBleScan, type AntennaKind } from "@/ai/astraura/mesh/signals";
import { COLOR_ESTADO } from "@/lib/senales/aparatos";
import { construirCentro } from "@/lib/senales/centro";
import { iconosPresentes } from "@/lib/senales/iconos";
import { fichaDeYo } from "@/lib/senales/medios";
import { fichaDeSenal } from "@/lib/senales/fichas";
import { cuentaDe } from "@/lib/senales/cuentas";
import { descripcionAccesible, esAparato, idsConEtiqueta, leyendaAltura, resumenVivo } from "@/lib/senales/mapa-3d";
import { construirModeloMapa } from "@/lib/senales/modelo";
import type { PreferenciasMapa } from "@/lib/senales/preferencias-mapa";
import type { ClaseEnlace } from "@/lib/senales/tipos-vivo";
import { SignalDetailCard } from "../signal-detail";
import { AjustesNeurona, TarjetaCentro, useMeshPrivacidad } from "./ajustes-centro";
import { ControlesVista3D, FiltrosCuenta, FiltrosFamilia } from "./barra-mapa";
import { BarraResumen } from "./barra-resumen";
import { LeyendaMapa } from "./leyenda-mapa";
import { ListaSenales } from "./lista-senales";
import { LimiteEscena } from "./limite-escena";
import { FichaPanel } from "./secciones-ficha";
import { useAntenasPropias } from "./use-antenas-propias";
import { useMapaVivo } from "./use-mapa-vivo";
import { usePerfilCentro } from "./use-perfil-centro";
import { VistaPlana } from "./vista-plana";
import type { OrdenCamara, VistaCamara } from "./escena-3d";

const Escena3D = dynamic(() => import("./escena-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-white/40">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando el mapa 3D…
    </div>
  ),
});

const TRANSPORTE_ES = { serial: "USB", ble: "Bluetooth", daemon: "daemon", simulator: "SIMULADOR" } as const;

export interface ContenidoMapaProps {
  /** Qué lienzo se pinta: el 3D o el plano. Las dos vistas comparten modelo, filtros, lista y ficha. */
  vista: "3d" | "plano";
  prefs: PreferenciasMapa;
  onPrefs: (p: Partial<PreferenciasMapa>) => void;
  reducido: boolean;
  /** Pantalla estrecha: lienzo más bajo, filtros plegados y menos adornos. */
  compacto: boolean;
  onOpenMesh?: () => void;
  /** El lienzo 3D falló: el contenedor pasa al plano. */
  onFallo: (motivo: string) => void;
  /** Aviso que se enseña sobre el lienzo (p. ej. por qué se ve el plano). */
  aviso?: string | null;
}

export function ContenidoMapa({ vista, prefs, onPrefs, reducido, compacto, onOpenMesh, onFallo, aviso }: ContenidoMapaProps) {
  const mesh = useMeshState();
  const { detected, senales, vivo, yo, ahora } = useMapaVivo({ verPublicos: prefs.verPublicos });
  const perfil = usePerfilCentro();
  const { privacidad, internetPublico } = useMeshPrivacidad();
  const [nombreLocal, setNombreLocal] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const fuentesAntenas = useAntenasPropias();
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [apuntadaId, setApuntadaId] = useState<string | null>(null);
  const [orden, setOrden] = useState<OrdenCamara | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const modelo = useMemo(
    () => construirModeloMapa({
      senales, vivo,
      filtros: { ocultas: prefs.ocultas, cuenta: prefs.cuenta, ocultarDesconectados: prefs.ocultarDesconectados },
      altura: prefs.altura, ahora, fuentesAntenas, avatarPropio: perfil?.fotoUrl ?? null,
    }),
    [senales, vivo, prefs.ocultas, prefs.cuenta, prefs.ocultarDesconectados, prefs.altura, ahora, fuentesAntenas, perfil?.fotoUrl],
  );
  const { visibles, marcadores, medios, resumen, resumenVisible } = modelo;
  const todosVivo = useMemo(() => resumenVivo(senales, vivo), [senales, vivo]);
  const oidasTotal = useMemo(() => senales.filter((s) => s.id.startsWith("remoto:")).length, [senales]);
  const propias = useMemo(() => senales.filter((s) => !s.id.startsWith("remoto:") && !esAparato(s)).length, [senales]);
  // ESTA neurona en el centro: nombre, foto o avatar 3D y sus datos reales.
  const centro = useMemo(
    () => construirCentro({
      yo, perfil, nombreLocal, medios: vivo.medios, presenciaConectada: vivo.presenciaConectada, senalesOidas: propias, senalesCompartidas: oidasTotal,
      privacidad, internetPublico, ligero: compacto, reducido,
    }),
    [yo, perfil, nombreLocal, vivo.medios, vivo.presenciaConectada, propias, oidasTotal, privacidad, internetPublico, compacto, reducido],
  );
  const iconos = useMemo(() => iconosPresentes(marcadores.map((m) => m.icono)), [marcadores]);

  const conEtiqueta = useMemo(
    () => idsConEtiqueta(marcadores, { modo: prefs.etiquetas, seleccionId, apuntadaId, max: compacto ? 8 : 16 }),
    [marcadores, prefs.etiquetas, seleccionId, apuntadaId, compacto],
  );
  const seleccionada = visibles.find((s) => s.id === seleccionId) ?? null;
  const medioSel = medios.find((m) => m.id === seleccionId)?.medio ?? null;
  const clases = useMemo(
    () => Array.from(new Set(marcadores.map((m) => m.enlaceMapa?.clase).filter((c): c is ClaseEnlace => !!c))),
    [marcadores],
  );
  const desconectados = useMemo(
    () => senales.filter((s) => vivo.estados.get(s.id) === "desconectada").length,
    [senales, vivo.estados],
  );

  // Si lo elegido desaparece (nodo caído, escaneo parado, filtro), se suelta.
  useEffect(() => {
    if (!seleccionId || seleccionId === "yo") return;
    if (!visibles.some((s) => s.id === seleccionId) && !medios.some((m) => m.id === seleccionId)) setSeleccionId(null);
  }, [seleccionId, visibles, medios]);

  // En pantallas estrechas la ficha queda debajo del lienzo: al elegir algo se lleva a la vista.
  const lateral = useRef<HTMLElement>(null);
  useEffect(() => {
    if ((!seleccionId && !editando) || typeof window === "undefined" || window.innerWidth >= 1024) return;
    lateral.current?.scrollIntoView?.({ block: "nearest", behavior: reducido ? "auto" : "smooth" });
  }, [seleccionId, editando, reducido]);

  const radioListo = mesh.status === "ready" || mesh.status === "degraded";
  const nodosAlAlcance = mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length;
  const textoRadio = radioListo
    ? `Radio LoRa por ${mesh.transport ? TRANSPORTE_ES[mesh.transport] : "radio"} · ${nodosAlAlcance} ${nodosAlAlcance === 1 ? "nodo" : "nodos"} al alcance`
    : "Sin radio LoRa conectado";
  const etiquetaCentro = radioListo ? (yo.radio.gps ? "con GPS del radio" : "el radio no comparte GPS") : "sin radio";

  const alternarFamilia = (f: AntennaKind) =>
    onPrefs({ ocultas: prefs.ocultas.includes(f) ? prefs.ocultas.filter((x) => x !== f) : [...prefs.ocultas, f] });
  const camara = (v: VistaCamara) => setOrden((o) => ({ vista: v, n: (o?.n ?? 0) + 1 }));
  const filtrosActivos = prefs.ocultas.length + (prefs.cuenta !== "todas" ? 1 : 0) + (prefs.ocultarDesconectados ? 1 : 0);

  const escanearBle = async () => {
    setOcupado(true);
    try {
      if (detected.ble.scanning) { stopBleScan(); return; }
      const st = await startBleScan();
      if (st.error) toast.error(st.error);
      else if (!st.scanning && st.detections.length === 0) toast.message("Sin resultados", { description: st.detail });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo escanear Bluetooth");
    } finally {
      setOcupado(false);
    }
  };

  const filtros = (
    <div className="space-y-2">
      <FiltrosFamilia resumen={resumen} ocultas={prefs.ocultas} onFamilia={alternarFamilia} onTodas={() => onPrefs({ ocultas: [], cuenta: "todas", ocultarDesconectados: false })} />
      <FiltrosCuenta
        porCuenta={resumen.porCuenta}
        cuenta={prefs.cuenta}
        onCuenta={(cuenta) => onPrefs({ cuenta })}
        ocultarDesconectados={prefs.ocultarDesconectados}
        desconectados={desconectados}
        onDesconectados={() => onPrefs({ ocultarDesconectados: !prefs.ocultarDesconectados })}
      />
    </div>
  );

  const descripcion = descripcionAccesible(resumenVisible, prefs.altura, modelo.vivoVisible);
  const cerrar = () => setSeleccionId(null);

  return (
    <div className="space-y-2.5" onKeyDown={(e) => { if (e.key === "Escape") cerrar(); }}>
      <BarraResumen
        resumen={resumen}
        vivo={todosVivo}
        medios={vivo.medios.length}
        compacto={compacto}
        bleSoportado={detected.ble.support !== "unsupported"}
        bleEscaneando={detected.ble.scanning}
        bleDetalle={detected.ble.detail}
        ocupado={ocupado}
        sondeando={detected.loadingNeurons}
        onBle={() => void escanearBle()}
        onSondear={detected.refresh}
      />

      <TarjetaCentro
        centro={centro}
        abierta={editando}
        compacto={compacto}
        onAjustes={() => { setEditando((v) => !v); setSeleccionId("yo"); }}
      />

      {todosVivo.aparatos > 0 && !vivo.presenciaConectada && (
        <p className="flex items-start gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] leading-snug text-white/55">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>La presencia en vivo no está conectada: el estado de tus aparatos sale de su último latido (cada 5 min), no de verlos abiertos, y no se muestran sus medios.</span>
        </p>
      )}

      {mesh.transport === "simulator" && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-100">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-black uppercase tracking-wider">Simulador activo</span> — los nodos LoRa con aro ámbar los genera el
            simulador de la malla: NO existen en el aire. Conecta un radio real para ver señales verdaderas.
          </span>
        </p>
      )}

      {aviso && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-100">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {aviso}
        </p>
      )}

      {compacto ? (
        <details className="group rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-white/70">
            <SlidersHorizontal className="h-3.5 w-3.5 text-sky-300" /> Filtros
            {filtrosActivos > 0 && <span className="rounded-full bg-sky-500/20 px-1.5 text-[9px] text-sky-100">{filtrosActivos} activos</span>}
            <span className="ml-auto text-[9px] font-normal text-white/35 group-open:hidden">pulsa para desplegar</span>
          </summary>
          <div className="mt-2">{filtros}</div>
        </details>
      ) : filtros}

      {vista === "3d" && (
        <ControlesVista3D
          altura={prefs.altura}
          onAltura={(altura) => onPrefs({ altura })}
          etiquetas={prefs.etiquetas}
          onEtiquetas={(etiquetas) => onPrefs({ etiquetas })}
          girar={prefs.girar}
          onGirar={() => onPrefs({ girar: !prefs.girar })}
          reducido={reducido}
          onCamara={camara}
        />
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Lienzo (en compacto, la nota de altura va debajo para no tapar marcas) */}
        <div className="min-w-0">
        <div className={cn("relative overflow-hidden rounded-2xl border border-white/10 bg-black/40", compacto ? "h-[320px]" : "h-[380px] sm:h-[480px]")}>
          {vista === "3d" ? (
            <LimiteEscena onError={onFallo}>
              <Escena3D
                marcadores={marcadores}
                medios={medios}
                sectores={modelo.sectores}
                anillos={modelo.anillos}
                antenas={modelo.antenas}
                seleccionId={seleccionId}
                apuntadaId={apuntadaId}
                conEtiqueta={conEtiqueta}
                hayGps={resumenVisible.gps > 0}
                girar={prefs.girar}
                reducido={reducido}
                ligero={compacto}
                orden={orden}
                centro={centro}
                descripcion={descripcion}
                onSeleccionar={setSeleccionId}
                onApuntar={setApuntadaId}
                onPerdido={() => onFallo("el navegador perdió el contexto WebGL")}
              />
            </LimiteEscena>
          ) : (
            <div className="flex h-full items-center justify-center p-2">
              <VistaPlana
                modelo={modelo}
                seleccionId={seleccionId}
                apuntadaId={apuntadaId}
                onSeleccionar={setSeleccionId}
                onApuntar={setApuntadaId}
                reducido={reducido}
                alto={compacto ? 300 : 460}
                etiquetaCentro={etiquetaCentro}
                centro={centro}
                descripcion={descripcion}
              />
            </div>
          )}

          <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-lg border border-white/10 bg-black/65 px-2.5 py-1.5 text-[10px] text-white/70">
            <span className={cn("size-1.5 shrink-0 rounded-full", radioListo ? "bg-emerald-400" : "bg-zinc-500")} aria-hidden />
            <span className="truncate">{textoRadio}</span>
          </div>
          {vista === "3d" && !compacto && (
            <div className="pointer-events-none absolute right-3 top-3 z-20 hidden rounded-lg border border-white/10 bg-black/65 px-2.5 py-1.5 text-[10px] text-white/45 sm:block">
              Arrastra para girar · rueda para acercar · pulsa una marca
            </div>
          )}
          {vista === "3d" && !compacto && (
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 max-w-[34rem] rounded-lg border border-white/10 bg-black/65 px-2.5 py-1.5 text-[10px] leading-snug text-white/55">
              <span className="font-semibold text-white/75">Altura:</span> {leyendaAltura(prefs.altura)}
            </div>
          )}
          {senales.length === 0 && (
            <div className="pointer-events-none absolute inset-x-6 bottom-16 z-20 flex justify-center">
              <p className="max-w-md rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-center text-[11px] leading-snug text-white/60">
                {radioListo
                  ? "Malla lista · ninguna señal externa detectada todavía."
                  : "Sin radio LoRa · se muestran las antenas de esta neurona. Conecta la malla o escanea BLE para detectar señales."}
              </p>
            </div>
          )}
        </div>
        {vista === "3d" && compacto && (
          <p className="mt-1.5 px-1 text-[10px] leading-snug text-white/55">
            <span className="font-semibold text-white/75">Altura:</span> {leyendaAltura(prefs.altura)}
          </p>
        )}
        </div>

        {/* Lista ⇄ ficha */}
        <aside ref={lateral} className="min-h-0 space-y-2 lg:h-[480px] lg:overflow-y-auto lg:pr-1" aria-label="Señales y ficha">
          {editando && (
            <AjustesNeurona
              centro={centro}
              neuronaId={yo.neuronaId}
              verPublicos={prefs.verPublicos}
              onVerPublicos={(verPublicos) => onPrefs({ verPublicos })}
              onNombre={setNombreLocal}
            />
          )}
          {seleccionId === "yo" ? (
            <FichaPanel ficha={fichaDeYo(yo, oidasTotal, centro)} color="#38bdf8" onCerrar={cerrar} onVolver={cerrar} textoVolver="Todas las señales" />
          ) : medioSel ? (
            <FichaPanel
              ficha={medioSel.ficha}
              color={medioSel.visible ? COLOR_ESTADO.activa : COLOR_ESTADO["segundo-plano"]}
              onCerrar={cerrar}
              onVolver={() => setSeleccionId(medioSel.padreId)}
              textoVolver={medioSel.padreId === "yo" ? "Ver «Tú»" : "Ver el aparato"}
            />
          ) : seleccionada ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={cerrar}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/65 transition-colors duration-200 hover:border-white/25 hover:text-white/90"
              >
                <ArrowLeft className="h-3 w-3" /> Todas las señales
              </button>
              <SignalDetailCard
                signal={seleccionada}
                ficha={fichaDeSenal(seleccionada, { ahora, cuenta: cuentaDe(seleccionada), vivo })}
                onClose={cerrar}
                onOpenMesh={onOpenMesh}
              />
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-[10px] text-white/45">
                {resumen.total === 0
                  ? "Sin señales detectadas"
                  : visibles.length === resumen.total
                    ? `${visibles.length} ${visibles.length === 1 ? "señal" : "señales"}, de mejor a peor calidad`
                    : `${visibles.length} de ${resumen.total} señales con estos filtros`}
              </p>
              <ListaSenales
                senales={visibles}
                vivo={vivo}
                etiquetaYo={yo.medio?.etiqueta ?? null}
                centro={centro}
                avatarPropio={perfil?.fotoUrl ?? null}
                seleccionId={seleccionId}
                apuntadaId={apuntadaId}
                onSeleccionar={setSeleccionId}
                onApuntar={setApuntadaId}
                hayFiltros={resumen.total > 0}
              />
            </div>
          )}
        </aside>
      </div>

      <LeyendaMapa altura={prefs.altura} gpsAhora={resumenVisible.gps} clases={clases} hayAparatos={todosVivo.aparatos > 0} hayMedios={medios.length > 0} iconos={iconos} compacto={compacto} />
    </div>
  );
}

export default ContenidoMapa;
