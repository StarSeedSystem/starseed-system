"use client";

/**
 * Tarjeta de propuesta y voto de avatar (AV1011J) para grupos, comunidades y páginas.
 * Muestra los dos avatares lado a lado (actual y propuesto), cuenta el diff en palabras y
 * solo deja proponer cuando el gobierno del dueño es democrático (`decidirCambioAvatar`
 * responde «votacion»). No inventa votos ni aplica nada aquí: entrega la operación a quien
 * la lleve a la votación (PoliGenesis).
 */
import { useId, useMemo, useState } from "react";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AdnAvatar } from "@/lib/avatares/adn/adn";
import { diffAdn } from "@/lib/avatares/adn/cambios";
import { decidirCambioAvatar } from "@/lib/avatares/adn/permisos";
import { proponerCambioAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import { describirCambioAvatar, type Ambito, type Operacion } from "@/lib/genesis/operaciones";
import type { Gobierno, RolBot } from "@/lib/astraura-bots/tipos";

export interface PropuestaAvatarProps {
  actual: AdnAvatar;
  propuesto: AdnAvatar;
  ambito: Ambito;
  rol: RolBot;
  gobierno?: Gobierno;
  botDeEntidad?: boolean;
  motivo?: string;
  /** Solo se llama con una operación ya validada; quien monta la tarjeta la lleva a votación. */
  onProponer?: (op: Operacion) => void;
}

export default function PropuestaAvatar({
  actual, propuesto, ambito, rol, gobierno, botDeEntidad,
  motivo = "Cambio de avatar propuesto para votación.", onProponer,
}: PropuestaAvatarProps) {
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const tituloId = useId();

  const decision = useMemo(
    () => decidirCambioAvatar({ adn: { dueno: actual.dueno }, rol, gobierno, botDeEntidad, vistaPrevia: false }),
    [actual.dueno, rol, gobierno, botDeEntidad],
  );
  const cambios = useMemo(() => diffAdn(actual, propuesto), [actual, propuesto]);
  const puedeProponer = decision.requiere === "votacion" && cambios.length > 0;

  const proponer = () => {
    setError(null);
    const r = proponerCambioAvatar({ actual, propuesto, motivo, ambito, rol, gobierno, botDeEntidad });
    if (!r.ok) {
      setError(r.motivos.join(" "));
      return;
    }
    setHecho(true);
    onProponer?.(r.op);
  };

  return (
    <Card aria-labelledby={tituloId}>
      <CardHeader>
        <CardTitle id={tituloId}>Propuesta de avatar</CardTitle>
        <p className="text-sm text-muted-foreground">
          Se vota solo el cambio, no el avatar entero. Revisión actual: {actual.rev}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <figure className="flex flex-col items-center gap-2">
            <AvatarVivo adn={actual} tamano={160} />
            <figcaption className="text-center text-sm">
              <span className="font-medium">Actual</span>
              <Badge variant="secondary" className="ml-2">{actual.rev}</Badge>
              <span className="block text-muted-foreground">{actual.nombre || "Avatar"}</span>
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2">
            <AvatarVivo adn={propuesto} tamano={160} />
            <figcaption className="text-center text-sm">
              <span className="font-medium">Propuesto</span>
              <span className="block text-muted-foreground">{propuesto.nombre || "Avatar"}</span>
            </figcaption>
          </figure>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-medium">Cambios que se votan</h3>
          {cambios.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm" aria-label="Lista de cambios del avatar">
              {cambios.map((c, i) => <li key={`${i}-${describirCambioAvatar(c)}`}>{describirCambioAvatar(c)}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Los dos avatares son iguales: no hay nada que votar.</p>
          )}
        </div>

        {!puedeProponer && (
          <p className="rounded-md border bg-muted/50 p-3 text-sm" role="note">
            {decision.requiere === "votacion"
              ? "La propuesta no tiene cambios."
              : `${decision.motivo} En este avatar no se vota.`}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={proponer} disabled={!puedeProponer || hecho} className="cursor-pointer">
            {hecho ? "Propuesta lista" : "Proponer para votación"}
          </Button>
          {hecho && <span className="text-sm text-muted-foreground">Entregada para votarse. No se ha aplicado nada todavía.</span>}
        </div>
        <div aria-live="polite" className="min-h-5 text-sm text-destructive">{error}</div>
      </CardContent>
    </Card>
  );
}
