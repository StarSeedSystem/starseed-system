"use client";

/**
 * OnboardingWizard — guía de creación de cuenta de StarSeed OS, narrada por
 * Astraura (la voz de Aurora). Multi-paso, en español, visual y amable.
 *
 * Es una guía DINÁMICA: el usuario solo acepta permisos y elige opciones; no
 * hay configuración manual obligatoria (los valores por defecto ya vienen
 * listos). Funciona para cuentas con correo, para inicios sin contraseña (OTP)
 * y para INVITADOS anónimos (sin correo). Un invitado puede, desde aquí, añadir
 * un correo para convertir su sesión en una cuenta plena conservando todo.
 *
 * Pasos: Bienvenida (voz/texto) → Identidad (@handle único) → Correo StarSeed
 * → Recuperación → Datos opcionales → Guía de la red.
 *
 * Usa la capa de datos de @/lib/onboarding/onboarding (RLS por owner/user, así
 * que vale igual para invitados, que tienen un user.id real). Si el usuario
 * activa la voz, narra cada paso con Aurora (useAurora().speak). La narración de
 * texto ("explícame este paso") se apoya en @/ai/client/chat con la personalidad
 * de Aurora si hay un proveedor de IA activo; si no, degrada con elegancia.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAurora } from "@/components/aurora/aurora-provider";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import { buildSystemPrompt, DEFAULT_PERSONALITY } from "@/lib/aurora/types";
import {
  getOnboarding,
  saveOnboarding,
  isHandleAvailable,
  isValidHandle,
  sanitizeHandle,
  suggestHandles,
  claimProfile,
  suggestEmailVariants,
  isEmailAvailable,
  isValidStarseedAddress,
  claimStarseedEmail,
  getStarseedIdentity,
  setRecovery,
  requestVerification,
  confirmVerification,
  type RecoveryMethod,
  type ChannelStatus,
} from "@/lib/onboarding/onboarding";
import {
  Sparkles,
  Mic,
  Type as TypeIcon,
  AtSign,
  Mail,
  ShieldCheck,
  Image as ImageIcon,
  Compass,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Wand2,
  Send,
  MessageCircle,
  Phone,
  BadgeCheck,
  CircleDashed,
  Brain,
  BookOpen,
  Network,
  Vote,
  PenSquare,
  Globe,
  Link2,
  Lock,
  UserPlus,
  Volume2,
} from "lucide-react";

// ── narraciones de Astraura por paso ─────────────────────────────────────
const STEP_NARRATION: Record<number, string> = {
  0: "Hola, soy Astraura. Te doy la bienvenida a StarSeed. Voy a guiarte para dejar tu cuenta lista: solo aceptas y eliges, yo me encargo del resto. Puedo acompañarte por voz o seguimos en texto, como prefieras.",
  1: "Vamos a crear tu identidad en la red. Solo necesito tu nombre y un @handle único; te propongo opciones y lo demás es opcional.",
  2: "Si quieres, te creo tu dirección StarSeed: tu correo dentro de la red, algo arroba star punto seed. Funciona ya entre cuentas, y más tarde puedes vincular correos externos.",
  3: "Configuremos tu recuperación: un correo externo y un teléfono, para que nunca pierdas el acceso.",
  4: "Estos datos son opcionales: un avatar y una breve biografía. Puedes editarlos cuando quieras.",
  5: "Te muestro las áreas de la red: cómo vincular, conectar, crear, publicar y usar cada una.",
};

const STEPS = [
  { key: "bienvenida", label: "Bienvenida", icon: Sparkles },
  { key: "identidad", label: "Tu identidad", icon: AtSign },
  { key: "correo", label: "Correo StarSeed", icon: Mail },
  { key: "recuperacion", label: "Recuperación", icon: ShieldCheck },
  { key: "opcionales", label: "Datos opcionales", icon: ImageIcon },
  { key: "guia", label: "Guía de la red", icon: Compass },
] as const;

type AreaTip = {
  path: string;
  label: string;
  icon: any;
  tip: string;
  accent: string;
};

const AREAS: AreaTip[] = [
  { path: "/agent", label: "Agente · Aurora", icon: Brain, accent: "text-fuchsia-300", tip: "Usar: configura tu IA y habla con Aurora por voz o texto." },
  { path: "/memorias", label: "Memorias", icon: BookOpen, accent: "text-amber-300", tip: "Crear: guarda notas, ideas y archivos; vincúlalos en baúles." },
  { path: "/cerebros", label: "Cerebros", icon: Network, accent: "text-cyan-300", tip: "Conectar: enlaza memorias y skills en un grafo vivo." },
  { path: "/decisiones", label: "Decisiones", icon: Vote, accent: "text-emerald-300", tip: "Publicar: propón y vota decisiones de la red." },
  { path: "/pizarra", label: "Pizarra", icon: PenSquare, accent: "text-violet-300", tip: "Crear: dibuja y co-crea ideas en un lienzo compartido." },
  { path: "/navegador", label: "Navegador", icon: Globe, accent: "text-sky-300", tip: "Usar: explora la red y descubre contenidos y nodos." },
  { path: "/conexiones", label: "Conexiones", icon: Link2, accent: "text-pink-300", tip: "Vincular: enlaza personas, grupos y servicios externos." },
  { path: "/correos", label: "Correos · @star.seed", icon: Mail, accent: "text-cyan-300", tip: "Usar: tu correo interno @star.seed y vincula correos externos (DNS/sync)." },
  { path: "/seguridad", label: "Seguridad", icon: Lock, accent: "text-rose-300", tip: "Usar: gestiona claves, recuperación y privacidad." },
];

export default function OnboardingWizard({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const aurora = useAurora();

  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [voiceStarted, setVoiceStarted] = useState(false);

  // invitado (sesión anónima) → puede convertir a cuenta plena añadiendo correo
  const [isGuest, setIsGuest] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeSent, setUpgradeSent] = useState(false);

  // identidad
  const [fullName, setFullName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleState, setHandleState] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [handleSuggestions, setHandleSuggestions] = useState<string[]>([]);
  const [profileSaved, setProfileSaved] = useState(false);

  // correo StarSeed
  const [emailVariants, setEmailVariants] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [emailClaimed, setEmailClaimed] = useState(false);

  // recuperación
  const [recEmail, setRecEmail] = useState("");
  const [recPhone, setRecPhone] = useState("");
  const [recMethod, setRecMethod] = useState<RecoveryMethod>("telegram");
  const [channels, setChannels] = useState<Record<string, ChannelStatus>>({});
  const [pendingCode, setPendingCode] = useState<{ channel: RecoveryMethod | "email"; code: string } | null>(null);
  const [codeInput, setCodeInput] = useState("");

  // opcionales
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [bio, setBio] = useState("");

  // narración por IA
  const [astrauraText, setAstrauraText] = useState<string>(STEP_NARRATION[0]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── carga inicial del estado ──
  useEffect(() => {
    (async () => {
      const ob = await getOnboarding();
      setVoiceStarted(!!ob.voice_started);
      const id = await getStarseedIdentity();
      if (id) {
        if (id.address) { setAddress(id.address); setEmailClaimed(true); }
        if (id.recovery?.email) setRecEmail(id.recovery.email);
        if (id.recovery?.phone) setRecPhone(id.recovery.phone);
        if (id.recovery?.method) setRecMethod(id.recovery.method);
        if (id.verified) setChannels({ ...id.verified });
      }
      // Prefill de datos ya guardados en el perfil (datos REALES, owner-scoped).
      try {
        const sb = createClient();
        const { data: au } = await sb.auth.getUser();
        const me = au?.user;
        if (me) {
          // ¿Es invitado anónimo? Entonces ofrecemos convertir a cuenta plena.
          setIsGuest(!!(me as { is_anonymous?: boolean }).is_anonymous && !me.email);
          const { data: prof } = await sb
            .from("profiles")
            .select("display_name,handle,avatar_url,cover_url,bio")
            .eq("user_id", me.id)
            .single();
          if (prof) {
            const row = prof as Record<string, unknown>;
            if (row.display_name) setFullName(String(row.display_name));
            if (row.handle) { setHandle(String(row.handle)); setProfileSaved(true); }
            if (row.avatar_url) setAvatarUrl(String(row.avatar_url));
            if (row.cover_url) setCoverUrl(String(row.cover_url));
            if (row.bio) setBio(String(row.bio));
          }
        }
      } catch { /* prefill best-effort */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── narración de Astraura al cambiar de paso ──
  useEffect(() => {
    const base = STEP_NARRATION[step] || "";
    setAstrauraText(base);
    if (voiceStarted && aurora?.speak) {
      try { aurora.speak(base); } catch { /* */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── disponibilidad de @handle (debounced) ──
  useEffect(() => {
    if (handleTimer.current) clearTimeout(handleTimer.current);
    const h = handle.trim();
    if (!h) { setHandleState("idle"); return; }
    if (!isValidHandle(h)) { setHandleState("invalid"); return; }
    setHandleState("checking");
    handleTimer.current = setTimeout(async () => {
      const ok = await isHandleAvailable(h);
      setHandleState(ok ? "ok" : "taken");
      if (!ok) setHandleSuggestions(suggestHandles(fullName, h));
    }, 450);
    return () => { if (handleTimer.current) clearTimeout(handleTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  // ── disponibilidad de dirección StarSeed (debounced) ──
  useEffect(() => {
    if (emailTimer.current) clearTimeout(emailTimer.current);
    const a = address.trim().toLowerCase();
    if (!a) { setEmailState("idle"); return; }
    if (!isValidStarseedAddress(a)) { setEmailState("invalid"); return; }
    setEmailState("checking");
    emailTimer.current = setTimeout(async () => {
      const ok = await isEmailAvailable(a);
      setEmailState(ok ? "ok" : "taken");
    }, 450);
    return () => { if (emailTimer.current) clearTimeout(emailTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const closeAll = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  // ── empezar con voz (Aurora) ──
  const startVoice = useCallback(async () => {
    try {
      aurora?.setEnabled?.(true);
      setVoiceStarted(true);
      await saveOnboarding({ voice_started: true });
      const intro = STEP_NARRATION[0];
      setAstrauraText(intro);
      if (aurora?.supported && aurora?.speak) {
        aurora.speak(intro);
      } else {
        toast.message("Tu navegador no soporta voz", {
          description: "Seguimos en texto. Aurora narrará por escrito.",
        });
      }
    } catch {
      toast.error("No pude iniciar la voz de Aurora.");
    }
  }, [aurora]);

  // ── volver a leer en voz alta el texto actual de Astraura ──
  const speakCurrent = useCallback(() => {
    if (!aurora?.speak) {
      toast.message("Voz no disponible", { description: "Tu navegador no soporta la voz de Aurora." });
      return;
    }
    try { aurora.setEnabled?.(true); aurora.speak(astrauraText); setVoiceStarted(true); } catch { /* */ }
  }, [aurora, astrauraText]);

  // ── "explícame este paso" (chat-powered, con fallback) ──
  const explainStep = useCallback(async () => {
    setThinking(true);
    const fallback = STEP_NARRATION[step] || "Sigamos con tu configuración.";
    try {
      const hasProvider = loadConfigs().some((c) => c.enabled);
      if (!hasProvider) {
        setAstrauraText(fallback);
        if (voiceStarted && aurora?.speak) aurora.speak(fallback);
        return;
      }
      const stepLabel = STEPS[step]?.label || "este paso";
      const guestCtx = isGuest
        ? " El usuario entró como invitado (sin cuenta); anímale con calidez a que, si quiere, añada un correo para conservar todo, pero deja claro que es opcional."
        : "";
      const res = await chat({
        messages: [
          { role: "system", content: buildSystemPrompt(aurora?.activePersonality || DEFAULT_PERSONALITY) },
          {
            role: "user",
            content: `Eres Astraura, guía de StarSeed. Explica de forma breve, cálida y clara (2-3 frases, español, para leer en voz alta) el paso de onboarding "${stepLabel}". El usuario solo acepta y elige; no hay que configurar nada a mano.${guestCtx} No uses listas ni markdown.`,
          },
        ],
        temperature: 0.6,
      });
      const reply = (res?.text || "").replace(/\[\[goto:[^\]]+\]\]/gi, "").trim() || fallback;
      setAstrauraText(reply);
      if (voiceStarted && aurora?.speak) aurora.speak(reply);
    } catch {
      setAstrauraText(fallback);
      if (voiceStarted && aurora?.speak) aurora.speak(fallback);
    } finally {
      setThinking(false);
    }
  }, [step, voiceStarted, aurora, isGuest]);

  // ── invitado → cuenta plena: añade un correo a la sesión anónima ──
  // Supabase enlaza el correo al MISMO usuario (mismo user.id), así que el
  // invitado conserva su identidad, @handle y datos al confirmar el enlace.
  const upgradeGuest = useCallback(async () => {
    const addr = upgradeEmail.trim();
    if (!addr) { toast.error("Escribe un correo para tu cuenta."); return; }
    setUpgradeBusy(true);
    try {
      const sb = createClient();
      const emailRedirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error } = await sb.auth.updateUser(
        { email: addr },
        emailRedirectTo ? { emailRedirectTo } : undefined,
      );
      if (error) {
        const m = (error.message || "").toLowerCase();
        if (m.includes("already")) toast.error("Ese correo ya tiene cuenta. Inicia sesión con él.");
        else toast.error(error.message || "No se pudo añadir el correo.");
        return;
      }
      setUpgradeSent(true);
      // Prefill útil: usa ese correo también como recuperación.
      if (!recEmail) setRecEmail(addr);
      toast.success("Te enviamos un enlace para confirmar tu correo.");
    } catch (e) {
      toast.error((e as Error)?.message || "No se pudo añadir el correo.");
    } finally {
      setUpgradeBusy(false);
    }
  }, [upgradeEmail, recEmail]);

  // ── acciones por paso ──
  const doClaimProfile = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    const res = await claimProfile({ fullName, handle: handle.trim().toLowerCase() });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "No se pudo guardar el perfil."); return false; }
    setProfileSaved(true);
    toast.success("Identidad creada en la red.");
    // pre-sugerir variantes de correo
    setEmailVariants(suggestEmailVariants(handle, fullName));
    return true;
  }, [fullName, handle]);

  const doClaimEmail = useCallback(async (): Promise<boolean> => {
    const a = address.trim().toLowerCase();
    if (!a) return true; // opcional
    setBusy(true);
    const res = await claimStarseedEmail(a, [a]);
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "No se pudo reclamar la dirección."); return false; }
    setEmailClaimed(true);
    toast.success("Dirección StarSeed reservada.");
    return true;
  }, [address]);

  const doSetRecovery = useCallback(async (): Promise<boolean> => {
    if (!recEmail && !recPhone) return true; // opcional
    setBusy(true);
    const res = await setRecovery({ email: recEmail || undefined, phone: recPhone || undefined, method: recMethod });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "No se pudo guardar la recuperación."); return false; }
    toast.success("Recuperación registrada.");
    return true;
  }, [recEmail, recPhone, recMethod]);

  const doVerify = useCallback(async (channel: RecoveryMethod | "email") => {
    setBusy(true);
    const ticket = await requestVerification(channel);
    setBusy(false);
    if (!ticket.ok) { toast.error(ticket.error || "No se pudo iniciar la verificación."); return; }
    setChannels((c) => ({ ...c, [channel]: ticket.status }));
    if (ticket.code) {
      setPendingCode({ channel, code: ticket.code });
      setCodeInput("");
    }
    toast.message(ticket.live ? "Verificación enviada" : "Flujo registrado", {
      description: ticket.note,
    });
  }, []);

  const doConfirmCode = useCallback(async () => {
    if (!pendingCode) return;
    setBusy(true);
    const res = await confirmVerification(pendingCode.channel, codeInput, pendingCode.code);
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "Código incorrecto."); return; }
    setChannels((c) => ({ ...c, [pendingCode.channel]: "verificado" }));
    setPendingCode(null);
    setCodeInput("");
    toast.success("Canal verificado.");
  }, [pendingCode, codeInput]);

  const doSaveOptional = useCallback(async (): Promise<boolean> => {
    if (!avatarUrl && !coverUrl && !bio) return true;
    setBusy(true);
    const res = await claimProfile({
      fullName,
      handle: handle.trim().toLowerCase(),
      optional: {
        avatar_url: avatarUrl || undefined,
        cover_url: coverUrl || undefined,
        bio: bio || undefined,
      },
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error || "No se pudieron guardar los datos."); return false; }
    toast.success("Datos guardados.");
    return true;
  }, [avatarUrl, coverUrl, bio, fullName, handle]);

  // ── navegación entre pasos (con guardas por paso) ──
  const canAdvance = useMemo(() => {
    if (step === 1) return profileSaved || (handleState === "ok" && fullName.trim().length > 0);
    return true;
  }, [step, profileSaved, handleState, fullName]);

  const next = useCallback(async () => {
    // ejecuta la acción de persistencia del paso antes de avanzar
    if (step === 1 && !profileSaved) {
      const ok = await doClaimProfile();
      if (!ok) return;
    }
    if (step === 2 && address.trim() && !emailClaimed) {
      const ok = await doClaimEmail();
      if (!ok) return;
    }
    if (step === 3) {
      const ok = await doSetRecovery();
      if (!ok) return;
    }
    if (step === 4) {
      const ok = await doSaveOptional();
      if (!ok) return;
    }
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      await saveOnboarding({ steps: { last: step + 1 } });
    }
  }, [step, profileSaved, address, emailClaimed, doClaimProfile, doClaimEmail, doSetRecovery, doSaveOptional]);

  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const finish = useCallback(async () => {
    setBusy(true);
    await saveOnboarding({ completed: true, steps: { last: STEPS.length - 1 } });
    setBusy(false);
    toast.success("¡Bienvenida completada!");
    closeAll();
  }, [closeAll]);

  const skip = useCallback(async () => {
    await saveOnboarding({ completed: true });
    closeAll();
  }, [closeAll]);

  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const StepIcon = STEPS[step].icon;

  // Bloque reutilizable: "convertir invitado en cuenta plena" (correo opcional).
  const GuestUpgrade = (
    <div className="rounded-2xl border border-fuchsia-500/25 bg-fuchsia-950/15 p-3.5 text-left space-y-2">
      <div className="flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-fuchsia-300" />
        <span className="text-[12px] font-semibold text-white/90">Estás explorando como invitado</span>
        <Badge variant="outline" className="text-[9px] border-fuchsia-400/40 text-fuchsia-200">invitado</Badge>
      </div>
      <p className="text-[11.5px] text-white/60 leading-snug">
        Puedes usar todo ya mismo. Si quieres <b className="text-white/85">conservar tu cuenta</b> y entrar desde otros dispositivos,
        añade un correo: enlazaremos tu sesión actual (misma identidad y datos) a una cuenta plena.
      </p>
      {upgradeSent ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/10 px-3 py-2 text-[12px] text-emerald-300 flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 shrink-0" /> Te enviamos un enlace a {upgradeEmail}. Ábrelo para confirmar tu cuenta.
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            type="email"
            value={upgradeEmail}
            onChange={(e) => setUpgradeEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="bg-white/5"
          />
          <Button size="sm" disabled={upgradeBusy || !upgradeEmail} onClick={upgradeGuest} className="shrink-0 gap-1 bg-gradient-to-r from-fuchsia-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 text-white">
            {upgradeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Guardar cuenta
          </Button>
        </div>
      )}
      <p className="text-[10.5px] text-white/40">Es opcional: puedes seguir como invitado y añadir el correo cuando quieras.</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) skip(); setOpen(v); }}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-fuchsia-500 via-purple-500 to-cyan-400 flex items-center justify-center shrink-0 shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-left">Bienvenida · Guía de StarSeed con Astraura</DialogTitle>
              <DialogDescription className="text-left">
                Paso {step + 1} de {STEPS.length}: {STEPS[step].label}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* progreso */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                "h-1 flex-1 rounded-full transition-all",
                i <= step ? "bg-gradient-to-r from-fuchsia-400 to-cyan-400" : "bg-white/10",
              )}
            />
          ))}
        </div>

        {/* narración de Astraura */}
        <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-400 flex items-center justify-center shrink-0">
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-fuchsia-300/70 font-semibold mb-0.5 flex items-center gap-2">
              Astraura
              {voiceStarted && <Badge variant="outline" className="text-[9px] border-fuchsia-400/40 text-fuchsia-200">voz activa</Badge>}
            </div>
            <p className="text-sm text-white/85 leading-snug">{astrauraText}</p>
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <button
                onClick={explainStep}
                disabled={thinking}
                className="inline-flex items-center gap-1 text-[11px] text-cyan-300/80 hover:text-cyan-200 disabled:opacity-50"
              >
                {thinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
                Explícame este paso
              </button>
              {aurora?.supported && (
                <button
                  onClick={speakCurrent}
                  className="inline-flex items-center gap-1 text-[11px] text-fuchsia-300/80 hover:text-fuchsia-200"
                >
                  <Volume2 className="w-3 h-3" /> Escuchar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* contenido por paso */}
        <div className="min-h-[260px]">
          {/* 0 · Bienvenida */}
          {step === 0 && (
            <div className="space-y-4 text-center py-2">
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-300 via-purple-300 to-cyan-200">
                Te damos la bienvenida a StarSeed
              </h2>
              <p className="text-sm text-white/60 max-w-md mx-auto">
                Una red abierta y segura. Astraura te acompañará paso a paso: solo aceptas y eliges, sin configurar nada a mano. ¿Cómo prefieres empezar?
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <button
                  onClick={startVoice}
                  className={cn(
                    "p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.02]",
                    voiceStarted ? "border-fuchsia-400 bg-fuchsia-500/10 shadow-[0_0_30px_rgba(217,70,239,0.25)]" : "border-white/10 hover:border-fuchsia-400/50 bg-white/[0.02]",
                  )}
                >
                  <Mic className="w-8 h-8 text-fuchsia-300 mb-2" />
                  <h3 className="font-bold text-base mb-1">Empezar con voz (Aurora)</h3>
                  <p className="text-xs text-white/55">Activa la guía de voz inteligente. Aurora te explica y navega contigo.</p>
                </button>
                <button
                  onClick={() => { setVoiceStarted(false); setAstrauraText(STEP_NARRATION[0]); }}
                  className={cn(
                    "p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.02]",
                    !voiceStarted ? "border-cyan-400 bg-cyan-500/10" : "border-white/10 hover:border-cyan-400/50 bg-white/[0.02]",
                  )}
                >
                  <TypeIcon className="w-8 h-8 text-cyan-300 mb-2" />
                  <h3 className="font-bold text-base mb-1">Continuar en texto</h3>
                  <p className="text-xs text-white/55">Sigue la guía leyendo. Puedes activar la voz cuando quieras.</p>
                </button>
              </div>

              {/* Invitado: convertir a cuenta plena (opcional) */}
              {isGuest && GuestUpgrade}

              {/* Permisos / qué deja lista esta guía — sin configuración manual */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                  <span className="text-[12px] font-semibold text-white/85">Qué prepara esta guía contigo</span>
                </div>
                <ul className="space-y-1.5 text-[12px] text-white/60">
                  <li className="flex items-start gap-2"><AtSign className="w-3.5 h-3.5 text-fuchsia-300 mt-0.5 shrink-0" /> Tu identidad en la red: nombre y un <b className="text-white/80">@handle</b> único (sugerido, editable).</li>
                  <li className="flex items-start gap-2"><Mail className="w-3.5 h-3.5 text-cyan-300 mt-0.5 shrink-0" /> Tu dirección interna <b className="text-white/80">@star.seed</b> (opcional, también puedes crearla luego).</li>
                  <li className="flex items-start gap-2"><ImageIcon className="w-3.5 h-3.5 text-violet-300 mt-0.5 shrink-0" /> Avatar, portada y bio (opcionales, editables cuando quieras).</li>
                  <li className="flex items-start gap-2"><Lock className="w-3.5 h-3.5 text-rose-300 mt-0.5 shrink-0" /> Solo aceptas y eliges: no hay que configurar nada a mano. Tus datos son tuyos y privados por defecto.</li>
                </ul>
              </div>
              {!aurora?.supported && (
                <p className="text-[11px] text-amber-300/70">Nota: tu navegador podría no soportar voz; en ese caso Astraura narra por texto.</p>
              )}
            </div>
          )}

          {/* 1 · Identidad */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Nombre completo <span className="text-rose-300">*</span></label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre y apellidos" className="bg-white/5" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">@handle único en la red <span className="text-rose-300">*</span></label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(sanitizeHandle(e.target.value))}
                    placeholder="tu_handle"
                    className="bg-white/5 pl-9 pr-9"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {handleState === "checking" && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
                    {handleState === "ok" && <Check className="w-4 h-4 text-emerald-400" />}
                    {(handleState === "taken" || handleState === "invalid") && <CircleDashed className="w-4 h-4 text-rose-400" />}
                  </div>
                </div>
                <div className="text-[11px] min-h-[16px]">
                  {handleState === "ok" && <span className="text-emerald-400">¡Disponible! @{handle} es tuyo.</span>}
                  {handleState === "taken" && <span className="text-rose-400">Ese @handle ya está en uso.</span>}
                  {handleState === "invalid" && <span className="text-amber-400">3-20 caracteres: a-z, 0-9, _</span>}
                  {handleState === "idle" && <span className="text-white/30">Tu identidad pública en StarSeed.</span>}
                </div>
                {handleState === "taken" && handleSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {handleSuggestions.map((s) => (
                      <button key={s} onClick={() => setHandle(s)} className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-[11px] text-cyan-200 hover:bg-cyan-500/20">
                        @{s}
                      </button>
                    ))}
                  </div>
                )}
                {fullName.trim() && handleState === "idle" && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[11px] text-white/40 mr-1">Sugerencias:</span>
                    {suggestHandles(fullName).slice(0, 4).map((s) => (
                      <button key={s} onClick={() => setHandle(s)} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/70 hover:bg-white/10">
                        @{s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {profileSaved && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/10 px-3 py-2 text-[12px] text-emerald-300 flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4" /> Identidad guardada como @{handle}.
                </div>
              )}
              <p className="text-[11px] text-white/40">Solo el nombre y el @handle son obligatorios. Todo lo demás es opcional y editable.</p>
            </div>
          )}

          {/* 2 · Correo StarSeed */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-3.5 space-y-2.5">
                <div className="flex items-start gap-2 text-[12px] text-cyan-100/90">
                  <Mail className="w-4 h-4 mt-0.5 shrink-0 text-cyan-300" />
                  <span>
                    Tu dirección <b>@star.seed</b> es tu nombre de correo <b>dentro</b> de la red StarSeed.
                    Funciona ya entre cuentas del ecosistema: el correo interno se enruta directo a tu bandeja,
                    sin depender de un proveedor externo.
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80 mb-0.5">
                      <Network className="w-3.5 h-3.5 text-cyan-300" /> Cómo funciona dentro
                    </div>
                    <p className="text-[11px] text-white/55 leading-snug">
                      Cada dirección tiene su enrutado interno (mx, puertos, routing) con valores por defecto ya listos.
                      No necesitas tocar nada para enviar y recibir entre cuentas StarSeed.
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80 mb-0.5">
                      <Link2 className="w-3.5 h-3.5 text-fuchsia-300" /> Vincular correo externo
                    </div>
                    <p className="text-[11px] text-white/55 leading-snug">
                      Puedes enlazar correos externos (Gmail, etc.) a tu cuenta y activar la sincronización ↔ externo
                      mediante DNS/proveedor. El interno funciona ya; el externo se conecta cuando lo configures.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-cyan-200/60"><i>Honesto:</i> el envío/recepción externo real requiere DNS + proveedor; el interno @star.seed ya está activo.</span>
                  <Link href="/correos" className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 shrink-0">
                    Gestionar correos <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
              {emailVariants.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Variantes sugeridas</label>
                  <div className="flex flex-wrap gap-1.5">
                    {emailVariants.map((v) => (
                      <button
                        key={v}
                        onClick={() => setAddress(v)}
                        className={cn(
                          "px-2.5 py-1 rounded-full border text-[12px] transition-colors",
                          address === v ? "border-cyan-400 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">O escribe tu dirección</label>
                <div className="relative">
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value.toLowerCase())}
                    placeholder="algo@star.seed"
                    className="bg-white/5 pr-9 font-mono"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {emailState === "checking" && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
                    {emailState === "ok" && <Check className="w-4 h-4 text-emerald-400" />}
                    {(emailState === "taken" || emailState === "invalid") && <CircleDashed className="w-4 h-4 text-rose-400" />}
                  </div>
                </div>
                <div className="text-[11px] min-h-[16px]">
                  {emailState === "ok" && <span className="text-emerald-400">Disponible.</span>}
                  {emailState === "taken" && <span className="text-rose-400">Esa dirección ya está tomada.</span>}
                  {emailState === "invalid" && <span className="text-amber-400">Debe terminar en @star.seed</span>}
                </div>
              </div>
              {emailClaimed && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/10 px-3 py-2 text-[12px] text-emerald-300 flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4" /> {address} reservada.
                </div>
              )}
              <p className="text-[11px] text-white/40">Puedes omitir este paso y crear o vincular tu dirección más tarde en <Link href="/correos" className="text-cyan-300/80 hover:text-cyan-200 underline underline-offset-2">/correos</Link>.</p>
            </div>
          )}

          {/* 3 · Recuperación */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Para invitados, este correo también convierte la sesión en cuenta plena. */}
              {isGuest && GuestUpgrade}
              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Correo externo (recuperación)</label>
                <div className="flex gap-2">
                  <Input type="email" value={recEmail} onChange={(e) => setRecEmail(e.target.value)} placeholder="tu@correo.com" className="bg-white/5" />
                  <Button size="sm" variant="outline" disabled={!recEmail || busy} onClick={() => doVerify("email")} className="shrink-0 gap-1">
                    <Send className="w-3.5 h-3.5" /> Verificar
                  </Button>
                </div>
                <ChannelBadge status={channels.email} live={false} pendingLabel="registrado" />
              </div>

              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Teléfono (recuperación)</label>
                <div className="flex gap-2">
                  <Input value={recPhone} onChange={(e) => setRecPhone(e.target.value)} placeholder="+34 600 000 000" className="bg-white/5" />
                </div>
              </div>

              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Método de confirmación</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "telegram", label: "Telegram", icon: MessageCircle, live: true },
                    { id: "whatsapp", label: "WhatsApp", icon: Phone, live: false },
                    { id: "sms", label: "SMS", icon: Phone, live: false },
                  ] as { id: RecoveryMethod; label: string; icon: any; live: boolean }[]).map((m) => {
                    const Icon = m.icon;
                    const sel = recMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setRecMethod(m.id)}
                        className={cn(
                          "p-2.5 rounded-xl border-2 text-left transition-all",
                          sel ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 hover:border-white/30 bg-white/[0.02]",
                        )}
                      >
                        <Icon className="w-4 h-4 mb-1 text-emerald-300" />
                        <div className="text-[12px] font-semibold">{m.label}</div>
                        <div className={cn("text-[10px]", m.live ? "text-emerald-400/70" : "text-amber-300/70")}>
                          {m.live ? "registrable" : "pendiente de proveedor"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" disabled={(!recPhone && recMethod !== "telegram") || busy} onClick={() => doVerify(recMethod)} className="gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verificar por {recMethod}
                  </Button>
                  <ChannelBadge status={channels[recMethod]} live={recMethod === "telegram"} pendingLabel={recMethod === "telegram" ? "registrado" : "pendiente"} />
                </div>
              </div>

              {pendingCode && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/10 p-3 space-y-2">
                  <div className="text-[12px] text-cyan-200/80">
                    Flujo registrado para <b>{pendingCode.channel}</b>. No se envía a un proveedor externo todavía;
                    para completar el flujo, introduce el código generado: <b className="font-mono">{pendingCode.code}</b>
                  </div>
                  <div className="flex gap-2">
                    <Input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Código de 6 dígitos" className="bg-white/5 font-mono" />
                    <Button size="sm" disabled={busy || !codeInput} onClick={doConfirmCode} className="shrink-0">Confirmar</Button>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-white/40">
                Hoy: <b>Telegram</b> y <b>correo externo</b> se registran como canal de recuperación. <b>SMS</b> y <b>WhatsApp</b> quedan <i>pendientes de proveedor</i>. Todo es opcional.
              </p>
            </div>
          )}

          {/* 4 · Datos opcionales */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">URL del avatar (opcional)</label>
                <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…/tu-avatar.png" className="bg-white/5 font-mono text-xs" />
              </div>
              {avatarUrl && (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt="avatar" className="w-12 h-12 rounded-full object-cover border border-white/10" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
                  <span className="text-[11px] text-white/40">Vista previa</span>
                </div>
              )}
              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">URL de la portada (opcional)</label>
                <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…/tu-portada.jpg" className="bg-white/5 font-mono text-xs" />
              </div>
              {coverUrl && (
                <div className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverUrl} alt="portada" className="w-full h-20 rounded-lg object-cover border border-white/10" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
                  <span className="text-[11px] text-white/40">Vista previa de la portada</span>
                </div>
              )}
              <div className="grid gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">Biografía (opcional)</label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Cuéntale a la red quién eres…" className="bg-white/5 text-sm" />
              </div>
              <p className="text-[11px] text-white/40">Todo esto es opcional y podrás editarlo cuando quieras desde tu perfil.</p>
            </div>
          )}

          {/* 5 · Guía de la red */}
          {step === 5 && (
            <div className="space-y-3">
              <p className="text-sm text-white/60">
                Estas son las áreas de StarSeed. Cada tarjeta te dice cómo vincular, conectar, crear, publicar o usar. Ábrelas cuando quieras.
              </p>
              {isGuest && !upgradeSent && (
                <div className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-950/15 p-3 text-[12px] text-fuchsia-100/85 flex items-start gap-2">
                  <UserPlus className="w-4 h-4 shrink-0 mt-0.5 text-fuchsia-300" />
                  <span>Sigues como invitado. Cuando quieras conservar tu cuenta para siempre, añade un correo en <Link href="/seguridad" className="underline underline-offset-2 text-fuchsia-200 hover:text-white">/seguridad</Link> o vuelve a esta guía.</span>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-2">
                {AREAS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <Link
                      key={a.path}
                      href={a.path}
                      className="group rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 p-3 transition-all"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={cn("w-4 h-4", a.accent)} />
                        <span className="text-sm font-semibold text-white/90">{a.label}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-white/30 ml-auto group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <p className="text-[11px] text-white/50 leading-snug">{a.tip}</p>
                    </Link>
                  );
                })}
              </div>
              <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-3 text-[12px] text-fuchsia-200/80 flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0" />
                Puedes volver a esta guía cuando quieras desde <b>/bienvenida</b>. Aurora estará disponible en cualquier sección.
              </div>
            </div>
          )}
        </div>

        {/* navegación */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10 mt-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0} className="text-xs">
              <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Anterior
            </Button>
            <button onClick={skip} className="text-[11px] text-white/40 hover:text-white/70">Saltar por ahora</button>
          </div>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={next} disabled={busy || !canAdvance} className="gap-1 bg-gradient-to-r from-fuchsia-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 text-white">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {step === 1 && !profileSaved ? "Crear identidad" : "Continuar"}
                {!busy && <ChevronRight className="w-3.5 h-3.5" />}
              </Button>
            ) : (
              <Button size="sm" onClick={finish} disabled={busy} className="gap-1 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Finalizar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChannelBadge({ status, live, pendingLabel }: { status?: ChannelStatus; live: boolean; pendingLabel: string }) {
  if (!status) {
    return <span className="text-[11px] text-white/30">{live ? "Listo para registrar." : `${pendingLabel} de proveedor.`}</span>;
  }
  if (status === "verificado") {
    return <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400"><BadgeCheck className="w-3.5 h-3.5" /> verificado</span>;
  }
  if (status === "registrado") {
    return <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300"><Check className="w-3.5 h-3.5" /> registrado</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[11px] text-amber-300"><CircleDashed className="w-3.5 h-3.5" /> pendiente</span>;
}
