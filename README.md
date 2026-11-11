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

## Update pilihan toko tanpa ID eksternal (005)

Jika migrasi 004 sudah dipasang, jalankan **hanya `supabase/migrations/005_selected_shop.sql` sekali**, lalu upload kode terbaru dan redeploy. Jika migrasi sebelumnya belum dipasang, jalankan yang belum terpasang berurutan 002 → 003 → 004 → 005. Jangan ulang `schema.sql` pada database yang sudah terpasang. Instalasi baru tetap cukup satu `schema.sql` yang sudah mencakup seluruh pembaruan.

Pembuatan toko **tidak meminta ID marketplace lagi**. Semua file, termasuk CSV Shopee tanpa baris ID Toko atau dengan ID metadata yang berbeda, masuk ke **akun toko yang dipilih pada form upload**. Nama toko CSV bila tersedia ditampilkan sebagai informasi pratinjau, bukan pengecekan identitas. Pastikan pilihan akun toko benar sebelum menyimpan. Tanggal dan jenis file tetap divalidasi, dan hak akses toko tetap diperiksa di database.

Kolom lama `external_id` dipertahankan untuk kompatibilitas data; tidak digunakan untuk menentukan tujuan atau menolak impor. Indeks unik ID eksternal dilepas. UUID toko internal tetap dipakai untuk memisahkan laporan, mencegah duplikasi, serta menerapkan penugasan/RLS. Data historis tidak dipindahkan atau dihapus. Env tetap sama.

## Update upload bertahap (004)

Jika migrasi 002 dan 003 sudah dipasang, jalankan **hanya `supabase/migrations/004_partial_uploads.sql` sekali**, kemudian deploy kode terbaru. Jika salah satu migrasi sebelumnya belum dipasang, jalankan yang belum terpasang secara berurutan: 002 → 003 → 004. **Jangan ulang `schema.sql` pada database yang sudah terpasang.** Untuk instalasi baru, satu `schema.sql` sudah mencakup seluruh pembaruan.

Shopee sekarang boleh mengunggah **satu file saja atau kombinasi file**. Pesanan boleh masuk dahulu, sedangkan CSV iklan menyusul; CSV juga bisa masuk lebih dahulu tanpa pesanan. Hanya sumber yang dipilih yang diperbarui. File dalam satu upload tetap harus cocok toko dan tanggalnya. Upload pesanan Shopee tanpa CSV boleh memuat beberapa tanggal; CSV iklan tetap satu hari.

- Sumber iklan disimpan terpisah di `mp_ad_parts` menurut toko/tanggal/jenis; keberadaan sumber pesanan dicatat di `mp_order_days`.
- Ringkasan, Biaya & Iklan, dan halaman Upload menunjukkan kelengkapan **Pesanan / Keseluruhan / Rincian otomatis / Iklan toko**. Sumber belum diunggah ditandai, bukan dianggap biaya nol yang sudah direkonsiliasi. KPI parsial adalah sementara. Status 4/4 berarti empat sumber utama tersedia, bukan berarti biaya affiliate/fee aktual sudah direkonsiliasi.
- Tanpa rincian otomatis, total otomatis dari file keseluruhan ditampilkan **sekali** di tingkat toko sebagai Otomatis belum terurai. Saat rincian yang cocok datang, baris ringkasan diganti dengan detail dan selisih pembulatannya; tidak ditambahkan lagi.
- Jika file otomatis datang lebih dahulu, total/detailnya bisa ditampilkan sambil menunggu keseluruhan dan iklan toko.
- Jika total otomatis antara keseluruhan dan rincian berbeda, total dari file keseluruhan diprioritaskan; breakdown otomatis ditahan. Kedua snapshot dipertahankan dan status meminta sinkronisasi. Unggah ulang file periode/toko yang sama dengan data yang cocok.
- Waktu ekspor diperiksa **per sumber**. File rincian lama tidak menimpa rincian baru; mengunggah pesanan saja tidak menghapus iklan, dan mengunggah satu CSV tidak menghapus sumber lain atau CPAS/manual.
- Snapshot lama dari versi wajib empat file diinisialisasi menjadi sumber terpisah tanpa mengubah angka pesanan, iklan, pajak, atau aktornya. RPC lama `mp_import_data` tetap tersedia sebagai adapter kompatibilitas; frontend baru memakai `mp_import_partial`.
- Semua file yang dipilih dalam satu proses disimpan atomik. Jika satu sumber tidak valid, seluruh perubahan batch dibatalkan.

