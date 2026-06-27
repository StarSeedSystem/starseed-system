"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /correos · Correos StarSeed (REAL, sobre Supabase, owner-scoped, realtime)
//
//   1) Dirección interna @star.seed: explica y configura su "DNS/puertos"
//      (mx_host, smtp_port, imap_port, routing) — cómo enruta el correo dentro
//      de la red StarSeed y cómo puede sincronizarse con correo externo.
//      Tabla: starseed_mail_config (defaults internos prellenados).
//
//   2) Vinculación interno/externo: añade/verifica correos externos (Gmail/etc.),
//      visibilidad + accesos por correo, y un toggle "sincronizar ↔ externo"
//      (se modela en account_emails.uses.sync + routing.external_sync).
//      Honesto: el envío/recepción externo real necesita un proveedor/dominio;
//      el interno @star.seed funciona ya dentro del ecosistema.
//
//   3) Bandeja interna @star.seed: inbox/enviados + redacción (tabla ss_mail),
//      con estado vacío cuando no hay correo.
//
// Aesthetic alineada con /cuenta (estilos inline, gradiente StarSeed).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  type AccountEmail,
  type MailConfig,
  type SsMail,
  type Visibility,
  addExternalEmail,
  getOrInitMailConfig,
  listAccountEmails,
  listInbox,
  markRead,
  patchAccountEmail,
  removeAccountEmail,
  saveMailConfig,
  sendInternalMail,
  setExternalSync,
  verifyExternalEmail,
} from "@/lib/mail/starseed-mail";

type Row = Record<string, any>;

const VIS: Array<[Visibility, string]> = [
  ["public", "Público"],
  ["contacts", "Contactos"],
  ["private", "Privado"],
];
const USES: Array<[string, string]> = [
  ["login", "Iniciar sesión"],
  ["notifications", "Notificaciones"],
  ["recovery", "Recuperación"],
  ["contact", "Contacto"],
];

