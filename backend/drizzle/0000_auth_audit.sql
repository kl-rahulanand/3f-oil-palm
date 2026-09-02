-- Context is King: preserve Pulse's existing SQL names so this migration stays
-- compatible with the intentionally unchanged auth/audit runtime schema.
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "display_name" text DEFAULT '' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "roles" (
  "name" text PRIMARY KEY NOT NULL,
  "label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL REFERENCES "roles"("name") ON DELETE CASCADE,
  CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id", "role")
);
--> statement-breakpoint
CREATE TABLE "role_perms" (
  "role" text NOT NULL REFERENCES "roles"("name") ON DELETE CASCADE,
  "grant_type" text NOT NULL,
  "grant_id" text NOT NULL,
  CONSTRAINT "role_perms_role_grant_type_grant_id_pk" PRIMARY KEY("role", "grant_type", "grant_id")
);
--> statement-breakpoint
CREATE TABLE "user_scope" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "attribute" text NOT NULL,
  "value" text NOT NULL,
  CONSTRAINT "user_scope_user_id_attribute_value_pk" PRIMARY KEY("user_id", "attribute", "value")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "otp_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "otp_codes_user_idx" ON "otp_codes" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "jti" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "ua" text,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refresh_tokens_jti_unique" UNIQUE("jti"),
  CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "audit_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "ts" timestamp with time zone DEFAULT now() NOT NULL,
  "event_type" text NOT NULL,
  "user_id" uuid,
  "session_id" uuid,
  "conversation_id" uuid,
  "question" text,
  "selection" jsonb,
  "generated_sql" text,
  "objects_touched" text[],
  "response_class" text,
  "latency_ms" integer,
  "model_id" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "total_tokens" integer
);
--> statement-breakpoint
CREATE INDEX "audit_events_user_ts_idx" ON "audit_events" USING btree ("user_id", "ts");
