'use client';
/**
 * HFR1018K · Ventana «Estudio de vídeo» (Ola 1018H · Superficies).
 * Lista de capas y línea de tiempo leídas de los atributos data-* de la composición,
 * panel de propiedades que emite órdenes de `operaciones-sdk.ts` y vista previa con
 * `<hyperframes-player>` del servicio local (127.0.0.1:4490; contrato
 * `architecture/video-hyperframes.md` §4). Red y reloj INYECTADOS; sin composición
 * o sin servicio hay mensaje claro y botón «Abrir en otra neurona», nunca un bucle.
 * El reproductor custom element se crea con `createElement` (patrón de `avatar-3d.tsx`).
 */
import * as React from "react";
import { operacionASdkOrder, type SdkOrder } from "@/lib/video-html/operaciones-sdk";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import type { Operacion, ValorParametro } from "@/lib/protomolecula/tipos";

/** Servicio local de la neurona: SOLO 127.0.0.1; jamás escucha fuera de la máquina. */
export const SERVICIO_URL_DEFECTO = "http://127.0.0.1:4490";

/** Un clip de la composición (los `div.clip` con data-*). */
export interface CapaVideo {
  id: string;
  pista: number;
  inicio: number;
  duracion: number;
}

/** Capas de una composición, ordenadas por pista y momento de entrada. PURA. */
export function capasDeComposicion(html: string): CapaVideo[] {
  const capas: CapaVideo[] = [];
  for (const e of html.match(/<div\b[^>]*>/g) ?? []) {
    if (!/\bclip\b/.test(e.match(/class="([^"]*)"/)?.[1] ?? "")) continue;
    const numero = (nombre: string): number => {
      const v = parseFloat(e.match(new RegExp(`${nombre}="([^"]*)"`))?.[1] ?? "");
      return Number.isFinite(v) ? v : 0;
    };
    capas.push({
      id: e.match(/id="([^"]*)"/)?.[1] || "clip",
      pista: numero("data-track-index"),
      inicio: numero("data-start"),
      duracion: numero("data-duration"),
    });
  }
  return capas.sort((a, b) => a.pista - b.pista || a.inicio - b.inicio);
}

/** Borrador del panel de propiedades (strings: los números llegan del formulario). */
export interface EdicionVideo {
  texto?: string;
  color?: string;
  inicio?: string;
  duracion?: string;
}

/* ── Órdenes hacia el SDK (puras) ──────────────────────────────────────── */
const opDe = (parte: string, propiedad: string, valor: ValorParametro, t: number): Operacion => ({
  id: `estudio-${parte}-${propiedad}-${t}`,
  objetivo: { atomoId: "video-html", parametroId: `${parte}::${propiedad}` },
  accion: { tipo: "exacta", valor },
  autor: { tipo: "persona", id: "local" },
  origen: "mano",
  t,
});

/** Texto/color → Operación del OS (origen «mano») y su orden del SDK. PURA. */
export function edicionDePropiedad(
  parte: string,
  propiedad: string,
  valor: string,
  t: number,
): { orden: SdkOrder; operacion: Operacion } {
  const o = opDe(parte, propiedad, valor, t);
  return { orden: operacionASdkOrder(o), operacion: o };
}

/** Inicio y duración → orden `setTiming` directa del SDK. PURA. */
export function ordenTiempos(parte: string, inicio: number, duracion: number): SdkOrder {
  return { type: "setTiming", target: parte, start: inicio, duration: duracion };
}

/* ── La ventana ────────────────────────────────────────────────────────── */
export interface PropsVentanaVideo {
  /** HTML de la composición abierta; vacío = no hay composición. */
  composicion?: string;
  servicioUrl?: string;
  /** Red inyectada; por defecto el `fetch` del navegador. */
  pedir?: (url: string) => Promise<{ ok: boolean }>;
  reloj?: () => number;
  alOrden?: (orden: SdkOrder, operacion?: Operacion) => void;
  alAbrirEnOtraNeurona?: () => void;
}

const PEDIR_DEFECTO = (url: string) => fetch(url);

