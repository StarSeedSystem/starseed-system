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

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Eye, EyeOff, Globe2, MapPin, Settings2, ShieldCheck, Smartphone, Tag, UserRound, PlusCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_MESH_PRIVACY, getMeshPrivacy, MESH_PRIVACY_EVENT, setMeshPrivacy, type MeshPrivacySettings, type PublicRadarMode } from "@/ai/astraura/mesh/privacy";
import { CONNECTIVITY_EVENT, getConnectivitySettings } from "@/ai/astraura/mesh/connectivity";
import { setNeuronName, thisDeviceId, listNeurons, nombreEsteAparato, renombrarEsteAparato, type Neuron, type SetNeuronNameResult } from "@/lib/neurons/neurons";
import type { CentroNeurona } from "@/lib/senales/centro";
import { describirRadarPublico } from "@/lib/senales/radar-publico";
import { FotoPerfil } from "./foto-perfil";
import { InterruptorModoBanco } from "./internet/interruptor-modo-banco";
import { SugerenciaModoBanco } from "./internet/sugerencia-modo-banco";
import { getAjustesBanco, setAjustesBanco, AJUSTES_BANCO_EVENT, calcularRestanteHoyMb } from "@/lib/malla/internet/ajustes-banco";
import type { AjustesBanco, EstadoConexion, FuenteLimitada } from "@/lib/malla/internet/tipos";
import { clasificarConexion } from "@/lib/malla/internet/conexion-limitada";
import { SeccionInternet } from "./internet/seccion-internet";
import { TEXTOS_INTERNET, TEXTOS_EXTRA_INTERNET } from "@/lib/malla/internet/textos-internet";
import { aPreferenciasCompartida, guardarPreferenciasRed, leerPreferenciasRed, type PreferenciasRedAparato } from "@/lib/malla/preferencias-red-compartida";
import { sugerirComparticion } from "@/lib/malla/auto-compartir";
import type { PuertaInternet } from "@/lib/malla/cristal/puertas-internet";
import { estadoPuerta, suscribirPuerta, type PuertaVista } from "@/lib/malla/puerta/servicio";
import { aparatosDe, type AparatoDeNeurona } from "@/lib/neurons/aparatos-de-neurona";

// MAP1116 · el panel de red compartida pesa: se carga solo al abrir los ajustes del mapa.
const PanelRedCompartida = dynamic(
  () => import("./panel-red-compartida").then((m) => m.PanelRedCompartida),
  { ssr: false, loading: () => <p className="text-[10px] text-white/45">Cargando la red compartida…</p> },
);

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

