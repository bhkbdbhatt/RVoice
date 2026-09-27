# RVoice — Codebase Context Prompt for LLM Agents

You are working on **RVoice**, a retail **Voice of Customer (VoC)** platform that ingests customer feedback from multiple channels, analyzes it with a hybrid rule-based + optional ML pipeline, and surfaces **prioritized, actionable insights** through a web dashboard and an in-dashboard AI chatbot.

This document is a complete technical brief of the codebase. Use it to understand the architecture, conventions, data models, and APIs before making any changes. **Read the referenced files before modifying them.**

---

## 1. Project Overview

| Attribute | Value |
|-----------|-------|
| **Name** | RVoice (Retail Voice of Customer Command Center) |
| **Language** | JavaScript (Node.js) — **ES Modules** (`"type": "module"`) throughout |
| **Backend** | Express 4, in `backend/` |
| **Frontend** | Vanilla JS + HTML + CSS (no framework), in `frontend/` |
| **Storage** | Dual mode: **JSON files** (default, local dev) or **PostgreSQL** (production, `STORAGE_MODE=postgres`) |
| **Queue** | Dual mode: **in-memory** (default) or **Kafka** (`QUEUE_MODE=kafka`) |
| **NLP** | `compromise` (rule-based) + optional `@xenova/transformers` (ONNX ML models) |
| **Auth** | OpenID Connect (Keycloak) JWT + local JSON role fallback for dev |
| **Port** | Backend serves on `http://localhost:4000` and also serves the frontend statically |

**Core value proposition:** Turn raw customer feedback into prioritized, actionable insights — PII is masked at ingestion, sentiment is scored, themes are extracted and clustered, emerging issues (spikes) are detected, actions are recommended with owners, and a chat assistant answers natural-language questions over the data.

---

## 2. Repository Structure

