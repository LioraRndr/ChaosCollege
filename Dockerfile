# CHAOS.COLLAGE cloud server: static editor + account / project API.
# Python standard library only, no pip packages.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CC_HOST=0.0.0.0 \
    CC_PORT=8080 \
    CC_DATA=/data

WORKDIR /app
COPY index.html styles.css app.js manifest.webmanifest ./
COPY js ./js
COPY assets ./assets
COPY server ./server

RUN useradd --system --uid 10001 --home-dir /app chaos \
 && mkdir -p /data && chown chaos:chaos /data
USER chaos
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=4)"

CMD ["python3", "server/chaos_server.py"]
