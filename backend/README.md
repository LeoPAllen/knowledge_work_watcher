# Backend

The MVP backend validates schema version 1 and 2 events and appends accepted records
to local SQLite storage. It does not provide upload retries, participant
enrollment, event queries, deletion, ETL, or production authentication.

## Run

Requires Node.js 24 or newer for built-in SQLite support.

```sh
cp .env.example .env
set -a; source .env; set +a
npm run backend:start
```

Do not use the example token outside local development.

## Endpoints

- `GET /health`
- `GET /v1/schema/version`
- `POST /v1/events`
- `POST /v1/events/batch`

Ingestion requires `Authorization: Bearer <KWW_STUDY_TOKEN>`. Request and
response bodies are size-limited; accepted records include server receive time
and request ID. Raw payloads are not logged by default.
