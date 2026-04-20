# 🚀 FaceCloud Backend - Hướng Dẫn Sử Dụng Nhanh

## Tình Trạng Hiện Tại ✅

- ✅ Server chạy trên port 3000
- ✅ Database PostgreSQL kết nối thành công
- ✅ AWS Rekognition cấu hình sẵn sàng
- ✅ Tất cả APIs đã hoàn thiện
- ✅ Test UI sẵn sàng tại `http://localhost:3000/api-test`

---

## 📋 Toàn Bộ APIs Đã Implement

### 🔐 Authentication (3 endpoints)

- `POST /auth/register` - Đăng ký user
- `POST /auth/login` - Đăng nhập
- `GET /auth/profile` - Lấy thông tin user

### 😊 Face Recognition (5 endpoints)

- `GET /face/profile` - Lấy khuôn mặt đã đăng ký
- `POST /face/register` - Đăng ký khuôn mặt (lưu vào AWS)
- `POST /face/verify` - Xác thực khuôn mặt
- `POST /face/compare` - So sánh chi tiết khuôn mặt
- `GET /face/history` - Lịch sử xác thực

### 📅 Attendance Management (5 endpoints)

- `POST /attendance/session/create` - Tạo buổi điểm danh
- `POST /attendance/session/open` - Mở buổi (bắt đầu quét)
- `POST /attendance/session/close` - Đóng buổi
- `GET /attendance/session/list` - Danh sách buổi
- `GET /attendance/session/:id` - Chi tiết buổi + danh sách điểm danh

### 🔍 Attendance Scan (1 endpoint)

- `POST /attendance/scan` - Quét mặt để điểm danh

**Tổng cộng: 14 endpoints hoàn thiện**

---

## 🧪 Cách Test

### Cách 1: Dùng Test UI (Dễ nhất ✨)

1. Mở browser → `http://localhost:3000/api-test`
2. Điền email/password
3. Click "Login"
4. Chọn ảnh hoặc URL ảnh
5. Test từng endpoint

### Cách 2: Dùng Postman

Import collection: `FaceCloud.postman_collection.json`

### Cách 3: cURL từ Terminal

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student01@example.com","password":"123456"}'

# Copy token từ response
# Sau đó sử dụng cho các API khác
curl -X GET http://localhost:3000/face/profile \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📸 Workflow Thực Tế

### Bước 1: Tạo User & Đăng Ký Khuôn Mặt

```
POST /auth/register → Tạo tài khoản
POST /auth/login → Đăng nhập (lấy JWT token)
POST /face/register → Tải ảnh khuôn mặt lên AWS
```

### Bước 2: Tạo Buổi Điểm Danh

```
POST /attendance/session/create → Tạo buổi mới
POST /attendance/session/open → Mở buổi (sẵn sàng quét mặt)
```

### Bước 3: Quét Mặt Điểm Danh

```
POST /attendance/scan → Gửi ảnh, hệ thống kiểm tra & lưu kết quả
```

### Bước 4: Xem Kết Quả

```
GET /attendance/session/:id → Lấy danh sách điểm danh
GET /face/history → Xem lịch sử verify
```

### Bước 5: Đóng Buổi

```
POST /attendance/session/close → Kết thúc buổi điểm danh
```

---

## 🔄 Dữ Liệu Mẫu Sẵn Có

Database đã có:

- **4 users** (có thể login)
- **1 face profile** (khuôn mặt đã đăng ký)
- **2 attendance records** (lịch sử điểm danh)

### Tài Khoản Test

```
Email: student01@example.com
Password: 123456
```

---

## 🎯 Thử Ngay (3 Bước)

### 1️⃣ Mở Test UI

```
http://localhost:3000/api-test
```

### 2️⃣ Login

- Email: `student01@example.com`
- Password: `123456`
- Click "Login"

### 3️⃣ Test Một trong các APIs