## Update aturan Awalan SKU (PRIMA → Primagold)

Jika sudah memasang Master SKU Bersama (migrasi 002), jalankan **hanya `supabase/migrations/003_sku_prefix.sql` sekali**, kemudian unggah kode terbaru dan redeploy. Jika belum memasang 002, jalankan `002_shared_sku.sql` dahulu, baru 003. **Jangan mengulang `schema.sql` pada database yang sudah terpasang.** Untuk instalasi baru, `schema.sql` sudah mencakup semua pembaruan; cukup satu file tersebut.

Form mapping SKU baru default ke **Awalan SKU**. Isi `PRIMA`, pilih `Primagold`, lalu simpan tanpa memasukkan jumlah unit. SKU `PRIMA 1`, `PRIMA4`, `PRIMA 10`, dan `PRIMA-5` akan dikenali sebagai 1, 4, 10, dan 5 box. Aturan berlaku untuk semua toko dan seluruh rekap, termasuk laporan yang sudah diimpor; tidak perlu upload ulang. Contoh lain `HRB → Herbapil` dan `IDS → Iwe Darken Shampoo`. Awalan harus huruf, tidak memuat angka. Pisahkan aturan alias berbeda bila perlu: PRIMA dan PRIMAGOLD tidak dianggap sama secara otomatis.

Kolom `match_mode` pada `mp_skus` membedakan **prefix** (awalan, units null) dan **exact** (SKU khusus lengkap, units tetap). Mapping lama tetap exact, tidak dikonversi atau dihapus diam-diam. Urutan prioritas: SKU khusus bersama → mapping lama per toko yang belum disatukan → aturan awalan. Karena itu, pengecualian paket khusus tetap berlaku. Satu awalan dan satu SKU khusus dengan teks sama boleh ada sebagai aturan terpisah.

Angka paket dibaca dari SKU sumber, bukan dari judul atau harga. Awalan tidak menetapkan jumlah default pada kode tanpa angka. Volume seperti 30 ML, bundle campuran PRIMA 4 + HRB 1, ID numerik, angka nol, atau angka di luar rentang 1–1000 tidak ditebak. Buat SKU khusus untuk kasus yang memang memerlukan isi paket manual. Bonus GS tanpa angka dapat diperlakukan sebagai bonus di luar jumlah produk utama, mengikuti mapping versi sebelumnya.

## Update Master SKU Bersama dari versi sebelumnya

Jika Marketplace sudah terpasang, jalankan **hanya `supabase/migrations/002_shared_sku.sql` sekali**, kemudian unggah perubahan kode dan redeploy. **Jangan ulang `schema.sql`.** Untuk instalasi baru, `schema.sql` sudah mencakup pembaruan ini; tidak perlu menjalankan migrasi lagi. File `supabase/tests/fixtures/001_store_sku.sql` hanya untuk tes, bukan pemasangan.

Master SKU baru berada di `mp_skus`, berlaku pada **seluruh toko dan platform**. Produk dan isi paket yang konsisten dari mapping SKU lama disatukan otomatis. Mapping lama tidak dihapus. SKU yang produk/isi paketnya berbeda antartoko muncul di tab **Konflik lama** untuk dipilih admin sebagai satu master bersama. Selama belum disatukan, rekap toko tersebut memakai mapping lamanya agar angka unit tidak berubah diam-diam. Setelah admin menyimpan master, semua toko mengikuti pilihan tersebut; data pesanan dan omzet tetap utuh.

