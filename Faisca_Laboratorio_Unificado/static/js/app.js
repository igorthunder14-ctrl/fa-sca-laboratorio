const canvas = document.getElementById("artCanvas");
const ctx = canvas.getContext("2d");
const wrap = document.getElementById("canvasWrap");
const welcomeHint = document.getElementById("welcomeHint");
const toast = document.getElementById("toast");
const tabs = [...document.querySelectorAll(".tab")];
const toolViews = {
  draw: document.getElementById("drawTools"),
  photo: document.getElementById("photoTools"),
  camera: document.getElementById("cameraTools"),
  play: document.getElementById("playTools"),
  hands: document.getElementById("handsTools"),
  face: document.getElementById("faceTools")
};
let currentView = "draw";
let drawing = false;
let lastPoint = null;
let strokes = [];
let currentStroke = null;
let photo = null;
let photoObjectUrl = null;
let cameraStream = null;
let particles = [];
let animationFrame = null;
let lastPointer = null;
let dpr = Math.max(1, window.devicePixelRatio || 1);

const filterCss = {
  none: "none",
  mono: "grayscale(1)",
  warm: "sepia(.45) saturate(1.25)",
  cool: "hue-rotate(14deg) saturate(.9) brightness(1.04)",
  vivid: "saturate(1.7) contrast(1.08)",
  dream: "saturate(.78) brightness(1.1) contrast(.88)"
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function resizeCanvas() {
  const old = document.createElement("canvas");
  old.width = canvas.width;
  old.height = canvas.height;
  if (old.width && old.height) old.getContext("2d").drawImage(canvas, 0, 0);
  const rect = wrap.getBoundingClientRect();
  dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (old.width && old.height) {
    ctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, rect.width, rect.height);
  }
  if (photo) drawPhoto();
  updateStatus();
}
function canvasSize() {
  const r = canvas.getBoundingClientRect();
  return { width: r.width, height: r.height };
}
function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function getBrush() {
  return {
    color: document.getElementById("brushColor").value,
    size: Number(document.getElementById("brushSize").value),
    style: document.getElementById("brushStyle").value
  };
}
function paintSegment(a, b, brush, index = 0) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = brush.size;
  if (brush.style === "glow") {
    ctx.strokeStyle = brush.color;
    ctx.shadowColor = brush.color;
    ctx.shadowBlur = brush.size * 2.8;
    ctx.globalAlpha = .9;
  } else if (brush.style === "dots") {
    const distance = Math.hypot(b.x-a.x, b.y-a.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(4, brush.size * 1.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ctx.beginPath();
      ctx.fillStyle = brush.color;
      ctx.arc(a.x + (b.x-a.x)*t, a.y + (b.y-a.y)*t, brush.size/2, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
    return;
  } else if (brush.style === "rainbow") {
    ctx.strokeStyle = `hsl(${(index * 12) % 360} 95% 68%)`;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 5;
  } else {
    ctx.strokeStyle = brush.color;
  }
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}
function redrawStrokes() {
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  if (photo) drawPhoto();
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      paintSegment(p, {x:p.x+.1,y:p.y+.1}, stroke.brush, 0);
    } else {
      for (let i=1; i<stroke.points.length; i++) paintSegment(stroke.points[i-1], stroke.points[i], stroke.brush, i);
    }
  }
  updateStatus();
}
function drawPhoto() {
  if (!photo) return;
  const {width, height} = canvasSize();
  ctx.save();
  ctx.clearRect(0,0,width,height);
  const scale = Math.min(width/photo.width, height/photo.height);
  const w = photo.width*scale, h = photo.height*scale;
  ctx.filter = `${filterCss[document.getElementById("photoFilter").value]} brightness(${document.getElementById("photoBrightness").value}%) contrast(${document.getElementById("photoContrast").value}%) saturate(${document.getElementById("photoSaturation").value}%)`;
  ctx.drawImage(photo, (width-w)/2, (height-h)/2, w, h);
  ctx.restore();
}
function updateStatus() {
  const count = strokes.length;
  document.getElementById("canvasStatus").textContent = `${count} ${count === 1 ? "traço" : "traços"} · sem pressa`;
  welcomeHint.classList.toggle("hidden", count > 0 || !!photo || currentView === "play" || currentView === "camera");
}
function setView(view) {
  if (currentView !== view && magicStream) stopMagic(false);
  currentView = view;
  tabs.forEach(t => t.classList.toggle("active", t.dataset.view === view));
  Object.entries(toolViews).forEach(([key, el]) => el.classList.toggle("hidden", key !== view));
  const labels = {
    draw: ["DESENHO LIVRE", "Clique e arraste para desenhar", "Desenho livre"],
    photo: ["ESTÚDIO DE FOTOS", "Escolha uma imagem e experimente", "Brincar com foto"],
    camera: ["CÂMERA AO VIVO", "Ative a câmera para começar", "Câmera"],
    play: ["MESA DE EXPERIMENTOS", "Mova o mouse ou toque na área", "Experimento"],
    hands: ["MÃOS MÁGICAS", "Mexa as mãos para desenhar rastros de luz", "Mãos mágicas"],
    face: ["ESTÚDIO DE EFEITOS", "Escolha um filtro e veja a câmera", "Efeitos no rosto"]
  };
  document.getElementById("canvasModeLabel").textContent = labels[view][0];
  document.getElementById("canvasHint").textContent = labels[view][1];
  document.getElementById("toolTitle").textContent = labels[view][2];
  if (view === "play") startParticles();
  else stopParticles();
  if (view === "camera" && cameraStream) {
    document.getElementById("cameraPreviewWrap").classList.remove("hidden");
  } else {
    document.getElementById("cameraPreviewWrap").classList.add("hidden");
  }
  document.getElementById("magicPreviewWrap").classList.toggle("hidden", !["hands","face"].includes(view) || !magicStream);
  document.body.classList.toggle("magic-mode", ["hands","face"].includes(view));
  if (!["hands","face"].includes(view)) stopMagicTracking();
  updateStatus();
}
tabs.forEach(tab => tab.addEventListener("click", () => setView(tab.dataset.view)));

