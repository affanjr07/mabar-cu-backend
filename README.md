# MABAR.CU

## Deskripsi Project

MABAR.CU adalah platform sosial gaming berbasis web yang dirancang untuk membantu para gamer menemukan teman bermain sesuai game, rank, role, dan preferensi bermain mereka. Platform ini hadir sebagai solusi bagi pemain yang kesulitan mencari rekan satu tim yang cocok, terutama pada game kompetitif dan multiplayer online.

Melalui MABAR.CU, pengguna dapat membuat profil gamer, mencari teman bermain, membentuk party room, bergabung ke komunitas game, berkomunikasi melalui chat, mengikuti turnamen, hingga melakukan booking Pro Player. Seluruh fitur tersebut terintegrasi dalam satu platform untuk menciptakan pengalaman bermain yang lebih terorganisir dan menyenangkan.

## Tujuan Project

Project ini dibuat untuk:

* Membantu gamer menemukan teman bermain yang sesuai.
* Mempermudah pembentukan tim berdasarkan rank dan role.
* Menyediakan wadah komunitas gaming dalam satu platform.
* Meningkatkan komunikasi antar pemain.
* Menyediakan sistem turnamen dan aktivitas komunitas yang lebih terstruktur.

## Fitur Utama

### Authentication

* Register
* Login
* JWT Authentication
* Protected Route

### Profile System

* Profil Gamer
* Avatar dan Banner Profil
* Avatar Border
* Badge System
* Statistik Pemain
* Followers dan Following

### Matchmaking System

* Cari Teman Mabar
* Filter Berdasarkan Game
* Filter Berdasarkan Rank
* Filter Berdasarkan Role
* Party Room Public dan Private
* Join Room dengan Kode

### Chat System

* Community Chat
* Private Chat
* Room Chat
* Timestamp Pesan
* Avatar Border pada Chat

### Community System

* Channel Berdasarkan Game
* Interaksi Antar Anggota Komunitas

### Tournament System

* Pembuatan Turnamen
* Manajemen Peserta
* Informasi Turnamen

### Pro Player Booking

* Booking Pro Player
* Manajemen Permintaan Booking

### Admin Panel

* Manajemen User
* Ban dan Unban User
* Mute User
* Reports Management
* Moderation Logs
* Announcement Management

## Teknologi Yang Digunakan

### Frontend

* Next.js 16
* React.js
* TypeScript
* Tailwind CSS
* Framer Motion
* Zustand

### Backend

* Node.js
* Express.js
* TypeScript
* REST API
* JWT Authentication

### Database & Storage

* Supabase PostgreSQL
* Supabase Storage

### Moderation & Security

* OpenAI Moderation API
* Sightengine Image Moderation
* Middleware Authentication
* Middleware Authorization

### Deployment

* Vercel
* Supabase Cloud

## Arsitektur Sistem

Frontend (Next.js)

↓

REST API (Express.js)

↓

Database (Supabase PostgreSQL)

↓

Storage (Supabase Storage)

## Implementasi Object Oriented Programming (OOP)

Project MABAR.CU menerapkan empat pilar utama Object Oriented Programming (OOP):

### Encapsulation

Logika bisnis dibungkus dalam controller seperti Chat Controller, Matchmaking Controller, Community Controller, dan Admin Controller sehingga data dan proses lebih terorganisir.

### Abstraction

Frontend hanya berinteraksi melalui service dan API tanpa perlu mengetahui proses internal backend maupun query database.

### Inheritance

Middleware seperti Authentication Middleware dan Role Middleware digunakan kembali pada berbagai route untuk mewariskan fitur autentikasi dan otorisasi.

### Polymorphism

Fungsi yang sama dapat menangani berbagai jenis data, seperti sistem chat yang dapat mengelola pesan teks, gambar, maupun stiker melalui satu mekanisme yang sama.

## Keunggulan Project

* Interface modern dengan tema gaming.
* Sistem matchmaking berdasarkan rank dan role.
* Community dan private chat.
* Party room management.
* Tournament management.
* Pro Player booking.
* Moderation system.
* Arsitektur fullstack modern.
* Mudah dikembangkan untuk fitur tambahan di masa depan.

## Anggota Kelompok

1. M. Affan Afyga
2. Rendy Januarta Manurung
3. Michael Garcia Arteta Ginting
4. Juan Carlos Simanungkalit
