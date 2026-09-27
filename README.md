# RVoice

This repository contains a Voice of Customer (VoC) platform with separate frontend and backend folders.

## Structure

- `backend/` - Express backend API, ingestion services, theme analysis, action recommendation, and static file serving.
- `frontend/` - Astro-based dashboard UI for loading VoC actions, clusters, and emerging issue spikes.

## Getting Started

### Backend
```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:4000` and serves the *built* frontend output (`frontend/dist`).

### Frontend (Astro)
```bash
cd frontend
npm install
npm run dev        # local dev server at http://localhost:4321, /api proxied to :4000
npm run build      # static build → frontend/dist (served by the backend)
```

> **Node.js note:** The frontend pins `astro@4.5.3`, which supports Node `>=18.14.1` (current project toolchain is Node 20.x). If you upgrade the machine's Node to `>=20.3.0` you may bump to a newer Astro. After changing frontend sources, run `npm run build` so the backend serves fresh output.

API endpoints:
- `GET /api/health`
- `POST /api/feedback/ingest`
- `POST /api/themes/estimate`
- `GET /api/themes`
- `GET /api/actions`
- `POST /api/actions`
- `PATCH /api/actions/:actionId`
- `GET /api/clusters`
- `GET /api/detection/spikes`
- `GET /api/overview`
- `POST /api/chat`
- `GET /api/chat/history/:sessionId`
- `GET /api/auth/user`
- `GET /api/pixel` — 1×1 tracking pixel (public, no auth)
- `GET /api/pixel.gif` — alias of `/api/pixel`
- `GET /api/pixel.js` — embeddable tracking snippet (public, no auth)

### Authentication
This backend supports OpenID Connect with Keycloak, local JSON role mapping for dev, and can be adapted to any other JWT provider that exposes role claims.

- `KEYCLOAK_ISSUER` / `OIDC_ISSUER` — issuer URL for your OpenID Connect provider
- `KEYCLOAK_AUDIENCE` / `OIDC_AUDIENCE` — expected audience claim
- `KEYCLOAK_CLIENT_ID` / `OIDC_CLIENT_ID` — client ID used by the backend
- `REQUIRE_AUTH` — `false` disables mandatory token validation for local dev
- `LOCAL_AUTH_ENABLED` — `true` enables local JSON role fallback when auth is disabled
- `LOCAL_ROLES_FILE` — path to a local role definitions file (default: `backend/data/roles.json`)

The system reads roles from:

- JWT token claims `realm_access.roles`
- JWT token claims `resource_access[clientId].roles`
- local JSON role mappings when `LOCAL_AUTH_ENABLED=true`
- header-based local roles using `x-local-user`, `x-local-email`, and `x-local-roles`

Example roles:

- `admin` — full access
- `manager` — action creation and updates
- `ingest` — feedback and ingestion operations
- `analyst` — theme estimation

#### Local JSON role fallback (no Docker/Keycloak required)
Use local role mapping when you cannot install Docker or run Keycloak.

1. Create or update `backend/data/roles.json`.

```json
{
  "users": [
    {
      "username": "admin",
      "email": "admin@example.com",
      "roles": ["admin", "manager", "ingest", "analyst"]
    },
    {
      "username": "analyst",
      "email": "analyst@example.com",
      "roles": ["analyst"]
    },
    {
      "username": "ingester",
      "email": "ingest@example.com",
      "roles": ["ingest"]
    }
  ]
}
```

2. Start the backend with local auth enabled:

```bash
export REQUIRE_AUTH=false
export LOCAL_AUTH_ENABLED=true
```

3. Call protected endpoints with a local identity header.

```bash
curl -H "x-local-user: admin" -H "x-local-roles: admin,manager" http://localhost:4000/api/themes/estimate
```

#### Keycloak / Docker integration
If you can use Docker and Keycloak, the current backend supports OIDC role enforcement with the environment variables above.

1. Run Keycloak locally with Docker:
```bash
docker run -p 8080:8080 --name keycloak -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:21.1.1 start-dev
```
2. Create a realm named `voc` and a client `voc-client`.
3. Assign realm roles like `admin`, `manager`, `ingest`, and `analyst` to test users.
4. Set backend env vars:
```bash
export KEYCLOAK_ISSUER=http://localhost:8080/auth/realms/voc
export KEYCLOAK_AUDIENCE=voc-backend
export KEYCLOAK_CLIENT_ID=voc-client
export REQUIRE_AUTH=true
```

