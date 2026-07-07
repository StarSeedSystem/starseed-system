"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /cuenta · Centro de Cuenta e Identidad StarSeed (REAL, sobre Supabase)
//   · Perfil: @handle, nombre, bio, avatar, portada  (tabla profiles)
//   · Identidad StarSeed: dirección interna <handle>@star.seed  (starseed_identities)
//   · Correos adjuntos: interno / alias creado / externos, con visibilidad y
//     accesos configurables (tabla account_emails) + nivel de conexión.
//   · Realtime: cambios en profiles/account_emails se reflejan al instante.
// Todo vacío y listo por defecto; sin datos de ejemplo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { AccountProfilesSwitcher } from "@/components/profiles/account-profiles-switcher";
// Subida universal de archivos (Adenda 64 §9): cambiar foto/portada con un
// archivo real (dispositivo o biblioteca) en vez de solo pegar una URL.
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";

type Row = Record<string, any>;

const USES: Array<[string, string]> = [
  ["login", "Iniciar sesión"],
  ["notifications", "Notificaciones"],
  ["recovery", "Recuperación"],
  ["contact", "Contacto"],
];
const VIS: Array<[string, string]> = [
  ["public", "Público"],
  ["contacts", "Contactos"],
  ["private", "Privado"],
];
const CONN: Array<[string, string]> = [
  ["none", "Sin verificar"],
  ["verified", "Verificado"],
  ["mailbox", "Bandeja conectada (próximamente)"],
];

function guessProvider(addr: string): string {
  const a = addr.toLowerCase();
  if (a.includes("@gmail.")) return "gmail";
  if (a.includes("@outlook.") || a.includes("@hotmail.") || a.includes("@live.")) return "outlook";
  if (a.includes("@yahoo.")) return "yahoo";
  if (a.includes("@icloud.")) return "icloud";
  if (a.endsWith("@star.seed")) return "starseed";
  return "imap";
}

