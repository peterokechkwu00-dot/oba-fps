// In-game communication: text chat + WebRTC voice chat (peer-to-peer audio mesh, signalled over the game WebSocket).
const $ = id => document.getElementById(id);
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }];

let net = () => {}, myId = () => null, nameOf = id => `#${id}`, onTalkChange = () => {};
export const talking = new Set();   // ids currently transmitting (including me)
export const muted = new Set();
const peers = new Map();            // id -> { pc, audio, tx, pendingIce: [] }
let micTrack = null, micRequested = false, micDenied = false;
let micOn = localStorage.getItem('fps-micmuted') !== '1'; // open mic by default; V toggles
let vad = { speaking: false, lastLoud: 0, level: 0 };
let voiceVolume = Number(localStorage.getItem('fps-voicevol') || 1);
let chatting = false;

export function initComms(opts) {
  ({ net, myId, nameOf, onTalkChange } = { ...{ net, myId, nameOf, onTalkChange }, ...opts });
  const input = $('chatinput');
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const msg = input.value.trim(); if (msg) net({ t: 'chat', msg: msg.slice(0, 120) }); closeChat(); }
    else if (e.key === 'Escape') closeChat();
  });
  input.addEventListener('keyup', e => e.stopPropagation());
  $('openmic').checked = micOn;
  $('openmic').addEventListener('change', e => setMic(e.target.checked));
  renderMicStatus();
  $('voicevol').value = voiceVolume;
  $('voicevol').addEventListener('input', e => { voiceVolume = Number(e.target.value); localStorage.setItem('fps-voicevol', voiceVolume); for (const p of peers.values()) p.audio.volume = voiceVolume; });
}

// ---------- Text chat ----------
export const isChatting = () => chatting;
export function openChat() {
  chatting = true; const box = $('chat'); box.classList.add('open');
  const input = $('chatinput'); input.classList.remove('hidden'); input.value = ''; setTimeout(() => input.focus(), 0);
}
export function closeChat() { chatting = false; $('chat').classList.remove('open'); const input = $('chatinput'); input.blur(); input.classList.add('hidden'); }
export function chatLine(name, msg, cls = '') {
  const log = $('chatlog'); const line = document.createElement('div'); line.className = `line ${cls}`;
  if (name) { const n = document.createElement('b'); n.textContent = `${name}: `; line.appendChild(n); }
  line.appendChild(document.createTextNode(msg)); // textContent => HTML-safe
  log.appendChild(line); while (log.children.length > 40) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  setTimeout(() => line.classList.add('old'), 9000);
}

