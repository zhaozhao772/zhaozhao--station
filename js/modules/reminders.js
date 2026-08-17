/**
 * 提醒中心模块
 */
const RemindersModule = {
  async render() {
    const reminders = (await DB.list('reminders')).filter(r => !r.deleted_at);
    const pending = reminders.filter(r => !r.completed);
    const completed = reminders.filter(r => r.completed);
    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">🔔 提醒中心</div>
          <button class="btn btn--primary btn--sm" onclick="RemindersModule.add()">+ 新建提醒</button>
        </div>

        <div class="card mb-4">
          <div class="card-title">⏰ 待处理 (${pending.length})</div>
          ${pending.length === 0 ? UI.empty('✅','没有待处理提醒') : `
            <div class="flex flex-col gap-2">
              ${pending.sort((a,b)=>(a.time||'').localeCompare(b.time||'')).map(r => `
                <div class="list-item">
                  <span style="font-size:20px">${this._icon(r.category)}</span>
                  <div class="list-item__main">
                    <div class="list-item__title">${r.title}</div>
                    <div class="list-item__sub">${r.time?.replace('T',' ')||''} ${r.repeat?'· '+r.repeat:''} ${r.advance_min?'· 提前'+r.advance_min+'分':''}</div>
                  </div>
                  <button class="btn btn--sm btn--ghost" onclick="RemindersModule._done('${r.id}')">✓</button>
                  <button class="btn btn--sm btn--ghost" onclick="RemindersModule._del('${r.id}')">×</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        ${completed.length > 0 ? `
          <div class="card">
            <div class="card-title">✅ 已完成 (${completed.length})</div>
            <div class="flex flex-col gap-2">
              ${completed.slice(0,10).map(r => `
                <div class="list-item" style="opacity:0.5">
                  <div class="list-item__main">
                    <div class="list-item__title" style="text-decoration:line-through">${r.title}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
  },

  _icon(cat) {
    return { '工作':'💼','学习':'📚','截止日期':'⏰','休息':'☕','情绪':'🌤️','复盘':'🌙','纪念日':'💝','角色消息':'💬' }[cat] || '🔔';
  },

  async add() {
    UI.modal('新建提醒', `
      <div class="field"><label class="field__label">标题</label><input class="input" id="remTitle"></div>
      <div class="grid grid-2">
        <div class="field"><label class="field__label">类别</label><select class="select" id="remCat">
          <option>工作</option><option>学习</option><option>截止日期</option><option>休息</option>
          <option>情绪</option><option>复盘</option><option>纪念日</option><option>角色消息</option>
        </select></div>
        <div class="field"><label class="field__label">时间</label><input class="input" type="datetime-local" id="remTime"></div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="field__label">提前提醒（分钟）</label><input class="input" type="number" id="remAdvance" value="0"></div>
        <div class="field"><label class="field__label">重复</label><select class="select" id="remRepeat">
          <option value="">不重复</option><option>每天</option><option>每周</option><option>每月</option>
        </select></div>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="RemindersModule._save()">保存</button>
      </div>
    `);
  },

  async _save() {
    const title = document.getElementById('remTitle').value.trim();
    if (!title) { UI.toast('请输入标题','error'); return; }
    await DB.save('reminders', {
      title, category: document.getElementById('remCat').value,
      time: document.getElementById('remTime').value,
      advance_min: parseInt(document.getElementById('remAdvance').value)||0,
      repeat: document.getElementById('remRepeat').value,
      completed: false,
    });
    UI.closeModal();
    UI.toast('提醒已创建','success');
    this.render();
  },

  async _done(id) {
    const r = await DB.get('reminders', id);
    if (r) { r.completed = true; r.completed_at = nowISO(); await DB.save('reminders', r); }
    this.render();
  },

  async _del(id) {
    if (!await UI.confirm('删除这条提醒？')) return;
    await DB.hardDelete('reminders', id);
    this.render();
  },

  async checkAll() {
    const reminders = (await DB.list('reminders')).filter(r => !r.deleted_at && !r.completed);
    const now = Date.now();
    for (const r of reminders) {
      if (!r.time) continue;
      const t = new Date(r.time).getTime();
      const advance = (r.advance_min||0) * 60000;
      if (t - advance <= now && t + 3600000 > now) {
        // 在提醒窗口内
        if (!r.notified) {
          UI.toast(`🔔 ${r.title}`, 'info', 5000);
          r.notified = true;
          await DB.save('reminders', r);
        }
      }
    }
    // 定期检查
    if (!this._checkTimer) {
      this._checkTimer = setInterval(() => this.checkAll(), 60000);
    }
  },
};
