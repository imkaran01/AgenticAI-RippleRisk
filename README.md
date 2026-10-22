# RippleRisk Economic Shock Analyzer API

A small, dependency-free Node.js REST API that wraps the `EconomicGraph`, `buildEconomicGraph()`, and `EconomicEngine` implementation extracted from `RippleRisk_Integrated_Corrected.html`.

## What this API does

- `GET /health`: service health and model-load status.
- `GET /sectors`: supported sector IDs and names.
- `POST /analyze`: run a shock through the RippleRisk engine and return per-sector modeled impacts.
- `POST /compare-scenarios`: return a compact response with optimistic/base/adverse scenario summaries.
- `GET /openapi.json`: OpenAPI document for inspection.

## Important modeling caveats

This is an adapter around the existing RippleRisk HTML model, not a new validated economic model. The current engine is a simplified teaching/decision-support heuristic, not an empirically calibrated forecast. It uses hard-coded sector elasticities, pass-through assumptions, network weights and a simplifying assumption that base costs are 70% of base revenue across sectors. Financial figures are expressed in the source model's units based on hard-coded base price and demand values, not company-specific currency forecasts.

The sector network has an `Electronics` node but no dedicated semiconductor-components node. Requests that use `semiconductor`, `semiconductors`, `semiconductor components`, `chips`, or `wireless earbuds` as the shock origin are mapped to the existing `electronics` sector as a proxy, and the API discloses this in its response. `target_industry` and `business_context` are descriptive context only; they do not alter the calculation. The current model does not evaluate specific wireless-earbud price options such as raising prices 5% vs. 10%.

## Run locally

Requires Node.js 20+ (no third-party npm dependencies).

```bash
npm start
```

The API listens on `http://localhost:3000` by default. To change the port, set `PORT`.

Health check:

```bash
curl http://localhost:3000/health
```

List sectors:

```bash
curl http://localhost:3000/sectors
```

Run the sample shock:

```bash
curl -X POST http://localhost:3000/analyze \
  -H 'Content-Type: application/json' \
  --data @examples/sample-request.json
```

Compare scenarios:

```bash
curl -X POST http://localhost:3000/compare-scenarios \
  -H 'Content-Type: application/json' \
  --data @examples/sample-request.json
```

## Optional API key

For a deployed API, set the environment variable `RIPPLERISK_API_KEY` to a strong random secret. If it is set, POST requests require either `Authorization: Bearer <secret>` or `X-API-Key: <secret>`. GET `/health`, `/sectors`, and `/openapi.json` remain public. Store the key as an environment secret in the hosting platform and in Leah's API Tool authentication configuration. Do not put the key in source code or commit `.env` files.

`ALLOWED_ORIGINS` controls CORS origins. `*` is convenient for early testing, but restrict it for production browser clients if needed. Service-to-service API calls generally do not depend on browser CORS policy.

## Deploy to Render

1. Create a GitHub repository and upload the contents of this folder (not the parent folder).
2. In Render, create a **Web Service** and connect the repository.
3. Use runtime **Node**, build command `npm install`, and start command `npm start`. The included `render.yaml` also describes a basic service.
4. Set `RIPPLERISK_API_KEY` in the Render environment if using authentication.
5. Set the health check path to `/health`.
6. After deployment, test `https://YOUR-SERVICE.onrender.com/health`, then `GET /sectors`, then `POST /analyze`.

A Render web service requires the app to listen on `0.0.0.0` and the assigned `PORT`; this server does so. See the official Render web-service and Node deployment guides:
- https://render.com/docs/web-services
- https://render.com/docs/deploy-node-express-app

## Leah integration plan

1. Deploy this API over HTTPS.
2. Replace `https://YOUR-DEPLOYED-HOST` in `openapi.json` with the actual base URL, if Leah uses the OpenAPI document.
3. For Leah's API Tool, configure the endpoint as `POST https://YOUR-DEPLOYED-HOST/analyze`, body format `application/json`, and use `leah-tool-schema.json` for the function schema if its field expects OpenAI function-calling JSON schema. The exact tool UI may require a different mapping; confirm with your account administrator.
4. If `RIPPLERISK_API_KEY` is enabled, configure Leah to send it as a Bearer token or `X-API-Key` depending on the authentication option supported by Leah.
5. Add the saved/published tool to the RippleRisk Agent only after Leah permissions are resolved.

## API request example

```json
{
  "shock_type": "cost-increase",
  "shock_magnitude_percent": 20,
  "direction": "increase",
  "affected_sector": "semiconductor components",
  "target_industry": "wireless earbuds",
  "duration": "persistent",
  "horizon_months": 6,
  "scenario": "base"
}
```

## Tests

```bash
npm test
```

The smoke tests start the HTTP server and exercise the health, sector, success, alias-mapping, and input-validation paths.
