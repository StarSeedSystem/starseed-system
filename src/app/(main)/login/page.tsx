"use client";

import { useEffect } from "react";
import { LoginExperience } from "@/components/auth/login-experience";

// Página de acceso (/login) — compacta, tipo Café: nunca desborda la pantalla.
// La lógica de cliente (bienvenida previa + centrado 100dvh + scroll interno)
// vive en <LoginExperience>. (Ola 227) Al montar se precalienta el motor
// neuronal de voz en segundo plano, para que la bienvenida suene con la voz
// neural y no con la del navegador; no bloquea el clic «Con voz», que sigue
// siendo el gesto de usuario que habilita el audio.
export default function LoginPage() {
    useEffect(() => {
        void import("@/lib/aurora/motor-voz")
            .then((m) => m.precalentarMotorNeural())
            .catch(() => null);
    }, []);
    return <LoginExperience />;
}
