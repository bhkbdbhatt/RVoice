# Implementation Plan

## Overview

Add an in-dashboard AI chatbot to the RVoice Voice-of-Customer platform that allows users to ask natural-language questions about the data displayed on the dashboard (feedback, themes, actions, clusters, spikes, sentiment). The chatbot uses a hybrid approach: a rule-based intent classifier powered by the already-installed `compromise` NLP library as the primary engine, with an optional OpenAI LLM fallback for unrecognized queries when an API key is configured. The UI is built as a vanilla-JS chat widget in the existing frontend, with a new backend chat service, route, and persistent chat history stored in both JSON-file and PostgreSQL modes.

The dashboard already exposes all the data the chatbot needs through existing services (`feedbackService`, `themeService`, `actionService`, `detectionService`, `themeClusteringService`, `overview` route). The chatbot will act as a natural-language query layer on top of these existing APIs, plus a lightweight conversation-memory system stored alongside the existing JSON data files.

## Types

### Chat Session
A single conversation session identified by a UUID. Maintained in memory per backend process (sufficient for the single-process dev server) and optionally persisted to chat history.

```javascript
// Session (in-memory)
{
  sessionId: "uuid-v4",        // string - unique session identifier
  history: [                     // ChatMessage[] - conversation so far
    { sender, text, timestamp, intent, data }
  ],
  createdAt: "ISO-8601",
  lastActiveAt: "ISO-8601"
}
```

### Chat Message
```javascript
{
  sender: "user" | "bot",       // string - who sent the message
  text: string,                 // string - the message content (user input or bot reply)
  timestamp: "ISO-8601",        // string - when the message was sent
  intent: string | null,        // string|null - classified intent (e.g. "count.feedback")
  confidence: number | null,    // number|null - intent classification confidence [0, 1]
  data: object | null           // object|null - raw data the reply was based on
}
```

### Intent Classification Result
```javascript
{
  intent: string,               // e.g. "count.feedback", "sentiment.overview"
  confidence: number,           // [0, 1]
  entities: object,             // extracted entities: { product, store, journeyStage, sentiment, severity, status, ... }
  fallback: boolean             // true if no rule-based intent matched (triggers LLM fallback)
}
```

### Supported Intents (Rule-Based)

| Intent | Example Questions | Data Source |
|--------|-------------------|-------------|
| `help` | "help", "what can you do", "how does this work" | Static description |
| `overview` | "what's on the dashboard", "give me a summary", "overview" | `overview` route |
| `count.feedback` | "how many feedback", "total feedback count" | `getFeedback()` |
| `count.themes` | "how many themes", "total themes" | `getThemes()` |
| `count.actions` | "how many actions", "total actions" | `getActions()` |
| `count.clusters` | "how many clusters", "total clusters" | `clusterThemes()` |
| `count.spikes` | "how many spikes", "emerging issues count" | `detectSpikes()` |
| `feedback.list` | "show me feedback", "list feedback from store-42" | `getFeedback(query)` |
| `feedback.sentiment` | "feedback sentiment", "how's the sentiment" | `getFeedback()` + analyze |
| `themes.list` | "show me themes", "what are the themes", "negative themes" | `getThemes(query)` |
| `actions.list` | "show me actions", "pending actions", "actions for checkout" | `getActions(query)` |
| `clusters.list` | "show me clusters", "cluster for delivery" | `clusterThemes()` |
| `spikes.list` | "show me spikes", "what are the emerging issues", "any trending issues" | `detectSpikes()` |
| `feedback.by_product` | "checkout feedback", "delivery issues" | `getFeedback({product})` |
| `feedback.by_store` | "store-42 feedback", "feedback from store-15" | `getFeedback({store})` |
| `actions.by_owner` | "actions for ecommerce-product-owner" | `getActions({owner})` |
| `actions.by_status` | "pending actions", "resolved actions" | `getActions({status})` |