```
RVoice-main/
├── README.md                    # Root docs: setup, auth, AI endpoints, ML layer, privacy
├── REQUIREMENTS.md              # MVP prioritization, data sources, AI workflow, privacy
├── STAKEHOLDER_MAPPING.md       # Personas, role-to-feature matrix, role-based access
├── implementation_plan.md       # Detailed plan for the chatbot feature (intents, files, functions)
├── RVoice_LLM_PROMPT.md         # THIS FILE — context brief for LLM agents
│
├── backend/
│   ├── package.json             # ESM; deps: express, compromise, uuid, cors, body-parser, express-jwt, jwks-rsa
│   │                            # optionalDeps: openai, @xenova/transformers
│   ├── .gitignore               # ignores node_modules/ and data/
│   ├── README.md                # Backend-specific quickstart + feedback schema
│   ├── AUTH_CONFIG.md           # Auth configuration details
│   ├── data/                    # JSON storage (gitignored): feedback.json, themes.json, actions.json,
│   │                            #   chatHistory.json, idempotency_keys.json, roles.json
│   └── src/
│       ├── index.js             # Express app entry: middleware, route registration, static serving
│       ├── config/env.js        # Centralized env config with defaults (server, postgres, kafka, ingestion,
│       │                        #   openai, pii, chat, ml, auth, polling)
│       ├── auth/
│       │   ├── authMiddleware.js  # jwtAuth (express-jwt + jwks-rsa), localAuth (header/JSON roles),
│       │   │                      #   requireRole, requireAnyRole, getUserInfo
│       │   └── localRoles.js      # Loads backend/data/roles.json, findLocalUser()
│       ├── db/
│       │   ├── connection.js      # initDatabase, getPool, query, withTransaction, checkDatabaseHealth
│       │   └── schema.sql         # Full Postgres schema: customers, feedback, topics, actions,
│       │                          #   ingestion_log, idempotency_keys, connector_state,
│       │                          #   chat_sessions, chat_messages, outbox_events, views, triggers
│       ├── routes/
│       │   ├── feedback.js        # POST /api/feedback/ingest, GET /api/feedback
│       │   ├── themes.js          # POST /api/themes/estimate, GET /api/themes
│       │   ├── actions.js         # GET /api/actions, POST /api/actions, PATCH /api/actions/:actionId
│       │   ├── detection.js       # GET /api/detection/spikes
│       │   ├── clusters.js        # GET /api/clusters
│       │   ├── overview.js        # GET /api/overview (aggregate KPIs)
│       │   ├── ingestion.js       # POST /api/ingestion/webhook/:source, /normalize, /connectors...
│       │   ├── chat.js            # POST /api/chat, GET /api/chat/history/:sessionId
│       │   └── auth.js            # GET /api/auth/user
│       ├── services/
│       │   ├── storageService.js        # JSON file load/save for feedback, themes, actions, chatHistory
│       │   ├── normalizationService.js  # normalizeFeedbackItem → canonical shape
│       │   ├── piiService.js            # detectPII, maskPII, maskPIIInItem (emails, phones, names,
│       │   │                            #   addresses, credit cards, IPs)
│       │   ├── nlpService.js            # analyzeSentiment, extractAspects, negation/intensifier handling,
│       │   │                            #   analyzeSentimentEnhanced (rule + ML blend)
│       │   ├── sentimentLexicon.js      # SENTIMENT_LEXICON, NEGATION_TERMS, INTENSIFIERS, ASPECT_KEYWORDS
│       │   ├── categorizationService.js # categorizeFeedbackItem (journey stage/product/store keywords),
│       │   │                            #   categorizeFeedbackItemEnhanced (rule + ML blend)
│       │   ├── themeService.js          # estimateThemes, getThemes (persists to themes.json)
│       │   ├── themeScoringService.js   # scoreThemes → sentimentScore, confidence, issueScore, severity
│       │   ├── themeClusteringService.js# clusterThemes → clusters by product+journeyStage w/ sentiment dist
│       │   ├── detectionService.js      # scoreTheme, detectSpikes (issueScore >= 2), detectSpikesEnhanced
│       │   ├── actionService.js         # recommendActionsForTheme, persistActions, getActions, updateAction
│       │   ├── feedbackService.js       # ingestFeedback, getFeedback (JSON-mode store)
│       │   ├── chatService.js           # handleChat orchestrator: classify → query → respond → persist
│       │   ├── chatNlpService.js        # classifyIntent, extractEntities (compromise + keyword matching)
│       │   ├── chatHistoryService.js    # saveChatMessage, getChatHistory, createSession (JSON file)
│       │   ├── llmFallbackService.js    # generateLlmResponse (optional OpenAI GPT fallback)
│       │   ├── aiModelService.js        # ML facade: lazy singleton pipelines, timeout guard, isMlAvailable
│       │   ├── aiSentimentService.js    # analyzeSentimentMl (DistilBERT SST-2)
│       │   ├── aiThemeService.js        # extractThemesMl (MobileBERT-MNLI zero-shot)
│       │   ├── aiIssueService.js        # categorizeIssueMl (MobileBERT-MNLI zero-shot)
│       │   └── migrationService.js      # migrateFeedback/Themes/Actions/ConnectorState JSON→Postgres
│       ├── ingestion/
│       │   ├── canonicalSchema.js       # CANONICAL_SCHEMA, validateCanonicalItem, createCanonicalItem
│       │   ├── ingestionService.js      # processIngestion pipeline: normalize→validate→mask→dedupe→persist→queue
│       │   ├── idempotencyService.js    # SHA-256 keys, isDuplicate, recordIdempotencyKey, deduplicate
│       │   ├── adapters/                # zendeskAdapter, intercomAdapter, appStoreAdapter, genericAdapter, index
│       │   └── connectors/              # baseConnector, zendeskConnector, intercomConnector,
│       │                                #   appStoreConnector, stateStore, index
│       ├── repositories/
│       │   └── feedbackRepository.js    # upsertFeedback(Batch), getFeedback, countFeedback (PG + JSON)
│       ├── queue/
│       │   └── messageQueue.js          # MemoryQueue + KafkaQueue, getQueue() singleton
│       ├── utils/
│       │   └── sampleData.js            # sampleFeedback array used by integration tests
│       └── tests/
│           ├── nlpServiceTest.js        # Unit tests for sentiment/aspect/negation/intensifier logic
│           ├── chatServiceTest.js       # Unit tests for intent classification, entity extraction, sessions
│           ├── aiModelServiceTest.js    # ML availability + enhanced blend tests (skips if ML absent)
│           ├── integrationTest.js       # End-to-end API flow against a running server
│           └── smokeTest.js             # Health check smoke test
│
└── frontend/
    ├── index.html              # Dashboard shell: login screen, sidebar nav, sections (overview,
    │                           #   feedback, themes, actions, clusters, spikes, ingest), action modal,
    │                           #   chat widget container + script tags
    ├── main.js                 # All dashboard logic: auth, API helpers, rendering, filters, kanban,
    │                           #   charts, ingest form, role-based view
    ├── styles.css              # Full dashboard styling (CSS variables, cards, tables, kanban, modal)
    ├── chatWidget.js           # Vanilla JS chat widget: floating panel, session handling, API calls
    ├── chatWidget.css          # Chat widget styles (scoped to #chat-widget-container)
    └── package.json            # Only devDependency: nodemon
```

