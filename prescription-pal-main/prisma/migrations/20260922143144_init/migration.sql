-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "app_role" AS ENUM ('patient', 'pharmacy_staff', 'admin', 'courier', 'doctor', 'nurse');

-- CreateEnum
CREATE TYPE "pharmacy_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "prescription_status" AS ENUM ('uploaded', 'processing', 'extracted', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('pending', 'accepted', 'rejected', 'ready', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('unassigned', 'assigned', 'picked_up', 'en_route', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "courier_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "practitioner_type" AS ENUM ('doctor', 'nurse');

-- CreateEnum
CREATE TYPE "practitioner_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('requested', 'accepted', 'rescheduled', 'rejected', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "google_sub" TEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "phone_verified_at" TIMESTAMPTZ(6),
    "raw_user_meta_data" JSONB NOT NULL DEFAULT '{}',
    "last_sign_in_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "full_name" TEXT,
    "phone" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role" "app_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID,
    "claim_email" TEXT,
    "name" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "opening_hours" JSONB,
    "status" "pharmacy_status" NOT NULL DEFAULT 'pending',
    "rating" DOUBLE PRECISION DEFAULT 0,
    "google_place_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pharmacy_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "normalized_name" TEXT NOT NULL,
    "generic_name" TEXT,
    "strength" TEXT,
    "form" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pharmacy_id" UUID NOT NULL,
    "medicine_id" UUID NOT NULL,
    "stock_qty" INTEGER NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_mime" TEXT NOT NULL,
    "patient_name" TEXT,
    "doctor_name" TEXT,
    "hospital" TEXT,
    "prescription_date" DATE,
    "prescription_date_raw" TEXT,
    "date_source" TEXT NOT NULL DEFAULT 'ai',
    "is_expired" BOOLEAN NOT NULL DEFAULT false,
    "ai_confidence" DOUBLE PRECISION,
    "ai_raw" JSONB,
    "status" "prescription_status" NOT NULL DEFAULT 'uploaded',
    "source" TEXT NOT NULL DEFAULT 'app',
    "review_severity" TEXT,
    "review_status" TEXT,
    "review_reasons" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_id" UUID NOT NULL,
    "medicine_name_raw" TEXT NOT NULL,
    "normalized_medicine_id" UUID,
    "strength" TEXT,
    "quantity" TEXT,
    "dosage" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "patient_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighborhoods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Bamako',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couriers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "vehicle_type" TEXT NOT NULL DEFAULT 'moto',
    "license_number" TEXT,
    "status" "courier_status" NOT NULL DEFAULT 'pending',
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "current_lat" DOUBLE PRECISION,
    "current_lng" DOUBLE PRECISION,
    "last_position_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "pharmacy_id" UUID NOT NULL,
    "status" "reservation_status" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'app',
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "missing_items" JSONB NOT NULL DEFAULT '[]',
    "courier_id" UUID,
    "delivery_status" "delivery_status" NOT NULL DEFAULT 'unassigned',
    "fulfillment_method" TEXT NOT NULL DEFAULT 'delivery',
    "delivery_mode" TEXT NOT NULL DEFAULT 'gps',
    "neighborhood_id" UUID,
    "patient_lat" DOUBLE PRECISION,
    "patient_lng" DOUBLE PRECISION,
    "patient_address" TEXT,
    "patient_name" TEXT,
    "patient_phone" TEXT,
    "pickup_code" TEXT,
    "receipt_code" TEXT,
    "pickup_code_verified_at" TIMESTAMPTZ(6),
    "receipt_code_verified_at" TIMESTAMPTZ(6),
    "code_attempts" INTEGER NOT NULL DEFAULT 0,
    "items_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delivery_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "payment_method" TEXT,
    "payment_reference" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "assigned_at" TIMESTAMPTZ(6),
    "picked_up_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "prescription_item_id" UUID NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "price" DOUBLE PRECISION,
    "unit_price" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courier_id" UUID NOT NULL,
    "reservation_id" UUID,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner_specialties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "label_fr" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "practitioner_type" "practitioner_type" NOT NULL DEFAULT 'doctor',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practitioner_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "claim_email" TEXT,
    "type" "practitioner_type" NOT NULL,
    "full_name" TEXT NOT NULL,
    "specialty_code" TEXT NOT NULL,
    "license_number" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "opening_hours" JSONB,
    "home_visits" BOOLEAN NOT NULL DEFAULT false,
    "consultation_fee" DOUBLE PRECISION,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "status" "practitioner_status" NOT NULL DEFAULT 'pending',
    "bio" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practitioners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "symptoms" TEXT,
    "triage" JSONB,
    "at_home" BOOLEAN NOT NULL DEFAULT false,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_at" TIMESTAMPTZ(6),
    "proposed_at" TIMESTAMPTZ(6),
    "patient_address" TEXT,
    "patient_lat" DOUBLE PRECISION,
    "patient_lng" DOUBLE PRECISION,
    "patient_phone" TEXT,
    "status" "appointment_status" NOT NULL DEFAULT 'requested',
    "practitioner_notes" TEXT,
    "report" TEXT,
    "rejection_reason" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "prescribed_items" JSONB NOT NULL DEFAULT '[]',
    "reminders_sent" JSONB NOT NULL DEFAULT '{}',
    "patient_ack_at" TIMESTAMPTZ(6),
    "patient_completed_at" TIMESTAMPTZ(6),
    "last_reminder_at" TIMESTAMPTZ(6),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'web',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "reservation_id" UUID,
    "pharmacy_id" UUID,
    "phone" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wa_phone" TEXT NOT NULL,
    "wa_name" TEXT,
    "user_id" UUID,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "state" TEXT NOT NULL DEFAULT 'idle',
    "context" JSONB NOT NULL DEFAULT '{}',
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_events" (
    "message_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_events_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_tokens_kind_target_idx" ON "auth_tokens"("kind", "target");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "user_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacies_owner_user_id_key" ON "pharmacies"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacies_google_place_id_key" ON "pharmacies"("google_place_id");

