# One image for both the web app and the worker; docker-compose picks the command.
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app /app
# Headless Chromium and its system libraries, for rendering resumes and cover letters to PDF.
RUN npx playwright install --with-deps --only-shell chromium && chmod -R a+rX /ms-playwright
USER node
EXPOSE 3000
# The web container applies migrations before serving.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
