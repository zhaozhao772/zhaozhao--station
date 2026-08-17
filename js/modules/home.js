/**
 * 今日工作台模块
 */
const HomeModule = {
  async render() {
    const s = App.state.settings;
    const now = new Date();
    const weekdays = ['日','一','二','三','四','五','六'];
    const today = todayKey();

    // 获取今日数据
    const tasks = (await DB.list('tasks')).filter(t => !t.deleted_at);
    const todayTasks = tasks.filter(t => t.date === today);
    const completedToday = todayTasks.filter(t => t.completed);

    const timers = (await DB.list('timers')).filter(t => !t.deleted_at);
    const todayTimers = timers.filter(t => t.start_time?.startsWith(today));
    const readMs = todayTimers.filter(t => t.task_type === '阅读').reduce((s,t) => s + (t.duration||0), 0);
    const workoutMs = todayTimers.filter(t => t.task_type === '锻炼').reduce((s,t) => s + (t.duration||0), 0);

    const emotions = (await DB.list('emotions')).filter(e => !e.deleted_at && e.created_at?.startsWith(today));

    const running = (await DB.list('timer_running')).filter(t => !t.deleted_at);

    const reviews = (await DB.list('reviews')).filter(r => !r.deleted_at && r.date === today);
    const reviewDone = reviews.length > 0;

    // 灵魂链接今日记录
    const linkRecords = (await DB.list('link_records')).filter(r => !r.deleted_at && r.created_at?.startsWith(today));

    // 每日一句
    const quote = this._getDailyQuote();

    // 本周学习目标
    const weekGoals = await DB.getSetting('week_goals') || [];

    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div>
            <div class="text-2xl" style="color:var(--color-primary);font-weight:600">${App.getGreeting()}</div>
            <div class="text-soft text-sm mt-1">
              ${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 星期${weekdays[now.getDay()]}
              <span id="liveClock" class="ml-2" style="color:var(--color-rose)"></span>
            </div>
          </div>
        </div>

        <!-- 每日一句 -->
        <div class="card card--blur mb-4">
          <div class="card-title">📖 每日一句</div>
          <p style="font-size:var(--font-size-lg);line-height:1.8;color:var(--color-text)">${quote.zh}</p>
          <p class="text-soft text-sm mt-2" style="font-style:italic">${quote.en} 💕</p>
        </div>

        <!-- 运行中计时 -->
        ${running.length > 0 ? `
          <div class="card mb-4" style="border:1px solid var(--color-rose);background:rgba(241,148,166,0.06)">
            <div class="flex items-center gap-3">
              <span style="font-size:24px">⏱️</span>
              <div class="flex-1">
                <div class="text-soft text-sm">正在进行</div>
                <div class="font-bold">${running[0].task_name}（${running[0].task_type}）</div>
              </div>
              <button class="btn btn--rose btn--sm" onclick="App.navigate('timer')">查看</button>
            </div>
          </div>
        ` : ''}

        <!-- 快捷按钮 -->
        <div class="card mb-4">
          <div class="card-title">⚡ 快捷操作</div>
          <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:8px">
            ${this._quickBtn('⏱️','开始专注',"App.navigate('timer');setTimeout(()=>TimerModule.quickStart(),300)")}
            ${this._quickBtn('📖','开始阅读',"App.navigate('timer');setTimeout(()=>TimerModule.quickStart('阅读'),300)")}
            ${this._quickBtn('🏃','开始锻炼',"App.navigate('timer');setTimeout(()=>TimerModule.quickStart('锻炼'),300)")}
            ${this._quickBtn('✅','添加任务','HomeModule.addTask()')}
            ${this._quickBtn('🌤️','记录情绪','App.navigate("emotion");setTimeout(()=>EmotionModule.quickAdd(),300)')}
            ${this._quickBtn('✨','灵魂链接','App.navigate("soul");setTimeout(()=>SoulModule.quickAdd(),300)')}
            ${this._quickBtn('💌','抽取字卡','App.navigate("cards");setTimeout(()=>CardsModule.quickDraw(),300)')}
            ${this._quickBtn('🌙','每日复盘','App.navigate("review");setTimeout(()=>ReviewModule.startToday(),300)')}
          </div>
        </div>

        <div class="grid grid-2 mb-4">
          <!-- 今日代办 -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">📋 今日代办</div>
              <button class="btn btn--sm btn--ghost" onclick="HomeModule.addTask()">+ 添加</button>
            </div>
            <div id="homeTodoList">
              ${todayTasks.length === 0 ? UI.empty('📝','今天还没有待办') : todayTasks.map(t => `
                <div class="list-item" style="padding:10px">
                  <input type="checkbox" ${t.completed?'checked':''} onchange="HomeModule.toggleTask('${t.id}',this.checked)">
                  <div class="list-item__main">
                    <div class="list-item__title" style="${t.completed?'text-decoration:line-through;opacity:0.5':''}">${t.title}</div>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="text-soft text-sm mt-2">已完成 ${completedToday.length}/${todayTasks.length}</div>
          </div>

          <!-- 今日统计 -->
          <div class="card">
            <div class="card-title">📊 今日概览</div>
            <div class="grid grid-2" style="gap:10px">
              <div class="health-item">
                <div class="health-item__label">完成任务</div>
                <div class="health-item__value">${completedToday.length}</div>
              </div>
              <div class="health-item">
                <div class="health-item__label">专注阅读</div>
                <div class="health-item__value">${this._fmtDur(readMs)}</div>
              </div>
              <div class="health-item">
                <div class="health-item__label">专注锻炼</div>
                <div class="health-item__value">${this._fmtDur(workoutMs)}</div>
              </div>
              <div class="health-item">
                <div class="health-item__label">情绪记录</div>
                <div class="health-item__value">${emotions.length}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 本周目标 -->
        <div class="card mb-4">
          <div class="card-title">🎯 本周学习和成长目标</div>
          ${weekGoals.length === 0 ? UI.empty('🌱','还没有设置本周目标') : `
            <ul class="flex flex-col gap-2">
              ${weekGoals.map((g,i) => `
                <li class="flex items-center gap-2">
                  <input type="checkbox" ${g.done?'checked':''} onchange="HomeModule.toggleGoal(${i},this.checked)">
                  <span style="${g.done?'text-decoration:line-through;opacity:0.5':''}">${g.text}</span>
                </li>
              `).join('')}
            </ul>
          `}
        </div>

        <div class="grid grid-2 mb-4">
          <!-- 情绪天气 -->
          <div class="card">
            <div class="card-title">🌤️ 今日情绪天气</div>
            <div id="homeEmotionChart" style="min-height:120px"></div>
            ${emotions.length === 0 ? '<p class="text-faint text-sm text-center mt-2">系统默认：平和（未记录）</p>' : ''}
          </div>

          <!-- 灵魂链接模糊提示 -->
          <div class="card card--blur" style="background:linear-gradient(135deg,rgba(187,164,217,0.08),rgba(241,148,166,0.08))">
            <div class="card-title">✨ 灵魂链接</div>
            ${linkRecords.length > 0
              ? `<p style="color:var(--color-primary)">今天有 ${linkRecords.length} 条私密记录 🌙</p>
                 <p class="text-faint text-xs mt-2">详情已隐藏，点击进入查看</p>
                 <button class="btn btn--sm btn--rose mt-3" onclick="App.navigate('soul')">进入查看</button>`
              : `<p class="text-faint text-sm">今天还没有链接记录</p>
                 <button class="btn btn--sm btn--ghost mt-3" onclick="App.navigate('soul')">去记录</button>`}
          </div>
        </div>

        <!-- 复盘状态 -->
        <div class="card">
          <div class="flex items-center justify-between">
            <div class="card-title">🌙 今日复盘</div>
            ${reviewDone
              ? '<span class="ai-badge" style="background:var(--color-success)">已完成</span>'
              : '<span class="badge">未完成</span>'}
          </div>
          <button class="btn btn--rose btn--sm mt-2" onclick="App.navigate('review');setTimeout(()=>ReviewModule.startToday(),300)">
            ${reviewDone ? '查看/编辑复盘' : '开始每日复盘'}
          </button>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
    this._renderEmotionMini(emotions);
  },

  _quickBtn(icon, label, onclick) {
    return `
      <button class="btn btn--sm" style="flex-direction:column;padding:12px 6px;min-height:72px" onclick="${onclick.replace(/"/g,'&quot;')}">
        <span style="font-size:22px">${icon}</span>
        <span class="text-xs" style="margin-top:4px">${label}</span>
      </button>
    `;
  },

  _fmtDur(ms) {
    if (!ms) return '0分';
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}分`;
    return `${Math.floor(m/60)}时${m%60}分`;
  },

  _getDailyQuote() {
    const quotes = [
      { zh: '愿你成为自己的太阳，无需借谁的光。', en: 'May you become your own sun, needing no one else\'s light.' },
      { zh: '所有的努力都不会完全白费。', en: 'No effort is ever completely in vain.' },
      { zh: '今天的你，是过去所有你的总和。', en: 'Today\'s you is the sum of all your past selves.' },
      { zh: '慢慢来，比较快。', en: 'Slowly is the fastest way.' },
      { zh: '生活明朗，万物可爱。', en: 'Life is bright, and all things are lovely.' },
      { zh: '愿你眼里有光，心中有爱。', en: 'May there be light in your eyes and love in your heart.' },
      { zh: '每一个不曾起舞的日子，都是对生命的辜负。', en: 'Every day without dance is a betrayal of life.' },
      { zh: '你只管努力，剩下的交给时间。', en: 'Just do your best, and leave the rest to time.' },
      { zh: '心怀温柔，所遇皆温柔。', en: 'With a gentle heart, all you meet is gentle.' },
      { zh: '今日事，今日毕。', en: 'Finish today\'s work today.' },
    ];
    const d = new Date();
    const idx = (d.getFullYear()*1000 + d.getMonth()*32 + d.getDate()) % quotes.length;
    return quotes[idx];
  },

  async _renderEmotionMini(emotions) {
    const el = document.getElementById('homeEmotionChart');
    if (!el) return;
    if (emotions.length === 0 || typeof Chart === 'undefined') {
      el.innerHTML = '<div class="text-center text-faint text-sm" style="padding:30px 0">今天还没有情绪记录<br>系统默认：平和</div>';
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '120px';
    el.innerHTML = '';
    el.appendChild(canvas);
    const types = await DB.getSetting('emotion_types') || [];
    const labels = emotions.map(e => new Date(e.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
    const data = emotions.map(e => {
      const t = types.find(x => x.name === e.emotion_type);
      return t ? t.valence * (e.intensity||5) : 0;
    });
    new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: '#F194A6', tension: 0.4, fill: true, backgroundColor: 'rgba(241,148,166,0.1)' }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }, maintainAspectRatio: false },
    });
  },

  async addTask() {
    UI.modal('添加今日待办', `
      <div class="field">
        <label class="field__label">任务内容</label>
        <input class="input" id="taskTitle" placeholder="今天要做什么？">
      </div>
      <div class="field">
        <label class="field__label">优先级</label>
        <select class="select" id="taskPrio">
          <option value="normal">普通</option>
          <option value="high">重要</option>
          <option value="urgent">紧急</option>
        </select>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="HomeModule._saveTask()">保存</button>
      </div>
    `);
    setTimeout(() => document.getElementById('taskTitle')?.focus(), 100);
  },

  async _saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) { UI.toast('请输入任务内容','error'); return; }
    const prio = document.getElementById('taskPrio').value;
    await DB.save('tasks', {
      title, priority: prio, completed: false, date: todayKey(),
      reset_daily: false,
    });
    UI.closeModal();
    UI.toast('已添加','success');
    this.render();
  },

  async toggleTask(id, checked) {
    const t = await DB.get('tasks', id);
    if (t) {
      t.completed = checked;
      t.completed_date = checked ? todayKey() : null;
      await DB.save('tasks', t);
      this.render();
    }
  },

  async toggleGoal(idx, checked) {
    const goals = await DB.getSetting('week_goals') || [];
    if (goals[idx]) {
      goals[idx].done = checked;
      await DB.setSetting('week_goals', goals);
    }
  },
};
