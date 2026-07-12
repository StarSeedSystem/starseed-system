"use client";

/**
 * SecurityScanPanel — "Seguridad integrada" estilo Strix (Adenda 63 §13).
 * -----------------------------------------------------------------------
 * El "antivirus" del OS para DATOS SENSIBLES: escaneo bajo demanda de
 *   (a) memorias de los cerebros del usuario,
 *   (b) personalidades de Aurora guardadas,
 *   (c) ítems de las bibliotecas accesibles,
 *   (d) claves de localStorage con nombres sospechosos.
 * Con LISTA BLANCA: las bóvedas de credenciales conocidas
 * (`starseed.ai.providers`, `starseed.connectors.creds.v1`) NUNCA se leen ni
 * se muestran — solo se avisa de que existen y de que jamás se sincronizan.
 *
 * Resultados agrupados por severidad con acciones por hallazgo:
 *   · Redactar   → sustituye el dato por «[REDACTADO:tipo]» EN SU ORIGEN
 *   · Ver dónde  → despliega la ubicación exacta (+ enlace a la sección)
 *   · Ignorar    → silencia ese hallazgo (persistente en este dispositivo)
 *
 * Motor: src/lib/security/scanner.ts (100% local; nada sale del dispositivo).
 * Distinto de security-panel.tsx (política DNS/VPN/VPS/cifrado por ámbito):
 * este panel ESCANEA CONTENIDO. Se monta en /seguridad y en Ajustes →
 * Seguridad (/cuenta, vía NeuronsPanel). Defensivo y SSR-safe: todo ocurre al
 * pulsar «Escanear ahora»; nunca lanza.
 */

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookMarked,
  Brain,
  ChevronDown,
  ChevronRight,
  EyeOff,
  KeyRound,
  Loader2,
  MapPin,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  findingFingerprint,
  redactDeep,
  redactText,
  scanDeep,
  scanText,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  summarize,
  type Finding,
  type Severity,
} from "@/lib/security/scanner";
import { listBrains } from "@/lib/brains/brains";
import { listMemoryFiles, scanMemoryFile, updateMemoryContent } from "@/lib/cerebro/memory-files";
import {
  getPersonalityProfile,
  listPersonalityProfiles,
  normalizePersonalityProfile,
  savePersonalityProfile,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import {
  myLibraryDestinations,
  readLibrarySnapshot,
  scanItemInput,
  updateItemContent,
  type EntityRef,
} from "@/lib/library/entity-library";

/* ------------------------------------------------------------------ */
/* Modelo de resultados                                                */
/* ------------------------------------------------------------------ */

interface ScanTarget {
  kind: "memoria" | "personalidad" | "biblioteca" | "localstorage";
  /** Descripción legible de dónde vive el dato. */
  where: string;
  /** Enlace a la sección del OS donde abrirlo/editarlo. */
  href?: string;
  memoryId?: string;
  brainId?: string | null;
  personalityId?: string;
  libRef?: EntityRef;
  itemId?: string;
  storageKey?: string;
}

interface ScanRow {
  id: string;
  finding: Finding;
  target: ScanTarget;
}

interface ScanReport {
  rows: ScanRow[];
  /** Avisos informativos (no accionables), p.ej. bóvedas de credenciales. */
  notices: string[];
  scanned: { memorias: number; personalidades: number; items: number; clavesLocales: number };
  at: number;
}

/* Lista blanca: bóvedas de credenciales que JAMÁS se leen para mostrarlas. */
const CREDENTIAL_VAULT_KEYS = ["starseed.ai.providers", "starseed.connectors.creds.v1"];
/** Nombres de clave localStorage con pinta de credencial (fuera de la lista blanca). */
const SUSPICIOUS_KEY_RE = /(token|secret|secreto|clave|api[-_]?key|apikey|password|credential|bearer)/i;

const IGNORED_KEY = "starseed.security.ignored.v1";
const MAX_ROWS = 400;

function readIgnored(): Set<string> {
  try {
    const raw = localStorage.getItem(IGNORED_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeIgnored(set: Set<string>): void {
  try {
    localStorage.setItem(IGNORED_KEY, JSON.stringify(Array.from(set).slice(0, 500)));
  } catch { /* cuota/privado */ }
}

function rowId(f: Finding, target: ScanTarget): string {
  return `${target.kind}:${target.memoryId ?? target.personalityId ?? target.itemId ?? target.storageKey ?? target.where}:${findingFingerprint(f)}`;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-400/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-400/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  low: "bg-sky-500/15 text-sky-300 border-sky-400/30",
};

const SEVERITY_EXPLAIN: Record<Severity, string> = {
  critical: "Secretos reales (claves API, tokens, cadenas de conexión): si se comparten, dan acceso a tus cuentas. Redáctalos ya.",
  high: "Muy probablemente credenciales (JWT, contraseñas asignadas). Revísalos antes de compartir nada que los contenga.",
  medium: "Datos personales o de red (teléfonos, IPs privadas con puerto) que conviene no exponer fuera de tu círculo.",
  low: "PII ligera (correos, rutas de tu equipo). Inofensiva en privado; revisable antes de publicar.",
};

const TARGET_ICON: Record<ScanTarget["kind"], typeof Brain> = {
  memoria: Brain,
  personalidad: Sparkles,
  biblioteca: BookMarked,
  localstorage: KeyRound,
};

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function SecurityScanPanel() {
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  /* ── Escaneo completo bajo demanda ── */
  const runScan = useCallback(async () => {
    setScanning(true);
    setFlash(null);
    const rows: ScanRow[] = [];
    const notices: string[] = [];
    const scanned = { memorias: 0, personalidades: 0, items: 0, clavesLocales: 0 };
    const push = (f: Finding, target: ScanTarget) => {
      if (rows.length >= MAX_ROWS) return;
      rows.push({ id: rowId(f, target), finding: f, target });
    };

    // (a) Memorias de cerebros (de cuenta + por cerebro).
    try {
      const brains = await listBrains().catch(() => []);
      const scopes: Array<{ brainId: string | null; label: string }> = [
        { brainId: null, label: "Memorias de cuenta" },
        ...brains.slice(0, 20).map((b) => ({ brainId: b.id, label: `Cerebro «${b.name}»` })),
      ];
      for (const scope of scopes) {
        const files = await listMemoryFiles(scope.brainId).catch(() => []);
        for (const file of files) {
          scanned.memorias++;
          for (const f of scanMemoryFile(file)) {
            push(f, {
              kind: "memoria",
              where: `${scope.label} · ${file.name}`,
              href: "/cerebro",
              memoryId: file.id,
              brainId: scope.brainId,
            });
          }
        }
      }
    } catch { /* defensivo */ }

    // (b) Personalidades de Aurora.
    try {
      for (const p of listPersonalityProfiles()) {
        scanned.personalidades++;
        for (const f of scanDeep(p)) {
          push(f, {
            kind: "personalidad",
            where: `Personalidad «${p.name}»`,
            personalityId: p.id,
          });
        }
      }
    } catch { /* defensivo */ }

    // (c) Ítems de las bibliotecas accesibles (snapshot local, sin red extra).
    try {
      const destinations = await myLibraryDestinations().catch(() => []);
      for (const dest of destinations.slice(0, 8)) {
        const doc = readLibrarySnapshot(dest.ref);
        for (const item of doc.items) {
          scanned.items++;
          for (const f of scanItemInput(item)) {
            push(f, {
              kind: "biblioteca",
              where: `${dest.label} · «${item.title}»`,
              href: "/library",
              libRef: dest.ref,
              itemId: item.id,
            });
          }
        }
      }
    } catch { /* defensivo */ }

    // (d) localStorage: bóvedas en lista blanca (solo aviso) + claves sospechosas.
    try {
      if (typeof localStorage !== "undefined") {
        const vaults = CREDENTIAL_VAULT_KEYS.filter((k) => localStorage.getItem(k) !== null);
        if (vaults.length) {
          notices.push(
            `Hay ${vaults.length} bóveda${vaults.length === 1 ? "" : "s"} de credenciales locales en este dispositivo (proveedores de IA y conectores). No se leen ni se muestran aquí, y NUNCA se sincronizan ni se comparten.`,
          );
        }
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || CREDENTIAL_VAULT_KEYS.includes(key) || key === IGNORED_KEY) continue;
          if (!SUSPICIOUS_KEY_RE.test(key)) continue;
          scanned.clavesLocales++;
          const value = localStorage.getItem(key) ?? "";
          for (const f of scanText(value.slice(0, 100_000))) {
            push(f, {
              kind: "localstorage",
              where: `Clave local «${key}»`,
              storageKey: key,
            });
          }
        }
      }
    } catch { /* defensivo */ }

    setIgnored(readIgnored());
    setReport({ rows, notices, scanned, at: Date.now() });
    setScanning(false);
  }, []);

  /* ── Acciones por hallazgo ── */

  const ignoreRow = useCallback((row: ScanRow) => {
    const next = new Set(readIgnored());
    next.add(row.id);
    writeIgnored(next);
    setIgnored(next);
  }, []);

  const redactRow = useCallback(async (row: ScanRow) => {
    setBusyRow(row.id);
    let ok = false;
    const types = [row.finding.type];
    try {
      const t = row.target;
      if (t.kind === "memoria" && t.memoryId) {
        const files = await listMemoryFiles(t.brainId ?? null);
        const file = files.find((x) => x.id === t.memoryId);
        if (file) {
          const r = redactText(file.content, { minSeverity: "low", types });
          ok = r.redactedCount > 0 ? await updateMemoryContent(file.id, r.text) : true;
        }
      } else if (t.kind === "personalidad" && t.personalityId) {
        const p = getPersonalityProfile(t.personalityId);
        if (p) {
          const r = redactDeep(p, { minSeverity: "low", types });
          const redacted = normalizePersonalityProfile(r.value as Partial<PersonalityProfile>);
          redacted.id = p.id;
          redacted.createdAt = p.createdAt;
          savePersonalityProfile(redacted);
          ok = true;
        }
      } else if (t.kind === "biblioteca" && t.libRef && t.itemId) {
        const doc = readLibrarySnapshot(t.libRef);
        const item = doc.items.find((x) => x.id === t.itemId);
        if (item) {
          const patch: Partial<Record<"title" | "note" | "content" | "url" | "description", string>> = {};
          for (const field of ["title", "note", "content", "url", "description"] as const) {
            const v = item[field];
            if (typeof v === "string" && v) {
              const r = redactText(v, { minSeverity: "low", types });
              if (r.redactedCount > 0) patch[field] = r.text;
            }
          }
          if (Object.keys(patch).length > 0) {
            const res = await updateItemContent(t.libRef, t.itemId, patch, { label: "redacción de seguridad" });
            ok = res.ok;
          } else ok = true;
        }
      } else if (t.kind === "localstorage" && t.storageKey) {
        const raw = localStorage.getItem(t.storageKey);
        if (raw !== null) {
          const r = redactText(raw, { minSeverity: "low", types });
          if (r.redactedCount > 0) localStorage.setItem(t.storageKey, r.text);
          ok = true;
        }
      }
    } catch {
      ok = false;
    }
    setBusyRow(null);
    if (ok) {
      setFlash("Dato redactado en su origen («[REDACTADO:tipo]»). Vuelve a escanear para verificar.");
      setReport((prev) => (prev ? { ...prev, rows: prev.rows.filter((x) => x.id !== row.id) } : prev));
    } else {
      setFlash("No se pudo redactar ese hallazgo (¿sin sesión o sin permisos?). Nada se modificó.");
    }
  }, []);

  /* ── Derivados ── */

  const visibleRows = useMemo(
    () => (report?.rows ?? []).filter((r) => !ignored.has(r.id)),
    [report, ignored],
  );

  const bySeverity = useMemo(() => {
    const groups = new Map<Severity, ScanRow[]>();
    for (const sev of SEVERITY_ORDER) groups.set(sev, []);
    for (const r of visibleRows) groups.get(r.finding.severity)?.push(r);
    return groups;
  }, [visibleRows]);

  const overall = useMemo(() => summarize(visibleRows.map((r) => r.finding)), [visibleRows]);

  return (
    <Card className="bg-gradient-to-br from-emerald-500/[0.06] via-background/40 to-primary/[0.06] border-emerald-400/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> Seguridad integrada · escáner de datos sensibles
            </CardTitle>
            <CardDescription className="mt-1.5 leading-relaxed">
              El antivirus de datos sensibles del OS (estilo Strix): busca claves API, tokens, contraseñas,
              cadenas de conexión y datos personales en tus <strong>memorias de cerebros</strong>,{" "}
              <strong>personalidades</strong>, <strong>biblioteca</strong> y claves locales.
              El escaneo es 100% local: nada sale de este dispositivo. Además, todo lo que compartes,
              exportas o instalas (ítems, personalidades, memorias) pasa SIEMPRE por este mismo escáner,
              que redacta lo crítico por defecto.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            className="cursor-pointer shrink-0 gap-1.5"
            onClick={() => void runScan()}
            disabled={scanning}
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            {scanning ? "Escaneando…" : "Escanear ahora"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {flash && (
          <p className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-xs text-muted-foreground">{flash}</p>
        )}

        {!report && !scanning && (
          <p className="text-xs text-muted-foreground">
            Pulsa «Escanear ahora» para revisar tus datos. Nada se modifica sin tu confirmación:
            cada hallazgo se puede <em>redactar</em>, <em>localizar</em> o <em>ignorar</em>.
          </p>
        )}

        {report && (
          <>
            {/* Resumen */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge
                variant="outline"
                className={overall.clean
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
                  : "bg-amber-500/15 text-amber-300 border-amber-400/30"}
              >
                {overall.clean ? <ShieldCheck className="mr-1 h-3 w-3" /> : <ShieldAlert className="mr-1 h-3 w-3" />}
                {overall.message}
              </Badge>
              <span className="text-muted-foreground">
                Revisado: {report.scanned.memorias} memoria{report.scanned.memorias === 1 ? "" : "s"} ·{" "}
                {report.scanned.personalidades} personalidad{report.scanned.personalidades === 1 ? "" : "es"} ·{" "}
                {report.scanned.items} ítem{report.scanned.items === 1 ? "" : "s"} de biblioteca ·{" "}
                {report.scanned.clavesLocales} clave{report.scanned.clavesLocales === 1 ? "" : "s"} local{report.scanned.clavesLocales === 1 ? "" : "es"}
              </span>
            </div>

            {/* Avisos informativos (bóvedas de credenciales, lista blanca) */}
            {report.notices.map((n) => (
              <p key={n} className="flex items-start gap-2 rounded-lg border border-sky-400/20 bg-sky-500/[0.07] p-2.5 text-xs text-sky-200/90">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n}
              </p>
            ))}

            {/* Grupos por severidad */}
            {SEVERITY_ORDER.map((sev) => {
              const rows = bySeverity.get(sev) ?? [];
              if (!rows.length) return null;
              return (
                <div key={sev} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLE[sev]}`}>
                      {SEVERITY_LABELS[sev]} · {rows.length}
                    </Badge>
                    <p className="text-[11px] text-muted-foreground">{SEVERITY_EXPLAIN[sev]}</p>
                  </div>
                  <ul className="space-y-1">
                    {rows.map((row) => {
                      const Icon = TARGET_ICON[row.target.kind];
                      const isOpen = expanded === row.id;
                      return (
                        <li key={row.id} className="rounded-lg border border-white/5 bg-black/20">
                          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-xs" title={row.target.where}>
                              <strong>{row.finding.label}</strong>
                              <span className="text-muted-foreground"> · {row.target.where}</span>
                            </span>
                            <code className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-muted-foreground">{row.finding.match}</code>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 cursor-pointer px-2 text-[11px]"
                                disabled={busyRow === row.id}
                                onClick={() => void redactRow(row)}
                                title="Sustituye el dato por [REDACTADO:tipo] en su origen"
                              >
                                {busyRow === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                                Redactar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 cursor-pointer px-2 text-[11px]"
                                onClick={() => setExpanded(isOpen ? null : row.id)}
                                title="Ver ubicación exacta"
                              >
                                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                Ver dónde
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 cursor-pointer px-2 text-[11px] text-muted-foreground"
                                onClick={() => ignoreRow(row)}
                                title="Silenciar este hallazgo en este dispositivo"
                              >
                                <EyeOff className="h-3 w-3" /> Ignorar
                              </Button>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="border-t border-white/5 px-3 py-2 text-[11px] text-muted-foreground">
                              <p className="flex flex-wrap items-center gap-1.5">
                                <MapPin className="h-3 w-3" /> {row.target.where}
                                {row.finding.path ? <span>· campo <code>{row.finding.path}</code></span> : null}
                              </p>
                              {row.target.href && (
                                <a href={row.target.href} className="mt-1 inline-block cursor-pointer text-primary hover:underline">
                                  Abrir la sección →
                                </a>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            {visibleRows.length === 0 && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.07] p-3 text-xs text-emerald-200/90">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Todo limpio: no se detectaron secretos ni datos sensibles fuera de las bóvedas protegidas.
              </p>
            )}
          </>
        )}

        {/* Nota Strix */}
        <p className="border-t border-white/5 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          ¿Necesitas ir más allá? <strong>Strix</strong> (usestrix/strix) está catalogado en la
          Biblioteca como suite open-source avanzada de pentest para tus neuronas y servidores:
          agentes que atacan tu propia infraestructura de forma controlada para encontrar
          vulnerabilidades reales antes que nadie.
        </p>
      </CardContent>
    </Card>
  );
}

export default SecurityScanPanel;
