/**
 * 锻炼板块
 * 周一到周日竖向排列打卡
 * 月度曲线图（蓝/紫/红三色）
 */
const WorkoutModule = {
  async render() {
    const all = (await DB.list('workouts')).filter(w => !w.deleted_at);
    const today = todayKey();
    const todayRecs = all.filter(w => w.date === today);

    // 本周记录
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
    const weekRecs = all.filter(w => new Date(w.date) >= weekStart);

    const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];

    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">🏃🏻‍♀️ 锻炼板块</div>
          <button class="btn btn--primary btn--sm" onclick="WorkoutModule.add()">+ 今日打卡</button>
        </div>

        <!-- 今日运动 -->
        <div class="card mb-4">
          <div class="card-title">🌟 今日运动（${today}）</div>
          ${todayRecs.length === 0 ? '<p class="text-faint text-sm">今天还没有运动打卡</p>' : `
            <div class="flex flex-col gap-2">
              ${todayRecs.map(w => `
                <div class="list-item">
                  <span style="font-size:20px">${this._intensityIcon(w.intensity)}</span>
                  <div class="list-item__main">
                    <div class="list-item__title">${w.project} · ${w.duration}分钟</div>
                    <div class="list-item__sub">强度:${w.intensity} · 身体:${'☆'.repeat(w.body_score||3)} · 心理:${'☆'.repeat(w.mind_score||3)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- 一周打卡（竖向） -->
        <div class="card mb-4">
          <div class="card-title">📅 本周打卡</div>
          <div class="week-checkin">
            ${[1,2,3,4,5,6,0].map(d => {
              const dayRecs = weekRecs.filter(w => new Date(w.date).getDay() === d);
              return `
                <div class="week-checkin__day">
                  <div class="week-checkin__day-label">
                    ${weekdays[d]}
                  </div>
                  <div class="week-checkin__day-items">
                    ${dayRecs.length === 0
                      ? '<span class="text-faint text-xs">未打卡</span>'
                      : dayRecs.map(w => `
                        <div class="week-checkin__item">
                          ${w.project} · ${w.duration}分钟 · 身体${'☆'.repeat(w.body_score||3)}
                        </div>
                      `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 一周总结 -->
        <div class="card mb-4">
          <div class="card-title">📊 一周总结复盘</div>
          ${this._weekSummary(weekRecs)}
        </div>

        <!-- 月度曲线 -->
        <div class="card mb-4">
          <div class="card-title">📈 本月身体感受曲线</div>
          <div id="monthChart" style="min-height:280px"></div>
          <div class="flex gap-3 mt-3 text-xs">
            <span style="color:#7090B0">● 不佳(1-2☆)</span>
            <span style="color:#8A4E7B">● 平和(3-4☆)</span>
            <span style="color:#DB5A6B">● 极佳(5☆)</span>
          </div>
          <div class="ai-disclaimer">曲线完全依据每日实际记录的☆数量绘制，不可手动修改</div>
        </div>

        <!-- 一月变化观察 -->
        <div class="card">
          <div class="card-title">🔍 一月变化观察</div>
          ${this._monthObservation(all)}
          <div class="ai-disclaimer">此功能仅用于个人自我观察和复盘，不构成医学诊断或心理治疗建议</div>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
    this._renderMonthChart(all);
  },

  _intensityIcon(intensity) {
    if (!intensity) return '🏃';
    if (intensity.includes('低')) return '🚶';
    if (intensity.includes('高')) return '🔥';
    return '🏃';
  },

  _weekSummary(recs) {
    if (recs.length === 0) return '<p class="text-faint text-sm">本周还没有锻炼记录</p>';
    const projectCount = {};
    recs.forEach(w => { projectCount[w.project] = (projectCount[w.project]||0)+1; });
    const bodyAvg = (recs.reduce((s,w)=>s+(w.body_score||3),0)/recs.length).toFixed(1);
    const mindWords = {};
    recs.forEach(w => { if (w.mind_feeling) mindWords[w.mind_feeling] = (mindWords[w.mind_feeling]||0)+1; });
    return `
      <ul class="text-sm" style="line-height:2">
        <li>📊 本周运动频率: <b>${recs.length} 次</b></li>
        <li>🏋️ 类型分布: ${Object.entries(projectCount).map(([p,c])=>`${p}(${c})`).join('、')}</li>
        <li>💪 身体感受平均评分: <b>${bodyAvg} ☆</b></li>
        <li>🧠 心理感受高频词: ${Object.entries(mindWords).sort((a,b)=>b[1]-a[1]).map(([w,c])=>`${w}(${c})`).join('、')||'-'}</li>
      </ul>
    `;
  },

  _monthObservation(all) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRecs = all.filter(w => new Date(w.date) >= monthStart);
    if (monthRecs.length < 2) return '<p class="text-faint text-sm">本月记录不足，继续加油记录吧</p>';
    const bodyScores = monthRecs.map(w => w.body_score||3);
    const trend = bodyScores[bodyScores.length-1] > bodyScores[0] ? '上升' : (bodyScores[bodyScores.length-1] < bodyScores[0] ? '下降' : '稳定');
    const avg = (bodyScores.reduce((a,b)=>a+b,0)/bodyScores.length).toFixed(1);
    return `
      <ul class="text-sm" style="line-height:2">
        <li>📈 本月锻炼: <b>${monthRecs.length} 次</b></li>
        <li>💪 身体感受趋势: <b>${trend}</b>（平均 ${avg} ☆）</li>
        <li>📊 体能状态: ${avg >= 4 ? '整体感受良好' : avg >= 3 ? '整体平稳' : '需要注意休息'}</li>
      </ul>
    `;
  },

  async _renderMonthChart(all) {
    const el = document.getElementById('monthChart');
    if (!el || typeof Chart === 'undefined') return;
    const now = new Date();
    const year = now.getFullYear(); const month = now.getMonth();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    // 每日取最高分（如果一天多次取最高）
    const dailyBest = {};
    all.forEach(w => {
      const d = new Date(w.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const score = w.body_score || 3;
        if (!dailyBest[day] || score > dailyBest[day]) dailyBest[day] = score;
      }
    });
    const labels = []; const data = []; const colors = [];
    for (let d = 1; d <= daysInMonth; d++) {
      labels.push(`${d}`);
      if (dailyBest[d]) {
        data.push(dailyBest[d]);
        colors.push(dailyBest[d] <= 2 ? '#7090B0' : (dailyBest[d] <= 4 ? '#8A4E7B' : '#DB5A6B'));
      } else {
        data.push(null);
        colors.push('#E0E0E0');
      }
    }
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '260px';
    el.innerHTML = '';
    el.appendChild(canvas);
    new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [{
        data, borderColor: '#8A4E7B', tension: 0.3,
        fill: false, spanGaps: true,
        pointBackgroundColor: colors, pointRadius: 5, pointHoverRadius: 7,
      }]},
      options: {
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => {
            const v = ctx.parsed.y;
            if (v == null) return '未记录';
            return `${v} ☆ (${v<=2?'不佳':v<=4?'平和':'极佳'})`;
          }}}
        },
        scales: { y: { min: 0, max: 5, ticks: { stepSize: 1, callback: v => v+'☆' } },
                  x: { title: { display: true, text: '日期' } } },
        maintainAspectRatio: false,
      },
    });
  },

  async add() {
    const today = todayKey();
    UI.modal('今日运动打卡 🏃', `
      <div class="field">
        <label class="field__label">运动项目</label>
        <input class="input" id="wProject" placeholder="如：跑步、瑜伽、跳绳">
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">时长（分钟）</label>
          <input class="input" type="number" id="wDuration" min="1">
        </div>
        <div class="field">
          <label class="field__label">强度</label>
          <select class="select" id="wIntensity">
            <option>低强度</option>
            <option>中强度</option>
            <option>高强度</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field__label">身体感受</label>
        <input class="input" id="wBody" placeholder="如：肌肉酸痛/轻松/紧绷">
      </div>
      <div class="field">
        <label class="field__label">身体感受评分</label>
        <div class="tag-select" id="bodyScore">
          ${[1,2,3,4,5].map(s => `<div class="tag-chip" onclick="WorkoutModule._selScore(this,'body',${s})">${'☆'.repeat(s)}</div>`).join('')}
        </div>
        <div class="field__hint">1-2☆不佳(蓝) · 3-4☆平和(紫) · 5☆极佳(红)</div>
      </div>
      <div class="field">
        <label class="field__label">心理感受</label>
        <input class="input" id="wMind" placeholder="如：释放/疲惫/成就感">
      </div>
      <div class="field">
        <label class="field__label">心理感受评分</label>
        <div class="tag-select" id="mindScore">
          ${[1,2,3,4,5].map(s => `<div class="tag-chip" onclick="WorkoutModule._selScore(this,'mind',${s})">${'☆'.repeat(s)}</div>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field__label">日期</label>
        <input class="input" type="date" id="wDate" value="${today}">
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="WorkoutModule._save()">保存打卡</button>
      </div>
    `);
    this._scores = { body: 3, mind: 3 };
  },

  _selScore(el, type, score) {
    el.parentElement.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this._scores[type] = score;
  },

  async _save() {
    const project = document.getElementById('wProject').value.trim();
    if (!project) { UI.toast('请填写运动项目','error'); return; }
    await DB.save('workouts', {
      project,
      duration: parseInt(document.getElementById('wDuration').value) || 0,
      intensity: document.getElementById('wIntensity').value,
      body_feeling: document.getElementById('wBody').value,
      body_score: this._scores.body,
      mind_feeling: document.getElementById('wMind').value,
      mind_score: this._scores.mind,
      date: document.getElementById('wDate').value,
    });
    UI.closeModal();
    UI.toast('打卡成功！','success');
    this.render();
  },
};
