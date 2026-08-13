# Cloud Run disaster recovery

This runbook recreates the production CDT Express MCP deployment in
`northamerica-northeast1`. It uses GitHub OIDC with Google Workload Identity
Federation (WIF), Cloud Run, Artifact Registry, Secret Manager, and a global
external Application Load Balancer fronted by Cloudflare DNS.

The deployment does not use `GCP_REGISTRY_CREDENTIALS` or another long-lived
Google credential. The only application secret is stored in Google Secret
Manager.

The commands assume the target GCP project and its shared `github-actions` WIF
pool still exist. Run each `create` command only when its resource is missing.
Existing healthy resources do not need to be replaced to recover another
layer.

## 1. Set recovery variables

Authenticate with an account that can enable APIs and administer IAM, Artifact
Registry, Cloud Run, Secret Manager, and load-balancer resources.

```bash
gcloud auth login
gh auth login

export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" \
  --format='value(projectNumber)')"
export REGION="northamerica-northeast1"
export ARTIFACT_REPOSITORY="cdt-express"
export SERVICE="cdt-express-mcp"
export SECRET="cdt-express-mcp-oauth-secret"

export DEPLOY_SA_NAME="github-cdt-express-mcp"
export RUNTIME_SA_NAME="cdt-express-mcp-runtime"
export DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

export GITHUB_REPOSITORY="RiskThinking/cdt-express-mcp"
export WIF_POOL="github-actions"
export WIF_PROVIDER="cdt-express-mcp"

export DOMAIN="mcp.riskthinking.ai"
export NEG="cdt-express-mcp-neg"
export BACKEND="cdt-express-mcp-backend"
export URL_MAP="cdt-express-mcp-map"
export CERT="cdt-express-mcp-cert"
export HTTPS_PROXY="cdt-express-mcp-https-proxy"
export FORWARDING_RULE="cdt-express-mcp-https"
export LB_IP_NAME="cdt-express-mcp-ip"

gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"
```

Inventory the current state before recreating anything:

```bash
gcloud run services describe "$SERVICE" --region="$REGION"
gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
  --location="$REGION"
gcloud secrets describe "$SECRET"
gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
  --location=global \
  --workload-identity-pool="$WIF_POOL"
gcloud compute network-endpoint-groups describe "$NEG" --region="$REGION"
gcloud compute addresses describe "$LB_IP_NAME" --global
```

A `NOT_FOUND` response identifies a resource that must be restored. It is safe
for some of these resources to survive while others are rebuilt.

## 2. Restore project resources

Enable the required APIs:

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  sts.googleapis.com
```

Create the regional Docker repository if it is missing:

```bash
gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
  --repository-format=docker \
  --location="$REGION" \
  --description="CDT Express MCP images"
```

Create the deployment identities if they are missing:

```bash
gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
  --display-name="GitHub deployer for CDT Express MCP"
gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
  --display-name="Cloud Run identity for CDT Express MCP"
```

Restore the deployer and runtime IAM bindings. These commands are additive and
can be rerun safely:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/run.admin"

gcloud artifacts repositories add-iam-policy-binding \
  "$ARTIFACT_REPOSITORY" \
  --location="$REGION" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/artifactregistry.writer"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/iam.serviceAccountUser"
```

Preserve the existing OAuth secret whenever possible. It encrypts client
registrations, authorization codes, access tokens, and refresh tokens. If the
secret exists, only confirm that the runtime identity can read it:

```bash
gcloud secrets add-iam-policy-binding "$SECRET" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

If the secret was lost, restore its prior value from an approved secure backup.
If no backup exists, create a new value and expect every MCP client to reconnect
and authorize again:

```bash
openssl rand -base64 48 | gcloud secrets create "$SECRET" \
  --replication-policy=automatic \
  --data-file=-

gcloud secrets add-iam-policy-binding "$SECRET" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

To rotate an existing secret deliberately, add a version and redeploy:

```bash
openssl rand -base64 48 | gcloud secrets versions add "$SECRET" --data-file=-
gh workflow run deploy-cloud-run.yml \
  --repo "$GITHUB_REPOSITORY" \
  --ref main
```

## 3. Restore GitHub federation

The `github-actions` workload identity pool is shared project infrastructure.
Confirm it exists:

```bash
gcloud iam workload-identity-pools describe "$WIF_POOL" \
  --location=global \
  --format="table(name,state,displayName)"
```

If the repo-specific provider is missing, recreate it inside that pool:

