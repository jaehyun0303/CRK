(function () {
  const gate = document.getElementById('gate');
  const dashboard = document.getElementById('dashboard');
  const keyInput = document.getElementById('admin-key');
  const gateError = document.getElementById('gate-error');
  const rowsEl = document.getElementById('dash-rows');
  const statsEl = document.getElementById('dash-stats');
  const toastEl = document.getElementById('toast');

  let adminKey = sessionStorage.getItem('adminKey') || '';
  let courses = {};
  let knownIds = new Set();
  let firstLoad = true;

  function formatWon(n) {
    return n.toLocaleString('ko-KR') + '원';
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  async function loadCourses() {
    const res = await fetch('/api/courses');
    const data = await res.json();
    courses = data.courses;
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('쿠키사 수강신청', { body: text });
    }
    document.title = '🔔 새 수강신청 도착 · 쿠키사';
    setTimeout(() => { document.title = '쿠키사 수강신청 · 관리자'; }, 5000);
  }

  async function fetchRegistrations() {
    const res = await fetch('/api/admin/registrations', {
      headers: { 'x-admin-key': adminKey },
    });
    if (res.status === 401) {
      sessionStorage.removeItem('adminKey');
      location.reload();
      return;
    }
    const data = await res.json();
    render(data.registrations);
  }

  function render(list) {
    const completed = list.filter((r) => r.status === 'completed').length;
    statsEl.innerHTML = `
      <span>총 신청 <b>${list.length}</b></span>
      <span>결제 완료 <b>${completed}</b></span>
      <span>결제 대기 <b>${list.length - completed}</b></span>
    `;

    const newOnes = list.filter((r) => !knownIds.has(r.id));
    if (!firstLoad && newOnes.length > 0) {
      const latest = newOnes[0];
      showToast(`${latest.name}(${latest.studentId})님이 수강신청했습니다.`);
    }

    rowsEl.innerHTML = '';
    list.forEach((r) => {
      const tr = document.createElement('tr');
      if (!knownIds.has(r.id) && !firstLoad) tr.classList.add('new-row');
      const courseNames = r.courses.map((c) => (courses[c] ? courses[c].name : c)).join(', ');
      const statusHtml = r.status === 'completed'
        ? '<span class="status-badge status-completed">결제 완료</span>'
        : '<span class="status-badge status-pending">결제 대기</span>';
      tr.innerHTML = `
        <td>${formatTime(r.createdAt)}</td>
        <td>${r.studentId}</td>
        <td>${r.name}</td>
        <td>${courseNames}</td>
        <td>${formatWon(r.amount)}</td>
        <td>${statusHtml}</td>
      `;
      rowsEl.appendChild(tr);
    });

    knownIds = new Set(list.map((r) => r.id));
    firstLoad = false;
  }

  async function enter() {
    gateError.hidden = true;
    try {
      const res = await fetch('/api/admin/registrations', {
        headers: { 'x-admin-key': adminKey },
      });
      if (!res.ok) throw new Error('비밀번호가 올바르지 않습니다.');
      sessionStorage.setItem('adminKey', adminKey);
      gate.hidden = true;
      dashboard.hidden = false;
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      await loadCourses();
      await fetchRegistrations();
      setInterval(fetchRegistrations, 5000);
    } catch (err) {
      gateError.textContent = err.message;
      gateError.hidden = false;
    }
  }

  document.getElementById('gate-submit').addEventListener('click', () => {
    adminKey = keyInput.value.trim();
    enter();
  });
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('gate-submit').click();
  });

  if (adminKey) enter();
})();
