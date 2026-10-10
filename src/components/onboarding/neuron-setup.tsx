"use client";

/**
 * NeuronSetup — ajustes de una NEURONA NUEVA en una cuenta existente.
 * ============================================================================
 * Aparece cuando esta cuenta entra desde un dispositivo que aún no era neurona suya (la
 * app recién instalada, un navegador nuevo…). No vuelve a pedir datos de cuenta ni de
 * perfil: solo lo que es de ESTE dispositivo, en tres pasos cortos y todo opcional:
 *
 *   1. Nombre del dispositivo, qué llegó ya de la cuenta (escritorios, biblioteca, apps,
 *      ajustes) y la recomendación del agente según el hardware real. «Aceptar
 *      recomendación» termina aquí mismo con los valores por defecto.
 *   2. Qué puede hacer (cómputo, almacenamiento, sincronización, agente, sentidos) y qué
 *      se sincroniza (cerebros, biblioteca, memorias, otras neuronas, modo).
 *   3. Calidad del fondo animado en esta pantalla, y el acceso a «Todos los ajustes de
 *      esta neurona» (Configurar Neurona).
 *
 * Lo decide y lo abre el orquestador del primer arranque (primer-arranque.tsx). «Más
 * tarde» o Escape lo posponen (con la cuenta, por neurona); «Listo» deja la neurona
 * configurada (marca local + cuenta). Reconfigurable siempre en Ajustes.
 *
 * Persistencia entre medios (2026-09-29): si la cuenta YA tiene otras neuronas, lo primero que
 * se pregunta es «¿Es esta una neurona que ya configuraste?» (mismo equipo visto desde otro
 * medio): «Usar su configuración» adopta esa neurona y recarga; «Es otra neurona» sigue aquí.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain as BrainIcon, ChevronLeft, ChevronRight, CloudDownload, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PasoAnimado, useDireccionPaso } from "@/components/movimiento/paso-animado";
import { listBrains, type Brain } from "@/lib/brains/brains";
import {
  ensureThisNeuron, listNeurons, permissionsFor, setNeuronName, setNeuronSettings, setPermission, settingsFor, thisDeviceId,
  type NeuronPermissions,
} from "@/lib/neurons/neurons";
import {
  aparatoReconocido, candidatasPorAparato, usarConfiguracionDeNeurona, type NeuronaCandidata,
} from "@/lib/neurons/adopcion-neurona";
import { saveOnboarding } from "@/lib/onboarding/onboarding";
import { PreferenciasArranque } from "@/components/inicio/preferencias-arranque";
import { deviceId } from "@/lib/sync/entity-state";
import { detectar, recomendar, type HW } from "@/lib/onboarding/neuron-recommend";
import {
  creadaDesde, marcarNeuronaConfigurada, resumenSincronizado, type ConteoSincronizado,
} from "@/lib/onboarding/primer-arranque";
import { CLAVE_PREFERENCIA, leerPreferencia, PERFILES, type PreferenciaCalidadFondo } from "@/lib/perf/calidad-fondo";
import { guardarPreferenciaFondo } from "@/lib/perf/fondo-vivo";
import { getInstalled, getSaved } from "@/lib/library-store";
import AgentRecommendation from "./agent-recommendation";
import { AdoptarNeurona } from "./adoptar-neurona";
import { IconoStarSeed } from "./icono-starseed";

type ModoSync = "tiempo-real" | "al-abrir" | "manual";

/** Ventana a pantalla completa en el móvil y centrada en pantallas grandes. */
export const CLASES_VENTANA_ARRANQUE =
  "max-w-xl sm:max-h-[90dvh] max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:pt-[max(1.5rem,env(safe-area-inset-top))] max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]";

