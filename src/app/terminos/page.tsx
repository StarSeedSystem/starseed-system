import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Términos · StarSeed OS",
  description: "Términos de uso de la app «StarSeed actividad» de StarSeed OS: acceso de solo lectura para el dueño y datos privados en sus nodos. Resumen en inglés.",
  alternates: { canonical: "/terminos" },
  openGraph: { title: "Términos · StarSeed OS", description: "Solo lectura para el dueño, datos privados en sus nodos. Resumen en inglés.", url: "/terminos", locale: "es_ES" },
};

const CONTACTO = "fundacionstarseed@gmail.com";
const VIGENCIA = "2026-11-11";
const URL_REVOCAR = "https://myaccount.google.com/permissions";
const URL_POLITICA_GOOGLE = "https://developers.google.com/terms/api-services-user-data-policy";

/** Estilos de la casa: titular Space Grotesk, cuerpo Inter, acentos Trinity. */
const H1 = "font-headline text-3xl font-bold tracking-tight md:text-4xl";
const H2 = "flex items-center gap-3 font-headline text-xl font-semibold tracking-tight";
const FILETE = "h-5 w-1 rounded-full";
const P = "text-[15px] leading-relaxed text-foreground/85";
const FUERTE = "font-semibold text-foreground";
const ENLACE = "cursor-pointer text-primary underline underline-offset-4 hover:text-primary/80";

/** Enlace externo del OS. */
function Externo({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={ENLACE}>{children}</a>;
}

/** Apartado del documento: titular de la casa y filete de acento Trinity. */
function Seccion({ titulo, acento, children }: { titulo: string; acento: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className={H2}>
        <span aria-hidden="true" className={`${FILETE} ${acento}`} />
        {titulo}
      </h2>
      <div className={`space-y-3 ${P}`}>{children}</div>
    </section>
  );
}

export default function TerminosPage() {
  return (
    <main className="relative min-h-dvh px-5 pb-28 pt-12 md:px-8 md:pt-16">
      {/* Velo adaptativo (regla de contraste del design system): el texto se lee
          igual sobre el fondo animado del OS, claro u oscuro. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 to-background/90" />
      <div className="relative z-10 mx-auto w-full max-w-3xl space-y-10 rounded-3xl border border-border/40 bg-background/80 p-6 backdrop-blur-xl md:p-10">
        <header className="space-y-3">
          <p className="font-code text-[11px] uppercase tracking-[0.2em] text-muted-foreground">StarSeed OS · documento público</p>
          <h1 className={H1}>Términos</h1>
          <p className="text-sm text-muted-foreground">
            Vigentes desde el <time dateTime={VIGENCIA}>11 de noviembre de 2026</time>. Dudas o peticiones:{" "}
            <a href={`mailto:${CONTACTO}`} className={ENLACE}>{CONTACTO}</a>.
          </p>
        </header>

        <Seccion titulo="Qué es y en qué estado está" acento="bg-trinity-emerald">
          <p>
            StarSeed OS es un sistema operativo social descentralizado, <strong className={FUERTE}>en desarrollo</strong> y de{" "}
            <strong className={FUERTE}>código abierto</strong>. Se ofrece tal cual, sin garantías de disponibilidad mientras evoluciona.
          </p>
        </Seccion>

        <Seccion titulo="Uso de la app «StarSeed actividad»" acento="bg-trinity-azure">
          <p>
            La app de Google «StarSeed actividad» (proyecto <em className="italic">starseed-system</em>) la usa{" "}
            <strong className={FUERTE}>solo su dueño</strong>: sus agentes leen en <strong className={FUERTE}>modo de solo lectura</strong> la
            actividad de las cuentas de ese dueño —correos enviados, archivos de Drive y YouTube— para preparar resúmenes y síntesis privadas.
            Nunca escriben en las cuentas. No hay cuentas de otros usuarios: la app no presta servicio a terceros.
          </p>
        </Seccion>

        <Seccion titulo="Tus datos" acento="bg-trinity-amber">
          <p>
            Lo leído se queda en los nodos del dueño: <strong className={FUERTE}>no se vende, no se comparte ni se usa para publicidad</strong>.
            El tratamiento de los datos recibidos de las API de Google respeta la{" "}
            <Externo href={URL_POLITICA_GOOGLE}>Política de datos de usuario de los servicios de API de Google</Externo>{" "}
            (<strong className={FUERTE}>Uso limitado</strong>). Puedes revocar el acceso cuando quieras desde{" "}
            <Externo href={URL_REVOCAR}>myaccount.google.com/permissions</Externo>.
          </p>
        </Seccion>

        <section lang="en" className="space-y-3">
          <h2 className={H2}>
            <span aria-hidden="true" className={`${FILETE} bg-trinity-cyan`} />
            Summary in English
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            StarSeed OS is a decentralized social operating system, in development and open source, offered as is. The Google app «StarSeed
            actividad» serves <strong className={FUERTE}>only its owner</strong>: agents read the owner&apos;s own activity (sent emails, Drive files,
            YouTube) in <strong className={FUERTE}>read-only mode</strong> to prepare private syntheses; they never write to the accounts. Data
            stays on the owner&apos;s nodes — never sold, never shared, never used for advertising. Google API data is handled under the Google API
            Services User Data Policy (Limited Use). Revoke access at <Externo href={URL_REVOCAR}>myaccount.google.com/permissions</Externo>.
            Contact: {CONTACTO}. Effective date: 11 November 2026.
          </p>
        </section>

        <footer className="border-t border-border/40 pt-6 text-sm text-muted-foreground">
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/" className={ENLACE}>StarSeed OS</Link>
            <Link href="/privacidad" className={ENLACE}>Política de privacidad</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
