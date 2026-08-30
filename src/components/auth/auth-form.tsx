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

        const formData = new FormData(event.currentTarget)
        const email = formData.get('email') as string
        const password = formData.get('password') as string

        let error: { message: string } | null = null
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
        } else {
            setAuthMsg({ tipo: 'ok', txt: 'Verifica tu correo: te enviamos un enlace de confirmación.' })
            toast({
                title: 'Verifica tu correo',
                description: 'Te hemos enviado un enlace de confirmación.',
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
                                <Input id="email-signup" name="email" type="email" placeholder="nombre@starseed.net" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password-signup">Contraseña</Label>
                                <Input id="password-signup" name="password" type="password" required />
                            </div>
                            <Button type="submit" className="w-full" disabled={isLoading}>
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
