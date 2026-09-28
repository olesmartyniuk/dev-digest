import { and, eq } from 'drizzle-orm';
import { FeatureModelChoice } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { FEATURE_MODELS_SETTING_KEY, FEATURE_MODEL_ID } from './constants.js';

/**
 * Intent (L03) settings access. Owns nothing but a read of `settings` for
 * this feature's model override.
 *
 * Reading `settings` here rather than calling the settings module's
 * `getFeatureModelOverride` is deliberate: a module may not reach into
 * another module's folder (`no-cross-module-reach`) — see
 * `conventions/repository.ts` for the same rule applied to the same need.
 * `pr_intent` persistence itself lives in `ReviewRepository` (the composition
 * root already owns cross-cutting pull/review entities), not here.
 */
export class IntentRepository {
  constructor(private db: Db) {}

  /** The workspace's model override for the `review_intent` feature, if any. */
  async featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(
        and(
          eq(t.settings.workspaceId, workspaceId),
          eq(t.settings.key, FEATURE_MODELS_SETTING_KEY),
        ),
      );
    const bag = row?.value as Record<string, unknown> | null | undefined;
    const parsed = FeatureModelChoice.safeParse(bag?.[FEATURE_MODEL_ID]);
    return parsed.success ? parsed.data : undefined;
  }
}
