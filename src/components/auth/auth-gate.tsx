"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AuthGate — el inicio de sesión es lo PRIMERO del sistema StarSeed OS.
// Si no hay sesión, cubre la app con una pantalla de acceso real. Trae a paridad
// las opciones del login del Café, adaptadas al look del OS (violeta→teal):
//
//   • Entrar (correo + contraseña)
//   • Crear cuenta (recibe su dirección @star.seed e identidad automáticamente)
//   • Entrar con código por correo (sin contraseña)  →  Supabase OTP
//   • Explorar sin cuenta  →  sesión anónima (signInAnonymously)
//
// Tras entrar (cuenta o invitado), OnboardingGate lanza la guía con Astraura.
//
// Diseño unificado StarSeed (baseline del ecosistema OS · Nexus · Café ·
// Audiomorphic): tarjeta de cristal centrada (~420px), fondo radial oscuro con
// dos orbes violeta/teal difuminados, wordmark con gradiente violeta→teal
// (#a78bfa→#34d399), pestañas Entrar / Crear cuenta, botón primario en
// gradiente, y una nota honesta de una sola cuenta para todo + @star.seed.
//
// Fail-open: si el chequeo de sesión falla (red/SSR), no bloquea la app.
// Login-first: mientras no haya sesión, la app queda cubierta.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { WelcomeGate } from "@/components/welcome/welcome-gate";