```bash
WIF_ATTRIBUTE_MAPPING="google.subject=assertion.sub"
WIF_ATTRIBUTE_MAPPING+=",attribute.repository=assertion.repository"
WIF_ATTRIBUTE_MAPPING+=",attribute.repository_owner=assertion.repository_owner"
WIF_ATTRIBUTE_MAPPING+=",attribute.ref=assertion.ref"
export WIF_ATTRIBUTE_MAPPING

WIF_ATTRIBUTE_CONDITION="assertion.repository == '${GITHUB_REPOSITORY}'"
WIF_ATTRIBUTE_CONDITION+=" && assertion.ref == 'refs/heads/main'"
export WIF_ATTRIBUTE_CONDITION

gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
  --location=global \
  --workload-identity-pool="$WIF_POOL" \
  --display-name="CDT Express MCP GitHub Actions" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="$WIF_ATTRIBUTE_MAPPING" \
  --attribute-condition="$WIF_ATTRIBUTE_CONDITION"
```

Resolve the full resource names and restore repo-scoped impersonation:

```bash
export WIF_POOL_NAME="$(gcloud iam workload-identity-pools describe \
  "$WIF_POOL" \
  --location=global \
  --format='value(name)')"

export WIF_PROVIDER_NAME="$(gcloud iam workload-identity-pools providers \
  describe "$WIF_PROVIDER" \
  --location=global \
  --workload-identity-pool="$WIF_POOL" \
  --format='value(name)')"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WIF_POOL_NAME}/attribute.repository/${GITHUB_REPOSITORY}"
```

Verify that the provider is active, uses GitHub's issuer, maps the required
claims, and restricts access to `RiskThinking/cdt-express-mcp` on `main`:

```bash
gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
  --location=global \
  --workload-identity-pool="$WIF_POOL" \
  --format=yaml
```

An organization or project IAM administrator may need to perform the policy
binding commands if the recovery operator cannot administer IAM.

## 4. Restore Cloud Run and GitHub deployment

Bootstrap the public Cloud Run service if it is missing. The hello image is
temporary and gives GitHub the service hostnames before the application image
is deployed:

```bash
gcloud run deploy "$SERVICE" \
  --image="us-docker.pkg.dev/cloudrun/container/hello" \
  --region="$REGION" \
  --service-account="$RUNTIME_SA" \
  --allow-unauthenticated \
  --port=8080 \
  --min-instances=1 \
  --max-instances=1

export CLOUD_RUN_URL="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --format='value(status.url)')"
export CLOUD_RUN_HOST="${CLOUD_RUN_URL#https://}"
export CLOUD_RUN_ALT_HOST="${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
export CLOUD_RUN_HOSTS="${CLOUD_RUN_HOST},${CLOUD_RUN_ALT_HOST}"

printf 'Cloud Run URL: %s\nAllowed hosts: %s\n' \
  "$CLOUD_RUN_URL" "$CLOUD_RUN_HOSTS"
```

One warm instance is intentional while the compatibility transport keeps MCP
sessions in process memory. Revisit that constraint after adopting a stateless
MCP transport.

Create the GitHub `production` environment if needed and restore its variables:

```bash
gh api --method PUT \
  "repos/${GITHUB_REPOSITORY}/environments/production"

gh variable set GCP_PROJECT_ID \
  --env production --repo "$GITHUB_REPOSITORY" --body "$PROJECT_ID"
gh variable set GCP_REGION \
  --env production --repo "$GITHUB_REPOSITORY" --body "$REGION"
gh variable set GCP_ARTIFACT_REPOSITORY \
  --env production --repo "$GITHUB_REPOSITORY" \
  --body "$ARTIFACT_REPOSITORY"
gh variable set GCP_CLOUD_RUN_SERVICE \
  --env production --repo "$GITHUB_REPOSITORY" --body "$SERVICE"
gh variable set GCP_CLOUD_RUN_HOST \
  --env production --repo "$GITHUB_REPOSITORY" --body "$CLOUD_RUN_HOSTS"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --env production --repo "$GITHUB_REPOSITORY" --body "$WIF_PROVIDER_NAME"
gh variable set GCP_DEPLOY_SERVICE_ACCOUNT \
  --env production --repo "$GITHUB_REPOSITORY" --body "$DEPLOY_SA"
gh variable set GCP_RUNTIME_SERVICE_ACCOUNT \
  --env production --repo "$GITHUB_REPOSITORY" --body "$RUNTIME_SA"
```

No Google credential or application secret is stored in GitHub. Optional
deployment reviewers are configured under **Settings > Environments >
production**.

Deploy the application image:

