"use client";

// ════════════════════════════════════════════════════════════════════════════
// LoginExperience — experiencia de acceso compacta (tipo Café), anti-overflow
// ----------------------------------------------------------------------------
// Rediseño del /login para que NO se salga por arriba ni por abajo en pantallas
// chicas: contenedor a 100dvh, centrado, con SCROLL INTERNO si el contenido no
// cabe. Mantiene intactos el formulario existente (<AuthForm>) y el prompt de
// sesión (<SessionResumePrompt>), sólo mejora el marco (compacto, glass, es-ES).
//
// Flujo (solo si NO hay sesión): primero aparece la ventana de bienvenida /
// especificaciones (<WelcomeGate>), con los sentidos de Aurora, el flujo de
// permisos y el botón de instalar; al pulsar "Continuar" se revela el acceso.
//
// Aditivo y defensivo: si el usuario ya tiene sesión, <WelcomeGate> no se
// muestra y el prompt de reanudar/formulario se comportan igual que antes.
// ════════════════════════════════════════════════════════════════════════════

import { AuthForm } from "@/components/auth/auth-form";
import { Logo } from "@/components/logo";
import { SessionResumePrompt } from "@/components/sso/session-resume-prompt";
import { WelcomeGate } from "@/components/welcome/welcome-gate";

export function LoginExperience() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        height: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Scroll interno del envoltorio si el contenido supera la altura visible,
        // en lugar de desbordar el layout (nunca se corta por arriba/abajo).
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "clamp(0.75rem, 3vw, 1.5rem)",
      }}
    >
      {/* Bienvenida/especificaciones ANTES del acceso (solo sin sesión). */}
      <WelcomeGate />

      {/* Columna compacta y centrada (máx. ~380px, estilo Café). */}
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          // Padding vertical mínimo para respirar sin empujar fuera de pantalla.
          paddingTop: "clamp(0.5rem, 2vh, 1.25rem)",
          paddingBottom: "clamp(0.5rem, 2vh, 1.25rem)",
        }}
      >
        {/* Logo un poco más contenido que antes (evita desbordes en móvil). */}
        <div style={{ transform: "scale(1.2)", transformOrigin: "center", marginBottom: 4 }}>
          <Logo />
        </div>

        {/* SSO (#93): "Continuar como…" si ya hay sesión en el dispositivo. */}
        <div style={{ width: "100%" }}>
          <SessionResumePrompt />
        </div>

        <AuthForm />
      </div>
    </div>
  );
}

export default LoginExperience;