const PERMISOS: { clave: keyof NeuronPermissions; titulo: string; texto: string }[] = [
  { clave: "compute", titulo: "Cómputo", texto: "Presta su procesador a Aurora y a tus otras neuronas cuando está libre." },
  { clave: "storage", titulo: "Almacenamiento", texto: "Guarda copias de tus archivos y memorias para que no dependan de un solo sitio." },
  { clave: "sync", titulo: "Sincronización", texto: "Mantiene al día aquí tus escritorios, biblioteca y ajustes, en vivo." },
  { clave: "agent", titulo: "Agente", texto: "Acepta tareas de Aurora en este dispositivo, siempre con tu permiso." },
  { clave: "senses", titulo: "Sentidos", texto: "Comparte micrófono, cámara o pantalla con Aurora solo cuando se lo pidas." },
];

const PASOS = ["neurona", "permisos", "fondo", "arranque"] as const;
type Paso = (typeof PASOS)[number];

const TITULOS: Record<Paso, { titulo: string; texto: string }> = {
  neurona: {
    titulo: "Nueva neurona en tu cuenta",
    texto: "Este dispositivo acaba de unirse a tu cuenta. Ponle nombre y decide qué puede hacer: todo se puede cambiar después.",
  },
  permisos: {
    titulo: "Qué puede hacer esta neurona",
    texto: "Activa lo que quieras compartir con tus otras neuronas y con Aurora.",
  },
  fondo: {
    titulo: "Calidad del fondo en esta pantalla",
    texto: "El fondo animado se adapta solo; si prefieres, fija aquí su calidad para este dispositivo.",
  },
  // (Ola 381 · INI6) Pantalla inicial y bloqueo de ESTA neurona (la neurona manda sobre el perfil).
  arranque: {
    titulo: "Al abrir StarSeed aquí",
    texto: "Qué ves primero en este dispositivo y si lo proteges con un PIN, una contraseña o tu huella o rostro. Todo opcional.",
  },
};

function leerConteo(): ConteoSincronizado {
  let escritorios = 0;
  let ajustes = false;
  try {
    const crudo = window.localStorage.getItem("starseed.desktops.v1");
    const d = crudo ? (JSON.parse(crudo) as { desktops?: unknown[] }) : null;
    escritorios = Array.isArray(d?.desktops) ? d!.desktops!.length : 0;
    ajustes = ["starseed.sync.meta.v1", "starseed.dock.items.v2", "starseed.aurora.personalities.v1"].some(
      (k) => window.localStorage.getItem(k) !== null,
    );
  } catch { /* sin almacenamiento: se cuenta lo que se pueda */ }
  let biblioteca = 0;
  let apps = 0;
  try { biblioteca = getSaved().length; } catch { /* */ }
  try { apps = getInstalled().length; } catch { /* */ }
  return { escritorios, biblioteca, apps, ajustes };
}

/** Qué ha llegado ya de la cuenta; se actualiza mientras la sincronización trae más. */
function useConteoSincronizado(): ConteoSincronizado {
  const [c, setC] = useState<ConteoSincronizado>({ escritorios: 0, biblioteca: 0, apps: 0, ajustes: false });
  useEffect(() => {
    const leer = () => setC(leerConteo());
    leer();
    const eventos = ["starseed:library", "starseed:desktops", "starseed:sync:apply", "storage"];
    eventos.forEach((e) => window.addEventListener(e, leer));
    return () => eventos.forEach((e) => window.removeEventListener(e, leer));
  }, []);
  return c;
}

export interface NeuronSetupProps {
  /** Se llama al cerrarse por cualquier vía. */
  onClose: () => void;
  /** «Más tarde» / Escape: solo pospone (el orquestador no la reabre en esta visita). */
  onPosponer?: () => void;
  /** Nombre que ya tiene en la cuenta (si lo tiene). */
  nombreInicial?: string;
  /** Recarga la página tras adoptar otra neurona (solo las pruebas lo sustituyen). */
  recargar?: () => void;
}

/** Espera máxima a la lista de neuronas antes de seguir con el asistente normal. */
const ESPERA_LISTA_MS = 2500;

type Fase = "buscando" | "reconocida" | "adoptar" | "asistente";

/** Segundos que se enseña «Reconocí este aparato» antes de usar su configuración solo. */
const ESPERA_RECONOCIDA_S = 4;

