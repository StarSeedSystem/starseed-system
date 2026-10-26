# Acceso único y puerta de sesión (Ola 1025T · ACC1025A y ACC1025B)

> **Actualización (Ola 1025U · GUIA1025U, 2026-10-26):** la introducción de la ventana ya no tiene sus 4 pasos: recorre
> el catálogo único de la guía completa (24 pasos en 9 capítulos, `lib/onboarding/guia-completa.ts`), el mismo que la
> guía de Aurora. Qué cambia en esta ventana está en §2 y §3; el catálogo, el progreso y el modo sin cuenta, en
> `architecture/guias-introduccion.md` §6.

> Alex, 2026-10-25: «Hay unas 3 ventanas de iniciar sesión / crear cuenta con diseños distintos. Deja SOLO la
> guiada, mejorada, y que `/login`, `/bienvenida` y cada botón «Entrar / Crear cuenta» lleven a esa ventana.»
> Y: «Las páginas que piden sesión no deben enseñar una tarjeta suelta «Inicia sesión…»: que se vea detrás,
> difuminada, la página vacía, y delante la bienvenida.»

## 1. Qué había y qué hay

| Antes | Ahora |
|---|---|
| `/login` → `LoginExperience` → `AuthForm` en una `Card` («Identidad Digital») + `WelcomeGate` | `LoginExperience` solo monta `PaginaAcceso` |
| `/bienvenida` → `AuthGate` («StarSeed OS · Inicia sesión…», con su OTP y su «Explorar sin cuenta» anónimo) | la página monta `PaginaAcceso`; `AuthGate` queda como portero delgado que también la monta |
| Ventana guiada del primer arranque («Crea tu cuenta o entra», `VentanaBienvenida`) | `VentanaAcceso` (la misma ventana, en un diálogo) |
| Tarjeta «Tu perfil · Inicia sesión…» en perfil, Ajustes, Biblioteca, Correos | `PuertaSesion` |

Archivos (todo en `src/`):

- `components/auth/ventana-acceso.tsx` — `ContenidoAcceso` (el contenido, sin marco), `VentanaAcceso` (marco de
  diálogo) y `PaginaAcceso` (marco de página, z 90 para que el recorrido de Aurora, z 95, se vea por encima).
- `components/auth/auth-form.tsx` — el único formulario: pestañas Entrar / Crear cuenta, «Mostrar», confirmación
  al crear, sugerencia `@star.seed`, correo externo opcional, `?next=` seguro y «Entrar con código por correo».
- `lib/auth/codigo-correo.ts` — la lógica del código por correo (salió de `AuthGate`, sin cambiar rutas ni textos):
  `POST /api/auth/otp/request` y `POST /api/auth/otp/verify`, y `auth.setSession`.
- `lib/auth/traducir-error.ts` y `lib/auth/destino-al-entrar.ts` — errores en español y a dónde se va al entrar.
- `components/auth/puerta-sesion.tsx` + `vista-previa-sesion.tsx` — la puerta y las vistas de detrás.
- `components/onboarding/tarjeta-bienvenida.tsx` — la tarjeta «Te damos la bienvenida a StarSeed OS» (aviso de
  abajo y puerta del centro).
- `lib/onboarding/puerta-visible.ts` — contador que apaga el aviso de abajo mientras hay una puerta.
- `lib/onboarding/explorar-sin-cuenta.ts` — «Explorar sin cuenta», una sola manera.

## 2. La ventana

Una tarjeta de cristal oscuro (sin tarjeta dentro de tarjeta), con acentos Trinity muy sutiles y el degradado
violeta→teal. Arriba el símbolo (`/starseed-symbol.png`) y «StarSeed»; debajo, la **barra de capítulos** (nueve tramos
de 44 px: Bienvenida · Trinity y gestos · El sistema · La red · Librería y Biblioteca · Genesis y PoliGenesis ·
Personalización segura · Tu espacio · Tu cuenta; se puede saltar a cualquiera), el **índice** (botón «Índice · capítulo»
con la lista de capítulos y los pasos del actual) y «**Paso N de 24**». Los 24 pasos son los de la guía completa, cada uno
con su demostración animada cargada a demanda. El último paso es el formulario y, debajo, tres razones breves (una sola
cuenta, dirección `@star.seed`, Aurora te guía).

