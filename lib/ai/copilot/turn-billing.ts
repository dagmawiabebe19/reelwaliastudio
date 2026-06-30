import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

export type PaidToolKind = "image" | "sheet";

export class TurnBillingState {
  anthropicBillable = false;
  usage?: Anthropic.Messages.Usage;
  private paidToolsInFlight: Array<{ kind: PaidToolKind; id: string }> = [];

  markAnthropicBillable(usage?: Anthropic.Messages.Usage): void {
    this.anthropicBillable = true;
    if (usage) {
      this.usage = usage;
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
