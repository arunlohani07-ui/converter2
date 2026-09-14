const modal=document.getElementById("modal"), modalContent=document.getElementById("modalContent");
document.getElementById("closeModal").onclick=()=>modal.classList.remove("open");
modal.addEventListener("click",e=>{if(e.target===modal)modal.classList.remove("open")});

const toolMap={
 "pdf-to-images":{title:"PDF → Image",accept:".pdf",multiple:false,endpoint:"/api/convert/pdf-to-images",field:"file"},
 "docx-to-image":{title:"DOCX → Image",accept:".docx",multiple:false,endpoint:"/api/convert/docx-to-image",field:"file"},
 "image-to-pdf":{title:"Image → PDF",accept:"image/*",multiple:true,endpoint:"/api/convert/image-to-pdf",field:"files"},
 "docx-to-pdf":{title:"DOCX → PDF",accept:".docx",multiple:false,endpoint:"/api/convert/docx-to-pdf",field:"file"},
 "pdf-to-docx":{title:"PDF → DOCX",accept:".pdf",multiple:false,endpoint:"/api/convert/pdf-to-docx",field:"file"},
 "image-to-docx":{title:"Image → DOCX",accept:"image/*",multiple:false,endpoint:"/api/convert/image-to-docx",field:"file"},
 "mp4-to-mp3":{title:"MP4 → MP3",accept:"video/mp4,video/*",multiple:false,endpoint:"/api/convert/mp4-to-mp3",field:"file"}
};
function openTool(key){
 const t=toolMap[key]; if(!t)return;
 modalContent.innerHTML=`<h2>${t.title}</h2>
 <div id="drop" class="upload-area"><div style="font-size:38px">📂</div><p>Drag & drop your file here</p><label class="btn ghost" for="file">Choose File</label><input id="file" type="file" accept="${t.accept}" ${t.multiple?"multiple":""}><div id="files" class="file-list"></div></div>
 <button id="convertBtn" class="btn primary" style="margin-top:15px;width:100%">Convert</button><div id="status" class="notice" style="display:none"></div>`;
 modal.classList.add("open");
 const input=document.getElementById("file"), drop=document.getElementById("drop"), list=document.getElementById("files");
 const show=files=>list.innerHTML=[...files].map(f=>`<div>📄 ${f.name} — ${(f.size/1024/1024).toFixed(2)} MB</div>`).join("");
 input.onchange=()=>show(input.files);
 ["dragenter","dragover"].forEach(x=>drop.addEventListener(x,e=>{e.preventDefault();drop.classList.add("drag")}));
 ["dragleave","drop"].forEach(x=>drop.addEventListener(x,e=>{e.preventDefault();drop.classList.remove("drag")}));
 drop.addEventListener("drop",e=>{input.files=e.dataTransfer.files;show(input.files)});
 document.getElementById("convertBtn").onclick=async()=>{
   const files=input.files; if(!files.length)return alert("Choose a file first.");
   const fd=new FormData(); [...files].forEach(f=>fd.append(t.field,f));
   const st=document.getElementById("status"); st.style.display="block"; st.textContent="Processing…";
   try{
    const r=await fetch(t.endpoint,{method:"POST",body:fd});
    if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||"Conversion failed.");}
    const blob=await r.blob(); const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download=`convert-by-ayush.${blob.type.includes("zip")?"zip":blob.type.includes("pdf")?"pdf":blob.type.includes("mpeg")?"mp3":"jpg"}`;a.click();URL.revokeObjectURL(url);
    st.textContent="✅ Done — your download should start automatically.";
   }catch(e){st.textContent="❌ "+e.message}
 };
}
document.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>openTool(b.dataset.tool));

document.getElementById("themeBtn").onclick=()=>{document.documentElement.classList.toggle("light");localStorage.setItem("cba-theme",document.documentElement.classList.contains("light")?"light":"dark")};
if(localStorage.getItem("cba-theme")==="light")document.documentElement.classList.add("light");

document.getElementById("urlForm").onsubmit=async e=>{
 e.preventDefault();const url=document.getElementById("urlInput").value.trim(), box=document.getElementById("urlResult");box.textContent="Checking…";
 try{const r=await fetch("/api/downloader/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});const j=await r.json();box.innerHTML=r.ok?`<div class="notice">✅ ${j.message}</div>`:`<div class="notice">❌ ${j.error}</div>`}catch{box.innerHTML='<div class="notice">❌ Server unavailable.</div>'}
};

document.getElementById("contactForm").onsubmit=e=>{
 e.preventDefault(); const f=new FormData(e.target); const subject=encodeURIComponent("Convert by Ayush — Contact"); const body=encodeURIComponent(`Name: ${f.get("name")}\nEmail: ${f.get("email")}\n\n${f.get("message")}`);
 location.href=`mailto:arunlohani07@gmail.com?subject=${subject}&body=${body}`;
 document.getElementById("contactStatus").textContent="Opening your email app…";
};
