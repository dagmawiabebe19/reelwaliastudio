export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      assets: {
        Row: {
          id: string;
          owner_id: string;
          bucket: string;
          storage_path: string;
          media_type: Database["public"]["Enums"]["asset_media_type"];
          width: number | null;
          height: number | null;
          duration_ms: number | null;
          model: string | null;
          prompt: string | null;
          source: Database["public"]["Enums"]["asset_source"];
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          bucket: string;
          storage_path: string;
          media_type: Database["public"]["Enums"]["asset_media_type"];
          width?: number | null;
          height?: number | null;
          duration_ms?: number | null;
          model?: string | null;
          prompt?: string | null;
          source?: Database["public"]["Enums"]["asset_source"];
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          bucket?: string;
          storage_path?: string;
          media_type?: Database["public"]["Enums"]["asset_media_type"];
          width?: number | null;
          height?: number | null;
          duration_ms?: number | null;
          model?: string | null;
          prompt?: string | null;
          source?: Database["public"]["Enums"]["asset_source"];
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assets_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audio_lines: {
        Row: {
          id: string;
          episode_id: string;
          title: string;
          description: string | null;
          asset_id: string | null;
          ref_tag: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          title: string;
          description?: string | null;
          asset_id?: string | null;
          ref_tag: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          title?: string;
          description?: string | null;
          asset_id?: string | null;
          ref_tag?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audio_lines_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "episodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audio_lines_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      character_sheets: {
        Row: {
          id: string;
          series_id: string;
          character_id: string;
          costume_id: string | null;
          name: string;
          status: Database["public"]["Enums"]["character_sheet_status"];
          generation_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          series_id: string;
          character_id: string;
          costume_id?: string | null;
          name: string;
          status?: Database["public"]["Enums"]["character_sheet_status"];
          generation_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          series_id?: string;
          character_id?: string;
          costume_id?: string | null;
          name?: string;
          status?: Database["public"]["Enums"]["character_sheet_status"];
          generation_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      character_sheet_angles: {
        Row: {
          id: string;
          sheet_id: string;
          asset_id: string;
          angle_label: Database["public"]["Enums"]["sheet_angle"];
          created_at: string;
        };
        Insert: {
          id?: string;
          sheet_id: string;
          asset_id: string;
          angle_label: Database["public"]["Enums"]["sheet_angle"];
          created_at?: string;
        };
        Update: {
          id?: string;
          sheet_id?: string;
          asset_id?: string;
          angle_label?: Database["public"]["Enums"]["sheet_angle"];
          created_at?: string;
        };
        Relationships: [];
      };
      character_sheet_episodes: {
        Row: {
          sheet_id: string;
          episode_id: string;
          created_at: string;
        };
        Insert: {
          sheet_id: string;
          episode_id: string;
          created_at?: string;
        };
        Update: {
          sheet_id?: string;
          episode_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      scene_character_sheets: {
        Row: {
          scene_id: string;
          character_sheet_id: string;
          role: Database["public"]["Enums"]["scene_ingredient_role"];
          created_at: string;
        };
        Insert: {
          scene_id: string;
          character_sheet_id: string;
          role?: Database["public"]["Enums"]["scene_ingredient_role"];
          created_at?: string;
        };
        Update: {
          scene_id?: string;
          character_sheet_id?: string;
          role?: Database["public"]["Enums"]["scene_ingredient_role"];
          created_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: Database["public"]["Enums"]["chat_message_role"];
          content: string;
          tool_name: string | null;
          tool_args: Json | null;
          tool_result: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: Database["public"]["Enums"]["chat_message_role"];
          content?: string;
          tool_name?: string | null;
          tool_args?: Json | null;
          tool_result?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: Database["public"]["Enums"]["chat_message_role"];
          content?: string;
          tool_name?: string | null;
          tool_args?: Json | null;
          tool_result?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "chat_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_sessions: {
        Row: {
          id: string;
          scope_type: Database["public"]["Enums"]["chat_scope_type"];
          scope_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope_type: Database["public"]["Enums"]["chat_scope_type"];
          scope_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scope_type?: Database["public"]["Enums"]["chat_scope_type"];
          scope_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_balances: {
        Row: {
          user_id: string;
          available: number;
          reserved: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          available?: number;
          reserved?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          available?: number;
          reserved?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          balance_after: number;
          type: string;
          status: string;
          reservation_id: string | null;
          reference: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          balance_after: number;
          type: string;
          status?: string;
          reservation_id?: string | null;
          reference?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          balance_after?: number;
          type?: string;
          status?: string;
          reservation_id?: string | null;
          reference?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      episode_exports: {
        Row: {
          id: string;
          episode_id: string;
          asset_id: string | null;
          status: string;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          asset_id?: string | null;
          status?: string;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          asset_id?: string | null;
          status?: string;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "episode_exports_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "episodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "episode_exports_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      episodes: {
        Row: {
          id: string;
          series_id: string;
          title: string;
          logline: string | null;
          sort_order: number;
          status: Database["public"]["Enums"]["episode_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          series_id: string;
          title: string;
          logline?: string | null;
          sort_order?: number;
          status?: Database["public"]["Enums"]["episode_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          series_id?: string;
          title?: string;
          logline?: string | null;
          sort_order?: number;
          status?: Database["public"]["Enums"]["episode_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "episodes_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "series";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredients: {
        Row: {
          id: string;
          series_id: string;
          kind: Database["public"]["Enums"]["ingredient_kind"];
          name: string;
          description: string | null;
          primary_asset_id: string | null;
          ref_tag: string;
          metadata: Json;
          sort_order: number;
          character_id: string | null;
          generation_status: string;
          generation_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          series_id: string;
          kind: Database["public"]["Enums"]["ingredient_kind"];
          name: string;
          description?: string | null;
          primary_asset_id?: string | null;
          ref_tag: string;
          metadata?: Json;
          sort_order?: number;
          character_id?: string | null;
          generation_status?: string;
          generation_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          series_id?: string;
          kind?: Database["public"]["Enums"]["ingredient_kind"];
          name?: string;
          description?: string | null;
          primary_asset_id?: string | null;
          ref_tag?: string;
          metadata?: Json;
          sort_order?: number;
          character_id?: string | null;
          generation_status?: string;
          generation_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredients_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "series";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingredients_primary_asset_id_fkey";
            columns: ["primary_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scene_ingredients: {
        Row: {
          scene_id: string;
          ingredient_id: string;
          role: Database["public"]["Enums"]["scene_ingredient_role"];
          created_at: string;
        };
        Insert: {
          scene_id: string;
          ingredient_id: string;
          role?: Database["public"]["Enums"]["scene_ingredient_role"];
          created_at?: string;
        };
        Update: {
          scene_id?: string;
          ingredient_id?: string;
          role?: Database["public"]["Enums"]["scene_ingredient_role"];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scene_ingredients_scene_id_fkey";
            columns: ["scene_id"];
            isOneToOne: false;
            referencedRelation: "scenes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scene_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
        ];
      };
      scenes: {
        Row: {
          id: string;
          episode_id: string;
          title: string;
          prompt: string | null;
          shot_intent: string | null;
          orientation: Database["public"]["Enums"]["orientation"] | null;
          duration_seconds: number | null;
          act_label: string | null;
          position: number | null;
          status: Database["public"]["Enums"]["scene_status"];
          sort_order: number;
          resolved_references: Json;
          reference_overrides: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          title: string;
          prompt?: string | null;
          shot_intent?: string | null;
          orientation?: Database["public"]["Enums"]["orientation"] | null;
          duration_seconds?: number | null;
          act_label?: string | null;
          position?: number | null;
          status?: Database["public"]["Enums"]["scene_status"];
          sort_order?: number;
          resolved_references?: Json;
          reference_overrides?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          title?: string;
          prompt?: string | null;
          shot_intent?: string | null;
          orientation?: Database["public"]["Enums"]["orientation"] | null;
          duration_seconds?: number | null;
          act_label?: string | null;
          position?: number | null;
          status?: Database["public"]["Enums"]["scene_status"];
          sort_order?: number;
          resolved_references?: Json;
          reference_overrides?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenes_episode_id_fkey";
            columns: ["episode_id"];
            isOneToOne: false;
            referencedRelation: "episodes";
            referencedColumns: ["id"];
          },
        ];
      };
      series: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          slug: string;
          brief_markdown: string;
          memory_markdown: string;
          default_orientation: Database["public"]["Enums"]["orientation"];
          status: Database["public"]["Enums"]["series_status"];
          thumbnail_asset_id: string | null;
          runtime_seconds: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          slug: string;
          brief_markdown?: string;
          memory_markdown?: string;
          default_orientation?: Database["public"]["Enums"]["orientation"];
          status?: Database["public"]["Enums"]["series_status"];
          thumbnail_asset_id?: string | null;
          runtime_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          title?: string;
          slug?: string;
          brief_markdown?: string;
          memory_markdown?: string;
          default_orientation?: Database["public"]["Enums"]["orientation"];
          status?: Database["public"]["Enums"]["series_status"];
          thumbnail_asset_id?: string | null;
          runtime_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "series_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "series_thumbnail_asset_id_fkey";
            columns: ["thumbnail_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      takes: {
        Row: {
          id: string;
          scene_id: string;
          take_number: number;
          asset_id: string | null;
          media_type: Database["public"]["Enums"]["take_media_type"];
          model: string | null;
          resolution: string | null;
          duration_seconds: number | null;
          starred: boolean;
          status: Database["public"]["Enums"]["take_status"];
          error_message: string | null;
          has_audio: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          take_number?: number;
          asset_id?: string | null;
          media_type: Database["public"]["Enums"]["take_media_type"];
          model?: string | null;
          resolution?: string | null;
          duration_seconds?: number | null;
          starred?: boolean;
          status?: Database["public"]["Enums"]["take_status"];
          error_message?: string | null;
          has_audio?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string;
          take_number?: number;
          asset_id?: string | null;
          media_type?: Database["public"]["Enums"]["take_media_type"];
          model?: string | null;
          resolution?: string | null;
          duration_seconds?: number | null;
          starred?: boolean;
          status?: Database["public"]["Enums"]["take_status"];
          error_message?: string | null;
          has_audio?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "takes_scene_id_fkey";
            columns: ["scene_id"];
            isOneToOne: false;
            referencedRelation: "scenes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "takes_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      grant_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_type: string;
          p_reference?: string | null;
          p_metadata?: Json;
        };
        Returns: string;
      };
      reserve_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reference?: string | null;
          p_metadata?: Json;
        };
        Returns: string;
      };
      commit_reservation: {
        Args: {
          p_reservation_id: string;
          p_actual_amount: number;
        };
        Returns: undefined;
      };
      release_reservation: {
        Args: {
          p_reservation_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      asset_media_type: "image" | "video" | "audio";
      asset_source: "generated" | "uploaded";
      chat_message_role: "user" | "assistant" | "tool";
      chat_scope_type: "series" | "episode" | "scene";
      episode_status: "active" | "archived";
      ingredient_kind: "character" | "voice" | "outfit" | "location" | "reference" | "prop";
      orientation: "portrait" | "landscape";
      scene_ingredient_role: "identity_lock" | "reference";
      scene_status: "storyboard" | "active" | "archived";
      series_status: "in_progress" | "validated" | "released";
      take_media_type: "image" | "video";
      take_status: "draft" | "ready" | "archived" | "pending" | "failed";
      character_sheet_status: "draft" | "pending" | "ready" | "failed";
      sheet_angle: "front" | "left_profile" | "right_profile" | "three_quarter" | "back";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

export type Profile = Tables<"profiles">;
export type Project = Tables<"projects">;
export type Series = Tables<"series">;
export type Episode = Tables<"episodes">;
export type Scene = Tables<"scenes">;
export type Take = Tables<"takes">;
export type CharacterSheet = Tables<"character_sheets">;
export type CharacterSheetStatus = Enums<"character_sheet_status">;
export type SheetAngle = Enums<"sheet_angle">;
export type ChatSession = Tables<"chat_sessions">;
export type ChatMessage = Tables<"chat_messages">;
export type EpisodeExport = Tables<"episode_exports">;
export type ChatScopeType = Enums<"chat_scope_type">;
export type TakeStatus = Enums<"take_status">;
export type TakeMediaType = Enums<"take_media_type">;
export type Ingredient = Tables<"ingredients">;
export type AudioLine = Tables<"audio_lines">;
export type Asset = Tables<"assets">;
export type Orientation = Enums<"orientation">;
export type SeriesStatus = Enums<"series_status">;
export type EpisodeStatus = Enums<"episode_status">;
export type SceneStatus = Enums<"scene_status">;
export type IngredientKind = Enums<"ingredient_kind">;
export type AssetMediaType = Enums<"asset_media_type">;

export interface SeriesStats {
  episodeCount: number;
  ingredientCount: number;
  runtimeSeconds: number | null;
}
