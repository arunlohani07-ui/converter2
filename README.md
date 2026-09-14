# Convert by Ayush

A mobile-friendly, dark/light futuristic converter UI with a Node.js backend.

## Run in Termux

```bash
pkg update
pkg install nodejs ffmpeg libreoffice poppler imagemagick zip -y
cd ~/converter
npm install
cp .env.example .env
npm start
```

Open: http://localhost:3000

Replace `public/my.jpg` with your real profile photo.

### Current working conversions
- PDF → JPG pages (requires Poppler + zip)
- DOCX → JPG pages (requires LibreOffice + Poppler + zip)
- Image(s) → PDF (requires ImageMagick)
- DOCX → PDF (requires LibreOffice)
- MP4 → MP3 (requires FFmpeg)

### Prepared UI / future engine
- PDF → DOCX
- Image → DOCX
- Public URL downloader

The downloader check endpoint intentionally does not bypass private content, login walls, DRM, or other access controls. A production downloader should use a compliant provider/API for each supported platform.

## Limits
- Documents/images: 50 MB
- Videos: 1 GB
- Temporary files are periodically cleaned from the server.

## Contact
Email: arunlohani07@gmail.com