El pie queda pegado abajo (`sticky`, en la ventana y en la página): «Atrás» · «Siguiente» (en el penúltimo, «Crear cuenta o
entrar»), y debajo **«Saltar a crear cuenta»** (en todos los pasos menos en el último) y **«Explorar sin cuenta»** (siempre).
Flechas del teclado y deslizar con el dedo pasan de paso (no en el formulario ni en la práctica de gestos); Esc cierra el
índice si el foco está en él y, si no, la ventana. Con `prefers-reduced-motion` solo se funde y las demostraciones llegan
quietas. En el móvil ocupa toda la pantalla y el contenido se desplaza por dentro.

**Retomar:** al abrirla desde el principio («Ver la introducción», primer arranque) sigue por el paso en que se dejó
(`lib/onboarding/guia-progreso.ts`, dato local del aparato) con «Retomas donde lo dejaste · Empezar de nuevo». Abrir
directo en la cuenta no borra lo que se llevaba leído.

Cómo abre:

- Viniendo a **entrar** (`/login`, `/bienvenida`, «Entrar o crear cuenta»): en el paso de la cuenta, pestaña «Entrar».
- Viniendo a **conocer** («Ver la introducción», primer arranque, Ajustes → «Ver la guía» sin sesión): desde el
  principio; al llegar a la cuenta, pestaña «Crear cuenta».
- «Ya tengo cuenta» (paso 1) salta a la cuenta en «Entrar». «Saltar a crear cuenta» (cualquier paso) salta a la cuenta en
  «Crear cuenta».
- La guía de Aurora, al terminar **sin cuenta** desde `/login` o `/bienvenida`, le pide a la página la pestaña con el
  evento `starseed:guia-accion` (`pedirAccesoDesdeGuia`, `lib/onboarding/guia-acceso.ts`); `PaginaAcceso` lo atiende
  (`escucharGuia`) y va a la cuenta en «Crear cuenta» o «Entrar».

## 3. Quién abre qué

| Superficie | Disparador | Abre | Paso / pestaña |
|---|---|---|---|
| `/login` | enlace guardado, `?next=` | `PaginaAcceso` (`desde="login"`) | cuenta / Entrar. «Continuar como…» dentro de la tarjeta |
| `/bienvenida` | `AvisoSesion` → «Iniciar sesión», rutas viejas | `PaginaAcceso` (`desde="bienvenida"`) | cuenta / Entrar. Con cuenta y rito pendiente: el asistente. Cuenta ya lista: `/escritorios` |
| Primer arranque, app nativa y web instalada | sin sesión, sin marca «saltada» | `VentanaAcceso` solo | desde el principio |
| Primer arranque, web normal | ídem | aviso de abajo (`TarjetaBienvenida` `aviso`) → `VentanaAcceso` | «Entrar o crear cuenta»: cuenta / Entrar. «Ver la introducción»: principio |
| Puerta de sesión (perfil, Ajustes, Biblioteca, Correos) | página que pide cuenta, sin sesión | `TarjetaBienvenida` `puerta`; sus botones abren `VentanaAcceso` por el evento `starseed:abrir-primer-arranque` | igual que el aviso |
| Ajustes → Personalización → «Reproducir guía del sistema» | botón (y «Empezar por…» un capítulo) | la guía de Aurora por la puerta común (`abrirGuia({desde:"ajustes"})`), con o sin sesión; retoma donde se quedó | — |
| Ajustes → Personalización → «Primer arranque: acceso y ajustes de esta neurona» | botón | `abrirPrimerArranque()`: sin sesión `VentanaAcceso` desde el principio; con cuenta, los ajustes de la neurona | — |
| `AvisoSesion` («Inicia sesión para…») | «Iniciar sesión» / «Conoce StarSeed» | `/bienvenida` / el recorrido de Aurora (`abrirGuia({desde:"aviso"})`) | — |
| `PaginaAcceso` → «Conoce StarSeed» | botón del pie | el recorrido de Aurora (`abrirGuia({desde})`), por encima de la página | — |
| Enlaces de llamada y programas en vivo | `/login?next=…` | `PaginaAcceso`; al entrar vuelve a `next` | cuenta / Entrar |

