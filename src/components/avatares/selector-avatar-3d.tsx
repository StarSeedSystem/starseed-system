"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adnActualDeDueno, nuevoIdAdn, parseAdnEntry, saveAdnToLibrary, suscribirCambiosAdn } from "@/lib/avatares/adaptadores/almacen-adn";
import { decidirCambioAvatar } from "@/lib/avatares/adn/permisos";
import { adnPorDefecto, type AdnAvatar, type DuenoAvatar } from "@/lib/avatares/adn/adn";
import { PLANTILLAS_AVATAR, adnDePlantilla, refDePlantilla } from "@/lib/avatares/plantillas";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";
import type { Gobierno, RolBot } from "@/lib/astraura-bots/tipos";

/** Peso en MB decimales (como las sumas de `plantillas.ts`): es lo que gasta quien lo baje con datos móviles. */
const pesoMb = (bytes: number): string => `${(bytes / 1e6).toFixed(1).replace(".", ",")} MB`;

interface BaseProps {
  previewOnly?: boolean;
  /** Avisa con la clave del ADN guardado (`biblioteca:<id>`). */
  onChange?: (adnRef: string) => void;
}
/**
 * El avatar de una persona. `esPropio` es OBLIGATORIO a propósito: quien monte el selector en una ficha dice si quien
 * mira es su dueña (sesión de ese perfil). En el perfil de otra persona solo se ve (decidirCambioAvatar, contrato §7).
 */
interface PropsPerfil extends BaseProps {
  profileId: string;
  esPropio: boolean;
  entityId?: never;
  entityKind?: never;
  rol?: never;
  gobierno?: never;
}
/**
 * El avatar de un grupo, comunidad o página. El tipo es obligatorio (no se adivina) y, sin `rol`, quien mira solo ve:
 * nada se aplica a ciegas (decidirCambioAvatar, contrato §7).
 */
interface PropsEntidad extends BaseProps {
  profileId?: never;
  entityId: string;
  entityKind: Extract<DuenoAvatar, "grupo" | "comunidad" | "pagina">;
  rol?: RolBot;
  gobierno?: Gobierno;
}
type SelectorAvatar3dProps = PropsPerfil | PropsEntidad;

/** Por qué no se puede aplicar aquí, sin prometer flujos que aún no existen (propuesta y voto: AV1011J). */
function porQueSoloVer(decision: ReturnType<typeof decidirCambioAvatar>): string {
  const resto = decision.requiere === "votacion" || decision.requiere === "confirmacion"
    ? "Proponer el cambio y votarlo o confirmarlo (AV1011J) todavía no está disponible."
    : "";
  return `${decision.motivo} Aquí solo puedes verlo. ${resto}`.trim();
}

