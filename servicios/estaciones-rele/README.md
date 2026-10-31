# Relé de estaciones en vivo

Servidor WebSocket propio que reparte los mensajes de las estaciones en vivo (Omnifrecuencias,
Audiomorphic, estaciones de Genesis) entre quienes escuchan la misma estación.

## Por qué existe

Cada mensaje de Supabase Realtime cuenta una vez **por cada conectado que lo recibe**, y el plan
gratuito da 2 M al mes. Con muchos oyentes, las preguntas y respuestas de hora crecen con N² y agotan
la cuota en pocas horas de emisión (`architecture/estaciones-en-vivo-parametricas.md` §4.1). Este relé
reparte los mismos sobres sin contar mensajes, en el Oracle A1 gratuito.

Es **aditivo**: el cliente (`src/lib/estaciones/canal-rele.ts`) sigue usando Supabase y suma este
canal. El relé **no es de confianza**: solo ve sobres firmados (y cifrados en las estaciones privadas),
y el cliente verifica todo lo que llega por él igual que lo que llega por Supabase.

## Qué hace (contrato con el cliente, §4.3)

- El cliente abre `wss://<host>/ws?tema=<tema>`. El tema es el mismo de Supabase
  (`estacion-vivo:…` o `estacion-p:…`). Una conexión vive en una sola sala.
- Reenvía a **los demás** de la sala solo los textos que empiezan por `{"t":"est"` y miden como mucho
  40 000 caracteres. Lo binario y lo ajeno se descarta.
- Cada vez que alguien entra o sale, manda a cada conectado `{"t":"rele","n":N}` (N le cuenta a él; el
  cliente enseña N − 1 oyentes).
- Cierres: 1008 sala rechazada (tema no válido, sala llena o demasiadas salas), 1009 mensaje demasiado
  grande, 1013 relé saturado, 1001 el relé se reinicia (el cliente reconecta solo).
- Ping cada 30 s; quien no contesta se corta.
- **Nunca registra el contenido, el tema ni la URL** (en una estación privada el tema se deriva del
  token). Solo escribe, una vez por minuto, cuentas: conexiones, entradas, rechazadas, mensajes,
  entregas y saltados (sobres no enviados a un oyente que no daba abasto).

Archivos: `salas.mjs` (lógica pura, probada en `src/lib/estaciones/__tests__/rele-salas.test.ts`) y
`servidor.mjs` (la red, con el paquete `ws`).

## Variables

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `PUERTO` | `8787` | Puerto en el que escucha. |
| `HOST` | `127.0.0.1` | Solo local: delante va Caddy con TLS. En un contenedor, `0.0.0.0`. |
| `MAX_CONEXIONES` | `5000` | Tope total; por encima cierra con 1013. |

Sin claves: el relé no necesita ninguna.

## Instalar en la VM de Oracle (systemd)

Necesita Node 20 o más.

```bash
sudo useradd --system --home /opt/estaciones-rele --shell /usr/sbin/nologin rele
sudo mkdir -p /opt/estaciones-rele
sudo cp servicios/estaciones-rele/{package.json,salas.mjs,servidor.mjs} /opt/estaciones-rele/
cd /opt/estaciones-rele && sudo npm install --omit=dev   # `npm ci` cuando haya package-lock.json
sudo chown -R rele:rele /opt/estaciones-rele
```

Unidad `/etc/systemd/system/estaciones-rele.service`:

```ini
[Unit]
Description=Relé de estaciones en vivo de StarSeed OS
After=network-online.target
Wants=network-online.target

[Service]
User=rele
WorkingDirectory=/opt/estaciones-rele
ExecStart=/usr/bin/node servidor.mjs
Environment=PUERTO=8787
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now estaciones-rele
journalctl -u estaciones-rele -f   # solo verás el arranque y las cuentas por minuto
```

## TLS detrás de Caddy

El puerto 8787 no se abre al exterior: Caddy pone el TLS y reenvía el WebSocket. En el `Caddyfile` del
A1 (`deploy/oracle/Caddyfile`), un bloque más con el mismo patrón que los demás:

```caddy
rele.{$STARSEED_HOST} {
    reverse_proxy /ws* localhost:8787
}
```

Sin directiva `log`: Caddy no registra accesos por defecto y así la query (que lleva el tema) no queda
escrita en ningún sitio. Si el relé va en un contenedor de `deploy/oracle/compose-a1.yml`, usa
`HOST=0.0.0.0` y `reverse_proxy /ws* <servicio>:8787`.

Después, en el despliegue web: `NEXT_PUBLIC_ESTACIONES_RELE_URL=wss://rele.<tu dominio>` (sin ruta: el
cliente añade `/ws`). En la app nativa hay que añadir ese host a `connect-src` de `src-tauri/tauri.conf.json`.

## Probarlo con wscat

En la propia VM, dos terminales con el mismo tema:

```bash
npx wscat -c "ws://localhost:8787/ws?tema=estacion-vivo:prueba-1234"
```

Cada una recibe `{"t":"rele","n":2}` al entrar la segunda. Lo que escribas como `{"t":"est","x":1}` en
una aparece en la otra (no en la que lo manda); cualquier otro texto no se reenvía. Con un tema mal
formado (`?tema=hola`) la conexión se cierra con 1008. Para comprobar la sintaxis sin arrancarlo:
`npm run check`.
