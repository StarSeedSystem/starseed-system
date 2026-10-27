"use client";

/**
 * Tarjeta de PROPUESTA DE AVATAR para grupos y páginas democráticos (AV1011J).
 *
 * Muestra el avatar actual y el propuesto lado a lado y cuenta el diff en palabras. Solo ofrece
 * «Proponer» cuando `decidirCambioAvatar` responde «votacion» (§7): en un grupo jerárquico o en un
 * avatar personal no se promete una votación que no existe. Si no se le pasa `onProponer`, la tarjeta
 * lo dice: prepara la operación, pero no hay ningún canal de propuestas conectado.
 */
import { useMemo, useState } from "react";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import { diffAdn } from "@/lib/avatares/adn/cambios";
import { decidirCambioAvatar } from "@/lib/avatares/adn/permisos";
import { proponerCambioAvatar } from "@/lib/avatares/adaptadores/propuesta-avatar";
import { describirCambiosAvatar, type Ambito, type Operacion } from "@/lib/genesis/operaciones";
import type { AdnAvatar } from "@/lib/avatares/adn/adn";
import type { Gobierno, RolBot } from "@/lib/astraura-bots/tipos";
import { cn } from "@/lib/utils";

export interface PropuestaAvatarProps {
    actual: AdnAvatar;
    propuesto: AdnAvatar;
    ambito: Ambito;
    rol: RolBot;
    gobierno?: Gobierno;
    botDeEntidad?: boolean;
    motivo?: string;
    /** Quien monta la tarjeta entrega la operación al canal de propuestas. Sin esto no se finge un envío. */
    onProponer?: (operacion: Operacion) => void | Promise<void>;
}

export default function PropuestaAvatar({
    actual,
    propuesto,
    ambito,
    rol,
    gobierno,
    botDeEntidad,
    motivo = "Cambio de avatar propuesto para la entidad",
    onProponer,
}: PropuestaAvatarProps) {
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [entregada, setEntregada] = useState(false);

    const cambios = useMemo(() => diffAdn(actual, propuesto), [actual, propuesto]);
    const enPalabras = useMemo(() => describirCambiosAvatar(cambios), [cambios]);
    const decision = useMemo(
        () => decidirCambioAvatar({ adn: actual, rol, gobierno, botDeEntidad, vistaPrevia: false }),
        [actual, rol, gobierno, botDeEntidad],
    );
    const soloVotacion = decision.requiere === "votacion";
    const puedeProponer = soloVotacion && Boolean(onProponer) && cambios.length > 0 && !enviando && !entregada;

    const proponer = async () => {
        if (!onProponer || !puedeProponer) return;
        setError(null);
        setEnviando(true);
        const resultado = proponerCambioAvatar({ actual, propuesto, motivo, ambito, rol, gobierno, botDeEntidad });
        if (!resultado.ok) {
            setError(resultado.motivo);
            setEnviando(false);
            return;
        }
        try {
            await onProponer(resultado.operacion);
            setEntregada(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo entregar la propuesta.");
        } finally {
            setEnviando(false);
        }
    };

    return (
        <section aria-labelledby="propuesta-avatar-titulo" className="flex flex-col gap-4 rounded-lg border p-4">
            <div>
                <h2 id="propuesta-avatar-titulo" className="text-lg font-semibold">Proponer cambio de avatar</h2>
                <p className="text-sm text-muted-foreground">
                    Se propone el cambio (el diff del ADN), no el avatar entero; la entidad lo vota antes de aplicarlo.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <figure className="flex flex-col items-center gap-2">
                    <figcaption className="text-sm font-medium">Ahora · revisión {actual.rev}</figcaption>
                    <AvatarVivo adn={actual} tamano={180} />
                </figure>
                <figure className="flex flex-col items-center gap-2">
                    <figcaption className="text-sm font-medium">Propuesto · revisión {propuesto.rev}</figcaption>
                    <AvatarVivo adn={propuesto} tamano={180} />
                </figure>
            </div>

            <div>
                <h3 className="text-sm font-semibold">Cambios ({enPalabras.length})</h3>
                {enPalabras.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {enPalabras.map((texto) => <li key={texto}>{texto}</li>)}
                    </ul>
                ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No hay ningún cambio entre los dos avatares.</p>
                )}
            </div>

            {!soloVotacion && <p className="text-sm text-muted-foreground">{decision.motivo}</p>}
            {!onProponer && soloVotacion && (
                <p className="text-sm text-muted-foreground">
                    La operación está preparada, pero no hay ningún canal de propuestas conectado en esta pantalla.
                </p>
            )}
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            {entregada && (
                <p role="status" className="text-sm text-emerald-600">
                    Propuesta entregada. Se aplicará si la entidad la aprueba en la votación.
                </p>
            )}

            <button
                type="button"
                onClick={() => void proponer()}
                disabled={!puedeProponer}
                aria-disabled={!puedeProponer}
                className={cn(
                    "self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
                    puedeProponer ? "cursor-pointer hover:opacity-90" : "cursor-not-allowed opacity-50",
                )}
            >
                {enviando ? "Enviando…" : entregada ? "Propuesta entregada" : "Proponer para votación"}
            </button>
        </section>
    );
}
