import { toModelOptions, type PricedModel } from "@/lib/model-label";

type ModelOption = string | { value: string; label: string };

/**
 * Dropdown options for the model picker, with the agent's CURRENT model pinned
 * to the front when the provider's list doesn't contain it — otherwise editing
 * an agent whose model was retired (or whose provider key is missing) would
 * silently show a different model as selected.
 */
export function modelOptionsFor(
  models: PricedModel[] | undefined,
  currentModel: string,
): ModelOption[] {
  const options = toModelOptions(models);
  const listed = options.some((o) => (typeof o === "string" ? o : o.value) === currentModel);
  return listed ? options : [currentModel, ...options];
}
