# Multi-stage build for SIP/PRI Migration Tool
# Stage 1: Dependencies and build
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Copy healthcheck script into runtime image
COPY --from=builder /app/healthcheck.js ./healthcheck.js

# Create data directory for CSV outputs
RUN mkdir -p data/output && chown nextjs:nodejs data/output

# Set proper permissions
RUN chown -R nextjs:nodejs /app

# Install su-exec to drop privileges at runtime after fixing volume permissions
RUN apk add --no-cache su-exec

# Copy entrypoint to handle volume permission fixups then drop to non-root user
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Use entrypoint to adjust runtime permissions and drop privileges
ENTRYPOINT ["/entrypoint.sh"]
# Start the application as nextjs user (via entrypoint)
CMD ["node", "server.js"]