export function EstudioVideoVentana(props: PropsVentanaVideo) {
  const { composicion = "", servicioUrl = SERVICIO_URL_DEFECTO, pedir = PEDIR_DEFECTO, reloj = () => Date.now(), alOrden, alAbrirEnOtraNeurona } = props;
  const [servicio, ponServicio] = React.useState<"buscando" | "vivo" | "caido">("buscando");
  React.useEffect(() => {
    let vivo = true;
    ponServicio("buscando");
    pedir(`${servicioUrl}/salud`)
      .then((r) => { if (vivo) ponServicio(r.ok ? "vivo" : "caido"); })
      .catch(() => { if (vivo) ponServicio("caido"); });
    return () => { vivo = false; };
  }, [pedir, servicioUrl]);
  // <hyperframes-player> se lo sirve el servicio local: el script del reproductor
  // llega al encenderse el servicio y con una composición abierta (limpio al apagarse).
  const idComposicion = composicion.match(/data-composition-id="([^"]+)"/)?.[1] ?? "main";
  React.useEffect(() => {
    if (servicio !== "vivo" || !composicion) return;
    const script = document.createElement("script");
    script.src = `${servicioUrl}/player.js`;
    script.async = true;
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [servicio, servicioUrl, composicion]);
  const capas = React.useMemo(() => capasDeComposicion(composicion), [composicion]);
  // El motivo no vacío solo existe con GSAP (licencia, §2): aviso, no bloqueo.
  const avisoGsap = React.useMemo(() => detectarAdaptadores(composicion).motivo, [composicion]);
  const fin = Math.max(1, ...capas.map((c) => c.inicio + c.duracion));
  const [elegida, ponElegida] = React.useState<string | null>(null);
  const [borrador, ponBorrador] = React.useState<EdicionVideo>({});
  const capa = capas.find((c) => c.id === elegida) ?? null;
  const elegir = (id: string, c: CapaVideo) => {
    ponElegida(id);
    ponBorrador({ inicio: String(c.inicio), duracion: String(c.duracion) });
  };
  const aplicar = () => {
    if (!capa || !alOrden) return;
    const t = reloj();
    const ediciones: { orden: SdkOrder; operacion?: Operacion }[] = [];
    if (borrador.texto?.trim()) ediciones.push(edicionDePropiedad(capa.id, "textContent", borrador.texto.trim(), t));
    if (borrador.color?.trim()) ediciones.push(edicionDePropiedad(capa.id, "style.color", borrador.color.trim(), t));
    const i = Number(borrador.inicio);
    const d = Number(borrador.duracion);
    if (borrador.inicio && borrador.duracion && Number.isFinite(i) && Number.isFinite(d) && i >= 0 && d > 0) {
      ediciones.push({ orden: ordenTiempos(capa.id, i, d) });
    }
    for (const e of ediciones) alOrden(e.orden, e.operacion);
    ponBorrador({ inicio: borrador.inicio, duracion: borrador.duracion });
  };
  const bonito = "cursor-pointer rounded-md border px-2 py-1.5";
  return (
    <div aria-label="Estudio de vídeo" className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estudio de vídeo</span>
        <span data-testid="estado-servicio" className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
          {servicio === "vivo" ? "Servicio vivo" : servicio === "caido" ? "Servicio caído" : "Buscando el servicio…"}
        </span>
      </div>
      {/* GSAP: se reproduce, pero su animación no se edita ni genera (licencia, §2). */}
      {avisoGsap && (
        <p role="status" data-testid="aviso-gsap" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">{avisoGsap}</p>
      )}
      {servicio === "caido" ? (
        <div data-testid="sin-servicio" className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-border bg-black/20 p-3 text-center">
          <p className="max-w-[260px] leading-relaxed text-muted-foreground">
            El servicio HyperFrames no responde en esta neurona (127.0.0.1:4490). No hay nada roto: abre el estudio en una neurona con el servicio encendido.
          </p>
          <button type="button" onClick={alAbrirEnOtraNeurona} className={`${bonito} border-primary/40 bg-primary/10 hover:bg-primary/20 min-h-[44px]`}>
            Abrir en otra neurona
          </button>
        </div>
      ) : !composicion ? (
        <p data-testid="sin-composicion" className="flex flex-1 items-center justify-center text-center text-muted-foreground">
          No hay composición abierta. Compón desde la Protomolécula (átomo «video-html») o abre una del proyecto.
        </p>
      ) : (
        <>
          {servicio === "vivo" && React.createElement("hyperframes-player", {
            "data-testid": "vista-previa",
            src: `${servicioUrl}/vista/${idComposicion}`,
            class: "aspect-video w-full rounded-md border border-border bg-black/60",
          })}
          <ul aria-label="Capas" data-testid="lista-capas" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {capas.map((c) => (
              <li key={c.id}>
                <button type="button" data-testid={`capa-${c.id}`} onClick={() => elegir(c.id, c)}
                  className={`min-h-[44px] w-full rounded-md border px-2 text-left transition ${bonito} ${elegida === c.id ? "border-primary/60 bg-primary/10" : "border-border hover:bg-white/5"}`}>
                  <span className="font-medium">{c.id}</span>
                  <span className="float-right font-mono text-[10px] text-muted-foreground">{c.inicio}s · {c.duracion}s · pista {c.pista}</span>
                  {/* Línea de tiempo simple: la barra pesa su trozo del total que dura la composición. */}
                  <span className="relative mt-1 block h-1.5 rounded-full bg-white/10">
                    <span className="absolute inset-y-0 rounded-full bg-primary" style={{ left: `${(c.inicio / fin) * 100}%`, width: `${Math.max(4, (c.duracion / fin) * 100)}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {capa && (
            <div data-testid="panel-propiedades" className="grid grid-cols-2 gap-2 rounded-md border border-border bg-black/20 p-2">
              <p className="col-span-2 text-[10px] uppercase tracking-wider text-muted-foreground">Propiedades de «{capa.id}»</p>
              <label className="flex flex-col gap-1">Texto<input data-testid="prop-texto" value={borrador.texto ?? ""} onChange={(e) => ponBorrador({ ...borrador, texto: e.target.value })} className="rounded-md border border-border bg-black/30 px-2 py-1.5" /></label>
              <label className="flex flex-col gap-1">Color<input data-testid="prop-color" value={borrador.color ?? ""} placeholder="#00F0FF" onChange={(e) => ponBorrador({ ...borrador, color: e.target.value })} className="rounded-md border border-border bg-black/30 px-2 py-1.5" /></label>
              <label className="flex flex-col gap-1">Inicio (s)<input data-testid="prop-inicio" type="number" min={0} value={borrador.inicio ?? ""} onChange={(e) => ponBorrador({ ...borrador, inicio: e.target.value })} className="rounded-md border border-border bg-black/30 px-2 py-1.5" /></label>
              <label className="flex flex-col gap-1">Duración (s)<input data-testid="prop-duracion" type="number" min={0} value={borrador.duracion ?? ""} onChange={(e) => ponBorrador({ ...borrador, duracion: e.target.value })} className="rounded-md border border-border bg-black/30 px-2 py-1.5" /></label>
              <button type="button" data-testid="aplicar" onClick={aplicar} disabled={!alOrden}
                className={`${bonito} col-span-2 border-primary/60 bg-primary/20 hover:bg-primary/30 min-h-[44px] disabled:cursor-not-allowed disabled:opacity-50`}>
                Aplicar cambios
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
