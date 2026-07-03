(async function() {
try {
const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail,
         GoogleAuthProvider, OAuthProvider, signInWithPopup }
  = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
const { getFirestore, collection, doc, setDoc, getDoc, getDocs,
         addDoc, query, where, orderBy, onSnapshot, serverTimestamp,
         updateDoc, limit, arrayUnion, arrayRemove, deleteField }
  = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

const firebaseConfig = {
  apiKey: "AIzaSyApTk2n27UsGlIoNx76ZHHAE1OGKB62Qcw",
  authDomain: "lumat-8af47.firebaseapp.com",
  projectId: "lumat-8af47",
  storageBucket: "lumat-8af47.firebasestorage.app",
  messagingSenderId: "80031999903",
  appId: "1:80031999903:web:05089be8616b776ee7ffaa"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentUser = null;
let currentChatId = null;
let currentOtherUser = null;
let currentIsGroup = false;
let currentGroupMembers = [];   // [{uid,name}] for the open group chat
let currentGroupAdmins = [];    // uids with admin rights in the open group chat
let selectedGroupMembers = new Map(); // uid -> name, used while composing a new group
let newGroupReturnScreen = 'chats';   // where the New Group screen's back button goes
const nameColorHex = ['#64B5F6','#81C784','#BA68C8','#FFB74D','#4DB6AC','#E57373','#FFD54F'];
function getNameColor(uid) {
  let h=0; for(let c of uid) h=(h*31+c.charCodeAt(0))&0xffffffff;
  return nameColorHex[Math.abs(h)%nameColorHex.length];
}
let msgUnsubscribe = null;
let chatUnsubscribe = null;
const avatarColors = ['av-blue','av-green','av-purple','av-orange','av-teal','av-red','av-yellow'];

// ── Helpers ───────────────────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Safe to embed inside a single-quoted JS string that sits inside a
// double-quoted HTML attribute (e.g. onclick="fn('${jsAttr(name)}')").
function jsAttr(str) {
  str = String(str ?? '');
  str = str.replace(/&/g, '&amp;');
  str = str.replace(/\\/g, '\\\\');
  str = str.replace(/'/g, "\\'");
  str = str.replace(/"/g, '&quot;');
  return str;
}
function getInitials(name) {
  return (name||'?').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
}
function getAvatarColor(uid) {
  let h=0; for(let c of uid) h=(h*31+c.charCodeAt(0))&0xffffffff;
  return avatarColors[Math.abs(h)%avatarColors.length];
}
function getChatId(uid1, uid2) {
  return [uid1,uid2].sort().join('_');
}
function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  if (diff < 604800000) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  return d.toLocaleDateString([],{day:'2-digit',month:'2-digit'});
}

// ── Auth State ────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    // Save user profile to Firestore users collection
    await setDoc(doc(db,'users',user.uid), {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0],
      email: user.email,
      lastSeen: serverTimestamp()
    }, { merge: true });

    // Update settings UI
    const name = user.displayName || user.email.split('@')[0];
    const initials = getInitials(name);
    const color = getAvatarColor(user.uid);

    const settingsAv = document.getElementById('settingsAvatar');
    const settingsInit = document.getElementById('settingsAvatarInitials');
    const settingsNm = document.getElementById('settingsName');
    const settingsEm = document.getElementById('settingsEmail');
    if (settingsNm) settingsNm.textContent = name;
    if (settingsEm) settingsEm.textContent = user.email;
    if (settingsAv) settingsAv.className = 'settings-avatar ' + color;
    if (settingsInit) settingsInit.textContent = initials;

    // Update status screen
    const myStatusAv = document.getElementById('myStatusAvatar');
    const myStatusInit = document.getElementById('myStatusInitials');
    const myStatusNm = document.getElementById('myStatusName');
    if (myStatusAv) myStatusAv.className = 'cr-avatar ' + color;
    if (myStatusInit) myStatusInit.textContent = initials;
    if (myStatusNm) myStatusNm.textContent = name;

    // Load profile photo and bio if saved
    try {
      const userDoc = await getDoc(doc(db,'users',user.uid));
      const data    = userDoc.data() || {};
      const photoURL = data.photoURL || user.photoURL;
      const bio      = data.bio || 'Hey there! I am using Lum@T';
      if (photoURL) applyProfilePhoto(photoURL);
      const bioEl = document.getElementById('settingsBio');
      if (bioEl) bioEl.textContent = bio;
    } catch(_) {}

    // Mark any unread messages as delivered for this user
    try {
      const myChats = await getDocs(query(
        collection(db,'chats'),
        where('members','array-contains',user.uid)
      ));
      myChats.forEach(async chatDoc => {
        const msgs = await getDocs(query(
          collection(db,'chats',chatDoc.id,'messages'),
          where('status','==','sent'),
          where('senderId','!=',user.uid)
        ));
        msgs.forEach(async msgDoc => {
          await updateDoc(msgDoc.ref, { status: 'delivered' }).catch(()=>{});
        });
      });
    } catch(_) {}

    // Load data
    loadChatList();
    loadStatuses();
    loadFriendRequests();
    loadPeople();
    requestNotifPermission();
    startPresence();

    // Go to app if on auth screen
    const cur = document.querySelector('.screen.active');
    if (cur && ['splash','login','signup'].includes(cur.id)) openApp();

    window._loadStatuses = loadStatuses;
    window._loadFriendRequests = loadFriendRequests;
  } else {
    currentUser = null;
  }
});

// ── Message Tick Helper ───────────────────────────────────────────
function getTickHTML(status) {
  if (status === 'read')      return '<span class="tick tick-read">✓✓</span>';
  if (status === 'delivered') return '<span class="tick tick-delivered">✓✓</span>';
  return '<span class="tick tick-sent">✓</span>';
}

// ── Load Blocked Users ────────────────────────────────────────────
window._loadBlockedUsers = async function() {
  const list = document.getElementById('blockedList');
  if (!list || !currentUser) return;
  try {
    const snap = await getDocs(query(
      collection(db,'blocked'),
      where('blockedBy','==',currentUser.uid)
    ));
    if (snap.empty) {
      list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:36px;margin-bottom:10px;">🚫</div>
        <div style="font-size:14px;">No blocked users</div>
      </div>`;
      return;
    }
    list.innerHTML = '';
    snap.forEach(d => {
      const b = d.data();
      const color    = getAvatarColor(b.blockedUser);
      const initials = getInitials(b.blockedName||'?');
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);';
      row.innerHTML = `
        <div class="cr-avatar ${color}" style="width:46px;height:46px;font-size:16px;">${escapeHtml(initials)}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:15px;">${escapeHtml(b.blockedName||'Unknown')}</div>
          <div style="font-size:12px;color:var(--muted);">Blocked</div>
        </div>
        <button onclick="window._unblockUser('${jsAttr(d.id)}','${jsAttr(b.blockedUser)}','${jsAttr(b.blockedName)}')"
          style="padding:8px 16px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:10px;color:#EF4444;font-size:13px;font-weight:600;cursor:pointer;">
          Unblock
        </button>`;
      list.appendChild(row);
    });
  } catch(e) {
    list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);">⚠️ ${escapeHtml(e.message)}</div>`;
  }
};

window._unblockUser = async function(docId, uid, name) {
  if (!confirm(`Unblock ${name}?`)) return;
  try {
    await updateDoc(doc(db,'blocked',docId), { unblocked: true });
    const userSnap = await getDoc(doc(db,'users',currentUser.uid));
    const blockedUsers = (userSnap.data()?.blockedUsers||[]).filter(id => id !== uid);
    await setDoc(doc(db,'users',currentUser.uid), { blockedUsers }, { merge: true });
    showToast(`✅ ${name} unblocked`);
    window._loadBlockedUsers();
  } catch(e) {
    showToast('⚠️ Failed: ' + e.message);
  }
};

// ── Delete Message ────────────────────────────────────────────────
window._deleteMessage = async function(msgId, scope) {
  if (!currentChatId || !currentUser) return;
  try {
    const msgRef = doc(db,'chats',currentChatId,'messages',msgId);
    if (scope === 'all') {
      // Delete for everyone — mark as deleted
      await updateDoc(msgRef, {
        deleted: true,
        text: '',
        imageData: null,
        audioData: null
      });
    } else {
      // Delete for me — add uid to deletedFor array
      const snap = await getDoc(msgRef);
      const deletedFor = snap.data()?.deletedFor || [];
      deletedFor.push(currentUser.uid);
      await updateDoc(msgRef, { deletedFor });
    }
    showToast('🗑️ Message deleted');
  } catch(e) {
    showToast('⚠️ Failed: ' + e.message);
  }
};

// ── Clear Chat ────────────────────────────────────────────────────
window._clearChat = async function() {
  if (!currentChatId || !currentUser) return;
  try {
    const msgs = await getDocs(collection(db,'chats',currentChatId,'messages'));
    const batch = msgs.docs.map(d => updateDoc(d.ref, {
      deletedFor: [currentUser.uid, ...(d.data().deletedFor||[])]
    }));
    await Promise.all(batch);
    showToast('🗑️ Chat cleared');
  } catch(e) {
    showToast('⚠️ Failed: ' + e.message);
  }
};

// ── Block User ────────────────────────────────────────────────────
window._blockUser = async function() {
  if (!currentUser || !currentOtherUser) return;
  try {
    await setDoc(doc(db,'blocked',`${currentUser.uid}_${currentOtherUser.uid}`), {
      blockedBy: currentUser.uid,
      blockedUser: currentOtherUser.uid,
      blockedName: currentOtherUser.name,
      createdAt: serverTimestamp()
    });
    // Update user's blocked list
    await setDoc(doc(db,'users',currentUser.uid), {
      blockedUsers: [...((await getDoc(doc(db,'users',currentUser.uid))).data()?.blockedUsers||[]), currentOtherUser.uid]
    }, { merge: true });
    showToast(`🚫 ${currentOtherUser.name} has been blocked`);
    goBack();
    loadChatList();
  } catch(e) {
    showToast('⚠️ Failed: ' + e.message);
  }
};

// ── Presence / Last Seen ──────────────────────────────────────────
let presenceInterval = null;

async function startPresence() {
  if (!currentUser) return;
  // Update lastSeen to now and set online:true
  const ref = doc(db,'users',currentUser.uid);
  await setDoc(ref, { online: true, lastSeen: serverTimestamp() }, { merge: true });

  // Keep updating every 30s while app is open
  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = setInterval(async () => {
    if (currentUser) {
      await setDoc(ref, { online: true, lastSeen: serverTimestamp() }, { merge: true }).catch(()=>{});
    }
  }, 30000);

  // Mark offline when tab closes/hides
  document.addEventListener('visibilitychange', async () => {
    if (!currentUser) return;
    if (document.hidden) {
      await setDoc(ref, { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(()=>{});
    } else {
      await setDoc(ref, { online: true, lastSeen: serverTimestamp() }, { merge: true }).catch(()=>{});
    }
  });
}

function formatLastSeen(ts) {
  if (!ts?.toDate) return 'last seen recently';
  const date = ts.toDate();
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000); // seconds
  if (diff < 60)   return 'last seen just now';
  if (diff < 3600) return `last seen ${Math.floor(diff/60)} min ago`;
  if (diff < 86400) {
    const h = date.getHours().toString().padStart(2,'0');
    const m = date.getMinutes().toString().padStart(2,'0');
    return `last seen today at ${h}:${m}`;
  }
  const d = date.toLocaleDateString('en-UG', { weekday:'short', hour:'2-digit', minute:'2-digit' });
  return `last seen ${d}`;
}

// Watch a contact's online status in real time
let presenceUnsub = null;
function watchContactPresence(uid) {
  if (presenceUnsub) { presenceUnsub(); presenceUnsub = null; }
  presenceUnsub = onSnapshot(doc(db,'users',uid), snap => {
    const data = snap.data();
    if (!data) return;
    const statusEl = document.getElementById('msgStatus');
    if (!statusEl) return;
    if (data.online) {
      statusEl.textContent = 'online';
      statusEl.style.color = 'var(--green)';
    } else {
      statusEl.textContent = formatLastSeen(data.lastSeen);
      statusEl.style.color = 'var(--muted)';
    }
  });
  window._presenceUnsub = () => { if (presenceUnsub) { presenceUnsub(); presenceUnsub = null; } };
}

// ── Load Chat List ────────────────────────────────────────────────
// ── Notifications ─────────────────────────────────────────────────
let lastUnreadCounts = {};
let notifPermission = 'default';

async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { notifPermission = 'granted'; return; }
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    notifPermission = perm;
  }
}

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.4);
  } catch(_) {}
}

