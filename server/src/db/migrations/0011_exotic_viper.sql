ALTER TABLE "conventions" ADD COLUMN "category" text DEFAULT 'structure' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "rule_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "origin" text DEFAULT 'model' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conventions_repo_idx" ON "conventions" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "conventions_ws_idx" ON "conventions" USING btree ("workspace_id");