---

## 3. Data Models

### 3.1 Canonical Feedback Item (after normalization)
```javascript
{
  id: 'uuid',                    // internal ID
  source: 'zendesk|intercom|app_store|web|email|store|social|review|ticket|survey|generic',
  origin: 'same as source or raw channel',
  externalId: 'id-from-source',  // used for dedup; optional for manual entries
  timestamp: 'ISO-8601',
  text: 'masked feedback text',  // PII replaced with [EMAIL], [PHONE], [NAME], etc.
  rating: 1-5 | null,
  product: 'SKU-1234' | null,
  store: 'store-42' | null,
  journeyStage: 'browse|checkout|delivery|support|...' | null,
  metadata: {},
  piiFlagged: true|false,        // set by maskPIIInItem
  piiTypes: ['email', 'phone']   // set by maskPIIInItem
}
```

### 3.2 Theme (output of `estimateThemes`)
```javascript
{
  themeId: 'theme-<id>',
  sourceId: 'source feedback id',
  text: 'feedback text',
  product: '...' | null,
  store: '...' | null,
  journeyStage: '...' | null,
  source: '...',
  sentiment: 'positive|neutral|negative',
  score: number in [-1, 1],
  confidence: number in [0, 1],
  aspects: [
    { aspect: 'checkout|delivery|product quality|customer support|store experience|price|app|returns|general',
      sentiment, score, confidence, matchedTerms: [], negated: bool }
  ],
  createdAt: 'ISO-8601',
  // Added by themeScoringService.scoreThemes:
  sentimentScore: number in [-1, 1],
  issueScore: number >= 0,
  severity: 'low|medium|high'   // >=3 high, >=2 medium, else low
}
```

### 3.3 Action (output of `recommendActionsForTheme`)
```javascript
{
  actionId: 'uuid',
  themeId, sourceId, product, store, journeyStage,
  sentiment, sentimentScore, confidence, issueScore, severity,
  status: 'pending|assigned|in_progress|resolved|closed',
  assignedOwner: 'ecommerce-product-owner|logistics-lead|product-quality-manager|support-manager|store-ops-manager|customer-experience-lead',
  recommendations: [
    { aspect, sentiment, sentimentScore, confidence, recommendedAction, owner }
  ],
  recommendedAt: 'ISO-8601',
  notes: [],
  createdAt: 'ISO-8601'
}
```

### 3.4 Cluster (output of `clusterThemes`)
```javascript
{
  clusterId: '<product>-<journeyStage>' (e.g. 'general-checkout'),
  product, journeyStage, source,
  items: [theme, ...],
  sentimentDistribution: { positive: n, neutral: n, negative: n },
  count: number
}
```

### 3.5 Spike (output of `detectSpikes`)
```javascript
{
  themeId, sourceId, text,
  reason: 'issue score threshold exceeded',
  score: issueScore (>= 2),
  sentiment: 'positive|neutral|negative',
  sentimentScore: number in [-1, 1],
  confidence: number in [0, 1],
  detectedAt: 'ISO-8601'
}
```