export function NeuronSetup({ onClose, onPosponer, nombreInicial, recargar }: NeuronSetupProps) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("buscando");
  const [candidatas, setCandidatas] = useState<NeuronaCandidata[]>([]);
  const [propiaCreadaAhora, setPropiaCreadaAhora] = useState(false);
  const [adoptando, setAdoptando] = useState<string | null>(null);
  const [reconocida, setReconocida] = useState<NeuronaCandidata | null>(null);
  const [cuenta, setCuenta] = useState(ESPERA_RECONOCIDA_S);
  const [errorAdopcion, setErrorAdopcion] = useState<string | null>(null);
  const [cerebros, setCerebros] = useState<Brain[] | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [modo, setModo] = useState<ModoSync>("tiempo-real");
  const [hw, setHw] = useState<HW | null>(null);
  const [nombre, setNombre] = useState(nombreInicial ?? "");
  const [permisos, setPermisos] = useState<NeuronPermissions>(() => permissionsFor(thisDeviceId()));
  const [sincronizar, setSincronizar] = useState(() => {
    const s = settingsFor(thisDeviceId());
    return { biblioteca: s.syncLibrary !== false, memorias: s.syncBrains !== false, neuronas: s.syncNeurons !== false };
  });
  const [fondo, setFondo] = useState<PreferenciaCalidadFondo>("auto");
  const [paso, setPaso] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [aplicado, setAplicado] = useState(false);
  const conteo = useConteoSincronizado();
  const direccion = useDireccionPaso(paso);

  useEffect(() => {
    let alive = true;
    listBrains().then((bs) => {
      if (!alive) return;
      setCerebros(bs);
      const s: Record<string, boolean> = {};
      bs.forEach((b) => { s[b.id] = true; });
      setSel(s);
    }).catch(() => { if (alive) setCerebros([]); });
    detectar().then((h) => {
      if (!alive) return;
      setHw(h);
      setNombre((p) => p || `Neurona ${h.so}`);
    }).catch(() => { /* sin detección: el nombre queda para la persona */ });
    try { setFondo(leerPreferencia(window.localStorage.getItem(CLAVE_PREFERENCIA))); } catch { /* */ }
    return () => { alive = false; };
  }, []);

  // ¿La cuenta ya tiene otras neuronas? Entonces primero se pregunta si ESTA es una de ellas.
  useEffect(() => {
    let vivo = true;
    const seguir = (otras: NeuronaCandidata[], creadaAhora: boolean) => {
      if (!vivo) return;
      setPropiaCreadaAhora(creadaAhora);
      setCandidatas(otras);
      // (2026-10-09) Un solo aparato que la huella da por «mismo» → se reconoce sin preguntar.
      const seguro = aparatoReconocido(otras);
      if (seguro) {
        setReconocida(seguro);
        setFase("reconocida");
        return;
      }
      setFase(otras.some((c) => c.parecido !== "distinto") ? "adoptar" : "asistente");
    };
    const plazo = setTimeout(() => seguir([], false), ESPERA_LISTA_MS);
    // La ficha local (huella del aparato) nunca bloquea: si falla, se pregunta como siempre.
    Promise.all([listNeurons(), Promise.resolve().then(() => ensureThisNeuron()).catch(() => null)])
      .then(([todas, local]) => {
        clearTimeout(plazo);
        const propia = todas.find((n) => n.isThisDevice);
        let arranque = Date.now();
        try { if (Number.isFinite(performance.timeOrigin)) arranque = performance.timeOrigin; } catch { /* */ }
        const yo = (local ?? propia ?? null) as unknown as NeuronaCandidata | null;
        seguir(candidatasPorAparato(yo, todas as unknown as NeuronaCandidata[]), creadaDesde(propia?.created_at, arranque));
      })
      .catch(() => { clearTimeout(plazo); seguir([], false); });
    return () => { vivo = false; clearTimeout(plazo); };
  }, []);

  const usarSuConfiguracion = useCallback(async (n: NeuronaCandidata) => {
    setAdoptando(n.id);
    setErrorAdopcion(null);
    const r = await usarConfiguracionDeNeurona(n.id, { propiaCreadaAhora });
    if (!r.ok) {
      setAdoptando(null);
      setErrorAdopcion("No se pudo cambiar la identidad de este dispositivo (¿almacenamiento bloqueado?). Puedes seguir con el asistente.");
      return;
    }
    // El id de neurona lo leen muchos módulos al arrancar: recargar es lo único que los pone de acuerdo.
    (recargar ?? (() => window.location.reload()))();
  }, [propiaCreadaAhora, recargar]);

  // Aparato reconocido: cuenta atrás visible y adopción sola (con «No es este aparato» para frenar).
  useEffect(() => {
    if (fase !== "reconocida" || !reconocida) return;
    if (cuenta <= 0) {
      void usarSuConfiguracion(reconocida);
      return;
    }
    const t = setTimeout(() => setCuenta((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [fase, reconocida, cuenta, usarSuConfiguracion]);

  const razones = useMemo(() => {
    const r: string[] = [];
    if (cerebros === null) r.push("Buscando los cerebros de tu cuenta…");
    else if (cerebros.length === 0) r.push("Tu cuenta aún no tiene cerebros: esta neurona quedará lista y podrás crearlos en Cerebros.");
    else r.push(`Tu cuenta tiene ${cerebros.length} cerebro(s): recomiendo sincronizarlos todos aquí en tiempo real para que este dispositivo sea una ventana más de tu mismo sistema.`);
    if (hw) {
      const rec = recomendar(hw);
      if (rec.razones[0]) r.push(rec.razones[0]);
    }
    return r;
  }, [cerebros, hw]);

  const terminar = useCallback(async () => {
    setCargando(true);
    const id = thisDeviceId();
    const elegidos = Object.entries(sel).filter(([, v]) => v).map(([cid]) => cid);
    try { setNeuronName(id, nombre.trim() || "Mi neurona"); } catch { /* local */ }
    try {
      const antes = permissionsFor(id);
      for (const { clave } of PERMISOS) {
        if (antes[clave] !== permisos[clave]) setPermission(id, clave, permisos[clave]);
      }
      setNeuronSettings(id, {
        syncLibrary: sincronizar.biblioteca,
        syncBrains: sincronizar.memorias,
        syncNeurons: sincronizar.neuronas,
      });
    } catch { /* local: nunca bloquea el cierre */ }
    try { guardarPreferenciaFondo(fondo); } catch { /* */ }
    try {
      await saveOnboarding({
        steps: {
          neuronaNueva: { cerebros: elegidos, modo, so: hw?.so ?? null, permisos, sincronizar, fondo },
        },
      });
    } catch { /* best-effort: la marca local evita repetir */ }
    marcarNeuronaConfigurada(id);
    setAplicado(true);
    setCargando(false);
    onClose();
  }, [sel, modo, nombre, hw, permisos, sincronizar, fondo, onClose]);

  const posponer = useCallback(() => {
    (onPosponer ?? onClose)();
  }, [onPosponer, onClose]);

  const abrirTodosLosAjustes = useCallback(() => {
    void terminar().then(() => {
      // El «Configurar Neurona» completo vive en las rutas de la app; si aquí no está
      // montado, la cuenta tiene el panel de neuronas.
      const w = window as unknown as { openAuroraSetup?: (tab?: string) => void };
      if (typeof w.openAuroraSetup === "function") w.openAuroraSetup("neurona");
      else router.push("/cuenta");
    });
  }, [terminar, router]);

  const actual = PASOS[paso];
  const ultimo = paso === PASOS.length - 1;

  // «¿Es esta una neurona que ya configuraste?»: solo si la cuenta ya tiene otras neuronas.
  if (fase !== "asistente") {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) posponer(); }}>
        <DialogContent className={CLASES_VENTANA_ARRANQUE} aria-describedby="neurona-nueva-desc" data-testid="neurona-nueva-adoptar">
          <DialogHeader className="items-center text-center">
            <IconoStarSeed className="mx-auto" size={48} />
            <DialogTitle>
              {fase === "adoptar" ? "¿Es esta una neurona que ya configuraste?" : fase === "reconocida" ? "Reconocí este aparato" : "Nueva neurona en tu cuenta"}
            </DialogTitle>
            <DialogDescription id="neurona-nueva-desc">
              {fase === "adoptar"
                ? "Tu cuenta ya tiene otras neuronas. Si este navegador o app es una de ellas (el mismo aparato visto desde otro medio), usa su configuración y no repitas nada."
                : fase === "reconocida"
                  ? "Este navegador o app está en un aparato que ya es una neurona de tu cuenta: uso su configuración para que sea UNA sola neurona con un medio más."
                  : "Buscando las neuronas de tu cuenta…"}
            </DialogDescription>
          </DialogHeader>
          {fase === "reconocida" && reconocida ? (
            <div className="space-y-3" data-testid="neurona-reconocida">
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-3 text-sm">
                <p className="font-semibold text-emerald-50">{reconocida.name || "Tu aparato"}</p>
                {reconocida.motivos?.length ? (
                  <p className="mt-1 text-xs text-white/60">Coincide: {reconocida.motivos.slice(0, 4).join(", ")}.</p>
                ) : null}
                <p className="mt-2 text-xs text-white/70" aria-live="polite">
                  {adoptando ? "Cambiando…" : `Uso su configuración en ${cuenta} s.`}
                </p>
              </div>
              {errorAdopcion && (
                <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-100">{errorAdopcion}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button className="cursor-pointer" disabled={adoptando !== null} onClick={() => void usarSuConfiguracion(reconocida)}>
                  Usar ahora
                </Button>
                <Button
                  variant="outline"
                  className="cursor-pointer border-white/15"
                  disabled={adoptando !== null}
                  onClick={() => { setReconocida(null); setFase("adoptar"); }}
                >
                  No es este aparato
                </Button>
              </div>
            </div>
          ) : fase === "adoptar" ? (
            <AdoptarNeurona
              candidatas={candidatas}
              adoptando={adoptando}
              error={errorAdopcion}
              onUsar={(n) => void usarSuConfiguracion(n)}
              onOtra={() => setFase("asistente")}
            />
          ) : (
            <p role="status" className="text-center text-xs text-white/50">Un momento…</p>
          )}
          <div className="flex justify-start pt-1">
            <Button variant="ghost" size="sm" onClick={posponer} className="cursor-pointer" disabled={adoptando !== null}>Más tarde</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) posponer(); }}>
      <DialogContent className={CLASES_VENTANA_ARRANQUE} aria-describedby="neurona-nueva-desc">
        <DialogHeader className="items-center text-center">
          <IconoStarSeed className="mx-auto" size={48} />
          <DialogTitle>{TITULOS[actual].titulo}</DialogTitle>
          <DialogDescription id="neurona-nueva-desc">{TITULOS[actual].texto}</DialogDescription>
          <p className="text-[11px] text-white/45" aria-live="polite">Paso {paso + 1} de {PASOS.length}</p>
        </DialogHeader>

        <PasoAnimado clave={actual} direccion={direccion} className="space-y-4">
          {actual === "neurona" && (
            <>
              <label className="block text-sm">
                <span className="text-muted-foreground">Nombre de este dispositivo</span>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Por ejemplo: Portátil de casa"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                />
              </label>
              <div role="status" className="flex items-start gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.07] p-3 text-xs leading-relaxed text-emerald-50/90">
                <CloudDownload className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                <span data-testid="resumen-sincronizado">{resumenSincronizado(conteo)}</span>
              </div>
              <AgentRecommendation razones={razones} aplicado={aplicado} onAceptar={() => void terminar()} cargando={cargando} />
            </>
          )}

          {actual === "permisos" && (
            <>
              <ul className="space-y-2">
                {PERMISOS.map((p) => (
                  <li key={p.clave}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{p.titulo}</span>
                        <span className="block text-xs leading-snug text-muted-foreground">{p.texto}</span>
                      </span>
                      <Switch
                        checked={permisos[p.clave]}
                        onCheckedChange={(v) => setPermisos((x) => ({ ...x, [p.clave]: v }))}
                        aria-label={p.titulo}
                      />
                    </label>
                  </li>
                ))}
              </ul>
              <fieldset className="space-y-1.5">
                <legend className="mb-1 text-sm text-muted-foreground">Qué sincronizar aquí</legend>
                {(cerebros ?? []).map((b) => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
                    <input type="checkbox" checked={!!sel[b.id]}
                      onChange={(e) => setSel((s) => ({ ...s, [b.id]: e.target.checked }))}
                      className="h-4 w-4 accent-cyan-400" />
                    <BrainIcon className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                    {b.name || "Cerebro"}
                  </label>
                ))}
                {([
                  ["biblioteca", "La biblioteca de la cuenta"],
                  ["memorias", "Las memorias de tus cerebros"],
                  ["neuronas", "Con tus otras neuronas"],
                ] as const).map(([k, texto]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-sm">
                    <input type="checkbox" checked={sincronizar[k]}
                      onChange={(e) => setSincronizar((s) => ({ ...s, [k]: e.target.checked }))}
                      className="h-4 w-4 accent-cyan-400" />
                    {texto}
                  </label>
                ))}
              </fieldset>
              <label className="block text-sm">
                <span className="text-muted-foreground">Cuándo sincronizar</span>
                <select value={modo} onChange={(e) => setModo(e.target.value as ModoSync)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm">
                  <option value="tiempo-real">En tiempo real: misma cuenta, mismas ventanas, al instante (recomendado)</option>
                  <option value="al-abrir">Al abrir: se pone al día cada vez que entras</option>
                  <option value="manual">A mano: tú decides cuándo</option>
                </select>
              </label>
            </>
          )}

          {actual === "fondo" && (
            <>
              <fieldset className="space-y-1.5">
                <legend className="sr-only">Calidad del fondo animado</legend>
                {(["auto", "alta", "media", "baja", "minima"] as const).map((v) => (
                  <label
                    key={v}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors motion-reduce:transition-none",
                      fondo === v ? "border-cyan-400/50 bg-cyan-400/10" : "border-white/10 bg-white/[0.02]",
                    )}
                  >
                    <input type="radio" name="calidad-fondo" value={v} checked={fondo === v}
                      onChange={() => setFondo(v)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-white">{v === "auto" ? "Automática (recomendada)" : PERFILES[v].etiqueta}</span>
                      <span className="block text-xs text-muted-foreground">
                        {v === "auto" ? "Se ajusta sola a lo que este dispositivo puede mover en cada momento." : PERFILES[v].descripcion}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Button type="button" variant="outline" size="sm" onClick={abrirTodosLosAjustes} className="h-9 w-full gap-1.5 border-white/15 text-xs cursor-pointer">
                <Settings2 className="h-3.5 w-3.5" aria-hidden /> Todos los ajustes de esta neurona
              </Button>
            </>
          )}
          {actual === "arranque" && (
            // Mismo id de neurona que leen el arranque (/) y el montaje del bloqueo: deviceId().
            <PreferenciasArranque ambito="neurona" id={deviceId()} neuronaId={deviceId()} nombreNeurona={nombre.trim() || "Mi neurona"} />
          )}
        </PasoAnimado>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={posponer} className="cursor-pointer">Más tarde</Button>
          <div className="flex gap-2">
            {paso > 0 && (
              <Button variant="outline" size="sm" onClick={() => setPaso((p) => p - 1)} className="gap-1 cursor-pointer">
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
              </Button>
            )}
            {ultimo ? (
              <Button size="sm" onClick={() => void terminar()} disabled={cargando} className="cursor-pointer">
                {cargando ? "Guardando…" : "Listo"}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPaso((p) => p + 1)} className="gap-1 cursor-pointer">
                Siguiente <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NeuronSetup;