Kode Produk iklan tetap disimpan di `mp_mappings` dan **tetap per toko**. Pembuatan/edit SKU pada tabel lama diblokir; gunakan `mp_skus` untuk SKU. Anggota aktif dapat membaca master SKU bersama, tetapi hanya admin yang boleh mengubahnya. Hak akses laporan/keuangan tetap mengikuti penugasan toko.

Untuk SKU khusus lengkap, isi paket masih dapat dibaca otomatis pada form dari kode yang dikenali, misalnya PRIMA 4 → Primagold 4 box. Nilai disimpan saat admin menyimpan master; format yang ambigu tetap memerlukan pengecekan. Mapping khusus yang sudah tersimpan tidak ditimpa diam-diam ketika form dibuka.

## Akses

- **Admin:** semua toko, laporan, impor, biaya, pengaturan produk/mapping, penugasan, dan akun.
- **Anggota:** hanya toko yang ditugaskan, beserta pesanan, iklan, dan riwayatnya. Boleh mengimpor serta mengisi biaya manual/komisi pada toko tersebut.
- Pengguna baru selalu `staff/pending`, walaupun metadata signup meminta admin. Admin ditetapkan melalui bootstrap SQL atau oleh admin lain. Akun nonaktif tidak dapat membaca data.
- Toko nonaktif tetap dapat dilihat sebagai riwayat sesuai akses, tetapi tidak menerima impor/biaya iklan baru.
- Admin bisa membuat beberapa admin. Pengubahan peran akun sendiri diblokir di UI/RPC agar tidak kehilangan akses tanpa sengaja.

Semua tabel menggunakan RLS. Penulisan pesanan, iklan impor, riwayat, dan perubahan akses berlangsung melalui RPC. Penugasan toko diperbarui atomik. Pencabutan penugasan mencabut akses ke seluruh riwayat toko tersebut. Filter penanggung jawab memakai penugasan saat ini, bukan struktur historis per tanggal.

Supabase Auth tetap satu. Bila email sudah terdaftar pada aplikasi lain, masuk dengan akun Auth yang sama lalu Ajukan akses Marketplace. Profil Marketplace tetap terpisah di `mp_profiles`. Signup ini memakai metadata `app: marketplace_adsy` tanpa `account_role`, sehingga tidak memicu pembuatan profil Akuisisi. Trigger Marketplace mengabaikan signup aplikasi lain. Coexistence dengan schema Akuisisi dan CRM telah diuji lokal.

## Upload Shopee: 4 jenis sumber, boleh bertahap

1. **Order.all...xlsx**: pesanan semua status.
2. **Data Keseluruhan Iklan Shopee...csv**: biaya iklan produk biasa dan total otomatis.
3. **Rincian Data Iklan Produk Otomatis...csv**: rincian otomatis per Kode Produk.
4. **Shop Ads Overall Data...csv**: biaya iklan toko.

Pilih akun toko tujuan pada form. ID toko eksternal tidak diperlukan atau dicocokkan; nama toko CSV hanya informasi tambahan. Tanggal laporan tetap divalidasi. CSV iklan harus diekspor per satu hari; rentang beberapa hari hanya berisi agregat dan tidak dapat dipecah akurat. Jika pesanan dan CSV diunggah bersama, tanggalnya harus sama. Jika diunggah terpisah, tiap sumber akan masuk ke tanggalnya sendiri.

Biaya = iklan produk biasa + rincian otomatis + iklan toko + selisih pembulatan otomatis. Baris total otomatis **tidak ditambahkan lagi**. Selisih kecil antara total dan detail otomatis dicatat di tingkat toko, bukan dibebankan sembarang ke produk. Selisih detail terhadap total file otomatis yang terlalu besar ditolak. Bila total file keseluruhan dan file rincian berbeda, breakdown ditahan dan sumber diberi tanda perlu sinkronisasi sampai cocok.

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

Master produk Marketplace dipakai bersama seluruh toko, tetapi terpisah dari master Akuisisi/CRM. Mapping dibedakan menurut jenis:

