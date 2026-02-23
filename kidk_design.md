---
layout: page
title: Kidk Software Design
permalink: /kidk_design/
---

<div dir="rtl" lang="fa">

# طراحی نرم‌افزار کیدک (نسخه قابل پیاده‌سازی)

این سند نسخه فنی طراحی کیدک است و خروجی آن به‌گونه‌ای تنظیم شده که تیم توسعه موبایل، بک‌اند، AI، QA و DevOps بتوانند مستقیم وارد پیاده‌سازی شوند.

## 1) اهداف معماری

1. **ایمنی و پایداری** برای داده‌های سلامت کودک
2. **پاسخ‌گویی نزدیک به بلادرنگ** برای پایش تب و هشدارها
3. **طراحی ماژولار** برای توسعه مرحله‌ای (MVP تا نسخه کامل)
4. **مقیاس‌پذیری** برای افزایش کاربران و پایش‌های همزمان
5. **سادگی تجربه کاربر** برای والدین با حداقل گام عملیاتی

## 2) معماری کلان سیستم (HLD)

```text
 [Parent Mobile App] ----\
 [Caregiver Mobile App] --+--> [API Gateway / BFF] --> [Application Core]
 [Doctor Web Panel] ------/              |                   |
                                         |                   +--> Auth & User Module
                                         |                   +--> Child Profile Module
                                         |                   +--> Fever Monitoring Module
                                         |                   +--> Jaundice Module
                                         |                   +--> Vaccination Module
                                         |                   +--> Growth & Development Module
                                         |                   +--> Consultation & Chat Module
                                         |                   +--> Reporting Module
                                         |
                                         +--> [WebSocket Hub]
                                         +--> [Notification Worker]
                                         +--> [AI Integration Worker]
                                         +--> [Payment Integration Worker]

 Data Layer:
   - PostgreSQL (transactional + health records)
   - Redis (OTP, cache, rate-limit, ephemeral states)
   - Object Storage S3-compatible (images/audio/documents)
```

### تصمیم معماری
- برای فازهای 1 و 2: **Modular Monolith** (داخل یک بک‌اند واحد با ماژول‌های مستقل)
- برای فازهای 3 و 4: استخراج تدریجی سرویس‌های پرترافیک (Chat/Notification/AI) به سرویس مستقل

این انتخاب، هم سرعت تحویل MVP را بالا می‌برد و هم هزینه نگهداری را کاهش می‌دهد.

## 3) معماری اپ موبایل

### 3.1 فناوری پیشنهادی
- **Flutter** (یک کدبیس برای Android/iOS)
- State Management: **Riverpod** یا **Bloc**
- Local DB: **Drift / SQLite**
- Bluetooth: plugin مبتنی بر BLE با abstraction داخلی
- Charting: نمودار تعاملی با zoom/pan و marker رویداد

### 3.2 ساختار لایه‌ای (Clean Architecture)

```text
lib/
  core/              # constants, error handling, network, auth guards
  shared/            # reusable widgets, forms, chart components
  features/
    auth/
      data/          # dto, api client, local cache
      domain/        # entities, use-cases
      presentation/  # screens, controllers
    fever/
    jaundice/
    vaccination/
    growth/
    consultation/
    remote_monitoring/
```

### 3.3 اصول UX اجرایی
- همه عملیات پرتکرار در کمتر از 3 تعامل
- فرم‌های کوتاه + auto-fill
- پیام‌های غیرترسناک برای هشدارها
- نمایش وضعیت آفلاین و همگام‌سازی مجدد

## 4) طراحی بک‌اند

### 4.1 ماژول‌ها
1. **Auth Module**
   - ثبت‌نام OTP
   - ورود با رمز
   - Refresh token
   - تغییر رمز عبور
2. **Child Module**
   - CRUD کودک
   - آستانه هشدار تب
3. **Fever Module**
   - ایجاد session پایش
   - دریافت sampleها
   - ثبت event درمانی
   - محاسبه max temp و هشدار
4. **Jaundice Module**
   - مدیریت 4 تصویر
   - ثبت ROI کالیبراتور
   - ارسال به AI engine
   - ذخیره نتیجه و توصیه
5. **Vaccination Module**
   - برنامه واکسن سنی
   - ثبت تزریق
   - یادآوری موعد/تاخیر
6. **Growth Module**
   - ثبت رشد جسمی
   - ثبت ارزیابی تکامل/حسی-حرکتی
   - تحلیل ساده و وضعیت کلی
7. **Consultation Module**
   - لیست پزشکان
   - درخواست مشاوره + ضمائم
   - پرداخت
   - چت real-time
8. **Remote Monitoring Module**
   - دسترسی کاربران مجاز
   - استریم داده تب از سرور
   - پیام با مربی
9. **Reporting Module**
   - گزارش واکسیناسیون PDF
   - گزارش خلاصه سلامت کودک

