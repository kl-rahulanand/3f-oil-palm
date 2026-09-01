DELETE FROM "users";
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "username" TO "email";
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "active" TO "is_active";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "must_reset";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_username_key'
      AND conrelid = '"users"'::regclass
  ) THEN
    ALTER TABLE "users" RENAME CONSTRAINT "users_username_key" TO "users_email_key";
  END IF;
END $$;
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
