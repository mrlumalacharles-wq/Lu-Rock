// ── Auth screens ──────────────────────────────────────────────────
const allScreens = ['splash','login','signup','chats','status','calls','requests','communities','settings','msgscreen','aiscreen','editprofile','about','blocked','newgroup','groupinfo'];

function showScreen(id) {
  allScreens.forEach(s => document.getElementById(s)?.classList.remove('active'));
  document.getElementById('bottomTabs').style.display = 'none';
  document.getElementById(id).classList.add('active');
}

function togglePass(id, btn) {
  const inp = document.getElementById(id);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

function checkPassStrength(val) {
  const bars = [document.getElementById('sb1'),document.getElementById('sb2'),document.getElementById('sb3'),document.getElementById('sb4')];
  const lbl = document.getElementById('strengthLabel');
  bars.forEach(b => b.style.background = 'rgba(255,255,255,0.1)');
  if (!val) { lbl.textContent=''; return; }
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const colors = ['#EF4444','#F97316','#FFC107','#25D366'];
  const labels = ['Weak','Fair','Good','Strong 💪'];
  for (let i = 0; i < score; i++) bars[i].style.background = colors[score-1];
  lbl.textContent = labels[score-1] || '';
  lbl.style.color = colors[score-1] || 'var(--muted)';
}

// ── Splash Loading Bar ────────────────────────────────────────────
(function() {
  let pct = 0;
  const steps = [[20,'Connecting...'],[50,'Loading...'],[80,'Almost ready...'],[100,'Welcome!']];
  let stepIdx = 0;
  const iv = setInterval(() => {
    pct = Math.min(pct + 2, 100);
    const bar    = document.getElementById('splashBar');
    const status = document.getElementById('splashStatus');
    if (bar)    bar.style.width = pct + '%';
    if (steps[stepIdx] && pct >= steps[stepIdx][0]) {
      if (status) status.textContent = steps[stepIdx][1];
      stepIdx++;
    }
    if (pct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        const active = document.querySelector('.screen.active');
        if (active && active.id === 'splash') showScreen('login');
      }, 700);
    }
  }, 30);
})();

// ── Toast ──────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Firebase Auth stubs (real impls assigned below by async loader) ──
// Stubs are safe to call at any time; they delegate to window._doX once Firebase loads.
function doLogin()          { window._doLogin          ? window._doLogin()          : (document.getElementById('loginError').textContent  = '⏳ Still loading, please retry…'); }
function doSignup()         { window._doSignup         ? window._doSignup()         : (document.getElementById('signupError').textContent = '⏳ Still loading, please retry…'); }
function doForgotPassword() { window._doForgotPassword ? window._doForgotPassword() : showToast('⏳ Still loading…'); }
function doLogout()         { window._doLogout         ? window._doLogout()         : showToast('⏳ Still loading…'); }
function doGoogleSignIn()   { window._doGoogleSignIn   ? window._doGoogleSignIn()   : (document.getElementById('loginError').textContent  = '⏳ Still loading, please retry…'); }
function doAppleSignIn()    { window._doAppleSignIn    ? window._doAppleSignIn()    : (document.getElementById('loginError').textContent  = '⏳ Still loading, please retry…'); }


const mainScreens = ['chats','status','calls','communities','settings'];
let prevTab = 'chats';
let recInterval = null, recSeconds = 0;
let callTimerInterval = null, callSeconds = 0;
let currentCallTarget = {};
let voicePlayTimers = {};
let pendingCallType = 'voice';

// ── Clock ──────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('sbTime').textContent =
    now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}
updateClock();
setInterval(updateClock, 30000);

function showAddStatus() {
  const box = document.getElementById('addStatusBox');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if (box.style.display === 'block') document.getElementById('statusText').focus();
}

function previewStatusPhoto(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('statusPhotoImg').src = e.target.result;
    document.getElementById('statusPhotoPreview').style.display = 'block';
  };
  reader.readAsDataURL(input.files[0]);
}