export default function SelectorAvatar3d(props: SelectorAvatar3dProps) {
  const { previewOnly = false, onChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adnAvatar, setAdnAvatar] = useState<AdnAvatar | null>(null);

  /** El dueño del ADN sale del perfil o de la entidad que está eligiendo el avatar. */
  const dueno = useMemo<AdnAvatar["dueno"]>(() => {
    if (props.profileId !== undefined) return { tipo: "perfil", id: props.profileId };
    return { tipo: props.entityKind, id: props.entityId };
  }, [props.profileId, props.entityId, props.entityKind]);
  const esPerfil = props.profileId !== undefined;
  const decision = decidirCambioAvatar({
    adn: { dueno },
    rol: esPerfil ? (props.esPropio ? "dueno" : "invitado") : (props.rol ?? "invitado"),
    gobierno: props.gobierno,
    vistaPrevia: false,
  });
  const puedeAplicar = decision.permitido && !previewOnly;

  // El avatar actual es el último ADN guardado de este dueño (nada de claves sueltas en localStorage). Se relee al
  // montar y cada vez que el almacén cambia (otra instancia o pestaña): solo LEE, así que no puede entrar en bucle.
  useEffect(() => {
    let vivo = true;
    const releer = () => {
      const entrada = adnActualDeDueno(dueno);
      if (!entrada) { setAdnAvatar(null); return; }
      void parseAdnEntry(entrada).then((a) => { if (vivo) setAdnAvatar(a); });
    };
    releer();
    const dejarDeEscuchar = suscribirCambiosAdn(releer);
    return () => { vivo = false; dejarDeEscuchar(); };
  }, [dueno]);

  const guardar = useCallback(async (nuevo: AdnAvatar) => {
    setLoading(true);
    setError(null);
    try {
      // Cambiar de avatar actualiza el ADN del dueño (mismo id, revisión +1, misma visibilidad): no se apilan ADN
      // huérfanos. Se parte de lo GUARDADO ahora, no de lo que pintó la última vez (otra pestaña pudo cambiarlo).
      const entrada = adnActualDeDueno(dueno);
      const previo = entrada ? await parseAdnEntry(entrada) : null;
      const adn = previo ? { ...nuevo, id: previo.id, rev: previo.rev + 1, visibilidad: previo.visibilidad } : nuevo;
      const ref = await saveAdnToLibrary(adn, adn.visibilidad);
      setAdnAvatar(adn);
      onChange?.(ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el avatar.");
    } finally {
      setLoading(false);
    }
  }, [dueno, onChange]);

  const orbeActivo = adnAvatar?.base.tipo === "orbe";
  const elegirOrbe = () => { if (!orbeActivo) void guardar(adnPorDefecto(nuevoIdAdn(), "Orbe", dueno)); };
  const elegirPlantilla = (id: string) => {
    if (adnAvatar?.base.ref === refDePlantilla(id)) return; // ya es ese: no se sube la revisión por nada
    const adn = adnDePlantilla(id, dueno, nuevoIdAdn());
    if (adn) void guardar(adn);
  };

  return (
    <div className="space-y-4">
      {!previewOnly && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Avatar 3D</h3>
          <Button variant="outline" size="sm" onClick={() => setIsOpen(!isOpen)} disabled={loading}>
            {loading ? "Guardando..." : isOpen ? "Cerrar" : "Ver opciones"}
          </Button>
        </div>
      )}

      {adnAvatar ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-medium">Avatar actual</h4>
            <Badge variant="secondary">{adnAvatar.nombre || "Avatar"}</Badge>
          </div>
          <div className="mx-auto mb-4 aspect-square max-w-md">
            <AvatarVivo adn={adnAvatar} tamano={400} />
          </div>
          {previewOnly && <div className="text-center text-sm text-muted-foreground">Vista previa del avatar 3D</div>}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <h4 className="mb-2 font-medium">Sin avatar elegido</h4>
            <p className="mb-4 text-sm text-muted-foreground">Mientras no elijas uno se ve la orbe.</p>
            <Badge variant="outline">Vista previa: orbe</Badge>
          </CardContent>
        </Card>
      )}

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {isOpen && !previewOnly && (
        <>
          {!puedeAplicar && <p className="text-xs text-muted-foreground">{porQueSoloVer(decision)}</p>}
          <p className="text-xs text-muted-foreground">
            {esPerfil
              ? "Se guarda en este aparato y se espeja a tu cuenta; las demás personas aún no lo ven en tu ficha pública."
              : "Se guarda en este aparato y se espeja a tu cuenta; la entidad y sus miembros aún no lo ven."}
          </p>
          <h4 className="font-medium">Cambiar avatar</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button type="button" disabled={loading || !puedeAplicar} aria-pressed={orbeActivo} aria-label="Elegir Orbe" onClick={elegirOrbe}
              className={cn("cursor-pointer rounded-lg border p-3 transition-all disabled:opacity-50", orbeActivo ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground")}>
              <div className="mx-auto mb-2 aspect-square w-16 rounded-full bg-gradient-to-br from-gray-400 to-gray-600" aria-hidden="true" />
              <p className="text-sm font-medium">Orbe</p>
            </button>
            {PLANTILLAS_AVATAR.map((p) => {
              const activo = adnAvatar?.base.ref === refDePlantilla(p.id);
              return (
                <button key={p.id} type="button" disabled={loading || !puedeAplicar} aria-pressed={activo} aria-label={`Elegir ${p.nombre}`} onClick={() => elegirPlantilla(p.id)}
                  className={cn("cursor-pointer rounded-lg border p-3 transition-all disabled:opacity-50", activo ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground")}>
                  <div className="mx-auto mb-2 aspect-square w-16 rounded-full bg-gradient-to-br from-amber-300 to-rose-500" style={{ filter: `hue-rotate(${p.tonoAura}deg)` }} aria-hidden="true" />
                  <p className="text-sm font-medium">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">{p.autor} · CC0</p>
                  <p className="text-xs text-muted-foreground">{pesoMb(p.bytesVrm)}</p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
