/**
 * 工作与专注计时模块
 * 支持自由计时、番茄钟、刷新恢复、补录、统计
 */
const TimerModule = {
  _tickTimer: null,
  _running: null,  // 当前运行中的计时器缓存

  async render() {
    const taskTypes = await DB.getSetting('task_types') || ['阅读','锻炼','电影/电影解说','纪录片','复盘阿苡视频','其他'];
    const running = (await DB.list('timer_running')).filter(t => !t.deleted_at);
    const todayRecords = (await DB.list('timers')).filter(t => !t.deleted_at && t.start_time?.startsWith(todayKey()));

    const html = `
      <div class="page">
        <div class="page__title">⏱️ 工作与专注计时</div>

        <!-- 当前计时 -->
        <div class="card mb-4" id="timerPanel" style="${running.length>0?'border:1px solid var(--color-rose);background:rgba(241,148,166,0.04)':''}">
          ${running.length > 0 ? this._renderRunning(running[0]) : this._renderStartForm(taskTypes)}
        </div>

        <!-- 今日记录 -->
        <div class="card mb-4">
          <div class="card-header">
            <div class="card-title">📋 今日记录</div>
            <button class="btn btn--sm btn--ghost" onclick="TimerModule.addManual()">+ 补录</button>
          </div>
          ${todayRecords.length === 0 ? UI.empty('⏰','今天还没有计时记录') : `
            <div class="flex flex-col gap-2">
              ${todayRecords.sort((a,b)=>b.start_time.localeCompare(a.start_time)).map(t => `
                <div class="list-item">
                  <span style="font-size:20px">${this._typeIcon(t.task_type)}</span>
                  <div class="list-item__main">
                    <div class="list-item__title">${t.task_name}</div>
                    <div class="list-item__sub">${t.task_type} · ${this._fmtDur(t.duration)} · ${new Date(t.start_time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}-${new Date(t.end_time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                  <button class="btn btn--sm btn--ghost" onclick="TimerModule.viewDetail('${t.id}')">详情</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- 统计 -->
        <div class="grid grid-3 mb-4">
          <div class="card">
            <div class="card-title text-sm">📅 今日</div>
            <div class="text-2xl" style="color:var(--color-primary);font-weight:600">${this._fmtDur(todayRecords.reduce((s,t)=>s+(t.duration||0),0))}</div>
            <div class="text-faint text-xs mt-1">${todayRecords.length} 次计时</div>
          </div>
          <div class="card">
            <div class="card-title text-sm">📆 本周</div>
            <div class="text-2xl" style="color:var(--color-rose);font-weight:600" id="weekStat">-</div>
            <div class="text-faint text-xs mt-1" id="weekCount">-</div>
          </div>
          <div class="card">
            <div class="card-title text-sm">🗓️ 本月</div>
            <div class="text-2xl" style="color:var(--color-wisteria);font-weight:600" id="monthStat">-</div>
            <div class="text-faint text-xs mt-1" id="monthCount">-</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">📊 按类型统计</div>
          <div id="typeStatChart" style="min-height:200px"></div>
        </div>

        <div class="flex gap-3 mt-4">
          <button class="btn flex-1" onclick="TimerModule.showStats('day')">日统计</button>
          <button class="btn flex-1" onclick="TimerModule.showStats('week')">周统计</button>
          <button class="btn flex-1" onclick="TimerModule.showStats('month')">月统计</button>
          <button class="btn flex-1" onclick="TimerModule.showStats('year')">年统计</button>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;

    // 启动计时显示
    if (running.length > 0) {
      this._running = running[0];
      this._startTick();
    }
    await this._loadStats();
  },

  _renderStartForm(taskTypes) {
    return `
      <div class="card-title">开始专注</div>
      <div class="field">
        <label class="field__label">任务类型</label>
        <div class="tag-select" id="typeSelect">
          ${taskTypes.map((t,i) => `<div class="tag-chip ${i===0?'active':''}" onclick="TimerModule._selectType(this)">${t}</div>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field__label">任务名称</label>
        <input class="input" id="taskName" placeholder="例如：读《被讨厌的勇气》第3章">
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">目标</label>
          <input class="input" id="taskGoal" placeholder="完成什么算成功？">
        </div>
        <div class="field">
          <label class="field__label">预计时长（分钟）</label>
          <input class="input" id="estMin" type="number" min="1" placeholder="25">
        </div>
      </div>
      <div class="field">
        <label class="field__label">模式</label>
        <div class="tag-select">
          <div class="tag-chip active" onclick="TimerModule._selectMode(this,'free')">自由计时</div>
          <div class="tag-chip" onclick="TimerModule._selectMode(this,'pomodoro')">番茄钟（25分+5分）</div>
        </div>
      </div>
      <div class="flex gap-3 mt-2">
        <button class="btn btn--primary btn--lg flex-1" onclick="TimerModule.start()">▶ 开始</button>
      </div>
    `;
  },

  _renderRunning(r) {
    const elapsed = (Date.now() - new Date(r.start_time).getTime()) - (r.paused_ms||0);
    const isPaused = r.paused;
    return `
      <div class="card-title">⏱️ 正在计时</div>
      <div class="text-center" style="padding:20px 0">
        <div style="font-size:48px;color:var(--color-primary);font-weight:600;font-variant-numeric:tabular-nums" id="timerDisplay">${this._fmtDur(elapsed)}</div>
        <div class="text-soft mt-2">${r.task_name} · ${r.task_type}</div>
        <div class="text-faint text-xs mt-1">预计 ${r.estimated_min||0} 分钟 · 开始于 ${new Date(r.start_time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div class="flex gap-3" style="justify-content:center">
        ${isPaused
          ? '<button class="btn btn--primary" onclick="TimerModule.resume()">▶ 继续</button>'
          : '<button class="btn" onclick="TimerModule.pause()">⏸ 暂停</button>'}
        <button class="btn btn--accent" onclick="TimerModule.stop()">⏹ 结束</button>
      </div>
    `;
  },

  _selectedType: '阅读',
  _selectedMode: 'free',

  _selectType(el) {
    document.querySelectorAll('#typeSelect .tag-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this._selectedType = el.textContent;
  },

  _selectMode(el, mode) {
    el.parentElement.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this._selectedMode = mode;
    if (mode === 'pomodoro') {
      const est = document.getElementById('estMin');
      if (est && !est.value) est.value = 25;
    }
  },

  async quickStart(type) {
    this._selectedType = type || '阅读';
    const form = document.getElementById('taskName');
    if (form) {
      form.value = type === '阅读' ? '阅读时间' : (type === '锻炼' ? '锻炼时间' : '专注时间');
      this.start();
    }
  },

  async start() {
    // 检查是否已有运行中
    const running = (await DB.list('timer_running')).filter(t => !t.deleted_at);
    if (running.length > 0) {
      UI.toast('已有计时进行中，同一时间只能运行一个','error');
      return;
    }
    const name = document.getElementById('taskName')?.value.trim();
    if (!name) { UI.toast('请填写任务名称','error'); return; }
    const goal = document.getElementById('taskGoal')?.value.trim() || '';
    const estMin = parseInt(document.getElementById('estMin')?.value) || 0;
    const record = {
      id: uuid(),
      task_type: this._selectedType,
      task_name: name,
      goal,
      estimated_min: estMin,
      mode: this._selectedMode,
      start_time: nowISO(),
      paused: false,
      paused_ms: 0,
      pause_start: null,
    };
    await DB.save('timer_running', record);
    this._running = record;
    this._startTick();
    UI.toast('计时开始！专注中…','success');
    this.render();
  },

  async pause() {
    if (!this._running) return;
    this._running.paused = true;
    this._running.pause_start = nowISO();
    await DB.save('timer_running', this._running);
    this.render();
  },

  async resume() {
    if (!this._running) return;
    if (this._running.pause_start) {
      const pauseDur = Date.now() - new Date(this._running.pause_start).getTime();
      this._running.paused_ms = (this._running.paused_ms||0) + pauseDur;
      this._running.pause_start = null;
    }
    this._running.paused = false;
    await DB.save('timer_running', this._running);
    this._startTick();
    this.render();
  },

  async stop() {
    if (!this._running) return;
    const r = this._running;
    const end = nowISO();
    // 计算实际时长（减去暂停时间）
    let dur = new Date(end).getTime() - new Date(r.start_time).getTime();
    if (r.paused_ms) dur -= r.paused_ms;
    if (r.pause_start) dur -= (Date.now() - new Date(r.pause_start).getTime());

    // 询问完成情况
    UI.modal('计时结束 🎉', `
      <div class="text-center mb-4">
        <div style="font-size:36px;color:var(--color-primary);font-weight:600">${this._fmtDur(dur)}</div>
        <div class="text-soft text-sm mt-1">${r.task_name}</div>
        ${r.estimated_min ? `<div class="text-faint text-xs mt-1">预计 ${r.estimated_min} 分钟 / 实际 ${Math.round(dur/60000)} 分钟</div>` : ''}
      </div>
      <div class="field">
        <label class="field__label">完成成果</label>
        <textarea class="textarea" id="endResult" placeholder="这次专注完成了什么？"></textarea>
      </div>
      <div class="field">
        <label class="field__label">专注程度</label>
        <div class="tag-select" id="focusLevel">
          <div class="tag-chip" onclick="TimerModule._selFocus(this,1)">1 分心</div>
          <div class="tag-chip" onclick="TimerModule._selFocus(this,2)">2</div>
          <div class="tag-chip" onclick="TimerModule._selFocus(this,3)">3 一般</div>
          <div class="tag-chip" onclick="TimerModule._selFocus(this,4)">4</div>
          <div class="tag-chip active" onclick="TimerModule._selFocus(this,5)">5 专注</div>
        </div>
      </div>
      <div class="field">
        <label class="field__label">备注</label>
        <textarea class="textarea" id="endNote" placeholder="可留空"></textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="TimerModule._discardStop()">放弃不保存</button>
        <button class="btn btn--primary" onclick="TimerModule._saveStop('${dur}')">保存记录</button>
      </div>
    `);
    this._focusLevel = 5;
  },

  _selFocus(el, lvl) {
    el.parentElement.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this._focusLevel = lvl;
  },

  async _saveStop(durStr) {
    const dur = parseInt(durStr);
    const r = this._running;
    const record = {
      task_type: r.task_type,
      task_name: r.task_name,
      goal: r.goal,
      estimated_min: r.estimated_min || 0,
      mode: r.mode,
      start_time: r.start_time,
      end_time: nowISO(),
      duration: dur,
      result: document.getElementById('endResult')?.value || '',
      focus_level: this._focusLevel || 3,
      note: document.getElementById('endNote')?.value || '',
    };
    await DB.save('timers', record);
    // 删除运行中
    await DB.hardDelete('timer_running', r.id);
    this._running = null;
    this._stopTick();
    UI.closeModal();
    UI.toast('记录已保存','success');
    // 提醒休息
    if (dur > 50 * 60000) {
      setTimeout(() => UI.toast('已经专注超过50分钟了，记得休息一下哦 💕','info',4000), 500);
    }
    this.render();
  },

  async _discardStop() {
    if (!UI.confirm('确定放弃这条计时记录吗？')) return;
    await DB.hardDelete('timer_running', this._running.id);
    this._running = null;
    this._stopTick();
    UI.closeModal();
    UI.toast('已放弃','info');
    this.render();
  },

  _startTick() {
    this._stopTick();
    this._tickTimer = setInterval(() => {
      const el = document.getElementById('timerDisplay');
      if (!el || !this._running) { this._stopTick(); return; }
      let elapsed = Date.now() - new Date(this._running.start_time).getTime();
      if (this._running.paused_ms) elapsed -= this._running.paused_ms;
      if (this._running.pause_start) elapsed -= (Date.now() - new Date(this._running.pause_start).getTime());
      el.textContent = this._fmtDur(elapsed);
    }, 1000);
  },

  _stopTick() {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
  },

  // 刷新/重新打开时恢复
  async restoreRunning() {
    const running = (await DB.list('timer_running')).filter(t => !t.deleted_at);
    if (running.length > 0) {
      this._running = running[0];
      console.log('[Timer] 恢复运行中计时器:', this._running.task_name);
    }
  },

  _fmtDur(ms) {
    if (!ms || ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  },

  _typeIcon(type) {
    const map = { '阅读':'📖','锻炼':'🏃','电影/电影解说':'🎬','纪录片':'🎞️','复盘阿苡视频':'📹','其他':'✨' };
    return map[type] || '⏱️';
  },

  async _loadStats() {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const all = (await DB.list('timers')).filter(t => !t.deleted_at);
    const weekRecs = all.filter(t => new Date(t.start_time) >= weekStart);
    const monthRecs = all.filter(t => new Date(t.start_time) >= monthStart);
    const wEl = document.getElementById('weekStat');
    const wcEl = document.getElementById('weekCount');
    const mEl = document.getElementById('monthStat');
    const mcEl = document.getElementById('monthCount');
    if (wEl) wEl.textContent = this._fmtDur(weekRecs.reduce((s,t)=>s+(t.duration||0),0));
    if (wcEl) wcEl.textContent = `${weekRecs.length} 次计时`;
    if (mEl) mEl.textContent = this._fmtDur(monthRecs.reduce((s,t)=>s+(t.duration||0),0));
    if (mcEl) mcEl.textContent = `${monthRecs.length} 次计时`;

    // 类型统计图
    const chartEl = document.getElementById('typeStatChart');
    if (chartEl && typeof Chart !== 'undefined') {
      const byType = {};
      all.forEach(t => { byType[t.task_type] = (byType[t.task_type]||0) + (t.duration||0); });
      const labels = Object.keys(byType);
      const data = Object.values(byType).map(ms => Math.round(ms/60000));
      if (labels.length === 0) {
        chartEl.innerHTML = '<div class="text-center text-faint text-sm" style="padding:30px">暂无数据</div>';
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.style.maxHeight = '200px';
      chartEl.innerHTML = '';
      chartEl.appendChild(canvas);
      new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: ['#F194A6','#8A4E7B','#BBA4D9','#DB5A6B','#7EC8A0','#F5B97A'] }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } }, maintainAspectRatio: false },
      });
    }
  },

  async showStats(range) {
    const now = new Date();
    let start;
    let title;
    if (range === 'day') { start = new Date(now); start.setHours(0,0,0,0); title = '今日'; }
    else if (range === 'week') { start = new Date(now); start.setDate(now.getDate()-now.getDay()); start.setHours(0,0,0,0); title = '本周'; }
    else if (range === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); title = '本月'; }
    else { start = new Date(now.getFullYear(), 0, 1); title = '本年'; }
    const all = (await DB.list('timers')).filter(t => !t.deleted_at && new Date(t.start_time) >= start);
    const byType = {};
    all.forEach(t => { byType[t.task_type] = byType[t.task_type] || { count:0, ms:0 }; byType[t.task_type].count++; byType[t.task_type].ms += t.duration||0; });
    UI.modal(`${title}计时统计`, `
      <div class="text-center mb-4">
        <div class="text-2xl" style="color:var(--color-primary);font-weight:600">${this._fmtDur(all.reduce((s,t)=>s+(t.duration||0),0))}</div>
        <div class="text-soft text-sm">${all.length} 次计时</div>
      </div>
      ${Object.keys(byType).length === 0 ? UI.empty('📭','该时段暂无记录') : `
        <table class="w-full text-sm">
          <tr style="color:var(--color-text-soft)"><td>类型</td><td>次数</td><td>时长</td></tr>
          ${Object.entries(byType).map(([type,v]) => `
            <tr style="border-top:1px solid var(--color-divider)">
              <td style="padding:8px 0">${this._typeIcon(type)} ${type}</td>
              <td>${v.count}</td>
              <td>${this._fmtDur(v.ms)}</td>
            </tr>
          `).join('')}
        </table>
      `}
    `);
  },

  async addManual() {
    const taskTypes = await DB.getSetting('task_types') || ['阅读','锻炼','其他'];
    UI.modal('补录计时记录', `
      <div class="field">
        <label class="field__label">任务类型</label>
        <select class="select" id="mType">${taskTypes.map(t => `<option>${t}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="field__label">任务名称</label>
        <input class="input" id="mName">
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">开始时间</label>
          <input class="input" type="datetime-local" id="mStart">
        </div>
        <div class="field">
          <label class="field__label">时长（分钟）</label>
          <input class="input" type="number" id="mMin" min="1">
        </div>
      </div>
      <div class="field">
        <label class="field__label">备注</label>
        <textarea class="textarea" id="mNote"></textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="TimerModule._saveManual()">保存</button>
      </div>
    `);
    // 默认开始时间为1小时前
    const oneHourAgo = new Date(Date.now() - 3600000);
    const pad = n => String(n).padStart(2,'0');
    document.getElementById('mStart').value = `${oneHourAgo.getFullYear()}-${pad(oneHourAgo.getMonth()+1)}-${pad(oneHourAgo.getDate())}T${pad(oneHourAgo.getHours())}:${pad(oneHourAgo.getMinutes())}`;
  },

  async _saveManual() {
    const type = document.getElementById('mType').value;
    const name = document.getElementById('mName').value.trim();
    const startStr = document.getElementById('mStart').value;
    const min = parseInt(document.getElementById('mMin').value) || 0;
    if (!name || !startStr || !min) { UI.toast('请填写完整','error'); return; }
    const start = new Date(startStr);
    const end = new Date(start.getTime() + min * 60000);
    await DB.save('timers', {
      task_type: type, task_name: name, mode: 'manual',
      start_time: start.toISOString(), end_time: end.toISOString(),
      duration: min * 60000, note: document.getElementById('mNote').value,
      source_type: 'manual',
    });
    UI.closeModal();
    UI.toast('已补录','success');
    this.render();
  },

  async viewDetail(id) {
    const t = await DB.get('timers', id);
    if (!t) return;
    UI.modal('计时详情', `
      <div class="list-item"><div class="list-item__main">
        <div class="list-item__title">${this._typeIcon(t.task_type)} ${t.task_name}</div>
        <div class="list-item__sub">${t.task_type}</div>
      </div></div>
      <table class="w-full text-sm mt-3">
        <tr><td class="text-soft">开始</td><td>${new Date(t.start_time).toLocaleString('zh-CN')}</td></tr>
        <tr><td class="text-soft">结束</td><td>${new Date(t.end_time).toLocaleString('zh-CN')}</td></tr>
        <tr><td class="text-soft">时长</td><td>${this._fmtDur(t.duration)}</td></tr>
        ${t.estimated_min ? `<tr><td class="text-soft">预计</td><td>${t.estimated_min} 分钟</td></tr>` : ''}
        ${t.goal ? `<tr><td class="text-soft">目标</td><td>${t.goal}</td></tr>` : ''}
        ${t.result ? `<tr><td class="text-soft">成果</td><td>${t.result}</td></tr>` : ''}
        ${t.focus_level ? `<tr><td class="text-soft">专注度</td><td>${'⭐'.repeat(t.focus_level)}</td></tr>` : ''}
        ${t.note ? `<tr><td class="text-soft">备注</td><td>${t.note}</td></tr>` : ''}
      </table>
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn btn--accent btn--sm" onclick="TimerModule._deleteRec('${id}')">删除</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _deleteRec(id) {
    if (!await UI.confirm('确定删除这条记录吗？删除后会影响相关统计。')) return;
    await DB.hardDelete('timers', id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.render();
  },
};