function removeStatusPhoto() {
  document.getElementById('statusPhotoPreview').style.display = 'none';
  document.getElementById('statusPhotoImg').src = '';
  document.getElementById('statusPhotoInput').value = '';
}

function closeStatusViewer() {
  document.getElementById('statusViewer').style.display = 'none';
}

function openStatusViewer(name, initials, color, text, photoURL, timeStr) {
  document.getElementById('svName').textContent = name;
  document.getElementById('svTime').textContent = timeStr;
  document.getElementById('svText').textContent = text || '';
  const av = document.getElementById('svAvatar');
  av.textContent = initials; av.className = 'cr-avatar ' + color;
  const photo = document.getElementById('svPhoto');
  if (photoURL) { photo.src = photoURL; photo.style.display = 'block'; }
  else { photo.style.display = 'none'; }
  document.getElementById('statusViewer').style.display = 'flex';
}

function postStatus()            { window._postStatus        ? window._postStatus()        : showToast('⏳ Still loading…'); }
function uploadProfilePic(input) { window._uploadProfilePic  ? window._uploadProfilePic(input)  : showToast('⏳ Still loading…'); }
function sendImageMessage(input) { window._sendImageMessage  ? window._sendImageMessage(input)  : showToast('⏳ Still loading…'); }

function loadPeople()        { window._loadPeople        ? window._loadPeople()        : showToast('⏳ Still loading…'); }
function filterPeople(val)   { window._filterPeople      ? window._filterPeople(val)   : null; }

function showProfilePicOptions() {
  document.getElementById('profilePicSheet').style.display = 'block';
}
function closeProfilePicSheet() {
  document.getElementById('profilePicSheet').style.display = 'none';
}
function chooseFromGallery() {
  closeProfilePicSheet();
  const inp = document.getElementById('profilePicInput');
  inp.removeAttribute('capture');
  inp.click();
}
function takePhoto() {
  closeProfilePicSheet();
  const inp = document.getElementById('profilePicInput');
  inp.setAttribute('capture', 'user');
  inp.click();
}
function viewProfilePic() {
  closeProfilePicSheet();
  const viewer = document.getElementById('profilePicViewer');
  const av = document.getElementById('settingsAvatar');
  const img = av.querySelector('img');
  const pvPhoto = document.getElementById('pvPhoto');
  const pvInit  = document.getElementById('pvInitials');
  const pvName  = document.getElementById('pvName');
  pvName.textContent = document.getElementById('settingsName').textContent;
  if (img && img.src) {
    pvPhoto.src = img.src;
    pvPhoto.style.display = 'block';
    pvInit.style.display  = 'none';
  } else {
    pvPhoto.style.display = 'none';
    pvInit.style.display  = 'flex';
    pvInit.textContent = document.getElementById('settingsAvatarInitials').textContent;
  }
  viewer.style.display = 'flex';
}
function removeProfilePic() {
  closeProfilePicSheet();
  if (window._removeProfilePic) window._removeProfilePic();
  else showToast('⏳ Still loading…');
}

function openEditProfile() {
  // Populate fields from current values
  document.getElementById('editNameInput').value = document.getElementById('settingsName').textContent;
  const bio = document.getElementById('settingsBio').textContent;
  document.getElementById('editBioInput').value = bio === 'Hey there! I am using Lum@T' ? '' : bio;
  updateBioCount();

  // Copy avatar to edit screen
  const srcAv   = document.getElementById('settingsAvatar');
  const editAv  = document.getElementById('editProfileAvatar');
  const editInit = document.getElementById('editProfileInitials');
  const srcImg  = srcAv.querySelector('img');
  const srcInit = document.getElementById('settingsAvatarInitials');
  editInit.textContent = srcInit.textContent;
  editAv.querySelectorAll('img').forEach(i=>i.remove());
  if (srcImg) {
    const img = document.createElement('img');
    img.src = srcImg.src;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;';
    editAv.style.position = 'relative';
    editAv.appendChild(img);
    editInit.style.display = 'none';
  } else {
    editInit.style.display = '';
  }

  allScreens.forEach(s => document.getElementById(s)?.classList.remove('active'));
  document.getElementById('bottomTabs').style.display = 'none';
  document.getElementById('editprofile').classList.add('active');
}

