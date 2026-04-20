const { pool } = require('../config/db')
const { indexFace, searchByImage, deleteFaces } = require('../services/rekognition.service')

const DEFAULT_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 85)
const AWS_COLLECTION_ID = process.env.AWS_REKOGNITION_COLLECTION_ID || 'facecloud-users'

const resolveMatchedUserId = async (match) => {
  const externalImageId = match?.Face?.ExternalImageId
  if (externalImageId && /^\d+$/.test(externalImageId)) {
    return Number(externalImageId)
  }

  const awsFaceId = match?.Face?.FaceId
  if (!awsFaceId) {
    return null
  }

  const result = await pool.query('SELECT user_id FROM face_profiles WHERE face_aws_id = $1 LIMIT 1', [awsFaceId])
  if (result.rows.length === 0) {
    return null
  }

  return result.rows[0].user_id
}

// ===== LẤY PROFILE KHUÔN MẶT =====

const getFaceProfile = async (req, res) => {
  try {
    const userId = req.params.user_id || req.user.user_id

    const result = await pool.query(
      `SELECT user_id, face_aws_id, aws_collection_id, face_image_url, created_at 
       FROM face_profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chưa đăng ký khuôn mặt' })
    }

    return res.json({
      face_profile: result.rows[0]
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

// ===== ĐĂNG KÝ KHUÔN MẶT =====

const registerFace = async (req, res) => {
  try {
    const userId = req.user.user_id
    const { imageBase64, face_image_url } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 là bắt buộc' })
    }

    // Xóa mặt cũ trong collection để tránh một user có nhiều vector khuôn mặt không cần thiết
    const existingFaces = await pool.query('SELECT face_aws_id FROM face_profiles WHERE user_id = $1', [userId])
    const oldFaceIds = existingFaces.rows.map((row) => row.face_aws_id).filter(Boolean)

    if (oldFaceIds.length > 0) {
      await deleteFaces(oldFaceIds)
    }

    await pool.query('DELETE FROM face_profiles WHERE user_id = $1', [userId])

    const indexResult = await indexFace({
      imageBase64,
      externalImageId: String(userId)
    })

    if (!indexResult.faceId) {
      return res.status(400).json({
        error: 'Không phát hiện được khuôn mặt hợp lệ. Vui lòng thử ảnh rõ hơn.'
      })
    }

    const dbResult = await pool.query(
      `INSERT INTO face_profiles (user_id, face_aws_id, aws_collection_id, face_image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, indexResult.faceId, AWS_COLLECTION_ID, face_image_url || null]
    )

    return res.status(201).json({
      message: 'Đăng ký khuôn mặt thành công',
      face_profile: dbResult.rows[0],
      aws: {
        face_id: indexResult.faceId,
        confidence: indexResult.confidence
      }
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const verifyFace = async (req, res) => {
  try {
    const { imageBase64, captured_image_url } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 là bắt buộc' })
    }

    const matches = await searchByImage({
      imageBase64,
      maxFaces: 1,
      faceMatchThreshold: DEFAULT_MATCH_THRESHOLD
    })

    if (!matches.length) {
      await pool.query(
        `INSERT INTO face_verification_logs
         (user_id, captured_image_url, matched_face_aws_id, similarity_score, verification_status)
         VALUES ($1, $2, $3, $4, $5)`,
        [null, captured_image_url || null, null, 0, 'failed']
      )

      return res.status(401).json({
        verified: false,
        message: 'Không xác thực được khuôn mặt'
      })
    }

    const bestMatch = matches[0]
    const matchedUserId = await resolveMatchedUserId(bestMatch)
    const similarity = Number(bestMatch.Similarity || 0)

    await pool.query(
      `INSERT INTO face_verification_logs
       (user_id, captured_image_url, matched_face_aws_id, similarity_score, verification_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [matchedUserId, captured_image_url || null, bestMatch?.Face?.FaceId || null, similarity, 'success']
    )

    return res.json({
      verified: true,
      similarity,
      matched_user_id: matchedUserId,
      face_aws_id: bestMatch?.Face?.FaceId || null,
      collection_id: AWS_COLLECTION_ID
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

// ===== SO SÁNH KHUÔN MẶT CHI TIẾT =====

const compareFace = async (req, res) => {
  try {
    const userId = req.params.user_id || req.user.user_id
    const { imageBase64, captured_image_url } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 là bắt buộc' })
    }

    // Lấy ảnh khuôn mặt đã đăng ký
    const profileResult = await pool.query(`SELECT face_aws_id, face_image_url FROM face_profiles WHERE user_id = $1`, [
      userId
    ])

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'User này chưa đăng ký khuôn mặt' })
    }

    const registeredFace = profileResult.rows[0]

    // Tìm khuôn mặt trong ảnh chụp
    const matches = await searchByImage({
      imageBase64,
      maxFaces: 5,
      faceMatchThreshold: 60 // Lower threshold để lấy nhiều kết quả
    })

    // Chỉ chấp nhận match thuộc đúng user đang so sánh.
    // Trước đây fallback sang matches[0] có thể lấy nhầm người khác và tạo false-positive.
    const userMatches = matches.filter((match) => {
      const externalId = match?.Face?.ExternalImageId
      const faceId = match?.Face?.FaceId
      return externalId === String(userId) || (registeredFace.face_aws_id && faceId === registeredFace.face_aws_id)
    })

    const bestUserMatch = userMatches[0] || null
    const topAnyMatch = matches[0] || null
    const topAnyMatchedUserId = topAnyMatch ? await resolveMatchedUserId(topAnyMatch) : null
    const similarity = bestUserMatch ? Number(bestUserMatch.Similarity || 0) : 0
    const isMatch = Boolean(bestUserMatch) && similarity >= DEFAULT_MATCH_THRESHOLD

    // Lưu log
    await pool.query(
      `INSERT INTO face_verification_logs
       (user_id, captured_image_url, matched_face_aws_id, similarity_score, verification_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        captured_image_url || null,
        bestUserMatch?.Face?.FaceId || null,
        similarity,
        isMatch ? 'success' : 'failed'
      ]
    )

    return res.json({
      user_id: userId,
      comparison: {
        is_match: isMatch,
        similarity: similarity,
        threshold: DEFAULT_MATCH_THRESHOLD,
        matched_face_id: bestUserMatch?.Face?.FaceId || null,
        confidence: bestUserMatch?.Confidence || null
      },
      registered_face: {
        face_aws_id: registeredFace.face_aws_id,
        face_image_url: registeredFace.face_image_url
      },
      top_match_debug: {
        matched_user_id: topAnyMatchedUserId,
        similarity: topAnyMatch ? Number(topAnyMatch.Similarity || 0) : 0,
        face_id: topAnyMatch?.Face?.FaceId || null,
        external_id: topAnyMatch?.Face?.ExternalImageId || null
      },
      all_matches: matches.map((m) => ({
        face_id: m.Face?.FaceId,
        similarity: Number(m.Similarity || 0),
        confidence: m.Confidence,
        external_id: m.Face?.ExternalImageId
      }))
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

// ===== LẤY LỊCH SỬ VERIFICATION =====

const getFaceVerificationHistory = async (req, res) => {
  try {
    const userId = req.params.user_id || req.user.user_id
    const limit = req.query.limit || 20

    const result = await pool.query(
      `SELECT 
        verification_id, user_id, captured_image_url, matched_face_aws_id, 
        similarity_score, verification_status, created_at
       FROM face_verification_logs
       WHERE user_id = $1 OR matched_face_aws_id IN (
         SELECT face_aws_id FROM face_profiles WHERE user_id = $1
       )
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    )

    return res.json({
      user_id: userId,
      logs: result.rows,
      total: result.rows.length
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

module.exports = {
  getFaceProfile,
  registerFace,
  verifyFace,
  compareFace,
  getFaceVerificationHistory,
  resolveMatchedUserId
}