### 4.2 فناوری پیشنهادی بک‌اند
- Runtime: **Python FastAPI** (هم‌راستا با AI و توسعه سریع)
- Real-time: **WebSocket**
- Queue: **RabbitMQ** (اختیاری فاز 2 به بعد)
- DB: **PostgreSQL 15+**
- Cache/OTP: **Redis**

## 5) طراحی پایش تب (State Machine)

```text
IDLE
  -> CONNECTING_BLE
      -> WARMUP (message: "تب‌سنج هنوز به دمای کودک نرسیده است.")
          -> MONITORING (1 sample/min)
              -> ALARM_HIGH_FEVER (if temp > threshold)
              -> ALARM_DETACH (if temp < 32)
              -> EVENT_LOGGED (drug / sponge)
              -> STOP_CONFIRM
                  -> DISEASE_LABELING
                      -> STOPPED
```

### قواعد کلیدی
- اگر فاز هم‌دمایی تایید نشده باشد، تب نهایی/نمودار رسمی قابل استناد نیست.
- ثبت «عنوان بیماری» هنگام پایان session اجباری است (با پیشنهاد آخرین عنوان قبلی).
- برای اتصال دو کاربر همزمان به تب‌سنج، تایید افزایش مصرف باتری ضروری است.

## 6) طراحی پایش زردی

### 6.1 جریان اجرایی
1. نمایش آموزش قرار دادن کالیبراتور
2. اخذ خودکار 4 عکس (2 فلش + 2 بدون فلش)
3. بعد از هر عکس، انتخاب محدوده کالیبراتور (ROI)
4. اعتبارسنجی کامل بودن 4 تصویر + ROI
5. ارسال به AI backend
6. ذخیره نتیجه + نمایش توصیه خودکار

### 6.2 قواعد اعتبارسنجی
- اگر تعداد عکس کمتر از 4 باشد، ارسال ممنوع
- اگر ROI هر کدام از 4 عکس ثبت نشود، ارسال ممنوع
- متادیتا شامل نور/فلش/زمان/مدل گوشی همراه ذخیره شود

## 7) مدل داده سطح بالا

برای اجرای مستقیم دیتابیس، فایل زیر اضافه شده است:

- `static_files/projects/kidk/kidk_schema.sql`

موجودیت‌های اصلی:
- users, otp_requests, user_sessions
- children
- fever_sessions, fever_samples, fever_events
- jaundice_tests, jaundice_images
- vaccination_catalog, vaccination_records, reminder_jobs
- growth_measurements, development_assessments, sensory_motor_assessments
- doctor_profiles, consultations, consultation_messages
- remote_monitoring_permissions

## 8) طراحی API

برای قرارداد اولیه API، فایل زیر اضافه شده است:

- `static_files/projects/kidk/kidk_openapi.yaml`

دسته endpointها:
- `/auth/*`
- `/children/*`
- `/fever/*`
- `/jaundice/*`
- `/vaccinations/*`
- `/growth/*`
- `/consultations/*`
- `/remote-monitoring/*`

## 9) امنیت و حریم خصوصی

1. TLS اجباری برای همه ارتباطات
2. ذخیره امن رمز عبور با Argon2 یا BCrypt
3. JWT کوتاه‌عمر + Refresh Token Rotation
4. کنترل دسترسی مبتنی بر نقش (Parent/Doctor/Caregiver)
5. ثبت لاگ ممیزی (Audit Trail) برای رخدادهای حساس
6. نگهداری تصاویر پزشکی در object storage با URL امضاشده و زمان‌دار
7. Rate limit برای OTP و Login

## 10) کیفیت، مانیتورینگ و SLA

- Crash-free sessions اپ: بالای 99%
- تاخیر نمایش نمونه تب بعد از دریافت از سنسور: زیر 2 ثانیه
- تاخیر ارسال هشدار بحرانی: زیر 5 ثانیه
- دسترس‌پذیری سرویس API: 99.9%
- مانیتورینگ: metrics + logs + traces

## 11) برنامه اجرای پیشنهادی (12 اسپرینت)

### فاز 1 - MVP (اسپرینت 1 تا 4)
- احراز هویت
- مدیریت کودک
- پایش تب زنده + سوابق + رویداد درمانی
- هشدارهای اصلی

### فاز 2 (اسپرینت 5 تا 7)
- پایش زردی + ارتباط AI
- واکسیناسیون + یادآوری
- گزارش PDF

### فاز 3 (اسپرینت 8 تا 10)
- مشاوره پزشکی + پرداخت + چت real-time
- پایش رشد جسمی/تکامل/حسی-حرکتی

### فاز 4 (اسپرینت 11 تا 12)
- پایش از راه دور تب
- بهینه‌سازی کارایی
- A/B تست پیام‌های هشدار و UX

## 12) Definition of Done برای هر ماژول

1. پوشش تست واحد و یکپارچه برای مسیرهای اصلی
2. پوشش سناریوهای شکست (قطع BLE/قطع اینترنت/timeout AI)
3. لاگ و مانیتورینگ کامل
4. مستندات API و release note
5. تایید Product Owner بر اساس معیارهای پذیرش

</div>
