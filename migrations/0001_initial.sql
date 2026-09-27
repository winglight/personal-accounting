PRAGMA foreign_keys = ON;

-- Better Auth core tables (schema generated from better-auth 1.7.x core models).
CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE COLLATE NOCASE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX "session_userId_idx" ON "session" ("userId");

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX "account_userId_idx" ON "account" ("userId");

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- Application tables: each domain object has its own relational table.
CREATE TABLE "financial_accounts" (
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('bank', 'securities', 'wechat', 'alipay', 'cash', 'other')),
  "currency" TEXT NOT NULL,
  "balance_minor" INTEGER NOT NULL DEFAULT 0,
  "is_main" INTEGER NOT NULL DEFAULT 0 CHECK ("is_main" IN (0, 1)),
  "exchange_rate" TEXT,
  "color" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("user_id", "id")
);
CREATE INDEX "financial_accounts_user_main_idx" ON "financial_accounts" ("user_id", "is_main");

CREATE TABLE "categories" (
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('income', 'expense')),
  "parent_id" TEXT,
  "icon" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("user_id", "id"),
  FOREIGN KEY ("user_id", "parent_id") REFERENCES "categories" ("user_id", "id") ON DELETE RESTRICT
);
CREATE INDEX "categories_user_type_parent_idx" ON "categories" ("user_id", "type", "parent_id", "sort_order");

