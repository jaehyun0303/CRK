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

  const STATUS_LABEL = {
    pending_payment: { text: '입금 대기', cls: 'status-pending' },
    payment_claimed: { text: '입금 확인 필요', cls: 'status-claimed' },
    completed: { text: '수강신청 완료', cls: 'status-completed' },
  };

  function render(list) {
    const completed = list.filter((r) => r.status === 'completed').length;
    const claimed = list.filter((r) => r.status === 'payment_claimed').length;
    statsEl.innerHTML = `
      <span>총 신청 <b>${list.length}</b></span>
      <span>수강신청 완료 <b>${completed}</b></span>
      <span>입금 확인 필요 <b>${claimed}</b></span>
    `;

    const newlyClaimed = list.filter(
      (r) => r.status === 'payment_claimed' && !knownIds.has(r.id + ':' + r.status)
    );
    if (!firstLoad && newlyClaimed.length > 0) {
      const latest = newlyClaimed[0];
      showToast(`${latest.name}(${latest.studentId})님이 입금 완료를 알려왔습니다. 확인해주세요.`);
    }

    rowsEl.innerHTML = '';
    list.forEach((r) => {
      const tr = document.createElement('tr');
      if (!knownIds.has(r.id + ':' + r.status) && !firstLoad) tr.classList.add('new-row');
      const courseNames = r.courses.map((c) => (courses[c] ? courses[c].name : c)).join(', ');
      const status = STATUS_LABEL[r.status] || { text: r.status, cls: 'status-pending' };
      const statusHtml = `<span class="status-badge ${status.cls}">${status.text}</span>`;

      let actionsHtml = '<span class="dash-muted">-</span>';
      if (r.status === 'payment_claimed') {
        actionsHtml = `
          <button class="action-btn action-confirm" data-id="${r.id}" data-action="confirm">입금 확인</button>
          <button class="action-btn action-reject" data-id="${r.id}" data-action="reject">반려</button>
        `;
      } else if (r.status === 'completed') {
        actionsHtml = `<button class="action-btn action-reject" data-id="${r.id}" data-action="reject">되돌리기</button>`;
      }

      tr.innerHTML = `
        <td>${formatTime(r.createdAt)}</td>
        <td>${r.studentId}</td>
        <td>${r.name}</td>
        <td>${courseNames}</td>
        <td>${formatWon(r.amount)}</td>
        <td>${statusHtml}</td>
        <td>${actionsHtml}</td>
      `;
      rowsEl.appendChild(tr);
    });

    knownIds = new Set(list.map((r) => r.id + ':' + r.status));
    firstLoad = false;
  }

  rowsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;
    const { id, action } = btn.dataset;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/admin/registrations/${id}/${action}`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
      });
      if (!res.ok) throw new Error('처리에 실패했습니다.');
      await fetchRegistrations();
    } catch (err) {
      btn.disabled = false;
      alert(err.message);
    }
  });

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