### 3.6 Chat Message (persisted in `chatHistory.json` / `chat_messages` table)
```javascript
{
  id: 'uuid',
  sessionId: 'uuid',
  sender: 'user|bot',
  message: 'text',
  intent: 'count.feedback|themes.list|...' | null,
  confidence: number | null,
  data: object | null,          // raw data the reply was based on
  timestamp: 'ISO-8601',
  createdAt: 'ISO-8601'
}
```

---

## 4. API Endpoints

All routes are mounted under `/api`. `jwtAuth` + `localAuth` middleware run globally; role guards are per-route.

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/health` | public | Health check; returns `{ status, uptime, storageMode }` |
| GET | `/api/auth/user` | any | Returns current user info from token/headers |
| POST | `/api/feedback/ingest` | admin, ingest | Ingest feedback items; body `{ items: [...] }` → `{ ingested, items }` |
| GET | `/api/feedback` | any | List feedback; query filters: `source`, `product`, `store`, `journeyStage` |
| POST | `/api/themes/estimate` | admin, analyst | Estimate themes from items; body `{ items: [...] }` → `{ themes }` |
| GET | `/api/themes` | any | List themes; filters: `product`, `store`, `source`, `journeyStage`, `severity` |
| GET | `/api/actions` | any | List actions; filters: `owner`, `themeId`, `status` |
| POST | `/api/actions` | admin, manager | Generate actions from themes; body `{ query: {} }` → `{ actions }` |
| PATCH | `/api/actions/:actionId` | admin, manager | Update action; body `{ status?, assignedOwner?, notes? }` → `{ action }` |
| GET | `/api/clusters` | any | List theme clusters |
| GET | `/api/detection/spikes` | any | List detected spikes |
| GET | `/api/overview` | any | Aggregate: `{ themeCount, actionCount, actions, clusters, spikes }` |
| POST | `/api/chat` | any | Chat message; body `{ message, sessionId? }` → `{ reply, intent, confidence, data, sessionId }` |
| GET | `/api/chat/history/:sessionId` | any | Chat history for a session |
| POST | `/api/ingestion/webhook/:source` | admin, ingest | Async webhook ingestion; returns 202 |
| POST | `/api/ingestion/normalize` | admin, ingest | Normalize payload without persisting |
| GET | `/api/ingestion/connectors` | any | List connectors + state |
| POST | `/api/ingestion/connectors/:name/poll` | admin, ingest | Trigger connector poll |
| GET | `/api/ingestion/connectors/:name/health` | any | Connector health check |

**Note:** The README also mentions `GET /api/ai/insights` and `POST /api/ai/prioritize`, but these are **not implemented** in the current codebase — do not assume they exist.

---

## 5. AI / ML Pipeline (Hybrid)

### 5.1 Rule-Based Pipeline (default, works offline, zero deps)
1. **PII Masking** (`piiService.js`) — regex + `compromise` name detection; masks emails, phones, names, addresses, credit cards, IPs. Runs at ingestion before persistence.
2. **Sentiment Analysis** (`nlpService.js` + `sentimentLexicon.js`) — lexicon scoring with negation flipping and intensifier multipliers; returns `{ sentiment, score, confidence, aspects }`.
3. **Theme Extraction** (`categorizationService.js`) — keyword matching for journey stage, product, store.
4. **Theme Scoring** (`themeScoringService.js`) — `issueScore = aspects.length + negativeWeight - positiveWeight + confidenceBonus`; severity thresholds.
5. **Clustering** (`themeClusteringService.js`) — groups themes by `product-journeyStage` key with sentiment distribution.
6. **Spike Detection** (`detectionService.js`) — flags themes with `issueScore >= 2`.
7. **Action Recommendation** (`actionService.js`) — maps aspects to recommended actions + owners via `ownerMatrix` / `actionsByAspect`.

### 5.2 Optional ML Layer (`@xenova/transformers`, ONNX, on-device)
- Enabled via `ML_ENABLED=true`; models cached in `ML_CACHE_DIR` (default `backend/.cache/models`).
- **Sentiment:** `Xenova/distilbert-base-uncased-finetuned-sst-2-english` (~66 MB)
- **Zero-shot (themes/issues):** `Xenova/mobilebert-uncased-mnli` (~25 MB)
- **Facade:** `aiModelService.js` — lazy-loaded singleton pipelines, `withTimeout` guard (default 10s), returns `null` when disabled/unavailable.
- **Enhanced blend functions** (rule-based + ML, prefer ML when confidence ≥ 0.6):
  - `analyzeSentimentEnhanced(text)` in `nlpService.js`
  - `categorizeFeedbackItemEnhanced(item)` in `categorizationService.js`
  - `detectSpikesEnhanced(themes)` in `detectionService.js`
- **Important:** All ML inference runs on **masked text** — PII is stripped before any model sees it. ML is always additive; if unavailable, rule-based results are returned unchanged.

---

## 6. Chatbot

### 6.1 Flow
`POST /api/chat` → `chatService.handleChat(message, sessionId)`:
1. `classifyIntent(message)` → `{ intent, confidence, entities, fallback }`
2. If `fallback && config.openai.apiKey` → `llmFallbackService.generateLlmResponse` (OpenAI GPT)
3. If `fallback && no key` → generic "still learning" reply
4. Else → `buildResponse(intent, entities)` queries services and generates template reply
5. Persists user + bot messages via `saveChatMessage`

### 6.2 Supported Intents (rule-based, in `chatNlpService.js`)
`help`, `overview`, `count.feedback`, `count.themes`, `count.actions`, `count.clusters`, `count.spikes`, `feedback.list`, `feedback.sentiment`, `themes.list`, `actions.list`, `clusters.list`, `spikes.list`, `feedback.by_product`, `feedback.by_store`, `actions.by_owner`, `actions.by_status`

### 6.3 Entity Extraction (`extractEntities`)
- `product`: checkout, delivery, order, purchase
- `store`: `store-42` / `store 42` pattern, or store/shop/outlet
- `status`: pending, resolved, completed, failed
- `journeyStage`: awareness, consideration, purchase, checkout, delivery, post-purchase, support

### 6.4 Session & Persistence
- `createSession()` → UUID v4
- JSON mode: appends to `backend/data/chatHistory.json`
- Postgres mode: `chat_sessions` + `chat_messages` tables (see `schema.sql`)
- Frontend stores `chatSessionId` in `localStorage` and loads history on widget init

---

## 7. Ingestion Pipeline

```
raw payload → normalize (adapter) → validate (canonicalSchema) → PII mask → deduplicate (idempotency keys) → persist (upsertFeedbackBatch) → publish to queue
```

- **Adapters** (`ingestion/adapters/`): `zendeskAdapter`, `intercomAdapter`, `appStoreAdapter`, `genericAdapter` (fallback for unknown sources). Each exposes `normalizeX` and `normalizeXBatch`.
- **Idempotency** (`idempotencyService.js`): SHA-256 of `source:externalId`; TTL configurable (`IDEMPOTENCY_TTL_DAYS`, default 90). Items without `externalId` are always processed.
- **Queue** (`queue/messageQueue.js`): `MemoryQueue` (default) buffers messages and replays to subscribers; `KafkaQueue` uses `kafkajs` (lazy import). Topics: `voc.raw-feedback`, `voc.normalized-feedback`, `voc.processed-feedback`, `voc.dead-letter`.

---

## 8. Authentication & Roles

### 8.1 Modes
- **OIDC (Keycloak):** `jwtAuth` validates RS256 JWT via JWKS from `KEYCLOAK_ISSUER`; roles read from `realm_access.roles` or `resource_access[clientId].roles`.
- **Local JSON fallback (dev):** `localAuth` reads `x-local-user`, `x-local-email`, `x-local-roles` headers and/or `backend/data/roles.json`. Enabled when `LOCAL_AUTH_ENABLED=true` or `REQUIRE_AUTH=false`.
- **Disabled:** `AUTH_MODE=disabled` or `REQUIRE_AUTH=false` with `ALLOW_INSECURE_LOCAL=true` grants default roles.

### 8.2 Roles
| Role | Capabilities |
|------|-------------|
| `admin` | Full access — all features |
| `manager` | Action creation and updates |
| `analyst` | Theme estimation |
| `ingest` | Feedback and ingestion operations |
| `viewer` | Read-only access |

### 8.3 Frontend Role-Based View
`frontend/main.js` defines `rolePermissions` (section → roles) and `primarySectionByRole`; sections are hidden/shown based on the logged-in user's roles. Action management buttons require `admin`/`manager`; theme estimation requires `admin`/`analyst`; ingest requires `admin`/`ingest`.

---

## 9. Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `STORAGE_MODE` | `json` | `json` or `postgres` |
| `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` | localhost/5432/voc_engine/postgres/postgres | Postgres connection |
| `DATABASE_URL` | — | Overrides individual PG vars |
| `QUEUE_MODE` | `memory` | `memory` or `kafka` |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated brokers |
| `INGEST_MAX_BATCH` | `1000` | Max items per batch |
| `IDEMPOTENCY_TTL_DAYS` | `90` | Idempotency key TTL |
| `PII_MASKING_ENABLED` | `true` | Enable/disable PII masking |
| `PII_MASK_CUSTOMER_FIELDS` | `true` | Mask customer email/name fields |
| `ML_ENABLED` | `false` | Enable ML layer |
| `ML_CACHE_DIR` | `backend/.cache/models` | Model cache |
| `ML_SENTIMENT_MODEL` | `Xenova/distilbert-base-uncased-finetuned-sst-2-english` | Sentiment model |
| `ML_ZERO_SHOT_MODEL` | `Xenova/mobilebert-uncased-mnli` | Zero-shot model |
| `ML_TIMEOUT_MS` | `10000` | ML inference timeout |
| `OPENAI_API_KEY` | — | Enables chat LLM fallback |
| `OPENAI_MODEL` | `gpt-3.5-turbo` | Chat fallback model |
| `OPENAI_MAX_TOKENS` | `400` | Max tokens |
| `OPENAI_TEMPERATURE` | `0.5` | Temperature |
| `CHAT_MAX_HISTORY` | `50` | Max history per session |
| `CHAT_SESSION_TTL_HOURS` | `24` | Session TTL |
| `KEYCLOAK_ISSUER` / `OIDC_ISSUER` | `http://localhost:8080/auth/realms/voc` | OIDC issuer |
| `KEYCLOAK_AUDIENCE` / `OIDC_AUDIENCE` | `voc-backend` | Expected audience |
| `KEYCLOAK_CLIENT_ID` / `OIDC_CLIENT_ID` | `voc-client` | Client ID |
| `REQUIRE_AUTH` | `true` | `false` disables mandatory token validation |
| `LOCAL_AUTH_ENABLED` | `true` | Enables local JSON role fallback |
| `LOCAL_ROLES_FILE` | `backend/data/roles.json` | Local roles file |
| `ALLOW_INSECURE_LOCAL` | `false` | Grants default roles when no roles found |
| `AUTH_MODE` | `local` | `local`, `oidc`, or `disabled` |
| `DATA_DIR` | `backend/data` | JSON storage directory |

