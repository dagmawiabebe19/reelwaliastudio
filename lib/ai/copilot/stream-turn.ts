import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { CopilotAbortError, isAbortError, throwIfAborted } from "@/lib/ai/copilot/abort";
import type { TurnBillingState } from "@/lib/ai/copilot/turn-billing";

export async function streamAnthropicTurn(input: {
  client: Anthropic;
  model: string;
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  abortSignal?: AbortSignal;
  onText: (text: string) => void;
  billing: TurnBillingState;
}): Promise<Anthropic.Message> {
  throwIfAborted(input.abortSignal);

  let partialUsage: Anthropic.Messages.Usage | undefined;

  const stream = input.client.messages.stream(
    {
      model: input.model,
      max_tokens: 4096,
      system: input.system,
      tools: input.tools,
      messages: input.messages,
    },
    { signal: input.abortSignal },
  );

  stream.on("text", (text) => {
    input.billing.markAnthropicBillable();
    input.onText(text);
  });

  stream.on("message", (message) => {
    if (message.usage) {
      partialUsage = message.usage;
    }
  });

  try {
    const response = await stream.finalMessage();
    input.billing.markAnthropicBillable(response.usage);
    return response;
  } catch (error) {
    if (isAbortError(error) || input.abortSignal?.aborted) {
      input.billing.markAnthropicBillable(partialUsage);
      throw new CopilotAbortError();
    }
    throw error;
  }
}
