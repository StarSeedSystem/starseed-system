"use client";

/*
 * DonacionesEstado — el estado de las donaciones de MetaGeminis (2026-10-10).
 * Las donaciones entran por enlaces de pago de Stripe de la cuenta de Alex; un enlace solo se comparte si un dueño lo
 * confirma, y aquí solo se guardan importe y estado (Stripe conserva los datos de quien dona). Las cifras son las
 * donaciones CONFIRMADAS por Stripe, nunca estimaciones.
 */

import { useState } from "react";
import { BadgeCheck, HandCoins, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { direccionSegura, fechaCorta, formatearImporte, resumenDonaciones } from "@/lib/metageminis/cola";
import type { RespuestaOp } from "@/lib/metageminis/datos";
import type { Donacion, EnlacePago } from "@/lib/metageminis/tipos";
import { AvisoSinTabla } from "./aviso-sin-tabla";

interface Props {
  donaciones: readonly Donacion[];
  enlaces: readonly EnlacePago[];
  sinTablaDonaciones: boolean;
  sinTablaEnlaces: boolean;
  esDueno: boolean;
  confirmar: (id: string, activo: boolean) => Promise<RespuestaOp>;
  alCambiar?: () => void;
}

export function DonacionesEstado({ donaciones, enlaces, sinTablaDonaciones, sinTablaEnlaces, esDueno, confirmar, alCambiar }: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const resumen = resumenDonaciones(donaciones);
  const monedas = Object.entries(resumen.totales);

  const cambiar = async (e: EnlacePago, activo: boolean) => {
    setOcupado(e.id);
    const r = await confirmar(e.id, activo);
    setOcupado(null);
    if (r.ok) {
      toast.success(activo ? "Enlace confirmado." : "Enlace retirado.");
      alCambiar?.();
    } else toast.error(r.motivo ?? "No se pudo completar.");
  };

  return (
    <div className="space-y-4" data-testid="donaciones-estado">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-start gap-2">
          <HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0 space-y-1 text-xs text-white/65">
            {sinTablaDonaciones ? (
              <AvisoSinTabla que="Donaciones confirmadas" tabla="metageminis_donaciones" />
            ) : monedas.length === 0 ? (
              <p data-testid="donaciones-total">Aún no hay donaciones confirmadas por Stripe.</p>
            ) : (
              <p data-testid="donaciones-total" className="text-sm text-white">
                {monedas.map(([m, v]) => formatearImporte(v, m)).join(" + ")}{" "}
                <span className="text-xs text-white/50">
                  en {resumen.confirmadas} {resumen.confirmadas === 1 ? "donación confirmada" : "donaciones confirmadas"}
                  {resumen.reembolsadas ? `, ${resumen.reembolsadas} reembolsada${resumen.reembolsadas === 1 ? "" : "s"} (ya descontada${resumen.reembolsadas === 1 ? "" : "s"})` : ""}
                </span>
              </p>
            )}
            <p className="text-[11px] text-white/45">
              Solo cuentan las donaciones que Stripe confirma. De quien dona no se guarda nada personal aquí: Stripe lo conserva en la cuenta de Alex.
            </p>
          </div>
        </div>
      </div>

      <section aria-labelledby="mg-enlaces" className="space-y-2">
        <h4 id="mg-enlaces" className="text-sm font-semibold text-white">
          Enlaces de pago <span className="text-white/45">({enlaces.length})</span>
        </h4>
        {sinTablaEnlaces ? (
          <AvisoSinTabla que="Enlaces de pago" tabla="metageminis_enlaces_pago" />
        ) : enlaces.length === 0 ? (
          <p className="rounded-xl border border-white/10 p-3 text-xs text-white/60">
            Todavía no hay enlaces. Alex crea el enlace de donación en su Stripe (pasos exactos en el contrato) y lo registra aquí; hasta que un dueño lo confirme,
            MetaGeminis no lo comparte en ningún mensaje.
          </p>
        ) : (
          <ul className="space-y-2">
            {enlaces.map((e) => {
              const url = direccionSegura(e.url);
              return (
                <li key={e.id} data-testid="enlace-pago" data-activo={e.activo} className="space-y-1.5 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{e.nombre}</span>
                    <Badge variant="outline" className={cn("text-[10px]", e.activo ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200")}>
                      {e.activo ? "Confirmado" : "Sin confirmar: no se comparte"}
                    </Badge>
                  </div>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-cyan-200 underline-offset-2 hover:underline">
                      {url}
                    </a>
                  ) : null}
                  <p className="text-[11px] text-white/45">
                    {e.moneda.toUpperCase()}
                    {e.minimo_minor ? ` · mínimo ${formatearImporte(e.minimo_minor, e.moneda)}` : ""}
                    {e.activo && e.confirmado_en ? ` · confirmado el ${fechaCorta(e.confirmado_en)}` : ""}
                  </p>
                  {esDueno ? (
                    <Button
                      size="sm"
                      variant={e.activo ? "outline" : "default"}
                      className="cursor-pointer gap-1"
                      disabled={ocupado !== null}
                      onClick={() => void cambiar(e, !e.activo)}
                    >
                      {ocupado === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : e.activo ? <ShieldOff className="h-3.5 w-3.5" aria-hidden /> : <BadgeCheck className="h-3.5 w-3.5" aria-hidden />}
                      {e.activo ? "Retirar" : "Confirmar enlace"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
