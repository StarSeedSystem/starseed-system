'use client'

/**
 * AuthForm — el formulario de acceso de StarSeed OS (entrar / crear cuenta / código por correo).
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025A) Es el ÚNICO formulario de acceso. Antes había tres ventanas distintas
 * (`/login` con «Identidad Digital», `/bienvenida` con «StarSeed OS · Inicia sesión…» y la ventana
 * guiada del primer arranque); ahora las tres pintan `ventana-acceso.tsx`, que monta este formulario
 * SIN tarjeta propia (la tarjeta es la ventana: nada de tarjeta dentro de tarjeta).
 *
 * Reúne lo que tenía cada una:
 *   · pestañas «Entrar» / «Crear cuenta» con correo y contraseña (+ «Mostrar», y confirmación al crear);
 *   · la sugerencia de dirección @star.seed y la vinculación opcional de un correo externo (Adenda 188/189);
 *   · «Entrar con código por correo (sin contraseña)» — la misma lógica y las mismas rutas
 *     (`/api/auth/otp/request` y `/api/auth/otp/verify`) que tenía `AuthGate`, ahora en `codigo-correo.ts`;
 *   · el `?next=` seguro, `emailSugerido()` («Continuar como…») y el rito de bienvenida tras crear la cuenta.
 *
 * El texto de los errores va en español (`traducirErrorAuth`) y SIEMPRE se ve en línea (Adenda 184: el
 * sistema de avisos no renderizaba): un `<p role="alert">` en el propio formulario, además del aviso.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, Sparkles } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { iniciarRito, navegarSuave } from '@/lib/onboarding/director-rito'
import { emailSugerido, olvidarEmailSugerido } from '@/lib/entorno/deteccion-entorno'
import { haySiguiente, siguienteDeBusqueda } from '@/lib/auth/siguiente-seguro'
import { destinoTrasEntrar, type DestinoAlEntrar } from '@/lib/auth/destino-al-entrar'
import { traducirErrorAuth } from '@/lib/auth/traducir-error'
import { pedirCodigoCorreo, soloDigitosCodigo, verificarCodigoCorreo } from '@/lib/auth/codigo-correo'

/** Destino del enlace de confirmación por correo, conservando un `?next=` válido. */
function redireccionCorreo(): string {
    const base = `${location.origin}/auth/callback`
    if (!haySiguiente(location.search)) return base
    return `${base}?next=${encodeURIComponent(siguienteDeBusqueda(location.search, '/escritorios'))}`
}

export type PestanaAcceso = 'signin' | 'signup'
export type OrigenEntrada = 'password' | 'registro' | 'codigo'

export interface AuthFormProps {
    /** Pestaña con la que abre: «Entrar» (por defecto) o «Crear cuenta». */
    pestanaInicial?: PestanaAcceso
    /**
     * A dónde va tras entrar. `undefined` → la página principal; una ruta → esa; `null` → se queda donde
     * está. Un `?next=` válido en la URL manda siempre.
     */
    destinoAlEntrar?: DestinoAlEntrar
    /** Se llama justo al abrirse la sesión (por contraseña, por código o al crear la cuenta). */
    onEntrado?: (origen: OrigenEntrada) => void
    className?: string
}

const CAMPO =
    'h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3.5 text-base text-white placeholder:text-white/40 outline-none focus:border-violet-300/70 focus:ring-2 focus:ring-[#7c5cff]/30'
const ETIQUETA = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60'
const BOTON_PRIMARIO =
    'inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#7c5cff] to-[#23d5ab] text-[15px] font-bold text-white shadow-[0_10px_28px_rgba(124,92,255,0.35)] outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0c16] disabled:cursor-default disabled:opacity-70 motion-safe:transition-transform motion-safe:duration-200 motion-safe:active:scale-[0.99]'
const BOTON_SUAVE =
    'inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.04] px-3 text-sm font-semibold text-white/90 outline-none hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-default disabled:opacity-60'

const PESTANAS: { valor: PestanaAcceso; etiqueta: string }[] = [
    { valor: 'signin', etiqueta: 'Entrar' },
    { valor: 'signup', etiqueta: 'Crear cuenta' },
]

