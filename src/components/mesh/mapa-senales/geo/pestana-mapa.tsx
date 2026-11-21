"use client";

/**
 * Pestaña «Mapa» de Señales (MAP1114C): el MISMO mapa del Hub Social (`MapView`) con la extensión de Señales —
 * sus secciones en el panel de capas, las marcas de las neuronas de mi cuenta en su punto exacto, los parches de
 * color de las señales y la ficha de cada aparato. No hay otro mapa. Centra en la ubicación de este aparato.
 * Solo se pinta lo medido, con su hora. Contrato: architecture/mapa-de-senales.md (corrección de Alex, 14-11-2026, tarde).
 * Incluye filtros de señales por banda, ancho, capa, medio y origen (AQ03).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPinOff, WifiOff, SlidersHorizontal } from "lucide-react";
import { MapView } from "@/components/map/map-view";
import type { EstadoBaseGeografica, MapViewExtension } from "@/components/map/map-view-extension";
import { safeGet, safeSet } from "@/lib/safe-storage";
import {
  CLAVE_CAPAS_SENALES, CLAVE_VISTA_SENALES, estadoCapasInicial, sanearEstadoCapas, type EstadoCapas,
} from "@/lib/senales/geo/capas";
import { coordenadasDeVista } from "@/lib/senales/geo/modelo-geo";
import { horaDe } from "@/lib/senales/geo/ficha-geo";
import type { MarcaGeo } from "@/lib/senales/geo/marcas";
import type { SenalEspectro } from "@/lib/senales/espectro/tipos";
import { useCompacto } from "../use-compacto";
import { EsquemaSenalesPlano } from "../vista-plana";
import { FichaGeo } from "./ficha-geo";
import { MarcasEnMapa } from "./marcas-en-mapa";
import { SeccionCapas } from "./seccion-capas";
import { useMarcasGeo, type MarcasGeo, type PermisoUbicacion } from "./use-marcas-geo";
import { usePublicarSenales, type EntradaPublicacion, type CapasHabilitadas } from "./use-publicar-senales";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import type { DescripcionMedio } from "@/lib/neurons/medio";
import { filtrarSenales } from "@/lib/senales/espectro/filtrar";
import type { FiltroSenales } from "./panel-filtros-senales";
import { leerPreferenciasMapa, guardarPreferenciasMapa, type FiltroEspectro } from "@/lib/senales/preferencias-mapa";
import { filtroEspectroASenales, filtroSenalesAEspectro } from "./panel-filtros-senales-tipos";

const PanelFiltrosSenalesDinamico = dynamic(
  () => import("./panel-filtros-senales").then((m) => m.PanelFiltrosSenales),
  { ssr: false, loading: () => null }
);

function useEnLinea(): { enLinea: boolean; desde: number | null } {
  const [est, setEst] = useState<{ enLinea: boolean; desde: number | null }>({ enLinea: true, desde: null });
  useEffect(() => {
    const leer = () => {
      const en = typeof navigator === "undefined" ? true : navigator.onLine !== false;
      setEst((p) => (p.enLinea === en ? p : { enLinea: en, desde: en ? null : Date.now() }));
    };
    leer();
    window.addEventListener("online", leer);
    window.addEventListener("offline", leer);
    return () => { window.removeEventListener("online", leer); window.removeEventListener("offline", leer); };
  }, []);
  return est;
}

function useCapasSenales(): [EstadoCapas, (id: string, on: boolean) => void, (id: string, o: number) => void] {
  const [estado, setEstado] = useState<EstadoCapas>(estadoCapasInicial);
  useEffect(() => {
    try { const raw = safeGet(CLAVE_CAPAS_SENALES); if (raw) setEstado(sanearEstadoCapas(JSON.parse(raw))); } catch { /* sin lo guardado: de fábrica */ }
  }, []);
  const guardar = useCallback((f: (e: EstadoCapas) => EstadoCapas) => {
    setEstado((prev) => { const n = f(prev); try { safeSet(CLAVE_CAPAS_SENALES, JSON.stringify(n)); } catch { /* */ } return n; });
  }, []);
  const alternar = useCallback((id: string, on: boolean) => guardar((e) => ({ ...e, activas: on ? Array.from(new Set([...e.activas, id])) : e.activas.filter((x) => x !== id) })), [guardar]);
  const opacidad = useCallback((id: string, o: number) => guardar((e) => ({ ...e, opacidad: { ...e.opacidad, [id]: o } })), [guardar]);
  return [estado, alternar, opacidad];
}

