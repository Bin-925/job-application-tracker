FROM node:24-bookworm-slim AS web
WORKDIR /work/frontend
RUN npm install --global pnpm@11.19.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build && pnpm check:pwa

FROM eclipse-temurin:21-jdk-jammy AS backend
WORKDIR /work/backend
COPY backend/ ./
COPY --from=web /work/frontend/dist /work/frontend/dist
RUN chmod +x gradlew && ./gradlew bootJar -PfrontendDist=../frontend/dist --no-daemon

FROM eclipse-temurin:21-jre-jammy AS runtime
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
WORKDIR /app
COPY --from=backend --chown=app:app /work/backend/build/libs/jobtracker-0.0.1-SNAPSHOT.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/app.jar", "--spring.config.import=", "--spring.profiles.active=postgres,release"]
