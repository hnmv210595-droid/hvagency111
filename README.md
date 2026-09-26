# HV-Agency Internal

Website nội bộ quản lý nhân sự, chấm công và tính lương.

```text
GitHub → Cloudflare Pages/Workers → Cloudflare D1
```

## Stack

- React + TypeScript + Vite
- Tailwind CSS (+ UI components kiểu shadcn)
- Hono API trên Cloudflare Workers
- Cloudflare D1
- Session cookie HttpOnly (không dùng localStorage cho auth)
- Timezone: `Asia/Ho_Chi_Minh` · Tiền tệ: VNĐ

## Tính năng

| Role | Quyền |
|------|--------|
| **ADMIN** | Nhân viên, điểm danh, doanh thu, bảng lương, báo cáo, audit log, settings |
| **EMPLOYEE** | Hồ sơ, check-in/out, xem ngày công / doanh thu / lương của mình |

Employee chỉ đăng nhập từ IP công ty (server-side Worker). Admin đăng nhập mọi IP.

Quy tắc lương (configurable):

- `paid_days = PRESENT + PAID_LEAVE`
- `base_salary_paid = base_salary × paid_days / standard_work_days` (không vượt LCB)
- `commission = revenue × commission_rate / 100`
- `social_insurance = insurance_base × insurance_rate / 100`
- `net_salary = gross_income - social_insurance - other_deductions`

> Hệ thống chỉ áp dụng số liệu Admin cấu hình — **không phải tư vấn pháp lý / BHXH**.

## Setup nhanh

```bash
npm install
cp .env.example .dev.vars   # chỉnh SESSION_SECRET (Windows: copy .env.example .dev.vars)
npm run db:migrate:local
ADMIN_USERNAME=Admin111 ADMIN_PASSWORD='your-strong-password' npm run create-admin
npm run dev
```

Tài khoản admin mặc định: **Admin111**. Mật khẩu không commit vào Git — truyền qua `ADMIN_PASSWORD` khi chạy `create-admin` (hash lưu trong D1). Trên Cloudflare chỉ set secret hạ tầng (vd. `SESSION_SECRET`), không lưu plaintext mật khẩu đăng nhập trong Worker vars.

Mở `http://localhost:5173`.

> **Windows note:** Nếu `wrangler d1 ... --local` báo lỗi workerd / VC++ Redistributable, cài [Latest supported VC++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) rồi chạy lại migrate. Trên Linux/macOS hoặc CI Cloudflare thường không gặp lỗi này.

## Scripts

| Script | Mô tả |
|--------|--------|
| `npm run dev` | Dev server (Vite + Worker) |
| `npm run build` | Build production |
| `npm run test` | Chạy unit tests |
| `npm run create-admin` | Tạo ADMIN đầu tiên (không hard-code) |
| `npm run db:migrate:local` | Apply D1 migrations (local) |
| `npm run db:migrate:remote` | Apply D1 migrations (production) |
| `npm run deploy` | Build + `wrangler deploy` |

## Cloudflare production

1. Tạo D1 database:

```bash
npx wrangler d1 create hv-agency
```

2. Cập nhật `database_id` trong `wrangler.toml`.

3. Set secret (không commit vào GitHub):

```bash
npx wrangler secret put SESSION_SECRET
```

4. Migrate + deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

5. (Tuỳ chọn) gắn custom domain trên Cloudflare dashboard.

Biến môi trường:

| Key | Mô tả |
|-----|--------|
| `COMPANY_IP` | IP công ty, nhiều IP cách bằng dấu phẩy |
| `SESSION_SECRET` | Secret session (≥16 ký tự) — **secret** |
| `SESSION_TTL_HOURS` | Thời hạn session (mặc định 24) |
| `LOGIN_RATE_LIMIT` | Số lần login sai / cửa sổ |
| `TIMEZONE` | Mặc định `Asia/Ho_Chi_Minh` |
| `TELEGRAM_SEND_BOT_TOKEN` | Bot gửi lương (ngày 1) — **secret** |
| `TELEGRAM_RECEIVE_BOT_TOKEN` | Bot trả lời chat_id — **secret** |
| `TELEGRAM_CHAT_ID` | (Tuỳ chọn) fallback nếu chưa có nhóm trong panel — **secret** |
| `TELEGRAM_WEBHOOK_SECRET` | (Tuỳ chọn) bảo vệ webhook bot nhận — **secret** |

## Telegram (2 bot, nhiều nhóm)

Hệ thống dùng **2 bot**; danh sách nhóm nhận lương quản lý trên panel **Telegram** (Admin):

1. **Send bot** (`TELEGRAM_SEND_BOT_TOKEN`): ngày 1 hàng tháng ~08:00 ICT (cron `0 1 1 * *` UTC) gửi tin lương tháng trước tới **mọi nhóm đang bật** trong D1. Mỗi NV × mỗi nhóm một tin, format:

```
Tên NV: **Tên**
Tháng: **MM/YYYY**
Lương CB: **… VNĐ**
HH: **… VNĐ**
Nghỉ không lương: **số ngày**
Thực Nhận: **… VNĐ**
```

(Giá trị sau dấu `:` được bôi đậm bằng Telegram HTML `<b>`.)

2. **Receive bot** (`TELEGRAM_RECEIVE_BOT_TOKEN`): webhook `POST /api/telegram/webhook` — khi nhắn bot hoặc thêm bot vào nhóm, bot trả về **Chat ID**. Copy vào panel Telegram trên website (không cần secret `TELEGRAM_CHAT_ID` nữa; secret chỉ còn fallback nếu DB trống).

Setup nhanh sau deploy:

```bash
npx wrangler secret put TELEGRAM_SEND_BOT_TOKEN
npx wrangler secret put TELEGRAM_RECEIVE_BOT_TOKEN
# optional fallback / webhook:
# npx wrangler secret put TELEGRAM_CHAT_ID
# npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npm run db:migrate:remote
```

Admin UI: **Telegram** — thêm/sửa/xóa nhóm (`name` + `chat_id` dạng `-5581029985`), bật/tắt, gắn webhook, gửi thử.

Ưu tiên gửi bản `LOCKED`; nếu chưa khóa thì gửi `CALCULATED`.

## Bảo mật

- Password: PBKDF2-SHA256 (Web Crypto), salt ngẫu nhiên
- Session: token random, lưu hash trong D1, cookie `HttpOnly` + `Secure` (HTTPS) + `SameSite=Lax`
- Rate limit login theo username + IP
- RBAC + IP restriction trên Worker (không tin frontend)
- Prepared statements (chống SQL injection)
- Secure headers / XSS basics
- Audit log thao tác quan trọng
- Không lưu secret trong repo

## API chính

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/me

GET|POST|PUT|DELETE /api/employees
POST /api/employees/:id/reset-password

GET  /api/attendance
POST /api/attendance/check-in
POST /api/attendance/check-out

GET|POST|PUT /api/revenues

GET  /api/payroll
POST /api/payroll/calculate
POST /api/payroll/:id/lock|unlock

GET  /api/reports
GET  /api/audit-logs
GET|PUT /api/settings
```

## Cấu trúc

```text
src/                 # React SPA
worker/              # Cloudflare Worker API
shared/              # Types + PayrollCalculationService
migrations/          # D1 SQL migrations
scripts/create-admin.ts
tests/
wrangler.toml
```

## License

Private — nội bộ HV-Agency.
