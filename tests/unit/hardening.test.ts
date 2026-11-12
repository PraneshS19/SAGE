import { it, expect } from "vitest";
import { endpointInfo } from "../../src/lib/security";
import { references, citationDisplay, passages } from "../../src/lib/context";
import type { Source } from "../../src/lib/schema";
import { defaults } from "../../src/lib/schema";
import { migrateSettings } from "../../src/lib/storage";
it("preserves v1 settings and optional saved provider profiles", () => {
  const settings = migrateSettings({
    ...defaults,
    providerProfiles: {
      openrouter: {
        ...defaults.provider,
        kind: "openrouter",
        apiKey: "saved-key",
      },
    },
  });
  expect(settings.providerProfiles?.openrouter?.apiKey).toBe("saved-key");
  expect(settings.provider).toEqual(defaults.provider);
});
it("rejects fabricated and ambiguous references and removes model-supplied citation destinations", () => {
  const a: Source = {
    id: "s1",
    title: "Original",
    url: "https://original.test",
    kind: "page",
    passages: passages("Known fact", "s1"),
  };
  const id = a.passages[0]!.id;
  expect(
    citationDisplay(`[${id}](https://evil.test) [s1-p999-fake] [R999]`, [a]),
  ).toBe(
    `[${id}] [Unverified reference: s1-p999-fake] [Unverified reference: R999]`,
  );
  expect(
    references(`[${id}]`, [a, { ...a, title: "Conflicting duplicate" }])[0]
      ?.passage,
  ).toBeUndefined();
  expect(references("[s1]", [a])[0]?.source?.title).toBe("Original");
  expect(references("[s1-p999-fake]", [a])[0]?.passage).toBeUndefined();
});
it("never classifies DNS names beginning with private address prefixes as private IPs", () => {
  for (const host of [
    "10.attacker.example",
    "192.168.attacker.example",
    "172.16.attacker.example",
  ]) {
    expect(() => endpointInfo("http://" + host)).toThrow("HTTPS");
    expect(endpointInfo("https://" + host).location).toBe("Cloud");
  }
  expect(endpointInfo("http://10.1.2.3").location).toBe("Network");
});