### Chat History Record (Persisted)
```javascript
{
  id: "uuid-v4",                 // string - primary key
  sessionId: "uuid-v4",          // string - session this message belongs to
  sender: "user" | "bot",        // string
  message: string,               // string - the text content
  intent: string | null,         // string|null
  confidence: number | null,     // number|null
  timestamp: "TIMESTAMPTZ",     // when the message was sent
  createdAt: "TIMESTAMPTZ"       // when the record was stored
}
```

## Files

### New Files to Create

1. **`backend/src/services/chatService.js`**
   - Core chatbot logic: intent classification, response generation, orchestrates queries to existing services
   - Exports: `handleChat`, `classifyIntent`, `generateResponse`

2. **`backend/src/services/chatNlpService.js`**
   - Intent classification using `compromise` + keyword matching
   - Exports: `classifyIntent`, `extractEntities`, `computeIntentConfidence`

3. **`backend/src/services/chatHistoryService.js`**
   - Chat history persistence for both JSON and Postgres modes
   - Exports: `saveChatMessage`, `getChatHistory`, `createSession`

4. **`backend/src/routes/chat.js`**
   - Express router: `POST /api/chat` (primary chat endpoint), `GET /api/chat/history/:sessionId`
   - Exports default router

5. **`backend/src/services/llmFallbackService.js`**
   - Optional OpenAI GPT fallback for unrecognized intents
   - Only activated when `OPENAI_API_KEY` env var is set
   - Exports: `generateLlmResponse`

6. **`frontend/chatWidget.js`**
   - Vanilla JS chat widget UI logic: message rendering, input handling, API calls
   - Uses existing `fetchJson`/`postJson` patterns from `main.js`
   - Self-contained module loaded via `<script>` tag

7. **`frontend/chatWidget.css`**
   - Chat widget styles: floating button, chat panel, message bubbles, input bar

8. **`frontend/chatWidget.html`** (inline template)
   - HTML snippet injected into `index.html` for the chat widget container

9. **`backend/src/tests/chatServiceTest.js`**
   - Unit tests for intent classification, response generation, and entity extraction
   - Run via `node src/tests/chatServiceTest.js` (matching existing test pattern)

10. **`data/chatHistory.json`**
    - JSON data file for chat history in local-dev mode (mirrors `feedback.json`, `themes.json`, `actions.json` pattern)

### Existing Files to Modify

1. **`backend/src/index.js`**
   - Import and register `chatRoutes` at `/api/chat`

2. **`backend/src/services/storageService.js`**
   - Add `loadChatHistory()` and `saveChatHistory()` functions following the existing JSON file pattern
   - Add `actionPath` equivalent: `chatHistoryPath = path.join(dataDir, 'chatHistory.json')`

3. **`backend/src/db/schema.sql`**
   - Add `chat_messages` table (matching existing schema style with UUID primary keys, indexes, triggers)
   - Add `chat_sessions` table for session tracking

4. **`backend/src/config/env.js`**
   - Add `openai` config block: `apiKey`, `model`, `maxTokens`
   - Add `chat` config: `maxHistoryPerSession`, `sessionTtlHours`

5. **`backend/.gitignore`**
   - Ensure `data/` is ignored (already present) — chatHistory.json will be auto-generated

6. **`backend/src/services/nlpService.js`**
   - No breaking changes needed, but may expose `analyzeSentiment` for use by chat service when summarizing feedback text

7. **`frontend/index.html`**
   - Add `<div id="chat-widget">` container before closing `</body>`
   - Add `<script type="module" src="chatWidget.js"></script>` before closing `</body>`

8. **`frontend/styles.css`**
   - Add a `@import` of `chatWidget.css` or append chat widget styles
   - Add CSS variables for chat colors using existing `:root` variables where possible

9. **`backend/package.json`**
   - Add `"start:test"` or `"test:unit"` script: `"node src/tests/chatServiceTest.js"` (the existing `test:integration` only runs integration tests)
   - Add `@openai/agents` or `openai` as an **optional** dependency (only needed if LLM fallback is used) — keep as `optionalDependencies` so install doesn't fail if not used
   - Add `"test:unit": "node src/tests/nlpServiceTest.js && node src/tests/chatServiceTest.js"`

