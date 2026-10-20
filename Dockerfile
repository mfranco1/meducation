FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY tests/fixtures ./tests/fixtures
ENV VITE_BUILD_ADMIN=false
RUN npm run typecheck \
    && npm run build:learner -- --manifest --sourcemap hidden \
    && node scripts/containers/check-learner-artifacts.mjs dist > /learner-artifacts.json \
    && find dist -name '*.map' -delete \
    && rm -r dist/.vite

FROM builder AS admin-builder
COPY admin.html ./
COPY ops/containers/nginx.conf ./nginx.source.conf
ENV VITE_BUILD_ADMIN=true
RUN npm run build:admin -- --manifest --sourcemap hidden \
    && node scripts/containers/check-admin-artifacts.mjs dist nginx.source.conf /admin-nginx.conf > /admin-artifacts.json \
    && find dist -name '*.map' -delete \
    && rm -r dist/.vite

FROM nginxinc/nginx-unprivileged:1.30.6-trixie@sha256:ec0f7ecb1fbd84959ac114e65fb36074ffc97d4d51db0f18ee925162d889dcef AS static-runtime
COPY ops/containers/nginx.conf /etc/nginx/nginx.conf
COPY ops/containers/proxy.conf /etc/nginx/meducation-proxy.conf
COPY ops/containers/security-headers.conf /etc/nginx/meducation-security-headers.conf
USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD curl --fail --silent --show-error --max-time 2 http://127.0.0.1:8080/health/frontend || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]

FROM static-runtime AS admin
COPY --from=admin-builder /build/dist /opt/meducation/html
COPY --from=admin-builder /admin-artifacts.json /opt/admin-artifacts.json
COPY --from=admin-builder /admin-nginx.conf /etc/nginx/nginx.conf

# Bare docker build and existing Compose users must still get learner-only assets.
FROM static-runtime AS learner
COPY --from=builder /build/dist /opt/meducation/html
COPY --from=builder /learner-artifacts.json /opt/learner-artifacts.json
