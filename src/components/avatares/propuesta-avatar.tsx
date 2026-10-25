"use client";

/**
 * Tarjeta de propuesta de avatar (AV1011J · architecture/astraura-avatares-3d.md §7 y §9-J).
 *
 * Enseña el avatar ACTUAL y el PROPUESTO lado a lado y cuenta el diff en palabras para que se vote con criterio.
 * Solo ofrece proponer cuando `decidirCambioAvatar` responde «votacion» (entidad democrática): si no, dice el
 * motivo y no finge un flujo que no existe. Enviar a PoliGenesis lo hace quien monta la tarjeta con `onProponer`;
 * aquí no se toca la red, ni Supabase, ni el almacén. Sin emojis, con teclado y lector de pantalla.
 */
import { useId, useMemo, useState } from "react";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { Button } from "@/components/ui/button";
import { diffAdn } from "@/lib/avatares/adn/cambios";
import { describirCambioAvatar } from "@/lib/avatares/adn/descripcion-cambios";
import type { AdnAvatar } from "@/lib/avatares/adn/adn";
import type { Gobierno, RolBot } from "@/lib/astraura-bots/tipos";
import { proponerCambioAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import type { Operacion } from "@/lib/genesis/operaciones";

export interface PropuestaAvatarProps {
  actual: AdnAvatar;
  propuesto: AdnAvatar;
  /** Papel de quien mira en la entidad (dueño, admin, miembro, observador o invitado). */
  rol: RolBot;
  gobierno?: Gobierno;
  botDeEntidad?: boolean;
  motivo?: string;
  /** Envía la operación ya validada a PoliGenesis. Sin esto se dice que falta el cableado, no se simula. */
  onProponer?: (operacion: Operacion) => void | Promise<void>;
}

type Estado = { tipo: "quieto" | "enviando" | "hecho" | "error"; texto: string };
const QUIETO: Estado = { tipo: "quieto", texto: "" };

function LadoAvatar({ adn, nombre }: { adn: AdnAvatar; nombre: string }) {
  return (
    <figure className="rounded-lg border bg-card p-3">
      <div className="mx-auto aspect-square w-full max-w-[220px]">
        <AvatarVivo adn={adn} tamano="100%" />
      </div>
      <figcaption className="mt-2 text-center text-sm text-muted-foreground">
        {nombre} · revisión {adn.rev}
      </figcaption>
    </figure>
  );
}

export function PropuestaAvatar({ actual, propuesto, rol, gobierno, botDeEntidad, motivo = "", onProponer }: PropuestaAvatarProps) {
  const tituloId = useId();
  const [estado, setEstado] = useState<Estado>(QUIETO);
  const cambios = useMemo(() => diffAdn(actual, propuesto), [actual, propuesto]);
  const resultado = useMemo(
    () => proponerCambioAvatar({ actual, propuesto, motivo, rol, gobierno, botDeEntidad }),
    [actual, propuesto, motivo, rol, gobierno, botDeEntidad],
  );

  const enviar = async () => {
    if (!resultado.ok || !onProponer) return;
    setEstado({ tipo: "enviando", texto: "Enviando la propuesta a PoliGenesis…" });
    try {
      await onProponer(resultado.operacion);
      setEstado({ tipo: "hecho", texto: "Propuesta enviada: la entidad la vota y, al aprobarse, se comprobará la revisión del avatar." });
    } catch (e) {
      setEstado({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo enviar la propuesta." });
    }
  };

  return (
    <section aria-labelledby={tituloId} className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <h2 id={tituloId} className="text-lg font-semibold">Propuesta de avatar</h2>
        <p className="text-sm text-muted-foreground">Se vota el cambio, no el avatar entero: esto es lo que cambia.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LadoAvatar adn={actual} nombre="Actual" />
        <LadoAvatar adn={propuesto} nombre="Propuesto" />
      </div>

      <div>
        <h3 className="text-sm font-medium">Qué cambia</h3>
        {cambios.length ? (
          <ul aria-label="Lista de cambios del avatar" className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {cambios.map((cambio, i) => <li key={`${cambio.op}-${i}`}>{describirCambioAvatar(cambio)}</li>)}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No hay cambios: el avatar propuesto es igual al actual.</p>
        )}
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          onClick={() => { void enviar(); }}
          disabled={!resultado.ok || !onProponer || estado.tipo === "enviando"}
          className="cursor-pointer"
        >
          {estado.tipo === "enviando" ? "Enviando…" : "Proponer a votación"}
        </Button>
        <div aria-live="polite">
          {!resultado.ok && <p className="text-sm text-muted-foreground">{resultado.motivo}</p>}
          {resultado.ok && !onProponer && (
            <p className="text-sm text-muted-foreground">Falta conectar esta tarjeta con PoliGenesis: la propuesta todavía no se ha enviado.</p>
          )}
          {estado.tipo === "error" && <p role="alert" className="text-sm text-red-500">{estado.texto}</p>}
          {estado.tipo === "hecho" && <p role="status" className="text-sm text-emerald-600">{estado.texto}</p>}
        </div>
      </div>
    </section>
  );
}

export default PropuestaAvatar;
