"use client";

/**
 * STUDIO 1.58 · Instalador Universal — detecta el sistema de quien mira esta
 * pantalla y lo presenta primero (el resto queda plegado), trae el script
 * REAL del backend (`/api/installer/script`) y, si el backend no lo publica
 * todavía (404), cae al fragmento estático que ya trae el OS (el mismo que la
 * pestaña «Instalación» del panel: `astraura-158-panel.tsx`), diciéndolo
 * explícitamente en la UI. Escaneo de dispositivos por la malla de
 * descubrimiento y copiar-al-portapapeles por fragmento.
 * Original: `UniversalInstallerHub.jsx` (fragmentos fijos por SO, escaneo,
 * copiar). Aquí NO se inventan tamaños de descarga ni binarios (.dmg/.exe/
 * .apk) que el backend no expone — solo los comandos ya reales y usados en el
 * resto del OS (mismo `install.sh`/`install.ps1`/repo/BitNet).
 * Honestidad de proxy: nada de esto se ejecuta desde aquí — el proxy del OS
 * nunca corre comandos remotos, el usuario copia y ejecuta él.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, DownloadCloud, Laptop, RadioTower, ScanSearch, Smartphone, Terminal, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { detectPlatform, type OsKind } from "@/ai/astraura/mesh/native-access";
import {
  fetchAstraura158InstallerScript, runAstraura158DiscoveryScan, type Astraura158DiscoveryScan,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, BusyIcon, CARD, MONO, SUB, SectionTitle, useBusy, type S158TabProps } from "./shared";

/* ── Fragmentos estáticos YA incluidos en el OS (mismos comandos que
 *    `astraura-158-panel.tsx` → pestaña «Instalación»): fallback honesto
 *    cuando el backend no publica un script para ese sistema. ────────────── */

type FragmentKey = "mac" | "linux" | "windows" | "android" | "ios" | "chromeos";

interface FragmentLine { note?: string; cmd: string }
interface Fragment { title: string; icon: LucideIcon; lines: FragmentLine[]; webNote?: string }

const REPO_LINE: FragmentLine = { note: "Desde el repo (clon propio)", cmd: "git clone https://github.com/StarSeedSystem/astraura.git && cd astraura && ./install_and_run.sh" };
const BITNET_LINE: FragmentLine = { note: "BitNet nativo (opcional): compila y descarga el modelo ternario", cmd: "bash scripts/setup_bitnet.sh && python3 scripts/download_model.py" };

const FRAGMENTS: Record<FragmentKey, Fragment> = {
  mac: { title: "macOS", icon: Laptop, lines: [{ note: "Terminal (⌘+Espacio → «Terminal»)", cmd: "curl -fsSL https://astraura.vercel.app/install.sh | bash" }, REPO_LINE, BITNET_LINE] },
  linux: { title: "Linux", icon: Laptop, lines: [{ note: "Terminal", cmd: "curl -fsSL https://astraura.vercel.app/install.sh | bash" }, REPO_LINE, BITNET_LINE] },
  windows: { title: "Windows", icon: Laptop, lines: [{ note: "PowerShell", cmd: "irm https://astraura.vercel.app/install.ps1 | iex" }] },
  android: { title: "Android (Termux)", icon: Smartphone, lines: [{ note: "Termux (F-Droid, no Google Play) — mismo instalador que macOS/Linux", cmd: "pkg update && pkg install python clang git -y && curl -fsSL https://astraura.vercel.app/install.sh | bash" }] },
  ios: { title: "iOS / iPadOS", icon: Smartphone, lines: [], webNote: "iOS no deja instalar ni ejecutar el backend soberano en segundo plano desde el navegador. Usa la app web: Safari → icono compartir → «Añadir a pantalla de inicio» en https://astraura.vercel.app/ — funciona como app con permisos propios, pero el backend 1.58 debe correr en otra máquina de tu red (Mac/Linux/Windows) a la que te conectas por Wi-Fi/túnel." },
  chromeos: { title: "ChromeOS", icon: Laptop, lines: [{ note: "Terminal Linux (Crostini), si está activada en este Chromebook", cmd: "curl -fsSL https://astraura.vercel.app/install.sh | bash" }], webNote: "Sin Crostini activado, usa la app web: barra de direcciones → «Instalar» en https://astraura.vercel.app/ y conecta con un backend que corra en otra máquina de tu red." },
};

