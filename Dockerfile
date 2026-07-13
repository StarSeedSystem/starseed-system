# =========================================================================
# STARSEED OS - DOCKERFILE OPTIMIZADO PARA GOOGLE CLOUD RUN
# Construcción multi-etapa para generar una imagen menor a 150MB
# =========================================================================

# 1. Base image
FROM node:20-alpine AS base
# Agregar compatibilidad para dependencias nativas
RUN apk add --no-cache libc6-compat

# 2. Dependencies
FROM base AS deps
WORKDIR /app
# Copiar package.json, el lockfile Y el .npmrc.
# ⚠️ El .npmrc es OBLIGATORIO aquí: contiene `legacy-peer-deps=true`, sin el cual
# `npm ci` falla — `liquid-glass-react` exige React >=19 y el proyecto usa React 18.
# (Causa real del fallo del primer build en Cloud Build, 2026-07-12: el Dockerfile
# copiaba solo package.json/lockfile, así que dentro del contenedor npm no veía la
# regla que sí aplican Vercel y el Mac.)
COPY package.json package-lock.json* .npmrc* ./
# Instalar dependencias exactas (el flag repite la regla del .npmrc por robustez)
RUN npm ci --legacy-peer-deps

# 3. Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Deshabilitar telemetría de Next.js para mejorar tiempo de compilación
ENV NEXT_TELEMETRY_DISABLED 1

# Pasar variables públicas durante el build (requeridas por Next)
# En Cloud Run se inyectarán en tiempo real.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Compilar proyecto en modo standalone
RUN npm run build

# 4. Runner (Imagen final para producción)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Crear usuario sin privilegios root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar estáticos optimizados
COPY --from=builder /app/public ./public

# Copiar artefactos de compilación (Next.js standalone automatiza node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Cloud Run mapeará automáticamente el puerto definido en la variable PORT (por defecto 8080)
# Ajustamos Next.js para que escuche en ese puerto
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

USER nextjs

EXPOSE 3000

# Lanzar el servidor de Node directamente sin `npm`
CMD ["node", "server.js"]