function closeEditProfile() {
  allScreens.forEach(s => document.getElementById(s)?.classList.remove('active'));
  document.getElementById('bottomTabs').style.display = 'flex';
  document.getElementById('settings').classList.add('active');
}

function setBio(el) {
  document.getElementById('editBioInput').value = el.textContent;
  updateBioCount();
}

function updateBioCount() {
  const len = document.getElementById('editBioInput').value.length;
  document.getElementById('bioCharCount').textContent = len + '/139';
}

function saveProfile() { window._saveProfile ? window._saveProfile() : showToast('⏳ Still loading…'); }

// ── Chat Menu ─────────────────────────────────────────────────────
function showChatMenu() {
  const menu = document.getElementById('chatMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
function hideChatMenu() {
  document.getElementById('chatMenu').style.display = 'none';
}

// ── Delete Message ────────────────────────────────────────────────
let selectedMsgId = null;
let selectedMsgIsMine = false;

function showDeleteSheet(msgId, isMine) {
  selectedMsgId    = msgId;
  selectedMsgIsMine = isMine;
  // Only show "delete for everyone" if it's your own message
  document.getElementById('deleteForAll').style.display = isMine ? 'flex' : 'none';
  document.getElementById('deleteSheet').style.display = 'block';
}
function closeDeleteSheet() {
  document.getElementById('deleteSheet').style.display = 'none';
  selectedMsgId = null;
}
function deleteMessage(scope) {
  closeDeleteSheet();
  if (!selectedMsgId) return;
  window._deleteMessage ? window._deleteMessage(selectedMsgId, scope) : showToast('⏳ Still loading…');
}
function clearChat() {
  hideChatMenu();
  if (confirm('Clear all messages in this chat? This cannot be undone.')) {
    window._clearChat ? window._clearChat() : showToast('⏳ Still loading…');
  }
}

// ── Block User ────────────────────────────────────────────────────
function blockUser() {
  hideChatMenu();
  document.getElementById('blockUserName').textContent = document.getElementById('msgName').textContent;
  document.getElementById('blockConfirm').style.display = 'flex';
}
function closeBlockConfirm() {
  document.getElementById('blockConfirm').style.display = 'none';
}
function confirmBlock() {
  closeBlockConfirm();
  window._blockUser ? window._blockUser() : showToast('⏳ Still loading…');
}

// ── Chats List Search ─────────────────────────────────────────────
function toggleChatsSearch() {
  const bar = document.getElementById('chatsSearchBar');
  bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
  if (bar.style.display === 'block') document.getElementById('chatsSearchInput').focus();
  else { document.getElementById('chatsSearchInput').value=''; filterChats(''); }
}

function filterChats(val) {
  const q = val.toLowerCase().trim();
  const rows = document.querySelectorAll('#chatList .chat-row');
  rows.forEach(row => {
    const name = row.querySelector('.cr-name')?.textContent.toLowerCase()||'';
    const prev = row.querySelector('.cr-preview')?.textContent.toLowerCase()||'';
    row.style.display = (!q || name.includes(q) || prev.includes(q)) ? '' : 'none';
  });
}

// ── Message Search ────────────────────────────────────────────────
function toggleMsgSearch() {
  const bar = document.getElementById('msgSearchBar');
  bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
  if (bar.style.display === 'block') document.getElementById('msgSearchInput').focus();
  else closeMsgSearch();
}

function closeMsgSearch() {
  document.getElementById('msgSearchBar').style.display = 'none';
  document.getElementById('msgSearchInput').value = '';
  document.getElementById('msgSearchCount').style.display = 'none';
  // Remove all highlights
  document.querySelectorAll('#messagesArea .search-highlight').forEach(el => {
    el.outerHTML = el.textContent;
  });
  document.querySelectorAll('#messagesArea .bubble-row').forEach(r => r.style.display = '');
}

function searchMessages(val) {
  const q = val.trim().toLowerCase();
  const rows = document.querySelectorAll('#messagesArea .bubble-row');
  const countEl = document.getElementById('msgSearchCount');
  if (!q) {
    rows.forEach(r => r.style.display = '');
    countEl.style.display = 'none';
    return;
  }
  let matches = 0;
  rows.forEach(row => {
    const bubble = row.querySelector('.bubble');
    if (!bubble) { row.style.display='none'; return; }
    const text = bubble.textContent.toLowerCase();
    if (text.includes(q)) {
      row.style.display = '';
      matches++;
    } else {
      row.style.display = 'none';
    }
  });
  countEl.style.display = 'block';
  countEl.textContent = matches ? `${matches} result${matches>1?'s':''} found` : 'No results found';
}

// ── Navigation ────────────────────────────────────────────────────
function openApp() {
  allScreens.forEach(s => document.getElementById(s)?.classList.remove('active'));
  document.getElementById('chats').classList.add('active');
  document.getElementById('bottomTabs').style.display = 'flex';
}

function switchTab(id, el) {
  allScreens.forEach(s => document.getElementById(s)?.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  prevTab = id;
}

function goToPeopleToCall() {
  const peopleTab = document.querySelector('[onclick*="switchTab(\'communities\'"]');
  if (peopleTab) switchTab('communities', peopleTab);
  if (window._loadPeople) window._loadPeople();
  showToast('📞 Pick a friend to call');
}

function setFilter(el) {
  const label = el.textContent.trim();
  document.querySelectorAll('#chatList .chat-row').forEach(row => {
    const isGroup  = row.dataset.group === '1';
    const isUnread = !!row.querySelector('.unread-badge');
    let show = true;
    if (label === 'Groups')  show = isGroup;
    if (label === 'Unread')  show = isUnread;
    row.style.display = show ? '' : 'none';
  });
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function openChat(name, initials, avatarClass, online) {
  allScreens.forEach(s => document.getElementById(s)?.classList.remove('active'));
  document.getElementById('msgscreen').classList.add('active');
  document.getElementById('bottomTabs').style.display = 'none';
  const av = document.getElementById('msgAvatar');
  av.textContent = initials;
  av.className = 'cr-avatar ' + avatarClass;
  av.style.cssText = 'width:38px;height:38px;font-size:14px;';
  document.getElementById('msgName').textContent = name;
  document.getElementById('msgStatus').textContent = online ? 'online' : 'last seen recently';
  document.getElementById('msgStatus').style.color = online ? 'var(--green)' : 'var(--muted)';
  currentCallTarget = {name, initials, avatarClass};
}

function goBack() {
  cancelRecording();
  closeMsgSearch();
  if (window._presenceUnsub) { window._presenceUnsub(); window._presenceUnsub = null; }
  if (window._msgUnsub) { window._msgUnsub(); window._msgUnsub = null; }
  document.getElementById('msgscreen').classList.remove('active');
  document.getElementById(prevTab).classList.add('active');
  document.getElementById('bottomTabs').style.display = 'flex';
}

// ── Message sending ───────────────────────────────────────────────
function toggleSendBtn() {
  const hasText = document.getElementById('msgInput').value.trim().length > 0;
  document.getElementById('sendBtn').style.display = hasText ? 'flex' : 'none';
  document.getElementById('micBtn').style.display = hasText ? 'none' : 'flex';
}

function sendMessage(e) {
  if (e.key !== 'Enter') return;
  if (window._realSend) window._realSend();
}

function sendMessageBtn() {
  if (window._realSend) window._realSend();
}

function appendSentBubble(text) {
  // handled by Firestore real-time listener
}

// ── Real Voice Recording ──────────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let recWavePoints = [];
let recAnimFrame = null;
let recStream = null;
let recAudioContext = null;
let recAnalyser = null;

async function startRecording() {
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch(e) {
    showToast('🎤 Microphone permission denied');
    return;
  }

  // Setup analyser for live waveform
  recAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = recAudioContext.createMediaStreamSource(recStream);
  recAnalyser = recAudioContext.createAnalyser();
  recAnalyser.fftSize = 64;
  source.connect(recAnalyser);

  audioChunks = [];
  mediaRecorder = new MediaRecorder(recStream);
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start(100);

  document.getElementById('normalInputBar').style.display = 'none';
  document.getElementById('recordingBar').classList.add('active');
  recSeconds = 0;
  document.getElementById('recTime').textContent = '0:00';

  recInterval = setInterval(() => {
    recSeconds++;
    const m = Math.floor(recSeconds/60);
    const s = recSeconds%60;
    document.getElementById('recTime').textContent = `${m}:${s.toString().padStart(2,'0')}`;
    // Auto-stop at 30 seconds to stay under Firestore 1MB limit
    if (recSeconds >= 30) {
      showToast('⏱ Max 30 seconds — sending now');
      sendVoiceNote();
    }
  }, 1000);

  drawRecWave();
}

function drawRecWave() {
  if (!recAnalyser) return;
  const data = new Uint8Array(recAnalyser.frequencyBinCount);
  recAnalyser.getByteFrequencyData(data);
  const svg = document.getElementById('recWaveLine');
  let pts = '0,18';
  for (let i = 0; i < 20; i++) {
    const x = (i+1) * (200/21);
    const amp = (data[i*2]||0) / 255 * 14;
    const y = 18 + (i%2===0 ? amp : -amp);
    pts += ` ${x.toFixed(1)},${y.toFixed(1)}`;
  }
  pts += ' 200,18';
  svg.setAttribute('points', pts);
  recAnimFrame = requestAnimationFrame(drawRecWave);
}

function stopRecordingCleanup() {
  clearInterval(recInterval); recInterval = null;
  cancelAnimationFrame(recAnimFrame); recAnimFrame = null;
  if (recAnalyser) { recAnalyser.disconnect(); recAnalyser = null; }
  if (recAudioContext) { recAudioContext.close(); recAudioContext = null; }
  if (recStream) { recStream.getTracks().forEach(t=>t.stop()); recStream = null; }
  document.getElementById('recordingBar').classList.remove('active');
  document.getElementById('normalInputBar').style.display = 'flex';
  document.getElementById('recWaveLine').setAttribute('points','0,18 200,18');
}

function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  mediaRecorder = null; audioChunks = [];
  stopRecordingCleanup();
}

function sendVoiceNote() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  const dur = recSeconds;
  mediaRecorder.stop();

  mediaRecorder.onstop = async () => {
    stopRecordingCleanup();
    if (!audioChunks.length || !currentChatId || !currentUser) return;

    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    audioChunks = [];

    // Show sending indicator
    const area = document.getElementById('messagesArea');
    const tempId = 'temp_' + Date.now();
    const tempRow = document.createElement('div');
    tempRow.className = 'bubble-row me'; tempRow.id = tempId;
    tempRow.innerHTML = `<div class="bubble sent" style="color:var(--muted);font-size:13px;">🎤 Sending voice note...</div>`;
    area.appendChild(tempRow);
    area.scrollTop = area.scrollHeight;

    try {
      // Convert blob to base64 (no Storage needed)
      const base64Audio = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });

      document.getElementById(tempId)?.remove();

      // Check size — Firestore doc limit is 1MB
      if (base64Audio.length > 900000) {
        showToast('⚠️ Voice note too long. Please keep it under 20 seconds.');
        return;
      }

      const myName = currentUser.displayName || currentUser.email.split('@')[0];
      const chatRef = doc(db,'chats',currentChatId);
      await addDoc(collection(db,'chats',currentChatId,'messages'), {
        type: 'audio',
        audioData: base64Audio,
        duration: dur,
        senderId: currentUser.uid,
        senderName: myName,
        time: serverTimestamp()
      });
      await updateDoc(chatRef, {
        lastMessage: '🎤 Voice note',
        lastMessageTime: serverTimestamp(),
        [`unread.${currentOtherUser.uid}`]: ((await getDoc(chatRef)).data()?.unread?.[currentOtherUser.uid]||0)+1
      });
    } catch(e) {
      document.getElementById(tempId)?.remove();
      showToast('⚠️ Failed to send voice note');
      console.error(e);
    }
  };
}

