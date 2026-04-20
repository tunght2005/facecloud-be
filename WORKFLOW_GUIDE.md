# 🎯 Complete Workflow Guide - Face Recognition Attendance System

## 📱 Test UI Available at

```
http://localhost:3000/api-test
```

---

## 🚀 Full Workflow (Step-by-Step)

### ✅ STEP 1: Login / Register User

**Goal:** Get JWT token for API authentication

#### Option A: Register New User

```
1. Click "Register" button
2. Fill in email, password, full name, user code
3. Click "Register"
4. ✅ User created
```

#### Option B: Login with Existing User (Recommended)

```
1. Email: superadmin@gmail.com
2. Password: 123456
3. Click "Login"
4. ✅ JWT token auto-filled in "JWT Token" field
5. ✅ User ID auto-filled in "Current User ID" field
6. ✅ Workflow guide shows steps 1-2 completed (green)
```

**API Endpoint:** `POST /auth/login`
**Response includes:** JWT token + user_id

---

### 😊 STEP 2: Register Face (Đăng ký khuôn mặt)

**Goal:** Upload face photo to AWS Rekognition collection

#### How to do it:

```
1. Choose a clear face image or provide image URL
   - Option A: Click "Chọn tệp" and select image from computer
   - Option B: Paste image URL in "Or Image URL" field

2. Verify: "Image file is ready" status should show ✅ (green)

3. Click "POST /face/register" button
   - System will send image to AWS
   - AWS will detect face and create face vector
   - Store face_id in database

4. ✅ Face registered successfully
5. Response shows:
   - face_aws_id: AWS face ID
   - aws_collection_id: Collection name
   - confidence: Detection confidence score

6. ✅ Workflow shows step 3 completed (green)
```

**Optional:** Click "GET Face Profile" to verify registered face

**API Endpoint:** `POST /face/register`
**Request:** imageBase64 (base64 encoded image)
**Response includes:** face_aws_id, confidence

**Important:**

- Image must have clear, frontal face
- Size: ~100x100 pixels minimum
- Format: JPG, PNG, supported

---

### 📅 STEP 3: Create Attendance Session (Tạo buổi điểm danh)

**Goal:** Create an attendance session for a class

#### How to do it:

```
1. Make sure you have JWT token from Step 1

2. Fill Session Details:
   - Class ID: 1 (or any valid class)
   - Session Date: Auto-filled with today's date

3. Click "Create" button in "Attendance Session" card
   - System creates new session with status = "planning"
   - Session ID auto-filled in "Session ID" field

4. ✅ Session created successfully
5. Response shows:
   - attendance_session_id: Unique session ID
   - status: "planning" → "open" → "closed"
   - created_at: Creation timestamp

6. ✅ Workflow shows step 4 completed (green)
```

**API Endpoint:** `POST /attendance/session/create`
**Request:** class_id, session_date, start_time, end_time
**Response includes:** attendance_session_id, status

---

### 🔓 STEP 4: Open Session (Mở buổi điểm danh)

**Goal:** Open session to accept face scans

#### How to do it:

```
1. Session ID should be auto-filled from previous step

2. Click "Open" button
   - System changes session status from "planning" to "open"
   - Now ready to accept face scans

3. ✅ Session opened successfully
4. Response shows:
   - status: "open"
   - updated_at: When opened

5. ✅ Workflow shows step 5 completed (green)
```

**API Endpoint:** `POST /attendance/session/open`
**Request:** attendance_session_id
**Response includes:** session status = "open"

**Note:** Only "open" sessions can accept face scans

---

### 📸 STEP 5: Scan Face for Attendance (Quét mặt để điểm danh)

**Goal:** Record attendance by scanning face

#### How to do it:

```
1. Make sure:
   - ✅ Face registered in Step 2
   - ✅ Session opened in Step 4
   - ✅ Image loaded (same or different from registration)

2. Choose image to scan:
   - IMPORTANT: Should be of SAME PERSON as registered face
   - Can be different angle, lighting, or distance
   - System will compare with registered face

3. Click "POST /attendance/scan" button
   - System performs face recognition:
     a) Detects faces in uploaded image
     b) Searches in AWS collection
     c) Finds best match
     d) Compares similarity score with threshold (default 85%)
     e) Records attendance if match

4. ✅ Attendance recorded successfully
5. Response shows:
   - success: true
   - attendance_record created with:
     * attendance_id
     * check_in_time (timestamp)
     * attendance_status: "present"
   - verification:
     * similarity: Match percentage (e.g., 95.3%)
     * matched_user_id: User who was matched

6. ✅ Workflow shows step 6 completed (green)
```

**API Endpoint:** `POST /attendance/scan`
**Request:** imageBase64, attendance_session_id
**Response includes:** attendance record + similarity score

**Important:**

- Similarity must be ≥ 85% to match
- System compares against all faces in collection
- Must match the currently logged-in user
- Result logged to face_verification_logs

---

### 📊 STEP 6: View Results (Xem kết quả)

**Goal:** Verify attendance was recorded

#### How to view:

**Option A: Session Details (see all attendance in session)**

```
1. Click "Session Details" button
2. Shows:
   - Session info (date, time, status)
   - List of all attendance records in session
   - Each record shows: user_id, check_in_time, status, photo
```

