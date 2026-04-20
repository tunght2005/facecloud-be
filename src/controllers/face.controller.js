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

module.exports = {
  registerFace,
  verifyFace,
  resolveMatchedUserId
}
