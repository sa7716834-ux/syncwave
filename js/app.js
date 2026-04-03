/**
 * SyncWave — Main Application
 * Full realtime chat logic, channels, DMs, presence, file sharing, AI
 */

// ======================================================
//  BOOTSTRAP
// ======================================================
const currentUserRaw = localStorage.getItem('sw_user');
if (!currentUserRaw) { window.location.href = 'index.html'; }

const ME = JSON.parse(currentUserRaw);
// Patch DB with current user
DB.restoreSession();

let activeChannelId = 'c1';
let activeDmUserId  = null;
let membersOpen     = false;
let pendingFile     = null;
let typingTimer     = null;
let isTyping        = false;
let unsubs          = [];
let searchActive    = false;
let emojiPickerOpen = false;

const EMOJIS = ['👍','👎','❤️','🎉','😂','😮','🔥','✅','🚀','💯','👀','🤔','😅','💪','⚡','🙌','😭','🤡','💀','🫡','🥳','⚙️','🐛','✨','📦','🔐','📝','🎯','🛠️','👋'];

// ======================================================
//  INIT
// ======================================================
function init() {
  renderSelf();
  renderChannels();
  renderDMs();
  renderMembers();
  bindEvents();
  switchChannel('c1');
  setupPresenceSync();
  setupTheme();
}

// ======================================================
//  RENDER SELF
// ======================================================
function renderSelf() {
  const av = document.getElementById('selfAvatar');
  const nm = document.getElementById('selfName');
  av.textContent = initials(ME.name);
  av.style.background = ME.color;
  nm.textContent = ME.name;
}

// ======================================================
//  CHANNELS
// ======================================================
function renderChannels() {
  const list = document.getElementById('channelList');
  const channels = DB.getChannels();
  list.innerHTML = '';
  channels.forEach(ch => {
    const msgs = DB.getMessages(ch.id);
    const unread = msgs.filter(m => m.userId !== ME.id && m.timestamp > getLastRead(ch.id)).length;
    const li = el('li', 'channel-item' + (ch.id === activeChannelId ? ' active' : ''));
    li.dataset.id = ch.id;
    li.innerHTML = `
      <span class="channel-prefix-icon">${ch.type === 'private' ? '🔒' : '#'}</span>
      <span class="channel-name">${ch.name}</span>
      ${unread > 0 ? `<span class="unread-badge">${unread > 9 ? '9+' : unread}</span>` : ''}
    `;
    li.addEventListener('click', () => switchChannel(ch.id));
    list.appendChild(li);
  });
}

function switchChannel(id) {
  activeDmUserId = null;
  activeChannelId = id;
  setLastRead(id);
  renderChannels();
  renderDMs();

  const ch = DB.getChannels().find(c => c.id === id);
  document.getElementById('channelPrefix').textContent = ch?.type === 'private' ? '🔒' : '#';
  document.getElementById('channelTitle').textContent = ch?.name || id;
  document.getElementById('channelDesc').textContent = ch?.desc || '';
  document.getElementById('messageInput').placeholder = `Message #${ch?.name || id}…`;

  unsubs.forEach(u => u()); unsubs = [];
  const unsub = DB.onMessages(id, (msgs, event) => {
    if (event && event.type === 'typing') {
      showTyping(event.userId);
      return;
    }
    renderMessages(id);
    if (event && event.userId !== ME.id) {
      const user = DB.getUserById(event.userId);
      showToast(`${user?.name || 'Someone'} in #${ch?.name}`, 'info', 2500);
    }
  });
  unsubs.push(unsub);
  renderMessages(id);
  closeMobileMenu();
}

// ======================================================
//  DMs
// ======================================================
function renderDMs() {
  const list = document.getElementById('dmList');
  const users = DB.getUsers().filter(u => u.id !== ME.id);
  list.innerHTML = '';
  users.forEach(u => {
    const li = el('li', 'dm-item' + (u.id === activeDmUserId ? ' active' : ''));
    li.innerHTML = `
      <div class="dm-avatar" style="background:${u.color}">${initials(u.name)}</div>
      <span class="dm-name">${u.name}</span>
      <span class="dm-status ${u.online ? 'online' : 'offline'}"></span>
    `;
    li.addEventListener('click', () => openDM(u));
    list.appendChild(li);
  });
}