- Jenis **SKU pesanan bersama (`mp_skus`)**: hubungkan **awalan** ke produk master sekali untuk seluruh toko, misalnya **PRIMA → Primagold**. Turunan SKU PRIMA 1/4/10 mengikuti angka paketnya. Pilihan SKU lengkap khusus tetap tersedia untuk pengecualian. **Isi paket dibaca otomatis dari SKU** yang dikenali setelah produk dipilih: PRIMA 4/PRIMA4 → Primagold 4 box, PRIMA 10 → 10 box, HRB 1 → Herbapil 1 botol, YOU 1 → Youzhi 1 botol, dan Ids1 → Iwe Darken Shampoo 1 pcs. Quantity 2 × PRIMA 4 berarti 8 box, tetap satu pesanan bila nomor pesanan sama. Aturan awalan menyimpan awalan dan produk; jumlah unit dihitung dari masing-masing SKU sumber saat membaca laporan. SKU khusus lengkap menyimpan jumlah unit tetap.
- Jenis **Kode Produk iklan (`mp_mappings`)**: ID listing dari CSV → produk master **per toko**. Biaya iklan produk biasa dan otomatis kemudian dapat direkap menurut keluarga produk.
- Kode yang ambigu (ID numerik, volume 30 ML, bundle campuran, atau alias produk tidak dikenal) **tidak ditebak**. Isi paket perlu diperiksa manual pada format tersebut. Untuk pengecualian, buat SKU lengkap khusus; jumlahnya dapat diganti lewat pilihan Isi paket berbeda? Atur manual. Mapping lama dengan isi paket khusus yang berbeda dari pembacaan SKU tetap dibuka dalam mode manual; tidak diganti diam-diam.
- Penulisan kode diseragamkan ke huruf besar dan spasi tunggal. `PRIMA4` dan `PRIMA 4` tetap kode berbeda, dan dapat sama-sama dipetakan ke Primagold.
- Impor boleh disimpan sebelum mapping lengkap. Omzet/pesanan tetap dihitung; unit fisik yang belum terpetakan tidak ditebak. Daftar Belum Dipetakan memudahkan admin melengkapi kode setelah impor, tanpa upload ulang.
- Master SKU berlaku pada riwayat seluruh toko juga; perubahan produk/isi paket mengubah rekap kode tersebut di semua toko. Ini sengaja digunakan untuk memperbaiki mapping yang salah, bukan snapshot master per tanggal.
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
- Setiap komponen Shopee diperbarui sebagai snapshot sumbernya sendiri. Rekap iklan tanggal itu disusun ulang dari sumber yang tersedia, tanpa menghitung ringkasan dan detail otomatis dua kali.
- Impor gagal membatalkan seluruh perubahan transaksi. Dua impor toko yang sama diserialkan di database.
- Maksimum 25 MB/file, 20.000 baris pesanan/batch, dan 10.000 baris iklan/batch. CSV Shopee UTF-8 berkoma sesuai contoh. Untuk file pesanan kosong tanpa baris data, tanggal cakupan tidak dapat ditentukan dan file ditolak; sumber pesanan tanggal tersebut tidak otomatis ditandai lengkap. Workbook/format lain yang headernya berbeda ditolak agar angka tidak ditebak.

## Data dan verifikasi

Parser hanya menyimpan kolom laporan yang diperlukan. Nama/alamat/telepon pembeli dan penerima **tidak disalin ke tabel pesanan**. File sumber asli tidak diunggah ke Supabase Storage; yang disimpan adalah data normalisasi, nama file, sidik file, aktor, dan waktu impor. Jangan menaruh spreadsheet asli di folder `public` atau repository.

Demo yang diterbitkan memakai data simulasi. File asli pengguna digunakan untuk uji parser lokal, tidak dimasukkan ke ZIP/source/deployment. Parser berhasil membaca contoh nyata: Shopee 68 baris/60 aktif, TikTok 16 aktif, Lazada 3 aktif; angka sesuai analisis yang disepakati.

Perintah verifikasi:

```text
npm test
npm run test:db
npm run build
```

