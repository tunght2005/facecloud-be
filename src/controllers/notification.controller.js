const { pool } = require('../config/db')

// 1. Hàm nội bộ để tạo thông báo (Dev 2 và Dev 3 sẽ gọi hàm này trong code của họ)
const createNotification = async (userId, title, message) => {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
      [userId, title, message]
    )
  } catch (err) {
    console.error('Lỗi khi tạo thông báo nội bộ:', err.message)
  }
}

// 2. Lấy danh sách thông báo của user đang đăng nhập
const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.user_id
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 3. Đánh dấu thông báo đã đọc
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.user_id
    
    const result = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE notification_id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy thông báo hoặc bạn không có quyền' })
    }
    res.json({ message: 'Đã đánh dấu đọc', notification: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { createNotification, getMyNotifications, markAsRead }