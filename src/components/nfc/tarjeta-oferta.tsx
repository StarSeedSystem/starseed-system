"use client";

import { ArrowUpRight, BadgeCheck, Ban, Clock, Megaphone, ShieldQuestion } from "lucide-react";
import { accionPrincipalPorTipo, caducada, esComercialNoSolicitada, puedeBloquearEmisor, type TarjetaOferta, type TipoTarjetaOferta } from "@/lib/nfc/tarjetas-oferta";

/** Nombre legible de cada tipo de tarjeta del contrato §13. */
export const NOMBRE_TIPO_TARJETA: Record<TipoTarjetaOferta, string> = {
  presentacion: "Presentación", amistad: "Amistad", evento: "Evento", pagina: "Página",
  grupo: "Grupo", partido: "Partido", perfil: "Perfil", cuenta: "Cuenta",
  cerebro: "Cerebro", repositorio: "Repositorio", archivo: "Archivo", app: "App",
  programa: "Programa", enlace_libre: "Enlace libre",
};

const ETIQUETA_ACCION: Record<string, string> = {
  anadir_contacto: "Añadir a contactos", registrar_entrada_evento: "Registrar entrada al evento",
  abrir_enlace: "Abrir enlace", invitar_grupo: "Ver grupo", ver_perfil: "Ver perfil",
  ver_cuenta: "Ver cuenta", abrir_cerebro: "Abrir cerebro", abrir_repositorio: "Abrir repositorio",
  abrir_archivo: "Abrir archivo", abrir_app: "Abrir app", abrir_programa: "Abrir programa",
};

/** Texto humano de la acción principal; «Abrir» si el tipo trae una acción desconocida. */
export function etiquetaAccionPrincipal(accion: string): string {
  return ETIQUETA_ACCION[accion] ?? "Abrir";
}

/** URL de destino declarada en el contenido libre de la tarjeta, si la hay. */
export function enlaceDeTarjeta(tarjeta: TarjetaOferta): string | undefined {
  const url = tarjeta.contenido.url;
  return typeof url === "string" && url.trim().length > 0 ? url : undefined;
}

export interface ResumenTarjetaOferta {
  accion: string; etiquetaAccion: string; firmada: boolean; caducada: boolean;
  comercial: boolean; puedeBloquear: boolean; caducidadTexto: string | null;
}

/** Deriva todo lo que la tarjeta enseña (acción, firma, vigencia y aviso comercial). */
export function resumenTarjetaOferta(tarjeta: TarjetaOferta, ahora: number): ResumenTarjetaOferta {
  const accion = accionPrincipalPorTipo(tarjeta.tipo);
  return {
    accion, etiquetaAccion: etiquetaAccionPrincipal(accion),
    firmada: typeof tarjeta.firma === "string" && tarjeta.firma.length > 0,
    caducada: caducada(tarjeta, ahora), comercial: esComercialNoSolicitada(tarjeta),
    puedeBloquear: puedeBloquearEmisor(tarjeta),
    caducidadTexto: tarjeta.caducidad ? new Date(tarjeta.caducidad).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }) : null,
  };
}

export interface NotificacionTarjetaOferta {
  titulo: string; cuerpo: string; accion: string; href?: string;
}

/** Notificación de recepción con su acción principal; `null` si la tarjeta ya caducó. */
export function notificacionDeTarjetaOferta(tarjeta: TarjetaOferta, ahora: number): NotificacionTarjetaOferta | null {
  if (caducada(tarjeta, ahora)) return null;
  const tipo = NOMBRE_TIPO_TARJETA[tarjeta.tipo];
  const comercial = esComercialNoSolicitada(tarjeta);
  const href = enlaceDeTarjeta(tarjeta);
  return {
    titulo: `${tarjeta.emisor} te envió una tarjeta`,
    cuerpo: comercial ? `${tarjeta.titulo} · ${tipo}. Parece publicidad no pedida: puedes bloquear al emisor.` : `${tarjeta.titulo} · ${tipo}`,
    accion: accionPrincipalPorTipo(tarjeta.tipo),
    ...(href ? { href } : {}),
  };
}

interface Props {
  tarjeta: TarjetaOferta;
  /** Reloj para decidir vigencia; por defecto, ahora. */
  ahora?: number;
  onAccion?: (accion: string, tarjeta: TarjetaOferta) => void; onBloquearEmisor?: (emisor: string) => void;
}

/** Tarjeta recibida al vincularse: firma, vigencia, acción principal y bloqueo del emisor. */
export function TarjetaOfertaDisplay({ tarjeta, ahora = Date.now(), onAccion, onBloquearEmisor }: Props) {
  const r = resumenTarjetaOferta(tarjeta, ahora);
  const descripcion = typeof tarjeta.contenido.descripcion === "string" ? tarjeta.contenido.descripcion : null;
  const href = enlaceDeTarjeta(tarjeta);
  return (
    <article data-testid="tarjeta-oferta" className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/85 backdrop-blur">
      <svg aria-hidden className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 text-sky-300/20" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx="26" cy="32" r="20" /><circle cx="38" cy="32" r="20" />
      </svg>
      <header className="relative flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[11px] font-medium text-sky-100">{NOMBRE_TIPO_TARJETA[tarjeta.tipo]}</span>
        <span className={"flex items-center gap-1 text-[11px] " + (r.firmada ? "text-emerald-200" : "text-amber-200")}>
          {r.firmada ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> : <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />}
          {r.firmada ? "Firmada por el emisor" : "Sin firma"}
        </span>
        {r.caducidadTexto && (
          <span className={"flex items-center gap-1 text-[11px] " + (r.caducada ? "text-red-200" : "text-white/55")}>
            <Clock className="h-3.5 w-3.5" aria-hidden />{r.caducada ? "Caducada" : `Válida hasta ${r.caducidadTexto}`}
          </span>
        )}
      </header>
      <h3 className="relative mt-2 font-semibold text-white">{tarjeta.titulo}</h3>
      <p className="relative text-xs text-white/60">De {tarjeta.emisor}</p>
      {descripcion && <p className="relative mt-1 text-xs text-white/75">{descripcion}</p>}
      {href && <p className="relative mt-1 truncate text-xs text-sky-200">{href}</p>}
      {r.comercial && (
        <div role="alert" data-testid="tarjeta-oferta-comercial" className="relative mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">
          <p className="flex items-center gap-1 font-medium"><Megaphone className="h-3.5 w-3.5" aria-hidden /> Publicidad no pedida</p>
          <p className="mt-1 text-amber-100/80">Esta tarjeta parece comercial. Puedes bloquear a {tarjeta.emisor} para no recibir más.</p>
          {r.puedeBloquear && (
            <button type="button" data-testid="tarjeta-oferta-bloquear" onClick={() => onBloquearEmisor?.(tarjeta.emisor)} className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-full border border-amber-300/50 px-2.5 py-1 font-medium text-amber-50 transition-colors hover:bg-amber-300/15">
              <Ban className="h-3.5 w-3.5" aria-hidden /> Bloquear emisor
            </button>
          )}
        </div>
      )}
      <footer className="relative mt-3">
        <button type="button" data-testid="tarjeta-oferta-accion" disabled={r.caducada} onClick={() => onAccion?.(r.accion, tarjeta)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/15 px-3 py-1.5 font-medium text-sky-100 transition-colors hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-50">
          <ArrowUpRight className="h-4 w-4" aria-hidden /> {r.etiquetaAccion}
        </button>
      </footer>
    </article>
  );
}

export default TarjetaOfertaDisplay;
