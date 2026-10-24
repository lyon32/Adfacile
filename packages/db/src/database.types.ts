export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          currency: string | null;
          has_payment_method: boolean | null;
          id: string;
          is_active: boolean;
          meta_ad_account_id: string;
          meta_connection_id: string;
          name: string | null;
          vat_country: string | null;
          workspace_id: string;
        };
        Insert: {
          currency?: string | null;
          has_payment_method?: boolean | null;
          id?: string;
          is_active?: boolean;
          meta_ad_account_id: string;
          meta_connection_id: string;
          name?: string | null;
          vat_country?: string | null;
          workspace_id: string;
        };
        Update: {
          currency?: string | null;
          has_payment_method?: boolean | null;
          id?: string;
          is_active?: boolean;
          meta_ad_account_id?: string;
          meta_connection_id?: string;
          name?: string | null;
          vat_country?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ad_accounts_meta_connection_id_fkey';
            columns: ['meta_connection_id'];
            isOneToOne: false;
            referencedRelation: 'meta_connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ad_accounts_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      ads: {
        Row: {
          campaign_id: string;
          format: string | null;
          id: string;
          meta_ad_id: string | null;
          meta_creative_id: string | null;
          status: string | null;
          variant: string | null;
          visual_id: string | null;
          workspace_id: string;
        };
        Insert: {
          campaign_id: string;
          format?: string | null;
          id?: string;
          meta_ad_id?: string | null;
          meta_creative_id?: string | null;
          status?: string | null;
          variant?: string | null;
          visual_id?: string | null;
          workspace_id: string;
        };
        Update: {
          campaign_id?: string;
          format?: string | null;
          id?: string;
          meta_ad_id?: string | null;
          meta_creative_id?: string | null;
          status?: string | null;
          variant?: string | null;
          visual_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ads_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ads_visual_id_fkey';
            columns: ['visual_id'];
            isOneToOne: false;
            referencedRelation: 'visuals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ads_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_runs: {
        Row: {
          agent: string;
          attempts: number | null;
          cost_usd: number | null;
          created_at: string;
          error_code: string | null;
          id: string;
          input: Json | null;
          latency_ms: number | null;
          model: string;
          output: Json | null;
          prompt_version: string;
          provider: string | null;
          requested_model: string | null;
          retried: boolean;
          tokens_in: number | null;
          tokens_out: number | null;
          valid_schema: boolean;
          workspace_id: string | null;
        };
        Insert: {
          agent: string;
          attempts?: number | null;
          cost_usd?: number | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          input?: Json | null;
          latency_ms?: number | null;
          model: string;
          output?: Json | null;
          prompt_version: string;
          provider?: string | null;
          requested_model?: string | null;
          retried?: boolean;
          tokens_in?: number | null;
          tokens_out?: number | null;
          valid_schema: boolean;
          workspace_id?: string | null;
        };
        Update: {
          agent?: string;
          attempts?: number | null;
          cost_usd?: number | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          input?: Json | null;
          latency_ms?: number | null;
          model?: string;
          output?: Json | null;
          prompt_version?: string;
          provider?: string | null;
          requested_model?: string | null;
          retried?: boolean;
          tokens_in?: number | null;
          tokens_out?: number | null;
          valid_schema?: boolean;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_runs_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      analyses: {
        Row: {
          blocked_reason: string | null;
          business_profile_id: string | null;
          created_at: string;
          created_by: string | null;
          error_code: string | null;
          flags: string[];
          id: string;
          page_id: string | null;
          source_ids: string[];
          status: string;
          unreadable_sources: number[];
          updated_at: string;
          user_intent: string | null;
          workspace_id: string;
        };
        Insert: {
          blocked_reason?: string | null;
          business_profile_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          error_code?: string | null;
          flags?: string[];
          id?: string;
          page_id?: string | null;
          source_ids?: string[];
          status?: string;
          unreadable_sources?: number[];
          updated_at?: string;
          user_intent?: string | null;
          workspace_id: string;
        };
        Update: {
          blocked_reason?: string | null;
          business_profile_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          error_code?: string | null;
          flags?: string[];
          id?: string;
          page_id?: string | null;
          source_ids?: string[];
          status?: string;
          unreadable_sources?: number[];
          updated_at?: string;
          user_intent?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'analyses_business_profile_id_fkey';
            columns: ['business_profile_id'];
            isOneToOne: false;
            referencedRelation: 'business_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'analyses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'analyses_page_id_fkey';
            columns: ['page_id'];
            isOneToOne: false;
            referencedRelation: 'pages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'analyses_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      api_idempotency_keys: {
        Row: {
          body_hash: string;
          created_at: string;
          expires_at: string;
          key: string;
          response_body: Json | null;
          response_status: number | null;
          route: string;
          state: string;
          workspace_id: string;
        };
        Insert: {
          body_hash: string;
          created_at?: string;
          expires_at?: string;
          key: string;
          response_body?: Json | null;
          response_status?: number | null;
          route: string;
          state?: string;
          workspace_id: string;
        };
        Update: {
          body_hash?: string;
          created_at?: string;
          expires_at?: string;
          key?: string;
          response_body?: Json | null;
          response_status?: number | null;
          route?: string;
          state?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'api_idempotency_keys_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      attachments: {
        Row: {
          file_path: string;
          id: string;
          mime: string;
          size: number;
          ticket_message_id: string;
          workspace_id: string;
        };
        Insert: {
          file_path: string;
          id?: string;
          mime: string;
          size: number;
          ticket_message_id: string;
          workspace_id: string;
        };
        Update: {
          file_path?: string;
          id?: string;
          mime?: string;
          size?: number;
          ticket_message_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attachments_ticket_message_id_fkey';
            columns: ['ticket_message_id'];
            isOneToOne: false;
            referencedRelation: 'ticket_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attachments_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      blog_posts: {
        Row: {
          body_md: string;
          description: string | null;
          id: string;
          keywords: string[];
          locale: string;
          published_at: string | null;
          slug: string;
          status: string;
          title: string;
        };
        Insert: {
          body_md: string;
          description?: string | null;
          id?: string;
          keywords?: string[];
          locale: string;
          published_at?: string | null;
          slug: string;
          status?: string;
          title: string;
        };
        Update: {
          body_md?: string;
          description?: string | null;
          id?: string;
          keywords?: string[];
          locale?: string;
          published_at?: string | null;
          slug?: string;
          status?: string;
          title?: string;
        };
        Relationships: [];
      };
      brand_kits: {
        Row: {
          colors: NonNullable<Json>;
          font: string | null;
          logo_path: string | null;
          page_id: string;
          phone: string | null;
          show_number_on_visuals: boolean;
          tagline: string | null;
          tone: string | null;
          updated_at: string;
          whatsapp: string | null;
          workspace_id: string;
        };
        Insert: {
          colors?: NonNullable<Json>;
          font?: string | null;
          logo_path?: string | null;
          page_id: string;
          phone?: string | null;
          show_number_on_visuals?: boolean;
          tagline?: string | null;
          tone?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
          workspace_id: string;
        };
        Update: {
          colors?: NonNullable<Json>;
          font?: string | null;
          logo_path?: string | null;
          page_id?: string;
          phone?: string | null;
          show_number_on_visuals?: boolean;
          tagline?: string | null;
          tone?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'brand_kits_page_id_fkey';
            columns: ['page_id'];
            isOneToOne: true;
            referencedRelation: 'pages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brand_kits_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      business_profiles: {
        Row: {
          answers: NonNullable<Json>;
          conflicts: NonNullable<Json>;
          created_at: string;
          flags: string[];
          id: string;
          page_id: string | null;
          profile: NonNullable<Json>;
          questions: NonNullable<Json>;
          sensitive_signals: string[];
          version: number;
          workspace_id: string;
        };
        Insert: {
          answers?: NonNullable<Json>;
          conflicts?: NonNullable<Json>;
          created_at?: string;
          flags?: string[];
          id?: string;
          page_id?: string | null;
          profile: NonNullable<Json>;
          questions?: NonNullable<Json>;
          sensitive_signals?: string[];
          version?: number;
          workspace_id: string;
        };
        Update: {
          answers?: NonNullable<Json>;
          conflicts?: NonNullable<Json>;
          created_at?: string;
          flags?: string[];
          id?: string;
          page_id?: string | null;
          profile?: NonNullable<Json>;
          questions?: NonNullable<Json>;
          sensitive_signals?: string[];
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_profiles_page_id_fkey';
            columns: ['page_id'];
            isOneToOne: false;
            referencedRelation: 'pages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_profiles_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      campaign_proposals: {
        Row: {
          agent_run_id: string | null;
          campaign_id: string;
          chosen: boolean;
          created_at: string;
          created_by: string | null;
          error_code: string | null;
          id: string;
          idempotency_key: string | null;
          proposal: NonNullable<Json>;
          status: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          agent_run_id?: string | null;
          campaign_id: string;
          chosen?: boolean;
          created_at?: string;
          created_by?: string | null;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string | null;
          proposal: NonNullable<Json>;
          status?: string;
          version: number;
          workspace_id: string;
        };
        Update: {
          agent_run_id?: string | null;
          campaign_id?: string;
          chosen?: boolean;
          created_at?: string;
          created_by?: string | null;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string | null;
          proposal?: NonNullable<Json>;
          status?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'campaign_proposals_agent_run_id_fkey';
            columns: ['agent_run_id'];
            isOneToOne: false;
            referencedRelation: 'agent_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaign_proposals_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaign_proposals_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaign_proposals_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      campaign_status_events: {
        Row: {
          ad_id: string | null;
          campaign_id: string;
          created_at: string;
          id: number;
          payload: Json | null;
          source: string;
          status: string;
          workspace_id: string;
        };
        Insert: {
          ad_id?: string | null;
          campaign_id: string;
          created_at?: string;
          id?: never;
          payload?: Json | null;
          source: string;
          status: string;
          workspace_id: string;
        };
        Update: {
          ad_id?: string | null;
          campaign_id?: string;
          created_at?: string;
          id?: never;
          payload?: Json | null;
          source?: string;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'campaign_status_events_ad_id_fkey';
            columns: ['ad_id'];
            isOneToOne: false;
            referencedRelation: 'ads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaign_status_events_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaign_status_events_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      campaigns: {
        Row: {
          ab_test: boolean;
          ad_account_id: string | null;
          analysis_id: string | null;
          chosen_proposal_version: number | null;
          copy: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          daily_budget_usd_cents: number | null;
          destination: string | null;
          editable: boolean;
          end_date: string | null;
          fx_currency: string | null;
          fx_rate_xaf: number | null;
          geo: NonNullable<Json>;
          id: string;
          meta_adset_id: string | null;
          meta_campaign_id: string | null;
          name: string;
          objective: string | null;
          optimization_goal: string | null;
          page_id: string | null;
          paused_at: string | null;
          platform: Database['public']['Enums']['platform'];
          publish_attempt: number;
          publish_error: Json | null;
          publish_idempotency_key: string | null;
          publish_phase: string;
          publish_ref: string | null;
          publish_started_at: string | null;
          published_at: string | null;
          quota_state: string;
          start_date: string | null;
          stats_refresh_requested_at: string | null;
          stats_sync_error: string | null;
          stats_synced_at: string | null;
          status: Database['public']['Enums']['campaign_status'];
          status_synced_at: string | null;
          targeting: NonNullable<Json>;
          tracking: Json | null;
          updated_at: string;
          vat_rate: number | null;
          version: number;
          visual_brief: string | null;
          workspace_id: string;
        };
        Insert: {
          ab_test?: boolean;
          ad_account_id?: string | null;
          analysis_id?: string | null;
          chosen_proposal_version?: number | null;
          copy?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          daily_budget_usd_cents?: number | null;
          destination?: string | null;
          editable?: boolean;
          end_date?: string | null;
          fx_currency?: string | null;
          fx_rate_xaf?: number | null;
          geo?: NonNullable<Json>;
          id?: string;
          meta_adset_id?: string | null;
          meta_campaign_id?: string | null;
          name: string;
          objective?: string | null;
          optimization_goal?: string | null;
          page_id?: string | null;
          paused_at?: string | null;
          platform?: Database['public']['Enums']['platform'];
          publish_attempt?: number;
          publish_error?: Json | null;
          publish_idempotency_key?: string | null;
          publish_phase?: string;
          publish_ref?: string | null;
          publish_started_at?: string | null;
          published_at?: string | null;
          quota_state?: string;
          start_date?: string | null;
          stats_refresh_requested_at?: string | null;
          stats_sync_error?: string | null;
          stats_synced_at?: string | null;
          status?: Database['public']['Enums']['campaign_status'];
          status_synced_at?: string | null;
          targeting?: NonNullable<Json>;
          tracking?: Json | null;
          updated_at?: string;
          vat_rate?: number | null;
          version?: number;
          visual_brief?: string | null;
          workspace_id: string;
        };
        Update: {
          ab_test?: boolean;
          ad_account_id?: string | null;
          analysis_id?: string | null;
          chosen_proposal_version?: number | null;
          copy?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          daily_budget_usd_cents?: number | null;
          destination?: string | null;
          editable?: boolean;
          end_date?: string | null;
          fx_currency?: string | null;
          fx_rate_xaf?: number | null;
          geo?: NonNullable<Json>;
          id?: string;
          meta_adset_id?: string | null;
          meta_campaign_id?: string | null;
          name?: string;
          objective?: string | null;
          optimization_goal?: string | null;
          page_id?: string | null;
          paused_at?: string | null;
          platform?: Database['public']['Enums']['platform'];
          publish_attempt?: number;
          publish_error?: Json | null;
          publish_idempotency_key?: string | null;
          publish_phase?: string;
          publish_ref?: string | null;
          publish_started_at?: string | null;
          published_at?: string | null;
          quota_state?: string;
          start_date?: string | null;
          stats_refresh_requested_at?: string | null;
          stats_sync_error?: string | null;
          stats_synced_at?: string | null;
          status?: Database['public']['Enums']['campaign_status'];
          status_synced_at?: string | null;
          targeting?: NonNullable<Json>;
          tracking?: Json | null;
          updated_at?: string;
          vat_rate?: number | null;
          version?: number;
          visual_brief?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'campaigns_ad_account_id_fkey';
            columns: ['ad_account_id'];
            isOneToOne: false;
            referencedRelation: 'ad_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaigns_analysis_id_fkey';
            columns: ['analysis_id'];
            isOneToOne: false;
            referencedRelation: 'analyses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaigns_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaigns_page_id_fkey';
            columns: ['page_id'];
            isOneToOne: false;
            referencedRelation: 'pages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaigns_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      countries: {
        Row: {
          active: boolean;
          code: string;
          currency: string;
          name_en: string;
          name_fr: string;
          timezone_default: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          currency: string;
          name_en: string;
          name_fr: string;
          timezone_default: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          currency?: string;
          name_en?: string;
          name_fr?: string;
          timezone_default?: string;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          admin_id: string | null;
          amount: number;
          bucket: Database['public']['Enums']['credit_bucket'];
          created_at: string;
          generation_job_id: string | null;
          id: number;
          kind: Database['public']['Enums']['credit_kind'];
          payment_id: string | null;
          period_end: string | null;
          reason: string | null;
          workspace_id: string;
        };
        Insert: {
          admin_id?: string | null;
          amount: number;
          bucket: Database['public']['Enums']['credit_bucket'];
          created_at?: string;
          generation_job_id?: string | null;
          id?: never;
          kind: Database['public']['Enums']['credit_kind'];
          payment_id?: string | null;
          period_end?: string | null;
          reason?: string | null;
          workspace_id: string;
        };
        Update: {
          admin_id?: string | null;
          amount?: number;
          bucket?: Database['public']['Enums']['credit_bucket'];
          created_at?: string;
          generation_job_id?: string | null;
          id?: never;
          kind?: Database['public']['Enums']['credit_kind'];
          payment_id?: string | null;
          period_end?: string | null;
          reason?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_ledger_admin_id_fkey';
            columns: ['admin_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      exchange_rates: {
        Row: {
          base: string;
          fetched_at: string;
          id: number;
          next_update_at: string | null;
          provider_updated_at: string | null;
          quote: string;
          rate: number;
          source: string;
        };
        Insert: {
          base?: string;
          fetched_at?: string;
          id?: never;
          next_update_at?: string | null;
          provider_updated_at?: string | null;
          quote: string;
          rate: number;
          source: string;
        };
        Update: {
          base?: string;
          fetched_at?: string;
          id?: never;
          next_update_at?: string | null;
          provider_updated_at?: string | null;
          quote?: string;
          rate?: number;
          source?: string;
        };
        Relationships: [];
      };
      generation_jobs: {
        Row: {
          capability: string;
          cost_usd_actual: number | null;
          count: number;
          created_by: string | null;
          credits_reserved: number;
          duration_s: number | null;
          error: string | null;
          fallback_accepted: boolean;
          fallback_offered: boolean;
          finished_at: string | null;
          id: string;
          level: Database['public']['Enums']['quality_level'];
          model_id: string;
          page_id: string | null;
          provider_request_ids: string[];
          queue_position: number | null;
          queued_at: string;
          started_at: string | null;
          status: Database['public']['Enums']['job_status'];
          workspace_id: string;
        };
        Insert: {
          capability: string;
          cost_usd_actual?: number | null;
          count?: number;
          created_by?: string | null;
          credits_reserved: number;
          duration_s?: number | null;
          error?: string | null;
          fallback_accepted?: boolean;
          fallback_offered?: boolean;
          finished_at?: string | null;
          id?: string;
          level: Database['public']['Enums']['quality_level'];
          model_id: string;
          page_id?: string | null;
          provider_request_ids?: string[];
          queue_position?: number | null;
          queued_at?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['job_status'];
          workspace_id: string;
        };
        Update: {
          capability?: string;
          cost_usd_actual?: number | null;
          count?: number;
          created_by?: string | null;
          credits_reserved?: number;
          duration_s?: number | null;
          error?: string | null;
          fallback_accepted?: boolean;
          fallback_offered?: boolean;
          finished_at?: string | null;
          id?: string;
          level?: Database['public']['Enums']['quality_level'];
          model_id?: string;
          page_id?: string | null;
          provider_request_ids?: string[];
          queue_position?: number | null;
          queued_at?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['job_status'];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'generation_jobs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'media_models';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_page_id_fkey';
            columns: ['page_id'];
            isOneToOne: false;
            referencedRelation: 'pages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'generation_jobs_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      help_articles: {
        Row: {
          body_md: string;
          category: string;
          id: string;
          locale: string;
          public: boolean;
          slug: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body_md: string;
          category: string;
          id?: string;
          locale: string;
          public?: boolean;
          slug: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body_md?: string;
          category?: string;
          id?: string;
          locale?: string;
          public?: boolean;
          slug?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          role: Database['public']['Enums']['member_role'];
          token_hash: string;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          role: Database['public']['Enums']['member_role'];
          token_hash: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          role?: Database['public']['Enums']['member_role'];
          token_hash?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      media_models: {
        Row: {
          aspect_ratios: string[];
          capabilities: string[];
          card: NonNullable<Json>;
          display_name: string;
          endpoint: string;
          id: string;
          max_references: number;
          provider_code: string;
          recommended_for: string[];
          sort_order: number;
          status: Database['public']['Enums']['model_status'];
          test_results: Json | null;
        };
        Insert: {
          aspect_ratios?: string[];
          capabilities: string[];
          card?: NonNullable<Json>;
          display_name: string;
          endpoint: string;
          id: string;
          max_references?: number;
          provider_code: string;
          recommended_for?: string[];
          sort_order?: number;
          status?: Database['public']['Enums']['model_status'];
          test_results?: Json | null;
        };
        Update: {
          aspect_ratios?: string[];
          capabilities?: string[];
          card?: NonNullable<Json>;
          display_name?: string;
          endpoint?: string;
          id?: string;
          max_references?: number;
          provider_code?: string;
          recommended_for?: string[];
          sort_order?: number;
          status?: Database['public']['Enums']['model_status'];
          test_results?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'media_models_provider_code_fkey';
            columns: ['provider_code'];
            isOneToOne: false;
            referencedRelation: 'media_providers';
            referencedColumns: ['code'];
          },
        ];
      };
      media_providers: {
        Row: {
          code: string;
          concurrency_limit: number;
          monthly_budget_usd: number;
          retention_hours: number;
          status: string;
        };
        Insert: {
          code: string;
          concurrency_limit: number;
          monthly_budget_usd?: number;
          retention_hours: number;
          status?: string;
        };
        Update: {
          code?: string;
          concurrency_limit?: number;
          monthly_budget_usd?: number;
          retention_hours?: number;
          status?: string;
        };
        Relationships: [];
      };
      meta_connections: {
        Row: {
          business_id: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          last_health_check: Json | null;
          scopes: string[];
          status: string;
          token_type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          business_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_health_check?: Json | null;
          scopes?: string[];
          status?: string;
          token_type: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_health_check?: Json | null;
          scopes?: string[];
          status?: string;
          token_type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meta_connections_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      model_quality_levels: {
        Row: {
          cost_usd: number;
          credits: number;
          credits_by_duration: Json | null;
          durations_allowed: number[] | null;
          est_seconds: number | null;
          level: Database['public']['Enums']['quality_level'];
          min_credits: number;
          min_margin: number;
          model_id: string;
          provider_params: NonNullable<Json>;
          unit: string;
        };
        Insert: {
          cost_usd: number;
          credits: number;
          credits_by_duration?: Json | null;
          durations_allowed?: number[] | null;
          est_seconds?: number | null;
          level: Database['public']['Enums']['quality_level'];
          min_credits: number;
          min_margin: number;
          model_id: string;
          provider_params: NonNullable<Json>;
          unit: string;
        };
        Update: {
          cost_usd?: number;
          credits?: number;
          credits_by_duration?: Json | null;
          durations_allowed?: number[] | null;
          est_seconds?: number | null;
          level?: Database['public']['Enums']['quality_level'];
          min_credits?: number;
          min_margin?: number;
          model_id?: string;
          provider_params?: NonNullable<Json>;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'model_quality_levels_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'media_models';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          email: boolean;
          in_app: boolean;
          profile_id: string;
          type: string;
        };
        Insert: {
          email?: boolean;
          in_app?: boolean;
          profile_id: string;
          type: string;
        };
        Update: {
          email?: boolean;
          in_app?: boolean;
          profile_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          emailed_at: string | null;
          id: string;
          link: string | null;
          profile_id: string;
          read_at: string | null;
          title: string;
          type: string;
          workspace_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          emailed_at?: string | null;
          id?: string;
          link?: string | null;
          profile_id: string;
          read_at?: string | null;
          title: string;
          type: string;
          workspace_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          emailed_at?: string | null;
          id?: string;
          link?: string | null;
          profile_id?: string;
          read_at?: string | null;
          title?: string;
          type?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      optimizer_recommendations: {
        Row: {
          action: string;
          campaign_id: string;
          confidence: number | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          evidence: string | null;
          id: string;
          message: string | null;
          params: Json | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          action: string;
          campaign_id: string;
          confidence?: number | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          evidence?: string | null;
          id?: string;
          message?: string | null;
          params?: Json | null;
          status?: string;
          workspace_id: string;
        };
        Update: {
          action?: string;
          campaign_id?: string;
          confidence?: number | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          evidence?: string | null;
          id?: string;
          message?: string | null;
          params?: Json | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'optimizer_recommendations_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'optimizer_recommendations_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'optimizer_recommendations_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      page_activations: {
        Row: {
          first_campaign_at: string | null;
          page_id: string;
          period_start: string;
          workspace_id: string;
        };
        Insert: {
          first_campaign_at?: string | null;
          page_id: string;
          period_start: string;
          workspace_id: string;
        };
        Update: {
          first_campaign_at?: string | null;
          page_id?: string;
          period_start?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'page_activations_page_id_fkey';
            columns: ['page_id'];
            isOneToOne: false;
            referencedRelation: 'pages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'page_activations_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      pages: {
        Row: {
          active: boolean;
          ad_address: string;
          ad_language: string;
          id: string;
          instagram_account_id: string | null;
          meta_page_id: string;
          name: string | null;
          pixel_ids: string[];
          whatsapp_linked: boolean;
          whatsapp_number: string | null;
          workspace_id: string;
        };
        Insert: {
          active?: boolean;
          ad_address?: string;
          ad_language?: string;
          id?: string;
          instagram_account_id?: string | null;
          meta_page_id: string;
          name?: string | null;
          pixel_ids?: string[];
          whatsapp_linked?: boolean;
          whatsapp_number?: string | null;
          workspace_id: string;
        };
        Update: {
          active?: boolean;
          ad_address?: string;
          ad_language?: string;
          id?: string;
          instagram_account_id?: string | null;
          meta_page_id?: string;
          name?: string | null;
          pixel_ids?: string[];
          whatsapp_linked?: boolean;
          whatsapp_number?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pages_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_proofs: {
        Row: {
          created_at: string;
          file_path: string;
          id: string;
          note: string | null;
          payment_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          transaction_ref: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          file_path: string;
          id?: string;
          note?: string | null;
          payment_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          transaction_ref: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          file_path?: string;
          id?: string;
          note?: string | null;
          payment_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          transaction_ref?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_proofs_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_proofs_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_proofs_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_xaf: number;
          created_at: string;
          credits_qty: number | null;
          fees_xaf: number;
          id: string;
          idempotency_key: string;
          method: string | null;
          paid_at: string | null;
          plan_code: string | null;
          provider: string;
          provider_checkout_id: string | null;
          provider_payment_id: string | null;
          purpose: Database['public']['Enums']['payment_purpose'];
          raw_webhook: Json | null;
          status: Database['public']['Enums']['payment_status'];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          amount_xaf: number;
          created_at?: string;
          credits_qty?: number | null;
          fees_xaf?: number;
          id?: string;
          idempotency_key: string;
          method?: string | null;
          paid_at?: string | null;
          plan_code?: string | null;
          provider?: string;
          provider_checkout_id?: string | null;
          provider_payment_id?: string | null;
          purpose: Database['public']['Enums']['payment_purpose'];
          raw_webhook?: Json | null;
          status?: Database['public']['Enums']['payment_status'];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          amount_xaf?: number;
          created_at?: string;
          credits_qty?: number | null;
          fees_xaf?: number;
          id?: string;
          idempotency_key?: string;
          method?: string | null;
          paid_at?: string | null;
          plan_code?: string | null;
          provider?: string;
          provider_checkout_id?: string | null;
          provider_payment_id?: string | null;
          purpose?: Database['public']['Enums']['payment_purpose'];
          raw_webhook?: Json | null;
          status?: Database['public']['Enums']['payment_status'];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_plan_code_fkey';
            columns: ['plan_code'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'payments_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          active: boolean;
          campaigns_per_period: number;
          code: string;
          features: NonNullable<Json>;
          max_members: number;
          max_pages: number;
          monthly_credits: number;
          price_xaf: number;
        };
        Insert: {
          active?: boolean;
          campaigns_per_period: number;
          code: string;
          features?: NonNullable<Json>;
          max_members: number;
          max_pages: number;
          monthly_credits: number;
          price_xaf: number;
        };
        Update: {
          active?: boolean;
          campaigns_per_period?: number;
          code?: string;
          features?: NonNullable<Json>;
          max_members?: number;
          max_pages?: number;
          monthly_credits?: number;
          price_xaf?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          city: string | null;
          country_code: string | null;
          created_at: string;
          currency_display: string;
          email: string;
          first_name: string | null;
          id: string;
          last_name: string | null;
          phone: string | null;
          theme: string;
          timezone: string;
          trial_used: boolean;
          ui_language: string;
          updated_at: string;
        };
        Insert: {
          city?: string | null;
          country_code?: string | null;
          created_at?: string;
          currency_display?: string;
          email: string;
          first_name?: string | null;
          id: string;
          last_name?: string | null;
          phone?: string | null;
          theme?: string;
          timezone?: string;
          trial_used?: boolean;
          ui_language?: string;
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          country_code?: string | null;
          created_at?: string;
          currency_display?: string;
          email?: string;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          phone?: string | null;
          theme?: string;
          timezone?: string;
          trial_used?: boolean;
          ui_language?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      provider_usage: {
        Row: {
          avg_gen_s: number | null;
          avg_wait_s: number | null;
          failures: number;
          month: string;
          provider_code: string;
          requests: number;
          spent_usd: number;
        };
        Insert: {
          avg_gen_s?: number | null;
          avg_wait_s?: number | null;
          failures?: number;
          month: string;
          provider_code: string;
          requests?: number;
          spent_usd?: number;
        };
        Update: {
          avg_gen_s?: number | null;
          avg_wait_s?: number | null;
          failures?: number;
          month?: string;
          provider_code?: string;
          requests?: number;
          spent_usd?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_usage_provider_code_fkey';
            columns: ['provider_code'];
            isOneToOne: false;
            referencedRelation: 'media_providers';
            referencedColumns: ['code'];
          },
        ];
      };
      publish_liability_acceptances: {
        Row: {
          accepted_at: string;
          accepted_by: string | null;
          clause_version: string;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string;
          accepted_by?: string | null;
          clause_version?: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string;
          accepted_by?: string | null;
          clause_version?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'publish_liability_acceptances_accepted_by_fkey';
            columns: ['accepted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'publish_liability_acceptances_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      reference_library: {
        Row: {
          active: boolean;
          file_path: string;
          format: string | null;
          id: string;
          notes: string | null;
          score: number | null;
          sector: string | null;
          style: string | null;
        };
        Insert: {
          active?: boolean;
          file_path: string;
          format?: string | null;
          id?: string;
          notes?: string | null;
          score?: number | null;
          sector?: string | null;
          style?: string | null;
        };
        Update: {
          active?: boolean;
          file_path?: string;
          format?: string | null;
          id?: string;
          notes?: string | null;
          score?: number | null;
          sector?: string | null;
          style?: string | null;
        };
        Relationships: [];
      };
      referrals: {
        Row: {
          id: string;
          referred_workspace_id: string;
          referrer_workspace_id: string;
          rewarded_at: string | null;
          status: string;
        };
        Insert: {
          id?: string;
          referred_workspace_id: string;
          referrer_workspace_id: string;
          rewarded_at?: string | null;
          status?: string;
        };
        Update: {
          id?: string;
          referred_workspace_id?: string;
          referrer_workspace_id?: string;
          rewarded_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'referrals_referred_workspace_id_fkey';
            columns: ['referred_workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referrals_referrer_workspace_id_fkey';
            columns: ['referrer_workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      rejections: {
        Row: {
          ad_id: string | null;
          campaign_id: string;
          created_at: string;
          fixed_and_republished: boolean;
          id: string;
          memory_pattern: string | null;
          meta_reason: string | null;
          report: Json | null;
          workspace_id: string;
        };
        Insert: {
          ad_id?: string | null;
          campaign_id: string;
          created_at?: string;
          fixed_and_republished?: boolean;
          id?: string;
          memory_pattern?: string | null;
          meta_reason?: string | null;
          report?: Json | null;
          workspace_id: string;
        };
        Update: {
          ad_id?: string | null;
          campaign_id?: string;
          created_at?: string;
          fixed_and_republished?: boolean;
          id?: string;
          memory_pattern?: string | null;
          meta_reason?: string | null;
          report?: Json | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rejections_ad_id_fkey';
            columns: ['ad_id'];
            isOneToOne: false;
            referencedRelation: 'ads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rejections_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rejections_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      routing_rules: {
        Row: {
          active: boolean;
          capability: string;
          fallback_model_id: string | null;
          max_wait_seconds: number;
          primary_model_id: string;
        };
        Insert: {
          active?: boolean;
          capability: string;
          fallback_model_id?: string | null;
          max_wait_seconds?: number;
          primary_model_id: string;
        };
        Update: {
          active?: boolean;
          capability?: string;
          fallback_model_id?: string | null;
          max_wait_seconds?: number;
          primary_model_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'routing_rules_fallback_model_id_fkey';
            columns: ['fallback_model_id'];
            isOneToOne: false;
            referencedRelation: 'media_models';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'routing_rules_primary_model_id_fkey';
            columns: ['primary_model_id'];
            isOneToOne: false;
            referencedRelation: 'media_models';
            referencedColumns: ['id'];
          },
        ];
      };
      sources: {
        Row: {
          created_at: string;
          expires_at: string | null;
          extracted_text: string | null;
          extractor: string | null;
          file_path: string | null;
          id: string;
          page_id: string | null;
          status: string;
          type: Database['public']['Enums']['source_type'];
          url: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          extracted_text?: string | null;
          extractor?: string | null;
          file_path?: string | null;
          id?: string;
          page_id?: string | null;
          status?: string;
          type: Database['public']['Enums']['source_type'];
          url?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          extracted_text?: string | null;
          extractor?: string | null;
          file_path?: string | null;
          id?: string;
          page_id?: string | null;
          status?: string;
          type?: Database['public']['Enums']['source_type'];
          url?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sources_page_id_fkey';
            columns: ['page_id'];
            isOneToOne: false;
            referencedRelation: 'pages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sources_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      stats_daily: {
        Row: {
          ad_id: string | null;
          campaign_id: string;
          clicks: number;
          cpm_usd_cents: number | null;
          ctr: number | null;
          date: string;
          frequency: number | null;
          impressions: number;
          pixel_events: Json | null;
          reach: number;
          result_type: string | null;
          results: number;
          spend_usd_cents: number;
          synced_at: string;
          workspace_id: string;
        };
        Insert: {
          ad_id?: string | null;
          campaign_id: string;
          clicks?: number;
          cpm_usd_cents?: number | null;
          ctr?: number | null;
          date: string;
          frequency?: number | null;
          impressions?: number;
          pixel_events?: Json | null;
          reach?: number;
          result_type?: string | null;
          results?: number;
          spend_usd_cents?: number;
          synced_at?: string;
          workspace_id: string;
        };
        Update: {
          ad_id?: string | null;
          campaign_id?: string;
          clicks?: number;
          cpm_usd_cents?: number | null;
          ctr?: number | null;
          date?: string;
          frequency?: number | null;
          impressions?: number;
          pixel_events?: Json | null;
          reach?: number;
          result_type?: string | null;
          results?: number;
          spend_usd_cents?: number;
          synced_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stats_daily_ad_id_fkey';
            columns: ['ad_id'];
            isOneToOne: false;
            referencedRelation: 'ads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stats_daily_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stats_daily_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      subscriptions: {
        Row: {
          created_at: string;
          grace_until: string | null;
          id: string;
          period_end: string;
          period_start: string;
          plan_code: string;
          status: Database['public']['Enums']['subscription_status'];
          trial_ends_at: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          grace_until?: string | null;
          id?: string;
          period_end: string;
          period_start: string;
          plan_code: string;
          status: Database['public']['Enums']['subscription_status'];
          trial_ends_at?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          grace_until?: string | null;
          id?: string;
          period_end?: string;
          period_start?: string;
          plan_code?: string;
          status?: Database['public']['Enums']['subscription_status'];
          trial_ends_at?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_plan_code_fkey';
            columns: ['plan_code'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'subscriptions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      ticket_messages: {
        Row: {
          author_id: string;
          author_type: string;
          body: string;
          created_at: string;
          emailed_at: string | null;
          id: string;
          ticket_id: string;
          workspace_id: string;
        };
        Insert: {
          author_id: string;
          author_type: string;
          body: string;
          created_at?: string;
          emailed_at?: string | null;
          id?: string;
          ticket_id: string;
          workspace_id: string;
        };
        Update: {
          author_id?: string;
          author_type?: string;
          body?: string;
          created_at?: string;
          emailed_at?: string | null;
          id?: string;
          ticket_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ticket_messages_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ticket_messages_ticket_id_fkey';
            columns: ['ticket_id'];
            isOneToOne: false;
            referencedRelation: 'tickets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ticket_messages_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      tickets: {
        Row: {
          category: string;
          created_at: string;
          created_by: string;
          id: string;
          status: Database['public']['Enums']['ticket_status'];
          subject: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          created_by: string;
          id?: string;
          status?: Database['public']['Enums']['ticket_status'];
          subject: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          status?: Database['public']['Enums']['ticket_status'];
          subject?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tickets_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tickets_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      uploads: {
        Row: {
          bucket: string;
          created_at: string;
          created_by: string | null;
          declared_mime: string;
          declared_size: number;
          expires_at: string;
          file_path: string;
          id: string;
          purpose: string;
          status: string;
          verified_at: string | null;
          verified_mime: string | null;
          verified_size: number | null;
          workspace_id: string;
        };
        Insert: {
          bucket: string;
          created_at?: string;
          created_by?: string | null;
          declared_mime: string;
          declared_size: number;
          expires_at: string;
          file_path: string;
          id?: string;
          purpose: string;
          status?: string;
          verified_at?: string | null;
          verified_mime?: string | null;
          verified_size?: number | null;
          workspace_id: string;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          created_by?: string | null;
          declared_mime?: string;
          declared_size?: number;
          expires_at?: string;
          file_path?: string;
          id?: string;
          purpose?: string;
          status?: string;
          verified_at?: string | null;
          verified_mime?: string | null;
          verified_size?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'uploads_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'uploads_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      usage_counters: {
        Row: {
          campaigns_published: number;
          generations_date: string | null;
          generations_today: number;
          period_start: string;
          workspace_id: string;
        };
        Insert: {
          campaigns_published?: number;
          generations_date?: string | null;
          generations_today?: number;
          period_start: string;
          workspace_id: string;
        };
        Update: {
          campaigns_published?: number;
          generations_date?: string | null;
          generations_today?: number;
          period_start?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usage_counters_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      vat_rates: {
        Row: {
          country_code: string;
          rate: number;
          source_url: string | null;
          valid_from: string;
          verified_at: string | null;
        };
        Insert: {
          country_code: string;
          rate: number;
          source_url?: string | null;
          valid_from?: string;
          verified_at?: string | null;
        };
        Update: {
          country_code?: string;
          rate?: number;
          source_url?: string | null;
          valid_from?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vat_rates_country_code_fkey';
            columns: ['country_code'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['code'];
          },
        ];
      };
      visual_references: {
        Row: {
          file_path: string | null;
          id: string;
          reference_id: string | null;
          source: string;
          takeaway: string | null;
          visual_id: string;
          workspace_id: string;
        };
        Insert: {
          file_path?: string | null;
          id?: string;
          reference_id?: string | null;
          source: string;
          takeaway?: string | null;
          visual_id: string;
          workspace_id: string;
        };
        Update: {
          file_path?: string | null;
          id?: string;
          reference_id?: string | null;
          source?: string;
          takeaway?: string | null;
          visual_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visual_references_visual_id_fkey';
            columns: ['visual_id'];
            isOneToOne: false;
            referencedRelation: 'visuals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visual_references_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      visuals: {
        Row: {
          chosen: boolean;
          created_at: string;
          files_deleted_at: string | null;
          files_expire_at: string | null;
          generation_job_id: string | null;
          id: string;
          kind: string;
          layers: NonNullable<Json>;
          page_id: string | null;
          render_paths: NonNullable<Json>;
          scene_path: string | null;
          spec: NonNullable<Json>;
          used_in_campaign: boolean;
          workspace_id: string;
        };
        Insert: {
          chosen?: boolean;
          created_at?: string;
          files_deleted_at?: string | null;
          files_expire_at?: string | null;
          generation_job_id?: string | null;
          id?: string;
          kind: string;
          layers?: NonNullable<Json>;
          page_id?: string | null;
          render_paths?: NonNullable<Json>;
          scene_path?: string | null;
          spec: NonNullable<Json>;
          used_in_campaign?: boolean;
          workspace_id: string;
        };
        Update: {
          chosen?: boolean;
          created_at?: string;
          files_deleted_at?: string | null;
          files_expire_at?: string | null;
          generation_job_id?: string | null;
          id?: string;
          kind?: string;
          layers?: NonNullable<Json>;
          page_id?: string | null;
          render_paths?: NonNullable<Json>;
          scene_path?: string | null;
          spec?: NonNullable<Json>;
          used_in_campaign?: boolean;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visuals_generation_job_id_fkey';
            columns: ['generation_job_id'];
            isOneToOne: false;
            referencedRelation: 'generation_jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visuals_page_id_fkey';
            columns: ['page_id'];
            isOneToOne: false;
            referencedRelation: 'pages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visuals_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_members: {
        Row: {
          invited_by: string | null;
          joined_at: string;
          profile_id: string;
          role: Database['public']['Enums']['member_role'];
          workspace_id: string;
        };
        Insert: {
          invited_by?: string | null;
          joined_at?: string;
          profile_id: string;
          role: Database['public']['Enums']['member_role'];
          workspace_id: string;
        };
        Update: {
          invited_by?: string | null;
          joined_at?: string;
          profile_id?: string;
          role?: Database['public']['Enums']['member_role'];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          referral_code: string | null;
          referred_by_workspace_id: string | null;
          status: Database['public']['Enums']['workspace_status'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          referral_code?: string | null;
          referred_by_workspace_id?: string | null;
          status?: Database['public']['Enums']['workspace_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          referral_code?: string | null;
          referred_by_workspace_id?: string | null;
          status?: Database['public']['Enums']['workspace_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspaces_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspaces_referred_by_workspace_id_fkey';
            columns: ['referred_by_workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      credit_balances: {
        Row: {
          balance: number | null;
          bucket: Database['public']['Enums']['credit_bucket'] | null;
          workspace_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_ledger_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      clear_login_failures: { Args: { p_key: string }; Returns: undefined };
      consume_credits: { Args: { job: string }; Returns: undefined };
      get_meta_token: {
        Args: { conn: string; ws: string };
        Returns: {
          key_id: string;
          sealed: string;
        }[];
      };
      hit_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_s: number };
        Returns: {
          allowed: boolean;
          hits: number;
          retry_after_s: number;
        }[];
      };
      login_lock_status: {
        Args: { p_key: string; p_now?: string };
        Returns: {
          failures: number;
          locked: boolean;
          retry_after_s: number;
        }[];
      };
      maintenance_status: { Args: Record<PropertyKey, never>; Returns: Json };
      purge_idempotency_keys: { Args: Record<PropertyKey, never>; Returns: number };
      record_login_failure: {
        Args: { p_key: string; p_now?: string };
        Returns: {
          failures: number;
          locked: boolean;
          retry_after_s: number;
        }[];
      };
      record_meta_webhook: { Args: { p_event_id: string; p_events: Json }; Returns: number };
      record_webhook_event: { Args: { p_event_id: string; p_provider: string }; Returns: boolean };
      release_credits: { Args: { amount?: number; job: string }; Returns: number };
      request_stats_refresh: {
        Args: { p_campaign: string; p_now: string; p_workspace: string };
        Returns: boolean;
      };
      reserve_credits: { Args: { job: string; needed: number; ws: string }; Returns: boolean };
      set_active_ad_account: { Args: { p_id: string; ws: string }; Returns: undefined };
      set_page_active: {
        Args: {
          max_pages: number;
          p_page: string;
          p_period_start?: string;
          want: boolean;
          ws: string;
        };
        Returns: string;
      };
      transfer_ownership: {
        Args: { actor: string; new_owner: string; ws: string };
        Returns: undefined;
      };
      upsert_meta_connection: {
        Args: {
          p_expires_at?: string;
          p_key_id: string;
          p_sealed: string;
          p_token_type: string;
          ws: string;
        };
        Returns: string;
      };
    };
    Enums: {
      campaign_status:
        | 'draft'
        | 'publishing'
        | 'in_review'
        | 'active'
        | 'paused'
        | 'rejected'
        | 'ended'
        | 'stopped'
        | 'error';
      credit_bucket: 'monthly' | 'bonus' | 'purchased';
      credit_kind:
        | 'grant_monthly'
        | 'purchase'
        | 'reserve'
        | 'consume'
        | 'release'
        | 'expire'
        | 'admin_grant'
        | 'admin_revoke'
        | 'referral'
        | 'trial';
      job_status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'nsfw' | 'canceled';
      member_role: 'owner' | 'editor' | 'viewer';
      model_status: 'testing' | 'active' | 'disabled';
      payment_purpose: 'subscription' | 'upgrade' | 'credits';
      payment_status: 'pending' | 'succeeded' | 'failed' | 'expired' | 'manual';
      platform: 'meta' | 'google' | 'tiktok';
      quality_level: 'standard' | 'high';
      source_type: 'website' | 'app_link' | 'image' | 'social_post' | 'document' | 'text';
      subscription_status: 'trialing' | 'active' | 'grace' | 'read_only' | 'canceled';
      ticket_status: 'open' | 'waiting_user' | 'closed';
      workspace_status: 'active' | 'read_only' | 'suspended';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      campaign_status: [
        'draft',
        'publishing',
        'in_review',
        'active',
        'paused',
        'rejected',
        'ended',
        'stopped',
        'error',
      ],
      credit_bucket: ['monthly', 'bonus', 'purchased'],
      credit_kind: [
        'grant_monthly',
        'purchase',
        'reserve',
        'consume',
        'release',
        'expire',
        'admin_grant',
        'admin_revoke',
        'referral',
        'trial',
      ],
      job_status: ['queued', 'running', 'completed', 'partial', 'failed', 'nsfw', 'canceled'],
      member_role: ['owner', 'editor', 'viewer'],
      model_status: ['testing', 'active', 'disabled'],
      payment_purpose: ['subscription', 'upgrade', 'credits'],
      payment_status: ['pending', 'succeeded', 'failed', 'expired', 'manual'],
      platform: ['meta', 'google', 'tiktok'],
      quality_level: ['standard', 'high'],
      source_type: ['website', 'app_link', 'image', 'social_post', 'document', 'text'],
      subscription_status: ['trialing', 'active', 'grace', 'read_only', 'canceled'],
      ticket_status: ['open', 'waiting_user', 'closed'],
      workspace_status: ['active', 'read_only', 'suspended'],
    },
  },
} as const;
