"use client";

/**
 * VENTANA DE PERFIL (Adenda 194) — el último paso antes de la guía.
 * ----------------------------------------------------------------------------
 * El rito dejaba el perfil a medias: avatar y portada solo por URL pegada, el
 * @handle sin poder corregirse aquí, y nunca se veía el resultado. Esta ventana
 * cierra el círculo:
 *   · sube de verdad la imagen de perfil y la portada (bucket `os-media`),
 *   · deja editar el nombre visible, el @handle y la biografía —el handle que
 *     inventó el alta de cuenta se corrige AQUÍ, que es donde se ve—,
 *   · guarda en el perfil privado y en el PÚBLICO (`os_profiles`), que es el
 *     que sirve /profile, y
 *   · al terminar lleva al perfil completo para verlo; desde ahí arranca la
 *     guía y el recorrido sigue en el Escritorio.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, UserCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/utils/supabase/client";
import { uploadEntityMedia } from "@/lib/os-social";
import {
  claimProfile, saveProfileOptional, isValidHandle, sincronizarPerfilPublico,
} from "@/lib/onboarding/onboarding";

/** Marca de sesión: el rito pide abrir esta ventana tras los sistemas. */
export const PERFIL_LAUNCH_KEY = "starseed.perfil.launch";
/** Marca de sesión: tras ver el perfil, arranca la guía en el Escritorio. */
export const GUIA_TRAS_PERFIL_KEY = "starseed.guia.tras.perfil";

