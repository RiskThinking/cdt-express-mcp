# Connector publishing checklist

Use Anthropic's [submission guide](https://claude.com/docs/connectors/building/submission),
[review criteria](https://claude.com/docs/connectors/building/review-criteria),
and [authentication requirements](https://claude.com/docs/connectors/building/authentication)
when preparing a listing.

## Listing information

- Name and description that accurately explain the connector's capabilities.
- Remote HTTPS endpoint, public documentation, approved privacy policy,
  support contact, and approved branding assets.
- Account, subscription, and permission requirements.
- Read-only access classification and any API quota implications.
- Reviewer credentials and sample data, supplied privately through the portal.
- Verified ownership of connected endpoints and agreement to applicable terms.

The tools retrieve climate hazard and risk data for locations, assets,
companies, and market indexes. They do not execute financial transactions.
Results depend on account permissions and available data.

## Validation

- Verify OAuth sign-in, consent, cancellation, refresh, disconnect, and reconnect
  using an account with access to representative data.
- Exercise every tool and confirm titles and read-only annotations.
- Check invalid inputs, inaccessible data, API failures, and pagination.
- Keep tool descriptions accurate and responses proportional to the request.
- Confirm the privacy policy covers collection, use, sharing, retention, and
  contact information for both the connector and connected services.

## Example prompts

1. “Use CDT Express to explain dcr_score, expected_impact, and cvar_95 using its
   official metric definitions.”
2. “Retrieve extreme-heat exposure (hot_days) for Toronto at latitude 43.6532,
   longitude -79.3832, pathway ssp245, horizon 2050.”
3. “Search for Microsoft, return at most three matches, and retrieve climate
   scores for a returned company under ssp245 in 2050.”

Use [the client testing guide](remote-mcp-live-testing.md) for sign-in and API
checks. Automated deployment smoke tests use a synthetic hand-off and the local
glossary; they do not replace browser sign-in or complete API acceptance tests.
