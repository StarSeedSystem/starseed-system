# 🌌 StarSeed Network — Sistema Operativo Social Descentralizado

> La encarnación digital de la **Sociedad StarSeed**: una red social viva y autoorganizada para la gobernanza ontocrática, la educación universal y la cultura floreciente.

[![Estado](https://img.shields.io/badge/fase-Semilla-green)]() [![Licencia](https://img.shields.io/badge/licencia-AGPL--3.0-blue)](LICENSE) [![Next.js](https://img.shields.io/badge/Next.js-15-black)]() [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)]()

---

## Qué es

**StarSeed Network** es un **Sistema Operativo Social Descentralizado (SOSD)** de código abierto, diseñado para ser completamente accesible online y altamente funcional. No es solo una aplicación: es la infraestructura digital de una nueva forma de organización social.

Implementa la **Tríada Ideológica** de la Sociedad StarSeed:

- 🜂 **Ontocracia** — Democracia directa con meritocracia del entendimiento.
- 🜁 **Ciberdelia** — Tecnología para la expansión de la consciencia, jamás para el control.
- 🜃 **Transhumanismo Comunista** — Post-escasez vía automatización emancipadora y procomún de la infraestructura.

## Cómo se accede

1. **Web (PWA)** — visita [starseed-nexus.vercel.app](https://starseed-nexus.vercel.app) (Fase Semilla).
2. **Instalable** — la PWA se instala como app en iOS, Android, macOS, Linux y Windows.
3. **App nativa** (Fase Fruto) — Tauri (desktop) + Capacitor (mobile).
4. **Distro Linux propia** (Fase Cosecha) — StarSeed OS con escritorio Trinity DE.

## Stack actual (Fase Semilla)

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui + Radix |
| 3D / WebGL | Three.js + React Three Fiber + Spline |
| Animación | Framer Motion + custom Liquid Glass |
| Backend | Supabase (Postgres + Auth + Realtime + Storage) |
| IA | Genkit + Google AI (Gemini) — opt-in, plan de migración a open-weight |
| Hosting | Vercel (auto-deploy desde `main`) |

## Empezar a desarrollar

```bash
git clone https://github.com/StarSeedSystem/starseed-system.git
cd starseed-system
yarn install               # o npm install
cp .env.example .env       # rellena las variables de Supabase
yarn dev                   # arranca en http://localhost:9002
```

Para más detalle: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Estructura del proyecto

```
.
├── CLAUDE.md              ← memoria de trabajo (lee esto primero)
├── memory/                ← memoria persistente del proyecto
│   ├── principles.md      ← Tríada Ideológica → implicaciones técnicas
│   ├── roadmap.md         ← roadmap técnico de 3 fases
│   ├── architecture.md    ← decisiones arquitectónicas
│   ├── state.md           ← bitácora cronológica de cambios
│   └── glossary.md        ← glosario completo
├── architecture/          ← SOPs y especificaciones (Capa Abstracta)
├── design-system/         ← sistema de diseño Liquid Crystal
├── docs/                  ← documentación de producto
├── src/                   ← aplicación (Capa Tangible)
│   ├── app/               ← rutas Next.js App Router
│   ├── components/        ← UI components (crystal/, trinity/, etc.)
│   ├── ai/                ← Exocórtex y flujos Genkit (Capa Neural)
│   ├── services/          ← lógica de negocio
│   └── lib/, utils/       ← utilidades
└── supabase/              ← migraciones y config de Supabase
```

## Principios no negociables

Antes de proponer una feature, comprueba que cumple:

- [ ] Respeta la Tríada Ideológica.
- [ ] El usuario es soberano sobre sus datos.
- [ ] No introduce tracking, publicidad ni paywall a funcionalidad democrática.
- [ ] El código es 100% open source.
- [ ] La moderación implícita es restaurativa, no punitiva.
- [ ] La estética eleva al usuario, no lo atrapa.

Detalle completo: [`memory/principles.md`](memory/principles.md).

## Documentos fundacionales

La autoridad máxima del proyecto son los documentos vivos en Google Drive de la Sociedad StarSeed:

- [Constitución de la Sociedad StarSeed](https://docs.google.com/document/d/1XpltI3gkYN1Ma2wBVrlisPagL_HfeoF1RsnFKG09w4I/edit)
- [Manifiesto Fundacional](https://docs.google.com/document/d/1YiX9QK_JJHbmRMRj8fXrJeNffsDQ8T2RhzMHTeyavA0/edit)
- [Codex StarSeed (Arquitectura social)](https://docs.google.com/document/d/1Q7ygZvMlrVD4I7nO36jC4t8ttFezw__2K_w54L6HXNc/edit)
- [Documento Maestro del SOSD](https://docs.google.com/document/d/1DaX2bl8dIMSKR1yVtOHqh3iVtV_sLARMiSPFGkywa3M/edit)

## Roadmap

- **🌱 Fase Semilla** (Q3-Q4 2026) — WebOS / PWA, los 3 ecosistemas operativos a nivel MVP, ~100 usuarios.
- **🌿 Fase Fruto** (Q1-Q3 2027) — federación, apps nativas, infraestructura propia, ~1000 usuarios.
- **🌾 Fase Cosecha** (2028+) — distro Linux propia, gratuidad sistémica, ~10000+ usuarios.

Detalle completo: [`memory/roadmap.md`](memory/roadmap.md).

## Licencia

[AGPL-3.0-or-later](LICENSE) — el código es procomún. Cualquier uso (incluso SaaS) debe mantener la apertura.

## Comunidad

- Issues y propuestas técnicas: [GitHub Issues](https://github.com/StarSeedSystem/starseed-system/issues)
- Propuestas políticas del producto: dentro de la propia red, en `/network/politics` (dogfooding desde Fase Semilla).

---

*"Aquí, la tecnología sirve al espíritu. Aquí, el poder sirve a la verdad. Aquí, la vida sirve a la vida."*  
— Manifiesto Fundacional de la Sociedad StarSeed