const ORDER: FragmentKey[] = ["mac", "linux", "windows", "android", "ios", "chromeos"];

function osToFragmentKey(os: OsKind): FragmentKey {
  if (os === "macos") return "mac";
  if (os === "windows") return "windows";
  if (os === "android") return "android";
  if (os === "ios") return "ios";
  if (os === "chromeos") return "chromeos";
  return "linux"; // "linux" y "unknown" comparten los mismos comandos de terminal
}

interface ScriptState { loading: boolean; fromBackend: boolean; text: string; version?: string; error?: string }

export function InstaladorTab({ target }: S158TabProps) {
  const platform = useMemo(() => detectPlatform(), []);
  const myKey = osToFragmentKey(platform.os);
  const [open, setOpen] = useState<FragmentKey>(myKey);
  const [copied, setCopied] = useState("");
  const [scriptState, setScriptState] = useState<ScriptState>({ loading: true, fromBackend: false, text: "" });
  const { busy, wrap } = useBusy();
  const [scanResult, setScanResult] = useState<Astraura158DiscoveryScan | null>(null);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    let alive = true;
    setScriptState({ loading: true, fromBackend: false, text: "" });
    void (async () => {
      // El backend sirve el script como TEXTO PLANO (`text/x-shellscript`),
      // no como JSON: `r.data` YA es el contenido del script.
      const r = await fetchAstraura158InstallerScript(target);
      if (!alive) return;
      if (r.ok && typeof r.data === "string" && r.data.trim()) {
        setScriptState({ loading: false, fromBackend: true, text: r.data });
      } else {
        setScriptState({ loading: false, fromBackend: false, text: "", error: r.ok ? "el backend respondió sin contenido de script" : r.error });
      }
    })();
    return () => { alive = false; };
  }, [open, target]);

  function copy(text: string, key: string) {
    try {
      void navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copiado al portapapeles");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      toast.error("No se pudo copiar automáticamente; selecciona el texto a mano.");
    }
  }

  async function rescan() {
    await wrap("scan", async () => {
      const r = await runAstraura158DiscoveryScan(target);
      if (r.ok) {
        setScanResult(r.data);
        setScanError("");
        toast.success("Escaneo completado", { description: `${(r.data.devices ?? []).length} dispositivo(s) detectado(s)` });
      } else {
        setScanResult(null);
        setScanError(r.error);
        toast.error(`Escaneo fallido: ${r.error}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={DownloadCloud} title="Instalador universal" tone="text-cyan-300"
          hint={`Detectado: ${FRAGMENTS[myKey].title}${platform.mobile ? " (móvil)" : ""} — se muestra primero; el resto queda plegado.`} />
        <p className="mt-2 text-[10px] leading-snug text-amber-200/80">
          Honesto: nada de esto se ejecuta desde aquí. El proxy del OS nunca corre comandos remotos — copias el fragmento y lo ejecutas tú, en tu propia máquina o terminal.
        </p>
      </div>

      <div className="space-y-2">
        {ORDER.map((key) => {
          const frag = FRAGMENTS[key];
          const Icon = frag.icon;
          const isOpen = open === key;
          const isMine = key === myKey;
          return (
            <div key={key} className={cn(SUB, isOpen && "border-cyan-400/30")}>
              <button type="button" className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={isOpen} aria-label={`${isOpen ? "Contraer" : "Expandir"} ${frag.title}`}
                onClick={() => setOpen(key)}>
                <span className="flex items-center gap-2 text-[12px] font-medium text-white/90">
                  <Icon className="h-4 w-4 text-white/60" aria-hidden="true" /> {frag.title}
                  {isMine && <Badge tone="border-cyan-400/40 text-cyan-200">tu sistema</Badge>}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-white/40 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="space-y-1.5 px-3 pb-3">
                  {scriptState.loading && <p className="text-[11px] text-white/55">Consultando script del backend…</p>}
                  {!scriptState.loading && scriptState.fromBackend && (
                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] text-emerald-200/80">Script servido por el backend soberano{scriptState.version ? ` · v${scriptState.version}` : ""}.</p>
                        <button type="button" className={BTN} aria-label="Copiar script del backend" onClick={() => copy(scriptState.text, `${key}:backend`)}>
                          {copied === `${key}:backend` ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />} {copied === `${key}:backend` ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                      <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words font-code text-[10px] text-cyan-100/90">{scriptState.text}</pre>
                    </div>
                  )}
                  {!scriptState.loading && !scriptState.fromBackend && (
                    <p className="text-[10px] text-amber-200/80">Script local: el backend no lo publica{scriptState.error ? ` (${scriptState.error})` : ""}. Se muestran los fragmentos ya incluidos en el OS.</p>
                  )}
                  {frag.webNote && <p className="text-[10px] leading-snug text-white/60">{frag.webNote}</p>}
                  {frag.lines.length === 0 && !scriptState.fromBackend && !frag.webNote && <p className="text-[10px] text-white/50">Sin comandos: {frag.title} no admite instalación por terminal.</p>}
                  {frag.lines.map((l, i) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      {l.note && <p className="text-[10px] text-white/50">{l.note}</p>}
                      <div className="mt-1 flex items-center gap-1.5">
                        <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1 font-code text-[10px] text-cyan-100/90">{l.cmd}</code>
                        <button type="button" className={BTN} aria-label={`Copiar comando: ${l.note ?? l.cmd}`} onClick={() => copy(l.cmd, `${key}:${i}`)}>
                          {copied === `${key}:${i}` ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={RadioTower} title={`Dispositivos descubiertos (${(scanResult?.devices ?? []).length})`} tone="text-violet-300"
          hint="Otras neuronas/nodos que el backend soberano ve en su red al escanear."
          right={<button type="button" className={BTN_PRIMARY} disabled={busy !== ""} aria-label="Re-escanear dispositivos" onClick={() => { void rescan(); }}><BusyIcon busy={busy === "scan"} icon={ScanSearch} /> Re-escanear dispositivos</button>} />
        {!scanResult && !scanError && <p className="mt-2 text-[11px] text-white/55">Sin escanear todavía en esta sesión.</p>}
        {scanError && <p className="mt-2 text-[11px] text-amber-200/85">Sin conexión con el backend: {scanError}.</p>}
        {scanResult && (scanResult.devices ?? []).length === 0 && <p className="mt-2 text-[11px] text-white/55">El backend no reportó dispositivos.</p>}
        {scanResult && (scanResult.devices ?? []).length > 0 && (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {(scanResult.devices ?? []).map((d, i) => (
              <div key={d.id ?? i} className={cn(SUB, "px-3 py-1.5")}>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">{d.name ?? d.id ?? `dispositivo ${i + 1}`}</p>
                  <Badge tone={d.reachable ? "border-emerald-400/30 text-emerald-200" : "border-white/10 text-white/50"}>{d.reachable ? "alcanzable" : "no alcanzable"}</Badge>
                </div>
                <p className={MONO}>{d.kind ?? "—"}{d.address ? ` · ${d.address}` : ""}{d.version ? ` · v${d.version}` : ""}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <ul className="grid gap-1 sm:grid-cols-2">
        <li><a className={BTN} href="https://github.com/StarSeedSystem/astraura" target="_blank" rel="noopener noreferrer"><Terminal className="h-3 w-3" aria-hidden="true" /> Repositorio StarSeedSystem/astraura</a></li>
        <li><a className={BTN} href="https://astraura.vercel.app/" target="_blank" rel="noopener noreferrer"><DownloadCloud className="h-3 w-3" aria-hidden="true" /> UI completa (imaginación, enjambre, sensorium, proyectos…)</a></li>
      </ul>
    </div>
  );
}

export default InstaladorTab;