Tes meliputi CSV/RFC quoting, format angka Indonesia, ID panjang, perbaikan row XML TikTok, mapping paket, deduplikasi pesanan campuran, rekonsiliasi biaya otomatis tanpa hitung ganda, snapshot lama, perubahan status, akses toko/RLS, beberapa admin, pending signup, biaya manual, actor/tax snapshot, rollback impor, migrasi master SKU bersama, deduplikasi consensus dan pelestarian konflik mapping lama. Coexistence penuh schema Akuisisi + CRM + Marketplace juga diuji PostgreSQL lokal.

Build produksi dan render komponen server telah diperiksa. **Browser interaktif belum diuji** karena alat browser tidak tersedia pada lingkungan ini. Koneksi Supabase/Vercel pengguna belum dijalankan; perlu memasang SQL dan env sendiri. Grafik harian menampilkan maksimal 366 hari; kartu/rekap/ekspor tetap mengikuti seluruh rentang. Pembacaan tabel Supabase dipaginasi agar tidak terpotong batas 1.000 baris API; volume data sangat besar tetap memerlukan optimasi query server lanjutan.

## Pembaruan: manajemen toko, upload, target, judul iklan

**Database yang sudah terpasang sampai 005:** jalankan hanya `supabase/migrations/006_management_targets_titles.sql` sekali di SQL Editor. Instalasi baru: jalankan `supabase/schema.sql` saja. Jangan menjalankan schema penuh lagi pada database yang sudah berisi tabel. Env Vercel tetap sama.

- Admin dapat menghapus toko kosong. Toko berisi laporan/riwayat biaya harus digabung atau dinonaktifkan. Nama toko baru dicegah duplikat pada platform yang sama (huruf besar/kecil dan spasi diseragamkan).
- Gabungkan toko memindahkan laporan, sumber iklan, target, biaya dan mapping ke toko tujuan aktif dengan platform sama. Pesanan/file/sumber harian/biaya/target yang bertabrakan memblokir transaksi. Hapus upload duplikat atau selesaikan data terlebih dahulu. Anggota asal hanya disalin jika opsi tersebut dicentang; mereka kemudian memperoleh seluruh akses toko tujuan.
- Hapus upload hanya menghapus hasil yang **masih dimiliki batch itu**. Versi lama tidak dipulihkan. Hasil lebih baru tetap ada; rekap Shopee disusun ulang dari sumber tersisa. Batch yang dihapus dapat diunggah ulang. Ini bukan arsip snapshot atau fitur undo.
- Edit penugasan hanya memilih anggota aktif; penugasan akun nonaktif yang tidak lagi terlihat di pilihan dibersihkan saat simpan. Hapus penugasan mencabut akses, tanpa menghapus laporan.
- Target bulanan berisi omzet dan unit fisik untuk kombinasi toko/produk. Admin mengatur; anggota melihat toko yang ditugaskan. Realisasi hanya dari pesanan aktif pada bulan tersebut dengan mapping SKU produk.
- Nama produk aktif otomatis dicocokkan sebagai frasa pada judul iklan; alias bersama diatur lewat Produk & Mapping → Judul iklan. Mapping kode manual diprioritaskan. Kecocokan beberapa produk tidak ditebak. Iklan toko, ringkasan otomatis dan rekonsiliasi tetap menjadi biaya bersama. Perubahan mapping juga mengubah pengelompokan laporan historis.
- Aksi penghapusan/penggabungan/penugasan server dicatat di `mp_admin_events`, tersedia bagi admin lewat database.

Verifikasi tambahan mencakup penghapusan batch lama tanpa menghapus versi baru, penyusunan ulang iklan setelah hapus sumber, penggabungan dengan pelestarian biaya/target, larangan nama toko ganda, dan RLS target/aturan judul. Browser interaktif belum tersedia untuk uji klik dan tampilan ponsel.

## Perbaikan status pesanan diterima (007)