export function VentanaPerfilInicial({ onCerrar }: { onCerrar?: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [portada, setPortada] = useState("");
  const [subiendo, setSubiendo] = useState<"avatar" | "cover" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const portadaRef = useRef<HTMLInputElement>(null);

  // Se abre por la marca que deja la ventana de sistemas al cerrarse.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(PERFIL_LAUNCH_KEY) === "1") {
        window.sessionStorage.removeItem(PERFIL_LAUNCH_KEY);
        setAbierta(true);
      }
    } catch { /* sin sessionStorage: el perfil se edita en Ajustes */ }
    const abrir = () => setAbierta(true);
    window.addEventListener("starseed:open-perfil-inicial", abrir);
    return () => window.removeEventListener("starseed:open-perfil-inicial", abrir);
  }, []);

  // Carga lo que ya haya: el handle que se eligió (o el que puso el alta).
  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    (async () => {
      try {
        const sb = createClient();
        const { data: u } = await sb.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) return;
        const { data } = await sb
          .from("profiles")
          .select("handle,display_name,bio,avatar_url,cover_url")
          .eq("user_id", uid)
          .maybeSingle();
        if (!vivo || !data) return;
        const p = data as { handle?: string; display_name?: string; bio?: string; avatar_url?: string; cover_url?: string };
        setNombre(p.display_name || "");
        setHandle(p.handle || "");
        setBio(p.bio || "");
        setAvatar(p.avatar_url || "");
        setPortada(p.cover_url || "");
      } catch { /* se edita igual desde cero */ }
      finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [abierta]);

  const subir = useCallback(async (file: File, kind: "avatar" | "cover") => {
    setSubiendo(kind);
    try {
      const r = await uploadEntityMedia(file, kind);
      if (r.ok && r.url) {
        if (kind === "avatar") setAvatar(r.url); else setPortada(r.url);
        toast.success(kind === "avatar" ? "Imagen de perfil lista." : "Portada lista.");
      } else {
        toast.error(r.error || "No se pudo subir la imagen.");
      }
    } finally {
      setSubiendo(null);
    }
  }, []);

  /** Guarda todo y lleva al perfil completo; la guía arranca desde allí. */
  const terminar = useCallback(async () => {
    setGuardando(true);
    try {
      const h = handle.trim().toLowerCase();
      if (h && !isValidHandle(h)) {
        toast.error("El @handle no es válido (3-20 caracteres: a-z, 0-9, _).");
        return;
      }
      if (h && nombre.trim()) {
        const r = await claimProfile({ fullName: nombre.trim(), handle: h });
        if (!r.ok) { toast.error(r.error || "No se pudo guardar el nombre."); return; }
      }
      await saveProfileOptional({
        avatar_url: avatar || undefined,
        cover_url: portada || undefined,
        bio: bio || undefined,
      });
      await (async () => {
        try {
          const sb = createClient();
          const { data: u } = await sb.auth.getUser();
          if (u?.user?.id) {
            await sincronizarPerfilPublico(u.user.id, {
              handle: h || undefined,
              display_name: nombre.trim() || undefined,
              avatar_url: avatar || undefined,
              cover_url: portada || undefined,
              bio: bio || undefined,
            });
          }
        } catch { /* espejo best-effort */ }
      })();

      setAbierta(false);
      onCerrar?.();
      // Ver el perfil COMPLETO y, desde ahí, arrancar la guía en el Escritorio.
      try { window.sessionStorage.setItem(GUIA_TRAS_PERFIL_KEY, "1"); } catch { /* */ }
      const destino = h || handle.trim().toLowerCase();
      window.location.assign(destino ? `/profile/${destino}` : "/escritorios");
    } finally {
      setGuardando(false);
    }
  }, [handle, nombre, avatar, portada, bio, onCerrar]);

  const saltar = useCallback(() => {
    setAbierta(false);
    onCerrar?.();
    try { window.sessionStorage.setItem(GUIA_TRAS_PERFIL_KEY, "1"); } catch { /* */ }
    window.location.assign("/escritorios");
  }, [onCerrar]);

  if (!abierta) return null;

  return (
    <Dialog open={abierta} onOpenChange={() => { /* se cierra con sus botones */ }}>
      <DialogContent
        className="w-[95vw] sm:max-w-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6 [&>button.absolute]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-fuchsia-300" aria-hidden /> Tu perfil en la red
          </DialogTitle>
          <DialogDescription>
            Lo último antes del recorrido: tu cara pública. Todo es opcional y editable después.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando tu perfil…
          </p>
        ) : (
          <div className="space-y-4">
            {/* Portada + avatar, como se verán */}
            <div className="relative">
              <button
                type="button"
                onClick={() => portadaRef.current?.click()}
                className={cn(
                  "relative flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 transition-colors hover:border-fuchsia-400/40",
                  portada ? "bg-black/30" : "bg-gradient-to-br from-fuchsia-500/15 via-purple-500/10 to-cyan-500/10",
                )}
              >
                {portada
                  ? <img src={portada} alt="" className="h-full w-full object-cover" />
                  : <span className="flex items-center gap-2 text-xs text-white/60"><ImageIcon className="h-4 w-4" aria-hidden /> Añadir portada</span>}
                {subiendo === "cover" && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></span>
                )}
              </button>
              <button
                type="button"
                onClick={() => avatarRef.current?.click()}
                className="absolute -bottom-6 left-4 grid h-20 w-20 place-items-center overflow-hidden rounded-full border-4 border-background bg-white/10 transition-transform hover:scale-105"
                aria-label="Cambiar imagen de perfil"
              >
                {avatar
                  ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                  : <Camera className="h-6 w-6 text-white/70" aria-hidden />}
                {subiendo === "avatar" && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></span>
                )}
              </button>
              <input
                ref={avatarRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f, "avatar"); }}
              />
              <input
                ref={portadaRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f, "cover"); }}
              />
            </div>

            <div className="grid gap-3 pt-7 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-muted-foreground">Nombre visible</span>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" className="mt-1" />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Tu @handle</span>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="tu_handle"
                  className="mt-1"
                />
                <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">
                  Es tu dirección en la red: <b>/profile/{handle || "tu_handle"}</b>. Cámbialo aquí si el que se creó
                  con tu cuenta no es el que quieres.
                </span>
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-muted-foreground">Sobre ti</span>
              <Textarea
                value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                placeholder="Una o dos frases sobre ti (opcional)."
                className="mt-1"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button type="button" onClick={saltar} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                Saltar por ahora
              </button>
              <Button onClick={() => void terminar()} disabled={guardando || !!subiendo} className="gap-1.5">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                Ver mi perfil y empezar el recorrido
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default VentanaPerfilInicial;
