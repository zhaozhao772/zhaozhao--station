/**
 * 情绪天气监测模块
 * 每天默认平和，一天可多次记录，折线图
 */
const EmotionModule = {
  async render() {
    const types = await DB.getSetting('emotion_types') || [];
    const all = (await DB.list('emotions')).filter(e => !e.deleted_at);
    const today = todayKey();
    const todayEmotions = all.filter(e => e.created_at?.startsWith(today));

    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">🌤️ 情绪天气监测</div>
          <button class="btn btn--primary btn--sm" onclick="EmotionModule.add()">+ 记录情绪</button>
        </div>

        <!-- 今日情绪天气图 -->
        <div class="card mb-4">
          <div class="card-title">📊 今日情绪天气</div>
          <div id="todayChart" style="min-height:200px"></div>
          ${todayEmotions.length === 0 ? '<p class="text-faint text-xs text-center">系统默认：平和（未记录）— 系统默认，非用户主动确认</p>' : ''}
        </div>

        <!-- 今日记录列表 -->
        <div class="card mb-4">
          <div class="card-title">📝 今日记录</div>
          ${todayEmotions.length === 0 ? UI.empty('🌤️','今天还没有情绪记录，默认平和') : `
            <div class="flex flex-col gap-2">
              ${todayEmotions.sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(e => {
                const t = types.find(x => x.name === e.emotion_type);
                const color = t?.color || '#BBA4D9';
                return `
                  <div class="list-item" style="cursor:pointer;border-left:3px solid ${color}" onclick="EmotionModule.view('${e.id}')">
                    <div class="list-item__main">
                      <div class="list-item__title">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px"></span>
                        ${e.emotion_type} · 强度 ${e.intensity}/10
                      </div>
                      <div class="list-item__sub">${new Date(e.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} · ${e.event?.slice(0,30)||'无事件'}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- 历史趋势 -->
        <div class="card mb-4">
          <div class="card-title">📈 近7天情绪趋势</div>
          <div id="weekChart" style="min-height:200px"></div>
        </div>

        <!-- 情绪类型筛选 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🗂️ 历史记录</div>
            <button class="btn btn--sm btn--ghost" onclick="EmotionModule.showFilter()">🔍 筛选</button>
          </div>
          <div id="historyList"></div>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
    this._renderTodayChart(todayEmotions, types);
    this._renderWeekChart(all, types);
    this._renderHistory(all, types);
  },

  async _renderTodayChart(emotions, types) {
    const el = document.getElementById('todayChart');
    if (!el) return;
    if (emotions.length === 0 || typeof Chart === 'undefined') {
      // 显示默认平和基准线
      el.innerHTML = '<div class="text-center text-faint text-sm" style="padding:40px 0">基准线：平和 🌤️<br><span class="text-xs">系统默认，未主动确认</span></div>';
      return;
    }
    const labels = emotions.map(e => new Date(e.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
    const data = emotions.map(e => {
      const t = types.find(x => x.name === e.emotion_type);
      return t ? t.valence * (e.intensity||5) : 0;
    });
    const colors = emotions.map(e => {
      const t = types.find(x => x.name === e.emotion_type);
      return t?.color || '#BBA4D9';
    });
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '200px';
    el.innerHTML = '';
    el.appendChild(canvas);
    new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [{
        data, borderColor: '#F194A6', tension: 0.4, fill: true,
        backgroundColor: 'rgba(241,148,166,0.1)',
        pointBackgroundColor: colors, pointRadius: 6,
      }]},
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: '情绪值' } } },
        maintainAspectRatio: false,
      },
    });
  },

  async _renderWeekChart(all, types) {
    const el = document.getElementById('weekChart');
    if (!el || typeof Chart === 'undefined') return;
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate()-6); weekStart.setHours(0,0,0,0);
    const weekRecs = all.filter(e => new Date(e.created_at) >= weekStart);
    // 按天聚合平均
    const dailyAvg = {};
    weekRecs.forEach(e => {
      const d = e.created_at.slice(0,10);
      const t = types.find(x => x.name === e.emotion_type);
      const v = t ? t.valence * (e.intensity||5) : 0;
      if (!dailyAvg[d]) dailyAvg[d] = [];
      dailyAvg[d].push(v);
    });
    const labels = []; const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate()-i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      labels.push(`${d.getMonth()+1}/${d.getDate()}`);
      if (dailyAvg[key]) {
        data.push(dailyAvg[key].reduce((a,b)=>a+b,0)/dailyAvg[key].length);
      } else {
        data.push(0); // 平和基准
      }
    }
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '200px';
    el.innerHTML = '';
    el.appendChild(canvas);
    new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [{
        data, borderColor: '#8A4E7B', tension: 0.4, fill: true,
        backgroundColor: 'rgba(138,78,123,0.08)',
      }]},
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: '平均情绪值' } } },
        maintainAspectRatio: false,
      },
    });
  },

  _renderHistory(all, types) {
    const el = document.getElementById('historyList');
    if (!el) return;
    const recent = all.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0, 20);
    if (recent.length === 0) { el.innerHTML = UI.empty('📝','暂无历史记录'); return; }
    el.innerHTML = recent.map(e => {
      const t = types.find(x => x.name === e.emotion_type);
      const color = t?.color || '#BBA4D9';
      return `
        <div class="list-item" style="cursor:pointer;border-left:3px solid ${color}" onclick="EmotionModule.view('${e.id}')">
          <div class="list-item__main">
            <div class="list-item__title">${e.emotion_type} · ${e.intensity}/10</div>
            <div class="list-item__sub">${e.created_at.slice(0,16).replace('T',' ')} · ${e.event?.slice(0,30)||''}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  quickAdd() { this.add(); },

  async add() {
    const types = await DB.getSetting('emotion_types') || [];
    UI.modal('记录情绪 🌤️', `
      <div class="field">
        <label class="field__label">情绪类型</label>
        <div class="tag-select" id="emoType">
          ${types.map(t => `<div class="tag-chip" style="${t.valence>0?'border-color:#7EC8A0':t.valence<0?'border-color:#E07080':''}" onclick="EmotionModule._selType(this,'${t.name}')">${t.name}</div>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field__label">情绪强度（1-10）</label>
        <input class="input" type="range" min="1" max="10" value="5" id="emoIntensity" oninput="document.getElementById('emoIntVal').textContent=this.value">
        <div class="text-center text-2xl" style="color:var(--color-rose)" id="emoIntVal">5</div>
      </div>
      <div class="field">
        <label class="field__label">发生了什么</label>
        <textarea class="textarea" id="emoEvent" placeholder="客观描述事件"></textarea>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">涉及的人或事</label>
          <input class="input" id="emoWho">
        </div>
        <div class="field">
          <label class="field__label">身体感受</label>
          <input class="input" id="emoBody" placeholder="如：胸闷、放松">
        </div>
      </div>
      <div class="field">
        <label class="field__label">自动出现的想法</label>
        <textarea class="textarea" id="emoThought" placeholder="脑海里冒出的念头"></textarea>
      </div>
      <div class="field">
        <label class="field__label">我的反应</label>
        <textarea class="textarea" id="emoReaction" placeholder="我做了什么"></textarea>
      </div>
      <div class="field">
        <label class="field__label">我真正需要的是什么</label>
        <textarea class="textarea" id="emoNeed"></textarea>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">持续时间</label>
          <input class="input" id="emoDuration" placeholder="如：30分钟">
        </div>
        <div class="field">
          <label class="field__label">是否已缓解</label>
          <select class="select" id="emoRelieved">
            <option value="true">已缓解</option>
            <option value="false">未缓解</option>
            <option value="partial">部分缓解</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field__label">自由补充</label>
        <textarea class="textarea" id="emoExtra"></textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="EmotionModule._save()">保存</button>
      </div>
    `);
    this._selTypeVal = null;
  },

  _selType(el, name) {
    el.parentElement.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this._selTypeVal = name;
  },

  async _save() {
    if (!this._selTypeVal) { UI.toast('请选择情绪类型','error'); return; }
    await DB.save('emotions', {
      emotion_type: this._selTypeVal,
      intensity: parseInt(document.getElementById('emoIntensity').value),
      event: document.getElementById('emoEvent').value,
      who: document.getElementById('emoWho').value,
      body_feeling: document.getElementById('emoBody').value,
      thought: document.getElementById('emoThought').value,
      reaction: document.getElementById('emoReaction').value,
      need: document.getElementById('emoNeed').value,
      duration: document.getElementById('emoDuration').value,
      relieved: document.getElementById('emoRelieved').value,
      extra: document.getElementById('emoExtra').value,
    });
    UI.closeModal();
    UI.toast('情绪已记录','success');
    this.render();
  },

  async view(id) {
    const e = await DB.get('emotions', id);
    if (!e) return;
    const types = await DB.getSetting('emotion_types') || [];
    const t = types.find(x => x.name === e.emotion_type);
    UI.modal('情绪记录详情', `
      <div class="list-item" style="border-left:3px solid ${t?.color||'#BBA4D9'}">
        <div class="list-item__main">
          <div class="list-item__title">${e.emotion_type} · 强度 ${e.intensity}/10</div>
          <div class="list-item__sub">${e.created_at.slice(0,19).replace('T',' ')}</div>
        </div>
      </div>
      <table class="w-full text-sm mt-3">
        ${e.event ? `<tr><td class="text-soft" style="vertical-align:top;padding:4px 0">发生了什么</td><td>${e.event}</td></tr>` : ''}
        ${e.who ? `<tr><td class="text-soft" style="vertical-align:top;padding:4px 0">涉及</td><td>${e.who}</td></tr>` : ''}
        ${e.thought ? `<tr><td class="text-soft" style="vertical-align:top;padding:4px 0">自动想法</td><td>${e.thought}</td></tr>` : ''}
        ${e.body_feeling ? `<tr><td class="text-soft" style="vertical-align:top;padding:4px 0">身体感受</td><td>${e.body_feeling}</td></tr>` : ''}
        ${e.reaction ? `<tr><td class="text-soft" style="vertical-align:top;padding:4px 0">我的反应</td><td>${e.reaction}</td></tr>` : ''}
        ${e.need ? `<tr><td class="text-soft" style="vertical-align:top;padding:4px 0">真正需要</td><td>${e.need}</td></tr>` : ''}
        ${e.duration ? `<tr><td class="text-soft" style="padding:4px 0">持续时间</td><td>${e.duration}</td></tr>` : ''}
        ${e.relieved ? `<tr><td class="text-soft" style="padding:4px 0">缓解状态</td><td>${e.relieved==='true'?'已缓解':e.relieved==='partial'?'部分缓解':'未缓解'}</td></tr>` : ''}
        ${e.extra ? `<tr><td class="text-soft" style="vertical-align:top;padding:4px 0">补充</td><td>${e.extra}</td></tr>` : ''}
      </table>
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn btn--accent btn--sm" onclick="EmotionModule._del('${id}')">删除</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _del(id) {
    if (!await UI.confirm('删除这条情绪记录？会影响相关统计。')) return;
    await DB.hardDelete('emotions', id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.render();
  },

  showFilter() {
    UI.modal('筛选情绪记录', `
      <div class="field">
        <label class="field__label">开始日期</label>
        <input class="input" type="date" id="fStart">
      </div>
      <div class="field">
        <label class="field__label">结束日期</label>
        <input class="input" type="date" id="fEnd">
      </div>
      <div class="field">
        <label class="field__label">关键词</label>
        <input class="input" id="fKeyword" placeholder="搜索事件、想法等">
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="EmotionModule._applyFilter()">筛选</button>
      </div>
    `);
  },

  async _applyFilter() {
    const start = document.getElementById('fStart').value;
    const end = document.getElementById('fEnd').value;
    const kw = document.getElementById('fKeyword').value.trim().toLowerCase();
    UI.closeModal();
    let all = (await DB.list('emotions')).filter(e => !e.deleted_at);
    if (start) all = all.filter(e => e.created_at >= start);
    if (end) all = all.filter(e => e.created_at <= end + 'T23:59:59');
    if (kw) all = all.filter(e => (e.event||'').toLowerCase().includes(kw) || (e.thought||'').toLowerCase().includes(kw) || (e.extra||'').toLowerCase().includes(kw));
    const types = await DB.getSetting('emotion_types') || [];
    UI.modal(`筛选结果（${all.length} 条）`, all.length === 0 ? '<p class="text-faint text-sm">无匹配记录</p>' : `
      <div class="flex flex-col gap-2">
        ${all.sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(e => {
          const t = types.find(x => x.name === e.emotion_type);
          return `<div class="list-item" style="cursor:pointer;border-left:3px solid ${t?.color||'#BBA4D9'}" onclick="UI.closeModal();EmotionModule.view('${e.id}')">
            <div class="list-item__main">
              <div class="list-item__title">${e.emotion_type} · ${e.intensity}/10</div>
              <div class="list-item__sub">${e.created_at.slice(0,16).replace('T',' ')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `);
  },
};

/**
 * 情绪循环分析模块
 * 只有多条相似记录才提示模式
 */
const EmotionAnalysis = {
  async render() {
    const all = (await DB.list('emotions')).filter(e => !e.deleted_at);
    const types = await DB.getSetting('emotion_types') || [];
    const html = `
      <div class="page">
        <div class="page__title">🧠 情绪循环分析</div>

        <div class="card mb-4">
          <div class="ai-disclaimer" style="font-size:var(--font-size-sm)">
            此功能仅用于个人自我观察和复盘，不构成医学诊断或心理治疗建议。<br>
            AI 不会根据少量记录为你贴标签。只有出现多次相似记录时，才会提示可能存在的模式。
          </div>
        </div>

        ${all.length < 5 ? `
          <div class="card">
            ${UI.empty('📊', `目前有 ${all.length} 条情绪记录，至少需要 5 条才能进行模式分析。继续记录吧～`)}
          </div>
        ` : `
          ${this._analyze(all, types)}
        `}
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
  },

  _analyze(all, types) {
    // 高频情绪
    const emoCount = {};
    all.forEach(e => { emoCount[e.emotion_type] = (emoCount[e.emotion_type]||0)+1; });
    const topEmotions = Object.entries(emoCount).sort((a,b)=>b[1]-a[1]).slice(0,5);

    // 高频触发事件（按 event 关键词简单聚类）
    const eventWords = {};
    all.forEach(e => {
      if (e.event) {
        e.event.split(/[，,。、\s]+/).forEach(w => {
          if (w.length >= 2 && w.length <= 6) eventWords[w] = (eventWords[w]||0)+1;
        });
      }
    });
    const topEvents = Object.entries(eventWords).filter(([w,c]) => c >= 2).sort((a,b)=>b[1]-a[1]).slice(0,8);

    // 时间段分布
    const hourBuckets = { '早晨(6-12)':0, '下午(12-18)':0, '晚上(18-24)':0, '深夜(0-6)':0 };
    all.forEach(e => {
      const h = new Date(e.created_at).getHours();
      if (h >= 6 && h < 12) hourBuckets['早晨(6-12)']++;
      else if (h >= 12 && h < 18) hourBuckets['下午(12-18)']++;
      else if (h >= 18) hourBuckets['晚上(18-24)']++;
      else hourBuckets['深夜(0-6)']++;
    });

    // 常见身体反应
    const bodyCount = {};
    all.forEach(e => { if (e.body_feeling) bodyCount[e.body_feeling] = (bodyCount[e.body_feeling]||0)+1; });
    const topBody = Object.entries(bodyCount).filter(([w,c])=>c>=2).sort((a,b)=>b[1]-a[1]).slice(0,5);

    // 常见应对方式
    const reactCount = {};
    all.forEach(e => { if (e.reaction) reactCount[e.reaction] = (reactCount[e.reaction]||0)+1; });
    const topReact = Object.entries(reactCount).filter(([w,c])=>c>=2).sort((a,b)=>b[1]-a[1]).slice(0,5);

    return `
      <div class="grid grid-2 mb-4">
        <div class="card">
          <div class="card-title">😊 高频情绪</div>
          <ul class="text-sm">
            ${topEmotions.map(([n,c]) => `<li>${n}: ${c} 次</li>`).join('')}
          </ul>
        </div>
        <div class="card">
          <div class="card-title">⚡ 高频触发事件</div>
          ${topEvents.length === 0 ? '<p class="text-faint text-sm">暂无足够数据</p>' : `
            <ul class="text-sm">${topEvents.map(([w,c]) => `<li>${w}: ${c} 次</li>`).join('')}</ul>
          `}
        </div>
      </div>

      <div class="grid grid-2 mb-4">
        <div class="card">
          <div class="card-title">⏰ 易波动时段</div>
          <ul class="text-sm">${Object.entries(hourBuckets).map(([t,c]) => `<li>${t}: ${c} 次</li>`).join('')}</ul>
        </div>
        <div class="card">
          <div class="card-title">💪 常见身体反应</div>
          ${topBody.length === 0 ? '<p class="text-faint text-sm">暂无足够数据</p>' : `
            <ul class="text-sm">${topBody.map(([w,c]) => `<li>${w}: ${c} 次</li>`).join('')}</ul>
          `}
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-title">🔄 常见应对方式</div>
        ${topReact.length === 0 ? '<p class="text-faint text-sm">暂无足够数据</p>' : `
          <ul class="text-sm">${topReact.map(([w,c]) => `<li>${w}: ${c} 次</li>`).join('')}</ul>
        `}
      </div>

      ${topEvents.length >= 2 ? `
        <div class="card">
          <div class="card-title">🔍 可能存在的重复模式</div>
          <div class="ai-block">
            根据你的记录，"${topEvents[0][0]}" 出现了 ${topEvents[0][1]} 次，是高频触发事件之一。
            ${topBody.length > 0 ? `伴随的身体反应常有：${topBody.map(b=>b[0]).join('、')}。` : ''}
            ${topReact.length > 0 ? `你的常见应对方式包括：${topReact.map(r=>r[0]).join('、')}。` : ''}
            <br><br>
            这是一个可供观察的角度，不代表现实结论。可以继续记录，观察是否存在稳定的"事件—想法—情绪—行为"循环。
          </div>
          <div class="ai-disclaimer">以上分析基于 ${all.length} 条记录的统计规律，不做确定性判断。</div>
        </div>
      ` : ''}
    `;
  },
};
