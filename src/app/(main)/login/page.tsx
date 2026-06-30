import { AuthForm } from '@/components/auth/auth-form'
import { Logo } from '@/components/logo'
import { SessionResumePrompt } from '@/components/sso/session-resume-prompt'

export default function LoginPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
            <div className="mb-8 scale-150">
                <Logo />
            </div>
            {/* SSO (#93): si ya hay una sesión StarSeed en este dispositivo
                (p.ej. iniciada en Café/Nexus, proyecto Supabase compartido),
                ofrece entrar con un toque. Si no detecta sesión, no renderiza
                nada y el formulario de abajo se comporta exactamente igual. */}
            <div className="mb-4 w-full max-w-[350px]">
                <SessionResumePrompt />
            </div>
            <AuthForm />
        </div>
    )
}