---

## 10. Code Conventions & Patterns

1. **ES Modules everywhere** — use `import`/`export`, never `require`/`module.exports`. `__dirname` is replicated via `fileURLToPath(import.meta.url)` where needed.
2. **Functional service modules** — services export plain functions (no classes except connectors/queue). In-memory store caches (e.g., `let feedbackStore = []`) are lazily initialized from JSON files.
3. **Dual storage pattern** — services check `isPostgresMode()` (or `config.storageMode`) and branch between `query()`/`withTransaction()` (PG) and `storageService` JSON file helpers. Keep both paths working.
4. **Optional dependencies are lazy-loaded** — `openai` and `@xenova/transformers` are in `optionalDependencies` and imported dynamically inside functions so the app runs without them.
5. **Auth guards** — use `requireAnyRole('admin', 'manager')` etc. on mutating routes; read routes are generally open to any authenticated user.
6. **Error handling** — routes wrap logic in try/catch and return `res.status(500).json({ error: error.message })` (or 400/404/413 as appropriate).
7. **Tests** — plain Node scripts using `assert(condition, message)` with `passed`/`failed` counters, run via `node src/tests/<name>.js`. No test framework.
8. **Data files** — JSON stores live in `backend/data/` (gitignored). `chatHistory.json` is auto-created on first use.
9. **Frontend** — vanilla JS modules loaded via `<script type="module">`; API helpers `fetchJson`/`postJson`/`patchJson` in `main.js` attach `x-local-*` auth headers from `sessionStorage` (`vocAuth` key). HTML escaping via `escapeHtml()` before injecting user data.

