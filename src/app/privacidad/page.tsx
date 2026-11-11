import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Política de privacidad · StarSeed OS",
  description:
    "Qué datos toca la app «StarSeed actividad»: solo lectura, en los nodos del dueño, sin venta, sin compartir y sin publicidad. Resumen en inglés.",
  alternates: { canonical: "/privacidad" },
  openGraph: {
    title: "Política de privacidad · StarSeed OS",
    description:
      "Solo lectura, datos privados del dueño, sin venta ni publicidad. Resumen en inglés.",
    url: "/privacidad",
    locale: "es_ES",
  },
};

const CONTACTO = "fundacionstarseed@gmail.com";
const VIGENCIA = "2026-11-11";
const URL_REVocar = "https://myaccount.google.com/permissions";
const URL_POLITICA_GOOGLE =
  "https://developers.google.com/terms/api-services-user-data-policy";

/** Enlace externo del OS: el color lo pone el token `primary` y el puntero, la casa. */
function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="cursor-pointer text-primary underline underline-offset-4 hover:text-primary/80"
    >
      {children}
    </a>
  );
}

/** Apartado del documento: titular de la casa y filete de acento Trinity. */
function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-3 font-headline text-xl font-semibold tracking-tight">
        <span aria-hidden="true" className="h-5 w-1 rounded-full bg-trinity-emerald" />
        {titulo}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

export default function PrivacidadPage() {
  return (
    <main className="relative min-h-dvh px-5 pb-28 pt-12 md:px-8 md:pt-16">
      <div className="mx-auto w-full max-w-3xl space-y-10 rounded-3xl border border-border/40 bg-background/70 p-6 backdrop-blur-xl md:p-10">
        <header className="space-y-3">
          <p className="font-code text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            StarSeed OS · documento público
          </p>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Política de privacidad
          </h1>
          <p className="text-sm text-muted-foreground">
            Vigente desde el{" "}
            <time dateTime={VIGENCIA}>11 de noviembre de 2026</time>. Para cualquier duda o
            petición sobre estos datos, escribe a{" "}
            <a
              href={`mailto:${CONTACTO}`}
              className="cursor-pointer text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {CONTACTO}
            </a>
            .
          </p>
        </header>

        <Seccion titulo="Qué es StarSeed OS">
          <p>
            StarSeed OS es un sistema operativo social descentralizado,{" "}
            <strong className="font-semibold text-foreground">en desarrollo</strong> y de{" "}
            <strong className="font-semibold text-foreground">código abierto</strong>. Cada
            persona puede desplegar su propio nodo y tener su exocórtex: una inteligencia personal
            que le pertenece y que trabaja sobre sus datos, en sus máquinas.
          </p>
        </Seccion>

        <Seccion titulo="La app «StarSeed actividad»">
          <p>
            La aplicación de Google «StarSeed actividad» (proyecto{" "}
            <em className="italic">starseed-system</em>) la usa{" "}
            <strong className="font-semibold text-foreground">únicamente su dueño</strong>. Sus
            agentes leen, en{" "}
            <strong className="font-semibold text-foreground">modo de solo lectura</strong>, la
            actividad de las cuentas de ese dueño —correos enviados, archivos de Drive y
            YouTube— con los permisos <em className="italic">gmail.readonly</em>,{" "}
            <em className="italic">drive.readonly</em> y{" "}
            <em className="italic">youtube.readonly</em>. Con esas lecturas preparan resúmenes y
            síntesis privadas. Nunca escriben en las cuentas ni envían nada en su nombre.
          </p>
        </Seccion>

        <Seccion titulo="Dónde quedan los datos">
          <p>
            Lo leído se queda en los nodos del dueño.{" "}
            <strong className="font-semibold text-foreground">
              No se vende, no se comparte ni se usa para publicidad.
            </strong>{" "}
            No llega a ningún modelo de pago ni a terceros. El uso de los datos recibidos de las
            API de Google respeta la{" "}
            <Enlace href={URL_POLITICA_GOOGLE}>
              Política de datos de usuario de los servicios de API de Google
            </Enlace>{" "}
            (requisito de <strong className="font-semibold text-foreground">Uso limitado</strong>).
          </p>
        </Seccion>

        <Seccion titulo="Cómo revocar el acceso">
          <p>
            En cualquier momento puedes retirar el permiso desde{" "}
            <Enlace href={URL_REVocar}>myaccount.google.com/permissions</Enlace>. Al revocarlo, la
            app deja de tener acceso a tus cuentas y sus tokens caducan.
          </p>
        </Seccion>

        <section lang="en" className="space-y-3">
          <h2 className="flex items-center gap-3 font-headline text-xl font-semibold tracking-tight">
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-trinity-amber" />
            Summary in English
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            StarSeed OS is a decentralized social operating system, in development and open source.
            The Google app «StarSeed actividad» is used{" "}
            <strong className="font-semibold text-foreground">only by its owner</strong>: agents
            read the owner&apos;s own activity (sent emails, Drive files, YouTube) in{" "}
            <strong className="font-semibold text-foreground">read-only mode</strong> to prepare
            private syntheses; they never write to the accounts. Data stays on the owner&apos;s
            nodes — never sold, never shared, never used for advertising. Google API data is
            handled under the Google API Services User Data Policy (Limited Use). Access can be
            revoked at <Enlace href={URL_REVocar}>myaccount.google.com/permissions</Enlace>. Contact:{" "}
            {CONTACTO}. Effective date: 11 November 2026.
          </p>
        </section>

        <footer className="border-t border-border/40 pt-6 text-sm text-muted-foreground">
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/" className="cursor-pointer text-primary underline underline-offset-4 hover:text-primary/80">
              StarSeed OS
            </Link>
            <Link href="/terminos" className="cursor-pointer text-primary underline underline-offset-4 hover:text-primary/80">
              Términos
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
