FROM node:22-alpine

WORKDIR /app

# Datos persistentes
ENV STARSEED_DB=/datos/mesh.db
ENV PORT=8787
RUN mkdir -p /datos && chown -R node:node /datos

# Solo copiar archivos necesarios; no copiar archivos .env
COPY package.json index.mjs ./

# Sin package-lock: `npm ci` fallaba y el `|| echo` lo tapaba, así que `pg` (opcional, para
# Postgres con DATABASE_URL) nunca se instalaba. `npm install` sí trae las opcionales; si falla,
# el servidor sigue con node:sqlite (STARSEED_DB) — dicho en el registro de la build.
RUN npm install --omit=dev --no-audit --no-fund || echo "pg no instalado: se usará node:sqlite"

# Usuario no root (node ya existe en la imagen alpine)
USER node

# Puerto expuesto por variable de entorno
EXPOSE $PORT

# Ruta de salud real del servidor (lee index.mjs: /mesh/public)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http'); const req=http.get('http://localhost:${PORT}/mesh/public', (r)=>{process.exit(r.statusCode===200?0:1)}); req.on('error',()=>process.exit(1));" || exit 1

# Datos en volumen
VOLUME ["/datos"]

CMD ["node", "index.mjs"]
