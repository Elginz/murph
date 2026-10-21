#!/usr/bin/env bash
# Deploy Murph to Google Cloud Run straight from source (Cloud Build builds ./Dockerfile).
#
# Usage (from a clone of the repo, e.g. in Cloud Shell):
#   deploy/deploy_cloud_run.sh [PROJECT_ID] [REGION]
#
# Optional environment variables:
#   SERVICE=murph              Cloud Run service name.
#   REGION=asia-southeast1     Region (the 2nd argument wins).
#   PUBLIC=true                true: anyone with the URL can open it (disables the invoker IAM
#                              check, which also works in orgs that block `allUsers`);
#                              false: callers need roles/run.invoker.
#   VERTEX=true                true: live Gemini through Vertex AI as the runtime service account
#                              (no API key needed; grants it roles/aiplatform.user).
#   GEMINI_SECRET=<name>       Secret Manager secret holding a Gemini API key, exposed to the app
#                              as $GEMINI_API_KEY (an API key wins over Vertex AI).
#   RUNTIME_SA=<email>         Runtime service account. Default: murph-runtime@<PROJECT_ID>,
#                              created on first deploy.
#   MIN_INSTANCES=0            1 keeps one instance (and its in-memory demo state) warm.
#   GOOGLE_OAUTH_CLIENT_ID=<id> OAuth 2.0 Web client ID for the "Sign in with Google" button.
# With VERTEX=false and no GEMINI_SECRET, Murph answers with its deterministic fallback.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_ID="${1:-${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}}"
REGION="${2:-${REGION:-asia-southeast1}}"
SERVICE="${SERVICE:-murph}"
PUBLIC="${PUBLIC:-true}"
VERTEX="${VERTEX:-true}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
GEMINI_SECRET="${GEMINI_SECRET:-}"
GOOGLE_OAUTH_CLIENT_ID="${GOOGLE_OAUTH_CLIENT_ID:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "No project: pass PROJECT_ID as the first argument or run 'gcloud config set project <id>'." >&2
  exit 1
fi
DEFAULT_SA="murph-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="${RUNTIME_SA:-${DEFAULT_SA}}"

# A brand-new service account can take a few seconds to become visible to IAM.
retry() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    "$@" && return 0
    echo "  ... not accepted yet (attempt ${attempt}/6); retrying in 10s" >&2
    sleep 10
  done
  return 1
}

echo "Deploying '${SERVICE}' to project '${PROJECT_ID}' (${REGION}) as ${RUNTIME_SA} ..."
apis=(run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com)
if [[ "${VERTEX}" == "true" ]]; then
  apis+=(aiplatform.googleapis.com)
fi
if [[ -n "${GEMINI_SECRET}" ]]; then
  apis+=(secretmanager.googleapis.com)
fi
gcloud services enable "${apis[@]}" --project "${PROJECT_ID}"

# Dedicated least-privilege runtime identity instead of the Compute Engine default account.
if [[ "${RUNTIME_SA}" == "${DEFAULT_SA}" ]] && ! gcloud iam service-accounts describe \
    "${RUNTIME_SA}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create murph-runtime --project "${PROJECT_ID}" \
    --display-name "Murph Cloud Run runtime"
fi

if [[ "${VERTEX}" == "true" ]]; then
  # The app calls Vertex AI with this account's token from the Cloud Run metadata server.
  retry gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${RUNTIME_SA}" \
    --role roles/aiplatform.user --condition None --quiet >/dev/null
fi

# One instance only: the engine keeps a single in-memory session plus a local SQLite file.
env_vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
if [[ -n "${GOOGLE_OAUTH_CLIENT_ID}" ]]; then
  env_vars="${env_vars},GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}"
fi
deploy_args=(
  run deploy "${SERVICE}"
  --source .
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --service-account "${RUNTIME_SA}"
  --update-env-vars "${env_vars}"
  --max-instances 1
  --min-instances "${MIN_INSTANCES}"
  --memory 1Gi
  --cpu 1
  --cpu-boost
  --timeout 300
  --quiet
)
if [[ "${PUBLIC}" == "true" ]]; then
  deploy_args+=(--no-invoker-iam-check)
else
  deploy_args+=(--invoker-iam-check)
fi

if [[ -n "${GEMINI_SECRET}" ]]; then
  # The runtime service account must be able to read the secret.
  retry gcloud secrets add-iam-policy-binding "${GEMINI_SECRET}" --project "${PROJECT_ID}" \
    --member "serviceAccount:${RUNTIME_SA}" \
    --role roles/secretmanager.secretAccessor >/dev/null
  deploy_args+=(--set-secrets "GEMINI_API_KEY=${GEMINI_SECRET}:latest")
fi

gcloud "${deploy_args[@]}"

url="$(gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" \
  --region "${REGION}" --format 'value(status.url)')"
echo "Murph is deployed: ${url}"
if [[ "${PUBLIC}" != "true" ]]; then
  echo "Private service - open it through an authenticated local proxy:"
  echo "  gcloud run services proxy ${SERVICE} --project ${PROJECT_ID} --region ${REGION} --port 8080"
fi