CREATE TABLE "transactions" (
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "id" TEXT NOT NULL,
  "booked_date" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('income', 'expense', 'transfer')),
  "category_id" TEXT,
  "subcategory_id" TEXT,
  "amount_minor" INTEGER NOT NULL CHECK ("amount_minor" >= 0),
  "project" TEXT,
  "account_id" TEXT NOT NULL,
  "target_account_id" TEXT,
  "payer" TEXT,
  "note" TEXT,
  "receipt_id" TEXT,
  "receipt_item_index" INTEGER,
  "receipt_merchant" TEXT,
  "receipt_date" TEXT,
  "receipt_total_minor" INTEGER,
  "receipt_currency" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("user_id", "id"),
  FOREIGN KEY ("user_id", "account_id") REFERENCES "financial_accounts" ("user_id", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("user_id", "target_account_id") REFERENCES "financial_accounts" ("user_id", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("user_id", "category_id") REFERENCES "categories" ("user_id", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("user_id", "subcategory_id") REFERENCES "categories" ("user_id", "id") ON DELETE RESTRICT
);
CREATE INDEX "transactions_user_date_idx" ON "transactions" ("user_id", "booked_date" DESC, "created_at" DESC);
CREATE INDEX "transactions_user_type_date_idx" ON "transactions" ("user_id", "type", "booked_date" DESC);
CREATE INDEX "transactions_user_category_idx" ON "transactions" ("user_id", "category_id", "subcategory_id", "booked_date" DESC);
CREATE INDEX "transactions_user_account_idx" ON "transactions" ("user_id", "account_id", "booked_date" DESC);
CREATE INDEX "transactions_user_target_account_idx" ON "transactions" ("user_id", "target_account_id", "booked_date" DESC);

-- Keep account balances consistent with transaction mutations. These triggers run in
-- the same SQLite transaction as the row change, including two-sided transfers.
CREATE TRIGGER "transactions_after_insert_balance"
AFTER INSERT ON "transactions"
BEGIN
  UPDATE "financial_accounts"
  SET "balance_minor" = "balance_minor" + CASE
    WHEN NEW."type" = 'income' THEN NEW."amount_minor"
    ELSE -NEW."amount_minor"
  END,
  "updated_at" = NEW."updated_at"
  WHERE "user_id" = NEW."user_id" AND "id" = NEW."account_id";

  UPDATE "financial_accounts"
  SET "balance_minor" = "balance_minor" + NEW."amount_minor",
  "updated_at" = NEW."updated_at"
  WHERE NEW."type" = 'transfer'
    AND "user_id" = NEW."user_id"
    AND "id" = NEW."target_account_id";
END;

CREATE TRIGGER "transactions_after_update_balance"
AFTER UPDATE ON "transactions"
BEGIN
  UPDATE "financial_accounts"
  SET "balance_minor" = "balance_minor" - CASE
    WHEN OLD."type" = 'income' THEN OLD."amount_minor"
    ELSE -OLD."amount_minor"
  END,
  "updated_at" = NEW."updated_at"
  WHERE "user_id" = OLD."user_id" AND "id" = OLD."account_id";

  UPDATE "financial_accounts"
  SET "balance_minor" = "balance_minor" - OLD."amount_minor",
  "updated_at" = NEW."updated_at"
  WHERE OLD."type" = 'transfer'
    AND "user_id" = OLD."user_id"
    AND "id" = OLD."target_account_id";

  UPDATE "financial_accounts"
  SET "balance_minor" = "balance_minor" + CASE
    WHEN NEW."type" = 'income' THEN NEW."amount_minor"
    ELSE -NEW."amount_minor"
  END,
  "updated_at" = NEW."updated_at"
  WHERE "user_id" = NEW."user_id" AND "id" = NEW."account_id";

  UPDATE "financial_accounts"
  SET "balance_minor" = "balance_minor" + NEW."amount_minor",
  "updated_at" = NEW."updated_at"
  WHERE NEW."type" = 'transfer'
    AND "user_id" = NEW."user_id"
    AND "id" = NEW."target_account_id";
END;

CREATE TRIGGER "transactions_after_delete_balance"
AFTER DELETE ON "transactions"
BEGIN
  UPDATE "financial_accounts"
  SET "balance_minor" = "balance_minor" - CASE
    WHEN OLD."type" = 'income' THEN OLD."amount_minor"
    ELSE -OLD."amount_minor"
  END,
  "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE "user_id" = OLD."user_id" AND "id" = OLD."account_id";

  UPDATE "financial_accounts"
  SET "balance_minor" = "balance_minor" - OLD."amount_minor",
  "updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE OLD."type" = 'transfer'
    AND "user_id" = OLD."user_id"
    AND "id" = OLD."target_account_id";
END;

CREATE TABLE "transaction_attachments" (
  "user_id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "path" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  PRIMARY KEY ("user_id", "transaction_id", "position"),
  FOREIGN KEY ("user_id", "transaction_id") REFERENCES "transactions" ("user_id", "id") ON DELETE CASCADE
);

CREATE TABLE "exchange_rates" (
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "currency" TEXT NOT NULL,
  "rate" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("user_id", "currency")
);

CREATE TABLE "user_settings" (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "language" TEXT NOT NULL DEFAULT 'zh' CHECK ("language" IN ('zh', 'en')),
  "main_currency" TEXT NOT NULL DEFAULT 'CNY',
  "ai_enabled" INTEGER NOT NULL DEFAULT 0 CHECK ("ai_enabled" IN (0, 1)),
  "ai_api_url" TEXT NOT NULL,
  "ai_token" TEXT NOT NULL DEFAULT '',
  "ai_text_model" TEXT NOT NULL,
  "ai_image_model" TEXT NOT NULL,
  "ai_text_template" TEXT NOT NULL,
  "ai_image_template" TEXT NOT NULL,
  "last_sync_time" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);

CREATE TABLE "import_batches" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "source_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('processing', 'completed', 'failed')),
  "category_count" INTEGER NOT NULL DEFAULT 0,
  "account_count" INTEGER NOT NULL DEFAULT 0,
  "transaction_count" INTEGER NOT NULL DEFAULT 0,
  "exchange_rate_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "created_at" TEXT NOT NULL,
  "completed_at" TEXT,
  UNIQUE ("user_id", "source_hash")
);
CREATE INDEX "import_batches_user_created_idx" ON "import_batches" ("user_id", "created_at" DESC);
