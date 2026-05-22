# Lean static-asset image. Node serves index.html/app.js/style.css via the
# tiny zero-dependency http server in serve.js.
FROM node:20-alpine

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
COPY --chown=app:app index.html style.css app.js serve.js ./

USER app
EXPOSE 8080

ENV PORT=8080
CMD ["node", "serve.js"]
