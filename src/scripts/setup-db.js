require('dotenv').config()
const { pool } = require('../config/db')

const initSQL = `
-- =========================================
-- 1. USERS (ALL: ADMIN, TEACHER, STUDENT)
-- =========================================
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    user_code VARCHAR(50) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    class_id INT,
    user_status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- 2. ROLES
-- =========================================
CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

-- Chèn 3 role mặc định (Bỏ qua nếu đã tồn tại)
INSERT INTO roles (role_name) VALUES 
    ('admin'), ('teacher'), ('student')
ON CONFLICT (role_name) DO NOTHING;

-- =========================================
-- BẢNG TRUNG GIAN USER_ROLES
-- =========================================
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(role_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- =========================================
-- 3. CLASSES
-- =========================================
CREATE TABLE IF NOT EXISTS classes (
    class_id SERIAL PRIMARY KEY,
    class_name VARCHAR(255) NOT NULL,
    teacher_id INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Thêm Foreign Key cho users sau khi tạo classes
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_user_class;
ALTER TABLE users ADD CONSTRAINT fk_user_class FOREIGN KEY (class_id) REFERENCES classes(class_id);

-- =========================================
-- 4. FACE PROFILES (AWS)
-- =========================================
CREATE TABLE IF NOT EXISTS face_profiles (
    face_profile_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    face_aws_id VARCHAR(255),
    aws_collection_id VARCHAR(255),
    face_image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE face_profiles ADD COLUMN IF NOT EXISTS aws_collection_id VARCHAR(255);
ALTER TABLE face_profiles ADD COLUMN IF NOT EXISTS face_image_url TEXT;
CREATE INDEX IF NOT EXISTS idx_face_profiles_user_id ON face_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_face_profiles_face_aws_id ON face_profiles(face_aws_id);

-- =========================================
-- 5. FACE VERIFICATION LOGS
-- =========================================
CREATE TABLE IF NOT EXISTS face_verification_logs (
    verification_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id),
    captured_image_url TEXT,
    matched_face_aws_id VARCHAR(255),
    similarity_score FLOAT,
    verification_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE face_verification_logs ADD COLUMN IF NOT EXISTS matched_face_aws_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_face_verification_user ON face_verification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_face_verification_status ON face_verification_logs(verification_status);

-- =========================================
-- 6. ATTENDANCE SESSIONS (BUỔI HỌC)
-- =========================================
CREATE TABLE IF NOT EXISTS attendance_sessions (
    attendance_session_id SERIAL PRIMARY KEY,
    class_id INT REFERENCES classes(class_id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(50) DEFAULT 'open',
    created_by INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- 7. ATTENDANCE RECORDS
-- =========================================
CREATE TABLE IF NOT EXISTS attendance_records (
    attendance_id SERIAL PRIMARY KEY,
    attendance_session_id INT REFERENCES attendance_sessions(attendance_session_id) ON DELETE CASCADE,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    check_in_time TIMESTAMP,
    attendance_status VARCHAR(50),
    UNIQUE(attendance_session_id, user_id)
);

-- =========================================
-- 8. ATTENDANCE LOGS (ẢNH CHỤP)
-- =========================================
CREATE TABLE IF NOT EXISTS attendance_logs (
    log_id SERIAL PRIMARY KEY,
    attendance_id INT REFERENCES attendance_records(attendance_id) ON DELETE CASCADE,
    log_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    captured_image_url TEXT
);

-- =========================================
-- 9. NOTIFICATIONS (Nhiệm vụ của bạn)
-- =========================================
CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255),
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- 10. AUDIT LOGS
-- =========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id SERIAL PRIMARY KEY,
    user_id INT,
    action_name VARCHAR(255),
    action_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- 11. INDEXES (OPTIMIZATION)
-- =========================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_class ON users(class_id);
CREATE INDEX IF NOT EXISTS idx_face_user ON face_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(attendance_session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_records(user_id);
`

async function setupDatabase() {
  try {
    console.log('⏳ Đang khởi tạo Database trên AWS RDS...')
    await pool.query(initSQL)
    console.log('✅ Khởi tạo các bảng Database thành công!')
  } catch (error) {
    console.error('❌ Lỗi khi khởi tạo DB:', error.message)
  } finally {
    process.exit() // Tự động thoát script sau khi chạy xong
  }
}

setupDatabase()