canvas.addEventListener("pointerdown", event => {
  if (currentView === "play") {
    addParticles(pointFromEvent(event), 16);
    return;
  }
  if (currentView === "camera") return;
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  const p = pointFromEvent(event);
  lastPoint = p;
  currentStroke = {brush:getBrush(), points:[p]};
  strokes.push(currentStroke);
  paintSegment(p, {x:p.x+.1,y:p.y+.1}, currentStroke.brush, 0);
  welcomeHint.classList.add("hidden");
  updateStatus();
});
canvas.addEventListener("pointermove", event => {
  const p = pointFromEvent(event);
  if (currentView === "play") {
    if (lastPointer && Math.hypot(p.x-lastPointer.x,p.y-lastPointer.y) > 10) addParticles(p, 3);
    lastPointer = p;
    return;
  }
  if (!drawing || !lastPoint || !currentStroke) return;
  paintSegment(lastPoint, p, currentStroke.brush, currentStroke.points.length);
  currentStroke.points.push(p);
  lastPoint = p;
});
function endDrawing() { drawing = false; lastPoint = null; currentStroke = null; }
canvas.addEventListener("pointerup", endDrawing);
canvas.addEventListener("pointercancel", endDrawing);
canvas.addEventListener("pointerleave", () => { if (drawing) endDrawing(); });