function generateWavePoints() {
  let pts = '';
  for (let i = 0; i <= 12; i++) {
    const x = i * 10;
    const y = 6 + Math.random() * 16;
    pts += `${x},${y.toFixed(0)} `;
  }
  return pts;
}

// ── Voice Note Playback ───────────────────────────────────────────
function playVoiceNote(el, totalSecs) {
  const playBtn = el.querySelector('.play-btn');
  const prog = el.querySelector('.wave-progress-fill');
  const durEl = el.querySelector('.voice-dur');
  const id = el.closest('.bubble-row')?.dataset?.vnid || Math.random();

  if (voicePlayTimers[id]) {
    clearInterval(voicePlayTimers[id]);
    delete voicePlayTimers[id];
    playBtn.textContent = '▶';
    prog.style.width = '0%';
    durEl.textContent = formatDur(totalSecs);
    return;
  }

  playBtn.textContent = '⏸';
  let elapsed = 0;
  const step = 100;
  voicePlayTimers[id] = setInterval(() => {
    elapsed += step / 1000;
    const pct = Math.min((elapsed / totalSecs) * 100, 100);
    prog.style.width = pct + '%';
    const remaining = Math.max(0, totalSecs - Math.floor(elapsed));
    durEl.textContent = formatDur(remaining);
    if (elapsed >= totalSecs) {
      clearInterval(voicePlayTimers[id]);
      delete voicePlayTimers[id];
      playBtn.textContent = '▶';
      prog.style.width = '0%';
      durEl.textContent = formatDur(totalSecs);
    }
  }, step);
}

