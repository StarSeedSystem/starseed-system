# 🤝 Contribuir a StarSeed Network

Gracias por querer contribuir al **Sistema Operativo Social Descentralizado** de la Sociedad StarSeed. Este documento explica cómo participar de forma alineada con los principios del proyecto.

---

## Antes de empezar

1. **Lee [`CLAUDE.md`](CLAUDE.md)** para entender el proyecto.
2. **Lee [`memory/principles.md`](memory/principles.md)** para entender los valores no negociables.
3. **Lee [`memory/roadmap.md`](memory/roadmap.md)** para ver dónde encaja tu contribución.

## Cómo contribuir

### Reportar un bug

1. Comprueba si ya hay un issue abierto.
2. Si no, abre un issue con:
   - Pasos para reproducir.
   - Comportamiento esperado vs. observado.
   - Tu entorno (navegador, OS, versión del proyecto).
   - Screenshots / vídeo si ayuda.

### Proponer una feature

1. **Filtro previo:** ¿la feature respeta la Tríada Ideológica?
   - Ontocracia: ¿el usuario mantiene su soberanía directa?
   - Ciberdelia: ¿la tecnología expande consciencia, o controla/aliena?
   - Transhumanismo Comunista: ¿la feature es accesible sin pagar y procomún?
2. Abre un issue con el label `propuesta`.
3. Describe:
   - Problema que resuelve.
   - Solución propuesta.
   - Alternativas consideradas.
   - Impacto en arquitectura (referencia `memory/architecture.md` si aplica).
4. Espera discusión antes de implementar (las propuestas grandes requieren consenso).

### Enviar un Pull Request

1. **Fork** y crea una rama: `git checkout -b mi-feature`.
2. **Sigue el style guide**: ESLint + Prettier (ya configurados). Ejecuta `yarn lint` antes de commit.
3. **TypeScript estricto.** Sin `any` salvo justificación en comentario.
4. **Tests** para lógica no trivial (cuando exista la infraestructura de testing).
5. **Commits semánticos** (Conventional Commits):
   - `feat: añade votación delegada líquida`
   - `fix: corrige propagación de referencias en posts`
   - `docs: actualiza memory/architecture.md con ADR-001`
   - `refactor: extrae lógica de Trinity Interface a hook`
6. **Si cambias decisiones arquitectónicas**, actualiza primero `memory/architecture.md` y referéncialo en el PR.
7. **PR description**: explica qué, por qué, y cómo se ha verificado.

## Setup local

```bash
git clone https://github.com/StarSeedSystem/starseed-system.git
cd starseed-system
yarn install
cp .env.example .env       # rellena las variables
yarn dev                   # arranca http://localhost:9002
```

### Scripts útiles

```bash
yarn dev              # dev server con Turbopack
yarn build            # build de producción
yarn start            # arranca el build
yarn lint             # ESLint
yarn typecheck        # tsc --noEmit
yarn genkit:dev       # arranca Genkit (Exocórtex backend dev)
```

## Convenciones de código

### Componentes

- Funcionales con TypeScript (no class components).
- Props tipadas con interfaces (no `Props = {}`).
- Default export para el componente principal.
- Naming: `PascalCase.tsx` para componentes, `kebab-case.ts` para utilidades.

### Estilos

- Tailwind utility classes en JSX.
- Variantes con `class-variance-authority` (cva).
- Tokens del design system → consulta `design-system/starseed-system/MASTER.md`.
- **NO emojis como iconos** — usa Lucide React.
- `cursor: pointer` en todo lo clicable.
- Transiciones 150-300ms con curva suave.

### Estado

- React Context para estado global compartido entre rutas.
- React Hook Form para formularios.
- TanStack Query (a evaluar) para data fetching con cache, si Supabase Realtime no basta.

### Accesibilidad

- WCAG 2.1 AA mínimo.
- Contraste 4.5:1 en texto.
- `prefers-reduced-motion` respetado.
- Focus states visibles para navegación con teclado.

## Code of Conduct

Todo contribuyente acepta el **Pacto Ontocrático**:

1. **Respeto comunitario inquebrantable** — comunicación constructiva, sin descalificación personal.
2. **Justicia restaurativa** — los conflictos se resuelven por mediación, no por bans automáticos.
3. **Transparencia** — decisiones técnicas se justifican públicamente.
4. **Veracidad** — no se difunde información falsa deliberadamente.
5. **No discriminación ontológica** — respeto a todo participante por su contribución y entendimiento, no por origen, raza, género u orientación.

Comportamientos inaceptables:

- Acoso de cualquier tipo.
- Ataques personales o ad hominem.
- Doxxing o exposición de información privada.
- Promoción de ideologías incompatibles con la Tríada (autoritarismo, supremacismo, explotación).

Reportes confidenciales: alexbordongarrigos@gmail.com (mantenedores actuales).

## Licencia de las contribuciones

Al contribuir, aceptas que tu código se licencia bajo **AGPL-3.0-or-later** (la licencia del proyecto). Esto garantiza que el procomún se mantiene abierto.

---

*"La libertad conlleva responsabilidad. El ciudadano asume el compromiso ético de involucrarse en la toma de decisiones democráticas para evitar la estagnación."*  
— Constitución de la Sociedad StarSeed, Art. 9