document.getElementById("brushColor").addEventListener("input", event => {
  document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("picked", s.dataset.color === event.target.value));
});
document.querySelectorAll(".swatch").forEach(button => button.addEventListener("click", () => {
  document.getElementById("brushColor").value = button.dataset.color;
}));
document.getElementById("brushSize").addEventListener("input", event => {
  document.getElementById("brushSizeOut").textContent = `${event.target.value} px`;
});
document.getElementById("undoBtn").addEventListener("click", () => {
  if (strokes.length) { strokes.pop(); redrawStrokes(); }
  else showToast("Ainda não há traços para desfazer.");
});
function resetArtwork() {
  strokes = [];
  photo = null;
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  photoObjectUrl = null;
  redrawStrokes();
  updateStatus();
}
document.getElementById("clearBtn").addEventListener("click", () => {
  strokes = [];
  redrawStrokes();
  showToast("Quadro limpo. Nova ideia, nova chance!");
});
document.getElementById("newCanvas").addEventListener("click", () => {
  resetArtwork();
  document.getElementById("photoFilter").value = "none";
  document.getElementById("photoBrightness").value = 100;
  document.getElementById("photoBrightnessOut").textContent = "100%";
  document.getElementById("photoContrast").value = 100;
  document.getElementById("photoContrastOut").textContent = "100%";
  document.getElementById("photoSaturation").value = 100;
  document.getElementById("photoSaturationOut").textContent = "100%";
  showToast("Novo quadro pronto!");
});
document.getElementById("photoInput").addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("Escolha um arquivo de imagem."); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = url;
    photo = img;
    strokes = [];
    setView("photo");
    redrawStrokes();
    showToast("Foto carregada. Experimente!");
  };
  img.onerror = () => { URL.revokeObjectURL(url); showToast("Não foi possível abrir essa imagem."); };
  img.src = url;
  event.target.value = "";
});
document.getElementById("photoFilter").addEventListener("change", redrawStrokes);
document.getElementById("photoBrightness").addEventListener("input", event => {
  document.getElementById("photoBrightnessOut").textContent = `${event.target.value}%`;
  redrawStrokes();
});

