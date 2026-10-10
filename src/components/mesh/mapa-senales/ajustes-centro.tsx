"use client";

/**
 * Tarjeta de «Mi neurona» y sus ajustes de edición, en el centro del radar. Dos piezas:
 *   · `TarjetaCentro`   — la cara de esta neurona (foto, nombre, perfil, estado del radar) con el acceso
 *                          a sus ajustes;
 *   · `AjustesNeurona`  — editar el nombre de la neurona y la privacidad del radar público: qué ven de ti las
 *                          demás cuentas (nombre, foto, aparato, posición) y qué ves tú de ellas.
 * La privacidad es la de la malla (`starseed.mesh.privacy.v1`, módulo `ai/astraura/mesh/privacy`): aquí
 * solo hay controles claros; el efecto real (qué lleva el faro) lo decide `server-relay.ts`.
 */

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Globe2, MapPin, Settings2, ShieldCheck, Smartphone, Tag, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_MESH_PRIVACY, getMeshPrivacy, MESH_PRIVACY_EVENT, setMeshPrivacy, type MeshPrivacySettings, type PublicRadarMode } from "@/ai/astraura/mesh/privacy";
import { CONNECTIVITY_EVENT, getConnectivitySettings } from "@/ai/astraura/mesh/connectivity";
import { setNeuronName, thisDeviceId } from "@/lib/neurons/neurons";
import type { CentroNeurona } from "@/lib/senales/centro";
import { describirRadarPublico } from "@/lib/senales/radar-publico";
import { FotoPerfil } from "./foto-perfil";

/** La privacidad de la malla de ESTE dispositivo, viva (se vuelve a leer al cambiar desde cualquier panel). */
export function useMeshPrivacidad(): { privacidad: MeshPrivacySettings; internetPublico: boolean } {
  const [privacidad, setPrivacidad] = useState<MeshPrivacySettings>(DEFAULT_MESH_PRIVACY);
  const [internetPublico, setInternetPublico] = useState(true);
  useEffect(() => {
    const leer = () => {
      setPrivacidad(getMeshPrivacy());
      try { setInternetPublico(getConnectivitySettings().publicInternet); } catch { /* se queda el valor anterior */ }
    };
    leer();
    window.addEventListener(MESH_PRIVACY_EVENT, leer);
    window.addEventListener(CONNECTIVITY_EVENT, leer);
    return () => {
      window.removeEventListener(MESH_PRIVACY_EVENT, leer);
      window.removeEventListener(CONNECTIVITY_EVENT, leer);
    };
  }, []);
  return { privacidad, internetPublico };
}