10. **`backend/src/db/connection.js`**
    - No changes needed (the `query` and `withTransaction` functions are already generic)

11. **`README.md`** (root)
    - Add a **Chatbot** section documenting the feature, how to use it, intent list, and how to enable LLM fallback (set `OPENAI_API_KEY`)

## Functions

### New Functions

1. **`classifyIntent(message)`** in `backend/src/services/chatNlpService.js`
   - Signature: `classifyIntent(text: string) => { intent, confidence, entities, fallback }`
   - Uses `compromise` to normalize text, then matches against keyword patterns per intent
   - Returns the best-matching intent with confidence score and extracted entities
   - `fallback: true` when no intent matches above a confidence threshold (e.g. 0.3)

2. **`extractEntities(doc, intent, text)`** in `backend/src/services/chatNlpService.js`
   - Signature: `extractEntities(text: string, intent: string) => object`
   - Extracts entities relevant to the intent: product, store, journeyStage, sentiment, severity, status, owner, source
   - Uses `ASPECT_KEYWORDS` from `sentimentLexicon.js` for product/aspect detection
   - Maps journey-stage keywords from `categorizationService.js`

3. **`handleChat(query, sessionId)`** in `backend/src/services/chatService.js`
   - Signature: `handleChat(message: string, sessionId: string) => Promise<{ reply, intent, confidence, data }>`
   - Main entry point: classify intent → query data → generate response → store history
   - If `fallback` is true and OpenAI key is set → calls `llmFallbackService.generateLlmResponse` with dashboard context
   - Manages in-memory session history (append user message + bot reply)

4. **`generateResponse(intent, data, entities)`** in `backend/src/services/chatService.js`
   - Signature: `generateResponse(intent: string, data: any, entities: object) => string`
   - Template-based natural language response generator
   - Formats counts, lists, sentiment distributions into readable text
   - E.g., "I found 9 feedback items. 6 are negative, 3 are positive."

5. **`generateLlmResponse(message, contextData, intentClassif)`** in `backend/src/services/llmFallbackService.js`
   - Signature: `generateLlmResponse(message: string, context: object, classification: object) => Promise<string>`
   - Only invoked when `OPENAI_API_KEY` is set and rule-based classification fails
   - Sends a system prompt describing available dashboard data + the user's question
   - Returns the LLM-generated reply string

6. **`saveChatMessage(sessionId, sender, message, intent, confidence, data)`** in `backend/src/services/chatHistoryService.js`
   - Signature: `saveChatMessage(sessionId: string, sender: "user"|"bot", message: string, intent: string|null, confidence: number|null, data: object|null) => Promise<void>`
   - In JSON mode: appends to `data/chatHistory.json` array
   - In Postgres mode: INSERT into `chat_messages` table

7. **`getChatHistory(sessionId, limit?)`** in `backend/src/services/chatHistoryService.js`
   - Signature: `getChatHistory(sessionId: string, limit?: number) => Promise<ChatMessage[]>`
   - Loads recent messages for a session from JSON or Postgres

8. **`createSession()`** in `backend/src/services/chatHistoryService.js`
   - Signature: `createSession() => string`
   - Generates a new UUID session ID and initializes an in-memory session

### New Router Functions

9. **`POST /api/chat`** handler in `backend/src/routes/chat.js`
   - Accepts `{ message, sessionId }`
   - Creates session if none provided
   - Calls `handleChat(message, sessionId)`
   - Persists both user message and bot reply via `saveChatMessage`
   - Returns `{ reply, intent, confidence, sessionId, data }`

10. **`GET /api/chat/history/:sessionId`** handler in `backend/src/routes/chat.js`
    - Returns recent chat history for a session

### Modified Functions

