const {
  RekognitionClient,
  DescribeCollectionCommand,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand
} = require('@aws-sdk/client-rekognition')

const rekognitionRegion = process.env.AWS_REGION || 'ap-southeast-1'
const collectionId = process.env.AWS_REKOGNITION_COLLECTION_ID || 'facecloud-users'

const rekognitionClient = new RekognitionClient({ region: rekognitionRegion })

const toImageBytes = (imageBase64) => {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new Error('imageBase64 is required')
  }

  const payload = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  return Buffer.from(payload, 'base64')
}

const ensureCollection = async () => {
  try {
    await rekognitionClient.send(new DescribeCollectionCommand({ CollectionId: collectionId }))
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      await rekognitionClient.send(new CreateCollectionCommand({ CollectionId: collectionId }))
      return
    }
    throw error
  }
}

const indexFace = async ({ imageBase64, externalImageId }) => {
  await ensureCollection()
  const imageBytes = toImageBytes(imageBase64)

  const command = new IndexFacesCommand({
    CollectionId: collectionId,
    Image: { Bytes: imageBytes },
    ExternalImageId: externalImageId,
    DetectionAttributes: ['DEFAULT'],
    MaxFaces: 1,
    QualityFilter: 'AUTO'
  })

  const result = await rekognitionClient.send(command)
  const faceRecord = result.FaceRecords?.[0]

  return {
    faceId: faceRecord?.Face?.FaceId || null,
    imageId: faceRecord?.Face?.ImageId || null,
    confidence: faceRecord?.Face?.Confidence || 0,
    indexedFaces: result.FaceRecords || [],
    unindexedFaces: result.UnindexedFaces || []
  }
}

const searchByImage = async ({ imageBase64, maxFaces = 1, faceMatchThreshold = 80 }) => {
  await ensureCollection()
  const imageBytes = toImageBytes(imageBase64)

  const command = new SearchFacesByImageCommand({
    CollectionId: collectionId,
    Image: { Bytes: imageBytes },
    MaxFaces: maxFaces,
    FaceMatchThreshold: faceMatchThreshold
  })

  const result = await rekognitionClient.send(command)
  return result.FaceMatches || []
}

const deleteFaces = async (faceIds) => {
  if (!Array.isArray(faceIds) || faceIds.length === 0) {
    return
  }

  await ensureCollection()
  await rekognitionClient.send(
    new DeleteFacesCommand({
      CollectionId: collectionId,
      FaceIds: faceIds
    })
  )
}

module.exports = {
  collectionId,
  indexFace,
  searchByImage,
  deleteFaces
}
