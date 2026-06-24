"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AuthGate — el inicio de sesión es lo PRIMERO del sistema StarSeed OS.
// Si no hay sesión, cubre la app con una pantalla de acceso real (correo
// existente o crea tu cuenta StarSeed, que recibe su dirección @star.seed y su
// identidad automáticamente). Tras entrar, OnboardingGate muestra la guía.
// Fail-open: si el chequeo de sesión falla (red/SSR), no bloquea la app.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

function traducir(m: string): string {
  const s = (m || "").toLowerCase();
  if (s.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (s.includes("already registered") || s.includes("already been registered")) return "Ese correo ya tiene cuenta. Inicia sesión.";
  if (s.includes("password should be") || s.includes("at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (s.includes("unable to validate email") || s.includes("invalid email")) return "Escribe un correo válido.";
  if (s.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  return m || "No se pudo completar. Intenta de nuevo.";
}

export function AuthGate() {
  const [sb] = useState(() => createClient());
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  const check = useCallback(async () => {
    try {
      const { data } = await sb.auth.getSession();
      setAuthed(!!data?.session);
    } catch {
      setAuthed(true); // fail-open: nunca dejar al usuario fuera por un error
    } finally {
      setReady(true);
    }
  }, [sb]);

  useEffect(() => {
    void check();
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, [check, sb]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(""); setOk("");
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pwd });
        if (error) setMsg(traducir(error.message));
      } else {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pwd });
        if (error) setMsg(traducir(error.message));
        else if (data.user && !data.session) setOk("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.");
        else setOk("¡Cuenta creada! Entrando…");
      }
    } catch (err: any) {
      setMsg(traducir(err?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  if (!ready || authed) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "radial-gradient(circle at 30% 20%, #1a1030, #05060d 70%)" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", width: 420, height: 420, left: "-8%", top: "-10%", borderRadius: "50%", background: "radial-gradient(circle,#7c5cff55,transparent 60%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", width: 380, height: 380, right: "-6%", bottom: "-8%", borderRadius: "50%", background: "radial-gradient(circle,#23d5ab44,transparent 60%)", filter: "blur(40px)" }} />
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: 420, background: "rgba(12,14,24,.82)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 22, padding: 28, boxShadow: "0 30px 80px rgba(0,0,0,.5)", backdropFilter: "blur(14px)" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5, background: "linear-gradient(135deg,#a78bfa,#34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>StarSeed OS</div>
          <p style={{ opacity: .7, fontSize: 13, marginTop: 6 }}>{mode === "in" ? "Inicia sesión para entrar a tu sistema" : "Crea tu cuenta StarSeed — recibirás tu dirección @star.seed"}</p>
        </div>

        <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,.05)", borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {(["in", "up"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setMsg(""); setOk(""); }} style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, color: mode === m ? "#fff" : "rgba(255,255,255,.6)", background: mode === m ? "linear-gradient(135deg,#7c5cff,#23d5ab)" : "transparent" }}>
              {m === "in" ? "Entrar" : "Crear cuenta"}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" autoComplete="email"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "11px 13px", color: "#fff", fontSize: 14, marginBottom: 10 }} />
          <input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Contraseña" autoComplete={mode === "in" ? "current-password" : "new-password"}
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 11, padding: "11px 13px", color: "#fff", fontSize: 14, marginBottom: 12 }} />
          {msg ? <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>{msg}</div> : null}
          {ok ? <div style={{ color: "#6ee7b7", fontSize: 12, marginBottom: 10 }}>{ok}</div> : null}
          <button type="submit" disabled={busy} style={{ width: "100%", border: "none", borderRadius: 12, padding: "12px 0", color: "#fff", fontWeight: 700, fontSize: 15, cursor: busy ? "default" : "pointer", opacity: busy ? .65 : 1, background: "linear-gradient(135deg,#7c5cff,#23d5ab)" }}>
            {busy ? "Un momento…" : mode === "in" ? "Entrar al sistema" : "Crear mi cuenta StarSeed"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 11, opacity: .55, marginTop: 16, lineHeight: 1.5 }}>
          Una sola cuenta para todo el ecosistema StarSeed (OS, Nexus, Café, Audiomorphic).<br />Al crear tu cuenta recibes tu dirección interna <b>@star.seed</b> automáticamente.
        </p>
      </div>
    </div>
  );
}

export default AuthGate;
