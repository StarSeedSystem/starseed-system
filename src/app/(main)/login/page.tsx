import { LoginExperience } from '@/components/auth/login-experience'

// Página de acceso (/login) — compacta, tipo Café: nunca desborda la pantalla.
// La lógica de cliente (bienvenida previa + centrado 100dvh + scroll interno)
// vive en <LoginExperience> para mantener esta ruta como un Server Component fino.
export default function LoginPage() {
    return <LoginExperience />
}
