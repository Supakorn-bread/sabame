CREATE TABLE "accounts" (
  "id" BIGINT NOT NULL,
  "profile" JSONB NOT NULL,
  "tokens" TEXT NOT NULL,
  "expires" BIGINT NOT NULL,
  "imported" BOOLEAN NOT NULL DEFAULT FALSE,
  "synced" TIMESTAMPTZ(3),
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
  "hash" TEXT NOT NULL,
  "user_id" BIGINT NOT NULL,
  "expires" BIGINT NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX "sessions_expires_idx" ON "sessions"("expires");

CREATE TABLE "oauth" (
  "hash" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "verifier" TEXT NOT NULL,
  "expires" BIGINT NOT NULL,
  CONSTRAINT "oauth_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX "oauth_expires_idx" ON "oauth"("expires");

CREATE TABLE "entries" (
  "user_id" BIGINT NOT NULL,
  "anime_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "entries_pkey" PRIMARY KEY ("user_id", "anime_id")
);

CREATE TABLE "operations" (
  "user_id" BIGINT NOT NULL,
  "id" TEXT NOT NULL,
  "anime_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "operations_pkey" PRIMARY KEY ("user_id", "id")
);
CREATE INDEX "operations_user_id_anime_id_idx" ON "operations"("user_id", "anime_id");

CREATE TABLE "leases" (
  "user_id" BIGINT NOT NULL,
  "owner" TEXT NOT NULL,
  "expires" BIGINT NOT NULL,
  CONSTRAINT "leases_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entries"
  ADD CONSTRAINT "entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operations"
  ADD CONSTRAINT "operations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
