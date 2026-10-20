BAN SUA: NHAP THU CONG NHAN DAY DU XP

Noi dung:
- app.js: bo he so 0.5 khi tinh XP trong nhat ky cho buoi hoc nhap tay.
- cloudflare/worker.js: tinh XP tiem nang cua ban ghi nhap tay theo cung cong thuc XP nhu buoi hoc bang dong ho.

CACH CAP NHAT
1. Sao luu app.js hien tai va cloudflare/worker.js hien tai.
2. Thay app.js o thu muc goc GitHub bang app.js trong goi nay.
3. Thay cloudflare/worker.js trong thu muc cloudflare bang cloudflare/worker.js trong goi nay.
4. Mo CMD, chuyen vao thu muc cloudflare cua du an va chay: npx wrangler deploy
5. Cho GitHub Pages cap nhat, mo lai trang va bam Ctrl+F5 neu can.

LUU Y
- Ban ghi nhap tay tren may chu van o trang thai cho quan tri vien xac minh; thay doi nay lam XP tiem nang duoc tinh day du, khong tu dong bo qua buoc xac minh.
- Cac ban ghi nhap tay da gui truoc khi cap nhat co the van giu muc XP tiem nang cu da luu. Thay doi nay ap dung cho ban ghi gui sau khi Worker moi duoc deploy.
- Khong can chay migration D1 va khong can xoa hay nhap lai du lieu Firebase.