["photoContrast", "photoSaturation"].forEach(id => {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}Out`);
  input.addEventListener("input", event => {
    output.textContent = `${event.target.value}%`;
    redrawStrokes();
  });
});
document.getElementById("resetPhotoAdjustments").addEventListener("click", () => {
  ["photoBrightness", "photoContrast", "photoSaturation"].forEach(id => {
    document.getElementById(id).value = 100;
    document.getElementById(`${id}Out`).textContent = "100%";
  });
  document.getElementById("photoFilter").value = "none";
  redrawStrokes();
  showToast("Ajustes da foto restaurados.");
});
document.getElementById("removePhoto").addEventListener("click", () => {
  photo = null;
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  photoObjectUrl = null;
  redrawStrokes();
  showToast("Foto removida. O desenho continua no quadro.");
});

const video = document.getElementById("cameraVideo");
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("A câmera precisa de localhost ou de uma conexão HTTPS.");
    return;
  }
  try {
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"}, audio:false});
    video.srcObject = cameraStream;
    await video.play();
    document.getElementById("startCamera").disabled = true;
    document.getElementById("stopCamera").disabled = false;
    document.getElementById("captureCamera").disabled = false;
    document.getElementById("cameraPreviewWrap").classList.remove("hidden");
    showToast("Câmera ligada. Pronto para congelar um momento.");
  } catch (err) {
    console.error(err);
    showToast(err.name === "NotAllowedError" ? "Permita o acesso à câmera no navegador." : "Não foi possível ativar a câmera.");
  }
}
function stopCamera() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  video.srcObject = null;
  document.getElementById("startCamera").disabled = false;
  document.getElementById("stopCamera").disabled = true;
  document.getElementById("captureCamera").disabled = true;
  document.getElementById("cameraPreviewWrap").classList.add("hidden");
}
document.getElementById("startCamera").addEventListener("click", startCamera);
document.getElementById("stopCamera").addEventListener("click", () => { stopCamera(); showToast("Câmera desligada."); });
document.getElementById("captureCamera").addEventListener("click", () => {
  if (!video.videoWidth) return;
  const snap = document.createElement("canvas");
  snap.width = video.videoWidth; snap.height = video.videoHeight;
  const c = snap.getContext("2d");
  c.translate(snap.width,0); c.scale(-1,1);
  c.drawImage(video,0,0,snap.width,snap.height);
  const img = new Image();
  img.onload = () => {
    photo = img; strokes = []; setView("photo"); redrawStrokes();
    showToast("Momento capturado! Agora você pode editar.");
  };
  img.src = snap.toDataURL("image/png");
});

function addParticles(point, amount) {
  const mode = document.getElementById("playMode").value;
  const colors = ["#b7a3ff","#ff91b5","#ffcf70","#7de3c6","#8bd5ff"];
  for (let i=0;i<amount;i++) {
    particles.push({
      x:point.x, y:point.y,
      vx:(Math.random()-.5)*(mode === "orbit" ? 2 : 5),
      vy:(Math.random()-.5)*(mode === "bubbles" ? 2 : 5),
      life:45+Math.random()*55, max:100,
      radius:2+Math.random()*6,
      color:colors[Math.floor(Math.random()*colors.length)],
      angle:Math.random()*Math.PI*2,
      mode
    });
  }
  if (particles.length > 900) particles.splice(0, particles.length-900);
}
function animateParticles() {
  if (currentView !== "play") { animationFrame = null; return; }
  const {width,height} = canvasSize();
  ctx.clearRect(0,0,width,height);
  const mode = document.getElementById("playMode").value;
  particles = particles.filter(p => p.life > 0 && p.x > -30 && p.x < width+30 && p.y > -30 && p.y < height+30);
  for (const p of particles) {
    p.life--;
    if (mode === "stars") { p.vy += .015; p.x += p.vx; p.y += p.vy; }
    if (mode === "bubbles") { p.y -= .5 + p.radius*.06; p.x += Math.sin(p.life*.07)*.8; }
    if (mode === "orbit") { p.angle += .06; p.x += Math.cos(p.angle)*1.5 + p.vx*.2; p.y += Math.sin(p.angle)*1.5 + p.vy*.2; }
    ctx.save();
    ctx.globalAlpha = Math.min(1,p.life/20);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = p.radius*4;
    if (mode === "stars") {
      ctx.translate(p.x,p.y); ctx.rotate(p.angle);
      ctx.fillRect(-p.radius/2,-p.radius*1.8,p.radius,p.radius*3.6);
    } else {
      ctx.beginPath(); ctx.arc(p.x,p.y,p.radius,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  animationFrame = requestAnimationFrame(animateParticles);
}
function startParticles() {
  if (!animationFrame) animationFrame = requestAnimationFrame(animateParticles);
}
function stopParticles() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  particles = [];
}
document.getElementById("playMode").addEventListener("change", () => { particles = []; });
document.getElementById("clearPlay").addEventListener("click", () => {
  particles = [];
  ctx.clearRect(0,0,canvas.width/dpr,canvas.height/dpr);
  showToast("Experimento reiniciado. Toque para criar!");
});
document.querySelectorAll(".prompt-card").forEach(card => card.addEventListener("click", () => {
  setView("draw");
  const prompt = card.dataset.prompt;
  const {width,height} = canvasSize();
  const color = document.getElementById("brushColor");
  if (prompt === "galaxy") {
    color.value = "#a58bff";
    document.getElementById("brushStyle").value = "glow";
    document.getElementById("brushSize").value = 4;
    document.getElementById("brushSizeOut").textContent = "4 px";
    showToast("Ideia: desenhe uma galáxia com pontos e espirais.");
  } else if (prompt === "mood") {
    color.value = "#ff91b5";
    document.getElementById("brushStyle").value = "solid";
    showToast("Ideia: escolha cores e formas para mostrar um sentimento.");
  } else {
    color.value = "#7de3c6";
    document.getElementById("brushStyle").value = "rainbow";
    document.getElementById("brushSize").value = 12;
    document.getElementById("brushSizeOut").textContent = "12 px";
    showToast("Ideia: faça dez linhas sem planejar. Veja o que aparece.");
  }
  welcomeHint.classList.add("hidden");
}));
document.getElementById("saveBtn").addEventListener("click", () => {
  if (currentView === "play") {
    showToast("Experimento em movimento: salve um desenho ou foto para exportar.");
    return;
  }
  const exportCanvas = document.createElement("canvas");
  const {width,height} = canvasSize();
  exportCanvas.width = Math.round(width*dpr);
  exportCanvas.height = Math.round(height*dpr);
  const ectx = exportCanvas.getContext("2d");
  ectx.scale(dpr,dpr);
  ectx.fillStyle = "#12141f";
  ectx.fillRect(0,0,width,height);
  // Copy rendered artwork including photo and all strokes.
  ectx.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,width,height);
  exportCanvas.toBlob(blob => {
    if (!blob) { showToast("Não foi possível salvar o quadro."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `faisca-laboratorio-criacao-${Date.now()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    showToast("Sua criação foi salva como imagem!");
  }, "image/png");
});
window.addEventListener("resize", () => { resizeCanvas(); resizeMagicOverlay(); });
window.addEventListener("beforeunload", () => {
  stopCamera();
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
});
resizeCanvas();
setView("draw");


