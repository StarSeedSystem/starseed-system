'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function AuthForm() {
    const router = useRouter()
    const { toast } = useToast()
    const supabase = createClient()
    const [isLoading, setIsLoading] = React.useState(false)
    // (Adenda 184) Mensaje INLINE a prueba de fallos: el sistema de toast de esta
    // app no renderizaba el aviso (login «no hacía nada, sin mensaje»). Este <p>
    // en el propio formulario SIEMPRE se ve, pase lo que pase con los toasts.
    const [authMsg, setAuthMsg] = React.useState<{ tipo: 'error' | 'ok'; txt: string } | null>(null)
    // Adenda 188/189: registro con identidad — sugerencia @star.seed en vivo,
    // confirmación de contraseña y vinculación opcional de correo externo.
    const [signupEmail, setSignupEmail] = React.useState('')
    const [signupPass, setSignupPass] = React.useState('')
    const [signupPass2, setSignupPass2] = React.useState('')
    const [signupExterno, setSignupExterno] = React.useState('')
    const passNoCoincide = signupPass2.length > 0 && signupPass !== signupPass2
    const esStarSeed = signupEmail.trim().toLowerCase().endsWith('@star.seed')

    // (Adenda 182) Un fetch de auth RECHAZADO (red caída, o el proyecto Supabase
    // restringido por cuota — su 402 llega sin CORS y el navegador lo convierte
    // en excepción) moría en SILENCIO: sin toast, botón colgado. Honesto: se
    // captura y se DICE, con el motivo más probable.
    // (Adenda 182b) supabase-js REINTENTA en silencio ~10s los fallos de red
    // (nuestro caso real: el 402 de cuota llega sin CORS → parece red caída).
    // Sin este corte, el usuario pulsa y «no pasa nada» durante 10s. 8s y se dice.
    function conTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
        return Promise.race([p, new Promise<"timeout">((res) => setTimeout(() => res("timeout"), ms))])
    }

    function authFalloDuro(e: unknown, titulo: string) {
        console.error('[auth] fallo duro:', e)
        const desc = 'No se pudo contactar la autenticación. Puede ser tu red, o el proyecto Supabase del OS restringido por cuota (revisa su dashboard: estado/egress).'
        setAuthMsg({ tipo: 'error', txt: `${titulo}: ${desc}` })
        toast({ title: titulo, description: desc, variant: 'destructive' })
        setIsLoading(false)
    }

    async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)
        setAuthMsg(null)

        const email = signupEmail.trim()
        const password = signupPass
        if (!email || !password) {
            setAuthMsg({ tipo: 'error', txt: 'Escribe tu correo y una contraseña.' })
            setIsLoading(false)
            return
        }
        if (password !== signupPass2) {
            setAuthMsg({ tipo: 'error', txt: 'Las contraseñas no coinciden: revísalas.' })
            setIsLoading(false)
            return
        }

        let error: { message: string } | null = null
        let sesionYa = false
        try {
            const res = await conTimeout(supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${location.origin}/auth/callback`,
                },
            }), 12000)
            if (res === 'timeout') {
                authFalloDuro(new Error('sin respuesta en 12s (reintentos silenciosos)'), 'Registro sin respuesta')
                return
            }
            ;({ error } = res)
            // Con la confirmación de correo desactivada, signUp devuelve sesión
            // al instante: el mensaje debe decir la verdad (Adenda 188).
            sesionYa = !!(res as { data?: { session?: unknown } })?.data?.session
        } catch (e) {
            authFalloDuro(e, 'Registro sin respuesta')
            return
        }

        if (error) {
            setAuthMsg({ tipo: 'error', txt: `Error de registro: ${error.message}` })
            toast({
                title: 'Error de registro',
                description: error.message,
                variant: 'destructive',
            })
        } else if (sesionYa) {
            setAuthMsg({ tipo: 'ok', txt: '¡Cuenta creada! Astraura te guía ahora en tu primera configuración.' })
            toast({
                title: '¡Cuenta creada!',
                description: 'Astraura te acompaña ahora en tu primera configuración.',
            })
            // (Adenda 189) Vinculación opcional del correo externo indicada al
            // registrarse con @star.seed — best-effort, nunca bloquea el alta.
            const externo = signupExterno.trim().toLowerCase()
            if (externo.includes('@')) {
                try {
                    const { addExternalEmail } = await import('@/lib/mail/starseed-mail')
                    void addExternalEmail(externo)
                } catch { /* se puede vincular después en Correos */ }
            }
            // Continuidad TOTAL: el rito de iniciación arranca al instante,
            // sin pantallas muertas entre el registro y la configuración.
            try { window.dispatchEvent(new Event('starseed:open-onboarding')) } catch { /* gate lo abre igual */ }
            // (Adenda 192) Auto-entrada REAL: ya hay sesión → salimos de /login
            // al OS (/escritorios) COMO en el inicio de sesión normal. El rito y
            // la guía corren así DENTRO del perfil recién creado, con sus
            // vínculos coherentes (perfil, cerebros, biblioteca…), y no sobre el
            // fondo del inicio de sesión, que reaparecía al terminar la guía.
            // (Adenda 193) Navegación VERIFICADA: el rito se abre en cuanto hay
            // sesión y, con un modal encima, `router.push` se cancela en
            // silencio (mismo patrón que los vínculos de la guía) — el registro
            // se quedaba en /login con la bienvenida encima. Si en 1,2 s no
            // hemos salido, se fuerza la navegación dura.
            router.push('/escritorios')
            router.refresh()
            window.setTimeout(() => {
                try {
                    if (window.location.pathname.startsWith('/login')) window.location.assign('/escritorios')
                } catch { /* el gate reabrirá el rito igualmente */ }
            }, 1200)
        } else {
            // Sin sesión automática. Con la confirmación desactivada esto casi
            // siempre significa que el correo YA tenía cuenta (Supabase lo
            // disimula por privacidad) — decirlo con honestidad y sin enredos.
            setAuthMsg({ tipo: 'ok', txt: 'No se abrió sesión automática. Si ese correo ya tenía cuenta, usa «Entrar»; si es un correo externo nuevo, revisa su bandeja por un enlace de confirmación.' })
            toast({
                title: 'Un paso más',
                description: 'Si el correo ya tenía cuenta, entra con tu contraseña.',
            })
        }

        setIsLoading(false)
    }

    async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)
        setAuthMsg(null)

        const formData = new FormData(event.currentTarget)
        const email = formData.get('email') as string
        const password = formData.get('password') as string

        let error: { message: string } | null = null
        try {
            const res = await conTimeout(supabase.auth.signInWithPassword({ email, password }), 8000)
            if (res === 'timeout') {
                authFalloDuro(new Error('sin respuesta en 8s (reintentos silenciosos)'), 'Inicio de sesión sin respuesta')
                return
            }
            ;({ error } = res)
        } catch (e) {
            authFalloDuro(e, 'Inicio de sesión sin respuesta')
            return
        }

        if (error) {
            setAuthMsg({ tipo: 'error', txt: `Error de inicio de sesión: ${error.message}` })
            toast({
                title: 'Error de inicio de sesión',
                description: error.message,
                variant: 'destructive',
            })
            setIsLoading(false)
        } else {
            // Página principal del OS: el último perfil activo se restaura solo
            // (starseed.profile.active.v1 permanece salvo cierre de sesión manual).
            router.push('/escritorios')
            router.refresh()
        }
    }

    return (
        <Card className="w-full max-w-[380px] mx-auto border-border/50 bg-background/50 backdrop-blur-xl">
            <CardHeader>
                <CardTitle>Identidad Digital</CardTitle>
                <CardDescription>Accede al StarSeed Network</CardDescription>
            </CardHeader>
            <CardContent>
                {authMsg && (
                    <p role="alert" style={{ fontSize: 12.5, lineHeight: 1.5, borderRadius: 10, padding: '9px 11px', marginBottom: 12,
                        color: authMsg.tipo === 'error' ? '#fca5a5' : '#6ee7b7',
                        background: authMsg.tipo === 'error' ? 'rgba(244,63,94,.08)' : 'rgba(16,185,129,.08)',
                        border: `1px solid ${authMsg.tipo === 'error' ? 'rgba(244,63,94,.28)' : 'rgba(16,185,129,.28)'}` }}>
                        {authMsg.txt}
                    </p>
                )}
                <Tabs defaultValue="signin" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 gap-1">
                        <TabsTrigger value="signin">Entrar</TabsTrigger>
                        <TabsTrigger value="signup">Registrarse</TabsTrigger>
                    </TabsList>

                    <TabsContent value="signin">
                        <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="email-signin">Email</Label>
                                <Input id="email-signin" name="email" type="email" placeholder="nombre@starseed.net" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password-signin">Contraseña</Label>
                                <Input id="password-signin" name="password" type="password" required />
                            </div>
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Iniciar Sesión
                            </Button>
                        </form>
                    </TabsContent>

                    <TabsContent value="signup">
                        <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="email-signup">Email</Label>
                                <Input id="email-signup" name="email" type="email" placeholder="tu-nombre@star.seed"
                                    value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
                                {signupEmail.length > 1 && !signupEmail.includes('@') && (
                                    <button
                                        type="button"
                                        onClick={() => setSignupEmail(`${signupEmail.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@star.seed`)}
                                        className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-200 transition-colors hover:bg-cyan-400/20"
                                    >
                                        ✦ Usar {signupEmail.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@star.seed
                                    </button>
                                )}
                                <p className="text-[11px] leading-snug text-muted-foreground">
                                    Tu dirección <span className="text-cyan-300">@star.seed</span> es tu identidad en la red —
                                    o usa cualquier correo externo (Gmail, Outlook…). Después puedes vincular varios
                                    correos a tu misma cuenta en Ajustes → Correos.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password-signup">Contraseña</Label>
                                <Input id="password-signup" name="password" type="password" required
                                    value={signupPass} onChange={(e) => setSignupPass(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password-signup-2">Confirmar contraseña</Label>
                                <Input id="password-signup-2" type="password" required
                                    value={signupPass2} onChange={(e) => setSignupPass2(e.target.value)} />
                                {passNoCoincide && (
                                    <p className="text-[11px] text-red-300" role="alert">Las contraseñas no coinciden.</p>
                                )}
                            </div>
                            {esStarSeed && (
                                <div className="space-y-2">
                                    <Label htmlFor="email-externo">Correo externo a vincular (opcional)</Label>
                                    <Input id="email-externo" type="email" placeholder="tu-correo@gmail.com"
                                        value={signupExterno} onChange={(e) => setSignupExterno(e.target.value)} />
                                    <p className="text-[11px] leading-snug text-muted-foreground">
                                        Como tu dirección @star.seed es nueva, puedes enlazar un correo externo a tu
                                        cuenta desde el inicio (recuperación y avisos). Podrás vincular más en
                                        Ajustes → Correos.
                                    </p>
                                </div>
                            )}
                            <Button type="submit" className="w-full" disabled={isLoading || passNoCoincide}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Crear Cuenta
                            </Button>
                        </form>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
