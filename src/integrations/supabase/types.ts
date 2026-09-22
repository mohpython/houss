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
      appointments: {
        Row: {
          at_home: boolean
          completed_at: string | null
          created_at: string
          id: string
          last_reminder_at: string | null
          patient_ack_at: string | null
          patient_address: string | null
          patient_completed_at: string | null
          patient_id: string
          patient_lat: number | null
          patient_lng: number | null
          patient_phone: string | null
          practitioner_id: string
          practitioner_notes: string | null
          prescribed_items: Json
          proposed_at: string | null
          reason: string
          rejection_reason: string | null
          reminder_count: number
          reminders_sent: Json
          report: string | null
          requested_at: string
          scheduled_at: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          symptoms: string | null
          triage: Json | null
          updated_at: string
        }
        Insert: {
          at_home?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          last_reminder_at?: string | null
          patient_ack_at?: string | null
          patient_address?: string | null
          patient_completed_at?: string | null
          patient_id: string
          patient_lat?: number | null
          patient_lng?: number | null
          patient_phone?: string | null
          practitioner_id: string
          practitioner_notes?: string | null
          prescribed_items?: Json
          proposed_at?: string | null
          reason: string
          rejection_reason?: string | null
          reminder_count?: number
          reminders_sent?: Json
          report?: string | null
          requested_at?: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          symptoms?: string | null
          triage?: Json | null
          updated_at?: string
        }
        Update: {
          at_home?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          last_reminder_at?: string | null
          patient_ack_at?: string | null
          patient_address?: string | null
          patient_completed_at?: string | null
          patient_id?: string
          patient_lat?: number | null
          patient_lng?: number | null
          patient_phone?: string | null
          practitioner_id?: string
          practitioner_notes?: string | null
          prescribed_items?: Json
          proposed_at?: string | null
          reason?: string
          rejection_reason?: string | null
          reminder_count?: number
          reminders_sent?: Json
          report?: string | null
          requested_at?: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          symptoms?: string | null
          triage?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          meta: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          meta?: Json | null
        }
        Relationships: []
      }
      courier_positions: {
        Row: {
          courier_id: string
          id: string
          lat: number
          lng: number
          recorded_at: string
          reservation_id: string | null
        }
        Insert: {
          courier_id: string
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          reservation_id?: string | null
        }
        Update: {
          courier_id?: string
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_positions_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_positions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          created_at: string
          current_lat: number | null
          current_lng: number | null
          full_name: string
          id: string
          is_online: boolean
          last_position_at: string | null
          license_number: string | null
          phone: string
          status: Database["public"]["Enums"]["courier_status"]
          updated_at: string
          user_id: string
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          full_name: string
          id?: string
          is_online?: boolean
          last_position_at?: string | null
          license_number?: string | null
          phone: string
          status?: Database["public"]["Enums"]["courier_status"]
          updated_at?: string
          user_id: string
          vehicle_type?: string
        }
        Update: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          full_name?: string
          id?: string
          is_online?: boolean
          last_position_at?: string | null
          license_number?: string | null
          phone?: string
          status?: Database["public"]["Enums"]["courier_status"]
          updated_at?: string
          user_id?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          language: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          pharmacy_id: string | null
          phone: string
          rating: number
          reservation_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          pharmacy_id?: string | null
          phone: string
          rating: number
          reservation_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          pharmacy_id?: string | null
          phone?: string
          rating?: number
          reservation_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: string
          medicine_id: string
          pharmacy_id: string
          price: number | null
          stock_qty: number
          updated_at: string
        }
        Insert: {
          id?: string
          medicine_id: string
          pharmacy_id: string
          price?: number | null
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          id?: string
          medicine_id?: string
          pharmacy_id?: string
          price?: number | null
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      medicines: {
        Row: {
          created_at: string
          form: string | null
          generic_name: string | null
          id: string
          normalized_name: string
          strength: string | null
        }
        Insert: {
          created_at?: string
          form?: string | null
          generic_name?: string | null
          id?: string
          normalized_name: string
          strength?: string | null
        }
        Update: {
          created_at?: string
          form?: string | null
          generic_name?: string | null
          id?: string
          normalized_name?: string
          strength?: string | null
        }
        Relationships: []
      }
      neighborhoods: {
        Row: {
          city: string
          created_at: string
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          updated_at: string
        }
        Insert: {
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pharmacies: {
        Row: {
          address: string
          city: string | null
          claim_email: string | null
          created_at: string
          google_place_id: string | null
          id: string
          lat: number | null
          license_number: string
          lng: number | null
          name: string
          opening_hours: Json | null
          owner_user_id: string | null
          phone: string | null
          rating: number | null
          status: Database["public"]["Enums"]["pharmacy_status"]
          updated_at: string
        }
        Insert: {
          address: string
          city?: string | null
          claim_email?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          lat?: number | null
          license_number: string
          lng?: number | null
          name: string
          opening_hours?: Json | null
          owner_user_id?: string | null
          phone?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["pharmacy_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string | null
          claim_email?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          lat?: number | null
          license_number?: string
          lng?: number | null
          name?: string
          opening_hours?: Json | null
          owner_user_id?: string | null
          phone?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["pharmacy_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_staff: {
        Row: {
          created_at: string
          id: string
          pharmacy_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pharmacy_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pharmacy_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_staff_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioner_specialties: {
        Row: {
          code: string
          created_at: string
          id: string
          keywords: string[]
          label_ar: string
          label_en: string
          label_fr: string
          practitioner_type: Database["public"]["Enums"]["practitioner_type"]
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          keywords?: string[]
          label_ar: string
          label_en: string
          label_fr: string
          practitioner_type?: Database["public"]["Enums"]["practitioner_type"]
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          keywords?: string[]
          label_ar?: string
          label_en?: string
          label_fr?: string
          practitioner_type?: Database["public"]["Enums"]["practitioner_type"]
        }
        Relationships: []
      }
      practitioners: {
        Row: {
          address: string | null
          bio: string | null
          city: string | null
          claim_email: string | null
          consultation_fee: number | null
          created_at: string
          full_name: string
          home_visits: boolean
          id: string
          is_available: boolean
          lat: number | null
          license_number: string | null
          lng: number | null
          opening_hours: Json | null
          phone: string | null
          specialty_code: string
          status: Database["public"]["Enums"]["practitioner_status"]
          type: Database["public"]["Enums"]["practitioner_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          bio?: string | null
          city?: string | null
          claim_email?: string | null
          consultation_fee?: number | null
          created_at?: string
          full_name: string
          home_visits?: boolean
          id?: string
          is_available?: boolean
          lat?: number | null
          license_number?: string | null
          lng?: number | null
          opening_hours?: Json | null
          phone?: string | null
          specialty_code: string
          status?: Database["public"]["Enums"]["practitioner_status"]
          type: Database["public"]["Enums"]["practitioner_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          bio?: string | null
          city?: string | null
          claim_email?: string | null
          consultation_fee?: number | null
          created_at?: string
          full_name?: string
          home_visits?: boolean
          id?: string
          is_available?: boolean
          lat?: number | null
          license_number?: string | null
          lng?: number | null
          opening_hours?: Json | null
          phone?: string | null
          specialty_code?: string
          status?: Database["public"]["Enums"]["practitioner_status"]
          type?: Database["public"]["Enums"]["practitioner_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioners_specialty_code_fkey"
            columns: ["specialty_code"]
            isOneToOne: false
            referencedRelation: "practitioner_specialties"
            referencedColumns: ["code"]
          },
        ]
      }
      prescription_items: {
        Row: {
          created_at: string
          dosage: string | null
          duration: string | null
          id: string
          instructions: string | null
          medicine_name_raw: string
          normalized_medicine_id: string | null
          patient_verified: boolean
          prescription_id: string
          quantity: string | null
          strength: string | null
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          duration?: string | null
          id?: string
          instructions?: string | null
          medicine_name_raw: string
          normalized_medicine_id?: string | null
          patient_verified?: boolean
          prescription_id: string
          quantity?: string | null
          strength?: string | null
        }
        Update: {
          created_at?: string
          dosage?: string | null
          duration?: string | null
          id?: string
          instructions?: string | null
          medicine_name_raw?: string
          normalized_medicine_id?: string | null
          patient_verified?: boolean
          prescription_id?: string
          quantity?: string | null
          strength?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_normalized_medicine_id_fkey"
            columns: ["normalized_medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          ai_confidence: number | null
          ai_raw: Json | null
          created_at: string
          date_source: string
          doctor_name: string | null
          file_mime: string
          file_path: string
          hospital: string | null
          id: string
          is_expired: boolean
          patient_id: string
          patient_name: string | null
          prescription_date: string | null
          prescription_date_raw: string | null
          review_reasons: Json
          review_severity: string | null
          review_status: string | null
          source: string
          status: Database["public"]["Enums"]["prescription_status"]
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_raw?: Json | null
          created_at?: string
          date_source?: string
          doctor_name?: string | null
          file_mime: string
          file_path: string
          hospital?: string | null
          id?: string
          is_expired?: boolean
          patient_id: string
          patient_name?: string | null
          prescription_date?: string | null
          prescription_date_raw?: string | null
          review_reasons?: Json
          review_severity?: string | null
          review_status?: string | null
          source?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_raw?: Json | null
          created_at?: string
          date_source?: string
          doctor_name?: string | null
          file_mime?: string
          file_path?: string
          hospital?: string | null
          id?: string
          is_expired?: boolean
          patient_id?: string
          patient_name?: string | null
          prescription_date?: string | null
          prescription_date_raw?: string | null
          review_reasons?: Json
          review_severity?: string | null
          review_status?: string | null
          source?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          language: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          language?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          language?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reservation_items: {
        Row: {
          available: boolean
          created_at: string
          id: string
          prescription_item_id: string
          price: number | null
          reservation_id: string
          unit_price: number | null
        }
        Insert: {
          available?: boolean
          created_at?: string
          id?: string
          prescription_item_id: string
          price?: number | null
          reservation_id: string
          unit_price?: number | null
        }
        Update: {
          available?: boolean
          created_at?: string
          id?: string
          prescription_item_id?: string
          price?: number | null
          reservation_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_items_prescription_item_id_fkey"
            columns: ["prescription_item_id"]
            isOneToOne: false
            referencedRelation: "prescription_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_items_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          accepted_at: string | null
          assigned_at: string | null
          code_attempts: number
          courier_id: string | null
          created_at: string
          delivered_at: string | null
          delivery_fee: number
          delivery_mode: string
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          fulfillment_method: string
          id: string
          is_partial: boolean
          items_total: number
          missing_items: Json
          neighborhood_id: string | null
          notes: string | null
          paid_at: string | null
          patient_address: string | null
          patient_id: string
          patient_lat: number | null
          patient_lng: number | null
          patient_name: string | null
          patient_phone: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          pharmacy_id: string
          picked_up_at: string | null
          pickup_code: string | null
          pickup_code_verified_at: string | null
          prescription_id: string
          ready_at: string | null
          receipt_code: string | null
          receipt_code_verified_at: string | null
          source: string
          status: Database["public"]["Enums"]["reservation_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string | null
          code_attempts?: number
          courier_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_fee?: number
          delivery_mode?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          fulfillment_method?: string
          id?: string
          is_partial?: boolean
          items_total?: number
          missing_items?: Json
          neighborhood_id?: string | null
          notes?: string | null
          paid_at?: string | null
          patient_address?: string | null
          patient_id: string
          patient_lat?: number | null
          patient_lng?: number | null
          patient_name?: string | null
          patient_phone?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          pharmacy_id: string
          picked_up_at?: string | null
          pickup_code?: string | null
          pickup_code_verified_at?: string | null
          prescription_id: string
          ready_at?: string | null
          receipt_code?: string | null
          receipt_code_verified_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string | null
          code_attempts?: number
          courier_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_fee?: number
          delivery_mode?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          fulfillment_method?: string
          id?: string
          is_partial?: boolean
          items_total?: number
          missing_items?: Json
          neighborhood_id?: string | null
          notes?: string | null
          paid_at?: string | null
          patient_address?: string | null
          patient_id?: string
          patient_lat?: number | null
          patient_lng?: number | null
          patient_name?: string | null
          patient_phone?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          pharmacy_id?: string
          picked_up_at?: string | null
          pickup_code?: string | null
          pickup_code_verified_at?: string | null
          prescription_id?: string
          ready_at?: string | null
          receipt_code?: string | null
          receipt_code_verified_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_courier_fk"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_events: {
        Row: {
          created_at: string
          message_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          context: Json
          created_at: string
          id: string
          language: string
          last_message_at: string | null
          state: string
          updated_at: string
          user_id: string | null
          wa_name: string | null
          wa_phone: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          language?: string
          last_message_at?: string | null
          state?: string
          updated_at?: string
          user_id?: string | null
          wa_name?: string | null
          wa_phone: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          language?: string
          last_message_at?: string | null
          state?: string
          updated_at?: string
          user_id?: string | null
          wa_name?: string | null
          wa_phone?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          key: string
          lang: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          key: string
          lang: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          key?: string
          lang?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role:
        | "patient"
        | "pharmacy_staff"
        | "admin"
        | "courier"
        | "doctor"
        | "nurse"
      appointment_status:
        | "requested"
        | "accepted"
        | "rescheduled"
        | "rejected"
        | "completed"
        | "cancelled"
      courier_status: "pending" | "approved" | "rejected"
      delivery_status:
        | "unassigned"
        | "assigned"
        | "picked_up"
        | "en_route"
        | "delivered"
        | "failed"
      pharmacy_status: "pending" | "approved" | "rejected"
      practitioner_status: "pending" | "approved" | "rejected"
      practitioner_type: "doctor" | "nurse"
      prescription_status:
        | "uploaded"
        | "processing"
        | "extracted"
        | "verified"
        | "failed"
      reservation_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "ready"
        | "completed"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "patient",
        "pharmacy_staff",
        "admin",
        "courier",
        "doctor",
        "nurse",
      ],
      appointment_status: [
        "requested",
        "accepted",
        "rescheduled",
        "rejected",
        "completed",
        "cancelled",
      ],
      courier_status: ["pending", "approved", "rejected"],
      delivery_status: [
        "unassigned",
        "assigned",
        "picked_up",
        "en_route",
        "delivered",
        "failed",
      ],
      pharmacy_status: ["pending", "approved", "rejected"],
      practitioner_status: ["pending", "approved", "rejected"],
      practitioner_type: ["doctor", "nurse"],
      prescription_status: [
        "uploaded",
        "processing",
        "extracted",
        "verified",
        "failed",
      ],
      reservation_status: [
        "pending",
        "accepted",
        "rejected",
        "ready",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
