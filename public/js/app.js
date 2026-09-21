(function () {
  const state = {
    studentId: '',
    name: '',
    courses: {},
    priceByCount: {},
    selected: new Set(),
    registration: null,
  };

  const views = {
    login: document.getElementById('view-login'),
    register: document.getElementById('view-register'),
    payment: document.getElementById('view-payment'),
    done: document.getElementById('view-done'),
  };

  function showView(name) {
    Object.values(views).forEach((v) => v.classList.remove('active'));
    views[name].classList.add('active');
    window.scrollTo({ top: 0 });
  }

  function formatWon(n) {
    return n.toLocaleString('ko-KR') + '원';
  }

  async function loadCourses() {
    const res = await fetch('/api/courses');
    const data = await res.json();
    state.courses = data.courses;
    state.priceByCount = data.priceByCount;
    renderCourseGrid();
  }

  function renderCourseGrid() {
    const grid = document.getElementById('course-grid');
    grid.innerHTML = '';
    Object.entries(state.courses).forEach(([code, course]) => {
      const card = document.createElement('div');
      card.className = 'course-card';
      card.dataset.code = code;
      card.innerHTML = `
        <img src="${course.image}" alt="${course.name} 교재 표지" />
        <div class="course-check">✓</div>
        <div class="course-overlay">
          <div class="course-name">${course.name}</div>
        </div>
      `;
      card.addEventListener('click', () => toggleCourse(code, card));
      grid.appendChild(card);
    });
  }

  function toggleCourse(code, card) {
    if (state.selected.has(code)) {
      state.selected.delete(code);
      card.classList.remove('selected');
    } else {
      if (state.selected.size >= 3) return;
      state.selected.add(code);
      card.classList.add('selected');
    }
    updateSelectedSummary();
  }

  function updateSelectedSummary() {
    const el = document.getElementById('selected-summary');
    const count = state.selected.size;
    if (count === 0) {
      el.textContent = '선택한 과목이 없습니다.';
      return;
    }
    const names = [...state.selected].map((c) => state.courses[c].name).join(', ');
    const price = state.priceByCount[count];
    el.textContent = `선택: ${names} · 교재 구매 금액 ${formatWon(price)}`;
  }

  // ---------- Login ----------
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const studentId = document.getElementById('input-student-id').value.trim();
    const name = document.getElementById('input-name').value.trim();
    const errorEl = document.getElementById('login-error');

    if (!studentId || !name) {
      errorEl.textContent = '학번과 이름을 모두 입력해주세요.';
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    state.studentId = studentId;
    state.name = name;
    document.getElementById('topbar-user').textContent = `${studentId} · ${name}`;
    showView('register');
  });

  // ---------- Register ----------
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('register-error');
    errorEl.hidden = true;

    if (state.selected.size < 1) {
      errorEl.textContent = '선택과목을 1개 이상 선택해주세요.';
      errorEl.hidden = false;
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: state.studentId,
          name: state.name,
          courses: [...state.selected],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수강신청에 실패했습니다.');

      state.registration = data.registration;
      renderPaymentView();
      showView('payment');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  const BANK_NAME = '토스뱅크';
  const BANK_ACCOUNT_NO = '190865621190'; // 1908-6562-1190, 하이픈 제거

  const BANK_ACCOUNT_DISPLAY = '1908-6562-1190';

  function buildTossDeepLink(amount) {
    const params = new URLSearchParams({
      bank: BANK_NAME,
      accountNo: BANK_ACCOUNT_NO,
      amount: String(amount),
    });
    return `supertoss://send?${params.toString()}`;
  }

  document.getElementById('btn-copy-account').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(BANK_ACCOUNT_DISPLAY);
    } catch {
      // Clipboard API can fail on very old browsers or without HTTPS; fall back silently.
    }
    const original = btn.textContent;
    btn.textContent = '복사됨';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  });

  function renderPaymentView() {
    const reg = state.registration;
    const names = reg.courses.map((c) => state.courses[c].name).join(', ');
    document.getElementById('order-courses').innerHTML = `<span>선택 과목</span><span>${names}</span>`;
    document.getElementById('order-amount').textContent = formatWon(reg.amount);
    document.getElementById('btn-open-toss').href = buildTossDeepLink(reg.amount);
  }

  // ---------- Payment ----------
  document.getElementById('btn-confirm-payment').addEventListener('click', async (e) => {
    const errorEl = document.getElementById('payment-error');
    errorEl.hidden = true;
    const btn = e.target;
    btn.disabled = true;

    try {
      const res = await fetch(`/api/register/${state.registration.id}/confirm-payment`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '결제 확인에 실패했습니다.');

      state.registration = data.registration;
      renderDoneView();
      showView('done');
      startStatusPolling();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });

  function renderDoneView() {
    const reg = state.registration;
    const names = reg.courses.map((c) => state.courses[c].name).join(', ');
    const summaryEl = document.getElementById('done-summary');
    const iconEl = document.getElementById('done-icon');
    const titleEl = document.getElementById('done-title');
    const noteEl = document.getElementById('done-note');

    if (reg.status === 'completed') {
      iconEl.textContent = '✓';
      iconEl.classList.remove('done-check-pending');
      titleEl.textContent = '수강신청이 완료되었습니다';
      summaryEl.textContent = `${state.name}(${state.studentId})님, ${names} 수강신청이 최종 승인되었습니다.`;
      noteEl.textContent = '문제가 있을 경우 별도로 안내드립니다.';
    } else {
      iconEl.textContent = '…';
      iconEl.classList.add('done-check-pending');
      titleEl.textContent = '입금 확인 중입니다';
      summaryEl.textContent = `${state.name}(${state.studentId})님, ${names} 신청 건의 입금 확인을 기다리고 있습니다.`;
      noteEl.textContent = '관리자가 입금 내역을 확인하는 중입니다. 확인이 완료되면 이 화면이 자동으로 바뀝니다.';
    }
  }

  let pollTimer = null;
  function startStatusPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!state.registration || state.registration.status === 'completed') {
        clearInterval(pollTimer);
        return;
      }
      try {
        const res = await fetch(`/api/register/${state.registration.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const prevStatus = state.registration.status;
        state.registration = data.registration;
        if (state.registration.status !== prevStatus) {
          renderDoneView();
        }
        if (state.registration.status === 'completed') {
          clearInterval(pollTimer);
        }
      } catch {
        // ignore transient network errors and keep polling
      }
    }, 4000);
  }

  loadCourses();
})();
