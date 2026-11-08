# Node 24 (LTS active) — Node 20 n'est plus maintenu depuis avril 2026
FROM node:25-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Dépendances de production, puis on retire les outils inutiles à l'exécution (npm, npx,
# corepack, yarn embarquent leurs propres dépendances et donc leurs propres CVE) et on
# applique les correctifs de sécurité Alpine (OpenSSL…)
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
            /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn* /root/.npm \
  && apk upgrade --no-cache
COPY src ./src
# Lisible par l'utilisateur node quels que soient les droits des fichiers sur le serveur
# (ex. fichier en 600 copié par scp), sans lui donner le droit d'écrire
RUN chmod -R a+rX,go-w /app
# Pas de droits root dans le conteneur
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