function openDM(user) {
  activeDmUserId = user.id;
  activeChannelId = null;
  renderChannels();
  renderDMs();

  document.getElementById('channelPrefix').textContent = '@';
  document.getElementById('channelTitle').textContent = user.name;
  document.getElementById('channelDesc').textContent = user.online ? 'Online' : 'Offline';
  document.getElementById('messageInput').placeholder = `Message ${user.name}…`;

  const dmCid = dmChannelId(ME.id, user.id);
  unsubs.forEach(u => u()); unsubs = [];
  const unsub = DB.onMessages(dmCid, () => renderMessages(dmCid));
  unsubs.push(unsub);
  renderMessages(dmCid);
  closeMobileMenu();
}

function dmChannelId(a, b) {
  return 'dm_' + [a, b].sort().join('_');
}

// ======================================================
//  MESSAGES
// ======================================================
function renderMessages(channelId) {
  const container = document.getElementById('messagesList');
  const msgs = DB.getMessages(channelId);
  const query = searchActive ? document.getElementById('searchInput').value.toLowerCase() : '';
  const filtered = query ? msgs.filter(m => m.text.toLowerCase().includes(query) || m.file?.name?.toLowerCase().includes(query)) : msgs;

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-family:var(--font-mono);font-size:12px">No messages yet. Say hello! 👋</div>`;
    return;
  }

  container.innerHTML = '';
  let lastDate = null;
  let lastUid   = null;
  let lastTs    = 0;

  filtered.forEach((msg, i) => {
    const d = dateStr(msg.timestamp);
    if (d !== lastDate) {
      const div = el('div', 'day-divider');
      div.textContent = d;
      container.appendChild(div);
      lastDate = d; lastUid = null;
    }

    const grouped = (msg.userId === lastUid && msg.timestamp - lastTs < 5 * 60000);
    const user = DB.getUserById(msg.userId);
    const isMe = msg.userId === ME.id;

    const msgEl = el('div', 'msg' + (grouped ? ' grouped' : ''));
    msgEl.dataset.msgId = msg.id;
    msgEl.dataset.cid   = channelId;

    const bodyHtml = formatText(msg.text);
    const fileHtml = msg.file ? renderFileHTML(msg.file) : '';
    const reactHtml = renderReactionsHTML(msg.reactions, channelId, msg.id);

    msgEl.innerHTML = `
      <div class="msg-avatar-col">
        ${!grouped ? `<div class="avatar" style="background:${user?.color||'#555'}">${initials(user?.name||'?')}</div>` : ''}
      </div>
      <div class="msg-content-col">
        ${!grouped ? `<div class="msg-header">
          <span class="msg-author" style="color:${user?.color||'var(--text-primary)'}">${user?.name||'Unknown'}</span>
          ${user?.role === 'admin' ? '<span class="msg-badge">admin</span>' : ''}
          <span class="msg-time">${timeStr(msg.timestamp)}</span>
          ${msg.edited ? '<span class="msg-time">(edited)</span>' : ''}
        </div>` : ''}
        ${bodyHtml ? `<div class="msg-body">${bodyHtml}</div>` : ''}
        ${fileHtml}
        ${reactHtml}
      </div>
      <div class="msg-actions">
        <button class="msg-action-btn react-btn" data-msg="${msg.id}" data-cid="${channelId}" title="React">😊</button>
        ${isMe ? `<button class="msg-action-btn delete-btn" data-msg="${msg.id}" data-cid="${channelId}" title="Delete">🗑</button>` : ''}
      </div>
    `;

    container.appendChild(msgEl);
    lastUid = msg.userId;
    lastTs  = msg.timestamp;
  });

  scrollToBottom();
}

function formatText(text) {
  if (!text) return '';
  // Code blocks
  text = text.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${escHtml(c.trim())}</code></pre>`);
  // Inline code
  text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`);
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Newlines
  text = text.replace(/\n/g, '<br>');
  return text;
}