/** Los ajustes del modo banco de ESTE dispositivo, vivos (se vuelven a leer al cambiar desde cualquier panel). */
export function useAjustesBanco(): { ajustes: AjustesBanco; restanteHoyMb: number | null } {
  const [ajustes, setAjustes] = useState<AjustesBanco>(() => getAjustesBanco());
  const [restanteHoyMb, setRestanteHoyMb] = useState<number | null>(() => {
    const a = getAjustesBanco();
    return calcularRestanteHoyMb(a, 0);
  });
  useEffect(() => {
    const leer = () => {
      const a = getAjustesBanco();
      setAjustes(a);
      setRestanteHoyMb(calcularRestanteHoyMb(a, 0));
    };
    leer();
    window.addEventListener(AJUSTES_BANCO_EVENT, leer);
    return () => window.removeEventListener(AJUSTES_BANCO_EVENT, leer);
  }, []);
  return { ajustes, restanteHoyMb };
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

// MAP1116 · puertas reales que ve el servicio de la malla. Lo que una puerta no declara (velocidad,
// latencia) no se inventa: `medida` es el dato real y el tope de subida es el que eligió el dueño.
function puertasParaSugerencia(puertas: readonly PuertaVista[], prefs: PreferenciasRedAparato): PuertaInternet[] {
  return puertas.map((p) => ({
    id: p.id,
    neurona: p.id,
    cuenta: p.id,
    tipo: "cable",
    bajadaKbps: prefs.kbpsSubidaMax,
    subidaKbps: prefs.kbpsSubidaMax,
    latenciaMs: 0,
    medida: p.medida,
    compartir: prefs.maximoCon,
  }));
}

function SeccionRedCompartida() {
  const [prefs, setPrefs] = useState<PreferenciasRedAparato>(() => leerPreferenciasRed());
  const servicio = useSyncExternalStore(suscribirPuerta, estadoPuerta, estadoPuerta);
  const puertas = useMemo(() => puertasParaSugerencia(servicio.puertas, prefs), [servicio.puertas, prefs]);
  const { decisiones } = useMemo(
    () => sugerirComparticion({
      puertas,
      preferencias: aPreferenciasCompartida(prefs),
      estado: { enWifi: true, cargando: false, bateriaPct: null, medida: false, usoMb: 0 },
      ahora: Date.now(),
    }),
    [puertas, prefs],
  );
  const cambiar = (patch: Partial<PreferenciasRedAparato>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      guardarPreferenciasRed(next);
      return next;
    });
  };
  return (
    <div className="space-y-1.5 border-t border-white/10 pt-2.5" data-testid="red-compartida">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
        <Globe2 className="h-3.5 w-3.5 text-sky-300" aria-hidden /> Internet que ofrece la red
      </p>
      <PanelRedCompartida preferencias={prefs} puertas={puertas} decisiones={decisiones} onCambiar={cambiar} />
      {puertas.length === 0 && (
        <p className="text-[9px] leading-snug text-white/45">este aparato no declara salida a internet</p>
      )}
    </div>
  );
}

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
  const { ajustes: banco, restanteHoyMb } = useAjustesBanco();
  const [nombre, setNombre] = useState(centro.sinNombre ? "" : centro.nombreNeurona);
  const [ultimaNegativa, setUltimaNegativa] = useState<number | null>(null);
  const [clasificacion, setClasificacion] = useState<{ estado: EstadoConexion; fuente: FuenteLimitada }>({
    estado: "desconocida",
    fuente: "ninguna",
  });
  const [aparatos, setAparatos] = useState<AparatoDeNeurona[]>([]);
  const [cargandoAparatos, setCargandoAparatos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nombreAparato, setNombreAparato] = useState("");
  const [guardandoAparato, setGuardandoAparato] = useState(false);
  interface ConexionInfo {
    type?: string;
    saveData?: boolean;
    effectiveType?: string;
    addEventListener: (evento: "change", listener: () => void) => void;
    removeEventListener: (evento: "change", listener: () => void) => void;
  }

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: ConexionInfo }).connection;
    if (!conn) return;
    const actualizar = () => {
      const entrada = {
        tipo: conn.type,
        saveData: conn.saveData,
        effectiveType: conn.effectiveType,
      };
      const resultado = clasificarConexion(entrada);
      setClasificacion({ estado: resultado.estado, fuente: resultado.fuente });
    };
    actualizar();
    conn.addEventListener("change", actualizar);
    return () => conn.removeEventListener("change", actualizar);
  }, []);

  // Cargar aparatos de esta neurona
  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const id = neuronaId || thisDeviceId();
        if (!id) { setAparatos([]); setCargandoAparatos(false); return; }
        const neuronas = await listNeurons();
        const neurona = neuronas.find((n) => n.id === id);
        if (neurona && !cancelado) {
          setAparatos(aparatosDe(neurona.capabilities));
        }
      } catch {
        // Silencioso: si falla, no se muestra la sección de aparatos
      } finally {
        if (!cancelado) setCargandoAparatos(false);
      }
    }
    cargar();
    return () => { cancelado = true; };
  }, [neuronaId]);

  useEffect(() => { setNombre(centro.sinNombre ? "" : centro.nombreNeurona); }, [centro.nombreNeurona, centro.sinNombre]);
  const limpio = nombre.trim().slice(0, 40);
  const cambia = limpio.length > 0 && limpio !== (centro.sinNombre ? "" : centro.nombreNeurona);
  const actualizar = (parche: Partial<MeshPrivacySettings>) => setMeshPrivacy(parche);
  const radar = useMemo(() => describirRadarPublico({ privacidad: p, internetPublico, hayFoto: centro.avatar.modo === "foto" }), [p, internetPublico, centro.avatar.modo]);
  const publico = p.publicRadar === "visible";
  const variosAparatos = aparatos.length > 1;

  const guardar = async () => {
    if (!cambia || guardando) return;
    const id = neuronaId || thisDeviceId();
    if (!id) { toast.error("Esta neurona aún no está registrada: vuelve a intentarlo en unos segundos."); return; }
    setGuardando(true);
    try {
      const resultado: SetNeuronNameResult = await setNeuronName(id, limpio);
      onNombre(limpio);
      if (resultado.ok) {
        toast.success("Nombre de la neurona guardado", { description: "Se verá en todos tus aparatos en cuanto sincronicen." });
      } else if (resultado.pending) {
        toast.info("Pendiente de sincronizar", { description: "Se reintentará en el próximo latido." });
      } else {
        toast.error(resultado.fallo?.message ?? "No se pudo guardar el nombre");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el nombre");
    } finally {
      setGuardando(false);
    }
  };

  const guardarAparato = async () => {
    const limpioAparato = nombreAparato.trim().slice(0, 60);
    const actual = nombreEsteAparato().trim();
    if (limpioAparato === actual || guardandoAparato) return;
    setGuardandoAparato(true);
    try {
      const ok = await renombrarEsteAparato(limpioAparato);
      if (ok) {
        setNombreAparato("");
        toast.success("Nombre del aparato guardado");
      } else {
        toast.error("No se pudo guardar el nombre del aparato");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el nombre del aparato");
    } finally {
      setGuardandoAparato(false);
    }
  };

  return (
    <section aria-label="Ajustes de mi neurona" data-testid="ajustes-neurona" className="space-y-2.5 rounded-2xl border border-white/10 bg-black/30 p-2.5">
      {cargandoAparatos ? (
        <div className="flex items-center gap-1.5 text-[11px] text-white/60">
          <div className="h-3 w-3 animate-pulse rounded-full bg-sky-400/50" aria-hidden />
          Cargando aparatos…
        </div>
      ) : (
        <>
          {variosAparatos && (
            <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Esta neurona la comparten {aparatos.length} aparatos: {aparatos.map((a) => a.nombre).join(", ")}.
              </p>
              <p className="mb-2 text-[9px] leading-snug text-amber-200/90">Lo recomendado es una neurona por aparato.</p>
              <button
                type="button"
                onClick={() => { /* TODO: abrir aparato-en-neurona.tsx */ }}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[10px] font-semibold text-amber-100 transition-colors duration-200 hover:bg-amber-500/25"
              >
                <PlusCircle className="h-3.5 w-3.5" aria-hidden /> Crear una neurona nueva para este aparato
              </button>
            </div>
          )}

          <div>
            <label htmlFor="nombre-neurona" className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
              <UserRound className="h-3.5 w-3.5 text-sky-300" aria-hidden />
              {variosAparatos ? "Nombre de la neurona" : "Nombre de la neurona"}
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
                disabled={!cambia || guardando}
                className="shrink-0 cursor-pointer rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-[10px] font-semibold text-sky-100 transition-colors duration-200 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
            <p className="mt-1 text-[9px] leading-snug text-white/40">
              {variosAparatos
                ? "Este nombre identifica a la neurona completa (la comparten varios aparatos)."
                : "El nombre es de este aparato y viaja con tu cuenta. La foto sale de tu perfil activo, no se edita aquí."}
            </p>
          </div>

          {variosAparatos && (
            <div>
              <label htmlFor="nombre-aparato" className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
                <Smartphone className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> Nombre de este aparato
              </label>
              <div className="flex gap-1.5">
                <input
                  id="nombre-aparato"
                  value={nombreAparato || nombreEsteAparato()}
                  maxLength={60}
                  onChange={(e) => setNombreAparato(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); guardarAparato(); } }}
                  placeholder="p. ej. Mi teléfono"
                  className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none transition-colors duration-200 placeholder:text-white/30 focus:border-emerald-400/60"
                />
                <button
                  type="button"
                  onClick={guardarAparato}
                  disabled={guardandoAparato || (nombreAparato.trim() === nombreEsteAparato().trim())}
                  className="shrink-0 cursor-pointer rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-100 transition-colors duration-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {guardandoAparato ? "Guardando…" : "Guardar"}
                </button>
              </div>
              <p className="mt-1 text-[9px] leading-snug text-white/40">Este nombre solo identifica a este aparato dentro de la neurona compartida.</p>
            </div>
          )}
        </>
      )}

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

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
          <Globe2 className="h-3.5 w-3.5 text-sky-300" aria-hidden /> Compartir internet
        </p>
        <InterruptorModoBanco
          activo={banco.activo}
          onCambiar={(activo) => {
            const next = { ...banco, activo };
            setAjustesBanco(next);
          }}
          textos={TEXTOS_INTERNET}
          restanteHoyMb={restanteHoyMb}
        />
        <SugerenciaModoBanco
          visible={!banco.activo && (ultimaNegativa == null || Date.now() - ultimaNegativa >= 24 * 60 * 60 * 1000)}
          onActivar={() => setAjustesBanco({ ...banco, activo: true })}
          onAhoraNo={() => setUltimaNegativa(Date.now())}
          textos={TEXTOS_INTERNET}
        />
      </div>

      <SeccionInternet
        textos={TEXTOS_INTERNET}
        extra={TEXTOS_EXTRA_INTERNET}
        clasificacion={clasificacion}
      />

      {/* MAP1116 · Red compartida: el panel de compartir internet vive aquí, en los ajustes del mapa. */}
      <SeccionRedCompartida />

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
