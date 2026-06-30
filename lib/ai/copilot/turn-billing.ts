import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

export type PaidToolKind = "image" | "sheet";

function addUsage(
  current: Anthropic.Messages.Usage | undefined,
  next: Anthropic.Messages.Usage,
): Anthropic.Messages.Usage {
  return {
    ...next,
    input_tokens: (current?.input_tokens ?? 0) + (next.input_tokens ?? 0),
    output_tokens: (current?.output_tokens ?? 0) + (next.output_tokens ?? 0),
    cache_creation_input_tokens:
      (current?.cache_creation_input_tokens ?? 0) + (next.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (current?.cache_read_input_tokens ?? 0) + (next.cache_read_input_tokens ?? 0),
  };
}

export class TurnBillingState {
  anthropicBillable = false;
  usage?: Anthropic.Messages.Usage;
  private paidToolsInFlight: Array<{ kind: PaidToolKind; id: string }> = [];

  markAnthropicBillable(usage?: Anthropic.Messages.Usage): void {
    this.anthropicBillable = true;
    if (usage) {
      this.usage = addUsage(this.usage, usage);
    }
  }

  markPaidToolStarted(kind: PaidToolKind, id: string): void {
    this.paidToolsInFlight.push({ kind, id });
  }

  get inFlightNote(): string | undefined {
    if (this.paidToolsInFlight.length === 0) return undefined;
    return "A generation already in progress will still complete.";
  }
}