function traducir(m: string): string {
  const s = (m || "").toLowerCase();
  if (s.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (s.includes("already registered") || s.includes("already been registered")) return "Ese correo ya tiene cuenta. Inicia sesión.";
  if (s.includes("password should be") || s.includes("at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (s.includes("unable to validate email") || s.includes("invalid email")) return "Escribe un correo válido.";
  if (s.includes("anonymous") && s.includes("disabled")) return "El modo invitado no está disponible ahora mismo.";
  if (s.includes("signups not allowed") || s.includes("signup is disabled")) return "El registro está deshabilitado por ahora.";
  if (s.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  return m || "No se pudo completar. Intenta de nuevo.";
}

// Propuesta de valor honesta y breve (se muestra bajo el formulario).
const VALUE_PROPS: { icon: string; title: string; desc: string }[] = [
  { icon: "✶", title: "Una sola cuenta", desc: "OS, Nexus, Café y Audiomorphic con un mismo acceso." },
  { icon: "@", title: "Dirección @star.seed", desc: "Tu identidad interna en la red, lista al crear la cuenta." },
  { icon: "✦", title: "Aurora te guía", desc: "Una guía inteligente te ayuda a dejar todo listo." },
];

/**
 * (Adenda 208) Marca de sesión que dice «esta persona ACABA de crear su cuenta
 * en esta pestaña». Solo entonces arranca sola la guía de Astraura.
 */
export const RECIEN_REGISTRADO = "starseed.recien.registrado";

export function AuthGate() {
  const [sb] = useState(() => createClient());
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  // qué acción está en curso, para no bloquear todos los botones a la vez.
  const [pending, setPending] = useState<"" | "form" | "otp" | "guest">("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [code, setCode] = useState("");
  const emailRef = useRef<HTMLInputElement | null>(null);

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

  // Enfoca el correo cuando aparece la pantalla (accesibilidad/UX).
  useEffect(() => {
    if (ready && !authed) {
      const t = setTimeout(() => emailRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [ready, authed]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setPending("form"); setMsg(""); setOk("");
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pwd });
        if (error) setMsg(traducir(error.message));
      } else {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pwd });
        if (error) setMsg(traducir(error.message));
        else if (data.user && !data.session) setOk("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.");
        else {
          // (Adenda 208) La guía de Astraura arranca SOLO tras crear la cuenta
          // aquí mismo. Sin esta marca, cualquiera que simplemente iniciara
          // sesión con el rito a medias se la volvía a encontrar de golpe.
          try { window.sessionStorage.setItem(RECIEN_REGISTRADO, "1"); } catch { /* sin sessionStorage */ }
          setOk("¡Cuenta creada! Te lleva la guía de Astraura…");
          // (Adenda 209) Navegación EXPLÍCITA al rito. Antes se confiaba en que
          // varios porteros reaccionaran al cambio de sesión y ganara el
          // correcto; en la práctica la app recargaba, se colaba la ventana
          // vieja de voz y acababa en el escritorio sin guía ni configuración.
          // Ahora hay un único camino y no depende de quién reaccione antes.
          setTimeout(() => { try { window.location.assign("/bienvenida"); } catch { /* */ } }, 350);
        }
      }
    } catch (err: any) {
      setMsg(traducir(err?.message || ""));
    } finally {
      setBusy(false); setPending("");
    }
  };

  // ── Entrar con código por correo (sin contraseña) — OTP del OS ──────────────
  // (Adenda 71-bis · 2026-07-17) Como @star.seed NO tiene SMTP, el OTP de
  // Supabase por email no llega. En su lugar el OS GENERA el código y lo entrega
  // en la bandeja de correos y notificaciones del OS (tablas ss_mail/notifications
  // vía /api/auth/otp/request, server con service_role). El usuario ve el código
  // dentro del OS y lo introduce; /api/auth/otp/verify valida y crea la sesión.
  const requestOtp = async () => {
    const addr = email.trim();
    if (!addr) {
      setMsg("Escribe tu correo para enviarte el código.");
      emailRef.current?.focus();
      return;
    }
    setBusy(true); setPending("otp"); setMsg(""); setOk(""); setCode("");
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg(data.error || "No se pudo generar el código.");
        setPending("");
      } else {
        setOk("Revisa tu bandeja de correos y notificaciones del OS (arriba a la derecha). Escribe aquí el código de 6 dígitos que aparece.");
      }
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error de red.");
      setPending("");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    const addr = email.trim();
    const c = code.trim();
    if (!addr || !/^\d{6}$/.test(c)) {
      setMsg("Escribe el código de 6 dígitos que te llegó al OS.");
      return;
    }
    setBusy(true); setMsg(""); setOk("");
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr, code: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session) {
        setMsg(data.error || "Código incorrecto o expirado.");
        setBusy(false);
        return;
      }
      // Canjear la sesión en el cliente.
      const { error } = await sb.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (error) {
        setMsg(error.message);
        setBusy(false);
        return;
      }
      // onAuthStateChange marcará authed=true y desmontará esta pantalla.
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error de red.");
      setBusy(false);
    }
  };

  // ── Explorar sin cuenta — sesión anónima ──
  // Crea una sesión anónima real; OnboardingGate lanzará la guía, donde el
  // invitado podrá más tarde añadir un correo para convertirse en cuenta plena.
  const exploreAsGuest = async () => {
    setBusy(true); setPending("guest"); setMsg(""); setOk("");
    try {
      const { error } = await sb.auth.signInAnonymously();
      if (error) { setMsg(traducir(error.message)); return; }
      // La guía detecta al invitado (sin perfil) y arranca sola; además avisamos.
      try { window.dispatchEvent(new Event("starseed:open-onboarding")); } catch { /* */ }
      // onAuthStateChange marcará authed=true y desmontará esta pantalla.
    } catch (err: any) {
      setMsg(traducir(err?.message || ""));
    } finally {
      setBusy(false); setPending("");
    }
  };

  if (!ready || authed) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,.05)",
    border: "1px solid rgba(255,255,255,.14)",
    borderRadius: 12,
    padding: "12px 13px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
  };

  return (
    <>
    {/* Bienvenida/especificaciones ANTES del acceso (solo sin sesión). Se
        muestra por encima (z-index 210) y, al pulsar "Continuar", revela este
        AuthGate. Se autogestiona: no aparece si ya hay sesión ni si ya se vio. */}
    <WelcomeGate />
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Acceso a StarSeed"
      // Anti-overflow: 100dvh + padding compacto por clamp. El centrado no corta
      // porque la tarjeta interior tiene su propio max-height y scroll (abajo).
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(0.5rem, 2.5vw, 1.25rem)", height: "100dvh", background: "radial-gradient(circle at 30% 20%, #1a1030, #05060d 70%)", overflowY: "auto", WebkitOverflowScrolling: "touch" }}
    >
      <style>{`
        @keyframes ssAuthIn { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes ssOrbA { 0%,100% { transform: translate(0,0); } 50% { transform: translate(24px,18px); } }
        @keyframes ssOrbB { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-22px,-16px); } }
        .ss-auth-card { animation: ssAuthIn .5s cubic-bezier(.22,1,.36,1) both; }
        .ss-auth-scroll::-webkit-scrollbar { width: 8px; }
        .ss-auth-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 8px; }
        .ss-auth-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
        .ss-auth-orb-a { animation: ssOrbA 14s ease-in-out infinite; }
        .ss-auth-orb-b { animation: ssOrbB 16s ease-in-out infinite; }
        .ss-auth-field:focus { border-color: rgba(167,139,250,.7) !important; box-shadow: 0 0 0 3px rgba(124,92,255,.18); }
        .ss-auth-primary:hover:not(:disabled) { filter: brightness(1.08); }
        .ss-auth-primary:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
        .ss-auth-soft:hover:not(:disabled) { background: rgba(255,255,255,.08) !important; border-color: rgba(255,255,255,.28) !important; }
        .ss-auth-soft:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
        .ss-auth-ghostlink:hover:not(:disabled) { color: rgba(255,255,255,.9) !important; }
        .ss-auth-ghostlink:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; border-radius: 8px; }
        @media (prefers-reduced-motion: reduce) {
          .ss-auth-card, .ss-auth-orb-a, .ss-auth-orb-b { animation: none !important; }
        }
      `}</style>

      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div className="ss-auth-orb-a" style={{ position: "absolute", width: 460, height: 460, left: "-10%", top: "-12%", borderRadius: "50%", background: "radial-gradient(circle,#7c5cff55,transparent 60%)", filter: "blur(46px)" }} />
        <div className="ss-auth-orb-b" style={{ position: "absolute", width: 400, height: 400, right: "-8%", bottom: "-10%", borderRadius: "50%", background: "radial-gradient(circle,#23d5ab44,transparent 60%)", filter: "blur(46px)" }} />
      </div>

      {/* Tarjeta con SCROLL INTERNO: en pantallas cortas (~560px de alto) el
          contenido (logo, pestañas, formulario, OTP, invitado y propuesta de
          valor) hace scroll DENTRO de la tarjeta en lugar de recortarse por
          arriba/abajo. max-height ligada a 100dvh y padding compacto por clamp. */}
      <div className="ss-auth-card ss-auth-scroll" style={{ position: "relative", width: "100%", maxWidth: 420, maxHeight: "calc(100dvh - clamp(1rem, 5vw, 2.5rem))", overflowY: "auto", WebkitOverflowScrolling: "touch", background: "rgba(12,14,24,.82)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 24, padding: "clamp(20px, 4vw, 30px)", boxShadow: "0 30px 90px rgba(0,0,0,.55)", backdropFilter: "blur(16px)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", background: "linear-gradient(135deg,#7c5cff,#23d5ab)", boxShadow: "0 6px 18px rgba(124,92,255,.45)" }}>✶</span>
            <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1, background: "linear-gradient(135deg,#a78bfa,#34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>StarSeed OS</span>
          </div>
          <p style={{ opacity: .72, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            {mode === "in" ? "Inicia sesión para entrar a tu sistema." : "Crea tu cuenta StarSeed — recibirás tu dirección @star.seed."}
          </p>
        </div>

        <div role="tablist" aria-label="Entrar o crear cuenta" style={{ display: "flex", gap: 6, background: "rgba(255,255,255,.05)", borderRadius: 13, padding: 4, marginBottom: 18 }}>
          {(["in", "up"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setMsg(""); setOk(""); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "color .2s, background .2s", color: mode === m ? "#fff" : "rgba(255,255,255,.6)", background: mode === m ? "linear-gradient(135deg,#7c5cff,#23d5ab)" : "transparent" }}
            >
              {m === "in" ? "Entrar" : "Crear cuenta"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} noValidate>
          <label htmlFor="ss-auth-email" style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", opacity: .55, marginBottom: 6, fontWeight: 600 }}>Correo</label>
          <input
            id="ss-auth-email"
            ref={emailRef}
            className="ss-auth-field"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
            autoComplete="email"
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          <label htmlFor="ss-auth-pwd" style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", opacity: .55, marginBottom: 6, fontWeight: 600 }}>Contraseña</label>
          <div style={{ position: "relative", marginBottom: mode === "up" ? 6 : 14 }}>
            <input
              id="ss-auth-pwd"
              className="ss-auth-field"
              type={showPwd ? "text" : "password"}
              required
              minLength={6}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Tu contraseña"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              style={{ ...inputStyle, paddingRight: 64 }}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "rgba(255,255,255,.55)", fontSize: 11, cursor: "pointer", padding: "4px 6px", fontWeight: 600 }}
            >
              {showPwd ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {mode === "up" && (
            <p style={{ fontSize: 11, opacity: .45, margin: "0 0 12px", lineHeight: 1.4 }}>Mínimo 6 caracteres.</p>
          )}

          {msg ? <div role="alert" style={{ color: "#fca5a5", fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>{msg}</div> : null}
          {ok ? <div role="status" style={{ color: "#6ee7b7", fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>{ok}</div> : null}

          <button
            type="submit"
            className="ss-auth-primary"
            disabled={busy}
            aria-busy={busy && pending === "form"}
            style={{ width: "100%", border: "none", borderRadius: 13, padding: "13px 0", color: "#fff", fontWeight: 700, fontSize: 15, cursor: busy ? "default" : "pointer", opacity: busy && pending !== "form" ? .6 : busy ? .8 : 1, transition: "filter .15s, opacity .15s", background: "linear-gradient(135deg,#7c5cff,#23d5ab)", boxShadow: "0 10px 28px rgba(124,92,255,.35)" }}
          >
            {pending === "form" ? "Un momento…" : mode === "in" ? "Entrar al sistema" : "Crear mi cuenta StarSeed"}
          </button>
        </form>

        {/* Entrar con código por correo (sin contraseña) — OTP del OS */}
        {pending !== "otp" ? (
          <button
            type="button"
            className="ss-auth-soft"
            onClick={requestOtp}
            disabled={busy}
            style={{ width: "100%", marginTop: 10, border: "1px solid rgba(255,255,255,.16)", borderRadius: 13, padding: "11px 0", color: "rgba(255,255,255,.92)", fontWeight: 600, fontSize: 13.5, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1, transition: "background .15s, border-color .15s, opacity .15s", background: "rgba(255,255,255,.04)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <span aria-hidden>✉️</span>
            Entrar con código por correo (sin contraseña)
          </button>
        ) : (
          <div style={{ marginTop: 10 }}>
            <label htmlFor="ss-auth-otp" className="sr-only">Código de 6 dígitos</label>
            <input
              id="ss-auth-otp"
              className="ss-auth-field"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Código de 6 dígitos (de tu bandeja del OS)"
              style={{ ...inputStyle, marginBottom: 8, textAlign: "center", letterSpacing: "0.3em", fontSize: 18 }}
            />
            <button
              type="button"
              className="ss-auth-primary"
              onClick={verifyOtp}
              disabled={busy}
              aria-busy={busy}
              style={{ width: "100%", border: "none", borderRadius: 13, padding: "11px 0", color: "#fff", fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? .8 : 1, background: "linear-gradient(135deg,#7c5cff,#23d5ab)" }}
            >
              {busy ? "Verificando…" : "Verificar código y entrar"}
            </button>
            <button
              type="button"
              onClick={() => { setPending(""); setCode(""); setOk(""); }}
              style={{ width: "100%", marginTop: 6, background: "transparent", border: "none", color: "rgba(255,255,255,.5)", fontSize: 12, cursor: "pointer", padding: "4px 0" }}
            >
              Volver
            </button>
          </div>
        )}

        {/* separador */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 12px" }}>
          <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
          <span style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", opacity: .4 }}>o</span>
          <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
        </div>

        {/* Explorar sin cuenta — sesión anónima */}
        <button
          type="button"
          className="ss-auth-soft"
          onClick={exploreAsGuest}
          disabled={busy}
          aria-busy={busy && pending === "guest"}
          style={{ width: "100%", border: "1px solid rgba(255,255,255,.16)", borderRadius: 13, padding: "12px 0", color: "rgba(255,255,255,.95)", fontWeight: 600, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy && pending !== "guest" ? .6 : 1, transition: "background .15s, border-color .15s, opacity .15s", background: "rgba(255,255,255,.04)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <span aria-hidden>🚀</span>
          {pending === "guest" ? "Entrando como invitado…" : "Explorar sin cuenta"}
        </button>
        <p style={{ textAlign: "center", fontSize: 10.5, opacity: .45, margin: "7px 0 0", lineHeight: 1.45 }}>
          Entras como invitado y exploras al instante. Luego, desde la guía, puedes añadir un correo y conservar todo.
        </p>

        <button
          type="button"
          className="ss-auth-ghostlink"
          onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); setOk(""); }}
          style={{ width: "100%", background: "transparent", border: "none", color: "rgba(255,255,255,.6)", fontSize: 12, marginTop: 14, cursor: "pointer", transition: "color .15s" }}
        >
          {mode === "in" ? "¿No tienes cuenta? Crea una" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>

        {/* Propuesta de valor breve y honesta */}
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.08)", display: "grid", gap: 12 }}>
          {VALUE_PROPS.map((v) => (
            <div key={v.title} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
              <span aria-hidden style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#c4b5fd", background: "rgba(124,92,255,.14)", border: "1px solid rgba(124,92,255,.25)" }}>{v.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.88)" }}>{v.title}</div>
                <div style={{ fontSize: 11.5, opacity: .55, lineHeight: 1.45 }}>{v.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: 11, opacity: .5, marginTop: 18, lineHeight: 1.55 }}>
          Una sola cuenta para todo el ecosistema StarSeed (OS, Nexus, Café, Audiomorphic).<br />Al crear tu cuenta recibes tu dirección interna <b style={{ opacity: .85 }}>@star.seed</b> automáticamente.
        </p>
      </div>
    </div>
    </>
  );
}

export default AuthGate;
