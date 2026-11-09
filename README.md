# Marketplace Adsy Team

React + Vite + Supabase, menggunakan logo dan warna Adsy (navy, cyan, kuning), sidebar collapse yang bisa di-scroll, serta navigasi bawah pada HP.

## Pasang di GitHub, Vercel, dan Supabase

1. Buat repository GitHub baru, unggah seluruh isi folder proyek.
2. Pada project Supabase yang sama dengan Akuisisi/CRM, jalankan **hanya `supabase/schema.sql` dari proyek Marketplace ini sekali**. Seluruh tabel dan fungsi baru memakai awalan `mp_`. Jangan menjalankan ulang SQL Akuisisi atau CRM. Jangan menjalankan file di `supabase/tests` pada database produksi.
3. Siapkan admin pertama. Gunakan akun Auth yang sudah ada atau buat pengguna manual di Supabase Authentication. Ganti UUID dan nama di SQL berikut:

```sql
insert into public.mp_profiles(id,name,email,role,status)
select id,'Admin Marketplace',email,'admin','active'
from auth.users where id='UUID-AUTH-ADMIN'
on conflict(id) do update set name=excluded.name,role='admin',status='active';
```

4. Import repository ke Vercel. Framework **Vite**, build `npm run build`, output `dist`.
5. Tambahkan env berikut untuk Production/Preview/Development, lalu redeploy:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLIC_ANON_KEY
```

Nilainya boleh sama dengan aplikasi Akuisisi dan CRM jika memakai project yang sama. **Tidak perlu service_role atau OpenAI key.** Jangan masukkan service_role ke frontend.
6. Di Supabase Authentication > URL Configuration > Redirect URLs, tambahkan URL Vercel Marketplace. Pertahankan URL aplikasi lain. Signup Marketplace memasok `emailRedirectTo` ke origin aplikasi; jangan mengganti Site URL global tanpa mempertimbangkan aplikasi lain.
7. Masuk sebagai admin. Buat toko, master produk, dan mapping. Anggota mendaftar melalui Daftar, kemudian admin mengaktifkan akun dan menugaskan toko.

Tanpa env, aplikasi berjalan dalam **mode demo lokal dengan data simulasi**. Data contoh tidak berasal dari pesanan pelanggan asli. Tombol **Kosongkan laporan** mengosongkan pesanan/iklan/riwayat demo untuk menguji impor nyata, sambil mempertahankan toko dan mapping contoh. Tombol Reset mengembalikan contoh awal. Data yang diimpor dalam mode demo tersimpan hanya di browser tersebut, bukan Supabase.

Lokal: Node 20+, `npm ci`, salin `.env.example` ke `.env`, lalu `npm run dev`.

## Akses

- **Admin:** semua toko, laporan, impor, biaya, pengaturan produk/mapping, penugasan, dan akun.
- **Anggota:** hanya toko yang ditugaskan, beserta pesanan, iklan, dan riwayatnya. Boleh mengimpor serta mengisi biaya manual/komisi pada toko tersebut.
- Pengguna baru selalu `staff/pending`, walaupun metadata signup meminta admin. Admin ditetapkan melalui bootstrap SQL atau oleh admin lain. Akun nonaktif tidak dapat membaca data.
- Toko nonaktif tetap dapat dilihat sebagai riwayat sesuai akses, tetapi tidak menerima impor/biaya iklan baru.
- Admin bisa membuat beberapa admin. Pengubahan peran akun sendiri diblokir di UI/RPC agar tidak kehilangan akses tanpa sengaja.

Semua tabel menggunakan RLS. Penulisan pesanan, iklan impor, riwayat, dan perubahan akses berlangsung melalui RPC. Penugasan toko diperbarui atomik. Pencabutan penugasan mencabut akses ke seluruh riwayat toko tersebut. Filter penanggung jawab memakai penugasan saat ini, bukan struktur historis per tanggal.

Supabase Auth tetap satu. Bila email sudah terdaftar pada aplikasi lain, masuk dengan akun Auth yang sama lalu Ajukan akses Marketplace. Profil Marketplace tetap terpisah di `mp_profiles`. Signup ini memakai metadata `app: marketplace_adsy` tanpa `account_role`, sehingga tidak memicu pembuatan profil Akuisisi. Trigger Marketplace mengabaikan signup aplikasi lain. Coexistence dengan schema Akuisisi dan CRM telah diuji lokal.

## Upload Shopee: 4 file dari toko dan satu tanggal yang sama

1. **Order.all...xlsx**: pesanan semua status.
2. **Data Keseluruhan Iklan Shopee...csv**: biaya iklan produk biasa dan total otomatis.
3. **Rincian Data Iklan Produk Otomatis...csv**: rincian otomatis per Kode Produk.
4. **Shop Ads Overall Data...csv**: biaya iklan toko.

Pilih toko dengan **ID Toko yang sesuai metadata CSV**. Sistem menolak ID toko atau tanggal yang tidak cocok. CSV iklan harus diekspor per satu hari; rentang beberapa hari hanya berisi agregat dan tidak dapat dipecah akurat. File pesanan dalam satu bundle Shopee harus memakai tanggal harian yang sama dengan ketiga CSV.

Biaya = iklan produk biasa + rincian otomatis + iklan toko + selisih pembulatan otomatis. Baris total otomatis **tidak ditambahkan lagi**. Selisih kecil antara total dan detail otomatis dicatat di tingkat toko, bukan dibebankan sembarang ke produk. Selisih terlalu besar atau total otomatis yang berbeda antarfile ditolak.

Contoh sumber yang dianalisis memberi total dasar **Rp907.719**, pajak **11% = Rp99.849,09**, dan total **Rp1.007.568,09**. Ketiganya ditampilkan terpisah. Tarif pajak Shopee awal 11%, dapat diatur per toko; tarif disimpan bersama baris impor. Pembaruan pengaturan pajak tidak mengubah impor yang sudah tersimpan kecuali tanggal tersebut diimpor ulang.

- Pesanan unik: `No. Pesanan`, dihitung satu kali per toko.
- Tanggal: `Waktu Pesanan Dibuat`.
- Nilai produk: `Subtotal Pesanan`, **bukan Total Pembayaran**.
- Paket: `Jumlah`; isi fisik mengikuti mapping `Nomor Referensi SKU`, fallback SKU Induk/nama bila kosong.
- Status Batal/Belum Bayar tidak masuk omzet utama.

## TikTok: 1 file pesanan + biaya iklan manual

Gunakan **Semua pesanan...xlsx**. Baris kedua yang berisi deskripsi kolom diabaikan. Ekspor contoh memiliki struktur XML dengan nomor row berulang; pembaca memperbaiki pengelompokan row tanpa mengubah nilai cell sebelum membacanya. ID panjang tetap berupa teks.

- Identitas: `Order ID`; baris item dikenali dari SKU/variasi dan urutan item pada pesanan.
- Tanggal: `Created Time`, format tanggal Indonesia **DD/MM/YYYY**.
- Produk/paket: `Seller SKU` atau `SKU ID`, `Quantity`.
- Omzet: `SKU Subtotal After Discount`. Bukan `Order Amount` dan bukan pendapatan bersih pencairan. Nilai ini sudah memperhitungkan diskon platform sesuai file; belum ada rekonsiliasi subsidi/keuangan bersih.
- Sumber `Purchase Channel` dipertahankan: pesanan TikTok dan Tokopedia bisa dibedakan melalui filter sumber pesanan. Video/LIVE/Product Cards tidak dihitung sebagai biaya iklan.
- Biaya iklan dan pajaknya diinput manual per toko/tanggal. Default pajak TikTok 0% untuk diisi sesuai biaya sebenarnya, bukan otomatis 11%.

## Lazada: 1 file pesanan + biaya iklan manual

- Pesanan unik: `orderNumber`.
- Identitas item: `orderItemId`; satu pesanan dapat berisi beberapa item.
- Tanggal: `createTime`.
- Produk: `sellerSku`, fallback `lazadaSku`.
- **Omzet = Σ unitPrice dari item pesanan aktif**, sesuai keputusan pemilik. Tidak memakai `paidPrice` atau mengurangi diskon lagi.
- Ekspor contoh tidak menyediakan Quantity. **Satu orderItemId diperlakukan sebagai satu paket**, lalu dikalikan isi paket pada mapping untuk unit fisik. Bila jenis ekspor lain mencatat beberapa paket dalam satu item, asumsi ini harus ditinjau sebelum digunakan.
- `ready_to_ship` masuk pesanan aktif. Status yang tidak dikenal masuk Perlu Dicek.
- Biaya iklan dan pajak diinput manual per toko/tanggal. Default pajak Lazada 0%, dapat disesuaikan.

## Status, pembatalan, dan retur

Halaman terpisah menampilkan Dibatalkan, Gagal Bayar, Belum Bayar, Retur/Refund, dan Perlu Dicek. Gagal Bayar merupakan **subset pembatalan dengan alasan kegagalan pembayaran yang eksplisit**. Belum Bayar belum berarti gagal. Alasan pembatalan/pengembalian dari sumber dipertahankan.

Status baru yang tidak dikenali tidak otomatis dianggap aktif. Pesanan multi-produk dihitung unik di tingkat toko, tetapi dapat muncul di beberapa produk/status. **Jangan menjumlahkan jumlah pesanan antarproduk atau kategori status** sebagai total unik toko.

Retur parsial/refund ditandai untuk pemeriksaan; tidak otomatis mengurangi omzet aktif. Nilai refund pada beberapa sumber dapat berlaku di tingkat pesanan, sehingga tidak dijumlahkan sembarang antaritem. Sistem ini belum merekonsiliasi pencairan keuangan bersih atau menjurnal refund. Pesanan berstatus returned dikeluarkan dari omzet aktif; item valid dengan indikator retur parsial tetap menggunakan nilai gross sampai direkonsiliasi.

## Mapping produk dan paket

Master produk Marketplace dipakai bersama seluruh toko, tetapi terpisah dari master Akuisisi/CRM. Mapping dibuat **per toko**:

- Jenis **SKU pesanan**: kode SKU → produk master + isi fisik per paket. Contoh PRIMA 4 = 4 box; Quantity 2 = 8 box, tetap satu pesanan bila nomor pesanannya sama.
- Jenis **Kode Produk iklan**: ID listing dari CSV → produk master. Biaya iklan produk biasa dan otomatis kemudian dapat direkap menurut keluarga produk.
- Penulisan kode diseragamkan ke huruf besar dan spasi tunggal. `PRIMA4` dan `PRIMA 4` tetap kode berbeda, dan dapat sama-sama dipetakan ke Primagold.
- Impor boleh disimpan sebelum mapping lengkap. Omzet/pesanan tetap dihitung; unit fisik yang belum terpetakan tidak ditebak. Daftar Belum Dipetakan memudahkan admin melengkapi kode setelah impor, tanpa upload ulang.
- Mapping berlaku pada riwayat juga; perubahan produk/isi paket mengubah rekap kode tersebut. Ini sengaja digunakan untuk memperbaiki mapping yang salah, bukan snapshot master per tanggal.
- Bundle satu SKU saat ini dipetakan ke satu produk utama dan isi paketnya. Bonus atau bundle lintas beberapa produk belum dipecah menjadi beberapa produk.

Iklan toko tidak memiliki Kode Produk. Biayanya dicatat pada tingkat toko, bukan dialokasikan otomatis. Saat filter produk aktif, biaya toko bersama, selisih, dan komisi bersama dikecualikan dari KPI produk dengan catatan yang terlihat. Estimasi fee persentase pada omzet produk masih bisa dihitung; fee aktual bersama tidak dialokasikan.

## Biaya, pajak, dan KPI

- **Omzet aktif**: nilai produk dari item berstatus valid, sesuai aturan masing-masing platform di atas.
- **Pesanan**: nomor pesanan aktif unik per toko. Setidaknya satu item valid membuat pesanan dihitung, tanpa menghitung item batal sebagai omzet.
- **Unit fisik**: Quantity × isi paket pada mapping SKU, hanya item aktif. Bukan kolom Produk Terjual pada CSV iklan.
- **Biaya iklan + pajak**: Σ biaya dasar + Σ (biaya dasar × tarif pajak tersimpan).
- **Komisi affiliate**: input aktual terpisah melalui Komisi & fee; tanpa input tampil 0 tercatat, bukan klaim bahwa komisi memang nol.
- **Fee platform**: memakai input aktual harian jika tersedia; **0 aktual** dibedakan dari kosong. Jika kosong, estimasi omzet aktif × tarif fee toko (default 23%, mengikuti workbook; bisa diubah). Bukan data biaya aktual dari marketplace. Perubahan tarif estimasi toko memengaruhi estimasi historis yang belum diberi override aktual.
- **ROAS operasional** mengikuti formula workbook: omzet aktif ÷ (biaya iklan termasuk pajak + komisi affiliate + fee platform aktual/estimasi). Nama ini membedakannya dari ROAS atribusi Shopee.
- **CAQ**: (biaya iklan termasuk pajak + komisi affiliate) ÷ omzet aktif, ditampilkan persen.
- **Biaya per pesanan**: (biaya iklan termasuk pajak + komisi affiliate) ÷ pesanan aktif unik.
- **ROAS dasar pada performa iklan**: omzet atribusi iklan ÷ biaya dasar tanpa pajak, mengikuti blok bawah workbook. Angka konversi/terjual/omzet atribusi berasal dari CSV dan bisa mengikuti aturan atribusi platform; tidak dianggap pesanan unik atau ditambahkan ke omzet Order All.

Halaman Biaya & Iklan menyediakan **Per produk & toko** dan **Rincian sumber**. CPAS/iklan eksternal dapat diisi manual. Menyimpan biaya manual pada toko/tanggal/jenis/produk yang sama mengganti nilai sebelumnya. Biaya aktual/komisi dan perubahan biaya manual memiliki riwayat audit di `mp_cost_history` (belum ada editor penghapusan audit).

## Upload ulang dan urutan data

- Set **Waktu ekspor (WIB)** sesuai waktu file dibuat/diekspor, bukan tanggal pesanan. Default adalah waktu saat form dibuka; periksa sebelum simpan.
- Sidik file identik per toko dilewati, tidak menambah laporan. Batch file berisi byte yang sama tidak perlu diimpor ulang walaupun nama file diganti.
- Pesanan yang muncul pada file baru diganti seluruh rincian itemnya secara atomik berdasarkan toko + nomor pesanan. Pesanan yang tidak muncul pada file baru tidak dihapus: ekspor bisa berupa sebagian rentang/status.
- File dengan waktu ekspor lebih tua tidak menimpa pesanan/iklan yang sudah memiliki snapshot lebih baru. Perlindungan bergantung pada waktu ekspor yang dimasukkan secara benar; format sumber tidak selalu menyediakan waktu pembaruan lengkap.
- Biaya Shopee diganti sebagai satu snapshot penuh untuk tanggal tersebut. File lama tidak menambah biaya baru atau menggandakan total.
- Impor gagal membatalkan seluruh perubahan transaksi. Dua impor toko yang sama diserialkan di database.
- Maksimum 25 MB/file, 20.000 baris pesanan/batch, dan 10.000 baris iklan/batch. CSV Shopee UTF-8 berkoma sesuai contoh. Workbook/format lain yang headernya berbeda ditolak agar angka tidak ditebak.

## Data dan verifikasi

Parser hanya menyimpan kolom laporan yang diperlukan. Nama/alamat/telepon pembeli dan penerima **tidak disalin ke tabel pesanan**. File sumber asli tidak diunggah ke Supabase Storage; yang disimpan adalah data normalisasi, nama file, sidik file, aktor, dan waktu impor. Jangan menaruh spreadsheet asli di folder `public` atau repository.

Demo yang diterbitkan memakai data simulasi. File asli pengguna digunakan untuk uji parser lokal, tidak dimasukkan ke ZIP/source/deployment. Parser berhasil membaca contoh nyata: Shopee 68 baris/60 aktif, TikTok 16 aktif, Lazada 3 aktif; angka sesuai analisis yang disepakati.

Perintah verifikasi:

```text
npm test
npm run test:db
npm run build
```

Tes meliputi CSV/RFC quoting, format angka Indonesia, ID panjang, perbaikan row XML TikTok, mapping paket, deduplikasi pesanan campuran, rekonsiliasi biaya otomatis tanpa hitung ganda, snapshot lama, perubahan status, akses toko/RLS, beberapa admin, pending signup, biaya manual, actor/tax snapshot, dan rollback impor. Coexistence penuh schema Akuisisi + CRM + Marketplace juga diuji PostgreSQL lokal.

Build produksi dan render komponen server telah diperiksa. **Browser interaktif belum diuji** karena alat browser tidak tersedia pada lingkungan ini. Koneksi Supabase/Vercel pengguna belum dijalankan; perlu memasang SQL dan env sendiri. Grafik harian menampilkan maksimal 366 hari; kartu/rekap/ekspor tetap mengikuti seluruh rentang. Pembacaan tabel Supabase dipaginasi agar tidak terpotong batas 1.000 baris API; volume data sangat besar tetap memerlukan optimasi query server lanjutan.
