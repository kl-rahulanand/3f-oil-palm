CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  must_reset    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS roles (
  name  TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS role_perms (
  role       TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  grant_type TEXT NOT NULL,
  grant_id   TEXT NOT NULL,
  PRIMARY KEY (role, grant_type, grant_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_scope (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (user_id, attribute, value)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT UNIQUE NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_events (
  id             BIGSERIAL PRIMARY KEY,
  ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type     TEXT NOT NULL,
  user_id        UUID,
  session_id     UUID,
  question       TEXT,
  selection      JSONB,
  generated_sql  TEXT,
  objects_touched TEXT[],
  response_class TEXT,
  latency_ms     INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_events_user_ts_idx ON audit_events(user_id, ts);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS saved_queries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selection  JSONB NOT NULL,
  chart_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dashboard_pins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selection       JSONB NOT NULL,
  chart_type      TEXT,
  refresh_cadence TEXT,
  last_refresh    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
