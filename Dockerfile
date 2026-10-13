FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY tests/fixtures ./tests/fixtures
ENV VITE_CONTENT_SOURCE=api \
    VITE_BUILD_ADMIN=false \
    VITE_ENABLE_LOCAL_ADMIN=false
RUN npm run typecheck \
    && npm run build:learner -- --manifest --sourcemap hidden \
    && node scripts/containers/check-learner-artifacts.mjs dist > /learner-artifacts.json \
    && find dist -name '*.map' -delete \
    && rm -r dist/.vite

FROM nginxinc/nginx-unprivileged:1.30.5-trixie@sha256:8f18dedfceea3d7feb98792810c8c9925c985890ade257f2ec1b2f492b4eaebb AS runtime
COPY ops/containers/nginx.conf /etc/nginx/nginx.conf
COPY ops/containers/proxy.conf /etc/nginx/meducation-proxy.conf
COPY --from=builder /build/dist /opt/meducation/html
COPY --from=builder /learner-artifacts.json /opt/learner-artifacts.json
USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD curl --fail --silent --show-error --max-time 2 http://127.0.0.1:8080/health/frontend || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
