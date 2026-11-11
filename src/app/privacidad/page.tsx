import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad · StarSeed OS",
  description:
    "Cómo StarSeed OS trata los datos de la app «StarSeed actividad»: solo lectura, datos privados del dueño, sin venta ni publicidad. Resumen en inglés.",
};

const CONTACTO = "fundacionstarseed@gmail.com";
const VIGENCIA = "2026-11-11";

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#0d1024] to-black text-cyan-50 px-5 py-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-cyan-400/60">StarSeed OS · documento público</p>
          <h1 className="text-3xl font-bold tracking-tight">Política de privacidad</h1>
          <p className="text-cyan-200/70">
            Vigencia desde el {VIGENCIA}. Para preguntas o peticiones sobre estos datos, escribe a{" "}
            <a href={`mailto:${CONTACTO}`} className="underline cursor-pointer hover:text-cyan-200">
              {CONTACTO}
            </a>
            .
          </p>
        </header>
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Qué es StarSeed OS</h2>
          <p className="text-cyan-100/80 leading-relaxed">
            StarSeed OS es un sistema operativo social descentralizado, <strong>en desarrollo</strong> y de{" "}
            <strong>código abierto</strong>. Cada persona puede desplegar su propio nodo y tener su exocórtex: una
            inteligencia personal que le pertenece.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">La app «StarSeed actividad»</h2>
          <p className="text-cyan-100/80 leading-relaxed">
            La aplicación de Google «StarSeed actividad» (proyecto <em>starseed-system</em>) la usa{" "}
            <strong>únicamente su dueño</strong>. Sus agentes leen, en <strong>modo de solo lectura</strong>, la
            actividad de las cuentas de ese dueño —correos enviados, archivos de Drive y YouTube— con los permisos
            <em> gmail.readonly</em>, <em>drive.readonly</em> y <em>youtube.readonly</em>. Con esas lecturas preparan
            resúmenes y síntesis privadas. Nunca escriben en las cuentas ni envían nada en su nombre.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Dónde quedan los datos</h2>
          <p className="text-cyan-100/80 leading-relaxed">
            Lo leído se queda en los nodos del dueño. <strong>No se vende, no se comparte ni se usa para
            publicidad.</strong> No llega a ningún modelo de pago ni a terceros. El uso de los datos recibidos de las
            API de Google respeta la{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline cursor-pointer hover:text-cyan-200"
            >
              Política de datos de usuario de los servicios de API de Google
            </a>{" "}
            (requisito de <strong>Uso limitado</strong>).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Cómo revocar el acceso</h2>
          <p className="text-cyan-100/80 leading-relaxed">
            En cualquier momento puedes retirar el permiso desde{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline cursor-pointer hover:text-cyan-200"
            >
              myaccount.google.com/permissions
            </a>
            . Al revocar, la app deja de tener acceso y los token caducan.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Summary in English</h2>
          <p className="text-cyan-200/70 leading-relaxed text-sm">
            StarSeed OS is a decentralized social operating system, in development and open source. The Google app
            «StarSeed actividad» is used <strong>only by its owner</strong>: agents read the owner&apos;s own activity
            (sent emails, Drive files, YouTube) in <strong>read-only mode</strong> to prepare private syntheses. Data
            stays on the owner&apos;s nodes; it is never sold, shared or used for advertising. Access can be revoked at{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline cursor-pointer hover:text-cyan-200"
            >
              myaccount.google.com/permissions
            </a>
            . Contact: {CONTACTO}. Effective date: {VIGENCIA}. Use of Google API data complies with the Google API
            Services User Data Policy, including the Limited Use requirements.
          </p>
        </section>
        <footer className="border-t border-cyan-500/15 pt-6 text-sm text-cyan-300/50">
          <p>
            <Link href="/" className="underline cursor-pointer hover:text-cyan-200">StarSeed OS</Link>
            {" · "}
            <Link href="/terminos" className="underline cursor-pointer hover:text-cyan-200">Términos</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
