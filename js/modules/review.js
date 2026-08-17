/**
 * 每日复盘与设置模块
 */
const ReviewModule = {
  async render() {
    const reviews = (await DB.list('reviews')).filter(r => !r.deleted_at && r.type !== 'link_monthly' && r.type !== 'star_diary');
    const today = todayKey();
    const todayReview = reviews.find(r => r.date === today);
    const recent = reviews.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);

    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">🌙 每日复盘</div>
          <button class="btn btn--primary btn--sm" onclick="ReviewModule.startToday()">${todayReview?'编辑今日':'开始复盘'}</button>
        </div>

        ${todayReview ? `
          <div class="card mb-4">
            <div class="card-title">📝 今日复盘（${today}）</div>
            ${this._renderReviewContent(todayReview)}
          </div>
        ` : `
          <div class="card mb-4">
            ${UI.empty('🌙','今天还没有复盘')}
            <button class="btn btn--primary mt-2" onclick="ReviewModule.startToday()">开始每日复盘</button>
          </div>
        `}

        <div class="card">
          <div class="card-title">📜 历史复盘</div>
          ${recent.length === 0 ? '<p class="text-faint text-sm">暂无历史复盘</p>' : `
            <div class="flex flex-col gap-2">
              ${recent.map(r => `
                <div class="list-item" style="cursor:pointer" onclick="ReviewModule.view('${r.id}')">
                  <div class="list-item__main">
                    <div class="list-item__title">${r.date}</div>
                    <div class="list-item__sub">${r.content?.top3?.[0] || r.content?.summary?.slice(0,40) || ''}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="card mt-4">
          <div class="card-title">⚙️ 快捷设置</div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn--sm" onclick="App.navigate('settings')">全部设置</button>
            <button class="btn btn--sm" onclick="ReviewModule.exportData()">导出数据</button>
            <button class="btn btn--sm" onclick="ReviewModule.importData()">导入数据</button>
            <button class="btn btn--sm" onclick="ReviewModule.dataHealth()">数据健康检查</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
  },

  _renderReviewContent(r) {
    const c = r.content || {};
    return `
      ${c.summary ? `<p class="mb-2"><b>今天完成了什么：</b> ${c.summary}</p>` : ''}
      ${c.difficulty ? `<p class="mb-2"><b>遇到的困难：</b> ${c.difficulty}</p>` : ''}
      ${c.emotion ? `<p class="mb-2"><b>重要情绪变化：</b> ${c.emotion}</p>` : ''}
      ${c.top3 ? `<p class="mb-2"><b>明天最重要的三件事：</b><br>${c.top3.map((t,i)=>`${i+1}. ${t}`).join('<br>')}</p>` : ''}
      ${c.is_ai_generated ? '<div class="ai-badge">AI 草稿</div>' : ''}
    `;
  },

  async startToday() {
    const today = todayKey();
    let review = (await DB.list('reviews')).find(r => !r.deleted_at && r.date === today && r.type !== 'link_monthly' && r.type !== 'star_diary');
    // 自动生成草稿
    if (!review) {
      const draft = await this._generateDraft();
      review = await DB.save('reviews', { date: today, type: 'daily', content: draft, is_ai_generated: true });
    }
    const c = review.content || {};
    UI.modal(`每日复盘 - ${today}`, `
      <div class="ai-block mb-3">
        💡 已根据今日记录生成草稿（标注为 AI 生成），你可以自由编辑。草稿内容不会伪装成你的原话。
      </div>
      <div class="field"><label class="field__label">今天完成了什么</label><textarea class="textarea" id="rSummary">${c.summary||''}</textarea></div>
      <div class="field"><label class="field__label">今天在不同事项上用了多久</label><textarea class="textarea" id="rTime">${c.time||''}</textarea></div>
      <div class="field"><label class="field__label">今天最满意的事情</label><textarea class="textarea" id="rBest">${c.best||''}</textarea></div>
      <div class="field"><label class="field__label">今天遇到的困难</label><textarea class="textarea" id="rDiff">${c.difficulty||''}</textarea></div>
      <div class="field"><label class="field__label">今天的重要情绪变化</label><textarea class="textarea" id="rEmo">${c.emotion||''}</textarea></div>
      <div class="field"><label class="field__label">明天最重要的三件事</label>
        <input class="input mb-2" id="rTop1" placeholder="1." value="${c.top3?.[0]||''}">
        <input class="input mb-2" id="rTop2" placeholder="2." value="${c.top3?.[1]||''}">
        <input class="input" id="rTop3" placeholder="3." value="${c.top3?.[2]||''}">
      </div>
      <div class="field"><label class="field__label">自由写作</label><textarea class="textarea" id="rFree">${c.free||''}</textarea></div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="ReviewModule._saveReview('${review.id}')">保存复盘</button>
      </div>
    `);
  },

  async _generateDraft() {
    const today = todayKey();
    const timers = (await DB.list('timers')).filter(t => !t.deleted_at && t.start_time?.startsWith(today));
    const emotions = (await DB.list('emotions')).filter(e => !e.deleted_at && e.created_at?.startsWith(today));
    const workouts = (await DB.list('workouts')).filter(w => !w.deleted_at && w.date === today);
    const tasks = (await DB.list('tasks')).filter(t => !t.deleted_at && t.date === today && t.completed);
    let timeSummary = '';
    if (timers.length > 0) {
      const byType = {};
      timers.forEach(t => { byType[t.task_type] = (byType[t.task_type]||0) + Math.round((t.duration||0)/60000); });
      timeSummary = Object.entries(byType).map(([t,m])=>`${t}: ${m}分钟`).join('，');
    }
    let emoSummary = '';
    if (emotions.length > 0) {
      emoSummary = emotions.map(e=>`${e.emotion_type}(${e.intensity})`).join('，');
    }
    return {
      summary: tasks.length > 0 ? `完成了 ${tasks.length} 个任务：${tasks.map(t=>t.title).join('、')}` : '',
      time: timeSummary,
      best: '',
      difficulty: '',
      emotion: emoSummary,
      top3: ['','',''],
      free: '',
      workout_done: workouts.length > 0,
      read_done: timers.some(t => t.task_type === '阅读'),
      has_link: (await DB.list('link_records')).some(r => !r.deleted_at && r.created_at?.startsWith(today)),
    };
  },

  async _saveReview(id) {
    const r = await DB.get('reviews', id);
    if (r) {
      r.content = {
        summary: document.getElementById('rSummary').value,
        time: document.getElementById('rTime').value,
        best: document.getElementById('rBest').value,
        difficulty: document.getElementById('rDiff').value,
        emotion: document.getElementById('rEmo').value,
        top3: [document.getElementById('rTop1').value, document.getElementById('rTop2').value, document.getElementById('rTop3').value].filter(Boolean),
        free: document.getElementById('rFree').value,
      };
      r.is_ai_generated = false;  // 用户编辑后标记为非AI
      await DB.save('reviews', r);
    }
    UI.closeModal();
    UI.toast('复盘已保存','success');
    this.render();
  },

  async view(id) {
    const r = await DB.get('reviews', id);
    if (!r) return;
    UI.modal(`复盘 - ${r.date}`, this._renderReviewContent(r) + `
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn btn--accent btn--sm" onclick="ReviewModule._del('${id}')">删除</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _del(id) {
    if (!await UI.confirm('删除这条复盘？')) return;
    await DB.hardDelete('reviews', id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.render();
  },

  exportData() { SettingsModule.exportData(); },
  importData() { SettingsModule.importData(); },
  dataHealth() { SettingsModule.dataHealth(); },
};

/**
 * 设置模块
 */
const SettingsModule = {
  async render() {
    const s = App.state.settings;
    const health = await DB.healthCheck();
    const html = `
      <div class="page">
        <div class="page__title">⚙️ 设置</div>

        <div class="card mb-4">
          <div class="card-title">🎨 外观</div>
          <div class="field">
            <label class="field__label">主题模式</label>
            <div class="tag-select">
              <div class="tag-chip ${s.theme_mode==='light'?'active':''}" onclick="SettingsModule._setSetting('theme_mode','light')">🌸 浅色</div>
              <div class="tag-chip ${s.theme_mode==='dark'?'active':''}" onclick="SettingsModule._setSetting('theme_mode','dark')">🌙 柔和深色</div>
            </div>
          </div>
          <div class="field">
            <label class="field__label">界面密度</label>
            <div class="tag-select">
              <div class="tag-chip ${s.density==='auto'?'active':''}" onclick="SettingsModule._setSetting('density','auto')">📱 自适应</div>
              <div class="tag-chip ${s.density==='normal'?'active':''}" onclick="SettingsModule._setSetting('density','normal')">🌿 舒适</div>
              <div class="tag-chip ${s.density==='compact'?'active':''}" onclick="SettingsModule._setSetting('density','compact')">紧凑</div>
            </div>
          </div>
          <div class="field">
            <label class="field__label">时间格式</label>
            <div class="tag-select">
              <div class="tag-chip ${s.time_format==='24h'?'active':''}" onclick="SettingsModule._setSetting('time_format','24h')">24小时制</div>
              <div class="tag-chip ${s.time_format==='12h'?'active':''}" onclick="SettingsModule._setSetting('time_format','12h')">12小时制</div>
            </div>
          </div>
          <div class="field">
            <label class="field__label">自定义主色</label>
            <input class="input" type="color" value="${s.custom_primary||'#8A4E7B'}" oninput="SettingsModule._setSetting('custom_primary',this.value)" style="height:42px">
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-title">📝 基本信息修改</div>
          <div class="field"><label class="field__label">工作台名称</label><input class="input" value="${s.station_name||''}" onchange="SettingsModule._setSetting('station_name',this.value)"></div>
          <div class="field"><label class="field__label">副标题</label><input class="input" value="${s.subtitle||''}" onchange="SettingsModule._setSetting('subtitle',this.value)"></div>
          <div class="field"><label class="field__label">昵称</label><input class="input" value="${s.user_nickname||''}" onchange="SettingsModule._setSetting('user_nickname',this.value)"></div>
          <div class="field"><label class="field__label">链接对象称呼</label><input class="input" value="${s.link_partner_name||''}" onchange="SettingsModule._setSetting('link_partner_name',this.value)"></div>
          <div class="field">
            <label class="field__label">模块显示/隐藏</label>
            <div class="flex flex-wrap gap-2">
              ${App.modules.map(m => `
                <label class="tag-chip ${!(s.hidden_modules||[]).includes(m.id)?'active':''}" onclick="SettingsModule._toggleModule('${m.id}')">${m.icon} ${m.name}</label>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-title">🔒 隐私</div>
          <div class="field">
            <label class="flex items-center gap-2"><input type="checkbox" ${s.privacy_lock?'checked':''} onchange="SettingsModule._togglePrivacyLock(this.checked)"> 启用隐私模块密码</label>
          </div>
          <button class="btn btn--sm" onclick="SettingsModule._changePwd()">修改密码</button>
        </div>

        <div class="card mb-4">
          <div class="card-title">🤖 AI 功能</div>
          <div class="field">
            <label class="flex items-center gap-2"><input type="checkbox" ${s.enable_ai?'checked':''} onchange="SettingsModule._setSetting('enable_ai',this.checked)"> 启用 AI 辅助分析</label>
          </div>
          <div class="field">
            <label class="flex items-center gap-2"><input type="checkbox" ${s.enable_cards?'checked':''} onchange="SettingsModule._setSetting('enable_cards',this.checked)"> 启用字卡传讯</label>
          </div>
          <div class="field">
            <label class="flex items-center gap-2"><input type="checkbox" ${s.enable_self_explore?'checked':''} onchange="SettingsModule._setSetting('enable_self_explore',this.checked)"> 启用自我探索</label>
          </div>
          <div class="ai-disclaimer">AI 功能需要配置 API 连接。不配置时所有本地功能正常使用。</div>
          <button class="btn btn--sm mt-2" onclick="App.navigate('ai-chat')">配置 AI 连接</button>
        </div>

        <div class="card mb-4">
          <div class="card-title">💾 数据备份与恢复</div>
          <div class="flex flex-wrap gap-2 mb-3">
            <button class="btn btn--sm btn--primary" onclick="SettingsModule._backupNow()">立即备份</button>
            <button class="btn btn--sm" onclick="SettingsModule._listBackups()">查看备份</button>
            <button class="btn btn--sm" onclick="SettingsModule.exportData()">导出 JSON</button>
            <button class="btn btn--sm" onclick="SettingsModule.importData()">导入 JSON</button>
            <button class="btn btn--sm" onclick="SettingsModule._exportCSV()">导出 CSV</button>
          </div>
          <button class="btn btn--sm btn--accent" onclick="SettingsModule._requestPersistent()">申请永久存储权限</button>
          <div class="text-faint text-xs mt-2">当前持久化状态：${health.persistent?'已授权 ✓':'未授权（建议申请）'}</div>
        </div>

        <div class="card mb-4">
          <div class="card-title">🏥 数据健康检查</div>
          <div class="health-grid">
            <div class="health-item"><div class="health-item__label">数据库</div><div class="health-item__value text-sm">${health.db_name}</div></div>
            <div class="health-item"><div class="health-item__label">数据版本</div><div class="health-item__value">v${health.db_version}</div></div>
            <div class="health-item"><div class="health-item__label">总记录数</div><div class="health-item__value">${health.total_records}</div></div>
            <div class="health-item"><div class="health-item__label">备份数</div><div class="health-item__value">${health.backup_count}</div></div>
            <div class="health-item"><div class="health-item__label">最后备份</div><div class="health-item__value text-sm">${health.last_backup?health.last_backup.slice(0,10):'-'}</div></div>
            <div class="health-item"><div class="health-item__label">存储占用</div><div class="health-item__value text-sm">${(health.storage_usage/1024/1024).toFixed(1)}MB</div></div>
          </div>
          <div class="mt-3 text-sm">
            <div class="text-faint">各表记录数：</div>
            <div class="flex flex-wrap gap-2 mt-1">
              ${Object.entries(health.stores).filter(([k,v])=>v>0).map(([k,v])=>`<span class="tag-chip" style="font-size:11px;padding:2px 8px">${k}: ${v}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">ℹ️ 关于</div>
          <p class="text-sm text-soft">昭昭专属个人站 · 数据版本 v${DB_VERSION}</p>
          <p class="text-xs text-faint mt-1">所有数据保存在本地 IndexedDB，不会上传到服务器</p>
          <p class="text-xs text-faint">PWA 安装后可像 App 一样使用，但请定期备份</p>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
  },

  async _setSetting(key, value) {
    await DB.setSetting(key, value);
    App.state.settings[key] = value;
    App.applyTheme();
    if (key === 'station_name' || key === 'subtitle' || key === 'hidden_modules') {
      App.renderShell();
      App.navigate('settings');
    }
    UI.toast('已保存','success',1500);
  },

  async _toggleModule(id) {
    const hidden = App.state.settings.hidden_modules || [];
    const idx = hidden.indexOf(id);
    if (idx >= 0) hidden.splice(idx, 1);
    else hidden.push(id);
    await DB.setSetting('hidden_modules', hidden);
    App.state.settings.hidden_modules = hidden;
    App.renderShell();
    this.render();
  },

  async _togglePrivacyLock(on) {
    await DB.setSetting('privacy_lock', on);
    App.state.settings.privacy_lock = on;
    if (on && !await DB.getSetting('privacy_password')) {
      this._changePwd();
    }
  },

  async _changePwd() {
    UI.modal('设置隐私密码', `
      <div class="field"><label class="field__label">新密码（4-8位数字）</label><input class="input lock-screen__input" type="password" id="pwd1" maxlength="8" inputmode="numeric"></div>
      <div class="field"><label class="field__label">确认密码</label><input class="input lock-screen__input" type="password" id="pwd2" maxlength="8" inputmode="numeric"></div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="SettingsModule._savePwd()">保存</button>
      </div>
    `);
  },

  async _savePwd() {
    const p1 = document.getElementById('pwd1').value;
    const p2 = document.getElementById('pwd2').value;
    if (p1 !== p2) { UI.toast('两次输入不一致','error'); return; }
    if (p1 && (p1.length < 4 || p1.length > 8)) { UI.toast('密码需4-8位','error'); return; }
    await PrivacyLock.setPassword(p1);
    UI.closeModal();
    UI.toast('密码已设置','success');
  },

  async _backupNow() {
    const b = await DB.createBackup('manual');
    UI.toast(`已备份（${b.record_count} 条记录）`,'success');
    this.render();
  },

  async _listBackups() {
    const backups = await DB.listBackups();
    UI.modal('备份列表', backups.length === 0 ? '<p class="text-faint text-sm">暂无备份</p>' : `
      <div class="flex flex-col gap-2">
        ${backups.map(b => `
          <div class="list-item">
            <div class="list-item__main">
              <div class="list-item__title">${b.created_at.slice(0,19).replace('T',' ')}</div>
              <div class="list-item__sub">${b.reason} · ${b.record_count} 条</div>
            </div>
            <button class="btn btn--sm btn--accent" onclick="SettingsModule._restore('${b.id}')">恢复</button>
          </div>
        `).join('')}
      </div>
    `);
  },

  async _restore(id) {
    if (!await UI.confirm('恢复备份会覆盖当前数据（恢复前会自动再备份一次）。确认恢复？')) return;
    await DB.restoreBackup(id);
    UI.closeModal();
    UI.toast('已恢复，正在重新加载…','success');
    setTimeout(() => location.reload(), 1000);
  },

  async exportData() {
    const json = await DB.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zhaozhao-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('已导出','success');
  },

  async importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!await UI.confirm('导入数据将合并到当前数据库。建议先导出当前备份。继续？')) return;
      const text = await file.text();
      try {
        const count = await DB.importJSON(text, 'merge');
        UI.toast(`已导入 ${count} 条记录`,'success');
        setTimeout(() => location.reload(), 1000);
      } catch(err) {
        UI.toast('导入失败：'+err.message,'error');
      }
    };
    input.click();
  },

  async _exportCSV() {
    const stores = ['timers','emotions','workouts','link_records','books'];
    UI.modal('导出 CSV', `
      <p class="text-soft text-sm mb-3">选择要导出的数据表：</p>
      <div class="flex flex-col gap-2">
        ${stores.map(s => `
          <div class="list-item" style="cursor:pointer" onclick="SettingsModule._doExportCSV('${s}')">
            <div class="list-item__main"><div class="list-item__title">${s}</div></div>
            <span>导出 →</span>
          </div>
        `).join('')}
      </div>
    `);
  },

  async _doExportCSV(store) {
    const csv = await DB.exportCSV(store);
    if (!csv) { UI.toast('该表无数据','info'); return; }
    const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store}-${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    UI.closeModal();
    UI.toast('已导出','success');
  },

  async _requestPersistent() {
    const ok = await DB.requestPersistent();
    if (ok) UI.toast('永久存储已授权','success');
    else UI.toast('授权失败，请手动在浏览器设置中允许','error');
    this.render();
  },

  dataHealth() { this.render(); },
};