La guía COMPLETA (los mismos 24 pasos) se puede abrir **sin crear cuenta** desde: la ventana de acceso (los pasos de la
propia ventana, y en `/login` y `/bienvenida` también «Conoce StarSeed»), Ajustes («Reproducir guía del sistema»), la
puerta («Ver la introducción») y cada `AvisoSesion` («Conoce StarSeed»).

## 4. La puerta de sesión

Detrás, la página como sería con datos vacíos —el perfil por defecto usa la CABECERA REAL (`ProfileHeader`) con
portada de sistema, avatar vacío, «Tu nombre», «@usuario», las pestañas reales (`SectionTabs`) y bloques de
sección—, con `blur` y un velo, `aria-hidden` + `inert` + `pointer-events-none`. Delante, centrada, la tarjeta con
sus tres acciones. Mientras hay una puerta a la vista, el aviso de abajo del primer arranque no sale y tampoco se
abre solo la ventana completa de la app nativa (la puerta ofrece lo mismo).

Dónde se usa y qué vista pinta:

| Página | Vista de detrás | Por qué |
|---|---|---|
| `/profile` | perfil vacío | es «mi perfil» |
| `/profile/me` (el alias propio de `/profile/[username]`) | perfil vacío | ídem; los perfiles ajenos son públicos y se ven sin cuenta |
| Ajustes (`/cuenta`) y su panel «Identidad soberana» | perfil vacío | su cabecera es la del perfil |
| `/library` | vista neutra de la Biblioteca (selector de entidad y carpetas) | un perfil no se parece a la Biblioteca |
| `/correos` | vista neutra de la bandeja | ídem |

## 5. Límites conocidos

- **El recorrido de Aurora no puede abrirse desde la ventana en diálogo** (`VentanaAcceso`): un diálogo modal
  de Radix bloquea lo que hay por encima. Ahí la guía completa son los pasos de la propia ventana (mismo catálogo,
  mismo «Paso N de 24»). En `/login` y `/bienvenida` (que no son modales) sí hay «Conoce StarSeed». El modo
  invitado de la guía de Aurora ya existe (GUIA1025U): «Ir» y «Hazlo por mí» a zonas con cuenta se sustituyen por
  «Disponible al entrar», y el final ofrece crear cuenta, entrar o explorar.
- Esc dentro de la ventana en diálogo la cierra entera (comportamiento normal de un diálogo); con el foco en el índice de
  capítulos, cierra solo el índice.
- **Ya no hay sesión anónima** desde la interfaz: `AuthGate` la creaba con `signInAnonymously`; «Explorar sin
  cuenta» ahora es lo de la ventana guiada de siempre (deja la marca y lleva a los escritorios, sin sesión).
- `WelcomeGate`/`WelcomeWindow` (permisos de Aurora e instalar la PWA) ya no se montan en `/login` ni en el
  portero: era la cuarta ventana de acceso y se retiró con las demás. Quedan sin montar (el código sigue ahí);
  los permisos de los sentidos se gestionan en Ajustes → Aurora → Sentidos y la descarga del OS está en la
  Biblioteca (`franja-descarga-os`). Si se quiere recuperar ese paso, tendría que ser un paso más de la ventana única.
- Las ~30 ventanas con su propio «Inicia sesión para…» siguen en manos de `AvisoSesion` (GUI1021M); la puerta
  solo sustituye a las páginas completas que pedían cuenta.
