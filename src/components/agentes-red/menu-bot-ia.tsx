"use client";
/**
 * Menú de la tarjeta de un bot (Ola 1025U · U3): «Bloquear este bot» y «Ocultar los bots de aquí». Se pinta SOLO
 * junto a lo que publicó o comentó un bot de IA. Bloquear es de esta persona: el bot sigue en la entidad para
 * los demás, y se puede deshacer al instante (aviso con «Deshacer») o desde el ajuste «Bots de IA».
 */
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Ban, EyeOff, MoreHorizontal, Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { bloquearBot, desbloquearBot, fijarModoEntidad, type EntidadFiltro } from "@/lib/agentes-red/bloqueo-bots";
import type { MarcaBot } from "@/lib/agentes-red/marca-bot";

const item =
  "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/85 " +
  "transition-colors duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70";

export function MenuBotIA({
  marca, entidad, nombreEntidad,
}: {
  marca: MarcaBot;
  /** Dónde se ve esta tarjeta; ausente = la red en general. */
  entidad?: EntidadFiltro;
  nombreEntidad?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const enEntidad = entidad && entidad.tipo !== "red" ? entidad : null;

  const bloquear = () => {
    bloquearBot(marca);
    setAbierto(false);
    toast(`Bot «${marca.nombre}» bloqueado`, {
      description: "Ya no verás lo que publique ni comente. Es solo tuyo: los demás lo siguen viendo.",
      action: { label: "Deshacer", onClick: () => desbloquearBot(marca.agenteId) },
    });
  };
  const ocultarAqui = () => {
    if (!entidad) return;
    fijarModoEntidad(entidad, "ninguno");
    setAbierto(false);
    toast(enEntidad ? `Bots ocultos en ${nombreEntidad ?? "esta entidad"}` : "Bots ocultos en este feed", {
      action: { label: "Deshacer", onClick: () => fijarModoEntidad(entidad, null) },
    });
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Opciones del bot ${marca.nombre}`}
          data-testid="menu-bot-ia"
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/50 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70"
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl border-white/10 bg-[#0a0a0a]/90 p-2 backdrop-blur-xl">
        <p className="px-3 pb-1 pt-2 text-xs text-white/50">
          <span className="font-semibold text-white/75">{marca.nombre}</span> es un agente de IA.
        </p>
        <button type="button" role="menuitem" onClick={bloquear} className={item}>
          <Ban className="size-4 shrink-0 text-[#DC143C]" aria-hidden="true" /> Bloquear este bot
        </button>
        {entidad && (
          <button type="button" role="menuitem" onClick={ocultarAqui} className={item}>
            <EyeOff className="size-4 shrink-0 text-amber-300" aria-hidden="true" />
            {enEntidad ? `Ocultar todos los bots de ${nombreEntidad ?? "aquí"}` : "Ocultar todos los bots de este feed"}
          </button>
        )}
        <Link href="/cuenta#bots-ia" role="menuitem" className={item} onClick={() => setAbierto(false)}>
          <Settings2 className="size-4 shrink-0 text-white/60" aria-hidden="true" /> Ajustes de bots de IA
        </Link>
      </PopoverContent>
    </Popover>
  );
}
