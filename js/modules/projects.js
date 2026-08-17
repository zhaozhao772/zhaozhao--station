/**
 * 项目与内容管理模块
 */
const ProjectsModule = {
  async render() {
    const projects = (await DB.list('projects')).filter(p => !p.deleted_at);
    const stages = ['灵感','待规划','进行中','待检查','已完成','已复盘'];
    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">🎬 项目与内容管理</div>
          <button class="btn btn--primary btn--sm" onclick="ProjectsModule.add()">+ 新建项目</button>
        </div>

        ${projects.length === 0 ? `<div class="card">${UI.empty('🎬','还没有项目')}</div>` : `
          <div class="flex gap-2 mb-4 flex-wrap">
            ${stages.map(s => {
              const count = projects.filter(p => p.stage === s).length;
              return `<span class="tag-chip" style="padding:6px 12px">${s}(${count})</span>`;
            }).join('')}
          </div>
          <div class="flex flex-col gap-3">
            ${projects.sort((a,b)=>(b.priority||'').localeCompare(a.priority||'')).map(p => `
              <div class="card" style="cursor:pointer" onclick="ProjectsModule.view('${p.id}')">
                <div class="flex items-center gap-3">
                  <span style="font-size:24px">${this._stageIcon(p.stage)}</span>
                  <div class="flex-1">
                    <div class="font-bold">${p.name}</div>
                    <div class="text-faint text-xs">${p.type||''} · ${p.stage} · ${p.priority||'普通'}</div>
                  </div>
                  ${p.deadline ? `<span class="badge" style="background:var(--color-wisteria)">截止 ${p.deadline}</span>` : ''}
                </div>
                ${p.goal ? `<p class="text-soft text-sm mt-2">${p.goal}</p>` : ''}
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
  },

  _stageIcon(s) {
    return { '灵感':'💡','待规划':'📋','进行中':'🔨','待检查':'🔍','已完成':'✅','已复盘':'📝' }[s] || '🎬';
  },

  async add() {
    const stages = ['灵感','待规划','进行中','待检查','已完成','已复盘'];
    UI.modal('新建项目', `
      <div class="field"><label class="field__label">项目名称 *</label><input class="input" id="pName"></div>
      <div class="grid grid-2">
        <div class="field"><label class="field__label">类型</label><input class="input" id="pType" placeholder="如：内容创作"></div>
        <div class="field"><label class="field__label">优先级</label><select class="select" id="pPrio"><option>普通</option><option>重要</option><option>紧急</option></select></div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="field__label">开始日期</label><input class="input" type="date" id="pStart" value="${todayKey()}"></div>
        <div class="field"><label class="field__label">截止日期</label><input class="input" type="date" id="pDeadline"></div>
      </div>
      <div class="field"><label class="field__label">当前阶段</label><select class="select" id="pStage">${stages.map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="field"><label class="field__label">目标</label><textarea class="textarea" id="pGoal"></textarea></div>
      <div class="flex gap-3" style="justify-content:flex-end"><button class="btn" onclick="UI.closeModal()">取消</button><button class="btn btn--primary" onclick="ProjectsModule._save()">创建</button></div>
    `);
  },

  async _save() {
    const name = document.getElementById('pName').value.trim();
    if (!name) { UI.toast('请输入名称','error'); return; }
    await DB.save('projects', {
      name, type: document.getElementById('pType').value,
      priority: document.getElementById('pPrio').value,
      start_date: document.getElementById('pStart').value,
      deadline: document.getElementById('pDeadline').value,
      stage: document.getElementById('pStage').value,
      goal: document.getElementById('pGoal').value,
    });
    UI.closeModal();
    UI.toast('项目已创建','success');
    this.render();
  },

  async view(id) {
    const p = await DB.get('projects', id);
    if (!p) return;
    const subtasks = (await DB.list('project_tasks')).filter(t => !t.deleted_at && t.project_id === id);
    UI.modal(p.name, `
      <div class="text-soft text-sm mb-3">${p.type||''} · ${p.stage} · ${p.priority||''}</div>
      ${p.goal ? `<p class="mb-3"><b>目标:</b> ${p.goal}</p>` : ''}
      ${p.start_date||p.deadline ? `<p class="text-sm mb-3">${p.start_date||'?'} → ${p.deadline||'?'}</p>` : ''}
      <div class="card-header"><div class="card-title">子任务</div><button class="btn btn--sm btn--ghost" onclick="ProjectsModule._addSubtask('${id}')">+</button></div>
      ${subtasks.length === 0 ? '<p class="text-faint text-sm">无子任务</p>' : subtasks.map(t => `
        <div class="list-item">
          <input type="checkbox" ${t.done?'checked':''} onchange="ProjectsModule._toggleSub('${t.id}')">
          <div class="list-item__main"><div class="list-item__title" style="${t.done?'text-decoration:line-through;opacity:0.5':''}">${t.title}</div></div>
        </div>
      `).join('')}
      <div class="field mt-3"><label class="field__label">复盘总结</label><textarea class="textarea" id="pReview" placeholder="完成后填写">${p.review||''}</textarea></div>
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn btn--accent btn--sm" onclick="ProjectsModule._del('${id}')">删除</button>
        <button class="btn btn--primary btn--sm" onclick="ProjectsModule._saveReview('${id}')">保存复盘</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _addSubtask(pid) {
    const name = prompt('子任务名称：');
    if (!name) return;
    await DB.save('project_tasks', { project_id: pid, title: name, done: false });
    UI.closeModal();
    this.view(pid);
  },

  async _toggleSub(id) {
    const t = await DB.get('project_tasks', id);
    if (t) { t.done = !t.done; await DB.save('project_tasks', t); }
  },

  async _saveReview(id) {
    const p = await DB.get('projects', id);
    if (p) { p.review = document.getElementById('pReview').value; p.stage = '已复盘'; await DB.save('projects', p); }
    UI.closeModal();
    UI.toast('复盘已保存','success');
    this.render();
  },

  async _del(id) {
    if (!await UI.confirm('删除这个项目？')) return;
    await DB.hardDelete('projects', id);
    const subs = (await DB.list('project_tasks')).filter(t => t.project_id === id);
    for (const s of subs) await DB.hardDelete('project_tasks', s.id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.render();
  },
};

/**
 * 综合数据统计模块
 */
const StatsModule = {
  async render() {
    const timers = (await DB.list('timers')).filter(t => !t.deleted_at);
    const projects = (await DB.list('projects')).filter(p => !p.deleted_at);
    const emotions = (await DB.list('emotions')).filter(e => !e.deleted_at);
    const linkRecords = (await DB.list('link_records')).filter(r => !r.deleted_at);
    const cardDraws = (await DB.list('card_draws')).filter(d => !d.deleted_at);
    const workouts = (await DB.list('workouts')).filter(w => !w.deleted_at);

    const html = `
      <div class="page">
        <div class="page__title">📊 综合数据统计</div>

        <div class="grid grid-2 mb-4">
          <div class="card">
            <div class="card-title text-sm">⏱️ 计时记录</div>
            <div class="text-2xl" style="color:var(--color-primary);font-weight:600">${timers.length}</div>
            <div class="text-faint text-xs">${this._fmtDur(timers.reduce((s,t)=>s+(t.duration||0),0))} 总时长</div>
          </div>
          <div class="card">
            <div class="card-title text-sm">🎬 项目</div>
            <div class="text-2xl" style="color:var(--color-rose);font-weight:600">${projects.length}</div>
            <div class="text-faint text-xs">完成率 ${projects.length?Math.round(projects.filter(p=>p.stage==='已完成'||p.stage==='已复盘').length/projects.length*100):0}%</div>
          </div>
          <div class="card">
            <div class="card-title text-sm">🌤️ 情绪记录</div>
            <div class="text-2xl" style="color:var(--color-wisteria);font-weight:600">${emotions.length}</div>
          </div>
          <div class="card">
            <div class="card-title text-sm">✨ 灵魂链接</div>
            <div class="text-2xl" style="color:var(--color-accent);font-weight:600">${linkRecords.length}</div>
            <div class="text-faint text-xs">真实互动 ${linkRecords.filter(r=>r.record_type==='真实互动'&&r.count_as_real!==false).length}</div>
          </div>
          <div class="card">
            <div class="card-title text-sm">💌 字卡</div>
            <div class="text-2xl" style="color:var(--color-primary);font-weight:600">${cardDraws.length}</div>
          </div>
          <div class="card">
            <div class="card-title text-sm">🏃 锻炼</div>
            <div class="text-2xl" style="color:var(--color-rose);font-weight:600">${workouts.length}</div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-title">📅 日历热力图（近30天活动）</div>
          <div id="heatmap" style="overflow-x:auto"></div>
        </div>

        <div class="card mb-4">
          <div class="card-title">📈 月度趋势</div>
          <div id="trendChart" style="min-height:240px"></div>
        </div>

        <div class="card">
          <div class="card-title">🔢 各类型占比</div>
          <div id="pieChart" style="min-height:240px"></div>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
    this._renderHeatmap(timers, emotions, workouts, linkRecords);
    this._renderTrend(timers, emotions, workouts);
    this._renderPie(timers);
  },

  _fmtDur(ms) {
    const m = Math.floor(ms/60000);
    if (m < 60) return `${m}分`;
    return `${Math.floor(m/60)}时${m%60}分`;
  },

  _renderHeatmap(timers, emotions, workouts, links) {
    const el = document.getElementById('heatmap');
    if (!el) return;
    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate()-i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const count = timers.filter(t=>t.start_time?.startsWith(key)).length
                  + emotions.filter(e=>e.created_at?.startsWith(key)).length
                  + workouts.filter(w=>w.date===key).length
                  + links.filter(l=>l.created_at?.startsWith(key)).length;
      days.push({ key, count, label: `${d.getMonth()+1}/${d.getDate()}` });
    }
    el.innerHTML = `
      <div style="display:flex;gap:3px;min-width:600px">
        ${days.map(d => {
          const intensity = Math.min(d.count, 5);
          const bg = d.count === 0 ? 'var(--color-divider)' : `rgba(241,148,166,${0.2+intensity*0.16})`;
          return `<div title="${d.label}: ${d.count} 条" style="width:18px;height:18px;border-radius:4px;background:${bg};flex-shrink:0"></div>`;
        }).join('')}
      </div>
      <div class="text-faint text-xs mt-2">颜色越深表示当天活动越多</div>
    `;
  },

  _renderTrend(timers, emotions, workouts) {
    const el = document.getElementById('trendChart');
    if (!el || typeof Chart === 'undefined') return;
    const now = new Date();
    const labels = []; const timerData = []; const emoData = []; const workData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const next = new Date(now.getFullYear(), now.getMonth()-i+1, 1);
      labels.push(`${d.getMonth()+1}月`);
      timerData.push(timers.filter(t => { const td = new Date(t.start_time); return td >= d && td < next; }).reduce((s,t)=>s+Math.round((t.duration||0)/60000),0));
      emoData.push(emotions.filter(e => { const ed = new Date(e.created_at); return ed >= d && ed < next; }).length);
      workData.push(workouts.filter(w => { const wd = new Date(w.date); return wd >= d && wd < next; }).length);
    }
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '240px';
    el.innerHTML = '';
    el.appendChild(canvas);
    new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [
        { label: '专注(分)', data: timerData, borderColor: '#8A4E7B', tension: 0.3 },
        { label: '情绪(次)', data: emoData, borderColor: '#F194A6', tension: 0.3 },
        { label: '锻炼(次)', data: workData, borderColor: '#BBA4D9', tension: 0.3 },
      ]},
      options: { maintainAspectRatio: false },
    });
  },

  _renderPie(timers) {
    const el = document.getElementById('pieChart');
    if (!el || typeof Chart === 'undefined' || timers.length === 0) {
      el.innerHTML = '<p class="text-faint text-sm text-center">暂无数据</p>';
      return;
    }
    const byType = {};
    timers.forEach(t => { byType[t.task_type] = (byType[t.task_type]||0) + Math.round((t.duration||0)/60000); });
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '240px';
    el.innerHTML = '';
    el.appendChild(canvas);
    new Chart(canvas, {
      type: 'doughnut',
      data: { labels: Object.keys(byType), datasets: [{ data: Object.values(byType), backgroundColor: ['#F194A6','#8A4E7B','#BBA4D9','#DB5A6B','#7EC8A0','#F5B97A'] }] },
      options: { maintainAspectRatio: false },
    });
  },
};
