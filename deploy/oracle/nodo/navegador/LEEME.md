# Navegador propio de MetaGenesis en el nodo A1 (NAV1112B)

Contenedor por sesión con **Chromium, Xvfb y Playwright para Python** sobre
**linux/arm64**. Es la base de `architecture/navegador-propio-metagenesis.md`
(§3 y §5): los guiones lectores abren páginas con la sesión ya iniciada y
extraen texto; ningún modelo conduce el navegador.

- **Apagado por defecto:** `restart: "no"` y todos los servicios bajo el
  perfil Compose `navegador`, así que un `docker compose up -d` sin más no
  enciende nada.
- **Tope de memoria: 1500M** por contenedor (`mem_limit`).
- **Ningún puerto publicado.** Chromium arranca con
  `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222`: el
  puerto de depuración solo existe DENTRO del contenedor. Los guiones
  lectores (NAV1112C) se conectan desde dentro, por ejemplo:
  `docker compose -f compose-navegador.yml exec navegador-google-alex python3 /app/…`
- No toca `compose-a1.yml`: es un compose aparte, que se enciende y se apaga
  por su cuenta.

## Sesiones y volúmenes

Una sesión por cuenta, cada una con su volumen propio para el perfil:

| Servicio | Sesión | Volumen del perfil |
| :---- | :---- | :---- |
| `navegador-google-alex` | google-alex | `navegador_google_alex` |
| `navegador-google-fundacion` | google-fundacion | `navegador_google_fundacion` |
| `navegador-instagram-maggasukha` | instagram-maggasukha | `navegador_instagram_maggasukha` |
| `navegador-instagram-sociedad` | instagram-sociedad | `navegador_instagram_sociedad` |

El volumen se monta en `/home/navegador/perfiles` y pertenece al usuario
`navegador` (uid 1000, sin privilegios, permisos 0700). El uid coincide con
el PUID del escritorio Selkies a propósito, para que el alta manual use el
mismo perfil sin cambiar dueños.

## Encender una sesión

```bash
cd deploy/oracle/nodo/navegador
docker compose -f compose-navegador.yml up -d navegador-google-alex
```

Enciende SOLO ese servicio (un Chromium con el perfil de la sesión, bajo
Xvfb, en escucha de depuración solo en su 127.0.0.1). `docker compose ps`
debe mostrar un único contenedor.

## Apagar

```bash
cd deploy/oracle/nodo/navegador
docker compose -f compose-navegador.yml down
```

Los contenedores se van y **los volúmenes de los perfiles se quedan**:
la sesión no caduca por apagar. Borrar un volumen (`docker volume rm …`)
borra el alta de esa cuenta.

## Dónde están los perfiles y regla dura

Los perfiles viven **solo en su volumen Docker** del nodo A1
(`docker volume inspect navegador_google_alex` enseña la ruta en disco).
Nunca se copian fuera del nodo: no a Drive, ni a `starseed_memory_root`, ni
a git, ni a la orden de claves hacia otros medios, ni a copias de seguridad
automáticas. El perfil de una sesión equivale a la cuenta entera, y su
protección es parte del contrato de §5 del SOP. Quien necesite leer algo de
ese navegador, lo lee dentro del nodo; lo que sale del nodo son las fichas
ya extraídas por los guiones, marcadas `privado: true`.

## Alta manual: la misma sesión dentro del escritorio Selkies

Para que Alex inicie sesión a mano se reutiliza el escritorio **Selkies que
ya existe** (`deploy/oracle/nodo/selkies/`, apagado por defecto): no se
instala otro escritorio y no se publica nada nuevo. La idea es montar el
volumen del perfil dentro del contenedor de Selkies con un fichero de
recomposición temporal en `/tmp` (fuera del repo, nada versionado), y que
Alex abra el Chromium de esa sesión desde el escritorio.

1. Encender Selkies con el volumen del perfil montado (ejemplo para
   `google-alex`):

```bash
cd deploy/oracle/nodo/selkies
cat > /tmp/alta-navegador.yml <<'EOF'
services:
  selkies:
    volumes:
      - navegador_google_alex:/config/perfiles/google-alex
EOF
docker compose -f compose-selkies.yml -f /tmp/alta-navegador.yml up -d
```

2. Entrar al escritorio por **MetaGenesis › Apps Linux** (ruta `/apps-linux/`
   del nodo, solo por `127.0.0.1` detrás de Caddy, con la sesión del nodo).
3. Abrir la terminal del escritorio y lanzar el Chromium de esa sesión:

```bash
chromium --user-data-dir=/config/perfiles/google-alex
```

4. Alex escribe su contraseña y su segundo factor a mano, cierra el
   Chromium y cierra sesión en el escritorio. Ningún agente ve ni teclea
   contraseñas.
5. Apagar Selkies y retirar el fichero temporal (el volumen queda intacto):

```bash
docker compose -f compose-selkies.yml -f /tmp/alta-navegador.yml down
rm /tmp/alta-navegador.yml
```

## Notas

- `--no-sandbox` está en la orden de arranque porque el sandbox del
  navegador no siempre arranca dentro de un contenedor; el aislamiento real
  lo dan el contenedor, el usuario sin privilegios y los volúmenes 0700.
- Los interruptores de los guiones (`STARSEED_NAVEGADOR`,
  `STARSEED_NAVEGADOR_INSTAGRAM`) viven en los módulos de lectura
  (NAV1112A/NAV1112C); este compose solo enciende o apaga.
- Los cuatro alta y las re-altas cuando una sesión caduque se detallan en
  §4.2 y §7 del SOP (`architecture/navegador-propio-metagenesis.md`).