// --- Mãos mágicas e filtros faciais (MediaPipe executado no navegador) ---
const magicVideo = document.getElementById("magicVideo");
const magicOverlay = document.getElementById("magicOverlay");
const magicCtx = magicOverlay.getContext("2d");
let magicStream = null;
let magicMode = null;
let visionModule = null;
let handLandmarker = null;
let faceLandmarker = null;
let magicLoop = 0;
let lastVideoTime = -1;
let handTrails = [];
let lastHandPoints = [];

function resizeMagicOverlay() {
  const rect = magicOverlay.getBoundingClientRect();
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  magicOverlay.width = Math.max(1, Math.round(rect.width * ratio));
  magicOverlay.height = Math.max(1, Math.round(rect.height * ratio));
  magicCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
async function loadVision() {
  if (visionModule) return visionModule;
  showToast("Carregando o rastreador visual… é necessária internet na primeira vez.");
  visionModule = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm");
  return visionModule;
}
async function getLandmarker(kind) {
  const vision = await loadVision();
  const files = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
  );
  const model = kind === "hands"
    ? "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
    : "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const options = {
    baseOptions: { modelAssetPath: model, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1
  };
  if (kind === "hands") {
    options.numHands = 2;
    try { handLandmarker = await vision.HandLandmarker.createFromOptions(files, options); }
    catch (_) { options.baseOptions.delegate = "CPU"; handLandmarker = await vision.HandLandmarker.createFromOptions(files, options); }
    return handLandmarker;
  }
  try { faceLandmarker = await vision.FaceLandmarker.createFromOptions(files, options); }
  catch (_) { options.baseOptions.delegate = "CPU"; faceLandmarker = await vision.FaceLandmarker.createFromOptions(files, options); }
  return faceLandmarker;
}
async function startMagic(mode) {
  magicMode = mode;
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("A câmera precisa de localhost ou conexão HTTPS.");
    return;
  }
  const startButton = document.getElementById(mode === "hands" ? "startHands" : "startFace");
  startButton.disabled = true;
  try {
    stopMagicTracking();
    if (magicStream) magicStream.getTracks().forEach(track => track.stop());
    magicStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user", width:{ideal:1280}, height:{ideal:720}}, audio:false});
    magicVideo.srcObject = magicStream;
    await magicVideo.play();
    resizeMagicOverlay();
    document.getElementById("magicPreviewWrap").classList.remove("hidden");
    await getLandmarker(mode);
    document.getElementById(mode === "hands" ? "stopHands" : "stopFace").disabled = false;
    showToast(mode === "hands" ? "Mãos mágicas ativadas! Mexa as mãos na frente da câmera." : "Filtro ativado! Experimente os estilos.");
    lastVideoTime = -1;
    magicLoop = requestAnimationFrame(runMagicFrame);
  } catch (err) {
    console.error(err);
    if (magicStream) magicStream.getTracks().forEach(track => track.stop());
    magicStream = null;
    startButton.disabled = false;
    document.getElementById("magicPreviewWrap").classList.add("hidden");
    showToast("Não foi possível iniciar. Verifique a permissão da câmera e a conexão com a internet.");
  }
}
function stopMagicTracking() {
  if (magicLoop) cancelAnimationFrame(magicLoop);
  magicLoop = 0;
  magicCtx.clearRect(0, 0, magicOverlay.width, magicOverlay.height);
  if (magicStream && !["hands","face"].includes(currentView)) {
    magicStream.getTracks().forEach(track => track.stop());
    magicStream = null;
    magicVideo.srcObject = null;
    document.getElementById("magicPreviewWrap").classList.add("hidden");
    document.getElementById("startHands").disabled = false;
    document.getElementById("startFace").disabled = false;
    document.getElementById("stopHands").disabled = true;
    document.getElementById("stopFace").disabled = true;
  }
}
function stopMagic(mode) {
  if (magicLoop) cancelAnimationFrame(magicLoop);
  magicLoop = 0;
  if (magicStream) magicStream.getTracks().forEach(track => track.stop());
  magicStream = null;
  magicVideo.srcObject = null;
  handTrails = [];
  lastHandPoints = [];
  magicCtx.clearRect(0, 0, magicOverlay.width, magicOverlay.height);
  document.getElementById("magicPreviewWrap").classList.add("hidden");
  document.getElementById("startHands").disabled = false;
  document.getElementById("startFace").disabled = false;
  document.getElementById("stopHands").disabled = true;
  document.getElementById("stopFace").disabled = true;
  if (mode) showToast("Câmera desligada.");
}
function magicPoint(landmark) {
  const rect = magicOverlay.getBoundingClientRect();
  // A câmera está espelhada para ficar natural como um espelho.
  return {x:(1-landmark.x)*rect.width, y:landmark.y*rect.height};
}
function drawHandEffects(result, now) {
  const rect = magicOverlay.getBoundingClientRect();
  const effect = document.getElementById("handEffect").value;
  if (result.landmarks?.length) {
    result.landmarks.forEach((hand, idx) => {
      const tip = magicPoint(hand[8]); // ponta do indicador
      const previous = lastHandPoints[idx];
      const color = effect === "rainbow" ? `hsl(${(now/12+idx*120)%360} 100% 68%)` : (idx ? "#ff78c9" : "#67f7ff");
      if (previous && Math.hypot(tip.x-previous.x, tip.y-previous.y) < 120) {
        handTrails.push({x1:previous.x,y1:previous.y,x2:tip.x,y2:tip.y,life:1,color});
      }
      lastHandPoints[idx] = tip;
      // Joias de luz nos dedos.
      magicCtx.save();
      magicCtx.shadowColor = color; magicCtx.shadowBlur = 22;
      magicCtx.fillStyle = color;
      magicCtx.beginPath(); magicCtx.arc(tip.x,tip.y,7,0,Math.PI*2); magicCtx.fill();
      magicCtx.restore();
      if (effect === "stars") {
        magicCtx.save(); magicCtx.fillStyle = "#fff2a8"; magicCtx.shadowColor="#fff2a8"; magicCtx.shadowBlur=16;
        magicCtx.font = "22px system-ui"; magicCtx.fillText("✦",tip.x+9,tip.y-8); magicCtx.restore();
      }
    });
  } else {
    lastHandPoints = [];
  }
  handTrails = handTrails.filter(t => t.life > 0);
  handTrails.forEach(t => {
    magicCtx.save(); magicCtx.globalAlpha = t.life; magicCtx.strokeStyle = t.color;
    magicCtx.lineWidth = 4; magicCtx.lineCap = "round"; magicCtx.shadowColor = t.color; magicCtx.shadowBlur = 18;
    magicCtx.beginPath(); magicCtx.moveTo(t.x1,t.y1); magicCtx.lineTo(t.x2,t.y2); magicCtx.stroke();
    magicCtx.restore(); t.life -= .025;
  });
  if (handTrails.length > 500) handTrails.splice(0, handTrails.length-500);
}
function drawFaceEffects(result) {
  const faces = result.faceLandmarks || [];
  if (!faces.length) return;
  const face = faces[0];
  const p = i => magicPoint(face[i]);
  const effect = document.getElementById("faceEffect").value;
  const leftEye = p(33), rightEye = p(263), forehead = p(10), chin = p(152);
  const eyeDist = Math.hypot(rightEye.x-leftEye.x,rightEye.y-leftEye.y);
  const angle = Math.atan2(rightEye.y-leftEye.y,rightEye.x-leftEye.x);
  magicCtx.save();
  magicCtx.translate((leftEye.x+rightEye.x)/2,(leftEye.y+rightEye.y)/2);
  magicCtx.rotate(angle);
  if (effect === "glasses") {
    magicCtx.strokeStyle="#65f7ff"; magicCtx.lineWidth=4; magicCtx.shadowColor="#65f7ff"; magicCtx.shadowBlur=18;
    magicCtx.fillStyle="rgba(101,247,255,.14)";
    [-.27,.27].forEach(x => { magicCtx.beginPath(); magicCtx.ellipse(x*eyeDist,0,eyeDist*.23,eyeDist*.16,0,0,Math.PI*2); magicCtx.fill(); magicCtx.stroke(); });
    magicCtx.beginPath(); magicCtx.moveTo(-eyeDist*.05,0); magicCtx.lineTo(eyeDist*.05,0); magicCtx.stroke();
  } else if (effect === "crown") {
    magicCtx.font = `${Math.max(28,eyeDist*.65)}px system-ui`; magicCtx.textAlign="center";
    magicCtx.shadowColor="#ffcf70"; magicCtx.shadowBlur=22; magicCtx.fillText("♛",0,forehead.y-((leftEye.y+rightEye.y)/2)-eyeDist*.55);
  } else if (effect === "alien") {
    magicCtx.strokeStyle="#7de3c6"; magicCtx.lineWidth=4; magicCtx.shadowColor="#7de3c6"; magicCtx.shadowBlur=16;
    [-.24,.24].forEach(x => { magicCtx.beginPath(); magicCtx.moveTo(x*eyeDist,-eyeDist*.18); magicCtx.quadraticCurveTo(x*eyeDist*1.3,-eyeDist*.8,x*eyeDist*1.5,-eyeDist*.65); magicCtx.stroke(); magicCtx.fillStyle="#ff91b5"; magicCtx.beginPath(); magicCtx.arc(x*eyeDist*1.5,-eyeDist*.65,5,0,Math.PI*2); magicCtx.fill(); });
  } else {
    magicCtx.font = `${Math.max(16,eyeDist*.25)}px system-ui`; magicCtx.textAlign="center";
    magicCtx.shadowColor="#b9a0ff"; magicCtx.shadowBlur=14; magicCtx.fillStyle="#fff";
    magicCtx.fillText("✦  ·  ✧  ·  ✦",0,-eyeDist*.42);
  }
  magicCtx.restore();
}
function runMagicFrame(now) {
  if (!magicStream || !["hands","face"].includes(currentView)) { magicLoop = 0; return; }
  if (magicVideo.readyState >= 2 && magicVideo.currentTime !== lastVideoTime) {
    lastVideoTime = magicVideo.currentTime;
    const rect = magicOverlay.getBoundingClientRect();
    if (magicOverlay.width !== Math.round(rect.width*Math.max(1,window.devicePixelRatio||1))) resizeMagicOverlay();
    magicCtx.clearRect(0,0,rect.width,rect.height);
    if (magicMode === "hands" && handLandmarker) {
      const result = handLandmarker.detectForVideo(magicVideo, now);
      drawHandEffects(result, now);
    } else if (magicMode === "face" && faceLandmarker) {
      const result = faceLandmarker.detectForVideo(magicVideo, now);
      drawFaceEffects(result);
    }
  }
  magicLoop = requestAnimationFrame(runMagicFrame);
}
document.getElementById("startHands").addEventListener("click", () => startMagic("hands"));
document.getElementById("stopHands").addEventListener("click", () => stopMagic(true));
document.getElementById("startFace").addEventListener("click", () => startMagic("face"));
document.getElementById("stopFace").addEventListener("click", () => stopMagic(true));
document.getElementById("clearHandTrail").addEventListener("click", () => {
  handTrails = []; lastHandPoints = []; magicCtx.clearRect(0,0,magicOverlay.width,magicOverlay.height);
  showToast("Rastros apagados!");
});
document.getElementById("handEffect").addEventListener("change", () => { handTrails=[]; });
document.getElementById("faceEffect").addEventListener("change", () => {});
