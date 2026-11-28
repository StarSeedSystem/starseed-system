"use client";

import { AlertTriangle, Ban, CalendarClock, CheckCircle2, ExternalLink, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accionPrincipalPorTipo, caducada, puedeBloquearEmisor, type TarjetaOferta as DatosTarjetaOferta, type TipoTarjetaOferta } from "@/lib/nfc/tarjetas-oferta";

export type AccionPrincipalTarjeta = ReturnType<typeof accionPrincipalPorTipo>;

export const NOMBRE_TIPO_TARJETA: Record<TipoTarjetaOferta, string> = {
  presentacion: "Presentación o amistad", amistad: "Presentación o amistad", evento: "Evento", pagina: "Página",
  grupo: "Grupo", partido: "Partido", perfil: "Perfil", cuenta: "Cuenta", cerebro: "Cerebro",
  repositorio: "Repositorio", archivo: "Archivo", app: "App", programa: "Programa", enlace_libre: "Enlace libre",
};

export const NOMBRE_ACCION_TARJETA: Record<AccionPrincipalTarjeta, string> = {
  anadir_contacto: "Guardar en contactos", registrar_entrada_evento: "Registrar entrada", abrir_enlace: "Abrir enlace",
  invitar_grupo: "Unirse al grupo", ver_perfil: "Ver perfil", ver_cuenta: "Ver cuenta", abrir_cerebro: "Abrir cerebro",
  abrir_repositorio: "Abrir repositorio", abrir_archivo: "Abrir archivo", abrir_app: "Abrir app", abrir_programa: "Abrir programa",
};

export interface EstadoTarjetaOferta { caducada: boolean; comercial: boolean; bloqueable: boolean; }

export function etiquetaTipoTarjeta(tipo: TipoTarjetaOferta): string {
  return NOMBRE_TIPO_TARJETA[tipo] ?? "Tarjeta";
}

export function etiquetaAccionTarjeta(tipo: TipoTarjetaOferta): string {
  return NOMBRE_ACCION_TARJETA[accionPrincipalPorTipo(tipo)];
}

export function estadoTarjeta(tarjeta: DatosTarjetaOferta, ahora: number): EstadoTarjetaOferta {
  return { caducada: caducada(tarjeta, ahora), comercial: tarjeta.marcaComercial === true, bloqueable: puedeBloquearEmisor(tarjeta) };
}

export function textoVigencia(tarjeta: DatosTarjetaOferta, ahora: number): string {
  if (tarjeta.caducidad === undefined) return "Sin caducidad";
  if (caducada(tarjeta, ahora)) return "Caducada";
  return "Vigente hasta el " + new Date(tarjeta.caducidad).toISOString().slice(0, 10);
}

export function textoFirma(tarjeta: DatosTarjetaOferta, verificada?: boolean): string {
  if (!tarjeta.firma) return "Sin firma";
  if (verificada === true) return "Firma verificada";
  if (verificada === false) return "Firma no verificada";
  return "Firmada por el emisor";
}

export interface Props {
  tarjeta: DatosTarjetaOferta; ahora?: number; firmaVerificada?: boolean;
  onAccion?: (tarjeta: DatosTarjetaOferta) => void; onBloquear?: (emisor: string) => void; onCerrar?: () => void;
}

const PILDORA = "flex items-center gap-1 rounded-full border px-2 py-1 ";

export function TarjetaOferta({ tarjeta, ahora = Date.now(), firmaVerificada, onAccion, onBloquear, onCerrar }: Props) {
  const estado = estadoTarjeta(tarjeta, ahora);
  const IconoFirma = !tarjeta.firma ? ShieldCheck : firmaVerificada === false ? AlertTriangle : CheckCircle2;
  return (
    <section data-testid="tarjeta-oferta" role="status" aria-label={"Tarjeta recibida: " + tarjeta.titulo}
      className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
      <MotivoSemilla />
      <header className="relative flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider opacity-60">{etiquetaTipoTarjeta(tarjeta.tipo)}</p>
          <h3 className="truncate text-base font-medium">{tarjeta.titulo}</h3>
          <p className="truncate text-xs opacity-70">De {tarjeta.emisor}</p>
        </div>
        {onCerrar && (
          <Button variant="ghost" size="icon" className="cursor-pointer" aria-label="Cerrar tarjeta" onClick={onCerrar}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </header>
      <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span data-testid="tarjeta-oferta-vigencia" className={PILDORA + (estado.caducada ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-white/10 bg-white/5 opacity-80")}>
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{textoVigencia(tarjeta, ahora)}
        </span>
        <span data-testid="tarjeta-oferta-firma" className={PILDORA + (firmaVerificada === false ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-white/10 bg-white/5 opacity-80")}>
          <IconoFirma className="h-3.5 w-3.5" aria-hidden="true" />{textoFirma(tarjeta, firmaVerificada)}
        </span>
      </div>
      {estado.comercial && (
        <p data-testid="tarjeta-oferta-marca-comercial" role="alert" className="relative mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>No solicitada: esta tarjeta es comercial o publicitaria. Puedes bloquear a su emisor.</span>
        </p>
      )}
      <footer className="relative mt-4 flex flex-wrap gap-2">
        <Button data-testid="tarjeta-oferta-accion" className="cursor-pointer" disabled={estado.caducada} onClick={() => onAccion?.(tarjeta)}>
          <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />{etiquetaAccionTarjeta(tarjeta.tipo)}
        </Button>
        {estado.bloqueable && (
          <Button data-testid="tarjeta-oferta-bloquear" variant="outline" className="cursor-pointer" onClick={() => onBloquear?.(tarjeta.emisor)}>
            <Ban className="mr-1 h-4 w-4" aria-hidden="true" />Bloquear emisor
          </Button>
        )}
      </footer>
    </section>
  );
}

function MotivoSemilla() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 opacity-10" viewBox="0 0 100 100" fill="none" stroke="currentColor">
      <circle cx="50" cy="50" r="14" />
      {[0, 60, 120, 180, 240, 300].map((g) => (
        <circle key={g} cx={50 + 14 * Math.cos((g * Math.PI) / 180)} cy={50 + 14 * Math.sin((g * Math.PI) / 180)} r="14" />
      ))}
    </svg>
  );
}
