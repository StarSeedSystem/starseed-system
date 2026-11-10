"use client";

/**
 * Envíos entrantes — UNA ventana por envío de archivos (ARC1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Petición de Alex: «al enviar varios archivos, las preguntas de aceptar o rechazar del receptor en
 * UNA sola ventana, con vistas de carpetas y archivos, selección de cuáles aceptar o rechazar,
 * aceptar todos y rechazar todos, vistas previas, la información del envío y su mensaje, y una
 * inspección de seguridad con IA».
 *
 *  · `agruparEnvios` (puro) junta las ofertas por `lote` o, sin él, por remitente y ventana de tiempo.
 *  · Cabecera: quién lo manda y cómo se verificó, por dónde llega, cuántos archivos y cuánto ocupan,
 *    y el mensaje del envío. Árbol de carpetas (rutas relativas), vista en lista o cuadrícula,
 *    casillas, «Aceptar todos», «Rechazar todos» y «Aceptar seleccionados»; el progreso de cada
 *    archivo sigue en la misma ventana tras aceptar.
 *  · Inspección: heurísticas locales siempre (`inspeccion-archivos.ts`, con los primeros bytes y la
 *    lista del ZIP que trae la oferta, y otra vez con los bytes reales al recibirlo) y, si se pide,
 *    la IA de Astraura con un resumen de metadatos (`inspeccion-ia.ts`). Nada se acepta solo: lo
 *    marcado como peligro no va preseleccionado y «Aceptar todos» pide confirmarlo.
 * Montado por `MallaNeuronasMount` (global), en lugar de una tarjeta flotante por archivo.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check, ChevronDown, Clock, ChevronRight, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo, Fingerprint,
  Folder, FolderOpen, Inbox, LayoutGrid, List, Loader2, MessageSquare, Minimize2, Route, ShieldAlert, ShieldCheck, ShieldX, Sparkles, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bluetoothDirectoActivo } from "@/lib/malla/bluetooth-directo-motor";
import { CifradoViasArchivo } from "@/components/network/cifrado-vias-archivo"; // MPT1108B
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ACENTO, CLASE_ITEM, CLASE_ROTULO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { tamanoLegible, tipoSeguroPara, vistaPrevia, type VistaPrevia } from "@/lib/mensajeria/neuronas/datos-neurona";
import type { EstadoTransferencia, MotorArchivos } from "@/lib/network/archivos-malla";
import {
  agruparEnvios,
  arbolDeEnvio,
  enviosPorDecidir,
  idsDeCarpeta,
  idsPendientes,
  textoMedioEnvio,
  type CarpetaEnvio,
  type EnvioEntrante,
} from "@/lib/network/envios-entrantes";
import {
  extensionDe,
  inspeccionarArchivo,
  listarZip,
  nivelDeEnvio,
  type NivelInspeccion,
  type ResultadoInspeccion,
  type VeredictoIA,
} from "@/lib/network/inspeccion-archivos";
import type { PeticionInspeccionIA, ResultadoInspeccionIA } from "@/lib/network/inspeccion-ia";

/* ══════════════════════════ Utilidades ══════════════════════════ */

