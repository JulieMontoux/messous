FROM node:25-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
RUN npm run build && find /app/dist/assets -type f \( -name "*.js" -o -name "*.css" \) -exec gzip -k9 {} \;

# nginx sans droits root (écoute sur 8080)
FROM nginxinc/nginx-unprivileged:alpine
# Correctifs de sécurité Alpine (OpenSSL, libxml…) puis retour à l'utilisateur sans droits
USER root
RUN apk upgrade --no-cache && apk add --no-cache 'libexpat>=2.10.0'
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
# Lisible par nginx (utilisateur 101) quels que soient les droits des fichiers sur le serveur
RUN chmod -R a+rX,go-w /usr/share/nginx/html /etc/nginx/conf.d/default.conf /etc/nginx/security-headers.conf
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
