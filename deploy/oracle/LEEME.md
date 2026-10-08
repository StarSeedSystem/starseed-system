# Despliegue Oracle Always Free — StarSeed OS

Pasos en orden para activar la nube 24/7 con Oracle Cloud Free.
Fuente de verdad: `architecture/oracle-nube.md` (contrato, §3, §5, §10).

## 1. Leer el contrato
- `architecture/oracle-nube.md` es la fuente de verdad.
- Nada que no esté ahí se inventa.
- Si el código real choca con el contrato, se dice en el informe.

## 2. Configurar las variables de entorno
- Copiar `deploy/oracle/env.ejemplo` a `/etc/starseed/env` (600, root).
- Poner los valores reales con `scripts/puente/oracle_claves.py` (copia por SSH, sin imprimir).
- Las variables son SOLO nombres en `env.ejemplo`; los valores nunca van al repo.

## 3. Preparar las máquinas
- A1 (`VM.Standard.A1.Flex`): 2 OCPU, 12 GB, 100 GB, Ubuntu 24.04 arm64.
- Micro 1 (`VM.Standard.E2.1.Micro`): 1/8 OCPU, 1 GB, 50 Mbps (coturn).
- Micro 2 (`VM.Standard.E2.1.Micro`): 1/8 OCPU, 1 GB, 50 Mbps (vigía).

## 4. Aplicar cloud-init
- A1: `cloud-init-a1.yaml` (usuario `starseed`, llave pública por variable `STARSEED_PUBLIC_KEY`, Docker, fail2ban, unattended-upgrades, iptables abierto y persistido con `netfilter-persistent`).
- Micro: `cloud-init-micro.yaml` (coturn con `use-auth-secret` y `static-auth-secret`, rango relay 49160–49200, vigía que sondea URLs y escribe estado).

## 5. Componer los servicios
- `compose-a1.yml`: servicios de §3 con `mem_limit`, `restart: unless-stopped`, red interna, solo Caddy publica 80/443, MediaMTX publica 8189/udp.
- Astraura y servidor de malla se construyen con `build:` (contexto por variable).
- Volúmenes con nombre para persistencia.

## 6. Configurar Caddy
- `Caddyfile`: un bloque por subdominio (`astraura`, `malla`, `media`, `buscar`, `n8n`, `turn`, `capas`) con `{$STARSEED_HOST}`.
- HTTPS automático con sslip.io mientras no haya dominio propio.

## 7. Desplegar (solo con la palabra de Alex)
- `python3 scripts/puente/oracle_desplegar.py --simular` primero.
- Con `--aplicar` crea de verdad (idempotente, solo formas Always Free, guardias activas).
- Reintento automático ante «Out of host capacity» (cada 10 min hasta 24 h).

## 8. Verificar
- `python3 scripts/puente/test_deploy_oracle.py` comprueba:
  - cada servicio tiene `mem_limit`;
  - suma de memoria del A1 ≤ 10,5 GB;
  - `env.ejemplo` sin valores sensibles;
  - puertos publicados exactamente los de §3 (Caddy 80/443, MediaMTX 8189/udp);
  - `cloud-init-a1.yaml` con usuario `starseed` y llave pública por variable;
  - `cloud-init-micro.yaml` con coturn (`use-auth-secret`, rango relay).

## 9. Lo que enseña Genesis
- La tarjeta «Oracle Always Free» pasa de «pendiente» a «vinculada» cuando `oracle.json` dice `vinculada`.
- Muestra región (`mx-queretaro-1`), límites (2 OCPU · 12 GB A1, 2 micros), máquinas con su estado, servicios con su sonda.
- Botones: «Comprobar», «Vincular» (abre Terminal con `oci setup bootstrap`), «Desplegar» (simulación y, con confirmación, aplicar).

## 10. Lo que NUNCA
- Ningún secreto, OCID ni llave en el repo, memorias, registros o chat.
- Nada público sin autenticación: Astraura con clave, n8n con usuario, SearXNG con límite de peticiones.
- Ningún recurso fuera de Always Free.
- No pasar la cuenta a pago sin la palabra de Alex.
- No apagar ni cambiar el túnel de la Mac hasta que Oracle responda verde 24 h seguidas.