// ---------- Voice ----------
async function ensureMic() {
  if (micTrack || micDenied) return !!micTrack;
  if (micRequested) return false;
  micRequested = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    micTrack = stream.getAudioTracks()[0]; micTrack.enabled = micOn;
    for (const p of peers.values()) if (p.tx) p.tx.sender.replaceTrack(micTrack).catch(() => {});
    startVAD(stream);
    chatLine('', micOn ? 'Voice chat is live — your mic is ON. Press V to mute/unmute.' : 'Microphone ready (muted) — press V to unmute.', 'sys');
    return true;
  } catch (e) {
    micDenied = true;
    chatLine('', 'Microphone access was denied or no mic was found — you can still hear others. Allow the mic in your browser\'s site settings and reload to talk.', 'sys');
    return false;
  } finally { micRequested = false; renderMicStatus(); }
}
// Voice-activity detection: the speaking icon only lights up while the mic level is above a threshold.
function startVAD(stream) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    setInterval(() => {
      if (ctx.state === 'suspended') ctx.resume();
      an.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length); vad.level = rms; const now = performance.now();
      if (rms > 0.02) vad.lastLoud = now;
      setSpeaking(!!micTrack && micOn && now - vad.lastLoud < 350);
    }, 80);
  } catch (e) { console.warn('VAD unavailable', e); }
}
function setSpeaking(on) {
  if (on === vad.speaking) return; vad.speaking = on;
  const id = myId(); if (on) talking.add(id); else talking.delete(id);
  net({ t: 'talk', on }); onTalkChange(id, on); renderMicStatus();
}
function renderMicStatus() {
  const el = $('micstatus'); if (!el) return;
  let txt, cls;
  if (micDenied) { txt = '⚠️ Mic blocked — others can\'t hear you'; cls = 'denied'; }
  else if (!micTrack) { txt = micRequested ? '🎤 Requesting microphone…' : '🎤 Mic off'; cls = 'off'; }
  else if (!micOn) { txt = '🔇 Mic muted (press V)'; cls = 'muted'; }
  else { txt = vad.speaking ? '🎤 Mic on · speaking' : '🎤 Mic on (V to mute)'; cls = vad.speaking ? 'live speaking' : 'live'; }
  el.textContent = txt; el.className = cls;
  const cb = $('openmic'); if (cb) cb.checked = micOn;
}
export function setMic(on) {
  micOn = !!on; localStorage.setItem('fps-micmuted', micOn ? '0' : '1');
  if (micTrack) micTrack.enabled = micOn;
  if (!micOn) setSpeaking(false);
  renderMicStatus();
}
export function toggleMic() { if (!micTrack && !micDenied) { micOn = true; ensureMic(); renderMicStatus(); return; } setMic(!micOn); }
// Called right after the player clicks Play: ask for the mic straight away (open mic by default).
export function startVoice() { renderMicStatus(); return ensureMic(); }
export const micState = () => ({ hasMic: !!micTrack, micOn, denied: micDenied, speaking: vad.speaking, level: vad.level });
function getPeer(id, initiator) {
  let peer = peers.get(id); if (peer) return peer;
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const audio = new Audio(); audio.autoplay = true; audio.volume = voiceVolume; audio.muted = muted.has(id);
  peer = { pc, audio, tx: null, pendingIce: [], sentIce: 0, recvIce: 0 }; peers.set(id, peer);
  pc.onicecandidate = e => { if (e.candidate) peer.sentIce++; if (e.candidate) net({ t: 'rtc', to: id, data: { ice: e.candidate.toJSON() } }); };
  pc.ontrack = e => { audio.srcObject = e.streams[0] || new MediaStream([e.track]); audio.play().catch(() => {}); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { closePeer(id); } };
  if (initiator) {
    peer.tx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (micTrack) peer.tx.sender.replaceTrack(micTrack);
    pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => net({ t: 'rtc', to: id, data: { sdp: pc.localDescription.toJSON() } })).catch(err => console.warn('offer failed', err));
  }
  return peer;
}
export function closePeer(id) { const p = peers.get(id); if (!p) return; try { p.pc.close(); } catch {} p.audio.srcObject = null; peers.delete(id); talking.delete(id); }
// Called on welcome: the newcomer offers to every human already in the match.
export function connectVoice(list) { if (!window.RTCPeerConnection) return; for (const r of list) if (!r.bot && r.id !== myId()) getPeer(r.id, true); }
async function onRtc(from, data) {
  if (!window.RTCPeerConnection) return;
  try {
    if (data.sdp) {
      const peer = getPeer(from, false); const pc = peer.pc;
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        peer.tx = pc.getTransceivers()[0]; if (peer.tx) { peer.tx.direction = 'sendrecv'; if (micTrack) await peer.tx.sender.replaceTrack(micTrack); }
        await pc.setLocalDescription(await pc.createAnswer());
        net({ t: 'rtc', to: from, data: { sdp: pc.localDescription.toJSON() } });
      }
      for (const c of peer.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (data.ice) {
      const peer = peers.get(from) || getPeer(from, false); peer.recvIce++;
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.ice).catch(() => {}); else peer.pendingIce.push(data.ice);
    }
  } catch (e) { console.warn('rtc error', e); }
}
export function toggleMute(id) {
  if (muted.has(id)) muted.delete(id); else muted.add(id);
  const p = peers.get(id); if (p) p.audio.muted = muted.has(id);
}
export function handle(m) {
  if (m.t === 'chat') { chatLine(m.name, m.msg, m.id === myId() ? 'me' : ''); return true; }
  if (m.t === 'rtc') { onRtc(m.from, m.data); return true; }
  if (m.t === 'talk') { if (m.on) talking.add(m.id); else talking.delete(m.id); onTalkChange(m.id, m.on); return true; }
  if (m.t === 'leave') closePeer(m.id);
  return false;
}
export const voiceStats = () => [...peers.entries()].map(([id, p]) => ({ id, state: p.pc.connectionState, ice: p.pc.iceConnectionState, gathering: p.pc.iceGatheringState, sentIce: p.sentIce, recvIce: p.recvIce, signaling: p.pc.signalingState, hasAudio: !!p.audio.srcObject, muted: p.audio.muted }));
