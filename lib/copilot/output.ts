export type CopilotOutputItem =
  | {
      type: "ingredient";
      id: string;
      name: string;
      ingredientKind: string;
      refTag: string | null;
      status: string;
      generationError: string | null;
      assetUrl: string | null;
      createdAt: number;
      toolId?: string;
    }
  | {
      type: "sheet";
      id: string;
      name: string;
      characterName: string | null;
      costumeName: string | null;
      status: string;
      generationError: string | null;
      angleUrls: Record<string, string | null>;
      angleProgress: number;
      angleTotal: number;
      createdAt: number;
      toolId?: string;
    };

export type CopilotOutputEvent =
  | {
      type: "ingredient_created";
      toolId: string;
      ingredientId: string;
      name: string;
      ingredientKind: string;
      refTag?: string;
      status: string;
      generationError?: string | null;
    }
  | {
      type: "ingredient_updated";
      ingredientId: string;
      status: string;
      generationError?: string | null;
    }
  | {
      type: "sheet_created";
      toolId: string;
      sheetId: string;
      name: string;
      characterName?: string | null;
      costumeName?: string | null;
      status: string;
    }
  | {
      type: "sheet_progress";
      sheetId: string;
      step: number;
      total: number;
      angleLabel?: string;
    }
  | {
      type: "sheet_updated";
      sheetId: string;
      status: string;
      generationError?: string | null;
    };

export const MAX_COPILOT_OUTPUT_HISTORY = 12;

export type LibraryHighlight = {
  type: "ingredient" | "sheet";
  id: string;
} | null;
