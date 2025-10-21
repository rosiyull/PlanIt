const STORAGE_KEY = 'planit-tasks-v1';
let tasks = [];
let isInitialized = false;
let lastClearedState = null;
let undoTimeout = null;
let lastConfettiTime = 0; // Track last confetti trigger
const CONFETTI_COOLDOWN = 2000; // 2 second cooldown

/* DOM refs */
const taskForm = document.getElementById('taskForm');
const taskName = document.getElementById('taskName');
const taskTime = document.getElementById('taskTime');
const taskPriority = document.getElementById('taskPriority');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const clearBtn = document.getElementById('clearBtn');
const sortBy = document.getElementById('sortBy');
const motivationEl = document.getElementById('motivation');

const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editId = document.getElementById('editId');
const editName = document.getElementById('editName');
const editTime = document.getElementById('editTime');
const editPriority = document.getElementById('editPriority');
const cancelEdit = document.getElementById('cancelEdit');

const themeToggle = document.getElementById('themeToggle');
const progressBarInner = document.getElementById('progressBarInner');
const progressText = document.getElementById('progressText');

/* utilities */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function saveTasks() { 
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); 
  } catch (err) {
    console.error('Failed to save tasks:', err);
  }
}

function loadTasks() { 
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      tasks = [];
      return;
    }
    
    const parsed = JSON.parse(raw);
    
    // Validate that parsed data is an array
    if (!Array.isArray(parsed)) {
      console.warn('Invalid tasks data in localStorage, resetting to empty array');
      tasks = [];
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    
    tasks = parsed;
  } catch (err) {
    console.error('Failed to load tasks from localStorage:', err);
    tasks = [];
    // Clear corrupted data
    localStorage.removeItem(STORAGE_KEY);
  }
}

/* color mapping for badges (Tailwind classes) */
function priorityBadgeClass(priority) {
  if (priority === 'high') return 'bg-red-600 text-white';
  if (priority === 'medium') return 'bg-yellow-400 text-black dark:bg-yellow-600 dark:text-white';
  return 'bg-green-600 text-white';
}

function priorityBorderClass(priority) {
  if (priority === 'high') return 'border-red-100';
  if (priority === 'medium') return 'border-yellow-100';
  return 'border-green-100';
}

/* escape HTML */
function escapeHtml(str='') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* confetti helper with cooldown */
function shootConfetti() {
  const now = Date.now();
  
  // Check cooldown to prevent multiple rapid triggers
  if (now - lastConfettiTime < CONFETTI_COOLDOWN) {
    return;
  }
  
  lastConfettiTime = now;
  
  if (typeof confetti === 'function') {
    confetti({ particleCount: 40, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 30, spread: 100, origin: { y: 0.6 } }), 250);
    setTimeout(() => confetti({ particleCount: 50, spread: 160, origin: { y: 0.6 } }), 500);
  }
}

