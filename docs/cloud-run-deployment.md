# Cloud Run deployment

The deployment workflow builds the container, deploys a candidate without
production traffic, verifies OAuth and MCP behavior, and promotes the candidate
only after verification succeeds.

Deployment-specific resource identifiers and settings belong in the GitHub
`production` environment configuration, not in this repository.

## Private environment configuration

Configure these GitHub environment secrets for the target deployment:

| Secret | Purpose |
| --- | --- |
| `GCP_PROJECT_ID` | Target project |
| `GCP_REGION` | Deployment region |
| `GCP_ARTIFACT_REPOSITORY` | Container image repository |
| `GCP_CLOUD_RUN_SERVICE` | Cloud Run service |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Deployment identity |
| `GCP_CLOUD_RUN_HOST` | Comma-separated service hostnames |
| `GCP_DEPLOY_FLAGS` | Reviewed Cloud Run runtime and optional network flags |
| `GCP_OAUTH_SECRET_NAME` | Secret Manager resource containing the OAuth secret |
| `GCP_REDIS_HOSTNAME_SECRET_NAME` | Secret Manager resource containing the Redis hostname |
| `GCP_REDIS_PASSWORD_SECRET_NAME` | Secret Manager resource containing the Redis password |
| `MCP_DEPLOY_ENV_JSON` | JSON object of non-credential server environment settings |

The runtime identity needs access to its referenced Secret Manager resources.
The deployment identity needs permission to deploy the service, publish the
image, and use any configured private network connection. Use federated
credentials rather than a service-account key.

`MCP_DEPLOY_ENV_JSON` must contain the configuration required by the target
deployment, including `MCP_PUBLIC_BASE_URL`, `VELO_AUTHORIZE_URL`, and Redis
connection mode. Keep passwords and the OAuth encryption secret in Secret
Manager references. The workflow adds the candidate hostname to the allowed
hosts and writes configuration to a temporary file on the runner.

For a private Redis service, configure the network path in `GCP_DEPLOY_FLAGS`
and verify access to every node used by the client. Redis Cluster requires
`MCP_REDIS_CLUSTER=true` in the server environment.

## Verification

The workflow runs `scripts/smoke-remote.mjs` against the candidate and then the
public service. It checks discovery, a synthetic authorization hand-off,
single-use codes, tool metadata, the local glossary, refresh rotation, and
revocation. It does not perform a browser sign-in or call the CDT API.

Follow [the client testing guide](remote-mcp-live-testing.md) for end-to-end
sign-in and API validation. See [OAuth state management](oauth-state.md)
for storage lifetime and recovery behavior.

Keep deployment logs and configuration free of credentials and private resource
identifiers. The workflow masks configured identifiers before deployment tools
run. Do not upload temporary configuration files as artifacts.
