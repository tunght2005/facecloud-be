const { pool } = require('../config/db')

const writeAuditLog = async ({ userId, actionName, actionData }) => {
  if (!actionName) {
    return
  }

  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action_name, action_data)
       VALUES ($1, $2, $3)`,
      [userId || null, actionName, actionData ? JSON.stringify(actionData) : null]
    )
  } catch (error) {
    console.error('AUDIT_LOG_ERROR', error.message)
  }
}

module.exports = {
  writeAuditLog
}
