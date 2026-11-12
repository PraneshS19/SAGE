import type { Provider, Settings } from "./schema";
import { FALLBACK_CONTEXT, modelIdentity } from "./inference-config";
export function modelProfile(provider: Provider) {
  return {
    contextWindow: provider.contextWindow,
    inference: provider.inference,
    capabilities: provider.capabilities,
  };
}
export function selectModel(settings: Settings, model: string): Provider {
  const target = { ...settings.provider, model };
  const saved = settings.modelProfiles?.[modelIdentity(target)];
  return {
    ...target,
    contextWindow: saved?.contextWindow ?? FALLBACK_CONTEXT,
    inference: saved?.inference,
    capabilities: saved?.capabilities,
  };
}