function renderFileHTML(file) {
  if (!file) return '';
  const isImg = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(file.name);
  if (isImg && file.dataUrl) {
    return `<img class="msg-image" src="${file.dataUrl}" alt="${escHtml(file.name)}" onclick="openLightbox(this.src)" />`;
  }
  const icon = fileIcon(file.name);
  return `<div class="msg-file">
    <span class="msg-file-icon">${icon}</span>
    <div class="msg-file-info">
      <div class="msg-file-name">${escHtml(file.name)}</div>
      <div class="msg-file-size">${formatBytes(file.size)}</div>
    </div>
  </div>`;
}

function renderReactionsHTML(reactions, cid, msgId) {
  if (!reactions || Object.keys(reactions).length === 0) return '';
  const pills = Object.entries(reactions).map(([emoji, users]) => {
    const mine = users.includes(ME.id);
    return `<span class="reaction-pill${mine?' mine':''}" data-emoji="${emoji}" data-msg="${msgId}" data-cid="${cid}">
      ${emoji} <span>${users.length}</span>
    </span>`;
  });
  return `<div class="msg-reactions">${pills.join('')}</div>`;
}

// ======================================================
//  TYPING INDICATOR
// ======================================================
let typingUsers = {};
function showTyping(userId) {
  if (userId === ME.id) return;
  const user = DB.getUserById(userId);
  typingUsers[userId] = setTimeout(() => {
    delete typingUsers[userId];
    updateTypingUI();
  }, 3000);
  updateTypingUI(user);
}

function updateTypingUI(user) {
  const el2 = document.getElementById('typingIndicator');
  const txt  = document.getElementById('typingText');
  const names = Object.keys(typingUsers).map(id => DB.getUserById(id)?.name?.split(' ')[0] || '?');
  if (names.length === 0) { el2.style.display = 'none'; return; }
  el2.style.display = 'flex';
  txt.textContent = names.length === 1 ? `${names[0]} is typing…` : `${names.slice(0,-1).join(', ')} and ${names.at(-1)} are typing…`;
}

// ======================================================
//  MEMBERS PANEL
// ======================================================
function renderMembers() {
  const users = DB.getUsers();
  const online  = users.filter(u => u.online);
  const offline = users.filter(u => !u.online);

  document.getElementById('onlineCount').textContent = `${online.length} online`;
  document.getElementById('onlineCountPanel').textContent = online.length;
  document.getElementById('offlineCountPanel').textContent = offline.length;

  renderMemberList('onlineList', online);
  renderMemberList('offlineList', offline);
}

function renderMemberList(id, users) {
  const list = document.getElementById(id);
  list.innerHTML = '';
  users.forEach(u => {
    const li = el('li', 'member-item');
    li.innerHTML = `
      <div class="avatar" style="background:${u.color};width:24px;height:24px;font-size:10px">${initials(u.name)}</div>
      <span class="member-name">${u.name}</span>
      ${u.role === 'admin' ? '<span class="member-role">admin</span>' : ''}
    `;
    li.addEventListener('click', () => {
      if (u.id !== ME.id) openDM(u);
    });
    list.appendChild(li);
  });
}

// ======================================================
//  SEND MESSAGE
// ======================================================
function sendMessage() {
  const input = document.getElementById('messageInput');
  const text  = input.value.trim();
  if (!text && !pendingFile) return;

  const cid = activeDmUserId ? dmChannelId(ME.id, activeDmUserId) : activeChannelId;
  DB.sendMessage(cid, text, pendingFile);
  input.value = '';
  input.style.height = 'auto';
  clearPendingFile();
  setLastRead(cid);
}

