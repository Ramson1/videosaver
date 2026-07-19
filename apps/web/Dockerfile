# ============================================
# VideoSaver Web - Production Dockerfile
# Multi-stage build for Next.js 15 frontend
# ============================================

# ─── Stage 1: Install Dependencies ───────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/

# Install all dependencies (including dev)
RUN npm ci --workspace=apps/web --include-workspace-root

# ─── Stage 2: Build Application ──────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build Next.js application (requires env vars)
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:4000}

RUN npm run build --workspace=apps/web

# ─── Stage 3: Production Runtime ─────────────
FROM node:20-alpine AS production
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user (Alpine syntax)
RUN addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs

# Copy built assets from build stage
COPY --from=build /app/apps/web/public ./apps/web/public

# Automatically leverage output tracking for standalone mode
# https://nextjs.org/docs/app/api-reference/config/next-config-js/output
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start Next.js application
CMD ["node", "apps/web/server.js"]
