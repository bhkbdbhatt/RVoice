# RVoice Requirements

This document defines the product requirements for RVoice, including MVP scope, supported data sources, the AI workflow, and privacy considerations.

## 1. MVP Prioritization

### Must Have (MVP)
| Requirement | Description | Priority |
|-------------|-------------|----------|
| Feedback Ingestion | Ingest feedback from multiple channels (Zendesk, Intercom, App Store, Generic API) | P0 |
| Sentiment Analysis | Classify feedback sentiment (positive / neutral / negative) with confidence | P0 |
| Theme Extraction | Group feedback into themes (e.g., pricing, delivery, app crashes) | P0 |
| Theme Clustering | Cluster related themes across products and journey stages | P0 |
| Spike Detection | Detect emerging issues based on issue score thresholds | P0 |
| Action Recommendations | Recommend actions per theme with assigned owners | P0 |
| Dashboard | Web dashboard showing overview, themes, actions, clusters, spikes | P0 |
| PII Masking | Detect and mask personally identifiable information in feedback | P0 |
| AI Insights | Prioritized list of top issues with recommended actions | P1 |

### Should Have (Post-MVP)
| Requirement | Description | Priority |
|-------------|-------------|----------|
| Trend Detection | Detect rising/falling themes over time windows | P1 |
| Semantic Clustering | Cluster themes by semantic similarity (TF-IDF + cosine) | P1 |
| AI Prioritization | Score issues by impact × frequency × sentiment | P1 |
| Chat Assistant | Conversational Q&A over feedback data | P1 |
| Role-Based Access | Admin, manager, analyst, ingest, viewer roles | P1 |

### Could Have (Future)
| Requirement | Description | Priority |
|-------------|-------------|----------|
| Real-Time Ingestion | WebSocket / streaming ingestion | P2 |
| Multi-Language Support | Sentiment and theme extraction in multiple languages | P2 |
| Export & Reporting | PDF/CSV export of insights | P2 |
| External AI Models | Optional OpenAI / transformer model integration | P2 |

## 2. Supported Data Sources / Channels

| Channel | Adapter | Status |
|---------|---------|--------|
| Zendesk | `zendeskAdapter` | ✅ Implemented |
| Intercom | `intercomAdapter` | ✅ Implemented |
| App Store Reviews | `appStoreAdapter` | ✅ Implemented |
| Generic API | `genericAdapter` | ✅ Implemented |
| Manual Entry | Dashboard ingest form | ✅ Implemented |

All channels normalize to the canonical schema before validation, deduplication, and persistence.

## 3. AI Workflow

```
Feedback Ingestion
        │
        ▼
┌─────────────────┐
│  PII Detection  │  Detect & mask emails, phones, names, addresses
│  & Masking      │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Sentiment       │  Rule-based lexicon + optional ML model
│ Analysis        │  → sentiment, score, confidence, aspects
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Theme           │  Keyword-based categorization
│ Extraction      │  → product, journeyStage, aspects
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Theme           │  Metadata clustering + semantic similarity
│ Clustering      │  → clusters with sentiment distribution
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Spike           │  Issue score threshold + trend detection
│ Detection       │  → emerging issues
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ AI              │  Prioritize issues by impact × frequency
│ Prioritization  │  → ranked recommendations with owners
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Dashboard &     │  Visualize insights, actions, chat assistant
│ Chat Assistant  │
└─────────────────┘
```

### AI Model Strategy (Hybrid)

| Capability | Primary (Rule-Based) | Optional (ML) |
|------------|---------------------|---------------|
| Sentiment | `compromise` + sentiment lexicon | `@xenova/transformers` (zero-shot) |
| Theme Extraction | Keyword categorization | — |
| Clustering | Metadata grouping | TF-IDF + cosine similarity |
| Detection | Issue score threshold | Trend-based (time windows) |
| Prioritization | Impact × frequency scoring | — |

The rule-based pipeline works offline with zero dependencies. The optional ML layer (`@xenova/transformers`) can be enabled via environment variable for improved accuracy.

## 4. Privacy Considerations

### PII Detection & Masking
- **Detected PII types**: email addresses, phone numbers, names, addresses, credit card numbers, IP addresses
- **Masking strategy**: Replace detected PII with masked placeholders (e.g., `[EMAIL]`, `[PHONE]`, `[NAME]`) before persistence
- **Flagging**: Store a `piiFlagged` boolean and `piiTypes` array on each feedback item for auditability
- **Config**: Enable/disable via `PII_MASKING_ENABLED` environment variable (default: `true`)

### Data Handling
- Feedback text is masked at ingestion time — raw PII is never persisted
- Customer email/name fields in the canonical schema are masked before storage
- Role-based access controls which users can view unmasked data (admin only)
- Audit trail: masked items are flagged so analysts know the original text was sanitized

### Compliance
- Aligns with GDPR / CCPA principles of data minimization
- PII masking happens before any AI processing
- No PII is sent to external AI models (masked text only)