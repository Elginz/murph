# Murph — container image for Google Cloud Run (works with any container host).
#
#   Build + deploy:  deploy/deploy_cloud_run.sh            (gcloud run deploy --source .)
#   Local test:      docker build -t murph . && docker run -p 8080:8080 murph
#
# The server reads $PORT (Cloud Run injects it) and stores its SQLite database in
# /app/data, which is ephemeral on Cloud Run (demo data is re-seeded on cold start).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as an unprivileged user that owns only the runtime data directory.
RUN useradd --create-home --uid 10001 murph \
    && mkdir -p /app/data \
    && chown murph:murph /app/data
USER murph

ENV PORT=8080
EXPOSE 8080

CMD ["python3", "main.py", "--host", "0.0.0.0"]
