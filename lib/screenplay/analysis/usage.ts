import type { AnthropicUsageLike } from "@/lib/credits/pricing";

export function mergeAnthropicUsage(a: AnthropicUsageLike, b: AnthropicUsageLike): AnthropicUsageLike {
  return {
    input_tokens: (a.input_tokens ?? 0) + (b.input_tokens ?? 0),
    output_tokens: (a.output_tokens ?? 0) + (b.output_tokens ?? 0),
    cache_creation_input_tokens:
      (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  };
}