export default function CorreosPage() {
  const [supabase] = useState(() => createClient());
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [emails, setEmails] = useState<AccountEmail[]>([]);
  const [cfg, setCfg] = useState<MailConfig | null>(null);
  const [cfgDraft, setCfgDraft] = useState<MailConfig | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);

  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [mail, setMail] = useState<SsMail[]>([]);
  const [openMail, setOpenMail] = useState<SsMail | null>(null);

  // redacción
  const [compose, setCompose] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // alta externo
  const [newAddr, setNewAddr] = useState("");
  const [newVis, setNewVis] = useState<Visibility>("private");
  const [adding, setAdding] = useState(false);

  const internal = useMemo(
    () => emails.find((e) => e.kind === "internal") || null,
    [emails],
  );
  const internalAddress = internal?.address || "";

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 4000);
  };

  const loadEmails = useCallback(async () => {
    const list = await listAccountEmails();
    setEmails(list);
    const inAddr = list.find((e) => e.kind === "internal")?.address || "";
    if (inAddr) {
      const c = await getOrInitMailConfig(inAddr);
      setCfg(c);
      setCfgDraft(c ? { ...c, routing: { ...c.routing } } : null);
    }
  }, []);

  const loadMail = useCallback(async (folder: "inbox" | "sent") => {
    const m = await listInbox(folder);
    setMail(m);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const id = sess?.session?.user?.id ?? null;
      setUid(id);
      if (!id) {
        setLoading(false);
        return;
      }
      await Promise.all([loadEmails(), loadMail("inbox")]);
      setLoading(false);
    })();
  }, [supabase, loadEmails, loadMail]);

  useEffect(() => {
    if (uid) loadMail(tab);
  }, [tab, uid, loadMail]);

  // realtime: correos vinculados + buzón + config DNS
  useEffect(() => {
    if (!uid) return;
    const ch = (supabase as any)
      .channel("correos-" + uid)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "account_emails", filter: "user_id=eq." + uid },
        () => loadEmails(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "starseed_mail_config", filter: "owner=eq." + uid },
        () => loadEmails(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ss_mail", filter: "to_user=eq." + uid },
        () => loadMail(tab),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ss_mail", filter: "from_user=eq." + uid },
        () => loadMail(tab),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, supabase, loadEmails, loadMail, tab]);

  // ── estilos inline (alineados con /cuenta) ──
  const card: Row = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: 18, marginBottom: 16 };
  const label: Row = { fontSize: 12, opacity: 0.65, display: "block", marginBottom: 4 };
  const input: Row = { width: "100%", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, padding: "9px 11px", color: "inherit", fontSize: 14, marginBottom: 10 };
  const btn: Row = { background: "linear-gradient(135deg,#7c5cff,#23d5ab)", border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontWeight: 600, cursor: "pointer" };
  const ghost: Row = { background: "transparent", border: "1px solid rgba(255,255,255,.18)", borderRadius: 9, padding: "5px 10px", color: "inherit", cursor: "pointer", fontSize: 12 };
  const chip: Row = { display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", marginRight: 6 };
  const mono: Row = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 };

  async function onSaveCfg() {
    if (!cfgDraft) return;
    setSavingCfg(true);
    const saved = await saveMailConfig({
      ...cfgDraft,
      smtp_port: Number(cfgDraft.smtp_port) || 2525,
      imap_port: Number(cfgDraft.imap_port) || 1143,
    });
    setSavingCfg(false);
    if (saved) {
      setCfg(saved);
      setCfgDraft({ ...saved, routing: { ...saved.routing } });
      flash("Configuración DNS/puertos guardada.");
    } else {
      flash("No se pudo guardar la configuración.");
    }
  }

  async function onAddExternal() {
    const addr = newAddr.trim().toLowerCase();
    if (!addr.includes("@")) {
      flash("Escribe un correo externo válido.");
      return;
    }
    setAdding(true);
    const res = await addExternalEmail(addr, newVis);
    setAdding(false);
    if (res.ok) {
      setNewAddr("");
      flash("Correo externo vinculado. Verifícalo para activarlo.");
    } else {
      flash(res.error || "No se pudo vincular.");
    }
  }

  async function onToggleUse(e: AccountEmail, key: string) {
    const uses = { ...(e.uses || {}) };
    uses[key] = !uses[key];
    await patchAccountEmail(e.id, { uses });
  }

  async function onSend() {
    const dst = to.trim().toLowerCase();
    if (!dst.endsWith("@star.seed")) {
      flash("El destinatario interno debe terminar en @star.seed.");
      return;
    }
    setSending(true);
    const res = await sendInternalMail({
      fromAddress: internalAddress || "tu@star.seed",
      toAddress: dst,
      subject,
      body,
    });
    setSending(false);
    if (res.ok) {
      setTo("");
      setSubject("");
      setBody("");
      setCompose(false);
      setTab("sent");
      flash(res.error || "Correo interno enviado.");
    } else {
      flash(res.error || "No se pudo enviar.");
    }
  }

  async function onOpenMail(m: SsMail) {
    setOpenMail(m);
    if (!m.read && tab === "inbox") {
      await markRead(m.id, true);
    }
  }

  if (loading) return <div style={{ padding: 28, opacity: 0.7 }}>Cargando tus Correos StarSeed…</div>;

  if (!uid) {
    return (
      <div style={{ padding: 28, maxWidth: 520 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Correos StarSeed</h1>
        <p style={{ opacity: 0.7, marginBottom: 16 }}>
          Inicia sesión para configurar tu dirección <b>@star.seed</b>, vincular correos externos y usar tu bandeja interna.
        </p>
        <a href="/bienvenida" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>
          Entrar / Crear cuenta
        </a>
      </div>
    );
  }

  const externals = emails.filter((e) => e.kind !== "internal");

  return (
    <div style={{ padding: 28, maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 2 }}>Correos StarSeed</h1>
      <p style={{ opacity: 0.6, marginBottom: 18, fontSize: 13 }}>
        Tu dirección interna <b>@star.seed</b>, sus puertos de enrutado, y la vinculación con tus correos externos.
        {" "}
        <a href="/cuenta" style={{ color: "#23d5ab", textDecoration: "none" }}>Gestionar identidad →</a>
      </p>
      {msg ? <div style={{ ...card, borderColor: "rgba(124,92,255,.5)", padding: 12, marginBottom: 14 }}>{msg}</div> : null}

      {/* 1 · Dirección interna + DNS/puertos */}
      <section style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Dirección interna @star.seed</h2>
        {internalAddress ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <b style={{ ...mono, fontSize: 15 }}>{internalAddress}</b>
              <span style={chip}>interna</span>
              <span style={{ ...chip, borderColor: "rgba(35,213,171,.5)", color: "#7af0d3" }}>activa en la red</span>
            </div>
            <p style={{ opacity: 0.6, fontSize: 12, marginBottom: 14 }}>
              Tu buzón interno enruta el correo dentro de la red StarSeed (entrega entre cuentas, sin servidores externos).
              Estos son sus parámetros de <b>DNS/puertos</b> — cómo se enruta internamente y cómo podría sincronizarse con correo externo.
            </p>

            {cfgDraft ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                  <div>
                    <label style={label}>MX host (entrada interna)</label>
                    <input
                      style={{ ...input, ...mono }}
                      value={cfgDraft.mx_host}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, mx_host: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={label}>Puerto SMTP (envío)</label>
                    <input
                      type="number"
                      style={{ ...input, ...mono }}
                      value={cfgDraft.smtp_port}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, smtp_port: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label style={label}>Puerto IMAP (lectura)</label>
                    <input
                      type="number"
                      style={{ ...input, ...mono }}
                      value={cfgDraft.imap_port}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, imap_port: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 4 }}>
                  <div>
                    <label style={label}>Dominio de red</label>
                    <input
                      style={{ ...input, ...mono }}
                      value={cfgDraft.routing.domain ?? "star.seed"}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, routing: { ...cfgDraft.routing, domain: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label style={label}>Entrega interna</label>
                    <select
                      style={{ ...input, ...mono }}
                      value={cfgDraft.routing.internal_delivery ?? "instant"}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, routing: { ...cfgDraft.routing, internal_delivery: e.target.value as any } })}
                    >
                      <option value="instant">Instantánea (realtime)</option>
                      <option value="queue">En cola</option>
                    </select>
                  </div>
                  <div>
                    <label style={label}>Relay interno</label>
                    <input
                      style={{ ...input, ...mono }}
                      value={cfgDraft.routing.relay ?? "starseed-internal"}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, routing: { ...cfgDraft.routing, relay: e.target.value } })}
                    />
                  </div>
                </div>

                <div style={{ ...card, marginBottom: 12, padding: 12, background: "rgba(124,92,255,.06)" }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                    Sincronización con correo externo
                  </div>
                  <div style={{ ...mono, fontSize: 12, opacity: 0.8 }}>
                    estado:{" "}
                    <b>{cfgDraft.routing.external_sync?.enabled ? "activa" : "inactiva"}</b>
                    {" · "}modo: <b>{cfgDraft.routing.external_sync?.mode ?? "off"}</b>
                    {" · "}direcciones: <b>{(cfgDraft.routing.external_sync?.addresses || []).length}</b>
                  </div>
                  <p style={{ fontSize: 11, opacity: 0.55, marginTop: 6, marginBottom: 0 }}>
                    El transporte externo real (SMTP/IMAP hacia Gmail, etc.) requiere un proveedor/dominio de correo conectado.
                    Aquí defines la <b>intención</b> de ruta; el envío/recepción interno @star.seed ya funciona.
                  </p>
                </div>

                <button style={{ ...btn, opacity: savingCfg ? 0.6 : 1 }} disabled={savingCfg} onClick={onSaveCfg}>
                  {savingCfg ? "Guardando…" : "Guardar DNS/puertos"}
                </button>
              </div>
            ) : (
              <div style={{ opacity: 0.6, fontSize: 13 }}>Preparando configuración…</div>
            )}
          </>
        ) : (
          <p style={{ opacity: 0.7, fontSize: 13 }}>
            Aún no tienes una dirección interna. Define tu <b>@</b> en{" "}
            <a href="/cuenta" style={{ color: "#23d5ab" }}>Cuenta</a> para activar tu buzón <b>@star.seed</b>.
          </p>
        )}
      </section>

      {/* 2 · Correos vinculados (interno/externo) */}
      <section style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Correos vinculados</h2>
        <p style={{ opacity: 0.6, fontSize: 12, marginBottom: 12 }}>
          Vincula correos internos y externos a tu cuenta, define su visibilidad y accesos, y marca la sincronización ↔ externo.
        </p>

        {emails.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: 13 }}>Aún no hay correos vinculados.</p>
        ) : (
          emails.map((e) => {
            const syncOn = !!(e.uses && e.uses.sync);
            const isExternal = e.kind !== "internal";
            return (
              <div key={e.id} style={{ ...card, marginBottom: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <b style={{ ...mono, fontSize: 14 }}>{e.address}</b>
                    {e.is_primary ? <span style={{ ...chip, marginLeft: 8 }}>principal</span> : null}
                    <div style={{ marginTop: 4 }}>
                      <span style={chip}>{e.kind}</span>
                      <span style={chip}>{e.provider}</span>
                      <span style={{ ...chip, borderColor: e.connection_level === "verified" ? "rgba(35,213,171,.5)" : undefined }}>
                        {e.connection_level === "verified" ? "verificado" : e.connection_level === "mailbox" ? "buzón conectado" : "sin verificar"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {isExternal && e.connection_level === "none" ? (
                      <button style={ghost} onClick={() => verifyExternalEmail(e.id)}>Verificar</button>
                    ) : null}
                    {isExternal ? (
                      <button style={ghost} onClick={() => removeAccountEmail(e.id)}>Quitar</button>
                    ) : null}
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <label style={label}>Visibilidad</label>
                    <select
                      style={{ ...input, width: "auto", marginBottom: 0 }}
                      value={e.visibility}
                      onChange={(ev) => patchAccountEmail(e.id, { visibility: ev.target.value as Visibility })}
                    >
                      {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  {isExternal ? (
                    <div>
                      <label style={label}>Sincronizar ↔ externo</label>
                      <button
                        style={{ ...ghost, background: syncOn ? "rgba(35,213,171,.3)" : "transparent" }}
                        onClick={() => setExternalSync(e, internalAddress, !syncOn)}
                        disabled={!internalAddress}
                        title={internalAddress ? "" : "Necesitas una dirección @star.seed"}
                      >
                        {syncOn ? "Sincronización: activa" : "Sincronización: inactiva"}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: 10 }}>
                  <label style={label}>Accesos</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {USES.map(([k, l]) => (
                      <button
                        key={k}
                        style={{ ...ghost, background: e.uses && e.uses[k] ? "rgba(124,92,255,.35)" : "transparent" }}
                        onClick={() => onToggleUse(e, k)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {isExternal && syncOn ? (
                  <p style={{ fontSize: 11, opacity: 0.5, marginTop: 8, marginBottom: 0 }}>
                    Intención de sincronización registrada en el enrutado. El envío/recepción real con {e.provider} requiere conectar un proveedor de correo.
                  </p>
                ) : null}
              </div>
            );
          })
        )}

        {/* Alta de externo */}
        <div style={{ ...card, marginBottom: 0, borderStyle: "dashed" }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Vincular correo externo</h3>
          <input
            style={input}
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            placeholder="tucorreo@gmail.com"
          />
          <div style={{ marginBottom: 10 }}>
            <label style={label}>Visibilidad</label>
            <select style={{ ...input, width: "auto", marginBottom: 0 }} value={newVis} onChange={(e) => setNewVis(e.target.value as Visibility)}>
              {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button style={{ ...btn, opacity: adding ? 0.6 : 1 }} disabled={adding} onClick={onAddExternal}>
            {adding ? "Vinculando…" : "Vincular externo"}
          </button>
          <p style={{ fontSize: 11, opacity: 0.5, marginTop: 10, marginBottom: 0 }}>
            Honesto: vincular un externo lo registra en tu cuenta (visibilidad, accesos, intención de sync). El envío/recepción
            real con proveedores externos requiere un dominio/servidor de correo conectado. El correo interno <b>@star.seed</b> funciona ahora.
          </p>
        </div>
      </section>

      {/* 3 · Bandeja interna @star.seed */}
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Bandeja interna</h2>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button style={{ ...ghost, background: tab === "inbox" ? "rgba(124,92,255,.35)" : "transparent" }} onClick={() => setTab("inbox")}>Recibidos</button>
            <button style={{ ...ghost, background: tab === "sent" ? "rgba(124,92,255,.35)" : "transparent" }} onClick={() => setTab("sent")}>Enviados</button>
            <button style={btn} onClick={() => setCompose((c) => !c)} disabled={!internalAddress} title={internalAddress ? "" : "Necesitas tu @star.seed"}>
              {compose ? "Cerrar" : "Redactar"}
            </button>
          </div>
        </div>

        {compose ? (
          <div style={{ ...card, padding: 14, background: "rgba(35,213,171,.05)" }}>
            <label style={label}>Para (dirección @star.seed)</label>
            <input style={{ ...input, ...mono }} value={to} onChange={(e) => setTo(e.target.value)} placeholder="alguien@star.seed" />
            <label style={label}>Asunto</label>
            <input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto" />
            <label style={label}>Mensaje</label>
            <textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe tu mensaje interno…" />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button style={{ ...btn, opacity: sending ? 0.6 : 1 }} disabled={sending} onClick={onSend}>
                {sending ? "Enviando…" : "Enviar"}
              </button>
              <span style={{ fontSize: 11, opacity: 0.5 }}>Entrega dentro de la red StarSeed (cuentas @star.seed).</span>
            </div>
          </div>
        ) : null}

        {mail.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 12px", opacity: 0.55 }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>✉️</div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>
              {tab === "inbox" ? "No tienes correos internos todavía." : "No has enviado correos internos."}
            </div>
            <div style={{ fontSize: 12 }}>
              {tab === "inbox" ? "Cuando alguien te escriba a tu @star.seed, aparecerá aquí." : "Tus correos enviados aparecerán aquí."}
            </div>
          </div>
        ) : (
          <div>
            {mail.map((m) => (
              <button
                key={m.id}
                onClick={() => onOpenMail(m)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: !m.read && tab === "inbox" ? "rgba(124,92,255,.12)" : "rgba(255,255,255,.02)",
                  border: "1px solid rgba(255,255,255,.10)",
                  borderRadius: 12,
                  padding: "11px 13px",
                  marginBottom: 8,
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <b style={{ fontSize: 13 }}>{m.subject || "(sin asunto)"}</b>
                  <span style={{ fontSize: 11, opacity: 0.5 }}>{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <div style={{ ...mono, fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                  {tab === "inbox" ? `de ${m.from_address || "—"}` : `para ${m.to_address || "—"}`}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(m.body || "").slice(0, 120)}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Lectura de un correo */}
      {openMail ? (
        <div
          onClick={() => setOpenMail(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, maxWidth: 560, width: "100%", marginBottom: 0, background: "#0c0c12" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <b style={{ fontSize: 16 }}>{openMail.subject || "(sin asunto)"}</b>
              <button style={ghost} onClick={() => setOpenMail(null)}>Cerrar</button>
            </div>
            <div style={{ ...mono, fontSize: 12, opacity: 0.65, marginBottom: 2 }}>de {openMail.from_address || "—"}</div>
            <div style={{ ...mono, fontSize: 12, opacity: 0.65, marginBottom: 10 }}>para {openMail.to_address || "—"}</div>
            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>{new Date(openMail.created_at).toLocaleString()}</div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{openMail.body || "(vacío)"}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