- **Đầu tiên**: Click "GET /face/profile" (để xem ảnh đã đăng ký)
- **Thứ hai**: Chọn ảnh → Click "POST /face/compare" (để so sánh)
- **Thứ ba**: Click "Create" session → "Open" session → "POST /attendance/scan"

---

## 🔧 Nếu Muốn Thay Đổi

### Cấu Hình AWS

File: `.env`

```
AWS_REGION=us-east-1
AWS_REKOGNITION_COLLECTION_ID=facecloud-users
FACE_MATCH_THRESHOLD=85  # Điều chỉnh độ nhạy nhận dạng
```

### Cấu Hình Database

File: `.env`

```
DATABASE_URL=postgresql://cloudface:password@host:5432/cloudface
```

### JWT Secret (Bảo Mật)

File: `.env`

```
JWT_SECRET=day_la_khoa_bi_mat_cua_cloudface
```

---

## 📁 Cấu Trúc Files

```
src/
├── controllers/          # Xử lý logic
│   ├── face.controller.js           ✅ 5 functions
│   ├── attendance.controller.js      ✅ 6 functions
│   ├── auth.controller.js            ✅ 3 functions
│   └── ...
├── routes/              # Define endpoints
│   ├── face.routes.js               ✅ 5 endpoints
│   ├── attendance.routes.js         ✅ 6 endpoints
│   ├── auth.routes.js               ✅ 3 endpoints
│   └── ...
├── services/
│   └── rekognition.service.js       ✅ AWS integration
├── middlewares/
│   └── auth.middleware.js           ✅ JWT verification
└── index.js                         ✅ Server entry point

public/
└── api-test.html                    ✅ Test UI

.env                                 ✅ Configuration
```

---

## 🚨 Troubleshooting

### "Không kết nối được AWS"

- Kiểm tra `.env`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Kiểm tra region: `AWS_REGION=us-east-1`

### "Không phát hiện khuôn mặt"

- Ảnh phải rõ, khuôn mặt hướng camera
- Thử ảnh khác hoặc chụp lại

### "Token hết hạn"

- Login lại để lấy token mới
- Copy token vào "JWT Token" field

### "Không tìm thấy buổi điểm danh"

- Kiểm tra session status là "open"
- Hoặc gửi `attendance_session_id` trong request body

---

## 📊 API Metrics

| Endpoint                   | Method | Auth | Response Time    |
| -------------------------- | ------ | ---- | ---------------- |
| /auth/login                | POST   | ❌   | ~50ms            |
| /face/register             | POST   | ✅   | ~2-3s (AWS)      |
| /face/verify               | POST   | ✅   | ~1-2s (AWS)      |
| /face/compare              | POST   | ✅   | ~1-2s (AWS)      |
| /attendance/scan           | POST   | ✅   | ~2-3s (AWS + DB) |
| /attendance/session/create | POST   | ✅   | ~100ms           |
| /attendance/session/list   | GET    | ✅   | ~50ms            |
| /attendance/session/:id    | GET    | ✅   | ~100ms           |

---

## 🎓 Tiếp Theo (Optional)

### Nâng Cao

1. **Batch Verification** - So sánh nhiều ảnh cùng lúc
2. **Real-time WebSocket** - Xem điểm danh realtime
3. **Mobile App** - Build frontend với React Native
4. **Analytics** - Thống kê, báo cáo
5. **Face Liveness** - Kiểm tra ảnh sống (chống lừa)

### DevOps

1. **Docker** - Containerize ứng dụng
2. **AWS Deployment** - Deploy lên AWS ECS/Lambda
3. **CI/CD** - GitHub Actions
4. **Monitoring** - CloudWatch logs

---

## 📞 Hỗ Trợ

- **API Docs**: Xem `API_ENDPOINTS.md`
- **Test UI**: http://localhost:3000/api-test
- **Postman Collection**: `FaceCloud.postman_collection.json`
- **Code**: Xem comments trong `src/controllers/`

---

**Tất cả APIs đã hoàn thiện! Sẵn sàng sử dụng.** ✨