-- CreateIndex
CREATE INDEX "pharmacies_status_idx" ON "pharmacies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_staff_user_id_key" ON "pharmacy_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_staff_pharmacy_id_user_id_key" ON "pharmacy_staff"("pharmacy_id", "user_id");

-- CreateIndex
CREATE INDEX "medicines_name_trgm" ON "medicines" USING GIN ("normalized_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "medicines_generic_trgm" ON "medicines" USING GIN ("generic_name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_pharmacy_id_medicine_id_key" ON "inventory"("pharmacy_id", "medicine_id");

-- CreateIndex
CREATE INDEX "prescriptions_patient_id_created_at_idx" ON "prescriptions"("patient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "prescriptions_review_severity_idx" ON "prescriptions"("review_severity");

-- CreateIndex
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items"("prescription_id");

-- CreateIndex
CREATE UNIQUE INDEX "neighborhoods_city_name_key" ON "neighborhoods"("city", "name");

-- CreateIndex
CREATE UNIQUE INDEX "couriers_user_id_key" ON "couriers"("user_id");

-- CreateIndex
CREATE INDEX "reservations_patient_id_idx" ON "reservations"("patient_id");

-- CreateIndex
CREATE INDEX "reservations_pharmacy_id_idx" ON "reservations"("pharmacy_id");

-- CreateIndex
CREATE INDEX "reservations_courier_id_idx" ON "reservations"("courier_id");

-- CreateIndex
CREATE INDEX "reservations_created_at_idx" ON "reservations"("created_at" DESC);

-- CreateIndex
CREATE INDEX "reservation_items_reservation_id_idx" ON "reservation_items"("reservation_id");

-- CreateIndex
CREATE INDEX "courier_positions_res_time" ON "courier_positions"("reservation_id", "recorded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "practitioner_specialties_code_key" ON "practitioner_specialties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "practitioners_user_id_key" ON "practitioners"("user_id");

-- CreateIndex
CREATE INDEX "practitioners_status_idx" ON "practitioners"("status");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_practitioner_id_idx" ON "appointments"("practitioner_id");

-- CreateIndex
CREATE INDEX "appointments_status_scheduled_at_idx" ON "appointments"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_feedback_phone" ON "feedback"("phone");

-- CreateIndex
CREATE INDEX "idx_feedback_pharmacy" ON "feedback"("pharmacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_wa_phone_key" ON "whatsapp_sessions"("wa_phone");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_key_lang_key" ON "whatsapp_templates"("key", "lang");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_staff" ADD CONSTRAINT "pharmacy_staff_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_staff" ADD CONSTRAINT "pharmacy_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_normalized_medicine_id_fkey" FOREIGN KEY ("normalized_medicine_id") REFERENCES "medicines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "prescription_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_positions" ADD CONSTRAINT "courier_positions_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_positions" ADD CONSTRAINT "courier_positions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_specialty_code_fkey" FOREIGN KEY ("specialty_code") REFERENCES "practitioner_specialties"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Contraintes CHECK reprises de l'ancienne base (non exprimables en Prisma)
-- ---------------------------------------------------------------------------
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_payment_status_check"
  CHECK (payment_status IN ('unpaid','pending_verification','paid','failed'));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_fulfillment_method_check"
  CHECK (fulfillment_method IN ('delivery','pickup'));
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_rating_check"
  CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_lang_check"
  CHECK (lang IN ('fr','en','ar'));
CREATE INDEX IF NOT EXISTS "pharmacies_claim_email_idx" ON "pharmacies" (lower(claim_email));
CREATE INDEX IF NOT EXISTS "practitioners_claim_email_idx" ON "practitioners" (lower(claim_email));
