FROM public.ecr.aws/docker/library/postgres:17-alpine
RUN apk add --no-cache --virtual .pgtap-build make perl git patch \
 && git clone --branch v1.3.4 --depth 1 https://github.com/theory/pgtap.git /tmp/pgtap \
 && cd /tmp/pgtap && test "$(git rev-parse HEAD)" = "968eb53a33114e83042b3bdb0c664b5b80cf8bdf" \
 && make && make install \
 && rm -rf /tmp/pgtap \
 && apk del .pgtap-build
