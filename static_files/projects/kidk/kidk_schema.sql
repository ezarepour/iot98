-- Kidk initial database schema (PostgreSQL 15+)
-- This schema is intentionally modular for phased delivery.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- Identity and access
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(16) NOT NULL CHECK (role IN ('parent', 'doctor', 'caregiver', 'admin')),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    mobile VARCHAR(20) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile VARCHAR(20) NOT NULL,
    purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('signup', 'login', 'password_reset')),
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_mobile_created_at
    ON otp_requests (mobile, created_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    device_info VARCHAR(255),
    ip_address VARCHAR(64),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_created
    ON user_sessions (user_id, created_at DESC);

-- =========================================================
-- Children and permissions
-- =========================================================
CREATE TABLE IF NOT EXISTS children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
    birth_date DATE NOT NULL,
    birth_weight_kg NUMERIC(4, 2),
    gestational_age_weeks SMALLINT,
    profile_image_url TEXT,
    fever_alert_threshold_c NUMERIC(3, 1) NOT NULL DEFAULT 38.5
        CHECK (fever_alert_threshold_c IN (38.0, 38.5, 39.0)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS child_guardians (
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relation VARCHAR(24) NOT NULL CHECK (relation IN ('mother', 'father', 'guardian', 'caregiver')),
    can_edit BOOLEAN NOT NULL DEFAULT TRUE,
    can_remote_monitor BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (child_id, user_id)
);

-- =========================================================
-- Fever monitoring
-- =========================================================
CREATE TABLE IF NOT EXISTS thermometer_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number VARCHAR(64) NOT NULL UNIQUE,
    model VARCHAR(64),
    mode VARCHAR(16) NOT NULL DEFAULT 'connected'
        CHECK (mode IN ('connected', 'standalone')),
    last_battery_percent SMALLINT CHECK (last_battery_percent BETWEEN 0 AND 100),
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS child_device_links (
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES thermometer_devices(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (child_id, device_id)
);

CREATE TABLE IF NOT EXISTS fever_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    device_id UUID REFERENCES thermometer_devices(id) ON DELETE SET NULL,
    started_by UUID REFERENCES users(id) ON DELETE SET NULL,
    source VARCHAR(16) NOT NULL CHECK (source IN ('local', 'remote')),
    disease_label VARCHAR(255),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    peak_temp_c NUMERIC(4, 1),
    peak_temp_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'stopped', 'error')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fever_sessions_child_started
    ON fever_sessions (child_id, started_at DESC);

CREATE TABLE IF NOT EXISTS fever_samples (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES fever_sessions(id) ON DELETE CASCADE,
    measured_at TIMESTAMPTZ NOT NULL,
    temp_c NUMERIC(4, 1) NOT NULL,
    battery_percent SMALLINT CHECK (battery_percent BETWEEN 0 AND 100),
    bluetooth_rssi SMALLINT,
    is_warmup BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fever_samples_session_time
    ON fever_samples (session_id, measured_at ASC);

CREATE TABLE IF NOT EXISTS fever_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES fever_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(16) NOT NULL CHECK (event_type IN ('sponge', 'medicine')),
    medicine_name VARCHAR(100),
    medicine_dose VARCHAR(100),
    note TEXT,
    event_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fever_events_session_time
    ON fever_events (session_id, event_at ASC);

-- =========================================================
-- Jaundice
-- =========================================================
CREATE TABLE IF NOT EXISTS jaundice_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    estimated_level NUMERIC(5, 2),
    recommendation_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jaundice_tests_child_created
    ON jaundice_tests (child_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jaundice_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES jaundice_tests(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    shot_order SMALLINT NOT NULL CHECK (shot_order BETWEEN 1 AND 4),
    is_flash BOOLEAN NOT NULL,
    roi_x NUMERIC(8, 2) NOT NULL,
    roi_y NUMERIC(8, 2) NOT NULL,
    roi_width NUMERIC(8, 2) NOT NULL,
    roi_height NUMERIC(8, 2) NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (test_id, shot_order)
);

-- =========================================================
-- Vaccination
-- =========================================================
CREATE TABLE IF NOT EXISTS vaccination_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    recommended_age_month SMALLINT NOT NULL,
    is_optional BOOLEAN NOT NULL DEFAULT FALSE,
    country_code VARCHAR(8) NOT NULL DEFAULT 'IR',
    UNIQUE (name, recommended_age_month, country_code)
);

CREATE TABLE IF NOT EXISTS vaccination_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    vaccine_id UUID NOT NULL REFERENCES vaccination_catalog(id) ON DELETE RESTRICT,
    status VARCHAR(16) NOT NULL CHECK (status IN ('done', 'pending', 'overdue')),
    injection_date DATE,
    injection_site VARCHAR(120),
    provider_name VARCHAR(120),
    side_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vaccination_records_child_status
    ON vaccination_records (child_id, status);

CREATE TABLE IF NOT EXISTS reminder_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    reminder_type VARCHAR(24) NOT NULL CHECK (reminder_type IN ('vaccination_due', 'vaccination_overdue')),
    channel VARCHAR(16) NOT NULL CHECK (channel IN ('push', 'sms')),
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled'))
);

-- =========================================================
-- Growth and development
-- =========================================================
CREATE TABLE IF NOT EXISTS growth_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    measured_at TIMESTAMPTZ NOT NULL,
    weight_kg NUMERIC(5, 2),
    height_cm NUMERIC(5, 2),
    head_circumference_cm NUMERIC(5, 2),
    note TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_growth_child_measured
    ON growth_measurements (child_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS development_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    age_band VARCHAR(24) NOT NULL
        CHECK (age_band IN ('0_3m', '3_6m', '6_9m', '9_12m', '12_18m', '18_24m')),
    checked_items JSONB NOT NULL,
    overall_status VARCHAR(24) NOT NULL CHECK (overall_status IN ('normal', 'attention_needed')),
    assessed_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensory_motor_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    age_band VARCHAR(24) NOT NULL
        CHECK (age_band IN ('0_3m', '3_6m', '6_9m', '9_12m', '12_18m', '18_24m')),
    checked_items JSONB NOT NULL,
    overall_status VARCHAR(24) NOT NULL CHECK (overall_status IN ('normal', 'attention_needed')),
    assessed_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- Consultation and messaging
-- =========================================================
CREATE TABLE IF NOT EXISTS doctor_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specialty VARCHAR(120) NOT NULL,
    rating NUMERIC(2, 1) NOT NULL DEFAULT 5.0 CHECK (rating >= 1.0 AND rating <= 5.0),
    consultation_fee NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL
        CHECK (status IN ('created', 'awaiting_payment', 'active', 'closed', 'cancelled')),
    summary_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    fee_amount NUMERIC(10, 2) NOT NULL,
    payment_status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_reference VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consultations_parent_created
    ON consultations (parent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consultations_doctor_status
    ON consultations (doctor_id, status);

CREATE TABLE IF NOT EXISTS consultation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    message_type VARCHAR(16) NOT NULL CHECK (message_type IN ('text', 'audio', 'image', 'system')),
    content_text TEXT,
    attachment_url TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_read BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_messages_consultation_sent
    ON consultation_messages (consultation_id, sent_at ASC);

-- =========================================================
-- Remote monitoring access
-- =========================================================
CREATE TABLE IF NOT EXISTS remote_monitoring_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    granted_to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_message BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (child_id, granted_to_user_id)
);
