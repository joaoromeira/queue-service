# Dockerfile para Queue-Service
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache git

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S queue-service -u 1001

# Alterar propriedade dos arquivos
RUN chown -R queue-service:nodejs /app
USER queue-service

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Comando para iniciar a aplicação
CMD ["npm", "start"] 