function formatDur(s) {
  return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
}

// ── Call Helpers ──────────────────────────────────────────────────
function startVoiceCall() {
  startVoiceCallFor(
    currentCallTarget.name || 'Dorcus',
    currentCallTarget.initials || 'D',
    currentCallTarget.avatarClass || 'av-blue'
  );
}

function startVideoCall() {
  startVideoCallFor(
    currentCallTarget.name || 'Dorcus',
    currentCallTarget.initials || 'D',
    currentCallTarget.avatarClass || 'av-blue'
  );
}

function startVoiceCallFor(name, initials, avatarClass) {
  document.getElementById('acName').textContent = name;
  const av = document.getElementById('acAvatar');
  av.textContent = initials;
  av.className = 'ac-avatar ' + avatarClass;
  document.getElementById('activeCall').classList.add('active');
  startCallTimer('acTimer');
  startCallWave();
}

function startVideoCallFor(name, initials, avatarClass) {
  document.getElementById('vcName').textContent = name;
  const av = document.getElementById('vcAvatar');
  av.textContent = initials;
  av.className = 'vc-remote-avatar ' + avatarClass;
  document.getElementById('videoCall').classList.add('active');
  startCallTimer('vcTimer');
  // Reveal the real WebRTC video feeds (hidden by default) on top of the mock overlay
  const lv = document.getElementById('localVideo');
  const rv = document.getElementById('remoteVideo');
  if (lv) lv.style.display = 'block';
  if (rv) rv.style.display = 'block';
}

