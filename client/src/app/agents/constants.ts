import type { Provider } from "@devdigest/shared";

/**
 * Providers selectable in the agent editor and the create-agent modal — the two
 * places that used to keep their own copy of this list.
 *
 * Deliberately a literal rather than `Provider.options` off the shared zod
 * enum: the client imports **types only** from `@devdigest/shared`, so reaching
 * for the schema value would pull the whole zod runtime into this route's
 * bundle to save three strings. `satisfies` keeps the list honest instead.
 */
export const PROVIDER_OPTIONS = [
  "openai",
  "anthropic",
  "openrouter",
] as const satisfies readonly Provider[];