Parser sebelumnya salah membaca kalimat Shopee **“Pesanan diterima, namun Pembeli masih dapat mengajukan pengembalian hingga …”** sebagai retur. Kalimat itu menyatakan masa pengajuan retur masih berlaku; pesanan tersebut termasuk penjualan aktif.

Untuk aplikasi terpasang, upload kode perbaikan ke GitHub/Vercel dan jalankan **`supabase/migrations/007_received_orders_status.sql`** di SQL Editor Supabase, lalu muat ulang web. SQL memperbaiki status yang salah pada semua toko/tanggal untuk kalimat Shopee tersebut, tanpa upload ulang file. Nominal, ID pesanan, waktu ekspor dan riwayat impor dipertahankan. Retur aktual, pembatalan dan platform lain tidak diubah. Hasil SQL menampilkan jumlah baris dan omzet yang dipulihkan per toko/tanggal. Aman dijalankan ulang. Script ini hanya membutuhkan tabel Marketplace yang sudah ada, tidak membutuhkan tabel tambahan dari 006. Instalasi baru cukup `schema.sql` terbaru; jangan ulang schema pada database terpasang.

Berdasarkan file 1 November yang diperiksa lokal: 74 pesanan unik, terdiri dari 62 diterima dengan masa pengajuan retur, 1 sedang dikirim, 11 batal. Hasil setelah perbaikan: **63 aktif, Rp10.105.000 omzet aktif, 0 retur pada file ini**. Dashboard mengikuti snapshot terbaru yang tersimpan dan bisa berbeda bila status pesanan sudah diperbarui oleh ekspor berikutnya. File sumber asli dan data pembeli tidak dimasukkan ke repository atau ZIP.

## Perbaikan impor grup iklan tanpa kode produk

File Iklan keseluruhan Shopee dapat berisi beberapa baris dengan Kode Produk `-`: ringkasan Iklan Produk Otomatis serta kampanye Grup Iklan. Parser sekarang mengenali ringkasan dari nama/mode iklannya, bukan hanya kode `-`. Grup nonotomatis tetap disimpan dengan identitas terpisah dan kode produk kosong; biaya/konversinya tetap dihitung. Grup tidak otomatis dipetakan hanya berdasarkan kode `-`. Pesan validasi kini menyebut file dan jumlah ringkasan yang ditemukan.

Pembaruan ini cukup mengganti kode dan redeploy Vercel, **tanpa SQL baru atau perubahan env**. Upload yang sebelumnya gagal pada Periksa file belum tersimpan; pilih kembali file dari toko/tanggal yang sama setelah pembaruan. File otomatis toko lain tidak boleh tertukar: contoh otomatis Rp408.566 berasal dari file berbeda, sedangkan pasangan Nesia tanggal 9 November menggunakan otomatis Rp98.290.

Keempat file Nesia tanggal 9 November telah diuji bersama: 13 pesanan (12 aktif, 1 batal), omzet aktif Rp1.979.570; biaya iklan dasar Rp161.637, pajak 11% Rp17.780,07, total Rp179.417,07. Grup Iklan Rp0 tetap disimpan; selisih rincian otomatis Rp1 direkonsiliasi. Workbook dan CSV asli hanya diperiksa lokal, tidak dimasukkan dalam ZIP atau repository.

## Kalender upload per toko dan unit bonus

Bagian bawah halaman Upload mengikuti toko yang dipilih. Pilih bulan untuk melihat seluruh tanggal, termasuk tanggal yang belum memiliki upload sama sekali. Perhitungan terlambat/kurang lengkap sampai **kemarin WIB**; hari ini dan tanggal mendatang tidak ditandai terlambat. Tanggal dapat dipilih untuk memeriksa sumbernya. Status lengkap/sebagian/belum diunggah tersedia sebagai filter. Shopee memerlukan 4 sumber; TikTok/Lazada cukup file pesanan (biaya iklan tetap manual). Tidak ada bukti upload tidak berarti tidak ada transaksi; pilih bulan sesuai masa operasional toko. Fitur ini tidak menandai tanggal kosong sebagai lengkap secara otomatis.

