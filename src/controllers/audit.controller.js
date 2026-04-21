const { pool } = require('../config/db')

const getAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500)

    const result = await pool.query(
      `SELECT audit_id, user_id, action_name, action_data, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    )

    return res.json({ logs: result.rows, total: result.rows.length })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

module.exports = {
  getAuditLogs
}
