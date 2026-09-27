# Retail Voice of Customer Backend

## Overview
A lightweight backend scaffold for the VoC insight engine.

## Install
```bash
cd backend
npm install
```

## Run
```bash
cd backend
npm run dev
```

## API
- `GET /api/health`
- `POST /api/feedback/ingest` - ingest feedback items
- `GET /api/feedback` - list feedback
- `POST /api/themes/estimate` - estimate themes from items
- `GET /api/themes` - list generated themes

## Authentication
The backend supports OpenID Connect and local JSON-based role fallback for development.

- `REQUIRE_AUTH=false` disables strict token validation
- `LOCAL_AUTH_ENABLED=true` enables the local role fallback
- `LOCAL_ROLES_FILE` points to the JSON file with sample users and roles

Local JSON role fallback works with request headers:
- `x-local-user`
- `x-local-email`
- `x-local-roles`

## Feedback item schema
```json
{
  "id": "optional",
  "source": "reviews|social|ticket|survey",
  "origin": "same as source or raw source name",
  "timestamp": "ISO 8601 timestamp",
  "text": "feedback content",
  "rating": 4,
  "product": "SKU-123",
  "store": "store-001",
  "journeyStage": "checkout|delivery|experience",
  "metadata": {}
}
```
