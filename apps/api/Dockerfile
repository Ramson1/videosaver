# ============================================
# VideoSaver API - Production Dockerfile
# Multi-stage build for NestJS backend
# ============================================

# ─── Stage 1: Install Dependencies ───────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/

# Install all dependencies (including dev)
RUN npm ci --workspace=apps/api --include-workspace-root

# ─── Stage 2: Build Application ──────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

# Build NestJS application
RUN npm run build --workspace=apps/api

# ─── Stage 3: Production Runtime ─────────────
FROM node:20-alpine AS production
WORKDIR /app

# Install FFmpeg and runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    wget \
    curl \
    tini \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

# Copy package files and install production dependencies only
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=apps/api --omit=dev && npm cache clean --force

# Copy built application from build stage
COPY --from=build --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodejs:nodejs /app/apps/api/src/migrations ./apps/api/src/migrations

# Create temp directory for downloads
RUN mkdir -p /app/tmp/downloads && chown -R nodejs:nodejs /app/tmp

# Set working directory to API
WORKDIR /app/apps/api

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start production server
CMD ["node", "dist/main"]