---

## 11. How to Run & Test

### Backend
```bash
cd backend
npm install
npm run dev          # node --watch src/index.js → http://localhost:4000
```

### Frontend
Astro-based dashboard (see `frontend/`). Run `npm run build` in `frontend/`; the generated `dist/` is served by the backend at `http://localhost:4000`.

### Tests
```bash
cd backend
npm run test:unit          # nlpServiceTest + chatServiceTest + aiModelServiceTest
npm run test:integration   # requires server running on :4000; ingests sample data, validates fields
node src/tests/smokeTest.js
```

### Local Dev Auth
```bash
export REQUIRE_AUTH=false
export LOCAL_AUTH_ENABLED=true
```
Then call protected endpoints with headers: `x-local-user: admin`, `x-local-roles: admin,manager`.

---

## 12. Known Gaps / Things to Watch

- `GET /api/ai/insights` and `POST /api/ai/prioritize` are documented in README but **not implemented** — do not reference them as existing.
- `chatHistoryService.js` only implements JSON-file persistence; the Postgres path (`chat_sessions`/`chat_messages` tables exist in schema) is **not wired up** in the service.
- `chatService.buildResponse` fetches all feedback/themes/actions on every call (no pagination) — fine for dev, but a scaling concern.
- `chatNlpService.classifyIntent` uses simple substring matching; confidence is `min(1, maxScore/3)` and `fallback = confidence < 0.3`.
- `storageService.js` uses `path.resolve('data')` (relative to CWD) while `chatHistoryService.js` uses `path.join(__dirname, '../../data')` — both resolve to `backend/data` when run from `backend/`, but be consistent if you touch these.
- The `frontend/chatWidget.js` starts visible (`className = 'open'`) and does not send auth headers — it relies on the backend's local-auth fallback.
- `main.js` `escapeHtml` uses `&` → `&` (correct), but the regex replacements for `<`, `>`, `"`, `'` are written as literal characters in the source — verify they render correctly in your editor.

