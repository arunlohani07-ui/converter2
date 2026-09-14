const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const UPLOADS = path.join(ROOT, "uploads");
const OUTPUT = path.join(ROOT, "output");
const TEMP = path.join(ROOT, "temp");

for (const dir of [UPLOADS, OUTPUT, TEMP]) fs.mkdirSync(dir, { recursive: true });

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, "public")));

const docLimit = Number(process.env.MAX_DOCUMENT_MB || 50) * 1024 * 1024;
const videoLimit = Number(process.env.MAX_VIDEO_MB || 1024) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: videoLimit, files: 10 }
});

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options });
    let stdout = "", stderr = "";
    child.stdout?.on("data", d => stdout += d.toString());
    child.stderr?.on("data", d => stderr += d.toString());
    child.on("error", err => reject(Object.assign(err, { stdout, stderr })));
    child.on("close", code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-2000)}`));
    });
  });
}

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}
function extOf(file) { return path.extname(file).toLowerCase(); }
function mimeFor(ext) {
  return {
    ".pdf":"application/pdf", ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".webp":"image/webp",
    ".mp3":"audio/mpeg", ".mp4":"video/mp4", ".zip":"application/zip"
  }[ext] || "application/octet-stream";
}
async function exists(p) { try { await fsp.access(p); return true; } catch { return false; } }

app.get("/api/health", (_, res) => res.json({ ok: true, name: "Convert by Ayush" }));

app.post("/api/convert/image-to-pdf", upload.array("files", 20), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: "Choose at least one image." });
    const out = path.join(OUTPUT, `${crypto.randomUUID()}.pdf`);
    // sharp supports a PDF output only when libvips is built with PDF support; use ImageMagick as fallback.
    const first = req.files[0].path;
    try {
      const imgs = await Promise.all(req.files.map(f => sharp(f.path).jpeg().toBuffer()));
      // Build a multi-page PDF using ImageMagick's convert/magick if available.
      const tempImgs = [];
      for (let i=0;i<imgs.length;i++) {
        const p = path.join(TEMP, `${crypto.randomUUID()}-${i}.jpg`);
        await fsp.writeFile(p, imgs[i]); tempImgs.push(p);
      }
      try {
        await run("magick", [...tempImgs, out]);
      } catch {
        await run("convert", [...tempImgs, out]);
      }
      await Promise.all(tempImgs.map(p => fsp.rm(p,{force:true})));
    } catch (e) { throw new Error("Image → PDF needs ImageMagick (magick/convert) installed."); }
    return res.download(out, "convert-by-ayush.pdf", { headers: { "Content-Type": "application/pdf" } }, cleanupLater);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/convert/mp4-to-mp3", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a video." });
  const out = path.join(OUTPUT, `${crypto.randomUUID()}.mp3`);
  try {
    await run("ffmpeg", ["-y","-i",req.file.path,"-vn","-codec:a","libmp3lame","-q:a","2",out]);
    res.download(out, "convert-by-ayush.mp3", { headers: {"Content-Type":"audio/mpeg"} }, cleanupLater);
  } catch (e) { res.status(500).json({ error: "FFmpeg is required for MP4 → MP3." }); }
});

app.post("/api/convert/docx-to-pdf", upload.single("file"), async (req,res)=>{
  if (!req.file || extOf(req.file.originalname)!==".docx") return res.status(400).json({error:"Choose a DOCX file."});
  try {
    await run("libreoffice", ["--headless","--convert-to","pdf","--outdir",OUTPUT,req.file.path]);
    const generated = path.join(OUTPUT, path.basename(req.file.path, ".docx") + ".pdf");
    if (!await exists(generated)) throw new Error("Conversion output was not created.");
    res.download(generated, safeName(path.basename(req.file.originalname, ".docx"))+".pdf", {}, cleanupLater);
  } catch { res.status(500).json({error:"LibreOffice is required for DOCX → PDF."}); }
});

app.post("/api/convert/pdf-to-images", upload.single("file"), async (req,res)=>{
  if (!req.file || extOf(req.file.originalname)!==".pdf") return res.status(400).json({error:"Choose a PDF file."});
  const prefix = path.join(TEMP, crypto.randomUUID());
  try {
    await run("pdftoppm", ["-jpeg","-r","150",req.file.path,prefix]);
    const files = (await fsp.readdir(TEMP)).filter(x=>x.startsWith(path.basename(prefix)+"-") && x.endsWith(".jpg"));
    if (!files.length) throw new Error("No pages generated.");
    if (files.length === 1) {
      const p = path.join(TEMP, files[0]);
      return res.download(p, "page-1.jpg", {}, cleanupLater);
    }
    const zip = path.join(OUTPUT, `${crypto.randomUUID()}.zip`);
    try { await run("zip", ["-j",zip,...files.map(x=>path.join(TEMP,x))]); }
    catch { throw new Error("zip command is required for multi-page PDF → images."); }
    res.download(zip, "pdf-pages.zip", {}, cleanupLater);
  } catch { res.status(500).json({error:"PDF → Image needs Poppler (pdftoppm) and zip installed."}); }
});

app.post("/api/convert/pdf-to-docx", upload.single("file"), async (req,res)=>{
  if (!req.file || extOf(req.file.originalname)!==".pdf") return res.status(400).json({error:"Choose a PDF file."});
  res.status(501).json({error:"PDF → DOCX is intentionally not enabled in this first build because reliable layout-preserving conversion needs a dedicated PDF-to-DOCX engine. The UI is ready for a later engine."});
});

app.post("/api/convert/image-to-docx", upload.single("file"), async (req,res)=>{
  if (!req.file || ![".jpg",".jpeg",".png",".webp"].includes(extOf(req.file.originalname)))
    return res.status(400).json({error:"Choose an image file."});
  res.status(501).json({error:"Image → DOCX is reserved for the OCR engine phase. The UI is ready for it."});
});

app.post("/api/convert/docx-to-image", upload.single("file"), async (req,res)=>{
  if (!req.file || extOf(req.file.originalname)!==".docx") return res.status(400).json({error:"Choose a DOCX file."});
  const pdf = path.join(OUTPUT, `${crypto.randomUUID()}.pdf`);
  const prefix = path.join(TEMP, `${crypto.randomUUID()}`);
  try {
    await run("libreoffice", ["--headless","--convert-to","pdf","--outdir",OUTPUT,req.file.path]);
    const loPdf = path.join(OUTPUT, path.basename(req.file.path, ".docx") + ".pdf");
    if (!await exists(loPdf)) throw new Error("DOCX PDF output missing");
    await run("pdftoppm", ["-jpeg","-r","150",loPdf,prefix]);
    const files = (await fsp.readdir(TEMP)).filter(x=>x.startsWith(path.basename(prefix)+"-") && x.endsWith(".jpg"));
    if (files.length === 1) return res.download(path.join(TEMP,files[0]),"document.jpg",{},cleanupLater);
    const zip = path.join(OUTPUT, `${crypto.randomUUID()}.zip`);
    await run("zip",["-j",zip,...files.map(x=>path.join(TEMP,x))]);
    res.download(zip,"docx-pages.zip",{},cleanupLater);
  } catch { res.status(500).json({error:"DOCX → Image needs LibreOffice, Poppler and zip installed."}); }
});

app.post("/api/downloader/check", async (req,res)=>{
  const url = String(req.body?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({error:"Enter a valid public http(s) URL."});
  res.json({ok:true, message:"URL accepted. Public, non-DRM media can be processed when yt-dlp is installed. Private/login-required/DRM content is not supported."});
});

function cleanupLater(err) {
  // Express res.download callback fires after the transfer.
  // Actual cleanup is handled by the periodic cleanup below.
}

async function cleanup() {
  const cutoff = Date.now() - Number(process.env.CLEANUP_MINUTES || 30) * 60 * 1000;
  for (const dir of [UPLOADS, OUTPUT, TEMP]) {
    for (const name of await fsp.readdir(dir).catch(()=>[])) {
      if (name === ".gitkeep") continue;
      const p = path.join(dir,name);
      try {
        const st = await fsp.stat(p);
        if (st.mtimeMs < cutoff) await fsp.rm(p,{recursive:true,force:true});
      } catch {}
    }
  }
}
setInterval(cleanup, 5 * 60 * 1000);
cleanup();

app.get("*", (req,res)=>{
  res.sendFile(path.join(ROOT,"public","index.html"));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({error:"File is too large. Documents/images: 50 MB; videos: 1 GB."});
  console.error(err);
  res.status(500).json({error:"Something went wrong."});
});

app.listen(PORT, ()=>console.log(`Convert by Ayush running at http://localhost:${PORT}`));
