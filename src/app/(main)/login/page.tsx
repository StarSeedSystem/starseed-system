import { AuthForm } from '@/components/auth/auth-form'
import { Logo } from '@/components/logo'

export default function LoginPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
            <div className="mb-8 scale-150">
                <Logo />
            </div>
            <AuthForm />
        </div>
    )
}
