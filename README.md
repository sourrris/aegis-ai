# Real-Time AI Risk Monitoring System

Production-grade distributed scaffold for real-time AI risk monitoring with FastAPI microservices, RabbitMQ event routing, Redis Pub/Sub WebSocket streaming, PostgreSQL persistence, TensorFlow anomaly detection, and React dashboard.

## Stack
- Backend: Python 3.11+, FastAPI, PostgreSQL, RabbitMQ, Redis, TensorFlow
- Frontend: React + TypeScript + Recharts + WebSocket client
- Infra: Docker + Docker Compose (optional), or native local services via Homebrew

## Services
- API Gateway: Auth, ingestion, model management proxy
- Event Worker: Consumes events, calls ML inference, persists results, emits alerts
- ML Inference: TensorFlow autoencoder train/infer + model version activation
- Notification Service: Rabbit alert consumer + Redis Pub/Sub + WebSocket fan-out
- Dashboard: React live monitoring UI

## Local Development (No Docker)
1. Run one-time setup (installs/starts PostgreSQL, Redis, RabbitMQ; creates `.venv`; installs backend + frontend dependencies):

```bash
./scripts/local/setup.sh
```

2. Start all backend services and dashboard:

```bash
./scripts/local/start.sh
```

3. Stop local app processes:

```bash
./scripts/local/stop.sh
```

4. URLs:
   - Dashboard `http://localhost:5173`
   - API docs `http://localhost:8000/docs`
   - Notification status `http://localhost:8020/v1/notifications/connections`
   - RabbitMQ UI `http://localhost:15672`

## Docker Quick Start
1. Copy `.env.example` to `.env` and set secrets.
2. Start services and auto-open local URLs in browser tabs:

```bash
./scripts/up-and-open.sh
```

3. Optional: if you override domains to non-`*.localhost` values in `.env`, add host mappings once:

```bash
./scripts/setup-local-domains.sh
```

4. The script opens:
   - Dashboard `http://app.localhost`
   - API docs `http://api.localhost/docs`
   - Notification status `http://ws.localhost/v1/notifications/connections`
   - RabbitMQ `http://localhost:15672` (`guest/guest`)

## Codex Web Environment
Use this when you want to continue working from any device in `chatgpt.com/codex`.

1. Open Codex and connect this GitHub repository.
2. Create an environment for this repo/branch.
3. Set runtimes:
   - Python `3.11` (or `3.12`)
   - Node.js `20`
4. Add environment variables/secrets from `.env.example`.
5. Use this setup script:

```bash
set -euo pipefail
python -m pip install --upgrade pip
python -m pip install -e backend/libs/common
python -m pip install -r backend/services/api_gateway/requirements.txt
python -m pip install -r backend/services/event_worker/requirements.txt
python -m pip install -r backend/services/ml_inference/requirements.txt
python -m pip install -r backend/services/notification_service/requirements.txt
npm ci --prefix frontend/dashboard
```

6. Start the stack inside Codex Web with:

```bash
docker compose up -d --build
```

## Default Demo Credentials
- username: `admin`
- password: `admin123`

## Docs
- Architecture and diagrams: `docs/architecture.md`
- Folder structure: `docs/folder-structure.md`

## Key Production Patterns Included
- Event-driven microservices via RabbitMQ
- Redis Pub/Sub-based real-time streaming
- JWT authentication
- Idempotent ingestion and processing controls
- Retry + dead-letter queue handling
- Structured JSON logging
- Health checks for orchestration