export default function CuentaPage() {
  const [supabase] = useState(() => createClient());
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<Row | null>(null);
  const [identity, setIdentity] = useState<Row | null>(null);
  const [emails, setEmails] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // edición de perfil
  const [form, setForm] = useState<Row>({ handle: "", display_name: "", bio: "", avatar_url: "", cover_url: "" });

  // alta de correo
  const [newAddr, setNewAddr] = useState("");
  const [newKind, setNewKind] = useState<"external" | "created">("external");
  const [newVis, setNewVis] = useState("private");

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const id = sess?.session?.user?.id ?? null;
    setUid(id);
    if (!id) { setLoading(false); return; }
    const [p, idn, em] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", id).maybeSingle(),
      supabase.from("starseed_identities").select("*").eq("owner", id).maybeSingle(),
      supabase.from("account_emails").select("*").eq("user_id", id).order("kind", { ascending: true }),
    ]);
    const prof = (p as Row)?.data ?? null;
    setProfile(prof);
    setIdentity((idn as Row)?.data ?? null);
    setEmails(((em as Row)?.data as Row[]) ?? []);
    if (prof) {
      setForm({
        handle: prof.handle ?? "",
        display_name: prof.display_name ?? "",
        bio: prof.bio ?? "",
        avatar_url: prof.avatar_url ?? "",
        cover_url: prof.cover_url ?? "",
      });
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // realtime: perfil + correos
  useEffect(() => {
    if (!uid) return;
    const ch = (supabase as any)
      .channel("cuenta-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "account_emails", filter: "user_id=eq." + uid }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: "user_id=eq." + uid }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, supabase, load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  async function saveProfile() {
    if (!uid) return;
    setSaving(true);
    const handle = String(form.handle || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const patch: Row = {
      display_name: form.display_name ?? "",
      bio: form.bio ?? "",
      avatar_url: form.avatar_url ?? "",
      cover_url: form.cover_url ?? "",
      updated_at: new Date().toISOString(),
    };
    if (handle && handle !== (profile?.handle ?? "")) patch.handle = handle;
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", uid);
    if (error) {
      flash(error.message.includes("duplicate") || error.message.includes("unique") ? "Ese @ ya está en uso." : "No se pudo guardar: " + error.message);
      setSaving(false);
      return;
    }
    // si cambió el handle, actualizar la dirección interna y el correo interno
    if (patch.handle) {
      const newInternal = patch.handle + "@star.seed";
      await supabase.from("starseed_identities").update({ handle: patch.handle, email_handle: patch.handle, address: newInternal }).eq("owner", uid);
      const internal = emails.find((e) => e.kind === "internal");
      if (internal) await supabase.from("account_emails").update({ address: newInternal }).eq("id", internal.id);
    }
    flash("Perfil guardado.");
    setSaving(false);
    load();
  }

  async function addEmail() {
    if (!uid) return;
    const addr = newAddr.trim().toLowerCase();
    if (!addr || !addr.includes("@")) { flash("Escribe un correo válido."); return; }
    setSaving(true);
    const row: Row = {
      user_id: uid,
      address: addr,
      kind: newKind,
      visibility: newKind === "created" ? "public" : newVis,
      uses: { login: false, notifications: true, recovery: false, contact: newKind === "created" },
      provider: newKind === "created" ? "starseed" : guessProvider(addr),
      connection_level: "none",
      is_primary: false,
    };
    const { error } = await supabase.from("account_emails").insert(row);
    if (error) flash(error.message.includes("duplicate") || error.message.includes("unique") ? "Ese correo ya está adjunto." : "No se pudo adjuntar: " + error.message);
    else { setNewAddr(""); flash("Correo adjuntado. Verifica la propiedad para activarlo."); }
    setSaving(false);
  }

  async function patchEmail(id: string, patch: Row) {
    await supabase.from("account_emails").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function removeEmail(id: string) {
    await supabase.from("account_emails").delete().eq("id", id);
  }
  async function toggleUse(e: Row, key: string) {
    const uses = { ...(e.uses || {}) }; uses[key] = !uses[key];
    await patchEmail(e.id, { uses });
  }

  // ── estilos inline (no dependemos de CSS externo) ──
  const card: Row = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: 18, marginBottom: 16 };
  const label: Row = { fontSize: 12, opacity: .65, display: "block", marginBottom: 4 };
  const input: Row = { width: "100%", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, padding: "9px 11px", color: "inherit", fontSize: 14, marginBottom: 10 };
  const btn: Row = { background: "linear-gradient(135deg,#7c5cff,#23d5ab)", border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontWeight: 600, cursor: "pointer" };
  const ghost: Row = { background: "transparent", border: "1px solid rgba(255,255,255,.18)", borderRadius: 9, padding: "5px 10px", color: "inherit", cursor: "pointer", fontSize: 12 };
  const chip: Row = { display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", marginRight: 6 };

  if (loading) return <div style={{ padding: 28, opacity: .7 }}>Cargando tu cuenta…</div>;

  if (!uid) {
    return (
      <div style={{ padding: 28, maxWidth: 520 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Tu cuenta StarSeed</h1>
        <p style={{ opacity: .7, marginBottom: 16 }}>Inicia sesión o crea tu cuenta para gestionar tu perfil, tu dirección <b>@star.seed</b> y tus correos adjuntos.</p>
        <a href="/bienvenida" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>Entrar / Crear cuenta</a>
      </div>
    );
  }

  const internal = emails.find((e) => e.kind === "internal");

  return (
    <div style={{ padding: 28, maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 2 }}>Cuenta e Identidad</h1>
      <p style={{ opacity: .6, marginBottom: 18, fontSize: 13 }}>
        {profile?.handle ? "@" + profile.handle : ""}{identity?.address ? "  ·  " + identity.address : ""}
      </p>
      {msg ? <div style={{ ...card, borderColor: "rgba(124,92,255,.5)", padding: 12, marginBottom: 14 }}>{msg}</div> : null}

      {/* Perfiles múltiples de la cuenta (personal/cívico/artístico/profesional) */}
      <section style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Perfiles</h2>
        <p style={{ opacity: .6, fontSize: 12, marginBottom: 12 }}>
          Facetas públicas de tu Cuenta soberana. Cada escritorio, dashboard o pizarra se ancla a un perfil.
        </p>
        <AccountProfilesSwitcher />
      </section>

      {/* Perfil */}
      <section style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Perfil</h2>
        <label style={label}>@ (identificador único)</label>
        <input style={input} value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="tu_usuario" />
        <label style={label}>Nombre visible</label>
        <input style={input} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Tu nombre" />
        <label style={label}>Bio</label>
        <textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Cuéntate en una línea…" />
        <label style={label}>Foto de perfil</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input style={{ ...input, marginBottom: 0, flex: 1 }} value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://…" />
          <AttachFilePickerButton
            onPick={(picked: UniversalAttachment[]) => {
              const url = picked[0]?.url;
              if (url) setForm({ ...form, avatar_url: url });
            }}
            accept="image/*"
            folder="avatares"
            title="Cambiar foto de perfil"
            hideTabs={["neuronas"]}
            className="cursor-pointer"
          >
            <span style={ghost}>Subir</span>
          </AttachFilePickerButton>
        </div>
        <label style={label}>Portada</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input style={{ ...input, marginBottom: 0, flex: 1 }} value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="https://…" />
          <AttachFilePickerButton
            onPick={(picked: UniversalAttachment[]) => {
              const url = picked[0]?.url;
              if (url) setForm({ ...form, cover_url: url });
            }}
            accept="image/*"
            folder="portadas"
            title="Cambiar foto de portada"
            hideTabs={["neuronas"]}
            className="cursor-pointer"
          >
            <span style={ghost}>Subir</span>
          </AttachFilePickerButton>
        </div>
        <button style={{ ...btn, opacity: saving ? .6 : 1 }} disabled={saving} onClick={saveProfile}>Guardar perfil</button>
      </section>

      {/* Identidad interna */}
      <section style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Tu dirección StarSeed</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontSize: 15 }}>{identity?.address ?? (profile?.handle ? profile.handle + "@star.seed" : "—")}</b>
          <span style={chip}>interna</span>
          {internal ? <span style={chip}>{internal.visibility}</span> : null}
        </div>
        <p style={{ opacity: .6, fontSize: 12, marginTop: 8 }}>
          Es tu buzón interno dentro del ecosistema StarSeed (mensajería entre cuentas). Cambia con tu @.
        </p>
      </section>

      {/* Correos adjuntos */}
      <section style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Correos adjuntos</h2>
        {emails.length === 0 ? (
          <p style={{ opacity: .6, fontSize: 13 }}>Aún no hay correos. Adjunta uno abajo.</p>
        ) : (
          emails.map((e) => (
            <div key={e.id} style={{ ...card, marginBottom: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <b style={{ fontSize: 14 }}>{e.address}</b>{e.is_primary ? <span style={{ ...chip, marginLeft: 8 }}>principal</span> : null}
                  <div style={{ marginTop: 4 }}>
                    <span style={chip}>{e.kind}</span>
                    <span style={chip}>{e.provider}</span>
                  </div>
                </div>
                {e.kind !== "internal" ? (
                  <button style={ghost} onClick={() => removeEmail(e.id)}>Quitar</button>
                ) : null}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div>
                  <label style={label}>Visibilidad</label>
                  <select style={{ ...input, width: "auto", marginBottom: 0 }} value={e.visibility} onChange={(ev) => patchEmail(e.id, { visibility: ev.target.value })}>
                    {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Conexión</label>
                  <select style={{ ...input, width: "auto", marginBottom: 0 }} value={e.connection_level} onChange={(ev) => patchEmail(e.id, { connection_level: ev.target.value })} disabled={e.kind === "internal"}>
                    {CONN.map(([v, l]) => <option key={v} value={v} disabled={v === "mailbox"}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={label}>Accesos</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {USES.map(([k, l]) => (
                    <button key={k} style={{ ...ghost, background: (e.uses && e.uses[k]) ? "rgba(124,92,255,.35)" : "transparent" }} onClick={() => toggleUse(e, k)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Alta de correo */}
        <div style={{ ...card, marginBottom: 0, borderStyle: "dashed" }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Adjuntar / crear correo</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button style={{ ...ghost, background: newKind === "external" ? "rgba(35,213,171,.3)" : "transparent" }} onClick={() => setNewKind("external")}>Externo existente</button>
            <button style={{ ...ghost, background: newKind === "created" ? "rgba(35,213,171,.3)" : "transparent" }} onClick={() => setNewKind("created")}>Alias público StarSeed</button>
          </div>
          <input style={input} value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder={newKind === "created" ? "alias@star.seed" : "tucorreo@gmail.com"} />
          {newKind === "external" ? (
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Visibilidad</label>
              <select style={{ ...input, width: "auto", marginBottom: 0 }} value={newVis} onChange={(e) => setNewVis(e.target.value)}>
                {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ) : null}
          <button style={{ ...btn, opacity: saving ? .6 : 1 }} disabled={saving} onClick={addEmail}>Adjuntar</button>
        </div>
      </section>
    </div>
  );
}
