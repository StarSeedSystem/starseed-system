# Llamadas: servidor de retransmisión (TURN) y canales privados (2026-09-28)

Guía para el dueño del OS. Explica qué se cambió en las llamadas, qué hay que activar y cómo
comprobar que funciona. Código: `src/lib/llamadas/*`, `src/app/api/llamadas/ice/route.ts`,
migración `supabase/migrations/20260928130000_l1-llamadas.sql`.

---

## 1. TURN: el «plan B» para que la llamada conecte siempre

### Qué es

En una llamada del OS, el audio y el vídeo viajan **directamente** entre los dispositivos de las
personas (WebRTC). Para encontrarse, cada navegador pregunta a un servidor **STUN** «¿cómo me ven
desde fuera?» y con eso intentan conectarse de tú a tú. Eso funciona en la mayoría de casas.

Un servidor **TURN** es un **repetidor**: cuando la conexión directa es imposible, los dos
navegadores le mandan su audio/vídeo y él lo reenvía al otro. No escucha ni guarda nada que
pueda entender: el contenido va cifrado de extremo a extremo (DTLS-SRTP) igualmente.

### Por qué hace falta

Sin TURN, una llamada **puede no conectar nunca** cuando alguna de las personas está en:

- redes de empresa, universidad, hotel o biblioteca con cortafuegos estrictos;
- algunos datos móviles (NAT de operador, «CGNAT»);
- dos routers con NAT simétrico.

En esos casos la ventana de la llamada ahora lo dice con honestidad:
**«Sin servidor de retransmisión: en redes muy cerradas puede no conectar.»** (solo cuando no
hay TURN configurado **y** una persona no consigue conectar).

### Cómo lo pide el OS

1. Al empezar o unirse a una llamada, el navegador pide `GET /api/llamadas/ice` **una vez**.
2. El servidor del OS pide al proveedor unas **credenciales temporales** (duran 24 h) y se las da
   al navegador junto a los STUN públicos. El navegador las guarda en memoria hasta que caducan.
3. Si no hay proveedor configurado o falla, el navegador sigue solo con STUN (la llamada funciona
   igual en redes normales).

La clave del proveedor **nunca** sale del servidor: al navegador solo llegan las URLs del
repetidor y un usuario/contraseña temporales. La ruta no guarda caché, tiene límite de
peticiones por IP y no responde a otras webs.

### Cómo activarlo (Cloudflare, recomendado)

1. Entra en el **panel de Cloudflare** → menú lateral **Realtime** → **TURN Server** →
   **Create**. Ponle un nombre (p. ej. «StarSeed OS») y confirma.
2. Cloudflare te muestra dos valores: el **Turn Token ID** y el **API Token**. Cópialos (el API
   Token solo se ve una vez).
3. Guárdalos como variables de entorno con **estos nombres exactos**:

   | Variable | Valor |
   |---|---|
   | `CLOUDFLARE_TURN_KEY_ID` | el *Turn Token ID* |
   | `CLOUDFLARE_TURN_KEY_API_TOKEN` | el *API Token* |

   - **En Vercel**: proyecto del OS → *Settings* → *Environment Variables* → añade las dos
     (entornos *Production* y *Preview*) → vuelve a desplegar para que las lea.
   - **En tu Mac (desarrollo)**: añádelas a `.env.local` en la raíz del repo y reinicia `next dev`.
   - **No** les pongas el prefijo `NEXT_PUBLIC_`: son secretas y solo las usa el servidor.
4. Coste: Cloudflare cobra el tráfico que pasa **por el repetidor** (solo las llamadas que no
   pueden ir directas); consulta su página de precios de *Realtime TURN*. Las llamadas que
   conectan directas no gastan nada.

### Alternativas (si no usas Cloudflare)

- **Metered** (tiene plan gratuito pequeño): `METERED_TURN_DOMAIN` (p. ej. `tuapp.metered.live`,
  solo el dominio, sin `https://`) y `METERED_TURN_API_KEY`.
- **Un TURN propio (coturn) con usuario fijo**: `TURN_URL` (una o varias URLs `turn:`/`turns:`
  separadas por comas), `TURN_USER`, `TURN_CRED`. Ojo: una credencial fija se entrega tal cual a
  cada navegador; es mejor Cloudflare o Metered, que dan credenciales temporales.
  (`NEXT_PUBLIC_TURN_URL/_USER/_CRED` siguen funcionando por compatibilidad.)