function showIncomingCall(name, initials, avatarClass, type) {
  pendingCallType = type;
  document.getElementById('icName').textContent = name;
  const av = document.getElementById('icAvatar');
  av.textContent = initials;
  av.className = 'ic-avatar ' + avatarClass;
  document.getElementById('icTypeLabel').textContent = type === 'video'
    ? 'Lum@T Video Call' : 'Lum@T Voice Call';
  document.getElementById('incomingCall').classList.add('active');
  currentCallTarget = {name, initials, avatarClass};
}

function acceptCall() {
  document.getElementById('incomingCall').classList.remove('active');
  if (pendingCallType === 'video') {
    startVideoCallFor(currentCallTarget.name, currentCallTarget.initials, currentCallTarget.avatarClass);
  } else {
    startVoiceCallFor(currentCallTarget.name, currentCallTarget.initials, currentCallTarget.avatarClass);
  }
}

function declineCall() {
  document.getElementById('incomingCall').classList.remove('active');
  showToast('📵 Call declined');
}

function endCall() {
  document.getElementById('activeCall').classList.remove('active');
  clearInterval(callTimerInterval);
  callTimerInterval = null;
  document.getElementById('acTimer').textContent = '0:00';
  document.getElementById('acWaveLine').setAttribute('points', '0,24 300,24');
  showToast('📞 Call ended');
}