---

## 13. Common Tasks (Examples)

### Add a new intent to the chatbot
1. Add keyword phrases to `INTENT_KEYWORDS` in `chatNlpService.js`.
2. Add entity extraction rules in `extractEntities` if needed.
3. Add a `case` in `buildResponse` in `chatService.js`.
4. Add a test case in `backend/src/tests/chatServiceTest.js`.

### Add a new API endpoint
1. Create a route file in `backend/src/routes/` (or extend an existing one).
2. Register it in `backend/src/index.js` with `app.use('/api/<path>', <router>)`.
3. Add role guards with `requireAnyRole(...)` for mutating operations.
4. Add a service function in `backend/src/services/` following the dual-storage pattern.
5. Add integration test coverage in `backend/src/tests/integrationTest.js`.

### Enable the ML layer
```bash
export ML_ENABLED=true
cd backend && npm install   # ensures @xenova/transformers is present
npm run dev
```
Models download on first use to `backend/.cache/models/`.

### Enable OpenAI chat fallback
```bash
export OPENAI_API_KEY=sk-...
```
Unrecognized chat queries will then be answered by GPT instead of the "still learning" reply.

---

## 14. Key Files to Read First (Suggested Order)

1. `README.md` — product overview, endpoints, auth, ML strategy
2. `backend/src/index.js` — app wiring, route registration
3. `backend/src/config/env.js` — all configuration
4. `backend/src/services/feedbackService.js` + `themeService.js` + `actionService.js` — core data services
5. `backend/src/services/nlpService.js` + `sentimentLexicon.js` — sentiment engine
6. `backend/src/services/chatService.js` + `chatNlpService.js` — chatbot
7. `backend/src/services/piiService.js` — privacy layer
8. `backend/src/ingestion/ingestionService.js` — ingestion pipeline
9. `backend/src/db/schema.sql` — Postgres schema
10. `frontend/main.js` + `frontend/chatWidget.js` — dashboard + chat UI