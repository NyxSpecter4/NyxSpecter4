# bountywarz-gateway — KIN gateway Space (fabric inference tier T3)
# Self-contained: no repo clone, no build chain. The previous image cloned a
# PRIVATE GitHub repo with no credentials at build time and could never build.
FROM node:22-alpine
WORKDIR /app
COPY server.cjs ./server.cjs
ENV PORT=7860 NODE_ENV=production
EXPOSE 7860
# Secrets come from Space settings at runtime (HF_TOKEN, optional GATEWAY_API_KEY).
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7860)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.cjs"]
