/**
 * SyncWave — Auth Page Logic
 */

// ---- Grid canvas background ----
(function initGrid() {
  const canvas = document.getElementById('gridCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0,229,255,0.07)';
    ctx.lineWidth = 1;
    const gap = 40;
    for (let x = 0; x < canvas.width; x += gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gap) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }
  window.addEventListener('resize', resize);
  resize();
})();

// ---- Tab switching ----
const tabs = document.querySelectorAll('.auth-tab');
const forms = document.querySelectorAll('.auth-form');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    forms.forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Form').classList.add('active');
  });
});

// ---- Color picker ----
let selectedColor = '#00e5ff';
document.querySelectorAll('.color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    selectedColor = sw.dataset.color;
  });
});

// ---- Login ----
document.getElementById('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.textContent = '';
  if (!username || !password) { err.textContent = 'All fields required.'; return; }

  // Load mock-db inline for auth page (simplified)
  const users = JSON.parse(localStorage.getItem('sw_users') || 'null') || [
    { id: 'u1', username: 'alice', name: 'Alice Chen', color: '#00e5ff', password: 'demo123', role: 'admin' },
    { id: 'u2', username: 'bob',   name: 'Bob Hartley', color: '#ff4d6d', password: 'demo123', role: 'member' },
    { id: 'u3', username: 'carla', name: 'Carla Moss',  color: '#bd93f9', password: 'demo123', role: 'member' },
    { id: 'u4', username: 'dev',   name: 'Dev Sharma',  color: '#69ff47', password: 'demo123', role: 'member' },
    { id: 'u5', username: 'erin',  name: 'Erin Walsh',  color: '#ffd60a', password: 'demo123', role: 'member' },
  ];

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) { err.textContent = 'Invalid username or password.'; return; }

  localStorage.setItem('sw_user_id', user.id);
  localStorage.setItem('sw_user', JSON.stringify(user));
  window.location.href = 'app.html';
});

// ---- Register ----
document.getElementById('registerForm').addEventListener('submit', e => {
  e.preventDefault();
  const name     = document.getElementById('regName').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const err      = document.getElementById('regError');
  err.textContent = '';

  if (!name || !username || !password) { err.textContent = 'All fields required.'; return; }
  if (password.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
  if (!/^[a-z0-9_]+$/i.test(username)) { err.textContent = 'Username: letters, numbers, underscores only.'; return; }

  let users = JSON.parse(localStorage.getItem('sw_users') || 'null') || [
    { id: 'u1', username: 'alice', name: 'Alice Chen', color: '#00e5ff', password: 'demo123', role: 'admin' },
    { id: 'u2', username: 'bob',   name: 'Bob Hartley', color: '#ff4d6d', password: 'demo123', role: 'member' },
    { id: 'u3', username: 'carla', name: 'Carla Moss',  color: '#bd93f9', password: 'demo123', role: 'member' },
    { id: 'u4', username: 'dev',   name: 'Dev Sharma',  color: '#69ff47', password: 'demo123', role: 'member' },
    { id: 'u5', username: 'erin',  name: 'Erin Walsh',  color: '#ffd60a', password: 'demo123', role: 'member' },
  ];

  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    err.textContent = 'Username already taken.'; return;
  }

  const newUser = {
    id: 'u_' + Date.now(),
    username: username.toLowerCase(),
    name, color: selectedColor, password, role: 'member',
  };
  users.push(newUser);
  localStorage.setItem('sw_users', JSON.stringify(users));
  localStorage.setItem('sw_user_id', newUser.id);
  localStorage.setItem('sw_user', JSON.stringify(newUser));
  window.location.href = 'app.html';
});

// ---- Redirect if already logged in ----
if (localStorage.getItem('sw_user_id') && localStorage.getItem('sw_user')) {
  window.location.href = 'app.html';
}