#### Any other authorization tool
If you integrate a different OpenID Connect provider or authorization tool, make sure it issues a JWT with:

- `realm_access.roles`
- or `resource_access[<clientId>].roles`

If your provider cannot issue roles in those claims, use the local JSON fallback for development and add a small adapter later.

### Frontend
After running `npm run build` in `frontend/`, the generated dashboard is served by the backend at:

- `http://localhost:4000`

It contains an Astro-based dashboard that loads actions, theme clusters, and spikes from the backend.

## AI-Powered Intelligence

RVoice goes beyond traditional VoC platforms by turning raw feedback into **prioritized, actionable insights**:

- **PII Detection & Masking** — emails, phones, names, and addresses are detected and masked at ingestion time, so raw PII is never persisted.
- **Sentiment Analysis** — rule-based lexicon scoring with confidence, aspects, and negation/intensifier handling.
- **Theme Extraction & Clustering** — groups feedback into themes, then clusters related themes across products and journey stages.
- **Spike Detection** — flags emerging issues based on issue score thresholds and trend detection.
- **AI Prioritization** — ranks issues by impact × frequency × sentiment, with recommended actions and assigned owners.
- **Chat Assistant** — conversational Q&A over the feedback corpus.

### AI Endpoints
- `GET /api/ai/insights` — prioritized list of top issues with recommendations
- `POST /api/ai/prioritize` — score and rank a set of themes

### AI Model Strategy (Hybrid)
| Capability | Primary (Rule-Based) | Optional (ML) |
|------------|---------------------|---------------|
| Sentiment | `compromise` + sentiment lexicon | `@xenova/transformers` (DistilBERT SST-2) |
| Theme Extraction | Keyword matching | `@xenova/transformers` (MobileBERT-MNLI zero-shot) |
| Issue Categorization | Issue score threshold | `@xenova/transformers` (MobileBERT-MNLI zero-shot) |
| Clustering | Metadata grouping | TF-IDF + cosine similarity |
| Detection | Issue score threshold | Trend-based (time windows) |
| Prioritization | Impact × frequency scoring | — |

The rule-based pipeline works offline with zero dependencies. The optional ML layer can be enabled via environment variable for improved accuracy.

### Lightweight ML Layer (Optional)

