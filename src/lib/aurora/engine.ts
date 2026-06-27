"use client";

/**
 * useAuroraEngine — el motor de voz de Aurora (la voz de Astraura).
 * STT vía Web Speech API, TTS vía speechSynthesis, enrutado de comandos
 * en español + fallback a Astraura. SSR-safe: todo acceso a window/navigator
 * va dentro de efectos o manejadores de eventos con guardas typeof.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import {
  DEFAULT_PERSONALITY,
  DEFAULT_SETTINGS,
  buildSystemPrompt,
  type AuroraSettings,
  type Personality,
} from "@/lib/aurora/types";
import {
  createQuickMemory,
  getSettings,
  listPersonalities,
  saveSettings,
  searchMemories,
} from "@/lib/aurora/personalities";

type Voice = { name: string; lang: string; voiceURI: string; default?: boolean };

const ROUTES: { keys: string[]; path: string }[] = [
  { keys: ["memorias 3d", "memoria 3d", "mapa 3d", "mapa tridimensional", "grafo 3d"], path: "/memorias-3d" },
  { keys: ["memorias", "memoria", "memory hub"], path: "/memorias" },
  { keys: ["baúles", "baules", "baúl", "baul", "bóvedas", "bovedas"], path: "/baules" },
  { keys: ["wiki", "okf"], path: "/wiki" },
  { keys: ["proveedor", "proveedores", "ia & modelos", "modelos", "ajustes de ia"], path: "/proveedor" },
  { keys: ["sincronización", "sincronizacion", "syncthing", "sync"], path: "/sincronizacion" },
  { keys: ["agentes", "agente", "telegram", "vps", "agent"], path: "/agent" },
  { keys: ["inicio", "dashboard", "panel", "principal"], path: "/dashboard" },
];

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function matchRoute(t: string): string | null {
  const n = norm(t);
  for (const r of ROUTES) {
    for (const k of r.keys) {
      if (n.includes(norm(k))) return r.path;
    }
  }
  return null;
}

export interface AuroraEngine {
  supported: boolean;
  enabled: boolean;
  listening: boolean;
  speaking: boolean;
  transcript: string;
  interim: string;
  lastReply: string;
  activePersonality: Personality;
  settings: AuroraSettings;
  voices: Voice[];
  personalities: Personality[];
  start: () => void;
  stop: () => void;
  toggle: () => void;
  speak: (text: string) => void;
  runCommand: (transcript: string) => Promise<void>;
  setActivePersonality: (p: Personality) => void;
  setEnabled: (v: boolean) => void;
  reloadPersonalities: () => Promise<void>;
}

export function useAuroraEngine(): AuroraEngine {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabledState] = useState<boolean>(DEFAULT_SETTINGS.enabled);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [settings, setSettings] = useState<AuroraSettings>({ ...DEFAULT_SETTINGS });
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activePersonality, setActivePersonalityState] = useState<Personality>({ ...DEFAULT_PERSONALITY });
  const [voices, setVoices] = useState<Voice[]>([]);

  const recognitionRef = useRef<any>(null);
  const activeRef = useRef<Personality>(activePersonality);
  const enabledRef = useRef<boolean>(enabled);
  useEffect(() => { activeRef.current = activePersonality; }, [activePersonality]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // ── feature detection + carga inicial (SSR-safe) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR && typeof window.speechSynthesis !== "undefined");

    const refreshVoices = () => {
      try {
        if (typeof window.speechSynthesis === "undefined") return;
        const list = window.speechSynthesis.getVoices() || [];
        setVoices(list.map((v) => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, default: v.default })));
      } catch { /* */ }
    };
    refreshVoices();
    try {
      if (typeof window.speechSynthesis !== "undefined") {
        window.speechSynthesis.onvoiceschanged = refreshVoices;
      }
    } catch { /* */ }

    (async () => {
      const [s, ps] = await Promise.all([getSettings(), listPersonalities()]);
      setSettings(s);
      setEnabledState(!!s.enabled);
      setPersonalities(ps);
      const act = (s.active_personality && ps.find((p) => p.id === s.active_personality)) || ps[0] || { ...DEFAULT_PERSONALITY };
      setActivePersonalityState(act);
    })();

    return () => {
      try { recognitionRef.current?.stop?.(); } catch { /* */ }
      try { if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel(); } catch { /* */ }
    };
  }, []);

  const reloadPersonalities = useCallback(async () => {
    const ps = await listPersonalities();
    setPersonalities(ps);
    setActivePersonalityState((cur) => (cur.id ? ps.find((p) => p.id === cur.id) || cur : cur));
  }, []);

  const listVoicesNow = useCallback((): Voice[] => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return voices;
    try {
      return (window.speechSynthesis.getVoices() || []).map((v) => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, default: v.default }));
    } catch {
      return voices;
    }
  }, [voices]);

  // ── TTS ──
  const speakPremium = useCallback((text: string, p: Personality) => {
    // Scaffold: sin clave en la bóveda, degradamos a navegador + aviso.
    toast.message("Voz premium: requiere clave en la bóveda", {
      description: "Configura la clave del proveedor para usar voz premium. Usando la voz del navegador.",
    });
    return false;
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    const clean = (text || "").replace(/\[\[goto:[^\]]+\]\]/gi, "").trim();
    if (!clean) return;
    const p = activeRef.current;

    if (p.provider !== "browser" && p.provider !== "astraura") {
      const ok = speakPremium(clean, p);
      if (ok) return; // si tuviera implementación premium real
    }

    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = p.voice?.lang || "es-MX";
      // Mapear un par de parámetros sobre la entrega.
      const energia = Number(p.params?.energia ?? 60);
      const calidez = Number(p.params?.calidez ?? 70);
      const basePitch = Number(p.voice?.pitch ?? 1);
      const baseRate = Number(p.voice?.rate ?? 1);
      u.pitch = Math.max(0, Math.min(2, basePitch + (calidez - 50) / 250)); // calidez → +pitch leve
      u.rate = Math.max(0.1, Math.min(2, baseRate + (energia - 50) / 200)); // energía → +rate
      const all = window.speechSynthesis.getVoices() || [];
      const v = (p.voice?.voiceURI && all.find((x) => x.voiceURI === p.voice.voiceURI))
        || all.find((x) => /m[oó]nica/i.test(x.name) && /es[-_]MX/i.test(x.lang))
        || all.find((x) => /es[-_]MX/i.test(x.lang))
        || all.find((x) => x.lang === u.lang)
        || all.find((x) => (x.lang || "").toLowerCase().startsWith("es"))
        || null;
      if (v) u.voice = v;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch {
      setSpeaking(false);
    }
  }, [speakPremium]);

  // ── persistir enabled / active_personality ──
  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    setSettings((s) => ({ ...s, enabled: v }));
    void saveSettings({ enabled: v });
  }, []);

  const setActivePersonality = useCallback((p: Personality) => {
    setActivePersonalityState(p);
    if (p.id) {
      setSettings((s) => ({ ...s, active_personality: p.id! }));
      void saveSettings({ active_personality: p.id });
    }
  }, []);

  // ── enrutado de comandos ──
  const runCommand = useCallback(async (raw: string) => {
    const text = (raw || "").trim();
    if (!text) return;
    setTranscript(text);
    const n = norm(text);

    // navegación directa
    if (/(abre|abrir|ve a|vete a|lleva a|llevame a|llévame a|ir a|navega|muestra|mostrar)/.test(n)) {
      const path = matchRoute(text);
      if (path) {
        try { router.push(path); } catch { /* */ }
        const msg = `Abriendo ${path.replace("/", "") || "inicio"}.`;
        setLastReply(msg);
        speak(msg);
        return;
      }
    }

    // leer pantalla
    if (n.includes("lee la pantalla") || n.includes("leer pantalla") || n.includes("lee pantalla")) {
      let content = "";
      if (typeof document !== "undefined") {
        content = (document.querySelector("main") as HTMLElement | null)?.innerText || document.body?.innerText || "";
      }
      const trimmed = content.replace(/\s+/g, " ").trim().slice(0, 600) || "No hay contenido visible para leer.";
      setLastReply(trimmed);
      speak(trimmed);
      return;
    }

    // ayuda
    if (n.includes("que puedes hacer") || n.includes("qué puedes hacer") || n.includes("ayuda") || n.includes("comandos")) {
      const help =
        "Puedo abrir memorias, baúles, wiki, proveedor, agentes, sincronización o el mapa 3D. Puedo leer la pantalla, buscar memorias, crear memorias, y hablar contigo a través de Astraura. Solo dímelo.";
      setLastReply(help);
      speak(help);
      return;
    }

    // activar / desactivar
    if (/(activa|enciende|activar).*(aurora)/.test(n)) {
      setEnabled(true);
      const m = "Aurora activada.";
      setLastReply(m); speak(m); return;
    }
    if (/(desactiva|apaga|desactivar|silencia).*(aurora)/.test(n)) {
      const m = "Aurora desactivada.";
      setLastReply(m); speak(m);
      setEnabled(false);
      return;
    }

    // buscar memorias
    const busca = text.match(/busca(?:r)?\s+(.+)/i);
    if (busca) {
      const q = busca[1].trim();
      const res = await searchMemories(q, 5);
      const names = res.map((r) => r.name).join(", ");
      const m = res.length
        ? `Encontré ${res.length} memoria${res.length === 1 ? "" : "s"}: ${names}.`
        : `No encontré memorias para "${q}".`;
      setLastReply(m); speak(m); return;
    }

    // crear memoria
    const crea = text.match(/crea(?:r)?\s+(?:una\s+)?memoria\s+(?:llamada\s+)?(.+)/i);
    if (crea) {
      const name = crea[1].trim();
      const ok = await createQuickMemory(name);
      const m = ok ? `Memoria "${name}" creada.` : `No pude crear la memoria "${name}".`;
      setLastReply(m); speak(m);
      return;
    }

    // ── decisiones / sistema ontocrático (StarSeed) ──
    // votos pendientes: navega a /decisiones y confirma por voz
    if (
      n.includes("mis votos pendientes") ||
      n.includes("que tengo que votar") ||
      n.includes("qué tengo que votar")
    ) {
      try { router.push("/decisiones"); } catch { /* */ }
      const m = "Abriendo tus decisiones pendientes.";
      setLastReply(m); speak(m); return;
    }
    // crear / proponer una propuesta
    if (
      n.includes("crea una propuesta") ||
      n.includes("nueva propuesta") ||
      n.includes("proponer")
    ) {
      try { router.push("/decisiones"); } catch { /* */ }
      const m = "Abriendo decisiones.";
      setLastReply(m); speak(m); return;
    }
    // decisiones / propuestas / votaciones / ontocracia
    if (
      n.includes("decisiones") ||
      n.includes("propuestas") ||
      n.includes("votaciones") ||
      n.includes("ontocracia")
    ) {
      try { router.push("/decisiones"); } catch { /* */ }
      const m = "Abriendo decisiones.";
      setLastReply(m); speak(m); return;
    }

    // ── fallback: Astraura ──
    try {
      if (!loadConfigs().some((c) => c.enabled)) {
        const m = "No tengo un proveedor de IA activo. Configúralo en Proveedor para que pueda conversar contigo.";
        setLastReply(m); speak(m); return;
      }
      const messages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(activeRef.current) },
        { role: "user", content: text },
      ];
      const temperature = 0.4 + (Number(activeRef.current.params?.creatividad ?? 60) / 100) * 0.6;
      const res = await chat({ messages, temperature });
      let reply = (res?.text || "").trim();
      // directiva de navegación [[goto:/ruta]]
      const goto = reply.match(/\[\[goto:\s*(\/[^\]\s]+)\s*\]\]/i);
      if (goto) {
        try { router.push(goto[1]); } catch { /* */ }
        reply = reply.replace(/\[\[goto:[^\]]+\]\]/i, "").trim();
      }
      reply = reply || "Hecho.";
      setLastReply(reply);
      speak(reply);
    } catch (e: any) {
      const d = (e?.message ? String(e.message) : "").trim();
      const m = d && !/failed to fetch|networkerror|load failed/i.test(d)
        ? `Astraura: ${d}`
        : "No pude contactar a Astraura. Revisa tu proveedor de IA en Ajustes → IA & Modelos.";
      setLastReply(m); speak(m);
    }
  }, [router, speak, setEnabled]);

  const runCommandRef = useRef(runCommand);
  useEffect(() => { runCommandRef.current = runCommand; }, [runCommand]);

  // ── STT ──
  const buildRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = activeRef.current.voice?.lang || "es-MX";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => { setListening(true); setInterim(""); };
    rec.onerror = () => { setListening(false); };
    rec.onend = () => { setListening(false); setInterim(""); };
    rec.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        setInterim("");
        void runCommandRef.current(finalText);
      }
    };
    return rec;
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Tu navegador no soporta reconocimiento de voz."); return; }
    try { recognitionRef.current?.stop?.(); } catch { /* */ }
    const rec = buildRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    try { rec.start(); } catch { /* ya iniciado */ }
  }, [buildRecognition]);

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop?.(); } catch { /* */ }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return useMemo(
    () => ({
      supported,
      enabled,
      listening,
      speaking,
      transcript,
      interim,
      lastReply,
      activePersonality,
      settings,
      voices: listVoicesNow(),
      personalities,
      start,
      stop,
      toggle,
      speak,
      runCommand,
      setActivePersonality,
      setEnabled,
      reloadPersonalities,
    }),
    [
      supported, enabled, listening, speaking, transcript, interim, lastReply,
      activePersonality, settings, listVoicesNow, personalities,
      start, stop, toggle, speak, runCommand, setActivePersonality, setEnabled, reloadPersonalities,
    ]
  );
}
