import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos · StarSeed OS",
  description:
    "Términos de uso de la app «StarSeed actividad» de StarSeed OS: acceso de solo lectura para el dueño, datos privados en sus nodos. Resumen en inglés.",
};

const CONTACTO = "fundacionstarseed@gmail.com";
const VIGENCIA = "2026-11-11";

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#0d1024] to-black text-cyan-50 px-5 py-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-fuchsia-400/60">StarSeed OS · documento público</p>
          <h1 className="text-3xl font-bold tracking-tight">Términos</h1>
          <p className="text-cyan-200/70">
            Vigentes desde el {VIGENCIA}. Dudas o peticiones:{" "}
            <a href={`mailto:${CONTACTO}`} className="underline cursor-pointer hover:text-cyan-200">
              {CONTACTO}
            </a>
            .
          </p>
        </header>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Qué es y en qué estado está</h2>
          <p className="text-cyan-100/80 leading-relaxed">
            StarSeed OS es un sistema operativo social descentralizado, <strong>en desarrollo</strong> y de{" "}
            <strong>código abierto</strong>. Se ofrece tal cual, sin garantías de disponibilidad mientras evoluciona.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Uso de la app «StarSeed actividad»</h2>
          <p className="text-cyan-100/80 leading-relaxed">
            La app de Google «StarSeed actividad» (proyecto <em>starseed-system</em>) la usa <strong>solo su
            dueño</strong>: sus agentes leen en <strong>modo de solo lectura</strong> la actividad de las cuentas de
            ese dueño —correos enviados, archivos de Drive y YouTube— para preparar resúmenes y síntesis privadas.
            Nunca escriben en las cuentas. No hay cuentas de otros usuarios: la app no presta servicio a terceros.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Tus datos</h2>
          <p className="text-cyan-100/80 leading-relaxed">
            Lo leído se queda en los nodos del dueño: <strong>no se vende, no se comparte ni se usa para
            publicidad</strong>. El tratamiento de los datos recibidos de las API de Google respeta la{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline cursor-pointer hover:text-cyan-200"
            >
              Política de datos de usuario de los servicios de API de Google
            </a>{" "}
            (<strong>Uso limitado</strong>). Puedes revocar el acceso cuando quieras desde{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline cursor-pointer hover:text-cyan-200"
            >
              myaccount.google.com/permissions
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Summary in English</h2>
          <p className="text-cyan-200/70 leading-relaxed text-sm">
            StarSeed OS is a decentralized social operating system, in development and open source, offered as is.
            The Google app «StarSeed actividad» serves <strong>only its owner</strong>: agents read the owner&apos;s
            own activity (sent emails, Drive files, YouTube) in <strong>read-only mode</strong> to prepare private
            syntheses; they never write to the accounts. Data stays on the owner&apos;s nodes — never sold, shared or
            used for advertising. Google API data is handled under the Google API Services User Data Policy (Limited
            Use). Revoke access at myaccount.google.com/permissions. Contact: {CONTACTO}. Effective date: {VIGENCIA}.
          </p>
        </section>
        <footer className="border-t border-cyan-500/15 pt-6 text-sm text-cyan-300/50">
          <p>
            <Link href="/" className="underline cursor-pointer hover:text-cyan-200">StarSeed OS</Link>
            {" · "}
            <Link href="/privacidad" className="underline cursor-pointer hover:text-cyan-200">
              Política de privacidad
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