RVoice ships with an optional on-device ML layer powered by [`@xenova/transformers`](https://github.com/xenova/transformers.js) — open-source ONNX models that run locally with no external API calls or data leaving the server.

**Models used:**

| Model | Size | Purpose |
|-------|------|---------|
| `Xenova/distilbert-base-uncased-finetuned-sst-2-english` | ~66 MB | Sentiment analysis (text-classification) |
| `Xenova/mobilebert-uncased-mnli` | ~25 MB | Theme extraction & issue categorization (zero-shot classification) |

**How it works:**

- The ML layer is **always additive** — the rule-based pipeline remains the default and works fully offline.
- When `ML_ENABLED=true`, the enhanced services (`analyzeSentimentEnhanced`, `categorizeFeedbackItemEnhanced`, `detectSpikesEnhanced`) blend ML results with rule-based output, preferring ML when its confidence is high.
- Models are downloaded on first use and cached locally in `.cache/models/` (configurable via `ML_CACHE_DIR`).
- All ML inference runs on **masked text** — PII is stripped before any model sees it.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ML_ENABLED` | `false` | Set to `true` to enable the ML layer |
| `ML_CACHE_DIR` | `backend/.cache/models` | Local model cache directory |
| `ML_SENTIMENT_MODEL` | `Xenova/distilbert-base-uncased-finetuned-sst-2-english` | Sentiment model ID |
| `ML_ZERO_SHOT_MODEL` | `Xenova/mobilebert-uncased-mnli` | Zero-shot classification model ID |
| `ML_TIMEOUT_MS` | `10000` | Inference timeout in milliseconds |

**New services:**

- `backend/src/services/aiModelService.js` — ML facade (lazy-loaded singleton pipelines, timeout guard)
- `backend/src/services/aiSentimentService.js` — ML sentiment analysis
- `backend/src/services/aiThemeService.js` — ML theme extraction
- `backend/src/services/aiIssueService.js` — ML issue categorization

**Enhanced functions (rule-based + ML blend):**

- `analyzeSentimentEnhanced(text)` in `nlpService.js`
- `categorizeFeedbackItemEnhanced(item)` in `categorizationService.js`
- `detectSpikesEnhanced(themes)` in `detectionService.js`

> **Note:** `@xenova/transformers` is an optional dependency. If it is not installed or `ML_ENABLED` is not set, all ML functions return `null` and the rule-based pipeline continues to work unchanged.

### Privacy
- `PII_MASKING_ENABLED` — enable/disable PII masking (default: `true`)
- Masked feedback is flagged with `piiFlagged` and `piiTypes` for auditability
- No PII is sent to external AI models — only masked text

## Tracking Pixel

RVoice ships with a **tracking pixel** so customer websites can stream anonymous page-view analytics straight into the platform. Every hit is ingested through the canonical feedback pipeline (PII-masked, deduplicated, then persisted) and shows up in the dashboard as a `web-pixel` source alongside Zendesk, App Store, Intercom, and manual entries.

### Installation

Add a single `<script>` tag to any page — no SDK, no build step, works on any stack:

```html
<script src="https://YOUR_HOST/api/pixel.js"
        data-source="web-pixel"
        data-product="checkout"
        data-store="store-42"
        data-journey-stage="checkout"></script>
```

The script auto-detects the backend base URL from its own `src` (no hardcoded domain), so it works from any host. It captures browser context (viewport, screen, color depth, language, cookies enabled, referrer, page title, URL), keeps a persistent visitor id in the `_rv_pixel_cid` cookie, and fires an invisible 1×1 image to `GET /api/pixel`.

### Embeddable script config attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `data-source` | Source name recorded on the feedback item | `web-pixel` |
| `data-product` | Product dimension (e.g. `checkout`) | — |
| `data-store` | Store/location dimension (e.g. `store-42`) | — |
| `data-journey-stage` | Journey stage (e.g. `checkout`, `delivery`) | — |
| `data-rating` | Optional 1–5 rating | — |
| `data-pixel-endpoint` | Override the analytics base URL | auto-detected |

### Endpoints

- `GET /api/pixel` — returns the 1×1 transparent GIF and asynchronously ingests the hit
- `GET /api/pixel.gif` — alias of `/api/pixel` (for pixels that require a `.gif` extension)
- `GET /api/pixel.js` — the embeddable tracking snippet

These endpoints are **public by design** (no auth): they are embedded on third-party websites that cannot attach JWTs. The response is sent immediately and ingestion runs in the background, so tracking never slows down the host page. Disable ingestion entirely with `PIXEL_ENABLED=false` (the GIF still responds).

### Data model

Each hit becomes a canonical feedback item:

| Field | Value |
|-------|-------|
| `externalId` | `pixel_<clientId>_<urlHash8>_<minuteBucket>` (deduplication key) |
| `source` | `data-source` or `web-pixel` |
| `origin` | `pixel` |
| `customer.externalId` | persistent visitor id from `_rv_pixel_cid` |
| `text` | `Pixel visit: /checkout from google.com` |
| `product` / `store` / `journeyStage` | from `data-*` attributes |
| `metadata` | userAgent, clientIp, pageUrl, pageTitle, referrer, language, viewport, screen, colorDepth, cookiesEnabled |

### Privacy notes

- Only non-PII browser hints and URL/referrer are collected; no keystrokes or form data.
- Hits flow through the standard PII-masking layer before persistence.
- The visitor id is a random, non-identifying cookie value.
- For fully cookieless / minimum-data tracking, hardcode the query params on an `<img>` tag instead:
  ```html
  <img src="https://YOUR_HOST/api/pixel?cid=demo-1&url=https://example.com&source=web-pixel" alt="" />
  ```

## Documentation
- [Stakeholder Mapping](STAKEHOLDER_MAPPING.md) — personas, role-to-feature matrix, role-based access
- [Requirements](REQUIREMENTS.md) — MVP prioritization, data sources, AI workflow, privacy

## Notes
- Use `npm run test:integration` inside `backend/` to validate backend flows.
- The backend currently stores data in `backend/data/`.
- The new chat assistant is available via the browser UI and the backend endpoints `POST /api/chat` and `GET /api/chat/history/:sessionId`.
- To enable optional OpenAI fallback, set `OPENAI_API_KEY` in the backend environment.
