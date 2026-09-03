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
import { FotoConMarco, EditorMarco } from "@/components/profile/foto-con-marco";
import { EditorAvatar3D, Avatar3DVisor, type Avatar3D } from "@/components/profile/avatar-3d";
import { type Marco, MARCO_POR_DEFECTO } from "@/lib/profile/marco-foto";
import {
  claimProfile, saveProfileOptional, isValidHandle, sincronizarPerfilPublico,
} from "@/lib/onboarding/onboarding";
import { marcarRitoActivo } from "@/lib/ui/rito-activo";
import { IconoStarSeed } from "@/components/onboarding/icono-starseed";

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
  // (Adenda 219) Forma/encuadre de la foto y avatar 3D opcional.
  const [marco, setMarco] = useState<Marco>(MARCO_POR_DEFECTO);
  const [avatar3d, setAvatar3d] = useState<Avatar3D | null>(null);
  const [editando, setEditando] = useState<null | "marco" | "3d">(null);
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

  // (Ola 227) Rito en primer plano: mientras esta ventana esté abierta, el
  // OmniDock, las cortinas/bordes Trinity y la paleta de comandos quedan fuera.
  useEffect(() => {
    marcarRitoActivo("perfil-inicial", abierta);
    return () => marcarRitoActivo("perfil-inicial", false);
  }, [abierta]);

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
          .select("handle,display_name,bio,avatar_url,cover_url,avatar_marco,avatar_3d")
          .eq("user_id", uid)
          .maybeSingle();
        if (!vivo || !data) return;
        const p = data as { handle?: string; display_name?: string; bio?: string; avatar_url?: string; cover_url?: string; avatar_marco?: Marco | null; avatar_3d?: Avatar3D | null };
        if (p.avatar_marco) setMarco({ ...MARCO_POR_DEFECTO, ...p.avatar_marco });
        if (p.avatar_3d?.url) setAvatar3d(p.avatar_3d);
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

  /**
   * Guarda todo y lleva al perfil completo; la guía arranca desde allí.
   * (Adenda 194) BLINDADO: cada guardado tiene tope de tiempo y su propio
   * try/catch — visto en vivo que una consulta lenta dejaba el botón sin hacer
   * nada. Pase lo que pase, siempre se navega: el usuario nunca se queda
   * atrapado en esta ventana.
   */
  const conTope = useCallback(<T,>(p: Promise<T>, ms = 6000): Promise<T | null> =>
    Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]), []);

  const terminar = useCallback(async () => {
    setGuardando(true);
    try {
      const h = handle.trim().toLowerCase();
      if (h && !isValidHandle(h)) {
        toast.error("El @handle no es válido (3-20 caracteres: a-z, 0-9, _).");
        return;
      }
      if (h && nombre.trim()) {
        const r = await conTope(claimProfile({ fullName: nombre.trim(), handle: h }));
        if (r && !r.ok) { toast.error(r.error || "No se pudo guardar el nombre."); return; }
      }
      await conTope(saveProfileOptional({
        avatar_url: avatar || undefined,
        cover_url: portada || undefined,
        bio: bio || undefined,
        avatar_marco: marco as unknown as Record<string, unknown>,
        avatar_3d: avatar3d?.url ? (avatar3d as unknown as Record<string, unknown>) : null,
      }));
      await conTope((async () => {
        const sb = createClient();
        const { data: u } = await sb.auth.getUser();
        if (u?.user?.id) {
          await sincronizarPerfilPublico(u.user.id, {
            handle: h || undefined,
            display_name: nombre.trim() || undefined,
            avatar_url: avatar || undefined,
            cover_url: portada || undefined,
            bio: bio || undefined,
            avatar_marco: marco as unknown as Record<string, unknown>,
            avatar_3d: avatar3d?.url ? (avatar3d as unknown as Record<string, unknown>) : null,
          });
        }
        return true;
      })());

      setAbierta(false);
      onCerrar?.();
      // Ver el perfil COMPLETO y, desde ahí, arrancar la guía en el Escritorio.
      try { window.sessionStorage.setItem(GUIA_TRAS_PERFIL_KEY, "1"); } catch { /* */ }
      const destino = h || handle.trim().toLowerCase();
      window.location.assign(destino ? `/profile/${destino}` : "/escritorios");
    } finally {
      setGuardando(false);
    }
    // (Adenda 219) `marco` y `avatar3d` en las dependencias: sin ellas el
    // callback guardaba el marco POR DEFECTO y ningún avatar 3D (clausura
    // vieja) — visto en vivo: la estrella elegida llegaba a la base como círculo.
  }, [handle, nombre, avatar, portada, bio, marco, avatar3d, onCerrar, conTope]);

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
        <DialogHeader className="items-center text-center">
          <IconoStarSeed className="mx-auto" />
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
              {/* (Adenda 219) Foto de perfil con su MARCO (forma + encuadre)
                  y, a su lado, el avatar 3D opcional. */}
              <div className="absolute -bottom-7 left-4 flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="relative transition-transform hover:scale-105"
                  aria-label="Cambiar foto de perfil"
                  title="Foto de perfil"
                >
                  <FotoConMarco src={avatar || null} marco={marco} size={84}>
                    <Camera className="h-6 w-6 text-white/70" aria-hidden />
                  </FotoConMarco>
                  {subiendo === "avatar" && (
                    <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></span>
                  )}
                </button>
                {avatar3d?.url && <Avatar3DVisor config={avatar3d} size={84} className="border border-white/10 bg-black/30" />}
              </div>
              <input
                ref={avatarRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f, "avatar"); }}
              />
              <input
                ref={portadaRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f, "cover"); }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-8">
              <button type="button" onClick={() => setEditando(editando === "marco" ? null : "marco")} disabled={!avatar} className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-3 py-1.5 text-[11px] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:opacity-40">
                Marco y encuadre de la foto
              </button>
              <button type="button" onClick={() => setEditando(editando === "3d" ? null : "3d")} className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-100 hover:bg-cyan-500/20">
                Avatar 3D {avatar3d?.url ? "· editar" : "· añadir (opcional)"}
              </button>
              <span className="text-[10.5px] text-white/40">Portada arriba · Foto de perfil abajo a la izquierda</span>
            </div>

            {editando === "marco" && avatar && (
              <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-3">
                <EditorMarco src={avatar} value={marco} onChange={setMarco} size={180} />
              </div>
            )}
            {editando === "3d" && (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.04] p-3">
                <EditorAvatar3D
                  value={avatar3d}
                  onChange={setAvatar3d}
                  onSubir={async (f) => { const r = await uploadEntityMedia(f, "avatar"); return r?.url ?? null; }}
                />
              </div>
            )}

            <div className="grid gap-3 pt-2 sm:grid-cols-2">
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
