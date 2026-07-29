export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_error_logs: {
        Row: {
          ai_raw_response: string | null
          created_at: string | null
          error_message: string
          error_type: string | null
          function_name: string
          id: string
          job_id: string | null
          metadata: Json | null
          session_id: string | null
          tenant_id: string | null
          user_id: string | null
          user_input: string | null
        }
        Insert: {
          ai_raw_response?: string | null
          created_at?: string | null
          error_message: string
          error_type?: string | null
          function_name: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          session_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
          user_input?: string | null
        }
        Update: {
          ai_raw_response?: string | null
          created_at?: string | null
          error_message?: string
          error_type?: string | null
          function_name?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          session_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
          user_input?: string | null
        }
        Relationships: []
      }
      ai_knowledge: {
        Row: {
          active: boolean | null
          category: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          active?: boolean | null
          category: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          active?: boolean | null
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pm_runs: {
        Row: {
          id: string
          invoked_at: string
          invoked_by: string | null
          job_id: string
          output_summary: string | null
          tenant_id: string
        }
        Insert: {
          id?: string
          invoked_at?: string
          invoked_by?: string | null
          job_id: string
          output_summary?: string | null
          tenant_id: string
        }
        Update: {
          id?: string
          invoked_at?: string
          invoked_by?: string | null
          job_id?: string
          output_summary?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pm_runs_invoked_by_fkey"
            columns: ["invoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pm_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pm_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_fix_attempts: {
        Row: {
          bug_id: string
          classification: string
          created_at: string
          fix_prompt: string | null
          id: string
          reasoning: string | null
          vm_dispatch_status: string | null
          vm_response: Json | null
        }
        Insert: {
          bug_id: string
          classification: string
          created_at?: string
          fix_prompt?: string | null
          id?: string
          reasoning?: string | null
          vm_dispatch_status?: string | null
          vm_response?: Json | null
        }
        Update: {
          bug_id?: string
          classification?: string
          created_at?: string
          fix_prompt?: string | null
          id?: string
          reasoning?: string | null
          vm_dispatch_status?: string | null
          vm_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_fix_attempts_bug_id_fkey"
            columns: ["bug_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_analytics: {
        Row: {
          address: string | null
          bid_amount: number | null
          bid_sent_at: string | null
          decided_at: string | null
          id: string
          job_id: string | null
          job_type: string | null
          lost_reason: string | null
          outcome: string | null
          tenant_id: string
        }
        Insert: {
          address?: string | null
          bid_amount?: number | null
          bid_sent_at?: string | null
          decided_at?: string | null
          id?: string
          job_id?: string | null
          job_type?: string | null
          lost_reason?: string | null
          outcome?: string | null
          tenant_id: string
        }
        Update: {
          address?: string | null
          bid_amount?: number | null
          bid_sent_at?: string | null
          decided_at?: string | null
          id?: string
          job_id?: string | null
          job_type?: string | null
          lost_reason?: string | null
          outcome?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bid_analytics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_model_config: {
        Row: {
          allowance: boolean
          category: string
          created_at: string
          id: string
          markup_pct: number
          pm_fee: number
          supply_model: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allowance?: boolean
          category: string
          created_at?: string
          id?: string
          markup_pct?: number
          pm_fee?: number
          supply_model?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allowance?: boolean
          category?: string
          created_at?: string
          id?: string
          markup_pct?: number
          pm_fee?: number
          supply_model?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          app_version: string | null
          auto_fix_commit: string | null
          auto_fix_notes: string | null
          breadcrumbs: Json | null
          console_errors: Json | null
          created_at: string
          description: string
          device_info: string | null
          email_sent_at: string | null
          fixed_at: string | null
          id: string
          network_errors: Json | null
          route: string | null
          screenshot_url: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
          user_role: string
          vercel_deployment_id: string | null
        }
        Insert: {
          app_version?: string | null
          auto_fix_commit?: string | null
          auto_fix_notes?: string | null
          breadcrumbs?: Json | null
          console_errors?: Json | null
          created_at?: string
          description: string
          device_info?: string | null
          email_sent_at?: string | null
          fixed_at?: string | null
          id?: string
          network_errors?: Json | null
          route?: string | null
          screenshot_url?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          user_role: string
          vercel_deployment_id?: string | null
        }
        Update: {
          app_version?: string | null
          auto_fix_commit?: string | null
          auto_fix_notes?: string | null
          breadcrumbs?: Json | null
          console_errors?: Json | null
          created_at?: string
          description?: string
          device_info?: string | null
          email_sent_at?: string | null
          fixed_at?: string | null
          id?: string
          network_errors?: Json | null
          route?: string | null
          screenshot_url?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          user_role?: string
          vercel_deployment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          accrual_transaction_id: string | null
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          co_condition_bypass_reason: string | null
          co_fix_bypass_reason: string | null
          co_number: string
          created_at: string | null
          description: string
          id: string
          job_id: string | null
          markup_pct: number | null
          oh_shit_moment_id: string | null
          reason: string | null
          status: string | null
          submitted_by: string | null
          tenant_id: string | null
        }
        Insert: {
          accrual_transaction_id?: string | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          co_condition_bypass_reason?: string | null
          co_fix_bypass_reason?: string | null
          co_number: string
          created_at?: string | null
          description: string
          id?: string
          job_id?: string | null
          markup_pct?: number | null
          oh_shit_moment_id?: string | null
          reason?: string | null
          status?: string | null
          submitted_by?: string | null
          tenant_id?: string | null
        }
        Update: {
          accrual_transaction_id?: string | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          co_condition_bypass_reason?: string | null
          co_fix_bypass_reason?: string | null
          co_number?: string
          created_at?: string | null
          description?: string
          id?: string
          job_id?: string | null
          markup_pct?: number | null
          oh_shit_moment_id?: string | null
          reason?: string | null
          status?: string | null
          submitted_by?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_accrual_transaction_id_fkey"
            columns: ["accrual_transaction_id"]
            isOneToOne: false
            referencedRelation: "job_cost_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_accrual_transaction_id_fkey"
            columns: ["accrual_transaction_id"]
            isOneToOne: false
            referencedRelation: "job_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_accrual_transaction_id_fkey"
            columns: ["accrual_transaction_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_oh_shit_moment_id_fkey"
            columns: ["oh_shit_moment_id"]
            isOneToOne: false
            referencedRelation: "oh_shit_moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_files: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          effective_date: string | null
          expiration_date: string | null
          extracted_fields: Json
          id: string
          issuer: string | null
          lifecycle_status: string
          mime_type: string | null
          name: string
          policy_number: string | null
          replaced_by_id: string | null
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          tenant_id: string
          type: string
          updated_at: string
          uploaded_by_id: string | null
          visible_to_roles: string[]
        }
        Insert: {
          archived_at?: string | null
          category: string
          created_at?: string
          effective_date?: string | null
          expiration_date?: string | null
          extracted_fields?: Json
          id?: string
          issuer?: string | null
          lifecycle_status?: string
          mime_type?: string | null
          name: string
          policy_number?: string | null
          replaced_by_id?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          tenant_id: string
          type: string
          updated_at?: string
          uploaded_by_id?: string | null
          visible_to_roles?: string[]
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          effective_date?: string | null
          expiration_date?: string | null
          extracted_fields?: Json
          id?: string
          issuer?: string | null
          lifecycle_status?: string
          mime_type?: string | null
          name?: string
          policy_number?: string | null
          replaced_by_id?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          uploaded_by_id?: string | null
          visible_to_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "company_files_replaced_by_id_fkey"
            columns: ["replaced_by_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_profiles: {
        Row: {
          city: string | null
          company_name: string | null
          created_at: string | null
          id: string
          insurance_verified: boolean | null
          license_number: string | null
          phone: string | null
          specialties: string[] | null
          state: string | null
          tagline: string | null
          tenant_id: string
          updated_at: string | null
          website: string | null
          year_founded: string | null
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          insurance_verified?: boolean | null
          license_number?: string | null
          phone?: string | null
          specialties?: string[] | null
          state?: string | null
          tagline?: string | null
          tenant_id: string
          updated_at?: string | null
          website?: string | null
          year_founded?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          insurance_verified?: boolean | null
          license_number?: string | null
          phone?: string | null
          specialties?: string[] | null
          state?: string | null
          tagline?: string | null
          tenant_id?: string
          updated_at?: string | null
          website?: string | null
          year_founded?: string | null
        }
        Relationships: []
      }
      consultation_extractions: {
        Row: {
          action_items: string[] | null
          budget_signals: string | null
          checklist_answers: Json
          client_concerns: string[] | null
          decision_makers: string[] | null
          extracted_at: string | null
          fired_modules: string[]
          id: string
          job_id: string | null
          risk_flags: string[] | null
          scope_hints: string[] | null
          session_id: string | null
          tenant_id: string
          timeline: string | null
        }
        Insert: {
          action_items?: string[] | null
          budget_signals?: string | null
          checklist_answers?: Json
          client_concerns?: string[] | null
          decision_makers?: string[] | null
          extracted_at?: string | null
          fired_modules?: string[]
          id?: string
          job_id?: string | null
          risk_flags?: string[] | null
          scope_hints?: string[] | null
          session_id?: string | null
          tenant_id?: string
          timeline?: string | null
        }
        Update: {
          action_items?: string[] | null
          budget_signals?: string | null
          checklist_answers?: Json
          client_concerns?: string[] | null
          decision_makers?: string[] | null
          extracted_at?: string | null
          fired_modules?: string[]
          id?: string
          job_id?: string | null
          risk_flags?: string[] | null
          scope_hints?: string[] | null
          session_id?: string | null
          tenant_id?: string
          timeline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultation_extractions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_extractions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "consultation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_gap_analyses: {
        Row: {
          created_at: string
          gaps: Json
          id: string
          job_id: string
          session_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          gaps?: Json
          id?: string
          job_id: string
          session_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          gaps?: Json
          id?: string
          job_id?: string
          session_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      consultation_measurements: {
        Row: {
          confirmed_by_rep: boolean | null
          created_at: string | null
          fields: Json
          id: string
          job_id: string | null
          scope_notes: string | null
          session_id: string | null
          source: string
          tenant_id: string
          trade: string
        }
        Insert: {
          confirmed_by_rep?: boolean | null
          created_at?: string | null
          fields?: Json
          id?: string
          job_id?: string | null
          scope_notes?: string | null
          session_id?: string | null
          source?: string
          tenant_id?: string
          trade: string
        }
        Update: {
          confirmed_by_rep?: boolean | null
          created_at?: string | null
          fields?: Json
          id?: string
          job_id?: string | null
          scope_notes?: string | null
          session_id?: string | null
          source?: string
          tenant_id?: string
          trade?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_measurements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_measurements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "consultation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_photos: {
        Row: {
          caption: string | null
          caption_source: string
          captured_at: string
          created_at: string
          id: string
          job_id: string | null
          session_id: string | null
          sort: number
          storage_path: string
          tenant_id: string
          transcript_context: string | null
        }
        Insert: {
          caption?: string | null
          caption_source?: string
          captured_at?: string
          created_at?: string
          id?: string
          job_id?: string | null
          session_id?: string | null
          sort?: number
          storage_path: string
          tenant_id?: string
          transcript_context?: string | null
        }
        Update: {
          caption?: string | null
          caption_source?: string
          captured_at?: string
          created_at?: string
          id?: string
          job_id?: string | null
          session_id?: string | null
          sort?: number
          storage_path?: string
          tenant_id?: string
          transcript_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultation_photos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "consultation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_recaps: {
        Row: {
          created_at: string
          discussed_items: Json
          id: string
          job_id: string | null
          needs_confirm: Json
          open_items: Json
          pdf_path: string | null
          scope_basis: Json
          sent_at: string | null
          session_id: string | null
          status: string
          summary: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discussed_items?: Json
          id?: string
          job_id?: string | null
          needs_confirm?: Json
          open_items?: Json
          pdf_path?: string | null
          scope_basis?: Json
          sent_at?: string | null
          session_id?: string | null
          status?: string
          summary?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discussed_items?: Json
          id?: string
          job_id?: string | null
          needs_confirm?: Json
          open_items?: Json
          pdf_path?: string | null
          scope_basis?: Json
          sent_at?: string | null
          session_id?: string | null
          status?: string
          summary?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_recaps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "consultation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_sessions: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          job_id: string | null
          raw_transcript: string | null
          session_type: string
          started_at: string | null
          started_by: string | null
          status: string | null
          tenant_id: string
          trade_scope: string[] | null
          walk_sub_id: string | null
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          job_id?: string | null
          raw_transcript?: string | null
          session_type?: string
          started_at?: string | null
          started_by?: string | null
          status?: string | null
          tenant_id?: string
          trade_scope?: string[] | null
          walk_sub_id?: string | null
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          job_id?: string | null
          raw_transcript?: string | null
          session_type?: string
          started_at?: string | null
          started_by?: string | null
          status?: string | null
          tenant_id?: string
          trade_scope?: string[] | null
          walk_sub_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultation_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lidar_scans: {
        Row: {
          capture_mode: string | null
          contact_id: string
          created_at: string | null
          created_by: string
          edit_overrides: Json | null
          gps_accuracy: number | null
          gps_latitude: number | null
          gps_longitude: number | null
          height_meters: number | null
          height_points: number[] | null
          height_source: string | null
          id: string
          outline_data: Json | null
          quality_deductions: Json | null
          quality_grade: string | null
          quality_score: number | null
          room_count: number | null
          rooms: Json
          scan_name: string | null
          tenant_id: string
          total_sqft: number | null
        }
        Insert: {
          capture_mode?: string | null
          contact_id: string
          created_at?: string | null
          created_by: string
          edit_overrides?: Json | null
          gps_accuracy?: number | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          height_meters?: number | null
          height_points?: number[] | null
          height_source?: string | null
          id?: string
          outline_data?: Json | null
          quality_deductions?: Json | null
          quality_grade?: string | null
          quality_score?: number | null
          room_count?: number | null
          rooms?: Json
          scan_name?: string | null
          tenant_id: string
          total_sqft?: number | null
        }
        Update: {
          capture_mode?: string | null
          contact_id?: string
          created_at?: string | null
          created_by?: string
          edit_overrides?: Json | null
          gps_accuracy?: number | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          height_meters?: number | null
          height_points?: number[] | null
          height_source?: string | null
          id?: string
          outline_data?: Json | null
          quality_deductions?: Json | null
          quality_grade?: string | null
          quality_score?: number | null
          room_count?: number | null
          rooms?: Json
          scan_name?: string | null
          tenant_id?: string
          total_sqft?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_lidar_scans_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          body: string
          contact_id: string
          created_at: string | null
          direction: string
          from_number: string | null
          id: string
          sent_by: string | null
          status: string | null
          tenant_id: string
          to_number: string | null
          twilio_sid: string | null
        }
        Insert: {
          body: string
          contact_id: string
          created_at?: string | null
          direction: string
          from_number?: string | null
          id?: string
          sent_by?: string | null
          status?: string | null
          tenant_id?: string
          to_number?: string | null
          twilio_sid?: string | null
        }
        Update: {
          body?: string
          contact_id?: string
          created_at?: string | null
          direction?: string
          from_number?: string | null
          id?: string
          sent_by?: string | null
          status?: string | null
          tenant_id?: string
          to_number?: string | null
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          assigned_rep: string | null
          created_at: string | null
          daily_capacity_hours: number | null
          email: string | null
          first_name: string | null
          id: string
          job_id: string | null
          last_contacted_at: string | null
          last_name: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          status: string | null
          tags: string[] | null
          tenant_id: string
          type: string | null
        }
        Insert: {
          assigned_rep?: string | null
          created_at?: string | null
          daily_capacity_hours?: number | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_id?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string
          type?: string | null
        }
        Update: {
          assigned_rep?: string | null
          created_at?: string | null
          daily_capacity_hours?: number | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_id?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          contract_total: number | null
          created_at: string | null
          document_url: string | null
          id: string
          ip_address: unknown
          job_id: string
          reference_id: string | null
          scope_snapshot: Json | null
          signature_data: string | null
          signed_at: string | null
          signed_by_email: string | null
          signed_by_name: string | null
          tenant_id: string
          type: string
          user_agent: string | null
        }
        Insert: {
          contract_total?: number | null
          created_at?: string | null
          document_url?: string | null
          id?: string
          ip_address?: unknown
          job_id: string
          reference_id?: string | null
          scope_snapshot?: Json | null
          signature_data?: string | null
          signed_at?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          tenant_id: string
          type: string
          user_agent?: string | null
        }
        Update: {
          contract_total?: number | null
          created_at?: string | null
          document_url?: string | null
          id?: string
          ip_address?: unknown
          job_id?: string
          reference_id?: string | null
          scope_snapshot?: Json | null
          signature_data?: string | null
          signed_at?: string | null
          signed_by_email?: string | null
          signed_by_name?: string | null
          tenant_id?: string
          type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          approved_at: string | null
          approved_by_id: string | null
          author_id: string | null
          client_message: string | null
          created_at: string | null
          crew_count: number | null
          delay_days: number | null
          hours_worked: number | null
          id: string
          issues: string | null
          issues_flagged: string | null
          job_id: string
          log_date: string
          materials_used: string | null
          phase_on_schedule: boolean | null
          photos: Json | null
          status: string
          tenant_id: string
          weather: string | null
          work_completed: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_id?: string | null
          author_id?: string | null
          client_message?: string | null
          created_at?: string | null
          crew_count?: number | null
          delay_days?: number | null
          hours_worked?: number | null
          id?: string
          issues?: string | null
          issues_flagged?: string | null
          job_id: string
          log_date?: string
          materials_used?: string | null
          phase_on_schedule?: boolean | null
          photos?: Json | null
          status?: string
          tenant_id: string
          weather?: string | null
          work_completed?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_id?: string | null
          author_id?: string | null
          client_message?: string | null
          created_at?: string | null
          crew_count?: number | null
          delay_days?: number | null
          hours_worked?: number | null
          id?: string
          issues?: string | null
          issues_flagged?: string | null
          job_id?: string
          log_date?: string
          materials_used?: string | null
          phase_on_schedule?: boolean | null
          photos?: Json | null
          status?: string
          tenant_id?: string
          weather?: string | null
          work_completed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_line_items: {
        Row: {
          base_amount: number
          created_at: string
          created_by_id: string | null
          description: string
          display_order: number
          draw_id: string
          id: string
          is_forward_looking: boolean
          markup_amount: number
          markup_pct: number
          notes: string | null
          tenant_id: string
          total_with_markup: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          base_amount: number
          created_at?: string
          created_by_id?: string | null
          description: string
          display_order?: number
          draw_id: string
          id?: string
          is_forward_looking?: boolean
          markup_amount?: number
          markup_pct?: number
          notes?: string | null
          tenant_id: string
          total_with_markup: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          created_by_id?: string | null
          description?: string
          display_order?: number
          draw_id?: string
          id?: string
          is_forward_looking?: boolean
          markup_amount?: number
          markup_pct?: number
          notes?: string | null
          tenant_id?: string
          total_with_markup?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_line_items_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_line_items_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "draw_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_line_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "job_cost_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_line_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "job_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_line_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_packages: {
        Row: {
          cover_notes: string | null
          created_at: string
          created_by_id: string
          draw_id: string | null
          generated_pdf_path: string | null
          id: string
          included_file_ids: Json
          job_id: string
          photo_grid_density: number
          recipient_email: string | null
          recipient_label: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cover_notes?: string | null
          created_at?: string
          created_by_id: string
          draw_id?: string | null
          generated_pdf_path?: string | null
          id?: string
          included_file_ids?: Json
          job_id: string
          photo_grid_density?: number
          recipient_email?: string | null
          recipient_label?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cover_notes?: string | null
          created_at?: string
          created_by_id?: string
          draw_id?: string | null
          generated_pdf_path?: string | null
          id?: string
          included_file_ids?: Json
          job_id?: string
          photo_grid_density?: number
          recipient_email?: string | null
          recipient_label?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_packages_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_packages_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "draw_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_packages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_schedules: {
        Row: {
          auto_invoice_trigger: Json | null
          auto_invoiced_at: string | null
          created_at: string
          description: string | null
          display_order: number
          draw_number: number
          id: string
          invoiced_amount: number
          is_retainage_release: boolean
          job_id: string
          paid_amount: number
          phase: string | null
          retainage_held: number
          status: string
          target_amount: number
          target_date: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          auto_invoice_trigger?: Json | null
          auto_invoiced_at?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          draw_number: number
          id?: string
          invoiced_amount?: number
          is_retainage_release?: boolean
          job_id: string
          paid_amount?: number
          phase?: string | null
          retainage_held?: number
          status?: string
          target_amount: number
          target_date?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          auto_invoice_trigger?: Json | null
          auto_invoiced_at?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          draw_number?: number
          id?: string
          invoiced_amount?: number
          is_retainage_release?: boolean
          job_id?: string
          paid_amount?: number
          phase?: string | null
          retainage_held?: number
          status?: string
          target_amount?: number
          target_date?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_schedules_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_bids: {
        Row: {
          accepted_at: string | null
          accepted_by_id: string | null
          attached_doc_ids: string[] | null
          availability_notes: string | null
          created_at: string
          drafted_by: string
          drafted_by_id: string | null
          earliest_start_date: string | null
          end_date: string | null
          engagement_id: string
          id: string
          is_current: boolean
          line_items: Json | null
          rejected_at: string | null
          rejected_by_id: string | null
          rejection_reason: string | null
          revision_number: number
          start_date: string | null
          submitted_at: string | null
          tenant_id: string
          terms: string | null
          total_amount: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_id?: string | null
          attached_doc_ids?: string[] | null
          availability_notes?: string | null
          created_at?: string
          drafted_by: string
          drafted_by_id?: string | null
          earliest_start_date?: string | null
          end_date?: string | null
          engagement_id: string
          id?: string
          is_current?: boolean
          line_items?: Json | null
          rejected_at?: string | null
          rejected_by_id?: string | null
          rejection_reason?: string | null
          revision_number?: number
          start_date?: string | null
          submitted_at?: string | null
          tenant_id: string
          terms?: string | null
          total_amount: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by_id?: string | null
          attached_doc_ids?: string[] | null
          availability_notes?: string | null
          created_at?: string
          drafted_by?: string
          drafted_by_id?: string | null
          earliest_start_date?: string | null
          end_date?: string | null
          engagement_id?: string
          id?: string
          is_current?: boolean
          line_items?: Json | null
          rejected_at?: string | null
          rejected_by_id?: string | null
          rejection_reason?: string | null
          revision_number?: number
          start_date?: string | null
          submitted_at?: string | null
          tenant_id?: string
          terms?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "engagement_bids_accepted_by_id_fkey"
            columns: ["accepted_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_bids_drafted_by_id_fkey"
            columns: ["drafted_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_bids_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "job_sub_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_bids_rejected_by_id_fkey"
            columns: ["rejected_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_items: {
        Row: {
          category: string | null
          client_price: number | null
          created_at: string
          created_by: string
          description: string
          display_order: number
          estimate_id: string | null
          id: string
          job_id: string
          markup_pct: number
          multiplier: number
          notes: string | null
          phase: string | null
          quantity: number
          rate_provenance: string | null
          room_id: string | null
          scope_field_key: string | null
          source_label: string | null
          tenant_id: string
          total_cost: number | null
          trade: string | null
          unit: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          client_price?: number | null
          created_at?: string
          created_by: string
          description: string
          display_order?: number
          estimate_id?: string | null
          id?: string
          job_id: string
          markup_pct?: number
          multiplier?: number
          notes?: string | null
          phase?: string | null
          quantity?: number
          rate_provenance?: string | null
          room_id?: string | null
          scope_field_key?: string | null
          source_label?: string | null
          tenant_id: string
          total_cost?: number | null
          trade?: string | null
          unit?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          client_price?: number | null
          created_at?: string
          created_by?: string
          description?: string
          display_order?: number
          estimate_id?: string | null
          id?: string
          job_id?: string
          markup_pct?: number
          multiplier?: number
          notes?: string | null
          phase?: string | null
          quantity?: number
          rate_provenance?: string | null
          room_id?: string | null
          scope_field_key?: string | null
          source_label?: string | null
          tenant_id?: string
          total_cost?: number | null
          trade?: string | null
          unit?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "job_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "job_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      field_opus_dispatch_queue: {
        Row: {
          commit_hash: string | null
          completed_at: string | null
          created_at: string
          dispatched_at: string | null
          error_text: string | null
          id: string
          message_id: string
          prompt: string
          result_text: string | null
          status: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          commit_hash?: string | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          error_text?: string | null
          id?: string
          message_id: string
          prompt: string
          result_text?: string | null
          status?: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          commit_hash?: string | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          error_text?: string | null
          id?: string
          message_id?: string
          prompt?: string
          result_text?: string | null
          status?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_opus_dispatch_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "field_opus_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      field_opus_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          meta: Json
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          meta?: Json
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          meta?: Json
          role?: string
          thread_id?: string
        }
        Relationships: []
      }
      floor_plan_versions: {
        Row: {
          created_at: string
          created_by: string
          floor_plan_id: string
          id: string
          layout_overrides_snapshot: Json
          pdf_url: string
          raw_scan_snapshot: Json
          sent_at: string | null
          sent_to: string[]
          tenant_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          floor_plan_id: string
          id?: string
          layout_overrides_snapshot: Json
          pdf_url: string
          raw_scan_snapshot: Json
          sent_at?: string | null
          sent_to?: string[]
          tenant_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          floor_plan_id?: string
          id?: string
          layout_overrides_snapshot?: Json
          pdf_url?: string
          raw_scan_snapshot?: Json
          sent_at?: string | null
          sent_to?: string[]
          tenant_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "floor_plan_versions_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plans: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string
          current_pdf_url: string | null
          current_pdf_version: number
          id: string
          job_id: string | null
          layout_overrides: Json
          name: string
          normalized_geometry: Json | null
          raw_scan: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by: string
          current_pdf_url?: string | null
          current_pdf_version?: number
          id?: string
          job_id?: string | null
          layout_overrides?: Json
          name: string
          normalized_geometry?: Json | null
          raw_scan: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          current_pdf_url?: string | null
          current_pdf_version?: number
          id?: string
          job_id?: string | null
          layout_overrides?: Json
          name?: string
          normalized_geometry?: Json | null
          raw_scan?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_plans_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          display_order: number
          id: string
          invoice_id: string
          line_total: number
          phase: string | null
          quantity: number
          source_id: string | null
          source_type: string | null
          tenant_id: string
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          display_order?: number
          id?: string
          invoice_id: string
          line_total: number
          phase?: string | null
          quantity?: number
          source_id?: string | null
          source_type?: string | null
          tenant_id: string
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          invoice_id?: string
          line_total?: number
          phase?: string | null
          quantity?: number
          source_id?: string | null
          source_type?: string | null
          tenant_id?: string
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by_id: string | null
          draw_id: string | null
          due_date: string | null
          first_viewed_at: string | null
          id: string
          internal_notes: string | null
          invoice_date: string
          invoice_number: string
          job_id: string
          notes: string | null
          paid_at: string | null
          pdf_url: string | null
          sent_at: string | null
          sent_by_id: string | null
          status: string
          stripe_checkout_url: string | null
          stripe_session_id: string | null
          subtotal: number
          tax_amount: number
          tenant_id: string
          total_amount: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_id: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by_id?: string | null
          draw_id?: string | null
          due_date?: string | null
          first_viewed_at?: string | null
          id?: string
          internal_notes?: string | null
          invoice_date?: string
          invoice_number: string
          job_id: string
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          sent_by_id?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_id?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by_id?: string | null
          draw_id?: string | null
          due_date?: string | null
          first_viewed_at?: string | null
          id?: string
          internal_notes?: string | null
          invoice_date?: string
          invoice_number?: string
          job_id?: string
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          sent_by_id?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "draw_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sent_by_id_fkey"
            columns: ["sent_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_voided_by_id_fkey"
            columns: ["voided_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_ai_companions: {
        Row: {
          conversation_history: Json | null
          created_at: string | null
          id: string
          job_id: string | null
          job_snapshot: Json | null
          role: string
          tenant_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          conversation_history?: Json | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          job_snapshot?: Json | null
          role: string
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          conversation_history?: Json | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          job_snapshot?: Json | null
          role?: string
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_ai_companions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_ai_companions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_cost_items: {
        Row: {
          client_visible: boolean
          created_at: string
          estimate: number
          id: string
          job_id: string
          markup_pct: number
          proposal_file_name: string | null
          proposal_file_url: string | null
          tenant_id: string
          trade: string
          vendor: string
        }
        Insert: {
          client_visible?: boolean
          created_at?: string
          estimate?: number
          id?: string
          job_id: string
          markup_pct?: number
          proposal_file_name?: string | null
          proposal_file_url?: string | null
          tenant_id: string
          trade?: string
          vendor?: string
        }
        Update: {
          client_visible?: boolean
          created_at?: string
          estimate?: number
          id?: string
          job_id?: string
          markup_pct?: number
          proposal_file_name?: string | null
          proposal_file_url?: string | null
          tenant_id?: string
          trade?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_cost_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_documents: {
        Row: {
          client_visible: boolean | null
          created_at: string | null
          file_type: string | null
          file_url: string
          id: string
          job_id: string
          name: string
          tenant_id: string
          uploaded_by: string | null
          version: number | null
        }
        Insert: {
          client_visible?: boolean | null
          created_at?: string | null
          file_type?: string | null
          file_url: string
          id?: string
          job_id: string
          name: string
          tenant_id: string
          uploaded_by?: string | null
          version?: number | null
        }
        Update: {
          client_visible?: boolean | null
          created_at?: string | null
          file_type?: string | null
          file_url?: string
          id?: string
          job_id?: string
          name?: string
          tenant_id?: string
          uploaded_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_estimates: {
        Row: {
          approval_meta: Json | null
          approval_status: string | null
          created_at: string | null
          created_by: string | null
          estimate_data: Json | null
          id: string
          job_id: string
          messages: Json | null
          scope_origin: string
          session_id: string | null
          source: string | null
          tenant_id: string
          total: number | null
          updated_at: string | null
        }
        Insert: {
          approval_meta?: Json | null
          approval_status?: string | null
          created_at?: string | null
          created_by?: string | null
          estimate_data?: Json | null
          id?: string
          job_id: string
          messages?: Json | null
          scope_origin?: string
          session_id?: string | null
          source?: string | null
          tenant_id: string
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_meta?: Json | null
          approval_status?: string | null
          created_at?: string | null
          created_by?: string | null
          estimate_data?: Json | null
          id?: string
          job_id?: string
          messages?: Json | null
          scope_origin?: string
          session_id?: string | null
          source?: string | null
          tenant_id?: string
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_estimates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_estimates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "consultation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_estimates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_files: {
        Row: {
          ai_confidence: number | null
          ai_subcategory_suggested: string | null
          archived_at: string | null
          category: string
          client_visible: boolean
          created_at: string
          external_url: string | null
          id: string
          job_id: string
          lifecycle_status: string
          mime_type: string | null
          name: string
          related_entity_id: string | null
          related_entity_type: string | null
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          subcategory: string | null
          tenant_id: string
          updated_at: string
          uploaded_by_id: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_subcategory_suggested?: string | null
          archived_at?: string | null
          category: string
          client_visible?: boolean
          created_at?: string
          external_url?: string | null
          id?: string
          job_id: string
          lifecycle_status?: string
          mime_type?: string | null
          name: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          subcategory?: string | null
          tenant_id: string
          updated_at?: string
          uploaded_by_id?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_subcategory_suggested?: string | null
          archived_at?: string | null
          category?: string
          client_visible?: boolean
          created_at?: string
          external_url?: string | null
          id?: string
          job_id?: string
          lifecycle_status?: string
          mime_type?: string | null
          name?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          subcategory?: string | null
          tenant_id?: string
          updated_at?: string
          uploaded_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_files_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_files_uploaded_by_id_fkey"
            columns: ["uploaded_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_lidar_scans: {
        Row: {
          capture_mode: string | null
          created_at: string | null
          created_by: string
          edit_overrides: Json | null
          gps_accuracy: number | null
          gps_latitude: number | null
          gps_longitude: number | null
          height_meters: number | null
          height_points: number[] | null
          height_source: string | null
          id: string
          job_id: string
          normalized_geometry: Json | null
          outline_data: Json | null
          quality_deductions: Json | null
          quality_grade: string | null
          quality_score: number | null
          room_count: number | null
          rooms: Json
          scan_name: string | null
          tenant_id: string
          total_sqft: number | null
        }
        Insert: {
          capture_mode?: string | null
          created_at?: string | null
          created_by: string
          edit_overrides?: Json | null
          gps_accuracy?: number | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          height_meters?: number | null
          height_points?: number[] | null
          height_source?: string | null
          id?: string
          job_id: string
          normalized_geometry?: Json | null
          outline_data?: Json | null
          quality_deductions?: Json | null
          quality_grade?: string | null
          quality_score?: number | null
          room_count?: number | null
          rooms?: Json
          scan_name?: string | null
          tenant_id: string
          total_sqft?: number | null
        }
        Update: {
          capture_mode?: string | null
          created_at?: string | null
          created_by?: string
          edit_overrides?: Json | null
          gps_accuracy?: number | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          height_meters?: number | null
          height_points?: number[] | null
          height_source?: string | null
          id?: string
          job_id?: string
          normalized_geometry?: Json | null
          outline_data?: Json | null
          quality_deductions?: Json | null
          quality_grade?: string | null
          quality_score?: number | null
          room_count?: number | null
          rooms?: Json
          scan_name?: string | null
          tenant_id?: string
          total_sqft?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_lidar_scans_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_materials: {
        Row: {
          created_at: string | null
          created_by: string | null
          estimate_line_item_id: string | null
          expected_delivery: string | null
          id: string
          job_id: string | null
          name: string
          notes: string | null
          order_date: string | null
          phase: string | null
          quantity: number | null
          status: string | null
          supplier: string | null
          tenant_id: string | null
          unit: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          estimate_line_item_id?: string | null
          expected_delivery?: string | null
          id?: string
          job_id?: string | null
          name: string
          notes?: string | null
          order_date?: string | null
          phase?: string | null
          quantity?: number | null
          status?: string | null
          supplier?: string | null
          tenant_id?: string | null
          unit?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          estimate_line_item_id?: string | null
          expected_delivery?: string | null
          id?: string
          job_id?: string | null
          name?: string
          notes?: string | null
          order_date?: string | null
          phase?: string | null
          quantity?: number | null
          status?: string | null
          supplier?: string | null
          tenant_id?: string | null
          unit?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_materials_estimate_line_item_id_fkey"
            columns: ["estimate_line_item_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_materials_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          job_id: string
          sender_id: string
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          job_id: string
          sender_id: string
          tenant_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          job_id?: string
          sender_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_notes: {
        Row: {
          author: string | null
          client_visible: boolean | null
          content: string
          created_at: string | null
          id: string
          is_internal: boolean | null
          job_id: string | null
          tenant_id: string | null
        }
        Insert: {
          author?: string | null
          client_visible?: boolean | null
          content: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          job_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          author?: string | null
          client_visible?: boolean | null
          content?: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          job_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_outcomes: {
        Row: {
          actual_days: number | null
          address: string | null
          client_rating: number | null
          co_count: number | null
          co_total: number | null
          completed_at: string | null
          contract_value: number | null
          estimate_accuracy_pct: number | null
          final_value: number | null
          id: string
          job_id: string | null
          job_type: string | null
          notes: string | null
          profit_margin_pct: number | null
          schedule_accuracy_pct: number | null
          scheduled_days: number | null
          tenant_id: string
        }
        Insert: {
          actual_days?: number | null
          address?: string | null
          client_rating?: number | null
          co_count?: number | null
          co_total?: number | null
          completed_at?: string | null
          contract_value?: number | null
          estimate_accuracy_pct?: number | null
          final_value?: number | null
          id?: string
          job_id?: string | null
          job_type?: string | null
          notes?: string | null
          profit_margin_pct?: number | null
          schedule_accuracy_pct?: number | null
          scheduled_days?: number | null
          tenant_id: string
        }
        Update: {
          actual_days?: number | null
          address?: string | null
          client_rating?: number | null
          co_count?: number | null
          co_total?: number | null
          completed_at?: string | null
          contract_value?: number | null
          estimate_accuracy_pct?: number | null
          final_value?: number | null
          id?: string
          job_id?: string | null
          job_type?: string | null
          notes?: string | null
          profit_margin_pct?: number | null
          schedule_accuracy_pct?: number | null
          scheduled_days?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_outcomes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_phases: {
        Row: {
          actual_completion: string | null
          assigned_sub_id: string | null
          completed_at: string | null
          completed_by_id: string | null
          created_at: string | null
          end_date: string | null
          id: string
          job_id: string
          notes: string | null
          phase_name: string
          phase_order: number
          start_date: string | null
          started_at: string | null
          started_by_id: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          actual_completion?: string | null
          assigned_sub_id?: string | null
          completed_at?: string | null
          completed_by_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          job_id: string
          notes?: string | null
          phase_name: string
          phase_order: number
          start_date?: string | null
          started_at?: string | null
          started_by_id?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          actual_completion?: string | null
          assigned_sub_id?: string | null
          completed_at?: string | null
          completed_by_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          phase_name?: string
          phase_order?: number
          start_date?: string | null
          started_at?: string | null
          started_by_id?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_phases_assigned_sub_id_fkey"
            columns: ["assigned_sub_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_phases_completed_by_id_fkey"
            columns: ["completed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_phases_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_phases_started_by_id_fkey"
            columns: ["started_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_phases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reviews: {
        Row: {
          client_email: string | null
          client_name: string | null
          created_at: string | null
          id: string
          job_id: string | null
          rating_communication: number | null
          rating_quality: number | null
          rating_timeliness: number | null
          review_text: string | null
          tenant_id: string | null
          would_recommend: boolean | null
        }
        Insert: {
          client_email?: string | null
          client_name?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          rating_communication?: number | null
          rating_quality?: number | null
          rating_timeliness?: number | null
          review_text?: string | null
          tenant_id?: string | null
          would_recommend?: boolean | null
        }
        Update: {
          client_email?: string | null
          client_name?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          rating_communication?: number | null
          rating_quality?: number | null
          rating_timeliness?: number | null
          review_text?: string | null
          tenant_id?: string | null
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "job_reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_room_scopes: {
        Row: {
          created_at: string | null
          created_by: string
          custom_trades: string[] | null
          id: string
          job_id: string
          notes: string | null
          room_id: string
          room_label: string | null
          room_type: string
          scope_details: Json | null
          scope_tag: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          custom_trades?: string[] | null
          id?: string
          job_id: string
          notes?: string | null
          room_id: string
          room_label?: string | null
          room_type: string
          scope_details?: Json | null
          scope_tag: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          custom_trades?: string[] | null
          id?: string
          job_id?: string
          notes?: string | null
          room_id?: string
          room_label?: string | null
          room_type?: string
          scope_details?: Json | null
          scope_tag?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      job_rooms: {
        Row: {
          created_at: string
          id: string
          job_id: string
          label: string
          scan_room_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          label: string
          scan_room_id?: string | null
          source: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          label?: string
          scan_room_id?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_rooms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_scope_answers: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          evidence_phrase: string | null
          field_key: string
          id: string
          job_id: string
          option_key: string | null
          room_id: string | null
          source: string
          status: string
          tenant_id: string
          trade: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          evidence_phrase?: string | null
          field_key: string
          id?: string
          job_id: string
          option_key?: string | null
          room_id?: string | null
          source: string
          status?: string
          tenant_id: string
          trade?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          evidence_phrase?: string | null
          field_key?: string
          id?: string
          job_id?: string
          option_key?: string | null
          room_id?: string | null
          source?: string
          status?: string
          tenant_id?: string
          trade?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_scope_answers_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_scope_answers_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_scope_answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "job_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sub_engagements: {
        Row: {
          activated_at: string | null
          activated_by_id: string | null
          bid_submitted_at: string | null
          bid_type: string
          budget_max: number | null
          budget_min: number | null
          completed_at: string | null
          completed_by_id: string | null
          created_at: string
          due_date: string | null
          first_viewed_at: string | null
          id: string
          invited_at: string
          invited_by_id: string | null
          job_id: string
          notes: string | null
          scope_description: string | null
          shared_doc_ids: string[] | null
          shared_photo_ids: string[] | null
          status: string
          sub_id: string
          tenant_id: string
          terminated_at: string | null
          terminated_by_id: string | null
          termination_reason: string | null
          trade: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by_id?: string | null
          bid_submitted_at?: string | null
          bid_type: string
          budget_max?: number | null
          budget_min?: number | null
          completed_at?: string | null
          completed_by_id?: string | null
          created_at?: string
          due_date?: string | null
          first_viewed_at?: string | null
          id?: string
          invited_at?: string
          invited_by_id?: string | null
          job_id: string
          notes?: string | null
          scope_description?: string | null
          shared_doc_ids?: string[] | null
          shared_photo_ids?: string[] | null
          status?: string
          sub_id: string
          tenant_id: string
          terminated_at?: string | null
          terminated_by_id?: string | null
          termination_reason?: string | null
          trade: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by_id?: string | null
          bid_submitted_at?: string | null
          bid_type?: string
          budget_max?: number | null
          budget_min?: number | null
          completed_at?: string | null
          completed_by_id?: string | null
          created_at?: string
          due_date?: string | null
          first_viewed_at?: string | null
          id?: string
          invited_at?: string
          invited_by_id?: string | null
          job_id?: string
          notes?: string | null
          scope_description?: string | null
          shared_doc_ids?: string[] | null
          shared_photo_ids?: string[] | null
          status?: string
          sub_id?: string
          tenant_id?: string
          terminated_at?: string | null
          terminated_by_id?: string | null
          termination_reason?: string | null
          trade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sub_engagements_activated_by_id_fkey"
            columns: ["activated_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sub_engagements_completed_by_id_fkey"
            columns: ["completed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sub_engagements_invited_by_id_fkey"
            columns: ["invited_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sub_engagements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sub_engagements_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sub_engagements_terminated_by_id_fkey"
            columns: ["terminated_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_transactions: {
        Row: {
          amount: number
          billing_treatment: string
          change_order_id: string | null
          client_email: string | null
          cost_item_id: string | null
          created_at: string
          created_by: string
          date_incurred: string
          date_paid: string | null
          description: string | null
          direction: string
          draw_id: string | null
          draw_number: number | null
          due_date: string | null
          id: string
          invoice_id: string | null
          job_id: string
          lien_waiver_required: boolean | null
          lien_waiver_signed_date: string | null
          lien_waiver_url: string | null
          markup_pct: number | null
          notes: string | null
          payer_or_payee_id: string | null
          payer_or_payee_name: string | null
          payer_or_payee_type: string | null
          payment_method: string | null
          phase: string | null
          phase_id: string | null
          qb_account: string | null
          qb_class: string | null
          qb_customer: string | null
          qb_synced_at: string | null
          qb_transaction_id: string | null
          qb_vendor: string | null
          receipt_url: string | null
          reimbursed_at: string | null
          reimbursement_status: string | null
          retainage_held: number | null
          retainage_pct: number | null
          status: string
          stripe_checkout_url: string | null
          stripe_link: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          tax_amount: number | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          billing_treatment?: string
          change_order_id?: string | null
          client_email?: string | null
          cost_item_id?: string | null
          created_at?: string
          created_by: string
          date_incurred?: string
          date_paid?: string | null
          description?: string | null
          direction: string
          draw_id?: string | null
          draw_number?: number | null
          due_date?: string | null
          id?: string
          invoice_id?: string | null
          job_id: string
          lien_waiver_required?: boolean | null
          lien_waiver_signed_date?: string | null
          lien_waiver_url?: string | null
          markup_pct?: number | null
          notes?: string | null
          payer_or_payee_id?: string | null
          payer_or_payee_name?: string | null
          payer_or_payee_type?: string | null
          payment_method?: string | null
          phase?: string | null
          phase_id?: string | null
          qb_account?: string | null
          qb_class?: string | null
          qb_customer?: string | null
          qb_synced_at?: string | null
          qb_transaction_id?: string | null
          qb_vendor?: string | null
          receipt_url?: string | null
          reimbursed_at?: string | null
          reimbursement_status?: string | null
          retainage_held?: number | null
          retainage_pct?: number | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_link?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tax_amount?: number | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_treatment?: string
          change_order_id?: string | null
          client_email?: string | null
          cost_item_id?: string | null
          created_at?: string
          created_by?: string
          date_incurred?: string
          date_paid?: string | null
          description?: string | null
          direction?: string
          draw_id?: string | null
          draw_number?: number | null
          due_date?: string | null
          id?: string
          invoice_id?: string | null
          job_id?: string
          lien_waiver_required?: boolean | null
          lien_waiver_signed_date?: string | null
          lien_waiver_url?: string | null
          markup_pct?: number | null
          notes?: string | null
          payer_or_payee_id?: string | null
          payer_or_payee_name?: string | null
          payer_or_payee_type?: string | null
          payment_method?: string | null
          phase?: string | null
          phase_id?: string | null
          qb_account?: string | null
          qb_class?: string | null
          qb_customer?: string | null
          qb_synced_at?: string | null
          qb_transaction_id?: string | null
          qb_vendor?: string | null
          receipt_url?: string | null
          reimbursed_at?: string | null
          reimbursement_status?: string | null
          retainage_held?: number | null
          retainage_pct?: number | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_link?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tax_amount?: number | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_transactions_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "draw_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_transactions_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "job_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      job_walkthrough_items: {
        Row: {
          completed_at: string | null
          completed_by_id: string | null
          created_at: string
          id: string
          job_id: string
          label: string
          must_document: boolean
          notes: string | null
          photo_required: boolean
          playbook_item_id: string | null
          sort_order: number
          status: string
          tenant_id: string
          updated_at: string
          work_type: string
        }
        Insert: {
          completed_at?: string | null
          completed_by_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          label: string
          must_document?: boolean
          notes?: string | null
          photo_required?: boolean
          playbook_item_id?: string | null
          sort_order?: number
          status?: string
          tenant_id: string
          updated_at?: string
          work_type: string
        }
        Update: {
          completed_at?: string | null
          completed_by_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          label?: string
          must_document?: boolean
          notes?: string | null
          photo_required?: boolean
          playbook_item_id?: string | null
          sort_order?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_walkthrough_items_completed_by_id_fkey"
            columns: ["completed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_walkthrough_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_walkthrough_items_playbook_item_id_fkey"
            columns: ["playbook_item_id"]
            isOneToOne: false
            referencedRelation: "tenant_playbook_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_walkthrough_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address: string
          arv: number | null
          assigned_pm: string | null
          assigned_rep: string | null
          assigned_subs: string | null
          before_photos_required: boolean
          bid_answers: Json | null
          bid_type: string | null
          client_email: string | null
          client_name: string | null
          client_notify: string | null
          client_phone: string | null
          client_user_id: string | null
          co_total: number | null
          contract_signed: boolean | null
          contract_signed_at: string | null
          contract_value: number | null
          cost_plus: boolean
          created_at: string | null
          default_markup_pct: number
          financial_model: string
          id: string
          intake_answers: Json | null
          labor_markup_pct: number | null
          lead_source: string | null
          lead_status: string | null
          material_markup_pct: number | null
          notes: string | null
          phase_override_at: string | null
          phase_override_by_id: string | null
          phase_override_reason: string | null
          phase_override_used: boolean
          phase_pct_complete: number | null
          pm_fee: number | null
          po_number: string | null
          referring_realtor_email: string
          referring_realtor_name: string
          referring_realtor_phone: string
          retainage_pct: number | null
          sale_price: number | null
          scope: string | null
          selections_opened_at: string | null
          sold_date: string | null
          spouse_email: string | null
          spouse_name: string | null
          spouse_phone: string | null
          sqft: string | null
          status: string | null
          status_token: string
          target_completion: string | null
          tenant_id: string | null
          updated_at: string | null
          visibility_financials: boolean | null
          year_built: string | null
        }
        Insert: {
          address: string
          arv?: number | null
          assigned_pm?: string | null
          assigned_rep?: string | null
          assigned_subs?: string | null
          before_photos_required?: boolean
          bid_answers?: Json | null
          bid_type?: string | null
          client_email?: string | null
          client_name?: string | null
          client_notify?: string | null
          client_phone?: string | null
          client_user_id?: string | null
          co_total?: number | null
          contract_signed?: boolean | null
          contract_signed_at?: string | null
          contract_value?: number | null
          cost_plus?: boolean
          created_at?: string | null
          default_markup_pct?: number
          financial_model?: string
          id?: string
          intake_answers?: Json | null
          labor_markup_pct?: number | null
          lead_source?: string | null
          lead_status?: string | null
          material_markup_pct?: number | null
          notes?: string | null
          phase_override_at?: string | null
          phase_override_by_id?: string | null
          phase_override_reason?: string | null
          phase_override_used?: boolean
          phase_pct_complete?: number | null
          pm_fee?: number | null
          po_number?: string | null
          referring_realtor_email?: string
          referring_realtor_name?: string
          referring_realtor_phone?: string
          retainage_pct?: number | null
          sale_price?: number | null
          scope?: string | null
          selections_opened_at?: string | null
          sold_date?: string | null
          spouse_email?: string | null
          spouse_name?: string | null
          spouse_phone?: string | null
          sqft?: string | null
          status?: string | null
          status_token?: string
          target_completion?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          visibility_financials?: boolean | null
          year_built?: string | null
        }
        Update: {
          address?: string
          arv?: number | null
          assigned_pm?: string | null
          assigned_rep?: string | null
          assigned_subs?: string | null
          before_photos_required?: boolean
          bid_answers?: Json | null
          bid_type?: string | null
          client_email?: string | null
          client_name?: string | null
          client_notify?: string | null
          client_phone?: string | null
          client_user_id?: string | null
          co_total?: number | null
          contract_signed?: boolean | null
          contract_signed_at?: string | null
          contract_value?: number | null
          cost_plus?: boolean
          created_at?: string | null
          default_markup_pct?: number
          financial_model?: string
          id?: string
          intake_answers?: Json | null
          labor_markup_pct?: number | null
          lead_source?: string | null
          lead_status?: string | null
          material_markup_pct?: number | null
          notes?: string | null
          phase_override_at?: string | null
          phase_override_by_id?: string | null
          phase_override_reason?: string | null
          phase_override_used?: boolean
          phase_pct_complete?: number | null
          pm_fee?: number | null
          po_number?: string | null
          referring_realtor_email?: string
          referring_realtor_name?: string
          referring_realtor_phone?: string
          retainage_pct?: number | null
          sale_price?: number | null
          scope?: string | null
          selections_opened_at?: string | null
          sold_date?: string | null
          spouse_email?: string | null
          spouse_name?: string | null
          spouse_phone?: string | null
          sqft?: string | null
          status?: string | null
          status_token?: string
          target_completion?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          visibility_financials?: boolean | null
          year_built?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_assigned_pm_fkey"
            columns: ["assigned_pm"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_phase_override_by_id_fkey"
            columns: ["phase_override_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      markup_category_config: {
        Row: {
          category: string
          created_at: string
          id: string
          markup_mode: string
          tenant_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          markup_mode: string
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          markup_mode?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "markup_category_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_orders: {
        Row: {
          actual_delivery_date: string | null
          created_at: string
          created_by_id: string | null
          id: string
          job_id: string
          line_item_ids: string[]
          materials: Json
          notes: string | null
          quote_total: number | null
          quoted_delivery_date: string | null
          status: string
          supplier_name: string | null
          tenant_id: string
          trade: string
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          created_at?: string
          created_by_id?: string | null
          id?: string
          job_id: string
          line_item_ids?: string[]
          materials?: Json
          notes?: string | null
          quote_total?: number | null
          quoted_delivery_date?: string | null
          status?: string
          supplier_name?: string | null
          tenant_id: string
          trade: string
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          created_at?: string
          created_by_id?: string | null
          id?: string
          job_id?: string
          line_item_ids?: string[]
          materials?: Json
          notes?: string | null
          quote_total?: number | null
          quoted_delivery_date?: string | null
          status?: string
          supplier_name?: string | null
          tenant_id?: string
          trade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_orders_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          job_id: string
          read: boolean | null
          recipient_id: string
          sender_id: string
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          job_id: string
          read?: boolean | null
          recipient_id: string
          sender_id: string
          tenant_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          job_id?: string
          read?: boolean | null
          recipient_id?: string
          sender_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          email_sent: boolean | null
          id: string
          job_id: string | null
          read: boolean | null
          sms_sent: boolean | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          job_id?: string | null
          read?: boolean | null
          sms_sent?: boolean | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          job_id?: string | null
          read?: boolean | null
          sms_sent?: boolean | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oh_shit_moments: {
        Row: {
          condition: string
          converted_to_co_id: string | null
          created_at: string | null
          estimated_cost_high: number | null
          estimated_cost_low: number | null
          how_to_present: string | null
          id: string
          included_in_proposal: boolean | null
          job_id: string | null
          likelihood: string | null
          risk_key: string | null
          session_id: string | null
          tenant_id: string
        }
        Insert: {
          condition: string
          converted_to_co_id?: string | null
          created_at?: string | null
          estimated_cost_high?: number | null
          estimated_cost_low?: number | null
          how_to_present?: string | null
          id?: string
          included_in_proposal?: boolean | null
          job_id?: string | null
          likelihood?: string | null
          risk_key?: string | null
          session_id?: string | null
          tenant_id?: string
        }
        Update: {
          condition?: string
          converted_to_co_id?: string | null
          created_at?: string | null
          estimated_cost_high?: number | null
          estimated_cost_low?: number | null
          how_to_present?: string | null
          id?: string
          included_in_proposal?: boolean | null
          job_id?: string | null
          likelihood?: string | null
          risk_key?: string | null
          session_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oh_shit_moments_converted_to_co_id_fkey"
            columns: ["converted_to_co_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oh_shit_moments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oh_shit_moments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "consultation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_escalations: {
        Row: {
          answered_at: string | null
          context: string | null
          created_at: string | null
          id: string
          job_id: string | null
          owner_response: string | null
          question: string
          source_agent: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          answered_at?: string | null
          context?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          owner_response?: string | null
          question: string
          source_agent: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          answered_at?: string | null
          context?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          owner_response?: string | null
          question?: string
          source_agent?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_escalations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestones: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          invoice_id: string | null
          is_retainage: boolean
          job_id: string
          label: string
          milestone_order: number
          pct: number | null
          phase_id: string | null
          schedule_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          is_retainage?: boolean
          job_id: string
          label: string
          milestone_order?: number
          pct?: number | null
          phase_id?: string | null
          schedule_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          is_retainage?: boolean
          job_id?: string
          label?: string
          milestone_order?: number
          pct?: number | null
          phase_id?: string | null
          schedule_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestones_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "job_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "payment_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedules: {
        Row: {
          contract_total: number
          created_at: string
          created_by_id: string
          id: string
          job_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contract_total?: number
          created_at?: string
          created_by_id: string
          id?: string
          job_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contract_total?: number
          created_at?: string
          created_by_id?: string
          id?: string
          job_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          category: string | null
          client_visible: boolean
          created_at: string | null
          data: string | null
          id: string
          job_id: string | null
          label: string | null
          name: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          tenant_id: string | null
          trade_tag: string | null
          type: string | null
          url: string | null
        }
        Insert: {
          category?: string | null
          client_visible?: boolean
          created_at?: string | null
          data?: string | null
          id?: string
          job_id?: string | null
          label?: string | null
          name?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          tenant_id?: string | null
          trade_tag?: string | null
          type?: string | null
          url?: string | null
        }
        Update: {
          category?: string | null
          client_visible?: boolean
          created_at?: string | null
          data?: string | null
          id?: string
          job_id?: string | null
          label?: string | null
          name?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          tenant_id?: string | null
          trade_tag?: string | null
          type?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_lookup: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          tenant_id: string
          trade: string
          unit: string
          unit_cost_high: number
          unit_cost_low: number
          unit_cost_mid: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          tenant_id: string
          trade: string
          unit: string
          unit_cost_high: number
          unit_cost_low: number
          unit_cost_mid: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          tenant_id?: string
          trade?: string
          unit?: string
          unit_cost_high?: number
          unit_cost_low?: number
          unit_cost_mid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_lookup_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_lookup_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          commission_dollar: number | null
          commission_pct: number | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          insurance_expiry: string | null
          insurance_url: string | null
          insurance_verified: boolean | null
          is_active: boolean | null
          is_platform_owner: boolean
          notification_email: boolean | null
          notification_prefs: Json | null
          notification_sms: boolean | null
          onboarding_completed: boolean
          phone: string | null
          role: string | null
          tenant_id: string | null
          trade: string | null
          w9_submitted_at: string | null
          w9_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          commission_dollar?: number | null
          commission_pct?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          insurance_expiry?: string | null
          insurance_url?: string | null
          insurance_verified?: boolean | null
          is_active?: boolean | null
          is_platform_owner?: boolean
          notification_email?: boolean | null
          notification_prefs?: Json | null
          notification_sms?: boolean | null
          onboarding_completed?: boolean
          phone?: string | null
          role?: string | null
          tenant_id?: string | null
          trade?: string | null
          w9_submitted_at?: string | null
          w9_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          commission_dollar?: number | null
          commission_pct?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_url?: string | null
          insurance_verified?: boolean | null
          is_active?: boolean | null
          is_platform_owner?: boolean
          notification_email?: boolean | null
          notification_prefs?: Json | null
          notification_sms?: boolean | null
          onboarding_completed?: boolean
          phone?: string | null
          role?: string | null
          tenant_id?: string | null
          trade?: string | null
          w9_submitted_at?: string | null
          w9_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          pdf_path: string | null
          sent_at: string | null
          status: string
          superseded_by: string | null
          tenant_id: string
          total: number | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          pdf_path?: string | null
          sent_at?: string | null
          status?: string
          superseded_by?: string | null
          tenant_id: string
          total?: number | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          pdf_path?: string | null
          sent_at?: string | null
          status?: string
          superseded_by?: string | null
          tenant_id?: string
          total?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_items: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          job_id: string
          photo_id: string | null
          room_label: string | null
          session_id: string | null
          sort: number
          status: string
          tenant_id: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          job_id: string
          photo_id?: string | null
          room_label?: string | null
          session_id?: string | null
          sort?: number
          status?: string
          tenant_id: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          job_id?: string
          photo_id?: string | null
          room_label?: string | null
          session_id?: string | null
          sort?: number
          status?: string
          tenant_id?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "consultation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          apns_token: string | null
          auth: string | null
          channel: string
          created_at: string | null
          endpoint: string | null
          id: string
          p256dh: string | null
          user_id: string
        }
        Insert: {
          apns_token?: string | null
          auth?: string | null
          channel: string
          created_at?: string | null
          endpoint?: string | null
          id?: string
          p256dh?: string | null
          user_id: string
        }
        Update: {
          apns_token?: string | null
          auth?: string | null
          channel?: string
          created_at?: string | null
          endpoint?: string | null
          id?: string
          p256dh?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_category_map: {
        Row: {
          id: string
          qb_account: string
          qb_class: string
          tenant_id: string
          tx_type: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          qb_account?: string
          qb_class?: string
          tenant_id: string
          tx_type: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          qb_account?: string
          qb_class?: string
          tenant_id?: string
          tx_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rate_book_labor: {
        Row: {
          active: boolean
          created_at: string
          id: string
          line_item: string
          notes: string | null
          rate_data: Json
          rate_high: number | null
          rate_low: number
          source: string | null
          tenant_id: string | null
          trade: string
          unit: string
          updated_at: string
          vetted: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          line_item: string
          notes?: string | null
          rate_data?: Json
          rate_high?: number | null
          rate_low: number
          source?: string | null
          tenant_id?: string | null
          trade: string
          unit: string
          updated_at?: string
          vetted?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          line_item?: string
          notes?: string | null
          rate_data?: Json
          rate_high?: number | null
          rate_low?: number
          source?: string | null
          tenant_id?: string | null
          trade?: string
          unit?: string
          updated_at?: string
          vetted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rate_book_labor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_book_material: {
        Row: {
          active: boolean
          ai_drafted: boolean
          category: string
          created_at: string
          description: string
          id: string
          kalin_adjusted: boolean
          notes: string | null
          source: string | null
          tenant_id: string | null
          tier_hi_label: string
          tier_hi_max: number | null
          tier_hi_min: number | null
          tier_low_label: string
          tier_low_max: number | null
          tier_low_min: number | null
          tier_mid_label: string
          tier_mid_max: number | null
          tier_mid_min: number | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          ai_drafted?: boolean
          category: string
          created_at?: string
          description: string
          id?: string
          kalin_adjusted?: boolean
          notes?: string | null
          source?: string | null
          tenant_id?: string | null
          tier_hi_label?: string
          tier_hi_max?: number | null
          tier_hi_min?: number | null
          tier_low_label?: string
          tier_low_max?: number | null
          tier_low_min?: number | null
          tier_mid_label?: string
          tier_mid_max?: number | null
          tier_mid_min?: number | null
          unit: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          ai_drafted?: boolean
          category?: string
          created_at?: string
          description?: string
          id?: string
          kalin_adjusted?: boolean
          notes?: string | null
          source?: string | null
          tenant_id?: string | null
          tier_hi_label?: string
          tier_hi_max?: number | null
          tier_hi_min?: number | null
          tier_low_label?: string
          tier_low_max?: number | null
          tier_low_min?: number | null
          tier_mid_label?: string
          tier_mid_max?: number | null
          tier_mid_min?: number | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_book_material_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_sessions: {
        Row: {
          client_id: string | null
          conversation_history: Json
          created_at: string
          ended_at: string | null
          extracted_data: Json
          final_estimate: Json | null
          id: string
          job_id: string | null
          outcome: string | null
          outcome_notes: string | null
          outcome_value: number | null
          source: string
          started_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          conversation_history?: Json
          created_at?: string
          ended_at?: string | null
          extracted_data?: Json
          final_estimate?: Json | null
          id?: string
          job_id?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          outcome_value?: number | null
          source?: string
          started_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          conversation_history?: Json
          created_at?: string
          ended_at?: string | null
          extracted_data?: Json
          final_estimate?: Json | null
          id?: string
          job_id?: string | null
          outcome?: string | null
          outcome_notes?: string | null
          outcome_value?: number | null
          source?: string
          started_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_turns: {
        Row: {
          content: string | null
          created_at: string
          decision_type: string | null
          id: string
          reasoning: Json | null
          role: string
          session_id: string
          tenant_id: string
          turn_number: number
        }
        Insert: {
          content?: string | null
          created_at?: string
          decision_type?: string | null
          id?: string
          reasoning?: Json | null
          role: string
          session_id: string
          tenant_id: string
          turn_number: number
        }
        Update: {
          content?: string | null
          created_at?: string
          decision_type?: string | null
          id?: string
          reasoning?: Json | null
          role?: string
          session_id?: string
          tenant_id?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sales_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_change_log: {
        Row: {
          cascade_source_id: string | null
          change_kind: string
          changed_by_id: string | null
          created_at: string
          id: string
          job_id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          schedule_item_id: string
          tenant_id: string
        }
        Insert: {
          cascade_source_id?: string | null
          change_kind: string
          changed_by_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          schedule_item_id: string
          tenant_id: string
        }
        Update: {
          cascade_source_id?: string | null
          change_kind?: string
          changed_by_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          schedule_item_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_change_log_cascade_source_id_fkey"
            columns: ["cascade_source_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_change_log_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_change_log_schedule_item_id_fkey"
            columns: ["schedule_item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_item_invitees: {
        Row: {
          id: string
          invited_at: string
          invited_by: string
          invitee_user_id: string
          responded_at: string | null
          schedule_item_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          id?: string
          invited_at?: string
          invited_by: string
          invitee_user_id: string
          responded_at?: string | null
          schedule_item_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          id?: string
          invited_at?: string
          invited_by?: string
          invitee_user_id?: string
          responded_at?: string | null
          schedule_item_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_item_invitees_schedule_item_id_fkey"
            columns: ["schedule_item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_items: {
        Row: {
          actual_finish_date: string | null
          assigned_sub_id: string | null
          auto_created: boolean
          auto_created_from_engagement_id: string | null
          auto_created_from_material_order_id: string | null
          created_at: string
          created_by_id: string | null
          duration_days: number | null
          engagement_id: string | null
          id: string
          is_milestone: boolean | null
          job_id: string
          lag_days: number | null
          notes: string | null
          notify_client: boolean
          notify_sub: boolean
          phase_id: string | null
          predecessor_ids: string[] | null
          scheduled_date: string | null
          scheduled_end_date: string | null
          scheduled_time: string | null
          status: string
          tenant_id: string
          title: string
          trade: string | null
          type: string
          updated_at: string
        }
        Insert: {
          actual_finish_date?: string | null
          assigned_sub_id?: string | null
          auto_created?: boolean
          auto_created_from_engagement_id?: string | null
          auto_created_from_material_order_id?: string | null
          created_at?: string
          created_by_id?: string | null
          duration_days?: number | null
          engagement_id?: string | null
          id?: string
          is_milestone?: boolean | null
          job_id: string
          lag_days?: number | null
          notes?: string | null
          notify_client?: boolean
          notify_sub?: boolean
          phase_id?: string | null
          predecessor_ids?: string[] | null
          scheduled_date?: string | null
          scheduled_end_date?: string | null
          scheduled_time?: string | null
          status?: string
          tenant_id: string
          title: string
          trade?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          actual_finish_date?: string | null
          assigned_sub_id?: string | null
          auto_created?: boolean
          auto_created_from_engagement_id?: string | null
          auto_created_from_material_order_id?: string | null
          created_at?: string
          created_by_id?: string | null
          duration_days?: number | null
          engagement_id?: string | null
          id?: string
          is_milestone?: boolean | null
          job_id?: string
          lag_days?: number | null
          notes?: string | null
          notify_client?: boolean
          notify_sub?: boolean
          phase_id?: string | null
          predecessor_ids?: string[] | null
          scheduled_date?: string | null
          scheduled_end_date?: string | null
          scheduled_time?: string | null
          status?: string
          tenant_id?: string
          title?: string
          trade?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_items_assigned_sub_id_fkey"
            columns: ["assigned_sub_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "job_sub_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "job_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_actions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          created_by_id: string
          fire_at: string
          fired_at: string | null
          id: string
          kind: string
          payload: Json
          priority: string
          related_entity_id: string | null
          related_entity_type: string | null
          related_job_id: string | null
          related_todo_id: string | null
          result: Json | null
          retry_count: number
          rule_key: string | null
          source: string
          status: string
          target_user_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_by_id: string
          fire_at: string
          fired_at?: string | null
          id?: string
          kind: string
          payload?: Json
          priority?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          related_job_id?: string | null
          related_todo_id?: string | null
          result?: Json | null
          retry_count?: number
          rule_key?: string | null
          source?: string
          status?: string
          target_user_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_by_id?: string
          fire_at?: string
          fired_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          priority?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          related_job_id?: string | null
          related_todo_id?: string | null
          result?: Json | null
          retry_count?: number
          rule_key?: string | null
          source?: string
          status?: string
          target_user_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_actions_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_related_todo_id_fkey"
            columns: ["related_todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_checklists: {
        Row: {
          active: boolean
          adds_trades: string[] | null
          audience: string | null
          created_at: string
          evidence_type: string
          field_key: string
          field_type: string
          helper: string | null
          id: string
          is_selection: boolean
          money_risk_rank: number
          option_labels: Json | null
          options: Json | null
          project_type: string
          question: string
          risk_note: string | null
          tenant_id: string | null
          walk_stage: boolean
        }
        Insert: {
          active?: boolean
          adds_trades?: string[] | null
          audience?: string | null
          created_at?: string
          evidence_type?: string
          field_key: string
          field_type: string
          helper?: string | null
          id?: string
          is_selection?: boolean
          money_risk_rank?: number
          option_labels?: Json | null
          options?: Json | null
          project_type: string
          question: string
          risk_note?: string | null
          tenant_id?: string | null
          walk_stage?: boolean
        }
        Update: {
          active?: boolean
          adds_trades?: string[] | null
          audience?: string | null
          created_at?: string
          evidence_type?: string
          field_key?: string
          field_type?: string
          helper?: string | null
          id?: string
          is_selection?: boolean
          money_risk_rank?: number
          option_labels?: Json | null
          options?: Json | null
          project_type?: string
          question?: string
          risk_note?: string | null
          tenant_id?: string | null
          walk_stage?: boolean
        }
        Relationships: []
      }
      scope_conflict_rules: {
        Row: {
          active: boolean
          conflict_condition: string
          created_at: string
          id: string
          question_when_conflict: string
          rule_key: string
          sources_compared: string[]
          tenant_id: string | null
        }
        Insert: {
          active?: boolean
          conflict_condition: string
          created_at?: string
          id?: string
          question_when_conflict: string
          rule_key: string
          sources_compared?: string[]
          tenant_id?: string | null
        }
        Update: {
          active?: boolean
          conflict_condition?: string
          created_at?: string
          id?: string
          question_when_conflict?: string
          rule_key?: string
          sources_compared?: string[]
          tenant_id?: string | null
        }
        Relationships: []
      }
      scope_detail_schemas: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          room_type: string
          schema: Json
          scope_tag: string
          sort_order: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          room_type: string
          schema: Json
          scope_tag: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          room_type?: string
          schema?: Json
          scope_tag?: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      scope_modules: {
        Row: {
          active: boolean
          adds_fields: Json
          adds_trades: string[] | null
          created_at: string
          id: string
          label: string
          module_key: string
          tenant_id: string | null
          trigger_phrases: string[]
        }
        Insert: {
          active?: boolean
          adds_fields?: Json
          adds_trades?: string[] | null
          created_at?: string
          id?: string
          label: string
          module_key: string
          tenant_id?: string | null
          trigger_phrases?: string[]
        }
        Update: {
          active?: boolean
          adds_fields?: Json
          adds_trades?: string[] | null
          created_at?: string
          id?: string
          label?: string
          module_key?: string
          tenant_id?: string | null
          trigger_phrases?: string[]
        }
        Relationships: []
      }
      scope_option_images: {
        Row: {
          active: boolean
          created_at: string
          field_key: string
          id: string
          option_key: string
          project_type: string | null
          storage_path: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          field_key: string
          id?: string
          option_key: string
          project_type?: string | null
          storage_path: string
        }
        Update: {
          active?: boolean
          created_at?: string
          field_key?: string
          id?: string
          option_key?: string
          project_type?: string | null
          storage_path?: string
        }
        Relationships: []
      }
      scope_option_suppressions: {
        Row: {
          active: boolean
          created_at: string
          gate_field_key: string
          gate_option_key: string
          id: string
          project_type: string
          suppressed_field_key: string
          tenant_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          gate_field_key: string
          gate_option_key: string
          id?: string
          project_type: string
          suppressed_field_key: string
          tenant_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          gate_field_key?: string
          gate_option_key?: string
          id?: string
          project_type?: string
          suppressed_field_key?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scope_option_suppressions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_option_trades: {
        Row: {
          active: boolean
          created_at: string
          field_key: string
          id: string
          option_key: string
          project_type: string | null
          tenant_id: string | null
          trade: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          field_key: string
          id?: string
          option_key: string
          project_type?: string | null
          tenant_id?: string | null
          trade: string
        }
        Update: {
          active?: boolean
          created_at?: string
          field_key?: string
          id?: string
          option_key?: string
          project_type?: string | null
          tenant_id?: string | null
          trade?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_option_trades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_risks: {
        Row: {
          active: boolean
          consideration: string
          cost_high: number | null
          cost_low: number | null
          created_at: string
          field_key: string | null
          id: string
          internal_note: string | null
          is_draft: boolean
          likelihood: string
          project_type: string
          risk_key: string
          tenant_id: string | null
          title: string | null
          trade: string | null
          trigger_type: string
          trigger_values: string[]
        }
        Insert: {
          active?: boolean
          consideration: string
          cost_high?: number | null
          cost_low?: number | null
          created_at?: string
          field_key?: string | null
          id?: string
          internal_note?: string | null
          is_draft?: boolean
          likelihood?: string
          project_type: string
          risk_key: string
          tenant_id?: string | null
          title?: string | null
          trade?: string | null
          trigger_type?: string
          trigger_values?: string[]
        }
        Update: {
          active?: boolean
          consideration?: string
          cost_high?: number | null
          cost_low?: number | null
          created_at?: string
          field_key?: string | null
          id?: string
          internal_note?: string | null
          is_draft?: boolean
          likelihood?: string
          project_type?: string
          risk_key?: string
          tenant_id?: string | null
          title?: string | null
          trade?: string | null
          trigger_type?: string
          trigger_values?: string[]
        }
        Relationships: []
      }
      sequence_enrollments: {
        Row: {
          completed_at: string | null
          contact_id: string | null
          current_step: number | null
          enrolled_at: string | null
          id: string
          next_send_at: string | null
          sequence_id: string | null
          status: string | null
          sub_id: string | null
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          contact_id?: string | null
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          next_send_at?: string | null
          sequence_id?: string | null
          status?: string | null
          sub_id?: string | null
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string | null
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          next_send_at?: string | null
          sequence_id?: string | null
          status?: string | null
          sub_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string | null
          steps: Json
          tenant_id: string
          trigger: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string | null
          steps?: Json
          tenant_id: string
          trigger?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string | null
          steps?: Json
          tenant_id?: string
          trigger?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visit_checklist_items: {
        Row: {
          completed_at: string | null
          completed_by_id: string | null
          created_at: string
          id: string
          item_name: string
          item_order: number
          notes: string | null
          schedule_item_id: string
          status: string
          template_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by_id?: string | null
          created_at?: string
          id?: string
          item_name: string
          item_order: number
          notes?: string | null
          schedule_item_id: string
          status?: string
          template_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by_id?: string | null
          created_at?: string
          id?: string
          item_name?: string
          item_order?: number
          notes?: string | null
          schedule_item_id?: string
          status?: string
          template_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visit_checklist_items_completed_by_id_fkey"
            columns: ["completed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visit_checklist_items_schedule_item_id_fkey"
            columns: ["schedule_item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          job_id: string
          sender_id: string
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          job_id: string
          sender_id: string
          tenant_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          job_id?: string
          sender_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by_id: string | null
          id: string
          method: string
          notes: string | null
          paid_date: string
          reference: string | null
          sub_invoice_id: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_id?: string | null
          id?: string
          method: string
          notes?: string | null
          paid_date: string
          reference?: string | null
          sub_invoice_id: string
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_id?: string | null
          id?: string
          method?: string
          notes?: string | null
          paid_date?: string
          reference?: string | null
          sub_invoice_id?: string
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_invoice_payments_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoice_payments_sub_invoice_id_fkey"
            columns: ["sub_invoice_id"]
            isOneToOne: false
            referencedRelation: "sub_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoice_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "job_cost_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoice_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "job_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoice_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoice_payments_voided_by_id_fkey"
            columns: ["voided_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_invoices: {
        Row: {
          accrual_transaction_id: string | null
          amount: number
          approved_at: string | null
          approved_by_id: string | null
          auto_generated_number: boolean
          created_at: string
          created_by_id: string | null
          currency: string
          description: string | null
          dispute_reason: string | null
          disputed: boolean
          disputed_at: string | null
          disputed_by_id: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_file_id: string | null
          invoice_number: string
          job_id: string
          lien_waiver_file_id: string | null
          line_items: Json | null
          related_schedule_item_id: string | null
          sub_contact_id: string
          submitted_via: string
          tenant_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_id: string | null
        }
        Insert: {
          accrual_transaction_id?: string | null
          amount: number
          approved_at?: string | null
          approved_by_id?: string | null
          auto_generated_number?: boolean
          created_at?: string
          created_by_id?: string | null
          currency?: string
          description?: string | null
          dispute_reason?: string | null
          disputed?: boolean
          disputed_at?: string | null
          disputed_by_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_file_id?: string | null
          invoice_number: string
          job_id: string
          lien_waiver_file_id?: string | null
          line_items?: Json | null
          related_schedule_item_id?: string | null
          sub_contact_id: string
          submitted_via?: string
          tenant_id: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_id?: string | null
        }
        Update: {
          accrual_transaction_id?: string | null
          amount?: number
          approved_at?: string | null
          approved_by_id?: string | null
          auto_generated_number?: boolean
          created_at?: string
          created_by_id?: string | null
          currency?: string
          description?: string | null
          dispute_reason?: string | null
          disputed?: boolean
          disputed_at?: string | null
          disputed_by_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_file_id?: string | null
          invoice_number?: string
          job_id?: string
          lien_waiver_file_id?: string | null
          line_items?: Json | null
          related_schedule_item_id?: string | null
          sub_contact_id?: string
          submitted_via?: string
          tenant_id?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_invoices_accrual_transaction_id_fkey"
            columns: ["accrual_transaction_id"]
            isOneToOne: false
            referencedRelation: "job_cost_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_accrual_transaction_id_fkey"
            columns: ["accrual_transaction_id"]
            isOneToOne: false
            referencedRelation: "job_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_accrual_transaction_id_fkey"
            columns: ["accrual_transaction_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_disputed_by_id_fkey"
            columns: ["disputed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_invoice_file_id_fkey"
            columns: ["invoice_file_id"]
            isOneToOne: false
            referencedRelation: "job_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_lien_waiver_file_id_fkey"
            columns: ["lien_waiver_file_id"]
            isOneToOne: false
            referencedRelation: "job_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_related_schedule_item_id_fkey"
            columns: ["related_schedule_item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_sub_contact_id_fkey"
            columns: ["sub_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_invoices_voided_by_id_fkey"
            columns: ["voided_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_performance: {
        Row: {
          avg_response_hours: number | null
          cos_caused: number | null
          id: string
          jobs_assigned: number | null
          jobs_completed: number | null
          last_job_date: string | null
          phases_late: number | null
          phases_on_time: number | null
          score: number | null
          sub_id: string | null
          tenant_id: string
          trade: string | null
          updated_at: string | null
        }
        Insert: {
          avg_response_hours?: number | null
          cos_caused?: number | null
          id?: string
          jobs_assigned?: number | null
          jobs_completed?: number | null
          last_job_date?: string | null
          phases_late?: number | null
          phases_on_time?: number | null
          score?: number | null
          sub_id?: string | null
          tenant_id: string
          trade?: string | null
          updated_at?: string | null
        }
        Update: {
          avg_response_hours?: number | null
          cos_caused?: number | null
          id?: string
          jobs_assigned?: number | null
          jobs_completed?: number | null
          last_job_date?: string | null
          phases_late?: number | null
          phases_on_time?: number | null
          score?: number | null
          sub_id?: string | null
          tenant_id?: string
          trade?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_performance_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_pricing: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          pricing_mode: string
          rate: number | null
          sub_id: string
          tenant_id: string
          trade: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          pricing_mode: string
          rate?: number | null
          sub_id: string
          tenant_id: string
          trade: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          pricing_mode?: string
          rate?: number | null
          sub_id?: string
          tenant_id?: string
          trade?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_pricing_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_pricing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_ratings: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          job_id: string | null
          rater_id: string
          stars: number
          sub_id: string
          tenant_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          rater_id: string
          stars: number
          sub_id: string
          tenant_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          rater_id?: string
          stars?: number
          sub_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_ratings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_ratings_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_reviews: {
        Row: {
          cleanliness_score: number | null
          communication_score: number | null
          created_at: string | null
          id: string
          job_id: string | null
          notes: string | null
          overall_score: number | null
          quality_score: number | null
          reviewer_id: string
          sub_id: string
          tenant_id: string
          timeliness_score: number | null
        }
        Insert: {
          cleanliness_score?: number | null
          communication_score?: number | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          overall_score?: number | null
          quality_score?: number | null
          reviewer_id: string
          sub_id: string
          tenant_id: string
          timeliness_score?: number | null
        }
        Update: {
          cleanliness_score?: number | null
          communication_score?: number | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          overall_score?: number | null
          quality_score?: number | null
          reviewer_id?: string
          sub_id?: string
          tenant_id?: string
          timeliness_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_reviews_sub_id_fkey"
            columns: ["sub_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          draft_type: string
          id: string
          job_id: string
          snapshot: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft_type: string
          id?: string
          job_id: string
          snapshot: Json
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft_type?: string
          id?: string
          job_id?: string
          snapshot?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_drafts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          room_type: string
          scope_definition: Json
          tenant_id: string | null
          trade: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          room_type: string
          scope_definition: Json
          tenant_id?: string | null
          trade: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          room_type?: string
          scope_definition?: Json
          tenant_id?: string | null
          trade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takeoff_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      takeoff_unit_costs: {
        Row: {
          active: boolean
          base_rate: number | null
          category: string
          coverage_sf: number | null
          created_at: string
          id: string
          material_name: string | null
          multipliers: Json
          notes: string | null
          room_type: string | null
          tenant_id: string | null
          trade: string
          unit: string
          updated_at: string
          vetted: boolean
          waste_pct: number
        }
        Insert: {
          active?: boolean
          base_rate?: number | null
          category?: string
          coverage_sf?: number | null
          created_at?: string
          id?: string
          material_name?: string | null
          multipliers?: Json
          notes?: string | null
          room_type?: string | null
          tenant_id?: string | null
          trade: string
          unit: string
          updated_at?: string
          vetted?: boolean
          waste_pct?: number
        }
        Update: {
          active?: boolean
          base_rate?: number | null
          category?: string
          coverage_sf?: number | null
          created_at?: string
          id?: string
          material_name?: string | null
          multipliers?: Json
          notes?: string | null
          room_type?: string | null
          tenant_id?: string | null
          trade?: string
          unit?: string
          updated_at?: string
          vetted?: boolean
          waste_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "takeoff_unit_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      template_scope_subsets: {
        Row: {
          id: string
          label: string
          room_type: string
          scope_tag: string
          sort_order: number | null
          tenant_id: string | null
          trades: string[]
        }
        Insert: {
          id?: string
          label: string
          room_type: string
          scope_tag: string
          sort_order?: number | null
          tenant_id?: string | null
          trades: string[]
        }
        Update: {
          id?: string
          label?: string
          room_type?: string
          scope_tag?: string
          sort_order?: number | null
          tenant_id?: string | null
          trades?: string[]
        }
        Relationships: []
      }
      tenant_file_subcategories: {
        Row: {
          category: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          subcategory: string
          tenant_id: string
        }
        Insert: {
          category: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          subcategory: string
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          subcategory?: string
          tenant_id?: string
        }
        Relationships: []
      }
      tenant_playbook_items: {
        Row: {
          created_at: string
          id: string
          label: string
          must_document: boolean
          photo_required: boolean
          sort_order: number
          tenant_id: string
          work_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          must_document?: boolean
          photo_required?: boolean
          sort_order?: number
          tenant_id: string
          work_type: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          must_document?: boolean
          photo_required?: boolean
          sort_order?: number
          tenant_id?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_playbook_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_trade_visibility: {
        Row: {
          active: boolean
          created_at: string
          tenant_id: string
          trade_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          tenant_id: string
          trade_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          tenant_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_trade_visibility_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_trade_visibility_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trade_taxonomy"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          business_address: string | null
          business_email: string | null
          business_phone: string | null
          created_at: string | null
          hotword_short: string | null
          id: string
          logo_url: string | null
          name: string
          notification_rules: Json | null
          plan: string | null
          pricing_policy: Json | null
          primary_color: string | null
          slug: string
        }
        Insert: {
          business_address?: string | null
          business_email?: string | null
          business_phone?: string | null
          created_at?: string | null
          hotword_short?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notification_rules?: Json | null
          plan?: string | null
          pricing_policy?: Json | null
          primary_color?: string | null
          slug: string
        }
        Update: {
          business_address?: string | null
          business_email?: string | null
          business_phone?: string | null
          created_at?: string | null
          hotword_short?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notification_rules?: Json | null
          plan?: string | null
          pricing_policy?: Json | null
          primary_color?: string | null
          slug?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          in_lat: number | null
          in_lng: number | null
          job_id: string
          notes: string | null
          out_lat: number | null
          out_lng: number | null
          source: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          in_lat?: number | null
          in_lng?: number | null
          job_id: string
          notes?: string | null
          out_lat?: number | null
          out_lng?: number | null
          source?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          in_lat?: number | null
          in_lng?: number | null
          job_id?: string
          notes?: string | null
          out_lat?: number | null
          out_lng?: number | null
          source?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          assigned_to_user_id: string | null
          bug_report_id: string | null
          created_at: string
          created_by_id: string | null
          due_date: string | null
          id: string
          job_id: string | null
          notes: string | null
          payload: Json | null
          priority: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          resolved_at: string | null
          resolved_reason: string | null
          source: string
          status: string
          tenant_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          bug_report_id?: string | null
          created_at?: string
          created_by_id?: string | null
          due_date?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          payload?: Json | null
          priority?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolved_at?: string | null
          resolved_reason?: string | null
          source?: string
          status?: string
          tenant_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          bug_report_id?: string | null
          created_at?: string
          created_by_id?: string | null
          due_date?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          payload?: Json | null
          priority?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolved_at?: string | null
          resolved_reason?: string | null
          source?: string
          status?: string
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_bug_report_id_fkey"
            columns: ["bug_report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_actuals: {
        Row: {
          bid_count: number
          captured_at: string
          captured_method: string
          created_at: string
          id: string
          job_completion_date: string | null
          job_id: string
          job_phase_durations: Json | null
          labor_cost: number | null
          labor_source: string | null
          material_cost: number | null
          material_order_count: number
          material_source: string | null
          notes: string | null
          tenant_id: string
          total_cost: number | null
          trade: string
          updated_at: string
        }
        Insert: {
          bid_count?: number
          captured_at?: string
          captured_method?: string
          created_at?: string
          id?: string
          job_completion_date?: string | null
          job_id: string
          job_phase_durations?: Json | null
          labor_cost?: number | null
          labor_source?: string | null
          material_cost?: number | null
          material_order_count?: number
          material_source?: string | null
          notes?: string | null
          tenant_id: string
          total_cost?: number | null
          trade: string
          updated_at?: string
        }
        Update: {
          bid_count?: number
          captured_at?: string
          captured_method?: string
          created_at?: string
          id?: string
          job_completion_date?: string | null
          job_id?: string
          job_phase_durations?: Json | null
          labor_cost?: number | null
          labor_source?: string | null
          material_cost?: number | null
          material_order_count?: number
          material_source?: string | null
          notes?: string | null
          tenant_id?: string
          total_cost?: number | null
          trade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_actuals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_dependencies: {
        Row: {
          created_at: string
          id: string
          lag_days: number
          notes: string | null
          predecessor_trade: string
          successor_trade: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lag_days?: number
          notes?: string | null
          predecessor_trade: string
          successor_trade: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lag_days?: number
          notes?: string | null
          predecessor_trade?: string
          successor_trade?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_dependencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_material_lead_times: {
        Row: {
          created_at: string
          id: string
          lead_days: number
          tenant_id: string | null
          trade: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_days: number
          tenant_id?: string | null
          trade: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_days?: number
          tenant_id?: string | null
          trade?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_material_lead_times_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_phase_map: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          phase_name: string
          tenant_id: string | null
          trade: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          phase_name: string
          tenant_id?: string | null
          trade: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          phase_name?: string
          tenant_id?: string | null
          trade?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_phase_map_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_taxonomy: {
        Row: {
          created_at: string
          default_unit: string | null
          default_waste_pct: number | null
          display_order: number
          id: string
          notes: string | null
          parent_trade: string
          sub_trade: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          default_unit?: string | null
          default_waste_pct?: number | null
          display_order?: number
          id?: string
          notes?: string | null
          parent_trade: string
          sub_trade?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          default_unit?: string | null
          default_waste_pct?: number | null
          display_order?: number
          id?: string
          notes?: string | null
          parent_trade?: string
          sub_trade?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_taxonomy_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_templates: {
        Row: {
          body_template: string
          conditional: boolean
          created_at: string
          final: boolean
          id: string
          notice: string | null
          requires_payment_gate: boolean
          state: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body_template: string
          conditional: boolean
          created_at?: string
          final: boolean
          id?: string
          notice?: string | null
          requires_payment_gate?: boolean
          state: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          conditional?: boolean
          created_at?: string
          final?: boolean
          id?: string
          notice?: string | null
          requires_payment_gate?: boolean
          state?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      job_cost_invoices: {
        Row: {
          amount: number | null
          cost_item_id: string | null
          created_at: string | null
          date: string | null
          id: string | null
          invoice_file_name: string | null
          invoice_file_url: string | null
          job_id: string | null
          lien_waiver_file_name: string | null
          lien_waiver_file_url: string | null
          lien_waiver_signed_date: string | null
          paid: boolean | null
          tenant_id: string | null
        }
        Insert: {
          amount?: number | null
          cost_item_id?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          invoice_file_name?: never
          invoice_file_url?: string | null
          job_id?: string | null
          lien_waiver_file_name?: never
          lien_waiver_file_url?: string | null
          lien_waiver_signed_date?: string | null
          paid?: never
          tenant_id?: string | null
        }
        Update: {
          amount?: number | null
          cost_item_id?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          invoice_file_name?: never
          invoice_file_url?: string | null
          job_id?: string | null
          lien_waiver_file_name?: never
          lien_waiver_file_url?: string | null
          lien_waiver_signed_date?: string | null
          paid?: never
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          client_email: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string | null
          job_id: string | null
          paid_at: string | null
          paid_date: string | null
          payment_type: string | null
          status: string | null
          stripe_checkout_url: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          tenant_id: string | null
        }
        Insert: {
          amount?: number | null
          client_email?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          job_id?: string | null
          paid_at?: string | null
          paid_date?: never
          payment_type?: string | null
          status?: string | null
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount?: number | null
          client_email?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          job_id?: string | null
          paid_at?: string | null
          paid_date?: never
          payment_type?: string | null
          status?: string | null
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_sub_invoice_payment_with_ledger: {
        Args: {
          p_amount: number
          p_method: string
          p_notes?: string
          p_paid_date: string
          p_reference?: string
          p_sub_invoice_id: string
        }
        Returns: {
          new_status: string
          payment_id: string
          transaction_id: string
        }[]
      }
      can_access_job: { Args: { p_job_id: string }; Returns: boolean }
      cascade_draw_paid_by_draw: { Args: { p_draw_id: string }; Returns: Json }
      cascade_draw_paid_to_transactions: {
        Args: { p_invoice_id: string }
        Returns: number
      }
      compose_draw: {
        Args: {
          p_apply_bucket: boolean
          p_description: string
          p_job_id: string
          p_line_items: Json
          p_target_amount: number
          p_title: string
        }
        Returns: Json
      }
      compute_phase_pct: {
        Args: { p_job_id: string; p_status: string }
        Returns: number
      }
      compute_sub_invoice_status: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      edit_sub_invoice_with_ledger: {
        Args: {
          p_amount?: number
          p_description?: string
          p_due_date?: string
          p_invoice_date?: string
          p_invoice_id: string
          p_line_items?: Json
        }
        Returns: {
          new_amount: number
          new_status: string
        }[]
      }
      ensure_selections_open: { Args: { p_job_id: string }; Returns: string }
      get_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_job_co_total: { Args: { p_job_id: string }; Returns: number }
      get_my_role: { Args: never; Returns: string }
      get_my_tenant_id: { Args: never; Returns: string }
      mark_draw_paid_release_retainage: {
        Args: {
          p_draw_id: string
          p_min_invoiced_amount?: number
          p_paid_amount: number
        }
        Returns: Json
      }
      next_invoice_number: { Args: { p_tenant_id: string }; Returns: string }
      resync_sub_invoice_accrual: {
        Args: { p_effective_date?: string; p_invoice_id: string }
        Returns: undefined
      }
      reverse_draw_paid_cascade: {
        Args: { p_invoice_id: string }
        Returns: number
      }
      time_clock_switch: {
        Args: { p_job_id: string; p_lat?: number; p_lng?: number }
        Returns: {
          clock_in: string
          clock_out: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          in_lat: number | null
          in_lng: number | null
          job_id: string
          notes: string | null
          out_lat: number | null
          out_lng: number | null
          source: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unvoid_sub_invoice: {
        Args: { p_invoice_id: string }
        Returns: {
          invoice_id: string
        }[]
      }
      void_draw: { Args: { p_draw_id: string }; Returns: Json }
      void_sub_invoice_payment_with_ledger: {
        Args: { p_payment_id: string; p_void_reason?: string }
        Returns: {
          new_status: string
          payment_id: string
          transaction_id: string
        }[]
      }
      void_sub_invoice_with_cascade: {
        Args: { p_invoice_id: string; p_void_reason: string }
        Returns: {
          invoice_id: string
          payments_voided: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