function bytesDeB64(b64: string | undefined): Uint8Array | null {
  if (!b64) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Inspección local ANTES de aceptar: nombre, tipo, tamaño, primeros bytes y lista del ZIP de la oferta. */
export function inspeccionPrevia(a: EstadoTransferencia): ResultadoInspeccion {
  return inspeccionarArchivo({
    nombre: a.nombre,
    tipo: a.tipo,
    tamano: a.tamano,
    inicio: bytesDeB64(a.inicioB64),
    ...(a.contenido ? { entradasZip: a.contenido, zipSegun: "remitente" as const } : {}),
  });
}

/** Inspección con los bytes REALES de un archivo ya recibido (primeros 64 KB y, si es ZIP, su directorio). */
async function inspeccionReal(a: EstadoTransferencia, blob: Blob): Promise<ResultadoInspeccion> {
  const inicio = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
  let entradasZip: ReturnType<typeof listarZip> = null;
  if (inicio[0] === 0x50 && inicio[1] === 0x4b) {
    const cola = Math.min(blob.size, 256 * 1024);
    entradasZip = listarZip(new Uint8Array(await blob.slice(blob.size - cola).arrayBuffer()), blob.size);
  }
  return inspeccionarArchivo({ nombre: a.nombre, tipo: a.tipo, tamano: blob.size, inicio, ...(entradasZip ? { entradasZip, zipSegun: "archivo" as const } : {}) });
}

const COLOR_NIVEL: Record<NivelInspeccion, string> = { limpio: ACENTO.esmeralda, aviso: ACENTO.ambar, peligro: ACENTO.carmesi };
const TEXTO_NIVEL: Record<NivelInspeccion, string> = { limpio: "Sin señales", aviso: "Aviso", peligro: "Peligro" };

function IconoNivel({ nivel, className }: { nivel: NivelInspeccion; className?: string }) {
  const I = nivel === "peligro" ? ShieldX : nivel === "aviso" ? ShieldAlert : ShieldCheck;
  return <I className={cn("h-3.5 w-3.5", className)} style={{ color: COLOR_NIVEL[nivel] }} aria-hidden />;
}

/** Velocidad medida (kbit/s) del mejor enlace Bluetooth vivo, si la hay (BLE1108B). */
function kbpsBluetoothMedido(): number | null {
  try {
    const enlaces = bluetoothDirectoActivo()?.instantanea().estado?.enlaces ?? [];
    const k = enlaces.map((e) => e.kbps).filter((x): x is number => typeof x === "number" && x > 0);
    return k.length ? Math.max(...k) : null;
  } catch {
    return null;
  }
}

function Pastilla({ color, children, titulo }: { color: string; children: ReactNode; titulo?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-medium text-white/85" style={pildoraFantasma(color)} title={titulo}>
      {children}
    </span>
  );
}

function IconoArchivo({ vista, nombre, className }: { vista: VistaPrevia; nombre: string; className?: string }) {
  const ext = extensionDe(nombre);
  const I =
    vista === "imagen" ? FileImage : vista === "audio" ? FileAudio : vista === "video" ? FileVideo : ["zip", "7z", "rar", "gz", "tgz", "tar"].includes(ext) ? FileArchive : ["js", "ts", "py", "sh", "html", "svg", "json"].includes(ext) ? FileCode : FileText;
  return <I className={cn("h-5 w-5 text-white/80", className)} aria-hidden />;
}

function textoFase(a: EstadoTransferencia): string {
  const pct = a.trozos > 0 ? Math.min(100, Math.round((a.progreso / a.trozos) * 100)) : 0;
  switch (a.fase) {
    case "pendiente-aceptar":
      return a.preparando ? "Preparando · por decidir" : "Por decidir"; // ARC1110A: solo llegó el anuncio
    case "transfiriendo":
      if (a.preparando) return a.preaceptada ? "Aceptado · preparando" : "Preparando"; // ARC1110A
      return `Recibiendo · ${pct} %`;
    case "reintentando":
      return `Reintentando · ${pct} %`;
    case "verificando":
      return "Verificando SHA-256";
    case "completada":
      return "Verificado (SHA-256)";
    case "rechazada":
      return "Rechazado";
    case "cancelada":
      return "Cancelado";
    default:
      return "Error";
  }
}

/* ══════════════════════════ Vista previa ══════════════════════════ */

/** Vista previa segura: la miniatura de la oferta antes de recibirlo; el archivo verificado después. */
function VistaArchivo({ a, blob, grande }: { a: EstadoTransferencia; blob?: Blob; grande: boolean }) {
  const vista = vistaPrevia(a.tipo, a.nombre);
  const [url, setUrl] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const completado = a.fase === "completada" && !!blob;
  useEffect(() => {
    if (!completado || !blob || vista === "pdf" || vista === "descarga") return;
    let vivo = true;
    let u: string | null = null;
    if (vista === "texto") {
      void blob.slice(0, 2000).text().then((t) => vivo && setTexto(t)).catch(() => undefined);
    } else if (grande || vista === "imagen") {
      u = URL.createObjectURL(new Blob([blob], { type: tipoSeguroPara(vista, a.tipo) }));
      setUrl(u);
    }
    return () => {
      vivo = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [completado, blob, vista, grande, a.tipo]);

  const caja = grande ? "h-28 w-full" : "h-12 w-12 shrink-0";
  if (completado && url && vista === "imagen") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Vista de ${a.nombre}`} className={cn(caja, "rounded-xl bg-black/30 object-cover")} />;
  }
  if (completado && url && grande && vista === "audio") return <audio src={url} controls className="w-full" aria-label={`Escuchar ${a.nombre}`} />;
  if (completado && url && grande && vista === "video") return <video src={url} controls playsInline className="max-h-40 w-full rounded-xl bg-black" aria-label={`Ver ${a.nombre}`} />;
  if (completado && texto !== null && grande) {
    return <pre className="max-h-28 w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-2 text-[10.5px] text-white/80">{texto}</pre>;
  }
  if (a.vista?.tipo === "imagen") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.vista.datosUrl} alt={`Miniatura de ${a.nombre}`} className={cn(caja, "rounded-xl bg-black/30 object-cover")} />;
  }
  if (a.vista?.tipo === "texto" && grande) {
    return <pre className="max-h-28 w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-2 text-[10.5px] text-white/75">{a.vista.texto}</pre>;
  }
  return (
    <span className={cn(caja, "grid place-items-center rounded-xl")} style={pildoraFantasma(ACENTO.aurora)}>
      <IconoArchivo vista={vista} nombre={a.nombre} />
    </span>
  );
}

/* ══════════════════════════ Un archivo ══════════════════════════ */

interface PropsArchivo {
  a: EstadoTransferencia;
  modo: "lista" | "cuadricula";
  marcado: boolean;
  onMarcar: (v: boolean) => void;
  local: ResultadoInspeccion;
  ia?: { nivel: NivelInspeccion; motivo: string };
  blob?: Blob;
  onCancelar?: () => void;
}

function Archivo({ a, modo, marcado, onMarcar, local, ia, blob, onCancelar }: PropsArchivo) {
  const [abierto, setAbierto] = useState(false);
  const pendiente = a.fase === "pendiente-aceptar";
  const enCurso = a.fase === "transfiriendo" || a.fase === "verificando" || a.fase === "reintentando";
  const pct = a.trozos > 0 ? Math.min(100, Math.round((a.progreso / a.trozos) * 100)) : 0;
  const idCasilla = `envio-${a.id}`;
  const detalles = (
    <>
      {(local.hallazgos.length > 0 || ia) && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-white/70" aria-label={`Inspección de ${a.nombre}`}>
          {local.hallazgos.map((h, i) => (
            <li key={i} className="flex gap-1">
              <span aria-hidden style={{ color: h.nivel === "info" ? "rgba(255,255,255,.5)" : COLOR_NIVEL[h.nivel] }}>•</span>
              {h.texto}
            </li>
          ))}
          {ia && (
            <li className="flex gap-1">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" style={{ color: COLOR_NIVEL[ia.nivel] }} aria-hidden />
              IA: {TEXTO_NIVEL[ia.nivel].toLowerCase()}
              {ia.motivo ? ` — ${ia.motivo}` : ""}
            </li>
          )}
        </ul>
      )}
      {(a.fase === "error" || a.fase === "rechazada") && a.motivo && <p className="mt-1 text-[11px] text-white/60">{a.motivo}</p>}
    </>
  );
  const insignias = (
    <div className="flex flex-wrap items-center gap-1">
      <Pastilla color={COLOR_NIVEL[local.nivel]} titulo={local.hallazgos.map((h) => h.texto).join(" · ") || "Las heurísticas locales no ven nada raro"}>
        <IconoNivel nivel={local.nivel} />
        {TEXTO_NIVEL[local.nivel]}
        {local.conBytes && a.fase === "completada" ? " · revisado" : ""}
      </Pastilla>
      {ia && (
        <Pastilla color={COLOR_NIVEL[ia.nivel]} titulo={ia.motivo}>
          <Sparkles className="h-3 w-3" aria-hidden /> IA: {TEXTO_NIVEL[ia.nivel].toLowerCase()}
        </Pastilla>
      )}
      <span className={cn("text-[10.5px]", a.fase === "error" ? "text-[#ff8a9a]" : a.fase === "completada" ? "text-[#6ee7b7]" : "text-white/60")} role="status">
        {textoFase(a)}
      </span>
      {a.preparando && a.motivo && <span className="text-[10.5px] text-white/60">{a.motivo}</span>} {/* ARC1110A: «<neurona> está preparando el archivo…» */}
      <CifradoViasArchivo cifradoArchivo={a.cifradoArchivo} repartoVias={a.repartoVias} velocidadBps={a.velocidadBps} verificado={false} />
    </div>
  );
  const casilla = (
    <input
      id={idCasilla}
      type="checkbox"
      className="h-4 w-4 shrink-0 cursor-pointer accent-[#10B981] disabled:cursor-default disabled:opacity-30"
      checked={pendiente && marcado}
      disabled={!pendiente}
      onChange={(e) => onMarcar(e.target.checked)}
      aria-label={`Seleccionar ${a.nombre}`}
    />
  );
  const barra = enCurso && (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Progreso de ${a.nombre}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(3, pct)}%`, background: ACENTO.esmeralda }} />
    </div>
  );

  if (modo === "cuadricula") {
    return (
      <li className={cn(CLASE_ITEM, "flex flex-col gap-1.5 p-2", marcado && pendiente && "ring-1 ring-[#10B981]/60")} data-testid="archivo-envio">
        <div className="flex items-center gap-1.5">
          {casilla}
          <label htmlFor={idCasilla} className="min-w-0 flex-1 cursor-pointer truncate text-[12px] font-medium text-white" title={a.ruta ?? a.nombre}>
            {a.nombre}
          </label>
          {enCurso && onCancelar && (
            <button type="button" onClick={onCancelar} className="cursor-pointer rounded-full p-1 text-white/55 hover:text-white" aria-label={`Cancelar ${a.nombre}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <VistaArchivo a={a} blob={blob} grande />
        <p className="text-[10.5px] text-white/55">
          {tamanoLegible(a.tamano)} · {a.tipo || "sin tipo"}
        </p>
        {barra}
        {insignias}
        {detalles}
      </li>
    );
  }

  return (
    <li className={cn(CLASE_ITEM, "p-2", marcado && pendiente && "ring-1 ring-[#10B981]/60")} data-testid="archivo-envio">
      <div className="flex items-center gap-2">
        {casilla}
        <VistaArchivo a={a} blob={blob} grande={false} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <label htmlFor={idCasilla} className="block cursor-pointer truncate text-[12.5px] font-medium text-white" title={a.ruta ?? a.nombre}>
            {a.nombre}
          </label>
          <p className="truncate text-[10.5px] text-white/55">
            {tamanoLegible(a.tamano)} · {a.tipo || "sin tipo"}
          </p>
          {insignias}
        </div>
        {enCurso && onCancelar && (
          <button type="button" onClick={onCancelar} className="cursor-pointer rounded-full p-1.5 text-white/55 hover:text-white" aria-label={`Cancelar ${a.nombre}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="cursor-pointer rounded-full p-1.5 text-white/55 hover:text-white"
          aria-expanded={abierto}
          aria-label={abierto ? `Ocultar detalles de ${a.nombre}` : `Ver detalles y vista previa de ${a.nombre}`}
        >
          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {barra && <div className="mt-1.5">{barra}</div>}
      {abierto && (
        <div className="mt-2 space-y-1.5 pl-6">
          <VistaArchivo a={a} blob={blob} grande />
          {a.ruta && <p className="text-[10.5px] text-white/50">Ruta en el envío: {a.ruta}</p>}
          {a.contenido && (
            <details className="text-[10.5px] text-white/60">
              <summary className="cursor-pointer">Contenido del comprimido según el remitente ({a.contenido.length})</summary>
              <ul className="mt-1 max-h-28 overflow-auto pl-3">
                {a.contenido.map((c, i) => (
                  <li key={i} className="truncate">{c.ruta}</li>
                ))}
              </ul>
            </details>
          )}
          {detalles}
        </div>
      )}
      {!abierto && (local.nivel !== "limpio" || a.fase === "error") && detalles}
    </li>
  );
}

/* ══════════════════════════ Carpetas ══════════════════════════ */

function NodoCarpeta(p: {
  c: CarpetaEnvio;
  nivel: number;
  modo: "lista" | "cuadricula";
  seleccion: ReadonlySet<string>;
  /** Ids que aún se pueden aceptar o rechazar (la casilla de la carpeta solo toca esos). */
  pendientes: ReadonlySet<string>;
  marcar: (ids: string[], v: boolean) => void;
  render: (a: EstadoTransferencia) => ReactNode;
}) {
  const [plegada, setPlegada] = useState(false);
  const ids = idsDeCarpeta(p.c).filter((id) => p.pendientes.has(id));
  const marcados = ids.filter((id) => p.seleccion.has(id)).length;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = marcados > 0 && marcados < ids.length;
  }, [marcados, ids.length]);
  const lista = (
    <ul className={cn(p.modo === "cuadricula" ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "space-y-1.5")}>{p.c.archivos.map((a) => p.render(a))}</ul>
  );
  if (p.nivel === 0) {
    return (
      <div className="space-y-2">
        {p.c.carpetas.map((h) => (
          <NodoCarpeta key={h.ruta} {...p} c={h} nivel={1} />
        ))}
        {p.c.archivos.length > 0 && lista}
      </div>
    );
  }
  const I = plegada ? Folder : FolderOpen;
  return (
    <section className="space-y-1.5" aria-label={`Carpeta ${p.c.ruta}`}>
      <div className="flex items-center gap-2 rounded-xl px-1 py-1" style={{ marginLeft: (p.nivel - 1) * 12 }}>
        <input
          ref={ref}
          type="checkbox"
          className="h-4 w-4 cursor-pointer accent-[#10B981] disabled:cursor-default disabled:opacity-30"
          checked={ids.length > 0 && marcados === ids.length}
          disabled={ids.length === 0}
          onChange={(e) => p.marcar(ids, e.target.checked)}
          aria-label={`Seleccionar la carpeta ${p.c.ruta}`}
        />
        <button type="button" onClick={() => setPlegada((v) => !v)} className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-[12px] font-semibold text-white/85" aria-expanded={!plegada}>
          <I className="h-4 w-4 shrink-0" style={{ color: ACENTO.ambar }} aria-hidden />
          <span className="truncate">{p.c.nombre}</span>
          <span className="text-[10.5px] font-normal text-white/50">· {idsDeCarpeta(p.c).length}</span>
        </button>
      </div>
      {!plegada && (
        <div className="space-y-2" style={{ marginLeft: p.nivel * 12 }}>
          {p.c.carpetas.map((h) => (
            <NodoCarpeta key={h.ruta} {...p} c={h} nivel={p.nivel + 1} />
          ))}
          {p.c.archivos.length > 0 && lista}
        </div>
      )}
    </section>
  );
}

/* ══════════════════════════ La ventana de un envío ══════════════════════════ */

export interface AccionesEnvio {
  aceptar(ids: string[]): void;
  rechazar(ids: string[]): void;
  cancelar?(id: string): void;
  /** El archivo ya recibido y verificado (para la vista previa y la inspección con sus bytes reales). */
  blobDe?(id: string): Blob | undefined;
  inspeccionarIA?(p: PeticionInspeccionIA): Promise<ResultadoInspeccionIA>;
}

const CLAVE_MODO = "starseed.envios-entrantes.modo.v1";

function modoGuardado(): "lista" | "cuadricula" {
  try {
    return window.localStorage.getItem(CLAVE_MODO) === "cuadricula" ? "cuadricula" : "lista";
  } catch {
    return "lista";
  }
}

const BOTON = "ss-redondo inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-45";

type EstadoIA =
  | { fase: "inactiva" }
  | { fase: "preguntando" }
  | { fase: "lista"; veredicto: VeredictoIA; modelo?: string }
  | { fase: "error"; motivo: string };

export function VentanaEnvio({ envio, acciones, onMinimizar }: { envio: EnvioEntrante; acciones: AccionesEnvio; onMinimizar?: () => void }) {
  const [modo, setModo] = useState<"lista" | "cuadricula">(() => (typeof window === "undefined" ? "lista" : modoGuardado()));
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const vistos = useRef<Set<string>>(new Set());
  const [confirmarPeligro, setConfirmarPeligro] = useState(false);
  const [real, setReal] = useState<Record<string, ResultadoInspeccion>>({});
  const [panelIA, setPanelIA] = useState(false);
  const [conFragmentos, setConFragmentos] = useState(false);
  const [ia, setIA] = useState<EstadoIA>({ fase: "inactiva" });

  const pendientes = useMemo(() => new Set(idsPendientes(envio)), [envio]);
  const locales = useMemo(() => {
    const m = new Map<string, ResultadoInspeccion>();
    for (const a of envio.archivos) m.set(a.id, real[a.id] ?? inspeccionPrevia(a));
    return m;
  }, [envio.archivos, real]);
  const nivelLocal = nivelDeEnvio(Array.from(locales.values()));

  // Lo que llega se preselecciona, salvo lo marcado como peligro (nunca va solo).
  useEffect(() => {
    const nuevos = envio.archivos.filter((a) => a.fase === "pendiente-aceptar" && !vistos.current.has(a.id));
    if (!nuevos.length) return;
    for (const a of nuevos) vistos.current.add(a.id);
    setSeleccion((s) => {
      const n = new Set(s);
      for (const a of nuevos) if (locales.get(a.id)?.nivel !== "peligro") n.add(a.id);
      return n;
    });
  }, [envio.archivos, locales]);

  // Con el archivo ya aquí, la inspección se repite con sus bytes REALES.
  const blobDe = acciones.blobDe;
  const inspeccionando = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!blobDe) return;
    for (const a of envio.archivos) {
      if (a.fase !== "completada" || inspeccionando.current.has(a.id)) continue;
      const blob = blobDe(a.id);
      if (!blob) continue;
      inspeccionando.current.add(a.id);
      void inspeccionReal(a, blob)
        .then((r) => setReal((x) => ({ ...x, [a.id]: r })))
        .catch(() => undefined);
    }
  }, [envio.archivos, blobDe]);

  const marcados = Array.from(seleccion).filter((id) => pendientes.has(id));
  const conPeligro = Array.from(pendientes).filter((id) => locales.get(id)?.nivel === "peligro" || (ia.fase === "lista" && ia.veredicto.porArchivo[envio.archivos.findIndex((a) => a.id === id)]?.nivel === "peligro"));
  const iaDe = (a: EstadoTransferencia) => (ia.fase === "lista" ? ia.veredicto.porArchivo[envio.archivos.indexOf(a)] : undefined);

  const marcar = (ids: string[], v: boolean) =>
    setSeleccion((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (v) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const cambiarModo = (m: "lista" | "cuadricula") => {
    setModo(m);
    try {
      window.localStorage.setItem(CLAVE_MODO, m);
    } catch {
      /* solo comodidad */
    }
  };
  const aceptarTodos = () => {
    if (conPeligro.length && !confirmarPeligro) {
      setConfirmarPeligro(true);
      return;
    }
    setConfirmarPeligro(false);
    acciones.aceptar(Array.from(pendientes));
  };
  const preguntarIA = async () => {
    if (!acciones.inspeccionarIA) return;
    setIA({ fase: "preguntando" });
    const archivos = await Promise.all(
      envio.archivos.map(async (a) => {
        let fragmento: string | undefined;
        if (conFragmentos && vistaPrevia(a.tipo, a.nombre) === "texto") {
          const blob = blobDe?.(a.id);
          fragmento = blob ? await blob.slice(0, 500).text().catch(() => undefined) : a.vista?.tipo === "texto" ? a.vista.texto.slice(0, 500) : undefined;
        }
        return { nombre: a.nombre, ...(a.ruta ? { ruta: a.ruta } : {}), tipo: a.tipo, tamano: a.tamano, local: locales.get(a.id) ?? inspeccionPrevia(a), ...(fragmento ? { fragmento } : {}) };
      }),
    );
    const r = await acciones.inspeccionarIA({ origen: envio.origen, via: envio.via, verificacion: envio.verificacion?.texto, mensaje: envio.mensaje, archivos });
    setIA(r.ok ? { fase: "lista", veredicto: r.veredicto, ...(r.modelo ? { modelo: r.modelo } : {}) } : { fase: "error", motivo: r.motivo });
  };

  const arbol = useMemo(() => arbolDeEnvio(envio.archivos), [envio.archivos]);
  const hayCarpetas = arbol.carpetas.length > 0;
  const n = envio.archivos.length;
  // (BLE1108B) El medio y el tiempo estimado, ANTES de decidir (la velocidad medida del enlace, si la hay).
  const medioBluetooth = textoMedioEnvio({ via: envio.via, bytes: envio.bytes, kbps: kbpsBluetoothMedido() });

  return (
    <div className="flex max-h-[85dvh] min-h-0 flex-col" data-testid="ventana-envio">
      {/* Cabecera: quién, cómo se verificó, por dónde, cuánto y su mensaje. */}
      <header className="space-y-2 border-b border-white/[0.08] px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-start gap-3 pr-10">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={pildoraFantasma(ACENTO.aurora)}>
            <Inbox className="h-5 w-5 text-white/90" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[16px] font-semibold text-white">Envío de {envio.origen}</DialogTitle>
            <DialogDescription className="text-[12px] text-white/65">
              {n} archivo{n === 1 ? "" : "s"} · {tamanoLegible(envio.bytes)}
              {envio.anunciados && envio.anunciados > n ? ` · llegando ${n} de ${envio.anunciados}` : ""}
              {envio.pendientes ? ` · ${envio.pendientes} por decidir` : ""}
            </DialogDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pastilla color={envio.verificacion && envio.verificacion.tipo !== "ninguna" ? ACENTO.esmeralda : ACENTO.ambar} titulo={envio.verificacion?.huella ? `Huella ${envio.verificacion.huella}` : undefined}>
            <Fingerprint className="h-3 w-3" aria-hidden />
            {envio.verificacion?.texto ?? "Sin verificación de identidad"}
          </Pastilla>
          {envio.via && (
            <Pastilla color={ACENTO.aurora}>
              <Route className="h-3 w-3" aria-hidden />
              {envio.via}
            </Pastilla>
          )}
          {medioBluetooth && (
            <Pastilla color={ACENTO.ambar} titulo="Lo que tardará depende de lo que dé el aire entre los dos aparatos; si hay Wi-Fi directo, irá mucho más deprisa.">
              <Clock className="h-3 w-3" aria-hidden />
              {medioBluetooth}
            </Pastilla>
          )}
          <Pastilla color={COLOR_NIVEL[nivelLocal]} titulo="Heurísticas locales (sin IA)">
            <IconoNivel nivel={nivelLocal} />
            Inspección local: {TEXTO_NIVEL[nivelLocal].toLowerCase()}
          </Pastilla>
          {ia.fase === "lista" && (
            <Pastilla color={COLOR_NIVEL[ia.veredicto.nivel]} titulo={ia.modelo ? `Modelo: ${ia.modelo}` : undefined}>
              <Sparkles className="h-3 w-3" aria-hidden /> IA: {TEXTO_NIVEL[ia.veredicto.nivel].toLowerCase()}
            </Pastilla>
          )}
        </div>
        {envio.mensaje && (
          <blockquote className={cn(CLASE_ITEM, "flex gap-2 px-3 py-2 text-[12.5px] text-white/85")}>
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden />
            <span className="whitespace-pre-wrap break-words">{envio.mensaje}</span>
          </blockquote>
        )}
      </header>

      {/* Barra: seleccionar, lista/cuadrícula, inspección con IA. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-5">
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/80">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-[#10B981] disabled:opacity-30"
            disabled={pendientes.size === 0}
            checked={pendientes.size > 0 && marcados.length === pendientes.size}
            onChange={(e) => marcar(Array.from(pendientes), e.target.checked)}
          />
          Seleccionar todo ({marcados.length}/{pendientes.size})
        </label>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Vista">
          <button type="button" onClick={() => cambiarModo("lista")} aria-pressed={modo === "lista"} aria-label="Ver en lista" className={cn("cursor-pointer rounded-full p-1.5", modo === "lista" ? "bg-white/15 text-white" : "text-white/55 hover:text-white")}>
            <List className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => cambiarModo("cuadricula")} aria-pressed={modo === "cuadricula"} aria-label="Ver en cuadrícula" className={cn("cursor-pointer rounded-full p-1.5", modo === "cuadricula" ? "bg-white/15 text-white" : "text-white/55 hover:text-white")}>
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
        {acciones.inspeccionarIA && (
          <button type="button" onClick={() => setPanelIA((v) => !v)} aria-expanded={panelIA} className={BOTON} style={pildoraFantasma(ACENTO.mensajes)}>
            <Sparkles className="h-3.5 w-3.5" /> Inspeccionar con IA
          </button>
        )}
      </div>

      {panelIA && acciones.inspeccionarIA && (
        <section className={cn(CLASE_ITEM, "mx-4 mb-2 space-y-2 p-3 sm:mx-5")} aria-label="Inspección con IA">
          <p className="text-[11.5px] text-white/75">
            La IA de Astraura recibe solo un resumen: nombres, rutas, tipos, tamaños y lo que vieron las heurísticas locales. Nunca acepta nada por ti.
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-[11.5px] text-white/80">
            <input type="checkbox" className="mt-0.5 h-4 w-4 cursor-pointer accent-[#7C5CFF]" checked={conFragmentos} onChange={(e) => setConFragmentos(e.target.checked)} />
            Incluir los primeros 500 caracteres de los archivos de texto (solo los que ya tengan vista previa o hayan llegado)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void preguntarIA()} disabled={ia.fase === "preguntando"} className={BOTON} style={{ background: ACENTO.mensajes }}>
              {ia.fase === "preguntando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {ia.fase === "preguntando" ? "Inspeccionando…" : ia.fase === "lista" ? "Volver a inspeccionar" : "Preguntar a la IA"}
            </button>
            <span role="status" className="text-[11.5px] text-white/75">
              {ia.fase === "lista" && (
                <>
                  <IconoNivel nivel={ia.veredicto.nivel} className="mr-1 inline" />
                  {TEXTO_NIVEL[ia.veredicto.nivel]}
                  {ia.veredicto.resumen ? `: ${ia.veredicto.resumen}` : ""}
                </>
              )}
              {ia.fase === "error" && ia.motivo}
            </span>
          </div>
        </section>
      )}

      {/* Archivos: carpetas (rutas relativas) y archivos, en lista o cuadrícula. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 sm:px-5" aria-label="Archivos del envío">
        {hayCarpetas ? (
          <NodoCarpeta
            c={arbol}
            nivel={0}
            modo={modo}
            seleccion={seleccion}
            pendientes={pendientes}
            marcar={marcar}
            render={(a) => (
              <Archivo key={a.id} a={a} modo={modo} marcado={seleccion.has(a.id)} onMarcar={(v) => marcar([a.id], v)} local={locales.get(a.id) as ResultadoInspeccion} ia={iaDe(a)} blob={blobDe?.(a.id)} onCancelar={acciones.cancelar ? () => acciones.cancelar?.(a.id) : undefined} />
            )}
          />
        ) : (
          <ul className={cn(modo === "cuadricula" ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "space-y-1.5")}>
            {envio.archivos.map((a) => (
              <Archivo key={a.id} a={a} modo={modo} marcado={seleccion.has(a.id)} onMarcar={(v) => marcar([a.id], v)} local={locales.get(a.id) as ResultadoInspeccion} ia={iaDe(a)} blob={blobDe?.(a.id)} onCancelar={acciones.cancelar ? () => acciones.cancelar?.(a.id) : undefined} />
            ))}
          </ul>
        )}
      </div>

      {/* Decisión. */}
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] px-4 py-3 sm:px-5">
        {pendientes.size > 0 ? (
          <>
            {onMinimizar && (
              <button type="button" onClick={onMinimizar} className={cn(BOTON, "mr-auto text-white/80")} style={pildoraFantasma("#ffffff", false)}>
                <Minimize2 className="h-3.5 w-3.5" /> Más tarde
              </button>
            )}
            <button type="button" onClick={() => acciones.rechazar(Array.from(pendientes))} className={BOTON} style={{ background: "rgba(255,255,255,.14)" }}>
              <X className="h-3.5 w-3.5" /> Rechazar todos
            </button>
            <button type="button" disabled={marcados.length === 0} onClick={() => acciones.aceptar(marcados)} className={BOTON} style={pildoraFantasma(ACENTO.esmeralda)}>
              <Check className="h-3.5 w-3.5" /> Aceptar seleccionados ({marcados.length})
            </button>
            <button type="button" onClick={aceptarTodos} className={BOTON} style={{ background: confirmarPeligro ? ACENTO.carmesi : ACENTO.esmeralda }}>
              <Check className="h-3.5 w-3.5" />
              {confirmarPeligro ? `Confirmar: aceptar también ${conPeligro.length} con peligro` : "Aceptar todos"}
            </button>
          </>
        ) : (
          <p className="mr-auto text-[12px] text-white/70" role="status">
            {envio.enCurso ? `Recibiendo ${envio.enCurso}…` : "Listo"}
            {envio.completados ? ` · ${envio.completados} verificado${envio.completados === 1 ? "" : "s"}` : ""}
            {envio.fallidos ? ` · ${envio.fallidos} con error` : ""}
            {envio.rechazados ? ` · ${envio.rechazados} rechazado${envio.rechazados === 1 ? "" : "s"}` : ""}
          </p>
        )}
      </footer>
    </div>
  );
}

