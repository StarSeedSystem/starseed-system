"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdnEntry } from "@/lib/avatares/adaptadores/almacen-adn";
import { parseAdnEntry, saveAdnToLibrary } from "@/lib/avatares/adaptadores/almacen-adn";
import { decidirCambioAvatar } from "@/lib/avatares/adn/permisos";
import { AdnAvatar } from "@/lib/avatares/adn/adn";
import { PLANTILLAS_AVATAR, adnDePlantilla, refDePlantilla } from "@/lib/avatares/plantillas";
import { AvatarVivo } from "@/components/avatares/avatar-vivo";

interface SelectorAvatar3dProps {
  profileId?: string;
  entityId?: string;
  previewOnly?: boolean;
  onChange?: (adnRef: string) => void;
}

export default function SelectorAvatar3d({
  profileId,
  entityId,
  previewOnly = false,
  onChange,
}: SelectorAvatar3dProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentAdnRef, setCurrentAdnRef] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const { entry: adnEntry, loadAdn, saveAdn } = useAdnEntry(currentAdnRef);
  const [adnAvatar, setAdnAvatar] = useState<AdnAvatar | null>(null);

  useEffect(() => {
    if (adnEntry) {
      parseAdnEntry(adnEntry).then(setAdnAvatar);
    }
  }, [adnEntry]);

  useEffect(() => {
    if (profileId) {
      const perfil = buscarMetadataDePerfil(profileId);
      if (perfil?.avatar_3d?.ref) setCurrentAdnRef(perfil.avatar_3d.ref);
    } else if (entityId) {
      const entidad = buscarMetadatosDeEntidad(entityId);
      if (entidad?.avatar_3d?.ref) setCurrentAdnRef(entidad.avatar_3d.ref);
    }
  }, [profileId, entityId]);

  const handleAdnChange = useCallback(
    async (ref: string) => {
      if (!ref) return;
      setLoading(true);
      try {
        await loadAdn(ref);
        setCurrentAdnRef(ref);
        onChange?.(ref);
      } catch (error) {
        console.error("Error al cargar el ADN del avatar:", error);
      } finally {
        setLoading(false);
      }
    },
    [loadAdn, onChange]
  );

  const handleSave = useCallback(
    async (adn: AdnAvatar, visibilidad: "privado" | "grupo" | "publico") => {
      setLoading(true);
      try {
        await saveAdnToLibrary(adn, visibilidad);
        const url = adn.base.ref || `biblioteca:${adn.id}`;
        await handleAdnChange(url);
      } catch (error) {
        console.error("Error al guardar el ADN del avatar:", error);
      } finally {
        setLoading(false);
      }
    },
    [saveAdn, handleAdnChange]
  );

  const buscarMetadataDePerfil = (id: string) => {
    try {
      return JSON.parse(localStorage.getItem(`starseed.profile.metadata.${id}`) || "{}") as any;
    } catch { return null; }
  };

  const buscarMetadatosDeEntidad = (id: string) => {
    try {
      return JSON.parse(localStorage.getItem(`starseed.entity.metadata.${id}`) || "{}") as any;
    } catch { return null; }
  };

  const getDefaultAdnRef = () => "orbe-gris";

  /** El dueño del ADN nuevo sale del perfil o entidad que está eligiendo el avatar. */
  const duenoActual = (): AdnAvatar["dueno"] =>
    profileId
      ? { tipo: "perfil", id: profileId }
      : { tipo: "comunidad", id: entityId ?? "sin-dueno" };

  const handleElegirPlantilla = useCallback(
    async (idPlantilla: string) => {
      const adn = adnDePlantilla(idPlantilla, duenoActual(), `adn-${Date.now().toString(36)}`);
      if (!adn) return;
      await handleSave(adn, "privado");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleSave, profileId, entityId]
  );

  const puedeCambiarAvatar = (adn: AdnAvatar | null, rol: "dueno" | "admin" | "miembro" | "observador" | "invitado", gobierno?: "jerarquico" | "democratico", botDeEntidad?: boolean, vistaPrevia = false): boolean => {
    if (!adn) return false;
    try {
      const decision = decidirCambioAvatar({
        adn,
        rol,
        gobierno,
        botDeEntidad,
        vistaPrevia
      });
      return decision.permitido;
    } catch (error) {
      console.error("Error al verificar permiso para cambiar avatar:", error);
      return false;
    }
  };

  const getFuenteParaRef = (ref: string) => {
    if (ref.startsWith("biblioteca:") || ref.startsWith("genesis:")) {
      return { tipo: "glb", url: ref };
    } else if (ref === "vrm-persona") {
      return { tipo: "glb", url: "vrm-persona" };
    } else {
      return { tipo: "procedural", svg: "orbe-gris" };
    }
  };

  const fixedOpciones = [
    { id: "orbe-gris", label: "Orbe gris", ref: getDefaultAdnRef() },
    { id: "vrm-persona", label: "Persona VRM", ref: "vrm-persona" }
  ];

  const plantillaOpciones = PLANTILLAS_AVATAR.map(p => ({
    id: p.id,
    label: p.nombre,
    ref: refDePlantilla(p.id),
    tonoAura: p.tonoAura,
    autor: p.autor
  }));;

  return (
    <div className="space-y-4">
      {!previewOnly && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Avatar 3D</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            disabled={loading}
          >
            {loading ? "Cargando..." : isOpen ? "Cerrar" : "Ver opciones"}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {adnAvatar ? (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">Avatar actual</h4>
              <Badge variant="secondary">{adnAvatar.nombre || "Avatar"}</Badge>
            </div>

            <div className="aspect-square max-w-md mx-auto mb-4">
              <AvatarVivo
                fuente={
                  currentAdnRef.startsWith("biblioteca:") || currentAdnRef.startsWith("genesis:")
                    ? { tipo: "glb", url: currentAdnRef }
                    : currentAdnRef === "vrm-persona"
                    ? { tipo: "glb", url: "vrm-persona" }
                    : { tipo: "procedural", svg: "orbe-gris" }
                }
                tamano={400}
              />
            </div>

            {previewOnly && (
              <div className="text-center text-sm text-muted-foreground">
                Vista previa del avatar 3D
              </div>
            )}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <span className="text-2xl">🎭</span>
              </div>
              <h4 className="font-medium mb-2">Sin avatar</h4>
              <p className="text-sm text-muted-foreground mb-4">
                El avatar aún no está configurado. Si AV1011A no está listo, se mostrará la orbe.
              </p>
              <Badge variant="outline">Vista previa: orbe</Badge>
            </CardContent>
          </Card>
        )}
      </div>

      {isOpen && !previewOnly && (
        <div className="space-y-3">
          <h4 className="font-medium">Cambiar avatar</h4>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleAdnChange(getDefaultAdnRef())}
              className={cn(
                "cursor-pointer",
                "p-3 rounded-lg border transition-all",
                currentAdnRef === getDefaultAdnRef()
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-muted-foreground"
              )}
            >
              <div className="aspect-square w-20 mx-auto mb-2 rounded-full bg-gradient-to-br from-gray-400 to-gray-600" />
              <p className="text-sm font-medium">Orbe gris</p>
            </button>

            <button
              type="button"
              onClick={() => handleAdnChange("vrm-persona")}
              className={cn(
                "cursor-pointer",
                "p-3 rounded-lg border transition-all",
                currentAdnRef === "vrm-persona"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-muted-foreground"
              )}
            >
              <div className="aspect-square w-20 mx-auto mb-2 rounded-full bg-gradient-to-br from-blue-400 to-purple-600" />
              <p className="text-sm font-medium">Persona VRM</p>
            </button>
          </div>

          <div className="space-y-2">
            <h5 className="text-sm font-medium">Modelos base (CC0)</h5>
            <p className="text-xs text-muted-foreground">
              Avatares VRM de la colección Numinia Digital Goods (licencia CC0, servidos por la Biblioteca).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PLANTILLAS_AVATAR.map((p) => {
                const ref = refDePlantilla(p.id);
                const activo = currentAdnRef === ref;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={loading}
                    aria-pressed={activo}
                    aria-label={`Elegir plantilla ${p.nombre}`}
                    onClick={() => handleElegirPlantilla(p.id)}
                    className={cn(
                      "cursor-pointer",
                      "p-3 rounded-lg border transition-all",
                      activo
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    <div
                      className="aspect-square w-16 mx-auto mb-2 rounded-full bg-gradient-to-br from-amber-300 to-rose-500"
                      style={{ filter: `hue-rotate(${p.tonoAura}deg)` }}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">{p.autor} · CC0</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
