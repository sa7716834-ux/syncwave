/**
 * SyncWave — Mock In-Memory Database
 * Simulates Firebase Realtime Database in demo mode.
 * Replace with real Firebase SDK calls in production.
 */

window.DB = (() => {

  const DEMO_USERS = [
    { id: 'u1', username: 'alice', name: 'Alice Chen', color: '#00e5ff', password: 'demo123', role: 'admin', online: true },
    { id: 'u2', username: 'bob',   name: 'Bob Hartley', color: '#ff4d6d', password: 'demo123', role: 'member', online: true },
    { id: 'u3', username: 'carla', name: 'Carla Moss',  color: '#bd93f9', password: 'demo123', role: 'member', online: false },
    { id: 'u4', username: 'dev',   name: 'Dev Sharma',  color: '#69ff47', password: 'demo123', role: 'member', online: true },
    { id: 'u5', username: 'erin',  name: 'Erin Walsh',  color: '#ffd60a', password: 'demo123', role: 'member', online: false },
  ];

  const DEMO_CHANNELS = [
    { id: 'c1', name: 'general',    desc: 'General discussion',           type: 'public',  pinned: true },
    { id: 'c2', name: 'engineering',desc: 'Engineering & code reviews',   type: 'public',  pinned: false },
    { id: 'c3', name: 'design',     desc: 'Design system & UI feedback',  type: 'public',  pinned: false },
    { id: 'c4', name: 'random',     desc: 'Memes, links & off-topic',     type: 'public',  pinned: false },
    { id: 'c5', name: 'announcements', desc: 'Company-wide announcements', type: 'public', pinned: true },
  ];

  const now = Date.now();
  const m = (uid, cid, text, ago, file = null) => ({
    id: 'msg_' + Math.random().toString(36).slice(2),
    userId: uid, channelId: cid, text, file,
    timestamp: now - ago * 60000,
    reactions: {},
    edited: false,
  });

  const DEMO_MESSAGES = {
    c1: [
      m('u2','c1','Hey team — daily standup in 15 mins 👋', 120),
      m('u1','c1','On it! Just finishing the PR review first', 118),
      m('u4','c1','Same, will be 2 mins late', 117),
      m('u3','c1','Already in the call room btw', 116),
      m('u2','c1','Quick question — should we bump the node version in CI?', 90),
      m('u1','c1','Yes, let\'s move to Node 20 LTS. I\'ll update the Dockerfile', 88),
      m('u4','c1','`node --version` — v18 still on my machine, updating now', 85),
      m('u2','c1','Ship it 🚀', 80),
      m('u1','c1','Just pushed the PR. Branch is `chore/node-20-upgrade`', 75),
      m('u4','c1','Looks good, approved. CI is green ✅', 60),
      m('u2','c1','Merged! Deploy on its way', 45),
      m('u1','c1','Nice velocity today everyone 🎉', 30),
    ],
    c2: [
      m('u4','c2','Started refactoring the auth middleware — moving to JWT refresh tokens', 200),
      m('u1','c2','Good call. Make sure to invalidate old sessions on password change', 195),
      m('u4','c2','Already handled. Using a `tokenVersion` field in the user doc', 190),
      m('u1','c2','Clean. Add a comment in the code explaining the versioning logic please', 185),
      m('u2','c2','PR for the new search indexer is up: github.com/team/sw/pr/42', 120),
      m('u1','c2','Reviewing now...', 100),
      m('u1','c2','Left some comments, mainly around the pagination cursor logic. LGTM otherwise', 80),
      m('u2','c2','Fixed! Updated the cursor to be base64-encoded for safety', 65),
    ],
    c3: [
      m('u3','c3','New design tokens are in Figma — please use the updated spacing scale', 300),
      m('u1','c3','Love the new surface colors. The elevated card variant especially', 280),
      m('u3','c3','Thanks! Took forever to get the dark mode contrast ratios right', 275),
      m('u2','c3','Do we have an icon set decision yet? Lucide vs Phosphor?', 200),
      m('u3','c3','Going with Lucide — tree-shakeable and consistent stroke weight', 190),
    ],
    c4: [
      m('u4','c4','Unpopular opinion: tabs > spaces', 500),
      m('u2','c4','Sir this is a Wendy\'s', 490),
      m('u1','c4','The linter decides. Fight the linter, not each other 😂', 485),
      m('u4','c4','Fair point. ESLint wins again', 480),
    ],
    c5: [
      m('u1','c5','🎉 SyncWave v1.0 ships next Friday! Thank you all for the incredible work this sprint.', 720),
      m('u1','c5','All hands meeting Monday 10am. Calendar invite sent.', 400),
    ],
  };

  // In-memory state
  let _users = JSON.parse(JSON.stringify(DEMO_USERS));
  let _channels = JSON.parse(JSON.stringify(DEMO_CHANNELS));
  let _messages = JSON.parse(JSON.stringify(DEMO_MESSAGES));
  let _currentUser = null;

  // Subscribers
  const _subs = { messages: {}, presence: [] };

  // Auth
  function login(username, password) {
    const u = _users.find(u => u.username === username && u.password === password);
    if (!u) return null;
    u.online = true;
    _currentUser = u;
    localStorage.setItem('sw_user_id', u.id);
    _notifyPresence();
    return { ...u };
  }

  function register(data) {
    if (_users.find(u => u.username === data.username)) return { error: 'Username taken' };
    const u = {
      id: 'u' + (Date.now()),
      username: data.username,
      name: data.name,
      color: data.color || '#00e5ff',
      password: data.password,
      role: 'member',
      online: true,
    };
    _users.push(u);
    _currentUser = u;
    localStorage.setItem('sw_user_id', u.id);
    // Give them some empty channels
    Object.keys(_messages); // ensure channels exist
    _notifyPresence();
    return { ...u };
  }

  function logout() {
    if (_currentUser) {
      const u = _users.find(u => u.id === _currentUser.id);
      if (u) u.online = false;
      _currentUser = null;
    }
    localStorage.removeItem('sw_user_id');
    _notifyPresence();
  }

  function restoreSession() {
    const id = localStorage.getItem('sw_user_id');
    if (!id) return null;
    const u = _users.find(u => u.id === id);
    if (!u) return null;
    u.online = true;
    _currentUser = { ...u };
    return _currentUser;
  }

  function getCurrentUser() { return _currentUser ? { ..._currentUser } : null; }

  // Channels
  function getChannels() { return _channels.map(c => ({ ...c })); }

  function addChannel(data) {
    const ch = {
      id: 'c' + Date.now(),
      name: data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      desc: data.desc || '',
      type: data.type || 'public',
      pinned: false,
    };
    _channels.push(ch);
    _messages[ch.id] = [];
    return { ...ch };
  }

  // Messages
  function getMessages(channelId) {
    return (_messages[channelId] || []).map(m => ({ ...m }));
  }

  function sendMessage(channelId, text, file = null) {
    if (!_currentUser) return null;
    const msg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      userId: _currentUser.id,
      channelId,
      text: text || '',
      file: file || null,
      timestamp: Date.now(),
      reactions: {},
      edited: false,
    };
    if (!_messages[channelId]) _messages[channelId] = [];
    _messages[channelId].push(msg);
    _notifyMessages(channelId, msg);
    return { ...msg };
  }

  function toggleReaction(channelId, msgId, emoji) {
    if (!_currentUser) return;
    const msgs = _messages[channelId];
    if (!msgs) return;
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(_currentUser.id);
    if (idx === -1) {
      msg.reactions[emoji].push(_currentUser.id);
    } else {
      msg.reactions[emoji].splice(idx, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    }
    _notifyMessages(channelId, null);
  }

  function deleteMessage(channelId, msgId) {
    if (!_messages[channelId]) return;
    const idx = _messages[channelId].findIndex(m => m.id === msgId);
    if (idx === -1) return;
    const msg = _messages[channelId][idx];
    if (msg.userId !== _currentUser?.id) return;
    _messages[channelId].splice(idx, 1);
    _notifyMessages(channelId, null);
  }

  // Users
  function getUsers() { return _users.map(u => ({ ...u, password: undefined })); }
  function getUserById(id) {
    const u = _users.find(u => u.id === id);
    return u ? { ...u, password: undefined } : null;
  }

  // Subscriptions (simulated realtime)
  function onMessages(channelId, cb) {
    if (!_subs.messages[channelId]) _subs.messages[channelId] = [];
    _subs.messages[channelId].push(cb);
    return () => {
      _subs.messages[channelId] = _subs.messages[channelId].filter(s => s !== cb);
    };
  }

  function onPresence(cb) {
    _subs.presence.push(cb);
    return () => { _subs.presence = _subs.presence.filter(s => s !== cb); };
  }

  function _notifyMessages(channelId, newMsg) {
    (_subs.messages[channelId] || []).forEach(cb => cb(getMessages(channelId), newMsg));
  }

  function _notifyPresence() {
    const users = getUsers();
    _subs.presence.forEach(cb => cb(users));
  }

  // Simulate other users typing and sending occasional messages
  function _startSimulation() {
    const BOT_USERS = ['u2','u3','u4'];
    const BOT_MSGS = {
      c1: [
        'Just pushed a hotfix for that auth issue',
        'Anyone reviewed the latest design doc?',
        'Heads up — staging is down, investigating',
        'Staging back up ✅',
        'PR review needed: #87',
        'The tests are green now 🎉',
        'Merging to main in 10 mins',
      ],
      c2: [
        'Running `npm audit` — a few moderate vulns to patch',
        'The new caching layer is 3x faster in benchmarks',
        'WebSocket reconnect logic merged',
        'Updated the API docs',
      ],
      c3: [
        'New icon set committed to the repo',
        'Color contrast passes WCAG AA ✓',
        'Mobile breakpoints finalized',
      ],
      c4: [
        'coffee > tea, change my mind',
        'Dark mode for everything, always',
        '😂',
        'weekend coming up finally',
      ],
    };

    setInterval(() => {
      if (!_currentUser) return;
      const channelIds = Object.keys(BOT_MSGS);
      const cid = channelIds[Math.floor(Math.random() * channelIds.length)];
      const uid = BOT_USERS[Math.floor(Math.random() * BOT_USERS.length)];
      const pool = BOT_MSGS[cid];
      const text = pool[Math.floor(Math.random() * pool.length)];

      // Notify typing first
      (_subs.messages[cid] || []).forEach(cb => cb(null, { type: 'typing', userId: uid, channelId: cid }));

      setTimeout(() => {
        const msg = {
          id: 'msg_sim_' + Date.now(),
          userId: uid,
          channelId: cid,
          text,
          file: null,
          timestamp: Date.now(),
          reactions: {},
          edited: false,
        };
        if (!_messages[cid]) _messages[cid] = [];
        _messages[cid].push(msg);
        _notifyMessages(cid, msg);
      }, 1200 + Math.random() * 800);

    }, 12000 + Math.random() * 8000);
  }

  _startSimulation();

  return {
    login, register, logout, restoreSession, getCurrentUser,
    getChannels, addChannel,
    getMessages, sendMessage, toggleReaction, deleteMessage,
    getUsers, getUserById,
    onMessages, onPresence,
  };
})();