/* ══════════════════════════ Montaje global ══════════════════════════ */

/**
 * EnviosEntrantes — la ventana del envío que espera respuesta (se abre sola al llegar) y, para los
 * que esperan detrás o se dejaron para «Más tarde», una pastilla flotante para volver a abrirlos.
 * El progreso sigue en la ventana tras aceptar, hasta que se cierra.
 */
export function EnviosEntrantes({ motor, transferencias }: { motor: MotorArchivos; transferencias: readonly EstadoTransferencia[] }) {
  const envios = useMemo(() => agruparEnvios(transferencias), [transferencias]);
  const porDecidir = useMemo(() => enviosPorDecidir(envios), [envios]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aplazados, setAplazados] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (abierto) return;
    const siguiente = porDecidir.find((e) => !aplazados.has(e.clave));
    if (siguiente) setAbierto(siguiente.clave);
  }, [abierto, porDecidir, aplazados]);

  const envio = abierto ? envios.find((e) => e.clave === abierto) ?? null : null;
  const acciones = useMemo<AccionesEnvio>(
    () => ({
      aceptar: (ids) => ids.forEach((id) => motor.aceptarOferta(id)),
      rechazar: (ids) => ids.forEach((id) => motor.rechazarOferta(id, "Rechazado por quien lo recibe.")),
      cancelar: (id) => motor.cancelar(id),
      blobDe: (id) => motor.blobRecibido(id),
      inspeccionarIA: async (p) => (await import("@/lib/network/inspeccion-ia")).inspeccionarEnvioConIA(p),
    }),
    [motor],
  );
  const aplazar = (clave: string) => {
    setAplazados((s) => new Set(s).add(clave));
    setAbierto(null);
  };
  const esperando = porDecidir.filter((e) => e.clave !== abierto);

  return (
    <>
      {envio && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (o) return;
            if (envio.pendientes > 0) aplazar(envio.clave);
            else setAbierto(null);
          }}
        >
          <DialogContent className="w-[96vw] max-w-3xl gap-0 border-white/10 p-0 sm:rounded-[22px]">
            <VentanaEnvio envio={envio} acciones={acciones} onMinimizar={() => aplazar(envio.clave)} />
          </DialogContent>
        </Dialog>
      )}
      {esperando.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
          {esperando.slice(0, 3).map((e) => (
            <button
              key={e.clave}
              type="button"
              onClick={() => {
                setAplazados((s) => {
                  const n = new Set(s);
                  n.delete(e.clave);
                  return n;
                });
                setAbierto(e.clave);
              }}
              className="pointer-events-auto flex w-full max-w-[380px] cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-[rgba(12,14,34,0.82)] px-3 py-2 text-left shadow-lg backdrop-blur-[20px]"
            >
              <Inbox className="h-4 w-4 shrink-0" style={{ color: ACENTO.aurora }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-white">Envío de {e.origen}</span>
                <span className="block truncate text-[10.5px] text-white/60">
                  {e.pendientes} de {e.archivos.length} por decidir · {tamanoLegible(e.bytes)}
                </span>
              </span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={pildoraFantasma(ACENTO.esmeralda)}>
                Revisar
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