/** La pestaña con sus fuentes en vivo. */
export function PestanaMapa({ compacto }: { compacto?: boolean }) {
  const datos = useMarcasGeo();
  const red = useEnLinea();
  return <VistaMapa datos={datos} enLinea={red.enLinea} sinRedDesde={red.desde} compacto={compacto} />;
}

export interface VistaMapaProps {
  datos: Pick<MarcasGeo, "marcas" | "presenciaConectada" | "ahora" | "permiso" | "compartir" | "fijarCompartir" | "alMiPosicion" | "errorUbicacion" | "alErrorUbicacion" | "desde" | "canal" | "enlaces" | "publicadas" | "senales" | "deviceId" | "medio">;
  enLinea: boolean;
  sinRedDesde?: number | null;
  compacto?: boolean;
}

/** La vista (sin hooks de datos en vivo): la misma que se prueba y se fotografía. */
export function VistaMapa({ datos, enLinea, sinRedDesde, compacto }: VistaMapaProps) {
  const estrecho = useCompacto(compacto);
  const [capas, alternar, opacidad] = useCapasSenales();
  const [sel, setSel] = useState<string | null>(null);
  const { marcas, ahora, permiso, presenciaConectada, senales, deviceId, medio } = datos;

  // (AUD1117F4) Estado de publicación por capa: apagado de fábrica.
  const [publicacion, setPublicacion] = useState<CapasHabilitadas>({ publica: false, comunidad: false, privada: false });

  const onPublicacion = useCallback((capa: "publica" | "comunidad" | "privada", on: boolean) => {
    setPublicacion((prev) => ({ ...prev, [capa]: on }));
  }, []);

  // (AUD1117F4) Hook para publicar las señales de este aparato en el espectrómetro.
  const entrada = useMemo<EntradaPublicacion | null>(() => {
    if (!deviceId || !medio || !senales) return null;
    return {
      deviceId,
      medioId: medio.id,
      medioTipo: medio.tipo,
      medioEtiqueta: medio.etiqueta,
      senales,
      ahora,
    };
  }, [deviceId, medio, senales, ahora]);

  const { publicar, publicando, ultimaPublicacion, error } = usePublicarSenales(entrada, publicacion);

  // (AQ03) Recopilar todas las señales publicadas de todas las marcas para el panel de filtros.
  const todasLasSenales = useMemo<readonly SenalEspectro[]>(() => {
    const senales: SenalEspectro[] = [];
    for (const m of marcas) {
      if (m.publicadas) senales.push(...m.publicadas);
    }
    return senales;
  }, [marcas]);

  // (AQ03) Estado del filtro de señales: carga de preferencias y guarda al cambiar.
  const [filtroSenales, setFiltroSenales] = useState<FiltroSenales>(() => filtroEspectroASenales(leerPreferenciasMapa().filtroEspectro));
  const guardarFiltro = useCallback((nuevo: FiltroSenales) => {
    setFiltroSenales(nuevo);
    guardarPreferenciasMapa({ ...leerPreferenciasMapa(), filtroEspectro: filtroSenalesAEspectro(nuevo) });
  }, []);

  // (AQ03) Señales filtradas para pasar a MarcasEnMapa (solo afecta a capas red-*).
  const senalesFiltradas = useMemo(() => filtrarSenales(todasLasSenales, filtroSenales), [todasLasSenales, filtroSenales]);

  // (AUD1117) La base geográfica puede fallar aunque `navigator.onLine` diga que hay red (teselas caídas).
  // Se mide con los eventos de Leaflet; al volver la red se reintenta sola y, si sigue sin base, cada 30 s.
  const [base, setBase] = useState<EstadoBaseGeografica>(() => (enLinea ? "cargando" : "fallo"));
  useEffect(() => {
    setBase((prev) => (!enLinea ? "fallo" : prev === "fallo" ? "cargando" : prev));
  }, [enLinea]);
  useEffect(() => {
    if (base !== "fallo" || !enLinea) return;
    const t = setTimeout(() => setBase("cargando"), 30_000);
    return () => clearTimeout(t);
  }, [base, enLinea]);
  const sinBase = !enLinea || base === "fallo";

  const marcaSel = marcas.find((m) => m.id === sel) ?? null;
  const colocadas = marcas.filter((m) => coordenadasDeVista(m.posicion));
  const yo = marcas.find((m) => m.esYo);

  const extension = useMemo<MapViewExtension>(() => ({
    viewKey: CLAVE_VISTA_SENALES,
    centrarEnMiUbicacion: true,
    zoomAlCentrar: 18,
    vigilarPosicion: permiso === "concedido",
    ocultarPuntoPropio: true,
    // El panel queda a la izquierda de la columna de botones del mapa (no se solapa con acercar/alejar).
    clasePanelCapas: "mr-12 w-[calc(100vw-5.5rem)] sm:w-80 max-h-[calc(100svh-18.5rem)] min-h-[14rem]",
    onMiPosicion: datos.alMiPosicion,
    onErrorUbicacion: datos.alErrorUbicacion,
    onBaseEstado: setBase,
    seccionCapas: (ctx) => (
      <SeccionCapas
        estado={capas}
        onAlternar={alternar}
        onOpacidad={opacidad}
        permiso={permiso}
        compartir={datos.compartir}
        canal={datos.canal}
        onCompartir={datos.fijarCompartir}
        onUbicarme={ctx.ubicarme}
        publicadas={datos.publicadas}
        publicacion={publicacion}
        onPublicacion={onPublicacion}
        todasLasSenales={todasLasSenales}
        filtroSenales={filtroSenales}
        onCambiarFiltroSenales={guardarFiltro}
      />
    ),
    superposicion: (ctx) => (
      <MarcasEnMapa
        ctx={ctx}
        marcas={marcas}
        ahora={ahora}
        estado={capas}
        seleccion={sel}
        onElegir={setSel}
        compacto={estrecho}
        enlaces={datos.enlaces}
        publicadas={datos.publicadas}
        senalesFiltradas={senalesFiltradas}
        aviso={<Avisos enLinea={enLinea} sinRedDesde={sinRedDesde ?? null} presenciaConectada={presenciaConectada} errorUbicacion={datos.errorUbicacion} />}
        vacio={colocadas.length === 0 ? <EstadoVacio yo={yo} permiso={permiso} desde={datos.desde} total={marcas.length} onUbicarme={ctx.ubicarme} /> : null}
      >
        {marcaSel && <FichaGeo marca={marcaSel} ahora={ahora} compacto={estrecho} onCerrar={() => setSel(null)} />}
      </MarcasEnMapa>
    ),
  }), [permiso, datos.alMiPosicion, datos.alErrorUbicacion, datos.compartir, datos.canal, datos.enlaces, datos.fijarCompartir, datos.errorUbicacion, datos.desde, datos.publicadas, capas, alternar, opacidad, marcas, ahora, sel, estrecho, enLinea, sinRedDesde, presenciaConectada, colocadas.length, yo, marcaSel, publicacion, onPublicacion, todasLasSenales, filtroSenales, senalesFiltradas, guardarFiltro]);

  const ocultasSinDato = useMemo(() => todasLasSenales.filter((s) => s.frecuenciaKhz === null).length, [todasLasSenales]);
  const filtrosActivos = useMemo(() => (
    (filtroSenales.frecuencia.minKhz !== null || filtroSenales.frecuencia.maxKhz !== null ? 1 : 0) +
    (filtroSenales.ancho.minKhz !== null || filtroSenales.ancho.maxKhz !== null ? 1 : 0) +
    filtroSenales.capas.length +
    filtroSenales.medios.length +
    filtroSenales.origenes.length +
    (filtroSenales.soloCompatibles ? 1 : 0) +
    (filtroSenales.texto ? 1 : 0)
  ), [filtroSenales]);

  if (sinBase) {
    return (
      <section aria-label="Mapa de señales" data-testid="pestana-mapa">
        <div className="relative">
          <Avisos enLinea={enLinea} sinRedDesde={sinRedDesde ?? null} presenciaConectada={presenciaConectada} errorUbicacion={datos.errorUbicacion} sinBase />
          <EsquemaSenalesPlano
            marcas={marcas} seleccionId={sel} onSeleccionar={setSel} alto={estrecho ? 380 : 520}
            descripcion="Esquema de la malla sin base geográfica" className="text-white"
          />
          {marcaSel && <FichaGeo marca={marcaSel} ahora={ahora} compacto={estrecho} onCerrar={() => setSel(null)} />}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Mapa de señales" data-testid="pestana-mapa">
      <MapView className="h-[calc(100svh-6rem)] min-h-[520px]" extension={extension} />
      {estrecho && (
        <details className="pointer-events-none absolute left-3 right-16 bottom-3 z-20 group" data-testid="panel-filtros-flotante">
          <summary className="pointer-events-auto flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-white/10 bg-black/65 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 backdrop-blur-xl">
            <SlidersHorizontal className="h-3.5 w-3.5 text-sky-300" />
            Filtros de señales
            {filtrosActivos > 0 && <span className="rounded-full bg-sky-500/20 px-1.5 text-[9px] text-sky-100">{filtrosActivos} activos</span>}
            <span className="ml-auto text-[9px] font-normal text-white/35 group-open:hidden">pulsa para desplegar</span>
          </summary>
          <div className="pointer-events-auto mt-2 max-h-[50vh] overflow-auto rounded-xl border border-white/10 bg-black/70 p-3 backdrop-blur-xl w-full sm:w-80">
            <PanelFiltrosSenalesDinamico
              filtro={filtroSenales}
              onCambiar={guardarFiltro}
              visibles={senalesFiltradas.length}
              ocultasSinDato={ocultasSinDato}
            />
          </div>
        </details>
      )}
    </section>
  );
}

function Avisos({ enLinea, sinRedDesde, presenciaConectada, errorUbicacion, sinBase = false }: { enLinea: boolean; sinRedDesde: number | null; presenciaConectada: boolean; errorUbicacion: string | null; sinBase?: boolean }) {
  const lineas: string[] = [];
  if (sinBase) lineas.push("Sin base geográfica: esquema de la malla con las mismas marcas, colocadas por relación y con su hora.");
  if (!enLinea) lineas.push(`Sin conexión${sinRedDesde ? ` desde las ${horaDe(sinRedDesde)}` : ""}: la base geográfica no carga y la presencia de la cuenta no llega. Se muestra lo último que se sabía, con su hora.`);
  else if (!presenciaConectada) lineas.push("La presencia en vivo de la cuenta no está conectada: solo se muestra lo último que se sabe de cada aparato.");
  if (errorUbicacion) lineas.push(`No se pudo obtener la ubicación de este aparato: ${errorUbicacion}.`);
  if (!lineas.length) return null;
  return (
    <div className="pointer-events-none absolute left-3 right-16 top-[3.75rem] z-10 space-y-1" role="status" data-testid="avisos-mapa">
      {lineas.map((l) => (
        <p key={l} className="flex items-start gap-1.5 rounded-xl border border-amber-400/30 bg-black/65 px-2.5 py-1.5 text-[11px] leading-snug text-amber-100 backdrop-blur-xl">
          {!enLinea && l.startsWith("Sin conexión") && <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />}{l}
        </p>
      ))}
    </div>
  );
}

function EstadoVacio({ yo, permiso, desde, total, onUbicarme }: { yo?: MarcaGeo; permiso: PermisoUbicacion; desde: number; total: number; onUbicarme: () => void }) {
  const motivo = yo?.posicion.tipo === "desconocida" ? yo.posicion.motivo : "este aparato aún no conoce su ubicación";
  return (
    <div className="absolute inset-x-3 top-1/2 z-10 mx-auto max-w-sm -translate-y-1/2 rounded-2xl border border-white/10 bg-black/70 p-3.5 text-center backdrop-blur-xl" data-testid="mapa-vacio">
      <MapPinOff className="mx-auto mb-1.5 h-5 w-5 text-white/55" />
      <p className="text-[13px] font-medium text-white/90">Ninguna neurona de tu cuenta tiene posición conocida</p>
      <p className="mt-1 text-[11px] leading-snug text-white/60">
        {motivo.charAt(0).toUpperCase() + motivo.slice(1)}. {total > 1 ? `Las otras ${total - 1} neuronas de tu cuenta no anuncian posición.` : "No hay otras neuronas de tu cuenta conectadas."} Esta vista empezó a las {horaDe(desde)} y desde entonces no recibió ninguna posición.
      </p>
      {permiso !== "denegado" && (
        <button type="button" onClick={onUbicarme} className="mt-2 inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 text-[12px] text-emerald-100 hover:bg-emerald-500/20">Usar mi ubicación</button>
      )}
      {permiso === "denegado" && <p className="mt-2 text-[11px] text-amber-300">La ubicación está bloqueada en el navegador o el sistema: se cambia en sus ajustes.</p>}
    </div>
  );
}

export default PestanaMapa;