**Option B: Face Verification History (see face verification logs)**

```
1. Click "Verification History" button  (Face History)
2. Shows:
   - List of all face verification attempts
   - success/failed status
   - similarity scores
   - timestamps
```

**Option C: Face Comparison (detailed comparison)**

```
1. Upload another photo (or same photo)
2. Click "POST /face/compare"
3. Shows detailed comparison:
   - is_match: true/false
   - similarity: exact percentage
   - all_matches: list of all similar faces in collection
   - registered_face: info of registered face
```

---

## 🔄 Alternative Workflows

### Workflow 2: Just Verify Face Without Attendance

```
1. Login (Step 1)
2. Register Face (Step 2)
3. Upload different photo
4. Click "POST /face/verify"
5. System checks if face exists in collection
6. Returns match info without recording attendance
```

### Workflow 3: Compare Detailed

```
1. Login (Step 1)
2. Register Face (Step 2)
3. Upload test photo
4. Click "POST /face/compare"
5. See detailed comparison with:
   - All matches found
   - Similarity scores
   - Registered vs captured photo comparison
```

---

## 🔧 Advanced Options

### Close Session

```
1. After attendance is complete
2. Click "Close" button
3. Session status changes to "closed"
4. No more face scans accepted in this session
```

### List Sessions

```
1. Click "List" button
2. Shows all sessions (can filter by class_id)
3. Useful to see all sessions for a class
```

---

## 📋 Data Flow Diagram

```
┌─────────────┐
│   User      │
│  superadmin │
└────┬────────┘
     │ Step 1: Login
     ▼
┌─────────────────┐
│  JWT Token      │ ◄─── Stored in "JWT Token" field
│  user_id = 1    │
└────┬────────────┘
     │ Step 2: Register Face
     ▼
┌──────────────────────┐
│  AWS Rekognition     │
│  Collection saved    │ ◄─── face_aws_id stored in DB
│  face vector created │
└────┬─────────────────┘
     │ Step 3: Create Session
     ▼
┌──────────────────────┐
│  Attendance Session  │
│  status: planning    │
│  session_id = 5      │
└────┬─────────────────┘
     │ Step 4: Open Session
     ▼
┌──────────────────────┐
│  Session Opened      │
│  status: open        │
│  Ready for scanning  │
└────┬─────────────────┘
     │ Step 5: Scan Face
     ▼
┌──────────────────────┐
│  AWS Search          │
│  Compare uploaded    │
│  with registered     │
│  Similarity: 95.3%   │
└────┬─────────────────┘
     │ Step 6: Record
     ▼
┌──────────────────────┐
│  Attendance Record   │
│  check_in_time: now  │
│  status: present     │
│  saved to DB         │
└──────────────────────┘
```

---

## 🎨 UI Guide

### Status Colors

- 🟢 **Green (#0a8f55)**: Completed step
- 🔵 **Blue (#1463ff)**: Primary actions (Create)
- 🟠 **Orange (#ff9100)**: Important actions (Open)
- 🔴 **Red (#c13030)**: Critical actions (Scan)
- ⚫ **Gray**: Secondary actions

### Output Display

- Large JSON output at bottom shows full API response
- Useful for debugging

### Status Messages

- Shows real-time feedback for each action
- Green message = success
- Red message = error

---

## ✅ Complete Success Criteria

When workflow is complete:

1. ✅ All steps 1-6 in workflow guide are green
2. ✅ Output shows attendance record created
3. ✅ Response includes similarity ≥ 85%
4. ✅ Database has attendance_records entry
5. ✅ face_verification_logs shows success
6. ✅ Can view session details with new attendance

---

## 🐛 Troubleshooting

### "Không phát hiện được khuôn mặt" (Face not detected)

- Image is too small or blurry
- Face is at extreme angle
- Try different image

### "Khuôn mặt không khớp tài khoản đăng nhập" (Face doesn't match)

- Registered face and scanned face are different people
- Register correct person first

### "Không tìm thấy buổi điểm danh đang mở" (Session not found)

- Session not created
- Session already closed
- Create and open session first

### "Unauthorized: Không tìm thấy token" (No token)

- Not logged in
- Token expired
- Click Login first

---

## 📚 API Reference Quick Links

| Step | Endpoint                     | Method | Auth |
| ---- | ---------------------------- | ------ | ---- |
| 1    | `/auth/login`                | POST   | ❌   |
| 2    | `/face/register`             | POST   | ✅   |
| 3    | `/attendance/session/create` | POST   | ✅   |
| 4    | `/attendance/session/open`   | POST   | ✅   |
| 5    | `/attendance/scan`           | POST   | ✅   |
| View | `/attendance/session/:id`    | GET    | ✅   |
| View | `/face/history`              | GET    | ✅   |

---

## 🎓 Key Concepts

**Face Registration:**

- Happens once per user
- Creates face vector in AWS collection
- Stored with user_id as external ID

**Face Verification:**

- Happens multiple times
- Searches collection for similar faces
- Uses similarity threshold (default 85%)

**Attendance Recording:**

- Only after successful verification
- Linked to session and user
- Records check_in_time and status

**Session Management:**

- planning → open → closed
- Only open sessions accept scans
- Can view all records in closed session

---

**Happy Testing!** 🚀