```bash
gh workflow run deploy-cloud-run.yml \
  --repo "$GITHUB_REPOSITORY" \
  --ref main

gh run watch \
  --repo "$GITHUB_REPOSITORY" \
  "$(gh run list --repo "$GITHUB_REPOSITORY" \
    --workflow=deploy-cloud-run.yml --limit=1 --json=databaseId \
    --jq='.[0].databaseId')"
```

The workflow also deploys automatically when deployment-relevant files are
pushed to `main`.

Verify the recovered Cloud Run origin directly:

```bash
curl --fail --silent --show-error "${CLOUD_RUN_URL}/health"

gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --format="table(metadata.name,status.url,status.latestReadyRevisionName)"
```

## 5. Restore the public domain

Direct Cloud Run domain mapping is unavailable in `northamerica-northeast1`.
The production domain therefore uses a global external Application Load
Balancer with a Montréal serverless NEG.

If the load balancer survived and still targets the service name in the same
region, no edge changes are required. Otherwise, create each missing resource
in dependency order:

```bash
gcloud compute addresses create "$LB_IP_NAME" \
  --global \
  --ip-version=IPV4 \
  --network-tier=PREMIUM

gcloud compute network-endpoint-groups create "$NEG" \
  --region="$REGION" \
  --network-endpoint-type=serverless \
  --cloud-run-service="$SERVICE"

gcloud compute backend-services create "$BACKEND" \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED

gcloud compute backend-services add-backend "$BACKEND" \
  --global \
  --network-endpoint-group="$NEG" \
  --network-endpoint-group-region="$REGION"

gcloud compute url-maps create "$URL_MAP" \
  --default-service="$BACKEND"

gcloud compute ssl-certificates create "$CERT" \
  --domains="$DOMAIN"

gcloud compute target-https-proxies create "$HTTPS_PROXY" \
  --ssl-certificates="$CERT" \
  --url-map="$URL_MAP"

gcloud compute forwarding-rules create "$FORWARDING_RULE" \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --network-tier=PREMIUM \
  --address="$LB_IP_NAME" \
  --target-https-proxy="$HTTPS_PROXY" \
  --ports=443

export LB_IP="$(gcloud compute addresses describe "$LB_IP_NAME" \
  --global \
  --format='value(address)')"
printf 'Cloudflare A record target: %s\n' "$LB_IP"
```

In Cloudflare **DNS > Records**, create or update this record:

- Type: `A`
- Name: `mcp`
- IPv4 address: the printed `$LB_IP`
- Proxy status: **DNS only** (gray cloud)
- TTL: Auto

Keeping the record DNS-only lets Google terminate TLS with its managed
certificate. If the global address survived recovery, its IP is unchanged and
Cloudflare needs no update.

Wait for DNS to resolve to the load balancer and for the certificate to become
`ACTIVE`:

```bash
dig +short "$DOMAIN"

watch gcloud compute ssl-certificates describe "$CERT" \
  --global \
  --format="get(managed.status,managed.domainStatus)"
```

## 6. Validate recovery

Verify health, OAuth discovery, and the protected MCP challenge through the
public domain:

```bash
curl --fail --silent --show-error "https://${DOMAIN}/health"

curl --fail --silent --show-error \
  "https://${DOMAIN}/.well-known/oauth-protected-resource/mcp" | jq

curl --fail --silent --show-error \
  "https://${DOMAIN}/.well-known/oauth-authorization-server" | jq

curl --silent --show-error --dump-header - --output /dev/null \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  "https://${DOMAIN}/mcp"
```

Expected results:

- `/health` returns HTTP 200 and `{"status":"ok"}`.
- Both OAuth discovery documents return HTTP 200 and reference
  `https://mcp.riskthinking.ai`.
- The unauthenticated MCP request returns HTTP 401 with a `WWW-Authenticate`
  challenge referencing the protected-resource metadata.

Finally, complete an OAuth connection and tool invocation from one supported AI
client using [the live testing runbook](remote-mcp-live-testing.md). If the OAuth
secret changed during recovery, disconnect and reconnect all previously linked
clients.

## 7. Recovery records

Keep these values in the organization's disaster-recovery inventory:

- GCP project ID and number
- Region and Cloud Run service name
- Artifact Registry repository name
- Runtime and deployer service-account emails
- WIF pool and provider resource names
- Secret Manager secret name and approved secret-recovery procedure
- Global load-balancer resource names and reserved IP address
- Cloudflare zone ownership and DNS change access
- GitHub repository, environment variables, and environment reviewers

Do not store service-account keys, OAuth secret values, CDT API keys, or MCP
tokens in the repository or GitHub variables.
