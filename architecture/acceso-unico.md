# Acceso único y puerta de sesión (Ola 1025T · ACC1025A y ACC1025B)

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
violeta→teal. Arriba el símbolo (`/starseed-symbol.png`) y «StarSeed»; debajo los **puntos de paso**
(bienvenida → qué es → gestos → cuenta; se puede saltar a cualquiera). El paso de la cuenta es el formulario y,
debajo, tres razones breves (una sola cuenta, dirección `@star.seed`, Aurora te guía). «Explorar sin cuenta» está
siempre. En el móvil ocupa toda la pantalla.

Cómo abre:

- Viniendo a **entrar** (`/login`, `/bienvenida`, «Entrar o crear cuenta»): en el paso de la cuenta, pestaña «Entrar».
- Viniendo a **conocer** («Ver la introducción», primer arranque, Ajustes → «Ver la guía» sin sesión): desde el
  principio; al llegar a la cuenta, pestaña «Crear cuenta».
- «Ya tengo cuenta» (paso 1) salta a la cuenta en «Entrar».

## 3. Quién abre qué

| Superficie | Disparador | Abre | Paso / pestaña |
|---|---|---|---|
| `/login` | enlace guardado, `?next=` | `PaginaAcceso` (`desde="login"`) | cuenta / Entrar. «Continuar como…» dentro de la tarjeta |
| `/bienvenida` | `AvisoSesion` → «Iniciar sesión», rutas viejas | `PaginaAcceso` (`desde="bienvenida"`) | cuenta / Entrar. Con cuenta y rito pendiente: el asistente. Cuenta ya lista: `/escritorios` |
| Primer arranque, app nativa y web instalada | sin sesión, sin marca «saltada» | `VentanaAcceso` solo | desde el principio |
| Primer arranque, web normal | ídem | aviso de abajo (`TarjetaBienvenida` `aviso`) → `VentanaAcceso` | «Entrar o crear cuenta»: cuenta / Entrar. «Ver la introducción»: principio |
| Puerta de sesión (perfil, Ajustes, Biblioteca, Correos) | página que pide cuenta, sin sesión | `TarjetaBienvenida` `puerta`; sus botones abren `VentanaAcceso` por el evento `starseed:abrir-primer-arranque` | igual que el aviso |
| Ajustes → Personalización → «Ver la guía» | botón | `abrirPrimerArranque()`: sin sesión `VentanaAcceso` desde el principio; con cuenta, los ajustes de la neurona | — |
| `AvisoSesion` («Inicia sesión para…») | «Iniciar sesión» / «Conoce StarSeed» | `/bienvenida` / el recorrido de Aurora (`abrirGuia({desde:"aviso"})`) | — |
| `PaginaAcceso` → «Conoce StarSeed» | botón del pie | el recorrido de Aurora (`abrirGuia({desde})`), por encima de la página | — |
| Enlaces de llamada y programas en vivo | `/login?next=…` | `PaginaAcceso`; al entrar vuelve a `next` | cuenta / Entrar |

La guía se puede abrir **sin crear cuenta** desde: la ventana de acceso (los pasos de la propia ventana, y en
`/login` y `/bienvenida` también «Conoce StarSeed»), Ajustes («Ver la guía»), la puerta («Ver la introducción») y
cada `AvisoSesion` («Conoce StarSeed»).

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
  de Radix bloquea lo que hay por encima. Ahí la guía son los pasos de la propia ventana. En `/login` y
  `/bienvenida` (que no son modales) sí hay «Conoce StarSeed». El modo invitado de la guía (GUI1021I/J: «Ir» y
  «Hazlo por mí» sustituidos, lo visto guardado en el aparato) sigue pendiente.
- **Ya no hay sesión anónima** desde la interfaz: `AuthGate` la creaba con `signInAnonymously`; «Explorar sin
  cuenta» ahora es lo de la ventana guiada de siempre (deja la marca y lleva a los escritorios, sin sesión).
- `WelcomeGate`/`WelcomeWindow` (permisos de Aurora e instalar la PWA) ya no se montan en `/login` ni en el
  portero: era la cuarta ventana de acceso y se retiró con las demás. Quedan sin montar (el código sigue ahí);
  los permisos de los sentidos se gestionan en Ajustes → Aurora → Sentidos y la descarga del OS está en la
  Biblioteca (`franja-descarga-os`). Si se quiere recuperar ese paso, tendría que ser un paso más de la ventana única.
- Las ~30 ventanas con su propio «Inicia sesión para…» siguen en manos de `AvisoSesion` (GUI1021M); la puerta
  solo sustituye a las páginas completas que pedían cuenta.