const COLOR_EMISION = { publica: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200", anonima: "border-sky-400/35 bg-sky-500/10 text-sky-200", "no-emite": "border-white/15 bg-white/5 text-white/55" } as const;

export function TarjetaCentro({ centro, abierta, onAjustes, compacto }: {
  centro: CentroNeurona;
  abierta: boolean;
  onAjustes: () => void;
  compacto?: boolean;
}) {
  return (
    <section aria-label="Mi neurona" data-testid="tarjeta-centro" className="flex items-center gap-2.5 rounded-2xl border border-sky-400/25 bg-sky-500/[0.05] px-2.5 py-2">
      <FotoPerfil url={centro.avatar.modo === "foto" ? centro.avatar.url : null} iniciales={centro.iniciales} size={compacto ? 36 : 44} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[12px] font-bold text-white">{centro.nombreNeurona}</span>
          {centro.sinNombre && <span className="shrink-0 rounded-full border border-amber-400/35 bg-amber-500/10 px-1.5 py-px text-[8px] font-black uppercase tracking-wider text-amber-200">sin nombre</span>}
        </p>
        <p className="truncate text-[10px] text-sky-100/80">
          {centro.nombrePerfil ? `Perfil: ${centro.nombrePerfil}${centro.usuario ? ` · @${centro.usuario.replace(/^@/, "")}` : ""}` : "Sin perfil cargado"}
        </p>
        <p className="truncate text-[10px] text-white/50">
          {centro.subtitulo} · {centro.textoMedios}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-semibold", COLOR_EMISION[centro.radar.emision])} title={centro.radar.motivo ?? centro.radar.titulo}>
          {centro.radar.emision === "publica" ? "visible en el radar" : centro.radar.emision === "anonima" ? "anónima en el radar" : "oculta del radar"}
        </span>
        <button
          type="button"
          onClick={onAjustes}
          aria-expanded={abierta}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-white/80 transition-colors duration-200 hover:border-sky-400/45 hover:text-white"
        >
          <Settings2 className="h-3 w-3" aria-hidden /> Ajustes de mi neurona
        </button>
      </div>
    </section>
  );
}

function Fila({ icono, titulo, nota, activo, onCambio, deshabilitado }: {
  icono: React.ReactNode; titulo: string; nota: string; activo: boolean; onCambio: (v: boolean) => void; deshabilitado?: boolean;
}) {
  return (
    <label className={cn("flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200", deshabilitado ? "opacity-50" : "cursor-pointer hover:border-emerald-400/25")}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-white/60" aria-hidden>{icono}</span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-white/90">{titulo}</span>
          <span className="block text-[9px] leading-snug text-white/45">{nota}</span>
        </span>
      </span>
      <Switch checked={activo} onCheckedChange={onCambio} disabled={deshabilitado} aria-label={titulo} />
    </label>
  );
}

const MODOS: { id: PublicRadarMode; texto: string; nota: string }[] = [
  { id: "anonymous", texto: "Anónima", nota: "participas en la malla pública sin nombre, foto ni posición" },
  { id: "visible", texto: "Visible", nota: "las demás cuentas ven lo que marques abajo" },
  { id: "off", texto: "Oculta", nota: "no emites faro: invisible entre cuentas" },
];

export function AjustesNeurona({ centro, neuronaId, verPublicos, onVerPublicos, onNombre }: {
  centro: CentroNeurona;
  /** Id de esta neurona en el registro de la cuenta; sin él se usa el del dispositivo. */
  neuronaId: string | null;
  verPublicos: boolean;
  onVerPublicos: (v: boolean) => void;
  /** Se llama al guardar un nombre nuevo (para pintarlo al momento). */
  onNombre: (nombre: string) => void;
}) {
  const { privacidad: p, internetPublico } = useMeshPrivacidad();
  const [nombre, setNombre] = useState(centro.sinNombre ? "" : centro.nombreNeurona);
  useEffect(() => { setNombre(centro.sinNombre ? "" : centro.nombreNeurona); }, [centro.nombreNeurona, centro.sinNombre]);
  const limpio = nombre.trim().slice(0, 40);
  const cambia = limpio.length > 0 && limpio !== (centro.sinNombre ? "" : centro.nombreNeurona);
  const actualizar = (parche: Partial<MeshPrivacySettings>) => setMeshPrivacy(parche);
  const radar = useMemo(() => describirRadarPublico({ privacidad: p, internetPublico, hayFoto: centro.avatar.modo === "foto" }), [p, internetPublico, centro.avatar.modo]);
  const publico = p.publicRadar === "visible";

  const guardar = () => {
    if (!cambia) return;
    const id = neuronaId || thisDeviceId();
    if (!id) { toast.error("Esta neurona aún no está registrada: vuelve a intentarlo en unos segundos."); return; }
    try {
      setNeuronName(id, limpio);
      onNombre(limpio);
      toast.success("Nombre de la neurona guardado", { description: "Se verá en todos tus aparatos en cuanto sincronicen." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el nombre");
    }
  };

  return (
    <section aria-label="Ajustes de mi neurona" data-testid="ajustes-neurona" className="space-y-2.5 rounded-2xl border border-white/10 bg-black/30 p-2.5">
      <div>
        <label htmlFor="nombre-neurona" className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
          <UserRound className="h-3.5 w-3.5 text-sky-300" aria-hidden /> Nombre de la neurona
        </label>
        <div className="flex gap-1.5">
          <input
            id="nombre-neurona"
            value={nombre}
            maxLength={40}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } }}
            placeholder="p. ej. Mac de casa"
            className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none transition-colors duration-200 placeholder:text-white/30 focus:border-sky-400/60"
          />
          <button
            type="button"
            onClick={guardar}
            disabled={!cambia}
            className="shrink-0 cursor-pointer rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-[10px] font-semibold text-sky-100 transition-colors duration-200 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
        <p className="mt-1 text-[9px] leading-snug text-white/40">El nombre es de este aparato y viaja con tu cuenta. La foto sale de tu perfil activo, no se edita aquí.</p>
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> Privacidad del radar público
        </p>
        <div role="radiogroup" aria-label="Cómo apareces en el radar público" className="mb-1.5 grid grid-cols-3 gap-1">
          {MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={p.publicRadar === m.id}
              onClick={() => actualizar({ publicRadar: m.id })}
              title={m.nota}
              className={cn(
                "cursor-pointer rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors duration-200",
                p.publicRadar === m.id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25",
              )}
            >
              {m.texto}
            </button>
          ))}
        </div>
        <p className="mb-1.5 text-[9px] leading-snug text-white/45">{MODOS.find((m) => m.id === p.publicRadar)?.nota}.</p>
        <div className="space-y-1.5">
          <Fila icono={<Tag className="h-3.5 w-3.5" />} titulo="Mostrar el nombre de mi neurona" nota="Solo en modo «Visible». Apagado, otras cuentas ven solo números." activo={p.shareName} onCambio={(v) => actualizar({ shareName: v })} deshabilitado={!publico} />
          <Fila icono={<UserRound className="h-3.5 w-3.5" />} titulo="Mostrar la foto de mi perfil" nota="Solo en modo «Visible». Se publica la dirección de tu foto actual." activo={p.shareAvatar} onCambio={(v) => actualizar({ shareAvatar: v })} deshabilitado={!publico} />
          <Fila icono={<Smartphone className="h-3.5 w-3.5" />} titulo="Mostrar el tipo de aparato" nota="Móvil, tablet o equipo de escritorio. Solo en modo «Visible»." activo={p.shareDevice} onCambio={(v) => actualizar({ shareDevice: v })} deshabilitado={!publico} />
          <Fila icono={<MapPin className="h-3.5 w-3.5" />} titulo="Compartir mi posición GPS" nota="Apagado por defecto: la ubicación es sensible." activo={p.sharePosition} onCambio={(v) => actualizar({ sharePosition: v })} deshabilitado={!publico} />
          <Fila icono={p.visibility === "account" ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} titulo="Visible para mis otras neuronas" nota="Apagado, esta neurona no publica nada (ni a tu cuenta ni al radar)." activo={p.visibility === "account"} onCambio={(v) => actualizar({ visibility: v ? "account" : "private" })} />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.025] px-2.5 py-2" aria-label="Así te ven las demás cuentas">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">Así te ven las demás cuentas</p>
        <p className="mb-1 text-[11px] font-semibold text-white/85">{radar.titulo}</p>
        {radar.motivo && <p className="text-[10px] leading-snug text-amber-200/90">{radar.motivo}.</p>}
        <ul className="space-y-0.5">
          {radar.lineas.map((l) => (
            <li key={l.etiqueta} className="flex items-start gap-1.5 text-[10px] leading-snug text-white/65">
              <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", l.visible ? "bg-emerald-400" : "bg-zinc-600")} aria-hidden />
              <span><span className="text-white/80">{l.etiqueta}:</span> {l.valor}</span>
            </li>
          ))}
        </ul>
      </div>

      <Fila
        icono={<Globe2 className="h-3.5 w-3.5" />}
        titulo="Ver los datos públicos de otras cuentas"
        nota="Nombre, foto y tipo de aparato de quien eligió ser «Visible». Apagado, todas se ven anónimas."
        activo={verPublicos}
        onCambio={onVerPublicos}
      />
    </section>
  );
}
