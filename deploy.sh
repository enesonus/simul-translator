#!/usr/bin/env bash

set -euo pipefail

# Deploy to Google Cloud Run using env.yaml for environment variables.
# Requirements:
# - gcloud CLI installed and authenticated:  gcloud auth login
# - Project set:                             gcloud config set project YOUR_PROJECT_ID
# - (Optional) Default region set:           gcloud config set run/region YOUR_REGION
#
# Configurable via env vars (or leave defaults):
#   SERVICE_NAME   - Cloud Run service name (default: simul-translator)
#   REGION         - Artifact Registry + Cloud Run region (default: us-central1)
#   PROJECT_ID     - GCP project id (default: from gcloud config)
#   REPO           - Artifact Registry repo name (default: simul-translator)
#   IMAGE_NAME     - Image name inside the repo (default: SERVICE_NAME)
#   TAG            - Image tag (default: timestamp)
#   SOURCE         - Source directory for --source deploys (default: .)
#   BUILD_WITH     - One of: cloudbuild | local | run_source (default: cloudbuild)
#
# Usage:
#   ./deploy.sh
#   SERVICE_NAME=my-svc REGION=europe-west1 ./deploy.sh

echo "==> Preparing configuration"

# Resolve script directory (same dir as Dockerfile and env.yaml)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ENV_YAML="${SCRIPT_DIR}/env.yaml"

SERVICE_NAME=${SERVICE_NAME:-simul-translator}
REGION=${REGION:-${CLOUD_RUN_REGION:-us-central1}}
PROJECT_ID=${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}
REPO=${REPO:-simul-translator}
IMAGE_NAME=${IMAGE_NAME:-${SERVICE_NAME}}
TAG=${TAG:-$(date +%Y%m%d-%H%M%S)}
SOURCE=${SOURCE:-.}

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: PROJECT_ID is not set and gcloud config has no project."
  echo "Set it via: export PROJECT_ID=your-project-id"
  exit 1
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${TAG}"

echo "Service:        ${SERVICE_NAME}"
echo "Project:        ${PROJECT_ID}"
echo "Region:         ${REGION}"
echo "Repo:           ${REPO}"
echo "Image:          ${IMAGE_URI}"

# Env vars must be provided via a YAML file (ENV_VARS_FILE override or env.yaml next to this script)

echo "==> Enabling required APIs (idempotent)"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project "${PROJECT_ID}" --quiet

echo "==> Ensuring Artifact Registry repository exists"
if ! gcloud artifacts repositories describe "${REPO}" --location="${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Docker repo for ${SERVICE_NAME}" \
    --project "${PROJECT_ID}" --quiet
fi

if [[ "${BUILD_WITH:-cloudbuild}" == "local" ]]; then
  echo "==> Using local Docker to build and push image"
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  docker build -t "${IMAGE_URI}" .
  docker push "${IMAGE_URI}"
elif [[ "${BUILD_WITH:-cloudbuild}" == "cloudbuild" ]]; then
  echo "==> Building and pushing image via Cloud Build"
  gcloud builds submit --tag "${IMAGE_URI}" --project "${PROJECT_ID}" --quiet
else
  echo "==> Skipping manual image build (run_source mode)"
fi

echo "==> Preparing environment variables for Cloud Run"

if [[ -n "${ENV_VARS_FILE:-}" ]]; then
  if [[ -s "${ENV_VARS_FILE}" ]]; then
    echo "Using provided env vars file: ${ENV_VARS_FILE}"
    ENV_ARG=( --env-vars-file "${ENV_VARS_FILE}" )
  else
    echo "ERROR: ENV_VARS_FILE '${ENV_VARS_FILE}' not found or empty"
    exit 1
  fi
elif [[ -s "${DEFAULT_ENV_YAML}" ]]; then
  echo "Using env vars file next to script: ${DEFAULT_ENV_YAML}"
  ENV_ARG=( --env-vars-file "${DEFAULT_ENV_YAML}" )
else
  echo "ERROR: No env vars file found. Provide ${DEFAULT_ENV_YAML} or set ENV_VARS_FILE=/abs/path/to/env.yaml"
  exit 1
fi

echo "==> Deploying to Cloud Run"
if [[ "${BUILD_WITH:-cloudbuild}" == "run_source" ]]; then
  # With --source, the image name must match the service name. Do not include a tag.
  IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_NAME}"
  gcloud run deploy "${SERVICE_NAME}" \
    --source "${SOURCE}" \
    --image "${IMAGE_BASE}" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    "${ENV_ARG[@]}" \
    --project "${PROJECT_ID}" --quiet
else
  gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_URI}" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    "${ENV_ARG[@]}" \
    --project "${PROJECT_ID}" --quiet
fi

URL=$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)' --project "${PROJECT_ID}")
echo "==> Deployed: ${URL}"


echo "Done."


