# ตั้งค่าระบบ Wi-Fi QR Code (ผู้ดูแล login)

ระบบนี้มี 2 หน้า:

- `wifi.html`: หน้าสาธารณะ ใครเปิดก็เห็น QR Code ไม่ต้อง login
- `wifi-admin.html`: หน้าผู้ดูแล ต้อง login ก่อนจึงจะเพิ่ม แก้ไข หรือลบ Wi-Fi ได้

ข้อมูล Wi-Fi เก็บใน Google Sheets และ Google Apps Script เป็นตัวตรวจรหัสผ่านผู้ดูแล

## ขั้นตอนติดตั้ง (ทำครั้งเดียว)

1. สร้าง Google Sheet ใหม่ แล้วไปที่เมนู **ส่วนขยาย > Apps Script**
2. ลบโค้ดเดิมใน `Code.gs` แล้ววางโค้ดจากไฟล์ `Code.gs` ในโฟลเดอร์นี้ จากนั้นกดบันทึก
3. ตั้งรหัสผ่านผู้ดูแล: ไปที่ **Project Settings** (รูปเฟือง) > **Script properties** > **Add script property**
   - Property: `ADMIN_PASSWORD`
   - Value: รหัสผ่านที่ต้องการ (ควรยาวอย่างน้อย 12 ตัวอักษร)
4. กลับไปที่หน้าโค้ด เลือกฟังก์ชัน `setup` แล้วกด **Run** ครั้งแรกจะมีหน้าขออนุญาต ให้กดอนุญาต ระบบจะสร้างชีตชื่อ `WiFi` ให้
5. กด **Deploy > New deployment** เลือกประเภท **Web app** แล้วตั้งค่าดังนี้:
   - **Execute as: Me**: สคริปต์อ่านและเขียนชีตด้วยสิทธิ์ของเจ้าของ ผู้ใช้ทั่วไปไม่ต้องมีสิทธิ์เข้าชีต
   - **Who has access: Anyone**: หน้าสาธารณะโหลด QR Code ได้โดยไม่ต้อง login Google ส่วนการแก้ไขยังต้องใช้รหัสผ่านผู้ดูแลเสมอ
6. คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`) ไปใส่ในไฟล์ `wifi-qr.js` บรรทัดนี้:
   ```js
   const WIFI_API_URL = 'https://script.google.com/macros/s/xxxxxxxx/exec';
   ```
7. Push ไฟล์ `wifi-qr.js` ขึ้น GitHub แล้วเปิด `https://sutdetsnr.github.io/wifi-admin.html` เพื่อ login และเพิ่ม Wi-Fi ได้เลย

## เมื่อแก้โค้ด Apps Script ภายหลัง

ไปที่ **Deploy > Manage deployments** > กดแก้ไข (รูปดินสอ) ที่ deployment เดิม > เลือก **Version: New version** > **Deploy**
ห้ามสร้าง deployment ใหม่ เพราะ URL จะเปลี่ยน และต้องไปแก้ `wifi-qr.js` อีกครั้ง

## เปลี่ยนรหัสผ่านผู้ดูแล

แก้ค่า `ADMIN_PASSWORD` ใน Script properties ได้ทันทีโดยไม่ต้อง deploy ใหม่

## ข้อควรรู้

- รหัสผ่าน Wi-Fi ถูกฝังอยู่ใน QR Code อยู่แล้ว ใครที่สแกนหรือเปิดหน้า `wifi.html` ได้จึงรู้รหัสผ่าน Wi-Fi ระบบ login มีไว้กันไม่ให้คนอื่น**แก้ไข** ข้อมูล ไม่ได้ซ่อนรหัส Wi-Fi
- รหัสผ่านผู้ดูแลเก็บไว้ฝั่ง Google เท่านั้น ไม่อยู่ในโค้ดหน้าเว็บ
- login แต่ละครั้งใช้ได้ 6 ชั่วโมง หรือจนกว่าจะปิดแท็บ ถ้าใส่รหัสผิดเกิน 20 ครั้งใน 10 นาที ระบบจะล็อกการ login ไว้ 10 นาที
