// In-game communication: text chat + WebRTC voice chat (peer-to-peer audio mesh, signalled over the game WebSocket).
const $ = id => document.getElementById(id);
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }];

let net = () => {}, myId = () => null, nameOf = id => `#${id}`, onTalkChange = () => {};
export const talking = new Set();   // ids currently transmitting (including me)
export const muted = new Set();
const peers = new Map();            // id -> { pc, audio, tx, pendingIce: [] }
let micTrack = null, micRequested = false, micDenied = false, ptt = false;
let openMic = localStorage.getItem('fps-openmic') === '1';
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
  $('openmic').checked = openMic;
  $('openmic').addEventListener('change', async e => { openMic = e.target.checked; localStorage.setItem('fps-openmic', openMic ? '1' : '0'); if (openMic) await ensureMic(); updateTransmit(); });
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
    micTrack = stream.getAudioTracks()[0]; micTrack.enabled = false;
    for (const p of peers.values()) if (p.tx) p.tx.sender.replaceTrack(micTrack).catch(() => {});
    chatLine('', 'Microphone ready — hold V to talk.', 'sys');
    return true;
  } catch (e) {
    micDenied = true; chatLine('', 'Microphone blocked or unavailable — voice chat is listen-only.', 'sys'); return false;
  } finally { micRequested = false; }
}
function updateTransmit() {
  const on = !!micTrack && (ptt || openMic);
  if (micTrack) micTrack.enabled = on;
  const id = myId(); const was = talking.has(id);
  if (on) talking.add(id); else talking.delete(id);
  if (was !== on) { net({ t: 'talk', on }); onTalkChange(id, on); }
  $('talkind').classList.toggle('hidden', !on);
}
export async function pttDown() { if (ptt) return; ptt = true; await ensureMic(); updateTransmit(); }
export function pttUp() { ptt = false; updateTransmit(); }

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
