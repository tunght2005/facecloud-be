const { pool } = require('../config/db');
// [GET] /api/classes
// Lấy danh sách tất cả các lớp học kèm tên giáo viên
const getClasses = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.class_id, c.class_name, c.created_at, 
                t.full_name AS teacher_name,
                COUNT(s.user_id) AS student_count
            FROM classes c
            LEFT JOIN users t ON c.teacher_id = t.user_id
            LEFT JOIN users s ON c.class_id = s.user_id -- Đếm số học sinh
            GROUP BY c.class_id, t.full_name
            ORDER BY c.created_at DESC;
        `;
        const { rows } = await pool.query(query);

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// [POST] /api/classes
// Tạo một lớp học mới
const createClass = async (req, res) => {
    try {
        // Nhận thêm student_ids (là một mảng các ID của học sinh)
        const { class_name, teacher_id, student_ids } = req.body;

        if (!class_name) {
            return res.status(400).json({ success: false, message: 'Tên lớp không được để trống' });
        }

        // Bước 1: Tạo lớp học mới
        const classQuery = `
            INSERT INTO classes (class_name, teacher_id) 
            VALUES ($1, $2) 
            RETURNING *;
        `;
        const classRes = await pool.query(classQuery, [class_name, teacher_id]);
        const newClass = classRes.rows[0];

        // Bước 2: Nếu có mảng student_ids, cập nhật class_id cho các học sinh đó
        if (student_ids && Array.isArray(student_ids) && student_ids.length > 0) {
            const updateStudentsQuery = `
                UPDATE users 
                SET class_id = $1 
                WHERE user_id = ANY($2::int[])
            `;
            // ANY($2::int[]) là cú pháp của PostgreSQL để check giá trị nằm trong mảng
            await pool.query(updateStudentsQuery, [newClass.class_id, student_ids]);
            
            // Gắn thêm thông tin trả về cho Frontend biết là đã add bao nhiêu em
            newClass.added_student_count = student_ids.length;
            newClass.added_student_ids = student_ids;
        }

        res.status(201).json({ 
            success: true, 
            message: 'Tạo lớp thành công', 
            data: newClass 
        });
    } catch (error) {
        // Bắt lỗi nếu teacher_id không tồn tại trong bảng users
        if (error.code === '23503') {
            return res.status(400).json({ success: false, message: 'Giáo viên (teacher_id) không tồn tại' });
        }
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// [GET] /api/classes/:id
// Lấy thông tin chi tiết của 1 lớp học (Kèm luôn danh sách chi tiết học sinh)
const getClassById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                c.class_id, c.class_name, c.created_at,
                t.full_name AS teacher_name,
                COALESCE(
                    (SELECT json_agg(
                        json_build_object(
                            'user_id', s.user_id, 
                            'user_code', s.user_code, 
                            'full_name', s.full_name
                        )
                    ) 
                    FROM users s WHERE s.class_id = c.class_id), 
                    '[]'::json
                ) AS students
            FROM classes c
            LEFT JOIN users t ON c.teacher_id = t.user_id
            WHERE c.class_id = $1;
        `;
        const { rows } = await pool.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy lớp học' });
        }

        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

// [GET] /api/classes/:id/students
// Lấy danh sách học sinh thuộc lớp học đó
const getClassStudents = async (req, res) => {
    try {
        const classId = req.params.id;

        // Dev 1 quản lý bảng users, ta chỉ SELECT những thông tin cơ bản của học sinh
        const query = `
            SELECT user_id, user_code, email, full_name, avatar_url, user_status 
            FROM users 
            WHERE class_id = $1;
        `;
        const { rows } = await pool.query(query, [classId]);

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
};

module.exports = {
    getClasses,
    createClass,
    getClassById,
    getClassStudents
};