- **No existing functions are modified.** The chatbot is a new layer that consumes existing exported functions (`getFeedback`, `getThemes`, `getActions`, `detectSpikes`, `clusterThemes`) without changing their signatures or behavior. The `overview` route handler in `backend/src/routes/overview.js` already provides the aggregate data the `overview` intent will use.

### Removed Functions
- None. This is purely additive.

## Classes

No new classes are required. The codebase uses functional JavaScript modules with exported functions. The in-memory session store uses a simple `Map<string, Session>` managed by the chat service. The `compromise` library provides its `Doc` type internally, used within the NLP service functions.

## Dependencies

### New Dependencies

1. **`openai`** (optional, via `optionalDependencies` in `package.json`)
   - Version: `^4.0.0` or latest `^5.0.0`
   - Purpose: OpenAI API client for LLM fallback responses when `OPENAI_API_KEY` is set
   - Integration: Used only in `llmFallbackService.js`; all other functionality works without it
   - Rationale: Marked as `optionalDependencies` so `npm install` succeeds in environments without the key

### No Other Dependency Changes
- `compromise` (^14.0.0) is already in `backend/package.json` and will be reused for intent classification
- No new dev dependencies required
- `uuid` is already available and will be used for session/message IDs

## Testing

### New Test File: `backend/src/tests/chatServiceTest.js`

Unit tests following the existing pattern (`assert` helper, `passed`/`failed` counters, run via `node`):

1. **Intent classification**
   - "How many feedback items do we have?" → intent `count.feedback`
   - "Show me negative themes" → intent `themes.list` with entity `sentiment: negative`
   - "What are the pending actions?" → intent `actions.list` with entity `status: pending`
   - "Give me an overview" → intent `overview`
   - "help" → intent `help`
   - "What is the meaning of life?" → fallback `true`

2. **Entity extraction**
   - "feedback from store-42" → `{ store: "store-42" }`
   - "checkout issues" → `{ product: "checkout" }`
   - "delivery feedback" → `{ product: "delivery" }`

3. **Response generation**
   - Count intent returns a string containing the number
   - Overview intent returns a string with KPIs
   - Themes list intent returns theme count and top themes

4. **Session management**
   - `createSession()` returns a valid UUID-like string
   - Session history appends user + bot messages

### Validation Strategy
1. Run `node src/tests/chatServiceTest.js` in `backend/` for unit tests
2. Run `npm run test:integration` in `backend/` to verify the `/api/chat` endpoint works end-to-end
3. Manually test via the frontend chat widget in a browser
4. Verify chat history is persisted to `data/chatHistory.json`

## Implementation Order

1. Add `openai` to `optionalDependencies` in `backend/package.json` and add `test:unit` script
2. Add chat configuration to `backend/src/config/env.js` (OpenAI config, chat history settings)
3. Add `chat_messages` and `chat_sessions` tables to `backend/src/db/schema.sql`
4. Add `loadChatHistory` / `saveChatHistory` to `backend/src/services/storageService.js`
5. Create `data/chatHistory.json` (empty array `[]`) as a seed file
6. Create `backend/src/services/chatNlpService.js` (intent classification + entity extraction)
7. Create `backend/src/services/chatHistoryService.js` (session + persistence)
8. Create `backend/src/services/llmFallbackService.js` (optional OpenAI fallback)
9. Create `backend/src/services/chatService.js` (main orchestrator: classify → query → respond)
10. Create `backend/src/routes/chat.js` (Express router with POST `/api/chat` and GET `/api/chat/history/:sessionId`)
11. Register chat routes in `backend/src/index.js`
12. Create `frontend/chatWidget.js` (UI logic + API calls)
13. Create `frontend/chatWidget.css` (chat widget styling)
14. Update `frontend/index.html` (add chat widget container + script include)
15. Update `frontend/styles.css` (import/append chat styles)
16. Update `README.md` (add Chatbot documentation section)
17. Create `backend/src/tests/chatServiceTest.js` (unit tests)
18. Run unit tests (`node src/tests/chatServiceTest.js`) and integration tests (`npm run test:integration`)
19. Manually verify the chat widget in a browser
