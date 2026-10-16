ALTER TABLE "ci_installations" ADD COLUMN "agent_slug" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_repo" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_pr_number" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_job_url" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_run_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_target_uq" ON "ci_installations" USING btree ("agent_id","repo","target_type");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_ci_run_key_uq" ON "agent_runs" USING btree ("ci_run_key");--> statement-breakpoint
CREATE INDEX "agent_runs_source_ran_at_idx" ON "agent_runs" USING btree ("source","ran_at");