// ======================================================
//  FILE HANDLING
// ======================================================
document.getElementById('attachBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('File too large (max 10MB)', 'error'); return; }

  const reader = new FileReader();
  reader.onload = ev => {
    pendingFile = { name: file.name, size: file.size, type: file.type, dataUrl: ev.target.result };
    showFilePreview(pendingFile);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

function showFilePreview(file) {
  const preview = document.getElementById('filePreview');
  const inner   = document.getElementById('filePreviewInner');
  const isImg   = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(file.name);
  inner.innerHTML = isImg
    ? `<img src="${file.dataUrl}" style="height:40px;border-radius:4px;margin-right:8px"> ${escHtml(file.name)} (${formatBytes(file.size)})`
    : `${fileIcon(file.name)} ${escHtml(file.name)} (${formatBytes(file.size)})`;
  preview.style.display = 'flex';
}

function clearPendingFile() {
  pendingFile = null;
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('filePreviewInner').innerHTML = '';
}

document.getElementById('clearFile').addEventListener('click', clearPendingFile);

// ======================================================
//  EMOJI PICKER
// ======================================================
function initEmojiPicker() {
  const grid = document.getElementById('emojiGrid');
  EMOJIS.forEach(em => {
    const btn = el('button', 'emoji-btn-item');
    btn.type = 'button';
    btn.textContent = em;
    btn.addEventListener('click', () => {
      const input = document.getElementById('messageInput');
      input.value += em;
      input.focus();
      closeEmojiPicker();
    });
    grid.appendChild(btn);
  });
}

function closeEmojiPicker() {
  document.getElementById('emojiPicker').style.display = 'none';
  emojiPickerOpen = false;
}

document.getElementById('emojiBtn').addEventListener('click', e => {
  e.stopPropagation();
  emojiPickerOpen = !emojiPickerOpen;
  document.getElementById('emojiPicker').style.display = emojiPickerOpen ? 'block' : 'none';
});

document.addEventListener('click', e => {
  if (emojiPickerOpen && !e.target.closest('#emojiPicker') && !e.target.closest('#emojiBtn')) {
    closeEmojiPicker();
  }
});

// ======================================================
//  REACTIONS
// ======================================================
document.getElementById('messagesList').addEventListener('click', e => {
  const reactionEl = e.target.closest('.reaction-pill');
  if (reactionEl) {
    DB.toggleReaction(reactionEl.dataset.cid, reactionEl.dataset.msg, reactionEl.dataset.emoji);
    const cid = activeDmUserId ? dmChannelId(ME.id, activeDmUserId) : activeChannelId;
    renderMessages(cid);
    return;
  }

  const reactBtn = e.target.closest('.react-btn');
  if (reactBtn) {
    showQuickReact(reactBtn);
    return;
  }

  const deleteBtn = e.target.closest('.delete-btn');
  if (deleteBtn) {
    DB.deleteMessage(deleteBtn.dataset.cid, deleteBtn.dataset.msg);
    const cid = activeDmUserId ? dmChannelId(ME.id, activeDmUserId) : activeChannelId;
    renderMessages(cid);
    return;
  }
});

let quickReactEl = null;
function showQuickReact(btn) {
  if (quickReactEl) quickReactEl.remove();
  const QUICK = ['👍','❤️','🎉','😂','🔥','✅'];
  const div = el('div');
  div.style.cssText = 'position:fixed;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:6px;display:flex;gap:4px;z-index:400;box-shadow:0 8px 24px rgba(0,0,0,0.4)';
  const rect = btn.getBoundingClientRect();
  div.style.top  = (rect.top - 48) + 'px';
  div.style.left = (rect.left - 60) + 'px';
  QUICK.forEach(em => {
    const b = el('button', 'emoji-btn-item');
    b.type = 'button'; b.textContent = em;
    b.addEventListener('click', () => {
      const msgEl = btn.closest('.msg');
      DB.toggleReaction(msgEl.dataset.cid, msgEl.dataset.msgId, em);
      const cid = activeDmUserId ? dmChannelId(ME.id, activeDmUserId) : activeChannelId;
      renderMessages(cid);
      div.remove(); quickReactEl = null;
    });
    div.appendChild(b);
  });
  document.body.appendChild(div);
  quickReactEl = div;
  setTimeout(() => document.addEventListener('click', function cb() { div.remove(); quickReactEl = null; document.removeEventListener('click', cb); }), 100);
}

// ======================================================
//  ADD CHANNEL MODAL
// ======================================================
document.getElementById('addChannelBtn').addEventListener('click', () => {
  document.getElementById('addChannelModal').style.display = 'flex';
});
document.getElementById('closeChannelModal').addEventListener('click', () => {
  document.getElementById('addChannelModal').style.display = 'none';
});
document.getElementById('cancelChannelModal').addEventListener('click', () => {
  document.getElementById('addChannelModal').style.display = 'none';
});
document.getElementById('confirmAddChannel').addEventListener('click', () => {
  const name = document.getElementById('newChannelName').value.trim();
  const desc = document.getElementById('newChannelDesc').value.trim();
  const type = document.querySelector('input[name="channelType"]:checked').value;
  if (!name) { showToast('Channel name required', 'error'); return; }
  const ch = DB.addChannel({ name, desc, type });
  document.getElementById('addChannelModal').style.display = 'none';
  document.getElementById('newChannelName').value = '';
  document.getElementById('newChannelDesc').value = '';
  renderChannels();
  switchChannel(ch.id);
  showToast(`#${ch.name} created`, 'success');
});

// ======================================================
//  AI ASSISTANT (DEMO with GPT stub)
// ======================================================
document.getElementById('aiBtn').addEventListener('click', () => {
  document.getElementById('aiModal').style.display = 'flex';
  document.getElementById('aiInput').focus();
});
document.getElementById('closeAiModal').addEventListener('click', () => {
  document.getElementById('aiModal').style.display = 'none';
});

const aiHistory = [];

document.getElementById('aiSend').addEventListener('click', sendAI);
document.getElementById('aiInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendAI(); });

async function sendAI() {
  const input = document.getElementById('aiInput');
  const query = input.value.trim();
  if (!query) return;
  input.value = '';

  aiHistory.push({ role: 'user', content: query });
  renderAIChat();

  const cid = activeDmUserId ? dmChannelId(ME.id, activeDmUserId) : activeChannelId;
  const ch  = DB.getChannels().find(c => c.id === cid);
  const msgs = DB.getMessages(cid).slice(-20).map(m => {
    const u = DB.getUserById(m.userId);
    return `[${u?.name||'?'}]: ${m.text}`;
  }).join('\n');

  const systemPrompt = `You are a helpful assistant inside SyncWave, a team chat app.
Current channel: #${ch?.name || 'DM'}. 
Recent messages:
${msgs || '(no messages yet)'}

Answer concisely. You can reference the messages above.`;

  try {
    // Demo mode: simulate API call with a canned intelligent response
    const demoReplies = [
      `Based on the recent conversation in #${ch?.name || 'this channel'}, the team is focused on shipping. The main topics discussed are technical debt, code reviews, and deployment workflows.`,
      `I see ${DB.getMessages(cid).length} messages in this channel. The most active contributor appears to be the team working on the engineering side.`,
      `Great question! In the context of this channel, I'd suggest checking the latest PR threads and coordinating with the team on the blockers mentioned.`,
      `Looking at the chat history, the team is making good progress. Key action items include reviewing the node upgrade PR and addressing the staging issue.`,
      `This appears to be a healthy team channel with active collaboration. The conversation suggests a strong devops and shipping culture.`,
    ];
    await new Promise(r => setTimeout(r, 900 + Math.random() * 600));
    const reply = demoReplies[Math.floor(Math.random() * demoReplies.length)];

    /* PRODUCTION: uncomment and replace with real API key from .env
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, ...aiHistory] })
    });
    const data = await res.json();
    const reply = data.choices[0].message.content;
    */

    aiHistory.push({ role: 'assistant', content: reply });
    renderAIChat();
  } catch (err) {
    aiHistory.push({ role: 'assistant', content: '⚠️ AI unavailable in demo mode. Connect your OpenAI key to enable.' });
    renderAIChat();
  }
}

function renderAIChat() {
  const container = document.getElementById('aiChatHistory');
  container.innerHTML = aiHistory.map(m => `
    <div class="ai-msg ${m.role}">
      <div class="ai-msg-role">${m.role === 'user' ? 'You' : 'Assistant'}</div>
      <div class="ai-msg-body">${escHtml(m.content)}</div>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

// ======================================================
//  SEARCH
// ======================================================
document.getElementById('searchBtn').addEventListener('click', () => {
  const bar = document.getElementById('searchBar');
  searchActive = !searchActive;
  bar.style.display = searchActive ? 'flex' : 'none';
  if (searchActive) document.getElementById('searchInput').focus();
  else {
    document.getElementById('searchInput').value = '';
    renderMessages(activeChannelId);
  }
});

document.getElementById('searchClose').addEventListener('click', () => {
  searchActive = false;
  document.getElementById('searchBar').style.display = 'none';
  document.getElementById('searchInput').value = '';
  renderMessages(activeChannelId);
});

document.getElementById('searchInput').addEventListener('input', () => {
  renderMessages(activeChannelId);
});

// ======================================================
//  MEMBERS TOGGLE
// ======================================================
document.getElementById('membersToggle').addEventListener('click', () => {
  membersOpen = !membersOpen;
  document.getElementById('membersPanel').classList.toggle('open', membersOpen);
});

// ======================================================
//  MOBILE MENU
// ======================================================
document.getElementById('mobileMenuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('mobileOverlay').classList.add('visible');
});

document.getElementById('mobileOverlay').addEventListener('click', closeMobileMenu);

function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobileOverlay').classList.remove('visible');
}

// ======================================================
//  LOGOUT
// ======================================================
document.getElementById('logoutBtn').addEventListener('click', () => {
  DB.logout();
  localStorage.removeItem('sw_user_id');
  localStorage.removeItem('sw_user');
  window.location.href = 'index.html';
});

// ======================================================
//  THEME TOGGLE
// ======================================================
function setupTheme() {
  const saved = localStorage.getItem('sw_theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  updateThemeIcon(saved);
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('sw_theme', next);
  updateThemeIcon(next);
});

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (theme === 'dark') {
    icon.innerHTML = `<circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
  } else {
    icon.innerHTML = `<path d="M13.5 9.5A6 6 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

// ======================================================
//  INPUT EVENTS
// ======================================================
function bindEvents() {
  const input = document.getElementById('messageInput');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', () => {
    // Auto-resize
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    // Typing broadcast
    if (!isTyping) {
      isTyping = true;
      // Would emit typing event to others via WebSocket here
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { isTyping = false; }, 2000);
  });
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  initEmojiPicker();
}

// ======================================================
//  PRESENCE SYNC (simulated)
// ======================================================
function setupPresenceSync() {
  const unsub = DB.onPresence(users => {
    renderDMs();
    renderMembers();
  });
  unsubs.push(unsub);

  // Simulate presence changes
  setInterval(() => {
    const users = DB.getUsers();
    const candidates = users.filter(u => u.id !== ME.id);
    const u = candidates[Math.floor(Math.random() * candidates.length)];
    if (u) {
      // Toggle randomly (low probability)
      if (Math.random() < 0.15) {
        u.online = !u.online;
        renderDMs();
        renderMembers();
      }
    }
  }, 15000);
}

// ======================================================
//  LIGHTBOX
// ======================================================
window.openLightbox = function(src) {
  const lb = el('div', 'lightbox');
  const img = document.createElement('img');
  img.src = src;
  lb.appendChild(img);
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
};

// ======================================================
//  TOAST NOTIFICATIONS
// ======================================================
function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = el('div', `toast ${type}`);
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'none';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ======================================================
//  LAST-READ TRACKING
// ======================================================
function getLastRead(cid) {
  return parseInt(localStorage.getItem('sw_read_' + cid) || '0');
}
function setLastRead(cid) {
  localStorage.setItem('sw_read_' + cid, Date.now().toString());
}

// ======================================================
//  UTILS
// ======================================================
function el(tag, cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scrollToBottom() {
  const c = document.getElementById('messagesContainer');
  c.scrollTop = c.scrollHeight;
}

function timeStr(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dateStr(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { pdf: '📄', js: '📜', ts: '📜', py: '🐍', json: '⚙️', md: '📝', txt: '📄', png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼', zip: '📦', mp4: '🎬', mp3: '🎵' };
  return map[ext] || '📎';
}

// ======================================================
//  START
// ======================================================
init();
