FROM node:20-slim

WORKDIR /app

# Dummy DATABASE_URL for build time (Prisma needs it for generate, not for actual connection)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Generate Prisma client explicitly
RUN npx prisma generate

# Copy source and build
COPY tsconfig.json ./
COPY src ./src/
RUN npx tsc

# Clear the dummy URL so runtime must provide the real one
ENV DATABASE_URL=""

# Expose port
EXPOSE 3000

# Run migrations and start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
