# FaceCloud Backend API (Full)

Base URL: http://localhost:3000

Auth header for protected APIs:
Authorization: Bearer <JWT_TOKEN>

## 1. Authentication

### POST /auth/register

Create a new user account (default role: student).

Request body:

```json
{
  "email": "student@example.com",
  "password": "123456",
  "full_name": "Student Name",
  "user_code": "SV001"
}
```

### POST /auth/login

Login and receive JWT token.

Request body:

```json
{
  "email": "student@example.com",
  "password": "123456"
}
```

### GET /auth/me

Get current user profile from token.

### GET /auth/profile

Alias of /auth/me for backward compatibility.

## 2. Users (Admin only)

### POST /users

Create a user with role.

Request body:

```json
{
  "email": "teacher@example.com",
  "password": "123456",
  "full_name": "Teacher A",
  "user_code": "GV001",
  "class_id": 3,
  "role_name": "teacher"
}
```

### GET /users

Get all users with role list.

### GET /users/:id

Get one user by id.

### PUT /users/:id

Update user info.

Request body:

```json
{
  "full_name": "Updated Name",
  "class_id": 3,
  "user_status": "active"
}
```

### DELETE /users/:id

Delete a user.

## 3. Classes

### GET /classes

Get classes with teacher name and student count. Requires login.

### POST /classes

Create class (admin or teacher).

Request body:

```json
{
  "class_name": "Lop ReactJS K1",
  "teacher_id": 2,
  "student_ids": [4, 5]
}
```

### GET /classes/:id

Get class details (admin or teacher).

### GET /classes/:id/students

Get class students (admin or teacher).

## 4. Face Recognition

### GET /face/profile

Get face profile of current user.

### GET /face/profile/:user_id

Get face profile by user id.

### POST /face/register

Register/update face in AWS Rekognition collection.

Request body:

```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ...",
  "face_image_url": "https://example.com/face.jpg"
}
```

### POST /face/verify

Verify if input face exists in collection.

Request body:

```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ...",
  "captured_image_url": "https://example.com/captured.jpg"
}
```

### POST /face/compare

Compare captured face with current user profile.

### POST /face/compare/:user_id

Compare captured face with specific user profile.

### GET /face/history?limit=20

Get verification logs for current user.

### GET /face/history/:user_id?limit=20

Get verification logs for specific user.

## 5. Attendance Sessions

### POST /attendance/session/create

Create attendance session.

Request body:

```json
{
  "class_id": 3,
  "session_date": "2026-04-21",
  "start_time": "08:00:00",
  "end_time": "12:00:00"
}
```

Notes:

- class_id must exist in classes table
- session_date format must be YYYY-MM-DD
- start_time/end_time accept HH:mm, HH:mm:ss, or full timestamp

### POST /attendance/session/open

Open a planning/closed session.

Request body:

```json
{
  "attendance_session_id": 10
}
```

### POST /attendance/session/close

Close an open session.

Request body:

```json
{
  "attendance_session_id": 10
}
```

### GET /attendance/session/list?class_id=3&status=open

List sessions with optional filters.

### GET /attendance/session/:attendance_session_id

Get session details with attendance records.

## 6. Attendance Scan

### POST /attendance/scan

Scan face and record attendance.

Request body:

```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ...",
  "attendance_session_id": 10,
  "captured_image_url": "https://example.com/checkin.jpg"
}
```

Behavior:

- Face must match currently logged in user
- Session must exist and be open
- Upsert by (attendance_session_id, user_id)

## 7. Notifications

### GET /notifications

Get notifications for current user.

### PUT /notifications/:id/read

Mark a notification as read.

## Common Errors

- 400: Validation error (missing/invalid input)
- 401: Missing/invalid token or face verify failed
- 403: Role forbidden or face does not match logged-in user
- 404: Resource not found
- 500: Unexpected server error

## Suggested End-to-End Flow

1. POST /auth/login
2. POST /face/register
3. POST /attendance/session/create
4. POST /attendance/session/open
5. POST /attendance/scan
6. GET /attendance/session/:attendance_session_id
7. POST /attendance/session/close