/* render single task element */
function renderTaskItem(task) {
  const item = document.createElement('div');
  item.className = `flex items-start gap-3 p-3 rounded-lg border ${priorityBorderClass(task.priority)} transition-all duration-200`;
  if (task.completed) item.classList.add('opacity-60', 'line-through');

  item.setAttribute('data-id', task.id);

  item.innerHTML = `
    <div class="flex flex-col w-full">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <input type="checkbox" data-id="${task.id}" ${task.completed ? 'checked' : ''} class="w-4 h-4 accent-primary" aria-label="Tandai selesai" />
          <div>
            <div class="font-medium">${escapeHtml(task.name)}</div>
           <div class="text-xs text-slate-500 dark:text-slate-300">${escapeHtml(task.time || 'Waktu belum diatur')}</div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-1 rounded-md ${priorityBadgeClass(task.priority)}">${task.priority}</span>
          <button class="text-sm px-2 py-1 rounded border edit-btn hover:bg-gray-100 dark:hover:bg-slate-700" data-id="${task.id}" aria-label="Edit kegiatan">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="text-sm px-2 py-1 rounded border delete-btn hover:bg-gray-100 dark:hover:bg-slate-700" data-id="${task.id}" aria-label="Hapus kegiatan">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  item.classList.add('animate-fadeIn');
  item.style.transform = 'translateY(4px) scale(.995)';
  item.style.opacity = '0';
  setTimeout(() => {
    item.style.transition = 'transform 220ms ease-out, opacity 220ms ease-out';
    item.style.transform = '';
    item.style.opacity = '';
  }, 20);

  return item;
}

/* render all */
function renderTasks() {
  if (!taskList) return;
  
  taskList.innerHTML = '';
  if (emptyState) {
    emptyState.style.display = tasks.length ? 'none' : 'block';
  }

  tasks.forEach(task => {
    const el = renderTaskItem(task);
    taskList.appendChild(el);
  });

  // attach listeners
  taskList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', e => {
    const id = e.target.dataset.id;
    e.target.classList.add('scale-110');
    setTimeout(() => e.target.classList.remove('scale-110'), 180);
    toggleComplete(id);
  }));
  taskList.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', e => deleteTask(e.currentTarget.dataset.id)));
  taskList.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', e => openEditModal(e.currentTarget.dataset.id)));

  updateUIAfterRender();
}

/* update motivation & progress bar */
function updateUIAfterRender() {
  const remainingHigh = tasks.filter(t => !t.completed && t.priority === 'high').length;
  if (motivationEl) {
    motivationEl.textContent = remainingHigh > 0 ? `Ada ${remainingHigh} tugas PRIORITAS tinggi. Ayo selesaikan satu sekarang!` : tasks.some(t => !t.completed) ? 'Lanjutkan semangatmu!' : 'Semua tugas selesai 🎉';
  }

  // progress
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  if (progressBarInner && progressText) {
    progressBarInner.style.width = percent + '%';
    progressText.textContent = percent + '%';
    if (percent === 100 && total > 0) {
      progressBarInner.classList.add('shadow-lg');
      shootConfetti();
    } else {
      progressBarInner.classList.remove('shadow-lg');
    }
  }
}

function addTaskFromForm(e) {
  e.preventDefault();
  const name = taskName.value.trim();
  
  if (!name) return alert('Isi nama kegiatan');
  if (name.length > 200) {
    return alert('Nama kegiatan terlalu panjang (maksimal 200 karakter)');
  }
  
  const timeValue = taskTime.value;
  if (timeValue && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(timeValue)) {
    return alert('Format waktu tidak valid. Gunakan format 24-jam (HH:MM)');
  }
  
  const priorityValue = (taskPriority.value || 'medium').toLowerCase();
  if (!['low', 'medium', 'high'].includes(priorityValue)) {
    return alert('Prioritas tidak valid');
  }
  
  const newTask = {
    id: generateId(),
    name,
    time: timeValue || null,
    priority: priorityValue,
    completed: false,
    createdAt: Date.now()
  };
  
  tasks.push(newTask);
  saveAndRender();
  taskForm.reset();
  if (taskName) taskName.focus();
}

/* toggle complete */
function toggleComplete(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  
  t.completed = !t.completed;
  
  if (t.completed && !t.completedAt) {
    t.completedAt = Date.now();
  } else if (!t.completed) {
    delete t.completedAt;
  }
  
  saveAndRender();
  checkForConfettiTrigger();
}

function checkForConfettiTrigger() {
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  
  if (done === total && total > 0) {
    const latestCompletion = tasks
      .filter(t => t.completed && t.completedAt)
      .sort((a, b) => b.completedAt - a.completedAt)[0];
    
    if (latestCompletion && Date.now() - latestCompletion.completedAt < 1000) {
      shootConfetti();
    }
  }
}

/* delete with animation */
function deleteTask(id) {
  if (!confirm('Hapus tugas ini?')) return;
  const el = taskList ? taskList.querySelector(`[data-id="${id}"]`) : null;
  if (el) {
    el.style.transition = 'opacity 180ms ease-in, transform 180ms ease-in';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px) scale(.98)';
    el.style.pointerEvents = 'none';
    setTimeout(() => {
      tasks = tasks.filter(t => t.id !== id);
      saveAndRender();
    }, 180);
  } else {
    tasks = tasks.filter(t => t.id !== id);
    saveAndRender();
  }
}

/* edit modal */
let modalTriggerElement = null;

function getFocusableElements(container) {
  return container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
}

function openEditModal(id) {
  // Safety check: ensure tasks array exists and has items
  if (!Array.isArray(tasks) || tasks.length === 0) {
    alert('Tidak ada tugas untuk diedit');
    return;
  }
  
  const t = tasks.find(x => x.id === id);
  
  // Safety check: ensure task exists
  if (!t) {
    alert('Tugas tidak ditemukan');
    return;
  }
  
  if (!editModal) return;
  
  modalTriggerElement = document.activeElement;
  
  if (editId) editId.value = t.id;
  if (editName) editName.value = t.name;
  if (editTime) editTime.value = t.time || '';
  if (editPriority) editPriority.value = t.priority;
  
  editModal.classList.remove('hidden');
  editModal.classList.add('flex');
  
  setTimeout(() => {
    if (editName) {
      editName.focus();
      editName.select();
    }
  }, 50);
  
  setupFocusTrap();
}

function closeEditModal() {
  if (!editModal) return;
  
  editModal.classList.add('hidden');
  editModal.classList.remove('flex');
  
  if (modalTriggerElement && typeof modalTriggerElement.focus === 'function') {
    modalTriggerElement.focus();
    modalTriggerElement = null;
  }
  
  removeFocusTrap();
}

let focusTrapHandler = null;

function setupFocusTrap() {
  if (!editModal) return;
  
  focusTrapHandler = function(e) {
    if (e.key !== 'Tab') return;
    
    const focusableElements = getFocusableElements(editModal);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    }
    else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  };
  
  editModal.addEventListener('keydown', focusTrapHandler);
}

function removeFocusTrap() {
  if (focusTrapHandler && editModal) {
    editModal.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
  }
}

function saveEdit(e) {
  e.preventDefault();
  
  const taskId = editId ? editId.value : null;
  
  // Safety check: ensure tasks array exists
  if (!Array.isArray(tasks)) {
    alert('Error: Data tugas tidak valid');
    closeEditModal();
    return;
  }
  
  const task = tasks.find(t => t.id === taskId);
  
  // Safety check: ensure task exists
  if (!task) {
    alert('Tugas tidak ditemukan');
    closeEditModal();
    return;
  }
  
  const newName = editName ? editName.value.trim() : '';
  if (!newName) {
    alert('Nama kegiatan tidak boleh kosong');
    return;
  }
  if (newName.length > 200) {
    alert('Nama kegiatan terlalu panjang (maksimal 200 karakter)');
    return;
  }
  
  const newTime = editTime ? editTime.value : '';
  if (newTime && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(newTime)) {
    alert('Format waktu tidak valid. Gunakan format 24-jam (HH:MM)');
    return;
  }
  
  const newPriority = editPriority ? editPriority.value.toLowerCase() : 'medium';
  if (!['low', 'medium', 'high'].includes(newPriority)) {
    alert('Prioritas tidak valid');
    return;
  }
  
  task.name = newName;
  task.time = newTime || null;
  task.priority = newPriority;
  
  saveAndRender();
  closeEditModal();
}

function showUndoSnackbar() {
  const snackbar = document.getElementById('undoSnackbar');
  const undoBtn = document.getElementById('undoBtn');
  
  if (!snackbar) return;
  
  snackbar.classList.remove('hidden');
  snackbar.classList.add('flex');
  
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    hideUndoSnackbar();
    lastClearedState = null;
  }, 5000);
  
  // Remove any existing listeners before adding new one
  if (undoBtn) {
    const newUndoBtn = undoBtn.cloneNode(true);
    undoBtn.parentNode.replaceChild(newUndoBtn, undoBtn);
    newUndoBtn.addEventListener('click', restoreClearedForm);
  }
}

function hideUndoSnackbar() {
  const snackbar = document.getElementById('undoSnackbar');
  if (!snackbar) return;
  
  snackbar.classList.add('hidden');
  snackbar.classList.remove('flex');
}

function restoreClearedForm() {
  if (lastClearedState) {
    if (taskName) taskName.value = lastClearedState.name;
    if (taskTime) taskTime.value = lastClearedState.time;
    if (taskPriority) taskPriority.value = lastClearedState.priority;
    lastClearedState = null;
  }
  hideUndoSnackbar();
  if (taskName) taskName.focus();
}

/* FIXED: Prevent double rendering */
function saveAndRender() { 
  saveTasks(); 
  sortAndRender(); 
  // renderTasks() is now only called once - removed duplicate call
}

function sortAndRender() {
  const mode = sortBy ? sortBy.value : 'time';
  const order = { high: 0, medium: 1, low: 2 };
  if (mode === 'time') tasks.sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  if (mode === 'priority') tasks.sort((a,b)=>order[a.priority] - order[b.priority]);
  if (mode === 'created') tasks.sort((a,b)=>b.createdAt - a.createdAt);
  
  // Call renderTasks() only once here
  renderTasks();
}

function loadTheme() {
  const savedTheme = localStorage.getItem('planit-theme');
  const isDark = savedTheme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  
  if (themeToggle) {
    themeToggle.checked = isDark;
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('planit-theme', isDark ? 'dark' : 'light');
}

function requestNotificationPermission() {
  if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

/* init */
function init() {
  if (isInitialized) {
    console.warn('init() called multiple times - ignoring duplicate call');
    return;
  }
  isInitialized = true;
  
  loadTasks();
  loadTheme();
  sortAndRender();
  
  if (taskForm) taskForm.addEventListener('submit', addTaskFromForm);
  if (editForm) editForm.addEventListener('submit', saveEdit);
  if (cancelEdit) cancelEdit.addEventListener('click', closeEditModal);
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const hasName = taskName && taskName.value.trim().length > 0;
      const hasTime = taskTime && taskTime.value.length > 0;
      const hasNonDefaultPriority = taskPriority && taskPriority.value !== 'medium';
      const hasContent = hasName || hasTime || hasNonDefaultPriority;
      
      if (hasContent) {
        lastClearedState = {
          name: taskName ? taskName.value : '',
          time: taskTime ? taskTime.value : '',
          priority: taskPriority ? taskPriority.value : 'medium'
        };
        
        if (taskForm) taskForm.reset();
        if (taskName) taskName.focus();
        
        showUndoSnackbar();
      } else {
        if (taskForm) taskForm.reset();
      }
    });
  }
  
  if (sortBy) sortBy.addEventListener('change', () => { sortAndRender(); });
  if (themeToggle) themeToggle.addEventListener('change', toggleTheme);
  
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditModal(); });
  requestNotificationPermission();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}