Sesuai aturan bisnis, SKU bertanda `+` berarti **produk utama + bonus**: `HRB 3 + PRIMA 1` = 3 Herbapil terjual dan 1 Primagold bonus per paket. Seluruh omzet masuk produk sebelum `+`; produk setelahnya mempunyai omzet Rp0. Quantity pesanan mengalikan unit utama dan bonus. Laporan Produk memisahkan **Unit terjual** dan **Unit bonus**; kartu unit terjual serta target penjualan tidak memasukkan bonus. Filter produk bonus dapat menampilkan pesanan yang berisi bonus tersebut, dengan omzet produk bonus Rp0. Rincian pesanan dan ekspor CSV menampilkan bonus.

Petakan setiap awalan di Master SKU bersama: `HRB → Herbapil`, `PRIMA → Primagold`, `TM → Teh Bajakah Mini` sesuai produk yang benar. Produk/kode bonus baru tetap harus dibuat/dipetakan admin. Bonus tanpa angka seperti `SISIR` harus memakai aturan SKU lengkap dengan isi paket yang ditentukan admin, misalnya 1 pcs bila memang satu sisir. Sistem tidak mengarang produk atau jumlah bonus. Bonus yang belum dikenali muncul di Belum dipetakan dan indikator dashboard; omzet produk utama tetap dihitung. Jika SKU lengkap bertanda `+` sudah mempunyai mapping lama, aturan komponen utama yang terpetakan diprioritaskan; mapping lengkap lama menjadi fallback jika komponen utama belum terpetakan. Perubahan mapping berlaku untuk laporan historis.

Pembaruan ini cukup kode web, **tanpa SQL atau env baru**, dan tidak memerlukan upload ulang. Browser interaktif belum diuji; model kalender/bonus, filter, render komponen dan build produksi diperiksa lokal.

## Nilai rupiah pada kartu Batal & Belum Bayar

Kartu Dibatalkan, Gagal Bayar, Belum Bayar, Retur/Refund dan Perlu Dicek menampilkan jumlah pesanan unik serta nilai item terkait sesuai filter. Nilai ini terpisah dari omzet aktif. Satu pesanan dengan beberapa item dihitung sekali, sementara nominal dijumlahkan per item yang masuk kategori. Gagal Bayar merupakan bagian Dibatalkan; kategori tidak boleh dijumlahkan sebagai total. Nilai terkait retur menunjukkan nilai item yang ditandai, bukan nominal refund aktual atau nilai retur parsial. Filter produk bonus mengikuti aturan omzet bonus Rp0. Cukup upload kode dan redeploy; tidak ada SQL atau env baru.

## Kampanye berbeda memakai kode produk sama

Beberapa kampanye Shopee dapat memakai Kode Produk yang sama. Parser sekarang mempertahankan seluruh baris dan memberi identitas baris unik pada kampanye berikutnya, sementara `product_code` tetap sama untuk mapping/laporan produk. Tidak ada kampanye yang dibuang, termasuk baris Rp0; biaya dan atribusi setiap baris tetap dipertahankan. Pembaruan snapshot sumber tetap mengganti snapshot sebelumnya dan upload identik tetap dilewati.

Penyebab direproduksi pada CSV keseluruhan tanggal 10 November: kode 8832208282 muncul di dua kampanye, masing-masing Rp162.319 dan Rp0. Sesudah perbaikan, 6 baris kampanye mempunyai 6 identitas unik; total biaya nonotomatis tetap Rp533.242 dan ringkasan otomatis Rp432.989, belum termasuk iklan toko/pajak. CSV asli tidak masuk repository/ZIP.

Cukup upload kode perbaikan dan redeploy Vercel; **tidak perlu SQL baru atau menghapus data lama**. Muat ulang tab, pilih file yang sebelumnya gagal, periksa lalu simpan kembali. Impor yang gagal karena constraint dibatalkan secara atomik. Tes database mencakup kampanye dengan kode berulang, baris Rp0, total biaya, dan retry tanpa penggandaan.
