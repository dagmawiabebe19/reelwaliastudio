import "server-only";

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface CopilotResponse {
  message: string;
  toolCalls: CopilotToolCall[];
}

export async function runCopilot(messages: CopilotMessage[]): Promise<CopilotResponse> {
  void messages;
  void process.env.ANTHROPIC_API_KEY;
  throw new Error("copilot: not implemented — TODO wire Anthropic tool-use API");
}