function endVideoCall() {
  document.getElementById('videoCall').classList.remove('active');
  clearInterval(callTimerInterval);
  callTimerInterval = null;
  document.getElementById('vcTimer').textContent = '0:00';
  showToast('📹 Video call ended');
}

function startCallTimer(elId) {
  callSeconds = 0;
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    document.getElementById(elId).textContent = formatDur(callSeconds);
  }, 1000);
}

let waveInterval = null;
function startCallWave() {
  clearInterval(waveInterval);
  let t = 0;
  waveInterval = setInterval(() => {
    t += 0.3;
    let pts = '0,24';
    for (let x = 5; x <= 295; x += 5) {
      const y = 24 + Math.sin((x / 20) + t) * 6 + (Math.random() - 0.5) * 4;
      pts += ` ${x},${y.toFixed(1)}`;
    }
    pts += ' 300,24';
    document.getElementById('acWaveLine').setAttribute('points', pts);
  }, 80);
  // tie to endCall cleanup
  const origEnd = endCall;
  window._cleanupWave = () => clearInterval(waveInterval);
}

function toggleCtrl(el, btnClass) {
  el.querySelector('.' + btnClass).classList.toggle('active-ctrl');
}

function toggleVcCtrl(el) {
  el.querySelector('.vc-ctrl-btn').classList.toggle('off');
}

// ── AI Chat ───────────────────────────────────────────────────────
function openAI() {
  allScreens.forEach(s => document.getElementById(s)?.classList.remove('active'));
  document.getElementById('aiscreen').classList.add('active');
  document.getElementById('bottomTabs').style.display = 'none';
}

function closeAI() {
  document.getElementById('aiscreen').classList.remove('active');
  document.getElementById('communities').classList.add('active');
  document.getElementById('bottomTabs').style.display = 'flex';
}

async function sendAI(e) {
  if (e.key !== 'Enter') return;
  const input = document.getElementById('aiInput');
  const text = input.value.trim();
  if (!text) return;
  const msgs = document.getElementById('aiMsgs');
  const uRow = document.createElement('div');
  uRow.className = 'ai-bubble-row user';
  uRow.innerHTML = `<div class="ai-bub">${escapeHtml(text)}</div>`;
  msgs.appendChild(uRow);
  input.value = '';
  msgs.scrollTop = msgs.scrollHeight;
  const tRow = document.createElement('div');
  tRow.className = 'ai-bubble-row';
  tRow.innerHTML = `<div class="ai-orb-small">✨</div><div class="ai-bub ai-typing">Thinking</div>`;
  msgs.appendChild(tRow);
  msgs.scrollTop = msgs.scrollHeight;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: "You are the Lum@T AI Assistant, built into a messaging app called Lum@T (slogan: \"I'm Closer Than You Think\"). Be friendly, helpful and concise. The app features messaging, voice/video calls, status updates, communities, and voice notes.",
        messages: [{role: 'user', content: text}]
      })
    });
    const data = await res.json();
    const reply = data.content?.map(c => c.text || '').join('') || 'Sorry, something went wrong!';
    tRow.querySelector('.ai-bub').className = 'ai-bub';
    tRow.querySelector('.ai-bub').textContent = reply;
  } catch {
    tRow.querySelector('.ai-bub').className = 'ai-bub';
    tRow.querySelector('.ai-bub').textContent = "I'm having trouble connecting. Please try again!";
  }
  msgs.scrollTop = msgs.scrollHeight;
}

function getTime() {
  return new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

// (Calls tab now loads real call history via window._loadCallLog, wired in index.html)