Si hay varias configuradas, el orden es: Cloudflare → Metered → TURN fijo → solo STUN (si una
falla, se prueba la siguiente).

### Cómo comprobarlo

Abre `https://<tu-dominio>/api/llamadas/ice` en el navegador: debe responder
`"fuente":"cloudflare"` (o `metered` / `estatico`). Si dice `"fuente":"stun"`, el servidor no
ve las variables o el proveedor rechazó la clave (el log del servidor dice cuál y con qué código,
sin mostrar la clave).

---

## 2. Canales privados: solo entra quien debe

### Qué cambió

Para ponerse de acuerdo (quién está, ofertas de conexión, «he colgado»…), las personas de una
llamada se hablan por un **canal de Supabase Realtime**. Antes ese canal era **público**:
cualquiera que conociera el identificador de la llamada podía escuchar esa conversación técnica
o colarse en ella. Ahora es **privado**: el servidor de Supabase comprueba en cada entrada si
esa persona puede estar ahí.

| Canal | Quién puede entrar |
|---|---|
| `llamada:<id>` | quien creó la llamada, sus invitados y los miembros del chat |
| `llamada:<id>:<token>` | cualquiera con el **enlace público** mientras el enlace siga activo, la llamada no haya terminado y no haya caducado (también sin cuenta) |
| `vivo:<id>` y `vivo:<id>:<token>` | lo mismo para el contador «N personas dentro» de las apps en vivo |

Cuando una llamada tiene enlace público, **todos** (también los miembros del chat) usan el canal
con token, para estar en la misma sala que los invitados. Si el enlace se crea a mitad de la
llamada (botón «Invitar»), la llamada **suma** el canal nuevo sin cortar a nadie y avisa a los
demás para que hagan lo mismo.

### Qué hay que hacer

Aplicar la migración `supabase/migrations/20260928130000_l1-llamadas.sql` en el proyecto de
Supabase del OS (crea tres funciones de comprobación y cuatro políticas sobre
`realtime.messages`). Es idempotente: se puede aplicar dos veces sin problema.

- **No** desactives «Allow public access» en *Realtime → Settings*: otras partes del OS siguen
  usando canales públicos (y sin eso solo funcionarían los privados).

### Mientras la migración no esté aplicada

Las llamadas **no se abren** y la ventana lo explica: *«No se pudo abrir el canal privado de la
llamada… Por seguridad no se usa un canal público en su lugar.»* Es a propósito: nunca se baja
la seguridad sin avisar. Los contadores de las tarjetas quedan en blanco y no reintentan en
bucle (se vuelve a probar a los 5 minutos).

### Cómo comprobarlo

En el editor SQL de Supabase:

```sql
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname LIKE 'l1_%';
```

Deben salir 4 políticas. Después, una llamada entre dos cuentas del mismo chat debe conectar, y
un enlace público revocado ya no debe dejar entrar a nadie nuevo.

---

## 3. Volver a donde ibas después de iniciar sesión (`?next=`)

Los enlaces que piden cuenta (p. ej. «Iniciar sesión» en `/llamada/<id>` o en `/vivo/<id>`)
llevan a `/login?next=<ruta>`. Tras entrar con contraseña, con «Continuar como…» o tras el
enlace de confirmación del correo (`/auth/callback`), el OS vuelve a esa ruta, **solo** si es una
ruta interna del propio OS (nunca otra web, ni `/api`, ni `/auth`). La comprobación vive en
`src/lib/auth/siguiente-seguro.ts`. El alta de una cuenta nueva sigue yendo primero a la
bienvenida (`/bienvenida`).

## Límites conocidos (honestos)

- Quien entra en una **app en vivo** con enlace público y sin cuenta no suma al contador
  «N dentro» desde dentro de la app (la ruta de la app no lleva el token); sí lo ve en la página
  del enlace.
- Si se revoca el enlace público a mitad de llamada, quien ya estaba dentro sigue (Supabase
  comprueba el permiso al entrar al canal); el enlace deja de servir para entrar.
- El límite de peticiones de `/api/llamadas/ice` es por instancia del servidor (primera barrera,
  no un tope global exacto).
