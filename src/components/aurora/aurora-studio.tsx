"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, BookMarked, Copy, Download, FileText, FolderInput, Library,
  Loader2, Mic, Plus, Save, Sparkles, Trash2, Upload, Volume2, Wand2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "./aurora-provider";
import {
  AURORA_PROVIDERS, DEFAULT_PERSONALITY, EMOTION_PARAMS, PERSONALITY_PARAMS,
  BUILTIN_TEMPLATES, VOICE_DEFAULT, markdownToPersonality, personalityFromJSON,
  personalityToJSON, personalityToMarkdown, type Personality,
} from "@/lib/aurora/types";
import {
  assignToVault, deletePersonality, duplicatePersonality, listPersonalities,
  listVaults, saveAsMemory, savePersonality, type VaultLite,
} from "@/lib/aurora/personalities";

function Slider({ value, onChange, min = 0, max = 100 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="range" min={min} max={max} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-fuchsia-500 h-1.5"
    />
  );
}

function slug(s: string) {
  return (s || "aurora").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "aurora";
}

export default function AuroraStudio() {
  const aurora = useAurora();
  const router = useRouter();

  const [draft, setDraft] = useState<Personality>({ ...DEFAULT_PERSONALITY, params: { ...DEFAULT_PERSONALITY.params }, emotions: { ...DEFAULT_PERSONALITY.emotions }, voice: { ...VOICE_DEFAULT } });
  const [library, setLibrary] = useState<Personality[]>([]);
  const [vaults, setVaults] = useState<VaultLite[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"voz" | "caracter" | "personalidad" | "biblioteca">("voz");

  // custom param inputs
  const [newParamKey, setNewParamKey] = useState("");
  const [newParamVal, setNewParamVal] = useState(50);
  const [newEmoKey, setNewEmoKey] = useState("");
  const [newEmoVal, setNewEmoVal] = useState(50);
  const [assignVault, setAssignVault] = useState<string>("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  const enabled = aurora?.enabled ?? false;
  const supported = aurora?.supported ?? false;
  const wakeWord = aurora?.settings?.wake_word ?? "aurora";

  const voices = aurora?.voices ?? [];

  const reloadLibrary = useCallback(async () => {
    if (aurora) await aurora.reloadPersonalities();
    const ps = await listPersonalities();
    setLibrary(ps);
  }, [aurora]);

  useEffect(() => {
    (async () => {
      const [ps, vs] = await Promise.all([listPersonalities(), listVaults()]);
      setLibrary(ps);
      setVaults(vs);
      if (aurora?.activePersonality && aurora.activePersonality.id) {
        setDraft({ ...aurora.activePersonality, params: { ...aurora.activePersonality.params }, emotions: { ...aurora.activePersonality.emotions }, voice: { ...aurora.activePersonality.voice } });
      } else if (ps[0]) {
        setDraft({ ...ps[0], params: { ...ps[0].params }, emotions: { ...ps[0].emotions }, voice: { ...ps[0].voice } });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVoice = (patch: Partial<typeof VOICE_DEFAULT>) => setDraft((d) => ({ ...d, voice: { ...d.voice, ...patch } }));
  const setParam = (k: string, v: number) => setDraft((d) => ({ ...d, params: { ...d.params, [k]: v } }));
  const setEmotion = (k: string, v: number) => setDraft((d) => ({ ...d, emotions: { ...d.emotions, [k]: v } }));

  const customParams = useMemo(
    () => Object.keys(draft.params || {}).filter((k) => k !== "_notes" && !PERSONALITY_PARAMS.some((p) => p.key === k)),
    [draft.params]
  );
  const customEmotions = useMemo(
    () => Object.keys(draft.emotions || {}).filter((k) => !EMOTION_PARAMS.some((p) => p.key === k)),
    [draft.emotions]
  );

  function addParam() {
    const key = slug(newParamKey).replace(/-/g, "_");
    if (!key) return;
    setParam(key, newParamVal);
    setNewParamKey(""); setNewParamVal(50);
  }
  function removeParam(k: string) {
    setDraft((d) => { const p = { ...d.params }; delete p[k]; return { ...d, params: p }; });
  }
  function addEmotion() {
    const key = slug(newEmoKey).replace(/-/g, "_");
    if (!key) return;
    setEmotion(key, newEmoVal);
    setNewEmoKey(""); setNewEmoVal(50);
  }
  function removeEmotion(k: string) {
    setDraft((d) => { const e = { ...d.emotions }; delete e[k]; return { ...d, emotions: e }; });
  }

  async function onSave() {
    setSaving(true);
    const saved = await savePersonality(draft);
    setSaving(false);
    if (saved) {
      toast.success(`Personalidad "${saved.name}" guardada.`);
      setDraft({ ...saved, params: { ...saved.params }, emotions: { ...saved.emotions }, voice: { ...saved.voice } });
      await reloadLibrary();
      aurora?.setActivePersonality(saved);
    } else {
      toast.error("No se pudo guardar. ¿Has iniciado sesión?");
    }
  }

  function loadIntoDraft(p: Personality, activate = false) {
    setDraft({ ...p, params: { ...p.params }, emotions: { ...p.emotions }, voice: { ...p.voice } });
    if (activate && p.id) aurora?.setActivePersonality(p);
    setTab("voz");
  }

  async function onDuplicate(p: Personality) {
    setBusy(true);
    const copy = await duplicatePersonality(p);
    setBusy(false);
    if (copy) { toast.success("Duplicada."); await reloadLibrary(); }
  }
  async function onDelete(p: Personality) {
    if (!p.id) return;
    setBusy(true);
    const ok = await deletePersonality(p.id);
    setBusy(false);
    if (ok) { toast.success("Eliminada."); await reloadLibrary(); if (draft.id === p.id) setDraft({ ...DEFAULT_PERSONALITY }); }
  }

  function startFromTemplate(t: Personality) {
    setDraft({ ...t, id: undefined, is_template: false, params: { ...t.params }, emotions: { ...t.emotions }, voice: { ...t.voice } });
    setTab("voz");
    toast.message(`Plantilla "${t.name}" cargada. Ajusta y guarda.`);
  }

  function exportJSON() {
    try {
      const blob = new Blob([personalityToJSON(draft)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `personalidad-${slug(draft.name)}.json`; a.click();
    } catch { toast.error("No se pudo exportar JSON."); }
  }
  function exportMD() {
    try {
      const blob = new Blob([personalityToMarkdown(draft)], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `personalidad-${slug(draft.name)}.md`; a.click();
    } catch { toast.error("No se pudo exportar Markdown."); }
  }
  function onImport(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const p = file.name.toLowerCase().endsWith(".json") ? personalityFromJSON(text) : markdownToPersonality(text);
        setDraft({ ...p, params: { ...p.params }, emotions: { ...p.emotions }, voice: { ...p.voice } });
        toast.success(`Importada "${p.name}". Pulsa Guardar para añadirla a tu biblioteca.`);
      } catch { toast.error("Archivo no válido (.json o .md)."); }
    };
    reader.onerror = () => toast.error("No se pudo leer el archivo.");
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onAssignVault() {
    if (!draft.id) { toast.message("Guarda la personalidad antes de asignarla a un baúl."); return; }
    const ok = await assignToVault(draft.id, assignVault || null);
    if (ok) { toast.success(assignVault ? "Asignada al baúl." : "Quitada del baúl."); setDraft((d) => ({ ...d, vault_id: assignVault || null })); await reloadLibrary(); }
    else toast.error("No se pudo asignar.");
  }
  async function onSaveAsMemory() {
    const ok = await saveAsMemory(draft);
    if (ok) toast.success(`Guardada como memoria .md: "Personalidad · ${draft.name}".`);
    else toast.error("No se pudo guardar en memoria.");
  }

  function testVoice() {
    const sample = `Hola, soy ${draft.name || "Aurora"}. Así sueno con esta configuración.`;
    if (aurora && draft.id && aurora.activePersonality.id === draft.id) {
      aurora.speak(sample);
      return;
    }
    // Vista previa con la config del borrador, independiente del provider montado.
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
      toast.error("Tu navegador no soporta síntesis de voz.");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sample);
      u.lang = draft.voice.lang || "es-ES";
      const energia = Number(draft.params?.energia ?? 60);
      const calidez = Number(draft.params?.calidez ?? 70);
      u.pitch = Math.max(0, Math.min(2, Number(draft.voice.pitch ?? 1) + (calidez - 50) / 250));
      u.rate = Math.max(0.1, Math.min(2, Number(draft.voice.rate ?? 1) + (energia - 50) / 200));
      const all = window.speechSynthesis.getVoices() || [];
      const v = (draft.voice.voiceURI && all.find((x) => x.voiceURI === draft.voice.voiceURI)) || all.find((x) => x.lang === u.lang) || null;
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch { toast.error("No se pudo reproducir la voz."); }
  }

  const langVoices = voices.filter((v) => !draft.voice.lang || v.lang?.slice(0, 2) === draft.voice.lang.slice(0, 2));
  const providerNeedsKey = draft.provider === "openai" || draft.provider === "elevenlabs";

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition", tab === id ? "bg-fuchsia-600/30 border border-fuchsia-400/50 text-white" : "bg-white/5 border border-white/10 text-white/60 hover:border-fuchsia-400/30")}>{label}</button>
  );

  return (
    <div className="space-y-5">
      {/* Header / framing */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-gradient-to-r from-fuchsia-950/30 to-cyan-950/20 p-4 flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center"><Sparkles className="w-5 h-5 text-white" /></div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">Aurora es la voz de Astraura. Habla y actúa por ti en todo StarSeed.</div>
          <div className="text-[11px] text-white/50">Configura proveedor, voz, carácter, personalidad y emociones. Guarda como Personalidades en baúles, memorias .md y archivos exportables.</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn("text-[10px] rounded-full px-2 py-1 border", supported ? "border-emerald-400/40 text-emerald-200 bg-emerald-500/10" : "border-amber-400/40 text-amber-200 bg-amber-500/10")}>
            {supported ? "Voz disponible" : "Voz no soportada en este navegador"}
          </span>
        </div>
      </div>

      {/* Master controls */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <span className="text-xs text-white/70">Activar Aurora</span>
          <button
            role="switch" aria-checked={enabled} disabled={!aurora}
            onClick={() => aurora?.setEnabled(!enabled)}
            className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition", enabled ? "bg-fuchsia-600" : "bg-white/15")}
          >
            <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition", enabled ? "translate-x-4" : "translate-x-0.5")} />
          </button>
        </div>
        <label className="text-[11px] text-white/50">Palabra de activación
          <input value={wakeWord} onChange={() => { /* persistido vía ajustes globales */ }} readOnly className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/80" />
        </label>
        <label className="text-[11px] text-white/50">Idioma (voz)
          <input value={draft.voice.lang} onChange={(e) => setVoice({ lang: e.target.value })} placeholder="es-ES" className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
        </label>
      </div>

      {/* Provider */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50">Proveedor de IA / voz</div>
        <select value={draft.provider} onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
          {AURORA_PROVIDERS.map((p) => <option key={p.id} value={p.id} className="bg-zinc-900">{p.label}</option>)}
        </select>
        {providerNeedsKey && (
          <div className="text-[11px] text-amber-300/80 flex flex-wrap items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Este proveedor requiere clave en la bóveda.
            <button onClick={() => router.push("/proveedor")} className="underline hover:text-amber-200">Configurar en Proveedor</button>
            <span className="text-white/30">·</span>
            <button onClick={() => router.push("/baules")} className="underline hover:text-amber-200">Bóveda en Baúles</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <TabBtn id="voz" label="Voz" />
        <TabBtn id="caracter" label="Carácter" />
        <TabBtn id="personalidad" label="Personalidad & emoción" />
        <TabBtn id="biblioteca" label="Personalidades" />
      </div>

      {/* VOZ */}
      {tab === "voz" && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          <label className="block text-[11px] text-white/50">Voz del sistema
            <select value={draft.voice.voiceURI} onChange={(e) => setVoice({ voiceURI: e.target.value })} className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
              <option value="" className="bg-zinc-900">Automática ({draft.voice.lang})</option>
              {(langVoices.length ? langVoices : voices).map((v) => (
                <option key={v.voiceURI} value={v.voiceURI} className="bg-zinc-900">{v.name} · {v.lang}</option>
              ))}
            </select>
            {voices.length === 0 && <span className="text-[10px] text-white/35">No se detectaron voces (puede requerir interacción del navegador).</span>}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-[11px] text-white/50"><span>Tono (pitch)</span><span>{draft.voice.pitch.toFixed(2)}</span></div>
              <input type="range" min={0} max={2} step={0.05} value={draft.voice.pitch} onChange={(e) => setVoice({ pitch: Number(e.target.value) })} className="w-full accent-fuchsia-500 h-1.5" />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-white/50"><span>Velocidad (rate)</span><span>{draft.voice.rate.toFixed(2)}</span></div>
              <input type="range" min={0.1} max={2} step={0.05} value={draft.voice.rate} onChange={(e) => setVoice({ rate: Number(e.target.value) })} className="w-full accent-cyan-500 h-1.5" />
            </div>
          </div>
          <button onClick={testVoice} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20 transition">
            <Volume2 className="w-3.5 h-3.5" /> Probar voz
          </button>
        </div>
      )}

      {/* CARACTER */}
      {tab === "caracter" && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <label className="block text-[11px] text-white/50">Nombre
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Aurora" className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="block text-[11px] text-white/50">Carácter / descripción (cómo es Aurora)
            <textarea value={draft.character} onChange={(e) => setDraft((d) => ({ ...d, character: e.target.value }))} rows={5} className="mt-1 w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-white" />
          </label>
          <label className="block text-[11px] text-white/50">System prompt avanzado (opcional · sobreescribe el carácter)
            <textarea value={draft.system_prompt ?? ""} onChange={(e) => setDraft((d) => ({ ...d, system_prompt: e.target.value }))} rows={3} placeholder="Instrucciones de sistema adicionales…" className="mt-1 w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-white font-mono" />
          </label>
        </div>
      )}

      {/* PERSONALIDAD & EMOCION */}
      {tab === "personalidad" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50">Parámetros de personalidad</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {PERSONALITY_PARAMS.map((p) => (
                <div key={p.key}>
                  <div className="flex justify-between text-[11px] text-white/60"><span>{p.label}</span><span>{Math.round(Number(draft.params?.[p.key] ?? p.default))}</span></div>
                  <Slider value={Number(draft.params?.[p.key] ?? p.default)} onChange={(v) => setParam(p.key, v)} />
                </div>
              ))}
              {customParams.map((k) => (
                <div key={k}>
                  <div className="flex justify-between text-[11px] text-cyan-200/70"><span className="flex items-center gap-1">{k}<button onClick={() => removeParam(k)} className="text-white/30 hover:text-red-400"><X className="w-3 h-3" /></button></span><span>{Math.round(Number(draft.params?.[k] ?? 0))}</span></div>
                  <Slider value={Number(draft.params?.[k] ?? 0)} onChange={(v) => setParam(k, v)} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <input value={newParamKey} onChange={(e) => setNewParamKey(e.target.value)} placeholder="nuevo parámetro" className="flex-1 min-w-[140px] bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
              <input type="number" min={0} max={100} value={newParamVal} onChange={(e) => setNewParamVal(Number(e.target.value))} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
              <button onClick={addParam} className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-600/30 border border-fuchsia-400/50 px-2.5 py-1.5 text-xs text-white hover:bg-fuchsia-600/50"><Plus className="w-3.5 h-3.5" /> Añadir</button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-widest text-cyan-300/50">Emociones</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {EMOTION_PARAMS.map((p) => (
                <div key={p.key}>
                  <div className="flex justify-between text-[11px] text-white/60"><span>{p.label}</span><span>{Math.round(Number(draft.emotions?.[p.key] ?? p.default))}</span></div>
                  <Slider value={Number(draft.emotions?.[p.key] ?? p.default)} onChange={(v) => setEmotion(p.key, v)} />
                </div>
              ))}
              {customEmotions.map((k) => (
                <div key={k}>
                  <div className="flex justify-between text-[11px] text-cyan-200/70"><span className="flex items-center gap-1">{k}<button onClick={() => removeEmotion(k)} className="text-white/30 hover:text-red-400"><X className="w-3 h-3" /></button></span><span>{Math.round(Number(draft.emotions?.[k] ?? 0))}</span></div>
                  <Slider value={Number(draft.emotions?.[k] ?? 0)} onChange={(v) => setEmotion(k, v)} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <input value={newEmoKey} onChange={(e) => setNewEmoKey(e.target.value)} placeholder="nueva emoción" className="flex-1 min-w-[140px] bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
              <input type="number" min={0} max={100} value={newEmoVal} onChange={(e) => setNewEmoVal(Number(e.target.value))} className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
              <button onClick={addEmotion} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600/30 border border-cyan-400/50 px-2.5 py-1.5 text-xs text-white hover:bg-cyan-600/50"><Plus className="w-3.5 h-3.5" /> Añadir</button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50 mb-1 flex items-center gap-1"><Wand2 className="w-3 h-3" /> Interconexión de parámetros</div>
            <textarea
              value={typeof draft.params?._notes === "string" ? (draft.params._notes as string) : ""}
              onChange={(e) => setDraft((d) => ({ ...d, params: { ...d.params, _notes: e.target.value } }))}
              rows={2} placeholder="Describe cómo se relacionan los parámetros (p. ej. 'más energía reduce paciencia; humor sube con creatividad')."
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-xs text-white"
            />
          </div>
        </div>
      )}

      {/* BIBLIOTECA / PERSONALIDADES */}
      {tab === "biblioteca" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50 flex items-center gap-1"><Library className="w-3 h-3" /> Tu biblioteca</div>
            {library.length === 0 ? (
              <div className="text-xs text-white/40">Aún no tienes personalidades guardadas. Crea una arriba y pulsa Guardar, o empieza desde una plantilla.</div>
            ) : (
              <div className="space-y-2">
                {library.map((p) => (
                  <div key={p.id} className={cn("rounded-lg border bg-black/20 p-3 flex items-center gap-3", draft.id === p.id ? "border-fuchsia-400/50" : "border-white/10")}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate flex items-center gap-2">{p.name}{aurora?.activePersonality?.id === p.id && <span className="text-[9px] rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 px-1.5 py-0.5">activa</span>}</div>
                      <div className="text-[10px] text-white/40 truncate">{p.provider} · {p.voice?.lang} · {(p.tags || []).join(", ") || "sin etiquetas"}</div>
                    </div>
                    <button onClick={() => loadIntoDraft(p, true)} className="text-[11px] rounded border border-fuchsia-400/40 text-fuchsia-100 px-2 py-1 hover:bg-fuchsia-500/15">Cargar y activar</button>
                    <button onClick={() => onDuplicate(p)} title="Duplicar" className="text-white/40 hover:text-white"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => onDelete(p)} title="Eliminar" className="text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-widest text-cyan-300/50 flex items-center gap-1"><BookMarked className="w-3 h-3" /> Plantillas</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {BUILTIN_TEMPLATES.map((t) => (
                <button key={t.name} onClick={() => startFromTemplate(t)} className="text-left rounded-lg border border-white/10 bg-black/20 hover:border-cyan-400/40 p-3 transition">
                  <div className="text-sm font-medium text-white">{t.name}</div>
                  <div className="text-[10px] text-white/45 mt-0.5 line-clamp-2">{t.character}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-widest text-fuchsia-300/50">Importar / exportar / asignar</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"><Upload className="w-3.5 h-3.5" /> Importar (.json/.md)</button>
              <input ref={fileRef} type="file" accept=".json,.md,.markdown,application/json,text/markdown" className="hidden" onChange={(e) => onImport(e.target.files?.[0] ?? null)} />
              <button onClick={exportJSON} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20"><Download className="w-3.5 h-3.5" /> Exportar .json</button>
              <button onClick={exportMD} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20"><FileText className="w-3.5 h-3.5" /> Exportar .md</button>
              <button onClick={onSaveAsMemory} className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1.5 text-xs text-fuchsia-100 hover:bg-fuchsia-500/20"><Save className="w-3.5 h-3.5" /> Guardar en memoria .md</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FolderInput className="w-4 h-4 text-amber-300/70" />
              <select value={assignVault} onChange={(e) => setAssignVault(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white">
                <option value="" className="bg-zinc-900">— Sin baúl —</option>
                {vaults.map((v) => <option key={v.id} value={v.id} className="bg-zinc-900">{v.name}</option>)}
              </select>
              <button onClick={onAssignVault} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20">Asignar a baúl</button>
              {vaults.length === 0 && <button onClick={() => router.push("/baules")} className="text-[11px] text-cyan-300/70 underline hover:text-cyan-200">Crear un baúl</button>}
            </div>
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 rounded-xl border border-fuchsia-500/30 bg-zinc-950/90 backdrop-blur p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-white/60"><Mic className="w-4 h-4 text-fuchsia-300" /> Editando: <span className="text-white font-medium">{draft.name || "Aurora"}</span>{draft.id ? <span className="text-[10px] text-white/30">(guardada)</span> : <span className="text-[10px] text-amber-300/70">(sin guardar)</span>}</div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={testVoice} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20"><Volume2 className="w-3.5 h-3.5" /> Probar voz</button>
          <button onClick={onSave} disabled={saving || busy} className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar personalidad
          </button>
        </div>
      </div>
    </div>
  );
}