function showNotif(title, body) {
  if (notifPermission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // only notify when app is in background
  try {
    const n = new Notification(title, {
      body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%230D47A1"/><text y=".9em" font-size="80" x="10">💬</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%2300C853"/></svg>',
      tag: 'lumat-msg',
      renotify: true
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch(_) {}
}

function updateTitleBadge(totalUnread) {
  if (totalUnread > 0) {
    document.title = `(${totalUnread}) Lum@T`;
  } else {
    document.title = 'Lum@T';
  }
}

function loadChatList() {
  if (!currentUser) return;
  if (chatUnsubscribe) chatUnsubscribe();

  const q = query(
    collection(db,'chats'),
    where('members','array-contains', currentUser.uid),
    orderBy('lastMessageTime','desc')
  );

  chatUnsubscribe = onSnapshot(q, (snap) => {
    const list = document.getElementById('chatList');
    if (snap.empty) {
      list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:40px;margin-bottom:12px;">💬</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">No chats yet</div>
        <div style="font-size:13px;">Go to People tab to find friends</div>
      </div>`;
      updateTitleBadge(0);
      return;
    }

    let totalUnread = 0;
    list.innerHTML = '';
    snap.forEach(docSnap => {
      const chat    = docSnap.data();
      const isGroup = !!chat.isGroup;

      const otherId   = isGroup ? null : chat.members.find(m => m !== currentUser.uid);
      const otherName = isGroup ? (chat.groupName || 'Group') : (chat.memberNames?.[otherId] || 'Unknown');
      const initials  = isGroup ? '👥' : getInitials(otherName);
      const color     = isGroup ? 'av-purple' : getAvatarColor(otherId);
      const preview   = isGroup && chat.lastMessageSender ? `${chat.lastMessageSender}: ${chat.lastMessage||''}` : (chat.lastMessage || '');
      const time      = formatTime(chat.lastMessageTime);
      const unread    = chat.unread?.[currentUser.uid] || 0;
      totalUnread    += unread;

      // Detect NEW unread messages and notify
      const prevUnread = lastUnreadCounts[docSnap.id] || 0;
      if (unread > prevUnread && prevUnread !== undefined) {
        const isCurrentChat = currentChatId === docSnap.id;
        if (!isCurrentChat) {
          playNotifSound();
          showNotif(otherName, preview || '📩 New message');
        }
      }
      lastUnreadCounts[docSnap.id] = unread;

      const row = document.createElement('div');
      row.className = 'chat-row';
      row.dataset.group = isGroup ? '1' : '0';
      row.innerHTML = `
        <div class="cr-avatar ${color}">${escapeHtml(initials)}</div>
        <div class="cr-body">
          <div class="cr-top"><span class="cr-name">${escapeHtml(otherName)}</span><span class="cr-time">${escapeHtml(time)}</span></div>
          <div class="cr-bottom">
            <span class="cr-preview">${escapeHtml(preview)}</span>
            ${unread>0 ? `<span class="unread-badge">${escapeHtml(String(unread))}</span>` : ''}
          </div>
        </div>`;
      row.onclick = isGroup
        ? () => openGroupChat(docSnap.id, chat.groupName || 'Group', chat.members || [])
        : () => openRealChat(otherId, otherName, color, docSnap.id);
      list.appendChild(row);
    });

    updateTitleBadge(totalUnread);
  });
}

// ── Search Users ──────────────────────────────────────────────────
let searchTimeout;
window.searchUsers = async function(val) {
  const box = document.getElementById('searchResults');
  clearTimeout(searchTimeout);
  if (!val.trim()) { box.style.display='none'; return; }

  searchTimeout = setTimeout(async () => {
    const snap = await getDocs(collection(db,'users'));
    const results = [];
    snap.forEach(d => {
      const u = d.data();
      if (u.uid !== currentUser.uid &&
         (u.name?.toLowerCase().includes(val.toLowerCase()) ||
          u.email?.toLowerCase().includes(val.toLowerCase()))) {
        results.push(u);
      }
    });

    if (!results.length) {
      box.style.display='block';
      box.innerHTML = `<div style="padding:14px 16px;font-size:14px;color:var(--muted);">No users found</div>`;
      return;
    }

    box.style.display='block';
    box.innerHTML = '';
    for (const u of results) {
      // Check existing friendship/request status
      const reqId1 = currentUser.uid + '_' + u.uid;
      const reqId2 = u.uid + '_' + currentUser.uid;
      let status = 'none';
      try {
        const r1 = await getDoc(doc(db,'friendRequests',reqId1));
        const r2 = await getDoc(doc(db,'friendRequests',reqId2));
        if (r1.exists()) status = r1.data().status; // sent/accepted/declined
        else if (r2.exists()) status = r2.data().status === 'accepted' ? 'accepted' : 'incoming';
      } catch(_) {}

      const actionBtn =
        status === 'accepted' ? `<button onclick="window.startChatWith('${jsAttr(u.uid)}','${jsAttr(u.name)}','${jsAttr(getAvatarColor(u.uid))}')" style="padding:6px 12px;background:var(--green);border:none;border-radius:8px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">💬 Chat</button>` :
        status === 'sent'     ? `<button disabled style="padding:6px 12px;background:rgba(255,255,255,0.1);border:none;border-radius:8px;color:var(--muted);font-size:12px;">⏳ Pending</button>` :
        status === 'incoming' ? `<button onclick="window.acceptRequest('${jsAttr(u.uid)}_${jsAttr(currentUser.uid)}')" style="padding:6px 12px;background:var(--yellow);border:none;border-radius:8px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">✅ Accept</button>` :
        `<button onclick="window.sendFriendRequest('${jsAttr(u.uid)}','${jsAttr(u.name)}')" style="padding:6px 12px;background:var(--navy);border:1px solid var(--yellow);border-radius:8px;color:var(--yellow);font-weight:700;font-size:12px;cursor:pointer;">➕ Add</button>`;

      const div = document.createElement('div');
      div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border);';
      div.innerHTML = `
        <div class="cr-avatar ${getAvatarColor(u.uid)}" style="width:40px;height:40px;font-size:14px;">${escapeHtml(getInitials(u.name))}</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:14px;">${escapeHtml(u.name)}</div>
          <div style="font-size:12px;color:var(--muted);">${escapeHtml(u.email)}</div>
        </div>
        ${actionBtn}`;
      box.appendChild(div);
    }
  }, 400);
};

// ── Send Friend Request ───────────────────────────────────────────
window.sendFriendRequest = async function(otherId, otherName) {
  try {
    const reqId = currentUser.uid + '_' + otherId;
    const myName = currentUser.displayName || currentUser.email.split('@')[0];
    await setDoc(doc(db,'friendRequests',reqId), {
      from: currentUser.uid,
      fromName: myName,
      to: otherId,
      toName: otherName,
      status: 'sent',
      createdAt: serverTimestamp()
    });
    showToast('✅ Friend request sent to ' + otherName);
    friendStatusCache[otherId] = 'sent';
    if (window._loadPeople) loadPeople();
    // Re-run search to update button state
    const val = document.getElementById('chatSearch').value;
    if (val) window.searchUsers(val);
  } catch(e) { showToast('⚠️ Failed: ' + e.message); }
};

// ── Accept Friend Request ─────────────────────────────────────────
window.acceptRequest = async function(reqId) {
  try {
    const reqSnap = await getDoc(doc(db,'friendRequests',reqId));
    if (!reqSnap.exists()) { showToast('⚠️ Request not found'); return; }
    const req = reqSnap.data();
    await updateDoc(doc(db,'friendRequests',reqId), { status: 'accepted' });
    showToast('🎉 You are now friends with ' + req.fromName + '! You can now chat.');
    loadFriendRequests();
    loadChatList();
  } catch(e) { showToast('⚠️ Failed: ' + e.message); }
};

// ── Decline Friend Request ────────────────────────────────────────
window.declineRequest = async function(reqId) {
  try {
    await updateDoc(doc(db,'friendRequests',reqId), { status: 'declined' });
    showToast('Request declined');
    loadFriendRequests();
  } catch(e) { showToast('⚠️ Failed: ' + e.message); }
};

// ── Load Friend Requests (incoming) ──────────────────────────────
async function loadFriendRequests() {
  try {
    const snap = await getDocs(query(
      collection(db,'friendRequests'),
      where('to','==',currentUser.uid),
      where('status','==','sent')
    ));
    const badge = document.getElementById('requestsBadge');
    const list  = document.getElementById('requestsList');
    if (!list) return;
    if (snap.empty) {
      if (badge) badge.style.display = 'none';
      list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:36px;margin-bottom:10px;">🤝</div>
        <div style="font-size:14px;">No pending friend requests</div>
      </div>`;
      return;
    }
    if (badge) { badge.style.display='flex'; badge.textContent = snap.size; }
    list.innerHTML = '';
    snap.forEach(d => {
      const r = d.data();
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);';
      row.innerHTML = `
        <div class="cr-avatar ${getAvatarColor(r.from)}" style="width:46px;height:46px;font-size:16px;">${escapeHtml(getInitials(r.fromName))}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:15px;">${escapeHtml(r.fromName)}</div>
          <div style="font-size:12px;color:var(--muted);">wants to connect with you</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button onclick="window.acceptRequest('${jsAttr(d.id)}')" style="padding:7px 14px;background:var(--green);border:none;border-radius:8px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">✅ Accept</button>
          <button onclick="window.declineRequest('${jsAttr(d.id)}')" style="padding:7px 14px;background:rgba(255,255,255,0.08);border:none;border-radius:8px;color:var(--muted);font-size:12px;cursor:pointer;">✕ Decline</button>
        </div>`;
      list.appendChild(row);
    });
  } catch(e) { console.warn('loadFriendRequests:', e.message); }
}

// ── Start Chat With User (only if friends) ────────────────────────
window.startChatWith = async function(otherId, otherName, color) {
  document.getElementById('searchResults').style.display='none';
  document.getElementById('chatSearch').value='';

  // Verify they are friends
  const reqId1 = currentUser.uid + '_' + otherId;
  const reqId2 = otherId + '_' + currentUser.uid;
  let areFriends = false;
  try {
    const r1 = await getDoc(doc(db,'friendRequests',reqId1));
    const r2 = await getDoc(doc(db,'friendRequests',reqId2));
    if ((r1.exists() && r1.data().status==='accepted') ||
        (r2.exists() && r2.data().status==='accepted')) areFriends = true;
  } catch(_) {}

  if (!areFriends) {
    showToast('⚠️ Send a friend request first');
    return;
  }

  const chatId = getChatId(currentUser.uid, otherId);
  openRealChat(otherId, otherName, color, chatId);
};

// ── Open Real Chat Thread ─────────────────────────────────────────
async function openRealChat(otherId, otherName, color, chatId) {
  currentIsGroup = false;
  currentGroupMembers = [];
  currentChatId = chatId;
  currentOtherUser = { uid: otherId, name: otherName };

  // Update header
  const av = document.getElementById('msgAvatar');
  av.textContent = getInitials(otherName);
  av.className = 'cr-avatar ' + color;
  av.style.cssText = 'width:38px;height:38px;font-size:14px;cursor:pointer;';
  document.getElementById('msgName').textContent = otherName;
  document.getElementById('msgStatus').textContent = 'connecting...';
  document.getElementById('msgStatus').style.color = 'var(--muted)';
  document.getElementById('videoCallIcon').style.display = '';
  document.getElementById('voiceCallIcon').style.display = '';
  watchContactPresence(otherId);

  showScreen('msgscreen');
  document.getElementById('bottomTabs').style.display='none';

  const area = document.getElementById('messagesArea');
  area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">Loading messages...</div>';

  // Create chat doc if not exists
  const chatRef = doc(db,'chats',chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) {
    const myName = currentUser.displayName || currentUser.email.split('@')[0];
    await setDoc(chatRef, {
      isGroup: false,
      members: [currentUser.uid, otherId],
      memberNames: {
        [currentUser.uid]: myName,
        [otherId]: otherName
      },
      lastMessage: '',
      lastMessageTime: serverTimestamp(),
      unread: { [currentUser.uid]:0, [otherId]:0 }
    });
  }

  await markChatAsReadAndListen(chatId, `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
      <div style="font-size:36px;margin-bottom:10px;">👋</div>
      <div style="font-size:14px;">Say hello to ${otherName}!</div>
    </div>`);
}

// ── Open a Group Chat ─────────────────────────────────────────────
async function openGroupChat(chatId, groupName, memberIds) {
  currentIsGroup = true;
  currentOtherUser = null;
  currentChatId = chatId;

  const chatSnap = await getDoc(doc(db,'chats',chatId));
  const chat = chatSnap.data() || {};
  currentGroupMembers = (chat.members||memberIds||[]).map(uid => ({ uid, name: chat.memberNames?.[uid] || 'Unknown' }));
  currentGroupAdmins  = chat.admins || [];

  const av = document.getElementById('msgAvatar');
  av.textContent = '👥';
  av.className = 'cr-avatar av-purple';
  av.style.cssText = 'width:38px;height:38px;font-size:16px;cursor:pointer;';
  document.getElementById('msgName').textContent = groupName;
  document.getElementById('msgStatus').textContent = `${currentGroupMembers.length} members`;
  document.getElementById('msgStatus').style.color = 'var(--muted)';
  // Group calling isn't supported yet — hide 1:1 call buttons to avoid confusion
  document.getElementById('videoCallIcon').style.display = 'none';
  document.getElementById('voiceCallIcon').style.display = 'none';

  showScreen('msgscreen');
  document.getElementById('bottomTabs').style.display='none';

  const area = document.getElementById('messagesArea');
  area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">Loading messages...</div>';

  await markChatAsReadAndListen(chatId, `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
      <div style="font-size:36px;margin-bottom:10px;">👋</div>
      <div style="font-size:14px;">Say hello to the group!</div>
    </div>`);
}

function openGroupInfoIfGroup() {
  if (!currentIsGroup || !currentChatId) return;
  const iAmAdmin = currentGroupAdmins.includes(currentUser.uid);
  document.getElementById('groupInfoName').textContent = document.getElementById('msgName').textContent;
  document.getElementById('groupInfoMeta').textContent = `Group · ${currentGroupMembers.length} members`;
  const list = document.getElementById('groupMembersList');
  list.innerHTML = '';
  currentGroupMembers.forEach(m => {
    const isMe      = m.uid === currentUser.uid;
    const isAdmin   = currentGroupAdmins.includes(m.uid);
    const canRemove = iAmAdmin && !isMe;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border);';
    row.innerHTML = `
      <div class="cr-avatar ${getAvatarColor(m.uid)}" style="width:42px;height:42px;font-size:15px;">${escapeHtml(getInitials(m.name))}</div>
      <div style="flex:1;">
        <div style="font-size:14px;font-weight:600;">${escapeHtml(m.name)}${isMe ? ' (You)' : ''}</div>
        ${isAdmin ? `<div style="font-size:11px;color:var(--yellow);">👑 Admin</div>` : ''}
      </div>
      ${canRemove ? `<button onclick="removeGroupMember('${jsAttr(m.uid)}','${jsAttr(m.name)}')" style="padding:6px 12px;background:rgba(255,0,0,0.12);border:none;border-radius:8px;color:#ff6b6b;font-size:12px;cursor:pointer;">Remove</button>` : ''}`;
    list.appendChild(row);
  });
  showScreen('groupinfo');
}

// ── Leave a group ────────────────────────────────────────────────
window.leaveGroupChat = async function() {
  if (!currentIsGroup || !currentChatId) return;
  if (!confirm('Leave this group? You will stop receiving its messages.')) return;
  try {
    const chatRef = doc(db,'chats',currentChatId);
    await updateDoc(chatRef, {
      members: arrayRemove(currentUser.uid),
      admins: arrayRemove(currentUser.uid),
      [`memberNames.${currentUser.uid}`]: deleteField(),
      [`unread.${currentUser.uid}`]: deleteField()
    });
    showToast('You left the group');
    showScreen('chats');
    document.getElementById('bottomTabs').style.display='flex';
  } catch(e) {
    showToast('⚠️ Failed to leave group: ' + e.message);
  }
};

// ── Remove a member (admins only) ───────────────────────────────
window.removeGroupMember = async function(uid, name) {
  if (!currentGroupAdmins.includes(currentUser.uid)) return;
  if (!confirm(`Remove ${name} from the group?`)) return;
  try {
    const chatRef = doc(db,'chats',currentChatId);
    await updateDoc(chatRef, {
      members: arrayRemove(uid),
      admins: arrayRemove(uid),
      [`memberNames.${uid}`]: deleteField(),
      [`unread.${uid}`]: deleteField()
    });
    currentGroupMembers = currentGroupMembers.filter(m => m.uid !== uid);
    currentGroupAdmins  = currentGroupAdmins.filter(a => a !== uid);
    showToast(`Removed ${name}`);
    openGroupInfoIfGroup();
  } catch(e) {
    showToast('⚠️ Failed to remove member: ' + e.message);
  }
};

// ── Add members to an existing group ────────────────────────────
window.openAddGroupMembers = async function() {
  if (!currentIsGroup || !currentChatId) return;
  newGroupReturnScreen = 'groupinfo';
  selectedGroupMembers = new Map();
  updateGroupSelCount();
  if (!allPeopleCache.length) await loadPeople();

  const list = document.getElementById('newGroupList');
  const existingIds = new Set(currentGroupMembers.map(m => m.uid));
  const friends = allPeopleCache.filter(u => friendStatusCache[u.uid] === 'accepted' && !existingIds.has(u.uid));

  document.getElementById('newGroupName').style.display = 'none';
  document.querySelector('#newgroup .ch-name').textContent = 'Add members';

  if (!friends.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
      <div style="font-size:32px;margin-bottom:10px;">🙌</div>
      <div style="font-size:14px;">All your friends are already in this group.</div>
    </div>`;
  } else {
    list.innerHTML = '';
    friends.forEach(u => {
      const color    = getAvatarColor(u.uid);
      const initials = getInitials(u.name||'?');
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;';
      row.innerHTML = `
        <div class="cr-avatar ${color}" style="width:44px;height:44px;font-size:15px;">${escapeHtml(initials)}</div>
        <div style="flex:1;"><div style="font-weight:600;font-size:14px;">${escapeHtml(u.name)}</div></div>
        <input type="checkbox" id="grpchk_${escapeHtml(u.uid)}" style="width:20px;height:20px;accent-color:var(--yellow);">`;
      row.onclick = (e) => { if (e.target.tagName !== 'INPUT') document.getElementById(`grpchk_${u.uid}`).click(); };
      row.querySelector('input').onclick = (e) => { e.stopPropagation(); toggleGroupMember(u.uid, u.name); };
      list.appendChild(row);
    });
  }

  const createBtn = document.querySelector('#newgroup .splash-cta');
  createBtn.textContent = 'Add to group';
  createBtn.onclick = confirmAddGroupMembers;
  showScreen('newgroup');
};

window.confirmAddGroupMembers = async function() {
  if (!selectedGroupMembers.size) { showToast('⚠️ Select at least one friend'); return; }
  try {
    const chatRef = doc(db,'chats',currentChatId);
    const updates = { members: arrayUnion(...selectedGroupMembers.keys()) };
    selectedGroupMembers.forEach((name, uid) => {
      updates[`memberNames.${uid}`] = name;
      updates[`unread.${uid}`] = 0;
    });
    await updateDoc(chatRef, updates);
    showToast(`✅ Added ${selectedGroupMembers.size} member(s)`);

    // Reset the New Group screen back to its normal "create" mode for next time
    document.getElementById('newGroupName').style.display = '';
    document.querySelector('#newgroup .ch-name').textContent = 'New group';
    const createBtn = document.querySelector('#newgroup .splash-cta');
    createBtn.textContent = 'Create group';
    createBtn.onclick = createGroupChat;

    openGroupChat(currentChatId, document.getElementById('msgName').textContent, []);
  } catch(e) {
    showToast('⚠️ Failed to add members: ' + e.message);
  }
};

// ── Mark chat as read, then attach the real-time message listener ──
// Shared by both 1:1 chats and group chats since both use the same
// `chats/{id}/messages` subcollection shape.
async function markChatAsReadAndListen(chatId, emptyStateHTML) {
  const chatRef = doc(db,'chats',chatId);
  await updateDoc(chatRef, { [`unread.${currentUser.uid}`]: 0 }).catch(()=>{});
  try {
    const unreadMsgs = await getDocs(query(
      collection(db,'chats',chatId,'messages'),
      where('senderId','!=',currentUser.uid),
      where('status','in',['sent','delivered'])
    ));
    unreadMsgs.forEach(async d => {
      await updateDoc(d.ref, { status: 'read' }).catch(()=>{});
    });
  } catch(_) {}

  attachMessageListener(chatId, emptyStateHTML);
}

function attachMessageListener(chatId, emptyStateHTML) {
  const area = document.getElementById('messagesArea');
  if (msgUnsubscribe) msgUnsubscribe();
  const msgsRef = collection(db,'chats',chatId,'messages');
  const msgsQ = query(msgsRef, orderBy('time','asc'));
  let prevMsgCount = 0;

  msgUnsubscribe = onSnapshot(msgsQ, (snap) => {
    const newCount = snap.size;
    if (newCount > prevMsgCount && prevMsgCount > 0) {
      const lastMsg = snap.docs[snap.docs.length-1]?.data();
      if (lastMsg && lastMsg.senderId !== currentUser.uid) playNotifSound();
    }
    prevMsgCount = newCount;
    area.innerHTML = '';
    if (snap.empty) {
      area.innerHTML = emptyStateHTML;
      return;
    }
    let lastDate = '';
    snap.forEach(m => {
      const msg = m.data();
      // Skip messages deleted for this user
      if (msg.deletedFor?.includes(currentUser.uid)) return;
      const d = msg.time?.toDate ? msg.time.toDate() : new Date();
      const dateStr = d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
      if (dateStr !== lastDate) {
        lastDate = dateStr;
        const div = document.createElement('div');
        div.className = 'date-divider';
        div.textContent = dateStr;
        area.appendChild(div);
      }
      const timeStr = d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const isMine  = msg.senderId === currentUser.uid;
      const msgId   = m.id;
      const row     = document.createElement('div');
      row.className = 'bubble-row' + (isMine?' me':'');

      // Long press to delete (mobile)
      let pressTimer;
      row.addEventListener('touchstart', () => { pressTimer = setTimeout(() => showDeleteSheet(msgId, isMine), 600); }, {passive:true});
      row.addEventListener('touchend',   () => clearTimeout(pressTimer));
      row.addEventListener('touchmove',  () => clearTimeout(pressTimer), {passive:true});
      // Right click (desktop)
      row.addEventListener('contextmenu', e => { e.preventDefault(); showDeleteSheet(msgId, isMine); });

      // In group chats, label received messages with the sender's name
      const senderLabel = (currentIsGroup && !isMine)
        ? `<div style="font-size:12px;font-weight:700;color:${getNameColor(msg.senderId||'')};margin-bottom:2px;">${escapeHtml(msg.senderName||'Unknown')}</div>`
        : '';

      if (msg.deleted) {
        row.innerHTML = `<div class="bubble ${isMine?'sent':'recv'}" style="opacity:0.45;font-style:italic;font-size:13px;display:flex;align-items:center;gap:6px;">🚫 This message was deleted<div class="bubble-time">${timeStr}</div></div>`;
      } else if (msg.type === 'image' && msg.imageData) {
        const tickHTML = isMine ? getTickHTML(msg.status) : '';
        row.innerHTML = `<div class="bubble ${isMine?'sent':'recv'}" style="padding:4px;">
          ${senderLabel ? `<div style="padding:4px 6px 0;">${senderLabel}</div>` : ''}
          <img src="${msg.imageData}" style="max-width:220px;max-height:300px;border-radius:10px;display:block;">
          <div class="bubble-time" style="padding:0 6px 4px;">${timeStr} ${tickHTML}</div>
        </div>`;
      } else if (msg.type === 'audio' && (msg.audioData || msg.audioUrl)) {
        const audioSrc = msg.audioData || msg.audioUrl;
        // Real audio voice note bubble
        const vnId = 'vn_' + m.id;
        const dur = msg.duration || 0;
        const durStr = `${Math.floor(dur/60)}:${(dur%60).toString().padStart(2,'0')}`;
        const stroke = isMine ? '#25D366' : '#0D47A1';
        row.innerHTML = `
          <div class="voice-bubble ${isMine?'sent-voice':''}" onclick="playRealAudio('${jsAttr(audioSrc)}','${jsAttr(vnId)}',${Number(dur)||0})">
            ${senderLabel}
            <div class="play-btn" id="${vnId}-play">▶</div>
            <div class="wave-wrap">
              <svg class="wave" viewBox="0 0 120 28">
                <polyline points="0,14 12,4 20,22 30,8 40,20 50,6 60,18 70,8 80,22 90,6 100,16 110,10 120,14"
                  fill="none" stroke="${stroke}" stroke-width="2"/>
              </svg>
              <div class="wave-progress"><div class="wave-progress-fill" id="${vnId}-prog"></div></div>
            </div>
            <div class="voice-meta"><span class="voice-dur" id="${vnId}-dur">${durStr}</span></div>
          </div>`;
      } else {
        row.innerHTML = `<div class="bubble ${isMine?'sent':'recv'}">${senderLabel}${escapeHtml(msg.text||'')}<div class="bubble-time">${timeStr} ${isMine ? getTickHTML(msg.status) : ''}</div></div>`;
      }
      area.appendChild(row);
    });
    area.scrollTop = area.scrollHeight;
  });
}

// ── Send Real Message ─────────────────────────────────────────────
window.sendMessageBtn = async function() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || !currentChatId || !currentUser) return;
  input.value = '';
  toggleSendBtn();

  try {
    const chatRef = doc(db,'chats',currentChatId);
    const msgsRef = collection(db,'chats',currentChatId,'messages');
    const myName  = currentUser.displayName || currentUser.email.split('@')[0];

    // Add message with sent status
    await addDoc(msgsRef, {
      text,
      senderId: currentUser.uid,
      senderName: myName,
      time: serverTimestamp(),
      status: 'sent'
    });

    // Update chat preview & unread count for every other member
    // (works the same for a 1:1 chat or a group, since both store `members`)
    const chatSnap = await getDoc(chatRef);
    const chatData = chatSnap.data() || {};
    const otherMembers = (chatData.members || []).filter(uid => uid !== currentUser.uid);
    const unreadUpdates = {};
    otherMembers.forEach(uid => {
      unreadUpdates[`unread.${uid}`] = (chatData.unread?.[uid] || 0) + 1;
    });
    await updateDoc(chatRef, {
      lastMessage: text,
      lastMessageSender: currentIsGroup ? myName : null,
      lastMessageTime: serverTimestamp(),
      ...unreadUpdates
    });
  } catch(e) {
    showToast('⚠️ Message failed: ' + e.message);
    input.value = text; // restore text so user doesn't lose it
    toggleSendBtn();
  }
};

// Override sendMessage for Enter key
window.sendMessage = function(e) {
  if (e.key === 'Enter') window.sendMessageBtn();
};
window._realSend = () => window.sendMessageBtn();

// ── Sign Up ───────────────────────────────────────────────────────
window._doSignup = async function() {
  const name   = document.getElementById('signupName').value.trim();
  const phone  = document.getElementById('signupPhone').value.trim();
  const email  = document.getElementById('signupEmail').value.trim();
  const pass   = document.getElementById('signupPass').value;
  const pass2  = document.getElementById('signupPass2').value;
  const agreed = document.getElementById('agreeTerms').checked;
  const err    = document.getElementById('signupError');
  const btn    = document.querySelector('#signup .btn-primary');

  if (!name)  { err.textContent='⚠️ Please enter your full name'; return; }
  if (!phone) { err.textContent='⚠️ Please enter your phone number'; return; }
  if (!email||!email.includes('@')) { err.textContent='⚠️ Please enter a valid email'; return; }
  if (pass.length<8) { err.textContent='⚠️ Password must be at least 8 characters'; return; }
  if (pass!==pass2)  { err.textContent='⚠️ Passwords do not match'; return; }
  if (!agreed) { err.textContent='⚠️ Please agree to the Terms of Service'; return; }

  err.textContent=''; btn.textContent='Creating account...'; btn.disabled=true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    // Save profile — don't let this block login if Firestore rules are strict
    const countryCode = document.getElementById('signupCountry').value;
    const phoneDigits = (countryCode + phone).replace(/\D/g,'');
    try {
      await setDoc(doc(db,'users',cred.user.uid), {
        uid: cred.user.uid,
        name,
        email,
        phone: phoneDigits,
        lastSeen: serverTimestamp()
      }, { merge: true });
    } catch(fsErr) {
      console.warn('Profile save failed:', fsErr.message);
    }

    showToast('🎉 Account created! Welcome to Lum@T');
    btn.textContent='Create Account'; btn.disabled=false;
    openApp();
  } catch(e) {
    btn.textContent='Create Account'; btn.disabled=false;
    // Show exact Firebase error so we can diagnose
    alert('SIGNUP ERROR\nCode: ' + (e.code||'none') + '\nMsg: ' + e.message);
    err.textContent='⚠️ ' + (e.code||e.message);
  }
};

// ── Login ─────────────────────────────────────────────────────────

window._doLogin = async function() {
  const input = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const err   = document.getElementById('loginError');
  const btn   = document.querySelector('#login .btn-primary');

  if (!input) { err.textContent='⚠️ Please enter your phone number or email'; return; }
  if (!pass)  { err.textContent='⚠️ Please enter your password'; return; }

  err.textContent=''; btn.textContent='Signing in...'; btn.disabled=true;

  const resetBtn = () => { btn.textContent='Sign In'; btn.disabled=false; };

  try {
    if (input.includes('@')) {
      // ── Email login ──────────────────────────────────────────────
      await signInWithEmailAndPassword(auth, input, pass);
      showToast('✅ Welcome back!');
      resetBtn();
      openApp();
    } else {
      // ── Phone login: look up email in Firestore, then sign in ────
      const digits = input.replace(/\D/g,'');
      // Build candidates: raw digits, with-leading-zero stripped variants
      const candidates = new Set([digits]);
      const local = digits.startsWith('0') ? digits.slice(1) : digits;
      ['254','1','44','234','255','256','27'].forEach(cc => {
        candidates.add(cc + local);
        candidates.add(cc + digits);
      });

      let foundEmail = null;
      for (const candidate of candidates) {
        try {
          const snap = await getDocs(
            query(collection(db,'users'), where('phone','==',candidate), limit(1))
          );
          if (!snap.empty) { foundEmail = snap.docs[0].data().email; break; }
        } catch(_) { /* try next candidate */ }
      }

      if (!foundEmail) {
        resetBtn();
        err.textContent='⚠️ No account found with that phone number. Try logging in with your email instead.';
        return;
      }

      await signInWithEmailAndPassword(auth, foundEmail, pass);
      showToast('✅ Welcome back!');
      resetBtn();
      openApp();
    }
  } catch(e) {
    resetBtn();
    alert('LOGIN ERROR\nCode: ' + (e.code||'none') + '\nMsg: ' + e.message);
    if (['auth/user-not-found','auth/wrong-password','auth/invalid-credential'].includes(e.code))
      err.textContent='⚠️ Incorrect password.';
    else if (e.code==='auth/too-many-requests')
      err.textContent='⚠️ Too many attempts. Try again later.';
    else if (e.code==='auth/network-request-failed')
      err.textContent='⚠️ No internet connection. Please check your network.';
    else if (e.code==='auth/invalid-email')
      err.textContent='⚠️ Please enter a valid email address.';
    else err.textContent='⚠️ '+e.message;
  }
};

// ── Google Sign-In ───────────────────────────────────────────────
window._doGoogleSignIn = async function() {
  const err = document.getElementById('loginError');
  err.textContent = '';
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const user = cred.user;

    // Upsert profile — merge so we don't clobber fields set on prior logins
    try {
      await setDoc(doc(db,'users',user.uid), {
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        photoURL: user.photoURL || null,
        lastSeen: serverTimestamp()
      }, { merge: true });
    } catch(fsErr) {
      console.warn('Profile save failed:', fsErr.message);
    }

    showToast('✅ Welcome, ' + (user.displayName || 'friend') + '!');
    openApp();
  } catch(e) {
    if (e.code === 'auth/popup-closed-by-user') return; // user cancelled, no error needed
    if (e.code === 'auth/unauthorized-domain') {
      err.textContent = '⚠️ This domain is not authorized for Google sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.';
    } else if (e.code === 'auth/operation-not-allowed') {
      err.textContent = '⚠️ Google sign-in is not enabled for this project yet. Enable it in Firebase Console → Authentication → Sign-in method.';
    } else {
      err.textContent = '⚠️ ' + e.message;
    }
  }
};

// ── Apple Sign-In ────────────────────────────────────────────────
window._doAppleSignIn = async function() {
  const err = document.getElementById('loginError');
  err.textContent = '';
  try {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    const cred = await signInWithPopup(auth, provider);
    const user = cred.user;

    try {
      await setDoc(doc(db,'users',user.uid), {
        uid: user.uid,
        name: user.displayName || (user.email ? user.email.split('@')[0] : 'Apple User'),
        email: user.email || '',
        photoURL: user.photoURL || null,
        lastSeen: serverTimestamp()
      }, { merge: true });
    } catch(fsErr) {
      console.warn('Profile save failed:', fsErr.message);
    }

    showToast('✅ Welcome, ' + (user.displayName || 'friend') + '!');
    openApp();
  } catch(e) {
    if (e.code === 'auth/popup-closed-by-user') return;
    if (e.code === 'auth/unauthorized-domain') {
      err.textContent = '⚠️ This domain is not authorized for Apple sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.';
    } else if (e.code === 'auth/operation-not-allowed') {
      err.textContent = '⚠️ Apple sign-in is not enabled for this project yet. Requires an Apple Developer account + Services ID configured in Firebase Console → Authentication → Sign-in method.';
    } else {
      err.textContent = '⚠️ ' + e.message;
    }
  }
};

// ── Forgot Password ───────────────────────────────────────────────
window._doForgotPassword = async function() {
  const input = document.getElementById('loginEmail').value.trim();
  const errEl = document.getElementById('loginError');
  if (!input) { errEl.textContent='⚠️ Enter your phone number or email above first'; return; }
  try {
    let email = input;
    if (!input.includes('@')) {
      // Phone number — look up email
      const digits = input.replace(/\D/g,'');
      const local = digits.startsWith('0') ? digits.slice(1) : digits;
      const candidates = [digits, ...['254','1','44','234','255','256','27'].map(cc => cc+local)];
      let found = null;
      for (const c of candidates) {
        try {
          const snap = await getDocs(query(collection(db,'users'), where('phone','==',c), limit(1)));
          if (!snap.empty) { found = snap.docs[0].data().email; break; }
        } catch(_) {}
      }
      if (!found) { errEl.textContent='⚠️ No account found with that phone number.'; return; }
      email = found;
    }
    await sendPasswordResetEmail(auth, email);
    showToast('📧 Reset link sent to '+email);
  } catch(e) { showToast('⚠️ Could not send reset email: '+e.message); }
};

// ── Real Audio Playback ───────────────────────────────────────────
const audioPlayers = {};
window.playRealAudio = function(url, vnId, totalSecs) {
  // Stop any currently playing
  Object.keys(audioPlayers).forEach(k => {
    if (k !== vnId) {
      audioPlayers[k].pause();
      audioPlayers[k].currentTime = 0;
      const pb = document.getElementById(k+'-play');
      const pr = document.getElementById(k+'-prog');
      if (pb) pb.textContent = '▶';
      if (pr) pr.style.width = '0%';
      delete audioPlayers[k];
    }
  });

  const playBtn = document.getElementById(vnId+'-play');
  const prog    = document.getElementById(vnId+'-prog');
  const durEl   = document.getElementById(vnId+'-dur');

  if (audioPlayers[vnId]) {
    audioPlayers[vnId].pause();
    audioPlayers[vnId].currentTime = 0;
    playBtn.textContent = '▶';
    prog.style.width = '0%';
    if (durEl) durEl.textContent = formatDur(totalSecs);
    delete audioPlayers[vnId];
    return;
  }

  const audio = new Audio(url);
  audioPlayers[vnId] = audio;
  playBtn.textContent = '⏸';

  audio.ontimeupdate = () => {
    const pct = (audio.currentTime / (audio.duration||totalSecs)) * 100;
    if (prog) prog.style.width = pct + '%';
    const remaining = Math.max(0, (audio.duration||totalSecs) - audio.currentTime);
    if (durEl) durEl.textContent = formatDur(Math.ceil(remaining));
  };
  audio.onended = () => {
    playBtn.textContent = '▶';
    if (prog) prog.style.width = '0%';
    if (durEl) durEl.textContent = formatDur(totalSecs);
    delete audioPlayers[vnId];
  };
  audio.onerror = () => { showToast('⚠️ Could not play audio'); delete audioPlayers[vnId]; };
  audio.play().catch(() => showToast('⚠️ Could not play audio'));
};

// ── WebRTC Real Calls ─────────────────────────────────────────────
let pc = null; // RTCPeerConnection
let localStream = null;
let callDocId = null;
let callUnsub = null;
let iceUnsub = null;          // unsub for the ICE-candidate subcollection listener
let pendingCallUnsub = null;  // unsub for the callee's "did the caller cancel?" listener
let callTimeoutTimer = null;  // no-answer timeout for outgoing calls
let ringtoneInterval = null;
let isMuted = false;
let isCameraOff = false;

// NOTE ON RELIABILITY: only public STUN servers are configured below.
// STUN alone can't traverse symmetric NATs / many corporate & mobile networks —
// a real deployment needs a TURN server (e.g. self-hosted coturn, or a paid
// provider like Twilio Network Traversal) with credentials added here for
// calls to reliably connect off of friendly home wifi.
const iceServers = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]};

async function getCallDB() {
  const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  return getFirestore();
}

// ── Ringtone (Web Audio, same technique as playNotifSound) ─────────
function startRingtone() {
  stopRingtone();
  const ring = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(760, ctx.currentTime);
      o.frequency.setValueAtTime(920, ctx.currentTime + 0.15);
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.5);
    } catch(_) {}
  };
  ring();
  ringtoneInterval = setInterval(ring, 1800);
}
function stopRingtone() {
  if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }
}

// ── Real mute / camera toggles (wired to the actual MediaStreamTracks) ──
window.toggleMute = function(el, btnClass) {
  isMuted = !isMuted;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  const cls = btnClass || 'vc-ctrl-btn';
  el.querySelector('.' + cls)?.classList.toggle('active-ctrl', isMuted);
  el.querySelector('.' + cls)?.classList.toggle('off', isMuted);
};
window.toggleCamera = function(el) {
  isCameraOff = !isCameraOff;
  if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
  const lv = document.getElementById('localVideo');
  if (lv) lv.style.visibility = isCameraOff ? 'hidden' : 'visible';
  el.querySelector('.vc-ctrl-btn')?.classList.toggle('off', isCameraOff);
};

// Start outgoing call
window.startRealCall = async function(type) {
  if (!currentOtherUser) { showToast('⚠️ Open a chat first'); return; }
  const db2 = await getCallDB();
  const { collection, doc, setDoc, onSnapshot, updateDoc, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

  try {
    const constraints = type === 'video'
      ? { audio: true, video: { facingMode: 'user' } }
      : { audio: true, video: false };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch(e) {
    showToast('⚠️ Camera/mic permission denied'); return;
  }
  isMuted = false; isCameraOff = false;

  pc = new RTCPeerConnection(iceServers);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  // Show local video preview
  if (type === 'video') {
    const lv = document.getElementById('localVideo');
    if (lv) { lv.srcObject = localStream; lv.play().catch(()=>{}); }
  }

  // Create call doc
  const callRef = doc(collection(db2, 'calls'));
  callDocId = callRef.id;

  pc.onicecandidate = async e => {
    if (e.candidate) {
      const { collection: col, addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await addDoc(col(db2,'calls',callDocId,'callerCandidates'), e.candidate.toJSON());
    }
  };

  pc.ontrack = e => {
    // Route the whole remote stream (audio + video tracks together) to the
    // right element so voice is audible on both voice and video calls.
    const rv = document.getElementById('remoteVideo');
    const ra = document.getElementById('remoteAudio');
    if (type === 'video' && rv) { rv.srcObject = e.streams[0]; rv.play().catch(()=>{}); }
    else if (ra) { ra.srcObject = e.streams[0]; ra.play().catch(()=>{}); }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const myName = currentUser.displayName || currentUser.email.split('@')[0];
  await setDoc(callRef, {
    callerId: currentUser.uid,
    callerName: myName,
    calleeId: currentOtherUser.uid,
    calleeName: currentOtherUser.name,
    type,
    offer: { sdp: offer.sdp, type: offer.type },
    status: 'calling',
    createdAt: serverTimestamp()
  });

  // Show outgoing call UI
  const initials = getInitials(currentOtherUser.name);
  const color = getAvatarColor(currentOtherUser.uid);
  if (type === 'video') {
    startVideoCallFor(currentOtherUser.name, initials, color);
  } else {
    startVoiceCallFor(currentOtherUser.name, initials, color);
  }

  // No-answer timeout: stop ringing the other side and clean up if nobody picks up
  clearTimeout(callTimeoutTimer);
  callTimeoutTimer = setTimeout(async () => {
    if (callDocId) {
      const { doc: doc2, updateDoc: upd2 } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await upd2(doc2(db2,'calls',callDocId), { status: 'missed' }).catch(()=>{});
      showToast('📵 No answer');
      endCall();
    }
  }, 30000);

  // Listen for answer / hangup / decline
  callUnsub = onSnapshot(callRef, async snap => {
    const data = snap.data();
    if (data?.answer && pc.signalingState !== 'stable') {
      clearTimeout(callTimeoutTimer);
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
    if (data?.status === 'declined' || data?.status === 'ended') {
      const wasDeclined = data.status === 'declined';
      endCall(); showToast(wasDeclined ? '📵 Call declined' : '📵 Call ended');
    }
  });

  // Listen for callee ICE candidates
  const { collection: col2, onSnapshot: onSnap2 } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  iceUnsub = onSnap2(col2(db2,'calls',callDocId,'calleeCandidates'), snap => {
    snap.docChanges().forEach(async change => {
      if (change.type === 'added') {
        await pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(()=>{});
      }
    });
  });
};

// Answer incoming call
window.answerRealCall = async function() {
  stopRingtone();
  if (pendingCallUnsub) { pendingCallUnsub(); pendingCallUnsub = null; }
  if (!window._pendingCallDoc) { acceptCall(); return; }
  const db2 = await getCallDB();
  const { doc, updateDoc, collection, onSnapshot: onSnap3, addDoc } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

  const callData = window._pendingCallDoc.data;
  const callId   = window._pendingCallDoc.id;

  try {
    const constraints = callData.type === 'video'
      ? { audio: true, video: { facingMode: 'user' } }
      : { audio: true, video: false };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch(e) { showToast('⚠️ Mic/camera permission denied'); return; }
  isMuted = false; isCameraOff = false;

  pc = new RTCPeerConnection(iceServers);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  if (callData.type === 'video') {
    const lv = document.getElementById('localVideo');
    if (lv) { lv.srcObject = localStream; lv.play().catch(()=>{}); }
  }

  pc.ontrack = e => {
    const rv = document.getElementById('remoteVideo');
    const ra = document.getElementById('remoteAudio');
    if (callData.type === 'video' && rv) { rv.srcObject = e.streams[0]; rv.play().catch(()=>{}); }
    else if (ra) { ra.srcObject = e.streams[0]; ra.play().catch(()=>{}); }
  };

  pc.onicecandidate = async e => {
    if (e.candidate) await addDoc(collection(db2,'calls',callId,'calleeCandidates'), e.candidate.toJSON());
  };

  const callRef = doc(db2,'calls',callId);
  await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await updateDoc(callRef, { answer: { sdp: answer.sdp, type: answer.type }, status: 'active' });

  // Add caller ICE candidates
  iceUnsub = onSnap3(collection(db2,'calls',callId,'callerCandidates'), snap => {
    snap.docChanges().forEach(async change => {
      if (change.type === 'added') await pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(()=>{});
    });
  });

  // Watch for the caller hanging up mid-call too
  callUnsub = onSnapshot(callRef, snap => {
    const data = snap.data();
    if (data?.status === 'ended') { endCall(); showToast('📵 Call ended'); }
  });

  document.getElementById('incomingCall').classList.remove('active');
  const initials = getInitials(callData.callerName);
  if (callData.type === 'video') startVideoCallFor(callData.callerName, initials, 'av-blue');
  else startVoiceCallFor(callData.callerName, initials, 'av-blue');
  callDocId = callId;
};

// End call
window.endCall = async function() {
  clearTimeout(callTimeoutTimer); callTimeoutTimer = null;
  stopRingtone();
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t=>t.stop()); localStream = null; }
  if (callUnsub) { callUnsub(); callUnsub = null; }
  if (iceUnsub) { iceUnsub(); iceUnsub = null; }
  if (pendingCallUnsub) { pendingCallUnsub(); pendingCallUnsub = null; }
  if (callDocId) {
    const db2 = await getCallDB();
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await updateDoc(doc(db2,'calls',callDocId), { status: 'ended' }).catch(()=>{});
    callDocId = null;
  }
  // Hide call UIs and release the video elements
  ['activeCall','videoCall','incomingCall'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  ['localVideo','remoteVideo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.srcObject = null; el.style.display = 'none'; el.style.visibility = 'visible'; }
  });
  const ra = document.getElementById('remoteAudio');
  if (ra) ra.srcObject = null;
};

// Listen for incoming calls when logged in
function listenForIncomingCalls(userId) {
  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js").then(({ getFirestore, collection, doc, query, where, onSnapshot }) => {
    const db2 = getFirestore();
    const q = query(collection(db2,'calls'), where('calleeId','==',userId), where('status','==','calling'));
    onSnapshot(q, snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const callId = change.doc.id;
          window._pendingCallDoc = { id: callId, data };
          const initials = getInitials(data.callerName);
          showIncomingCall(data.callerName, initials, 'av-blue', data.type);
          startRingtone();

          // If the caller cancels before we answer, auto-dismiss the ringing screen
          if (pendingCallUnsub) pendingCallUnsub();
          pendingCallUnsub = onSnapshot(doc(db2,'calls',callId), s => {
            const d = s.data();
            if (d?.status === 'ended' && window._pendingCallDoc?.id === callId) {
              stopRingtone();
              document.getElementById('incomingCall').classList.remove('active');
              showToast('📵 Missed call from ' + data.callerName);
              window._pendingCallDoc = null;
            }
          });
        }
      });
    });
  });
}

// Hook into auth state to start listening for calls
onAuthStateChanged(auth, user => {
  if (user) listenForIncomingCalls(user.uid);
});

// Override end call buttons to use real endCall
window.endActiveCall  = () => endCall();
window.endVideoCall   = () => endCall();
window.declineCall    = async () => {
  stopRingtone();
  if (pendingCallUnsub) { pendingCallUnsub(); pendingCallUnsub = null; }
  if (window._pendingCallDoc) {
    const db2 = await getCallDB();
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await updateDoc(doc(db2,'calls',window._pendingCallDoc.id), { status: 'declined' }).catch(()=>{});
    window._pendingCallDoc = null;
  }
  document.getElementById('incomingCall').classList.remove('active');
};
window.acceptCall = () => window.answerRealCall();

// ── Call Log (Calls tab) ─────────────────────────────────────────
window._loadCallLog = async function() {
  if (!currentUser) return;
  const list = document.getElementById('callLogList');
  if (!list) return;
  list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);"><div style="font-size:28px;">⏳</div><div style="font-size:14px;margin-top:8px;">Loading calls...</div></div>`;
  try {
    const db2 = await getCallDB();
    const { collection: col2, query: q2, where: w2, orderBy: ob2, limit: lim2, getDocs: gd2 } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    const [outSnap, inSnap] = await Promise.all([
      gd2(q2(col2(db2,'calls'), w2('callerId','==',currentUser.uid), ob2('createdAt','desc'), lim2(30))),
      gd2(q2(col2(db2,'calls'), w2('calleeId','==',currentUser.uid), ob2('createdAt','desc'), lim2(30)))
    ]);

    const calls = [];
    outSnap.forEach(d => calls.push({ id: d.id, ...d.data(), direction: 'outgoing' }));
    inSnap.forEach(d => calls.push({ id: d.id, ...d.data(), direction: 'incoming' }));
    calls.sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));

    if (!calls.length) {
      list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:36px;margin-bottom:10px;">📞</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">No recent calls</div>
        <div style="font-size:13px;">Your call history will appear here</div>
      </div>`;
      return;
    }

    list.innerHTML = '';
    calls.slice(0,50).forEach(c => {
      const isOutgoing = c.direction === 'outgoing';
      const otherName  = isOutgoing ? (c.calleeName||'Unknown') : (c.callerName||'Unknown');
      const otherUid   = isOutgoing ? c.calleeId : c.callerId;
      const color      = getAvatarColor(otherUid||'?');
      const initials   = getInitials(otherName);
      const isMissed   = !isOutgoing && (c.status === 'missed' || c.status === 'declined');
      const dirIcon    = isOutgoing ? '↗' : '↙';
      const dirColor   = isMissed ? 'var(--red)' : 'var(--muted)';
      const typeIcon   = c.type === 'video' ? '📹' : '📞';
      const timeStr    = c.createdAt?.toDate ? formatTime(c.createdAt) : '';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;';
      row.innerHTML = `
        <div class="cr-avatar ${color}" style="width:46px;height:46px;font-size:16px;">${escapeHtml(initials)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;${isMissed?'color:var(--red);':''}">${escapeHtml(otherName)}</div>
          <div style="font-size:12px;color:${dirColor};margin-top:2px;">${dirIcon} ${isMissed ? 'Missed' : (isOutgoing?'Outgoing':'Incoming')} · ${escapeHtml(timeStr)}</div>
        </div>
        <div style="font-size:20px;color:var(--muted);">${typeIcon}</div>`;
      row.onclick = () => {
        if (!otherUid) return;
        currentOtherUser = { uid: otherUid, name: otherName };
        window.startRealCall(c.type === 'video' ? 'video' : 'audio');
      };
      list.appendChild(row);
    });
  } catch(e) {
    list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);">⚠️ ${escapeHtml(e.message)}</div>`;
  }
};

// ── People Discovery ──────────────────────────────────────────────
let allPeopleCache = [];
let friendStatusCache = {};

// ── New Group creation ──────────────────────────────────────────────
function toggleChatsMenu() {
  const menu = document.getElementById('chatsMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

async function openNewGroup() {
  toggleChatsMenu();
  newGroupReturnScreen = 'chats';
  selectedGroupMembers = new Map();
  document.getElementById('newGroupName').value = '';
  document.getElementById('newGroupName').style.display = '';
  document.querySelector('#newgroup .ch-name').textContent = 'New group';
  const createBtn = document.querySelector('#newgroup .splash-cta');
  createBtn.textContent = 'Create group';
  createBtn.onclick = createGroupChat;
  updateGroupSelCount();
  showScreen('newgroup');

  if (!allPeopleCache.length) await loadPeople();
  renderNewGroupList();
}

function closeNewGroupScreen() {
  showScreen(newGroupReturnScreen);
  if (newGroupReturnScreen === 'chats') document.getElementById('bottomTabs').style.display = 'flex';
}

function renderNewGroupList() {
  const list = document.getElementById('newGroupList');
  const friends = allPeopleCache.filter(u => friendStatusCache[u.uid] === 'accepted');

  if (!friends.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
      <div style="font-size:32px;margin-bottom:10px;">🙈</div>
      <div style="font-size:14px;">Add some friends first — you can only add friends to a group.</div>
    </div>`;
    return;
  }

  list.innerHTML = '';
  friends.forEach(u => {
    const color    = getAvatarColor(u.uid);
    const initials = getInitials(u.name||'?');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;';
    row.innerHTML = `
      <div class="cr-avatar ${color}" style="width:44px;height:44px;font-size:15px;">${escapeHtml(initials)}</div>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:14px;">${escapeHtml(u.name)}</div>
      </div>
      <input type="checkbox" id="grpchk_${escapeHtml(u.uid)}" style="width:20px;height:20px;accent-color:var(--yellow);">`;
    row.onclick = (e) => {
      if (e.target.tagName !== 'INPUT') document.getElementById(`grpchk_${u.uid}`).click();
    };
    row.querySelector('input').onclick = (e) => {
      e.stopPropagation();
      toggleGroupMember(u.uid, u.name);
    };
    list.appendChild(row);
  });
}

function toggleGroupMember(uid, name) {
  if (selectedGroupMembers.has(uid)) selectedGroupMembers.delete(uid);
  else selectedGroupMembers.set(uid, name);
  updateGroupSelCount();
}

function updateGroupSelCount() {
  document.getElementById('groupSelCount').textContent = `${selectedGroupMembers.size} selected`;
}

window.createGroupChat = async function() {
  const name = document.getElementById('newGroupName').value.trim();
  if (!name) { showToast('⚠️ Please enter a group name'); return; }
  if (selectedGroupMembers.size < 2) { showToast('⚠️ Add at least 2 friends to make a group'); return; }

  try {
    const myName = currentUser.displayName || currentUser.email.split('@')[0];
    const memberIds   = [currentUser.uid, ...selectedGroupMembers.keys()];
    const memberNames = { [currentUser.uid]: myName };
    selectedGroupMembers.forEach((name, uid) => memberNames[uid] = name);
    const unread = {};
    memberIds.forEach(uid => unread[uid] = 0);

    const groupRef = await addDoc(collection(db,'chats'), {
      isGroup: true,
      groupName: name,
      members: memberIds,
      memberNames,
      admins: [currentUser.uid],
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      lastMessage: 'Group created',
      lastMessageSender: myName,
      lastMessageTime: serverTimestamp(),
      unread
    });

    showToast(`🎉 "${name}" group created`);
    openGroupChat(groupRef.id, name, memberIds);
  } catch(e) {
    showToast('⚠️ Failed to create group: ' + e.message);
  }
};

async function loadPeople() {
  const list = document.getElementById('peopleList');
  if (!list || !currentUser) return;
  list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);"><div style="font-size:28px;">⏳</div><div style="font-size:14px;margin-top:8px;">Loading people...</div></div>`;
  try {
    // Load all users except self
    const usersSnap = await getDocs(collection(db,'users'));
    allPeopleCache = [];
    usersSnap.forEach(d => {
      if (d.id !== currentUser.uid) allPeopleCache.push(d.data());
    });

    // Load all my friend request statuses in one go
    const sentSnap = await getDocs(query(collection(db,'friendRequests'), where('from','==',currentUser.uid)));
    const recvSnap = await getDocs(query(collection(db,'friendRequests'), where('to','==',currentUser.uid)));
    friendStatusCache = {};
    sentSnap.forEach(d => { friendStatusCache[d.data().to] = d.data().status; });
    recvSnap.forEach(d => {
      const uid = d.data().from;
      if (!friendStatusCache[uid]) friendStatusCache[uid] = 'incoming:' + d.id;
    });

    renderPeople(allPeopleCache);
  } catch(e) {
    list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);">⚠️ ${escapeHtml(e.message)}</div>`;
  }
}

function renderPeople(people) {
  const list = document.getElementById('peopleList');
  if (!list) return;
  if (!people.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
      <div style="font-size:36px;margin-bottom:10px;">👥</div>
      <div style="font-size:14px;">No other users yet</div>
    </div>`;
    return;
  }

  // Sort: friends first, then pending, then strangers
  const order = { 'accepted':0, 'sent':1, 'incoming':2, 'none':3 };
  people.sort((a,b) => {
    const sa = friendStatusCache[a.uid]?.startsWith('incoming') ? 'incoming' : (friendStatusCache[a.uid]||'none');
    const sb = friendStatusCache[b.uid]?.startsWith('incoming') ? 'incoming' : (friendStatusCache[b.uid]||'none');
    return (order[sa]??3) - (order[sb]??3);
  });

  list.innerHTML = '';
  people.forEach(u => {
    const status = friendStatusCache[u.uid] || 'none';
    const isAccepted = status === 'accepted';
    const isSent     = status === 'sent';
    const isIncoming = status.startsWith('incoming');
    const reqId      = isIncoming ? status.split(':')[1] : null;
    const color      = getAvatarColor(u.uid);
    const initials   = getInitials(u.name||'?');
    const phone      = u.phone ? '📱 ' + u.phone : '';

    const actionBtn = isAccepted
      ? `<button onclick="window.startChatWith('${jsAttr(u.uid)}','${jsAttr(u.name)}','${jsAttr(color)}')" style="padding:8px 14px;background:var(--green);border:none;border-radius:10px;color:#000;font-weight:700;font-size:12px;cursor:pointer;">💬 Chat</button>`
      : isSent
      ? `<button disabled style="padding:8px 14px;background:rgba(255,255,255,0.08);border:none;border-radius:10px;color:var(--muted);font-size:12px;">⏳ Pending</button>`
      : isIncoming
      ? `<div style="display:flex;flex-direction:column;gap:5px;">
           <button onclick="window.acceptRequest('${jsAttr(reqId)}')" style="padding:6px 12px;background:var(--green);border:none;border-radius:8px;color:#000;font-weight:700;font-size:11px;cursor:pointer;">✅ Accept</button>
           <button onclick="window.declineRequest('${jsAttr(reqId)}')" style="padding:6px 12px;background:rgba(255,0,0,0.15);border:none;border-radius:8px;color:#ff6b6b;font-size:11px;cursor:pointer;">✕ Decline</button>
         </div>`
      : `<button onclick="window.sendFriendRequest('${jsAttr(u.uid)}','${jsAttr(u.name)}')" style="padding:8px 14px;background:transparent;border:2px solid var(--yellow);border-radius:10px;color:var(--yellow);font-weight:700;font-size:12px;cursor:pointer;">➕ Add</button>`;

    const photoHTML = u.photoURL
      ? `<img src="${escapeHtml(u.photoURL)}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;">`
      : `<div class="cr-avatar ${color}" style="width:50px;height:50px;font-size:18px;">${escapeHtml(initials)}</div>`;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);';
    row.innerHTML = `
      ${photoHTML}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:15px;">${escapeHtml(u.name||'Unknown')}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${escapeHtml(phone)}</div>
        ${isAccepted ? '<div style="font-size:11px;color:var(--green);margin-top:2px;">✓ Friend</div>' : ''}
      </div>
      ${actionBtn}`;
    list.appendChild(row);
  });
}

window._loadPeople = loadPeople;
window._filterPeople = function(val) {
  if (!val.trim()) { renderPeople(allPeopleCache); return; }
  const q = val.toLowerCase();
  const filtered = allPeopleCache.filter(u =>
    u.name?.toLowerCase().includes(q) ||
    u.phone?.includes(q) ||
    u.email?.toLowerCase().includes(q)
  );
  renderPeople(filtered);
};

// After accepting/declining, refresh People list too
const _origAccept  = window.acceptRequest;
const _origDecline = window.declineRequest;
window.acceptRequest = async function(reqId) {
  await _origAccept(reqId);
  friendStatusCache = {}; // clear cache so reload picks up new status
  loadPeople();
};
window.declineRequest = async function(reqId) {
  await _origDecline(reqId);
  friendStatusCache = {};
  loadPeople();
};

// ── Send Image Message ────────────────────────────────────────────
window._sendImageMessage = async function(input) {
  if (!input.files[0] || !currentChatId || !currentUser) return;
  const file = input.files[0];
  input.value = ''; // reset so same file can be sent again

  showToast('⏳ Sending image...');
  try {
    // Resize to max 800x800 and compress to stay under Firestore 1MB limit
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const MAX = 800;
    const ratio = Math.min(MAX / bitmap.width, MAX / bitmap.height, 1);
    canvas.width  = Math.round(bitmap.width  * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.6);

    // Check size — Firestore doc limit is 1MB
    if (base64.length > 900000) {
      showToast('⚠️ Image too large even after compression. Try a smaller photo.');
      return;
    }

    const myName = currentUser.displayName || currentUser.email.split('@')[0];
    const chatRef = doc(db,'chats',currentChatId);
    await addDoc(collection(db,'chats',currentChatId,'messages'), {
      type: 'image',
      imageData: base64,
      senderId: currentUser.uid,
      senderName: myName,
      time: serverTimestamp()
    });
    await updateDoc(chatRef, {
      lastMessage: '📷 Photo',
      lastMessageTime: serverTimestamp(),
      [`unread.${currentOtherUser.uid}`]: ((await getDoc(chatRef)).data()?.unread?.[currentOtherUser.uid]||0)+1
    });
  } catch(e) {
    showToast('⚠️ Failed to send image: ' + e.message);
  }
};

// ── Apply profile photo everywhere ────────────────────────────────
function applyProfilePhoto(url) {
  // Settings avatar — big 110px circle
  const settingsAv   = document.getElementById('settingsAvatar');
  const settingsInit = document.getElementById('settingsAvatarInitials');
  if (settingsInit) settingsInit.style.display = 'none';
  if (settingsAv) {
    let img = settingsAv.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;';
      settingsAv.style.position = 'relative';
      settingsAv.appendChild(img);
    }
    img.src = url;
  }
  // Status screen avatar
  const myAv   = document.getElementById('myStatusAvatar');
  const myInit = document.getElementById('myStatusInitials');
  if (myInit) myInit.style.display = 'none';
  if (myAv) {
    myAv.style.position = 'relative';
    let img2 = myAv.querySelector('img');
    if (!img2) {
      img2 = document.createElement('img');
      img2.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;';
      myAv.appendChild(img2);
    }
    img2.src = url;
  }
}

// ── Save Profile ──────────────────────────────────────────────────
window._saveProfile = async function() {
  const name = document.getElementById('editNameInput').value.trim();
  const bio  = document.getElementById('editBioInput').value.trim() || 'Hey there! I am using Lum@T';
  if (!name) { showToast('⚠️ Name cannot be empty'); return; }
  try {
    await updateProfile(currentUser, { displayName: name });
    await setDoc(doc(db,'users',currentUser.uid), { name, bio }, { merge: true });
    // Update UI
    document.getElementById('settingsName').textContent = name;
    document.getElementById('settingsBio').textContent  = bio;
    document.getElementById('myStatusName').textContent = name;
    // Update initials everywhere
    const initials = getInitials(name);
    document.getElementById('settingsAvatarInitials').textContent = initials;
    document.getElementById('myStatusInitials').textContent       = initials;
    document.getElementById('editProfileInitials').textContent    = initials;
    showToast('✅ Profile updated!');
    closeEditProfile();
  } catch(e) {
    showToast('⚠️ Failed: ' + e.message);
  }
};

// ── Remove Profile Picture ────────────────────────────────────────
window._removeProfilePic = async function() {
  if (!currentUser) return;
  try {
    await updateProfile(currentUser, { photoURL: null });
    await setDoc(doc(db,'users',currentUser.uid), { photoURL: null }, { merge: true });
    // Reset avatar to initials
    const av   = document.getElementById('settingsAvatar');
    const init = document.getElementById('settingsAvatarInitials');
    const img  = av?.querySelector('img');
    if (img) img.remove();
    if (init) init.style.display = '';
    const myAv   = document.getElementById('myStatusAvatar');
    const myInit = document.getElementById('myStatusInitials');
    const myImg  = myAv?.querySelector('img');
    if (myImg) myImg.remove();
    if (myInit) myInit.style.display = '';
    showToast('✅ Profile photo removed');
  } catch(e) {
    showToast('⚠️ Failed: ' + e.message);
  }
};

// ── Upload Profile Picture (base64 → Firestore, no Storage needed) ─
window._uploadProfilePic = async function(input) {
  if (!currentUser || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 2 * 1024 * 1024) { showToast('⚠️ Image must be under 2MB'); return; }
  showToast('⏳ Uploading photo...');
  try {
    // Resize image to max 200x200 using canvas before storing
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const MAX = 200;
    const ratio = Math.min(MAX / bitmap.width, MAX / bitmap.height);
    canvas.width  = Math.round(bitmap.width  * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.7);

    await updateProfile(currentUser, { photoURL: base64 });
    await setDoc(doc(db,'users',currentUser.uid), { photoURL: base64 }, { merge: true });
    applyProfilePhoto(base64);
    showToast('✅ Profile photo updated!');
  } catch(e) {
    showToast('⚠️ Upload failed: ' + e.message);
  }
};

// ── Post Status Update ─────────────────────────────────────────────
window._postStatus = async function() {
  if (!currentUser) return;
  const text     = document.getElementById('statusText').value.trim();
  const photoImg = document.getElementById('statusPhotoImg');
  const hasPhoto = photoImg.src && photoImg.src !== window.location.href;
  const photoData = hasPhoto ? photoImg.src : null;

  if (!text && !photoData) { showToast('⚠️ Add a photo or write something first'); return; }

  // Check photo size
  if (photoData && photoData.length > 800000) {
    showToast('⚠️ Photo too large. Try a smaller image.');
    return;
  }

  try {
    const name = currentUser.displayName || currentUser.email.split('@')[0];
    const userDoc = await getDoc(doc(db,'users',currentUser.uid));
    const profilePhoto = userDoc.data()?.photoURL || currentUser.photoURL || null;

    await addDoc(collection(db,'statuses'), {
      uid: currentUser.uid,
      name,
      profilePhoto,
      photoData,
      text,
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 24*60*60*1000)
    });

    document.getElementById('statusText').value = '';
    removeStatusPhoto();
    document.getElementById('statusPhotoInput').value = '';
    document.getElementById('addStatusBox').style.display = 'none';
    showToast('✅ Status posted!');
    loadStatuses();
  } catch(e) {
    showToast('⚠️ Failed to post: ' + e.message);
  }
};

// ── Load Status Updates ────────────────────────────────────────────
async function loadStatuses() {
  if (!currentUser) return;
  try {
    const now = new Date();
    const snap = await getDocs(
      query(collection(db,'statuses'), orderBy('createdAt','desc'), limit(50))
    );
    const list = document.getElementById('statusList');
    const myItems = [];
    const otherItems = [];

    snap.forEach(d => {
      const s = { ...d.data(), id: d.id };
      if (s.expiresAt?.toDate && s.expiresAt.toDate() < now) return;
      if (s.uid === currentUser.uid) myItems.push(s);
      else otherItems.push(s);
    });

    // Update my status hint
    if (myItems.length > 0) {
      document.getElementById('myStatusHint').textContent = `${myItems.length} update${myItems.length>1?'s':''} · tap to view`;
      document.getElementById('myStatusRing').style.border = '3px solid var(--green)';
    }

    if (!otherItems.length) {
      list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted);">
        <div style="font-size:36px;margin-bottom:10px;">🔵</div>
        <div style="font-size:14px;">No recent updates from contacts</div>
      </div>`;
      return;
    }

    list.innerHTML = '<div style="padding:8px 16px 4px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">Recent updates</div>';

    otherItems.forEach(s => {
      const timeAgo = s.createdAt?.toDate ? formatTime(s.createdAt) : '';
      const initials = getInitials(s.name);
      const color    = getAvatarColor(s.uid);

      // Avatar — use profile photo if available
      const avatarHTML = s.profilePhoto
        ? `<img src="${escapeHtml(s.profilePhoto)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:3px solid var(--green);">`
        : `<div class="cr-avatar ${color}" style="width:48px;height:48px;font-size:17px;border:3px solid var(--green);">${escapeHtml(initials)}</div>`;

      // Thumbnail if has photo
      const thumbHTML = s.photoData
        ? `<img src="${escapeHtml(s.photoData)}" style="width:52px;height:52px;object-fit:cover;border-radius:10px;margin-left:auto;flex-shrink:0;">`
        : '';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;';
      row.innerHTML = `
        ${avatarHTML}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;">${escapeHtml(s.name)}</div>
          <div style="font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.text||'📷 Photo')}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${escapeHtml(timeAgo)}</div>
        </div>
        ${thumbHTML}`;
      row.onclick = () => openStatusViewer(s.name, initials, color, s.text, s.photoData, timeAgo);
      list.appendChild(row);
    });
  } catch(e) {
    console.warn('loadStatuses:', e.message);
  }
}

// ── Logout ────────────────────────────────────────────────────────
window._doLogout = async function() {
  if (!confirm('Log out of Lum@T?')) return;
  if (msgUnsubscribe) msgUnsubscribe();
  if (chatUnsubscribe) chatUnsubscribe();
  await signOut(auth);
  allScreens.forEach(s=>document.getElementById(s)?.classList.remove('active'));
  document.getElementById('bottomTabs').style.display='none';
  document.getElementById('splash').classList.add('active');
  showToast('👋 Logged out successfully');
};

} catch(e) {
  // Firebase failed to load — show error on login/signup screens
  console.error('Firebase failed to load:', e);
  alert('FIREBASE LOAD ERROR\n' + e.message);
  const msg = '⚠️ Could not connect to server. Check your internet connection.';
  window._doLogin  = () => { document.getElementById('loginError').textContent  = msg; };
  window._doSignup = () => { document.getElementById('signupError').textContent = msg; };
  window._doGoogleSignIn = () => { document.getElementById('loginError').textContent = msg; };
  window._doAppleSignIn  = () => { document.getElementById('loginError').textContent = msg; };
}
})();
