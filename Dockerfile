# DIÈDRE 29 — configurateur 3D statique (three.js via importmap, aucun build)
# Déploiement Coolify : Build Pack « Dockerfile », port exposé 80.

# ---- Étape 1 : assemblage des fichiers publics uniquement ----
FROM alpine:3.20 AS assemble
WORKDIR /site
COPY index.html ./
COPY css ./css
COPY js ./js
COPY assets ./assets

# ---- Étape 2 : serveur Nginx léger ----
FROM nginx:1.27-alpine AS runner
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/site.conf
COPY --from=assemble /site /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