export function AuthForm({ pestanaInicial = 'signin', destinoAlEntrar, onEntrado, className }: AuthFormProps = {}) {
    const router = useRouter()
    const { toast } = useToast()
    const supabase = createClient()
    const idBase = React.useId()
    const [pestana, setPestana] = React.useState<PestanaAcceso>(pestanaInicial)
    const [isLoading, setIsLoading] = React.useState(false)
    // (Adenda 184) Mensaje INLINE a prueba de fallos: el sistema de toast de esta
    // app no renderizaba el aviso (login «no hacía nada, sin mensaje»). Este <p>
    // en el propio formulario SIEMPRE se ve, pase lo que pase con los toasts.
    const [authMsg, setAuthMsg] = React.useState<{ tipo: 'error' | 'ok'; txt: string } | null>(null)
    // El correo y la contraseña se conservan al cambiar de pestaña (quien teclea su correo y
    // descubre que quería «Crear cuenta» no lo escribe dos veces).
    // (2026-09-27) «Continuar como …» del aviso «Cuenta detectada en este dispositivo» deja el correo
    // sugerido; se rellena aquí y el foco pasa a la contraseña, para que el gestor de contraseñas del
    // navegador complete la guardada de esa cuenta.
    const [email, setEmail] = React.useState('')
    const [pass, setPass] = React.useState('')
    const [pass2, setPass2] = React.useState('')
    const [verPass, setVerPass] = React.useState(false)
    const [externo, setExterno] = React.useState('')
    const passSigninRef = React.useRef<HTMLInputElement>(null)
    const emailRef = React.useRef<HTMLInputElement>(null)
    // Entrar con código por correo: false = botón; true = campo del código.
    const [pideCodigo, setPideCodigo] = React.useState(false)
    const [codigo, setCodigo] = React.useState('')
    const [ocupadoCodigo, setOcupadoCodigo] = React.useState(false)

    React.useEffect(() => {
        const sugerido = emailSugerido()
        if (!sugerido) return
        setEmail(sugerido)
        const t = setTimeout(() => passSigninRef.current?.focus(), 60)
        return () => clearTimeout(t)
    }, [])
    const passNoCoincide = pass2.length > 0 && pass !== pass2
    const esStarSeed = email.trim().toLowerCase().endsWith('@star.seed')
    const esSignup = pestana === 'signup'

    // (Ola 247 · 2026-09-05) La voz lista desde la primera ventana. El demonio
    // neuronal (127.0.0.1:4444) duerme tras 10 min y tarda ~13-22 s en despertar;
    // la primera narración del rito lo pillaba dormido. Precalentamos en cuanto se
    // monta el acceso (mientras la persona escribe su correo y contraseña) para que,
    // si sigue al rito, la primera frase ya suene por la vía neuronal. Import dinámico
    // y envuelto: nunca bloquea el render ni rompe el formulario.
    React.useEffect(() => {
        void import('@/lib/aurora/voz-starseed/motor')
            .then((m) => m.precalentar())
            .catch(() => null)
    }, [])

    // (Adenda 182) Un fetch de auth RECHAZADO (red caída, o el proyecto Supabase
    // restringido por cuota — su 402 llega sin CORS y el navegador lo convierte
    // en excepción) moría en SILENCIO: sin toast, botón colgado. Honesto: se
    // captura y se DICE, con el motivo más probable.
    // (Adenda 182b) supabase-js REINTENTA en silencio ~10s los fallos de red
    // (nuestro caso real: el 402 de cuota llega sin CORS → parece red caída).
    // Sin este corte, el usuario pulsa y «no pasa nada» durante 10s. 8s y se dice.
    function conTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
        return Promise.race([p, new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), ms))])
    }

    function authFalloDuro(e: unknown, titulo: string) {
        console.error('[auth] fallo duro:', e)
        const desc = 'No se pudo contactar la autenticación. Puede ser tu red, o el proyecto Supabase del OS restringido por cuota (revisa su dashboard: estado/egress).'
        setAuthMsg({ tipo: 'error', txt: `${titulo}: ${desc}` })
        toast({ title: titulo, description: desc, variant: 'destructive' })
        setIsLoading(false)
    }

    function cambiarPestana(p: PestanaAcceso) {
        setPestana(p)
        setAuthMsg(null)
        setPideCodigo(false)
        setCodigo('')
    }

    /** Sesión abierta con contraseña o con código: se sigue a donde iba la persona (o se queda). */
    function terminarEntrada(origen: OrigenEntrada) {
        olvidarEmailSugerido()
        onEntrado?.(origen)
        // Página principal del OS: el último perfil activo se restaura solo
        // (starseed.profile.active.v1 permanece salvo cierre de sesión manual).
        // (2026-09-28) Si se llegó con `?next=` (p. ej. un enlace de llamada o de una app en vivo),
        // se vuelve allí; solo rutas internas seguras.
        const destino = destinoTrasEntrar(window.location.search, destinoAlEntrar)
        if (destino) router.push(destino)
        router.refresh()
    }

    async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)
        setAuthMsg(null)

        const correo = email.trim()
        const password = pass
        if (!correo || !password) {
            setAuthMsg({ tipo: 'error', txt: 'Escribe tu correo y una contraseña.' })
            setIsLoading(false)
            return
        }
        if (password !== pass2) {
            setAuthMsg({ tipo: 'error', txt: 'Las contraseñas no coinciden: revísalas.' })
            setIsLoading(false)
            return
        }

        let error: { message: string } | null = null
        let sesionYa = false
        try {
            const res = await conTimeout(supabase.auth.signUp({
                email: correo,
                password,
                options: {
                    emailRedirectTo: redireccionCorreo(),
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
            const txt = traducirErrorAuth(error.message)
            setAuthMsg({ tipo: 'error', txt })
            toast({
                title: 'Error de registro',
                description: txt,
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
            const ext = externo.trim().toLowerCase()
            if (ext.includes('@')) {
                try {
                    const { addExternalEmail } = await import('@/lib/mail/starseed-mail')
                    void addExternalEmail(ext)
                } catch { /* se puede vincular después en Correos */ }
            }
            onEntrado?.('registro')
            // ── (Ola 247 · 2026-09-05) EL CAMINO DEL REGISTRO LO MANDA EL DIRECTOR ──
            // Antes: marca suelta de sessionStorage + evento + recarga DURA
            // (`location.assign`). La recarga recreaba todos los porteros y la
            // página de destino podía fallar el `getUser` de red con la máquina
            // cargada → la persona veía un SEGUNDO formulario de acceso teniendo
            // ya sesión. Ahora el director de `director-rito.ts` abre el rito
            // (escribe también la marca legada por compatibilidad) y se navega
            // SUAVE con el router; `navegarSuave` solo recarga como último
            // recurso si el push no llega (modal encima). Sin el evento
            // `starseed:open-onboarding`: el director manda y así se evita que
            // dos porteros reaccionen a la vez.
            iniciarRito()
            navegarSuave(router, '/bienvenida')
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

        let error: { message: string } | null = null
        try {
            const res = await conTimeout(supabase.auth.signInWithPassword({ email: email.trim(), password: pass }), 8000)
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
            const txt = traducirErrorAuth(error.message)
            setAuthMsg({ tipo: 'error', txt })
            toast({
                title: 'Error de inicio de sesión',
                description: txt,
                variant: 'destructive',
            })
            setIsLoading(false)
        } else {
            terminarEntrada('password')
        }
    }

    // ── Entrar con código por correo (sin contraseña) — OTP del OS ──────────────────────────────
    // La lógica y las rutas son las de siempre (Adenda 71-bis); viven en `codigo-correo.ts`.
    async function pedirCodigo() {
        if (!email.trim()) {
            setAuthMsg({ tipo: 'error', txt: 'Escribe tu correo para enviarte el código.' })
            emailRef.current?.focus()
            return
        }
        setOcupadoCodigo(true)
        setAuthMsg(null)
        setCodigo('')
        const r = await pedirCodigoCorreo(email)
        setOcupadoCodigo(false)
        if (r.ok) {
            setPideCodigo(true)
            setAuthMsg({ tipo: 'ok', txt: r.aviso })
        } else {
            setAuthMsg({ tipo: 'error', txt: r.error })
        }
    }

    async function verificarCodigo() {
        setOcupadoCodigo(true)
        setAuthMsg(null)
        const r = await verificarCodigoCorreo(email, codigo, supabase)
        if (!r.ok) {
            setAuthMsg({ tipo: 'error', txt: r.error })
            setOcupadoCodigo(false)
            return
        }
        setOcupadoCodigo(false)
        terminarEntrada('codigo')
    }

    function alTeclearPestana(e: React.KeyboardEvent<HTMLButtonElement>) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const otra: PestanaAcceso = pestana === 'signin' ? 'signup' : 'signin'
        cambiarPestana(otra)
        // El foco acompaña a la pestaña activa (patrón de pestañas de WAI-ARIA).
        requestAnimationFrame(() => document.getElementById(`${idBase}-tab-${otra}`)?.focus())
    }

    const idPanel = `${idBase}-panel`
    const ocupado = isLoading || ocupadoCodigo

    return (
        <div className={cn('w-full', className)} data-testid="auth-form-acceso">
            <div role="tablist" aria-label="Entrar o crear cuenta" className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.05] p-1">
                {PESTANAS.map(({ valor, etiqueta }) => {
                    const activa = pestana === valor
                    return (
                        <button
                            key={valor}
                            id={`${idBase}-tab-${valor}`}
                            type="button"
                            role="tab"
                            aria-selected={activa}
                            aria-controls={idPanel}
                            tabIndex={activa ? 0 : -1}
                            onClick={() => cambiarPestana(valor)}
                            onKeyDown={alTeclearPestana}
                            className={cn(
                                'min-h-[44px] cursor-pointer rounded-xl text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-200',
                                activa
                                    ? 'bg-gradient-to-br from-[#7c5cff] to-[#23d5ab] text-white shadow-[0_6px_18px_rgba(124,92,255,0.35)]'
                                    : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                            )}
                        >
                            {etiqueta}
                        </button>
                    )
                })}
            </div>

            <div role="tabpanel" id={idPanel} aria-labelledby={`${idBase}-tab-${pestana}`} className="pt-4">
                {authMsg && (
                    <p
                        role={authMsg.tipo === 'error' ? 'alert' : 'status'}
                        className={cn(
                            'mb-3 rounded-xl border px-3 py-2 text-[12.5px] leading-snug',
                            authMsg.tipo === 'error'
                                ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                                : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
                        )}
                    >
                        {authMsg.txt}
                    </p>
                )}

                <form onSubmit={esSignup ? handleSignUp : handleSignIn} className="space-y-3.5">
                    <div>
                        <label htmlFor={`${idBase}-email`} className={ETIQUETA}>Correo</label>
                        <input
                            id={`${idBase}-email`}
                            ref={emailRef}
                            name="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={esSignup ? 'tu-nombre@star.seed' : 'nombre@starseed.net'}
                            autoComplete={esSignup ? 'email' : 'username'}
                            className={CAMPO}
                        />
                        {esSignup && email.length > 1 && !email.includes('@') && (
                            <button
                                type="button"
                                onClick={() => setEmail(`${email.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@star.seed`)}
                                className="mt-2 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 text-xs text-cyan-200 hover:bg-cyan-400/20 focus-visible:ring-2 focus-visible:ring-cyan-200"
                            >
                                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                                Usar {email.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@star.seed
                            </button>
                        )}
                        {esSignup && (
                            <p className="mt-1.5 text-[11px] leading-snug text-white/55">
                                Tu dirección <span className="text-cyan-300">@star.seed</span> es tu identidad en la red, o usa
                                cualquier correo externo. Después puedes vincular varios en Ajustes → Correos.
                            </p>
                        )}
                    </div>

                    <div>
                        <label htmlFor={`${idBase}-pass`} className={ETIQUETA}>Contraseña</label>
                        <div className="relative">
                            <input
                                id={`${idBase}-pass`}
                                ref={passSigninRef}
                                name="password"
                                type={verPass ? 'text' : 'password'}
                                required
                                minLength={esSignup ? 6 : undefined}
                                value={pass}
                                onChange={(e) => setPass(e.target.value)}
                                placeholder="Tu contraseña"
                                autoComplete={esSignup ? 'new-password' : 'current-password'}
                                className={cn(CAMPO, 'pr-[4.5rem]')}
                            />
                            <button
                                type="button"
                                onClick={() => setVerPass((v) => !v)}
                                aria-pressed={verPass}
                                aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-1 top-1/2 inline-flex h-11 min-w-[56px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg px-2 text-[11px] font-semibold text-white/65 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-200"
                            >
                                {verPass ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>
                        {esSignup && <p className="mt-1.5 text-[11px] text-white/45">Mínimo 6 caracteres.</p>}
                    </div>

                    {esSignup && (
                        <div>
                            <label htmlFor={`${idBase}-pass2`} className={ETIQUETA}>Confirmar contraseña</label>
                            <input
                                id={`${idBase}-pass2`}
                                type={verPass ? 'text' : 'password'}
                                required
                                value={pass2}
                                onChange={(e) => setPass2(e.target.value)}
                                placeholder="Repite tu contraseña"
                                autoComplete="new-password"
                                aria-invalid={passNoCoincide || undefined}
                                className={CAMPO}
                            />
                            {passNoCoincide && (
                                <p className="mt-1.5 text-[11px] text-rose-300" role="alert">Las contraseñas no coinciden.</p>
                            )}
                        </div>
                    )}

                    {esSignup && esStarSeed && (
                        <div>
                            <label htmlFor={`${idBase}-externo`} className={ETIQUETA}>Correo externo a vincular (opcional)</label>
                            <input
                                id={`${idBase}-externo`}
                                type="email"
                                value={externo}
                                onChange={(e) => setExterno(e.target.value)}
                                placeholder="tu-correo@gmail.com"
                                className={CAMPO}
                            />
                            <p className="mt-1.5 text-[11px] leading-snug text-white/55">
                                Como tu dirección @star.seed es nueva, puedes enlazar un correo externo desde el inicio
                                (recuperación y avisos). Podrás vincular más en Ajustes → Correos.
                            </p>
                        </div>
                    )}

                    <button type="submit" className={BOTON_PRIMARIO} disabled={ocupado || (esSignup && passNoCoincide)} aria-busy={isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        {isLoading ? 'Un momento…' : esSignup ? 'Crear mi cuenta' : 'Entrar a StarSeed OS'}
                    </button>
                </form>

                {/* Entrar con código por correo (sin contraseña) — OTP del OS. Solo al entrar. */}
                {!esSignup && (
                    <div className="mt-2.5">
                        {!pideCodigo ? (
                            <button type="button" className={BOTON_SUAVE} onClick={pedirCodigo} disabled={ocupado} aria-busy={ocupadoCodigo}>
                                {ocupadoCodigo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
                                Entrar con código por correo (sin contraseña)
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <label htmlFor={`${idBase}-codigo`} className="sr-only">Código de 6 dígitos</label>
                                <input
                                    id={`${idBase}-codigo`}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={codigo}
                                    onChange={(e) => setCodigo(soloDigitosCodigo(e.target.value))}
                                    placeholder="Código de 6 dígitos (de tu bandeja del OS)"
                                    className={cn(CAMPO, 'text-center text-lg tracking-[0.3em] placeholder:text-sm placeholder:tracking-normal')}
                                />
                                <button type="button" className={BOTON_PRIMARIO} onClick={verificarCodigo} disabled={ocupado} aria-busy={ocupadoCodigo}>
                                    {ocupadoCodigo && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                    {ocupadoCodigo ? 'Verificando…' : 'Verificar código y entrar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setPideCodigo(false); setCodigo(''); setAuthMsg(null) }}
                                    className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-xl text-xs text-white/60 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-200"
                                >
                                    Volver
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
