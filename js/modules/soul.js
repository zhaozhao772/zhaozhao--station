/**
 * 灵魂链接日记模块
 * 多对象档案、记录类型分类、统计
 * + 每日链接状态追踪
 */
const SoulModule = {
  async render() {
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    if (profiles.length === 0) {
      await DB.save('link_profiles', { name: App.getLinkName(), is_default: true, note: '默认档案' });
      profiles.push(...(await DB.list('link_profiles')).filter(p => !p.deleted_at));
    }
    const currentProfileId = App.state.settings.current_link_profile || profiles[0]?.id;
    const currentProfile = profiles.find(p => p.id === currentProfileId) || profiles[0];

    const records = (await DB.list('link_records')).filter(r => !r.deleted_at && r.profile_id === currentProfile?.id);
    const dailyStatus = (await DB.list('link_daily_status')).filter(s => !s.deleted_at && s.profile_id === currentProfile?.id);
    const todayStatus = dailyStatus.find(s => s.date === todayKey());

    const moduleNames = App.state.settings.soul_module_names || ['灵魂链接','梦角手账','特别记录','一些灵感和想法'];

    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div class="page__title" style="margin:0">✨ ${moduleNames[0] || '灵魂链接'}</div>
          <div class="flex gap-2">
            <button class="btn btn--sm" onclick="SoulModule.switchProfile()">切换档案</button>
            <button class="btn btn--primary btn--sm" onclick="SoulModule.add()">+ 记录</button>
          </div>
        </div>

        <!-- 当前档案 -->
        <div class="card card--blur mb-4" style="background:linear-gradient(135deg,rgba(187,164,217,0.08),rgba(241,148,166,0.08))">
          <div class="flex items-center gap-3">
            <span style="font-size:32px">🌙</span>
            <div class="flex-1">
              <div class="font-bold text-lg" style="color:var(--color-primary)">${currentProfile?.name||App.getLinkName()}</div>
              <div class="text-faint text-xs">共 ${records.length} 条记录</div>
            </div>
          </div>
        </div>

        <!-- 今日链接天气 -->
        <div class="card mb-4" style="border:1px solid var(--color-wisteria)">
          <div class="flex items-center justify-between">
            <div>
              <div class="card-title">🔮 今日链接状态</div>
              ${todayStatus
                ? `<div class="mt-2 text-lg">${this._statusIcon(todayStatus.status)} ${todayStatus.status}</div>`
                : '<p class="text-faint text-sm mt-2">今天还没有记录链接状态</p>'}
            </div>
            <button class="btn btn--sm btn--rose" onclick="SoulModule.addDailyStatus()">${todayStatus?'编辑':'记录'}</button>
          </div>
        </div>

        <!-- 统计概览 -->
        <div class="grid grid-2 mb-4">
          <div class="card">
            <div class="card-title text-sm">📊 本月统计</div>
            ${this._monthStats(records)}
          </div>
          <div class="card">
            <div class="card-title text-sm">⏱️ 距上次互动</div>
            ${this._lastInteraction(records)}
          </div>
        </div>

        <!-- 链接状态曲线 -->
        ${dailyStatus.length > 0 ? `
          <div class="card mb-4">
            <div class="card-title">📈 链接状态变化曲线</div>
            <div id="statusChart" style="min-height:200px"></div>
            <div class="flex gap-3 mt-2 text-xs">
              <span style="color:#7EC8A0">● 活跃</span>
              <span style="color:#BBA4D9">● 平静</span>
              <span style="color:#7090B0">● 偏弱</span>
            </div>
          </div>
        ` : ''}

        <!-- 子模块入口 -->
        <div class="grid grid-2 mb-4">
          <div class="card card--blur" style="cursor:pointer" onclick="App.navigate('star-map')">
            <div style="font-size:28px">🌟</div>
            <div class="font-bold mt-2">链接星图</div>
            <div class="text-faint text-xs">愿望记录与显化观察</div>
          </div>
          <div class="card card--blur" style="cursor:pointer" onclick="App.navigate('cards')">
            <div style="font-size:28px">💌</div>
            <div class="font-bold mt-2">字卡传讯</div>
            <div class="text-faint text-xs">象征性自我探索</div>
          </div>
        </div>

        <!-- 记录时间线 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📜 记录时间线</div>
            <button class="btn btn--sm btn--ghost" onclick="SoulModule.showFilter()">🔍 筛选</button>
          </div>
          ${records.length === 0 ? UI.empty('🌙','还没有记录，开始写下今天的第一条吧') : `
            <div class="flex flex-col gap-2" id="recordList">
              ${records.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,30).map(r => `
                <div class="list-item" style="cursor:pointer" onclick="SoulModule.view('${r.id}')">
                  <span style="font-size:20px">${this._typeIcon(r.record_type)}</span>
                  <div class="list-item__main">
                    <div class="list-item__title">${r.title||r.record_type} ${r.is_important?'⭐':''}</div>
                    <div class="list-item__sub">${r.record_type} · ${r.created_at.slice(0,16).replace('T',' ')}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- 月度回顾 -->
        ${records.length >= 3 ? `
          <div class="card mt-4">
            <div class="card-title">📅 月度链接回顾</div>
            <button class="btn btn--sm btn--rose" onclick="SoulModule.monthlyReview()">生成本月回顾</button>
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
    if (dailyStatus.length > 0) this._renderStatusChart(dailyStatus);
  },

  _statusIcon(s) {
    return { '活跃':'🌙✨','平静':'☁️','偏弱':'🌫️' }[s] || '☁️';
  },

  _typeIcon(t) {
    return { '真实互动':'💬','同步性或显化记录':'🔮','感想与成长':'🌱','梦境与直觉':'🌙','重要纪念':'💝' }[t] || '✨';
  },

  _monthStats(records) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRecs = records.filter(r => new Date(r.created_at) >= monthStart);
    const real = monthRecs.filter(r => r.record_type === '真实互动' && r.count_as_real !== false);
    const sync = monthRecs.filter(r => r.record_type === '同步性或显化记录');
    const dream = monthRecs.filter(r => r.record_type === '梦境与直觉');
    const growth = monthRecs.filter(r => r.record_type === '感想与成长');
    return `
      <ul class="text-sm" style="line-height:1.8">
        <li>💬 真实互动: <b>${real.length}</b></li>
        <li>🔮 同步性/显化: ${sync.length}</li>
        <li>🌙 梦境与直觉: ${dream.length}</li>
        <li>🌱 感想与成长: ${growth.length}</li>
      </ul>
      <div class="text-faint text-xs mt-2">后三类默认不计入真实互动</div>
    `;
  },

  _lastInteraction(records) {
    const real = records.filter(r => r.record_type === '真实互动' && r.count_as_real !== false)
      .sort((a,b)=>b.created_at.localeCompare(a.created_at));
    if (real.length === 0) return '<p class="text-faint text-sm">暂无真实互动记录</p>';
    const last = new Date(real[0].created_at);
    const days = Math.floor((Date.now() - last.getTime()) / 86400000);
    return `
      <div class="text-2xl" style="color:var(--color-rose);font-weight:600">${days} 天</div>
      <div class="text-faint text-xs mt-1">${last.toLocaleDateString('zh-CN')}</div>
    `;
  },

  async _renderStatusChart(dailyStatus) {
    const el = document.getElementById('statusChart');
    if (!el || typeof Chart === 'undefined') return;
    const sorted = dailyStatus.sort((a,b)=>a.date.localeCompare(b.date));
    const labels = sorted.map(s => s.date.slice(5));
    const statusMap = { '活跃':3, '平静':2, '偏弱':1 };
    const data = sorted.map(s => statusMap[s.status] || 2);
    const colors = sorted.map(s => s.status==='活跃'?'#7EC8A0':s.status==='偏弱'?'#7090B0':'#BBA4D9');
    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '200px';
    el.innerHTML = '';
    el.appendChild(canvas);
    new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [{
        data, borderColor: '#BBA4D9', tension: 0.4, fill: true,
        backgroundColor: 'rgba(187,164,217,0.1)',
        pointBackgroundColor: colors, pointRadius: 6,
      }]},
      options: {
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: ctx => sorted[ctx.dataIndex].status } }
        },
        scales: { y: { min: 0, max: 4, ticks: { callback: v => ({3:'活跃',2:'平静',1:'偏弱'})[v]||'' } } },
        maintainAspectRatio: false,
      },
    });
  },

  quickAdd() { this.add(); },

  async add() {
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    const currentProfileId = App.state.settings.current_link_profile || profiles[0]?.id;
    const types = ['真实互动','同步性或显化记录','感想与成长','梦境与直觉','重要纪念'];
    const interactMethods = ['文字聊天','对方主动联系','我主动联系','礼物','其他真实互动'];
    UI.modal('记录灵魂链接 ✨', `
      <div class="field">
        <label class="field__label">标题</label>
        <input class="input" id="rTitle" placeholder="给这条记录起个名字">
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">对象档案</label>
          <select class="select" id="rProfile">${profiles.map(p=>`<option value="${p.id}" ${p.id===currentProfileId?'selected':''}>${p.name}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label class="field__label">记录类型</label>
          <select class="select" id="rType" onchange="SoulModule._onTypeChange()">${types.map(t=>`<option>${t}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field" id="methodField">
        <label class="field__label">互动方式/事件来源</label>
        <select class="select" id="rMethod">
          ${interactMethods.map(m=>`<option>${m}</option>`).join('')}
        </select>
      </div>

      <div class="card--blur" style="background:rgba(241,148,166,0.06);padding:12px;border-radius:10px;margin:8px 0">
        <div class="text-xs text-faint mb-2">1️⃣ 实际发生（可确认的行为、话语和事件）</div>
        <textarea class="textarea" id="rHappened" placeholder="客观描述发生了什么"></textarea>
      </div>
      <div class="card--blur" style="background:rgba(187,164,217,0.06);padding:12px;border-radius:10px;margin:8px 0">
        <div class="text-xs text-faint mb-2">2️⃣ 我的感受（情绪、身体感受、期待和担忧）</div>
        <textarea class="textarea" id="rFeeling" placeholder="我当时的第一反应、情绪和身体感受"></textarea>
        <input class="input mt-2" id="rEmotion" placeholder="情绪和强度（如：开心 7/10）">
        <textarea class="textarea mt-2" id="rNeed" placeholder="我真正期待或需要的是什么"></textarea>
      </div>
      <div class="card--blur" style="background:rgba(138,78,123,0.06);padding:12px;border-radius:10px;margin:8px 0">
        <div class="text-xs text-faint mb-2">3️⃣ 我的理解（个人联想、象征意义和灵性解读）</div>
        <textarea class="textarea" id="rUnderstanding" placeholder="我的理解和联想"></textarea>
        <div class="text-xs text-faint mt-2">⚠️ 系统不会把"我的理解"表述为已证实的客观事实</div>
      </div>

      <div class="field">
        <label class="field__label">得到的感悟</label>
        <textarea class="textarea" id="rInsight"></textarea>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">自定义标签</label>
          <input class="input" id="rTags" placeholder="逗号分隔">
        </div>
        <div class="field">
          <label class="field__label">日期时间</label>
          <input class="input" type="datetime-local" id="rTime">
        </div>
      </div>
      <div class="flex gap-3">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="rImportant"> 设为重要记录</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="rCountReal" checked> 计入真实互动统计</label>
      </div>
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="SoulModule._save()">保存</button>
      </div>
    `);
    // 默认时间
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    document.getElementById('rTime').value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    this._onTypeChange();
  },

  _onTypeChange() {
    const t = document.getElementById('rType')?.value;
    const field = document.getElementById('methodField');
    if (t === '真实互动') {
      field.style.display = '';
    } else {
      field.style.display = 'none';
    }
    // 非真实互动默认不计入
    const cb = document.getElementById('rCountReal');
    if (cb) cb.checked = (t === '真实互动');
  },

  async _save() {
    const profileId = document.getElementById('rProfile').value;
    const type = document.getElementById('rType').value;
    const timeStr = document.getElementById('rTime').value;
    await DB.save('link_records', {
      profile_id: profileId,
      title: document.getElementById('rTitle').value,
      record_type: type,
      method: document.getElementById('rMethod')?.value || '',
      happened: document.getElementById('rHappened').value,
      feeling: document.getElementById('rFeeling').value,
      emotion: document.getElementById('rEmotion').value,
      need: document.getElementById('rNeed').value,
      understanding: document.getElementById('rUnderstanding').value,
      insight: document.getElementById('rInsight').value,
      tags: document.getElementById('rTags').value.split(',').map(s=>s.trim()).filter(Boolean),
      is_important: document.getElementById('rImportant').checked,
      count_as_real: document.getElementById('rCountReal').checked,
      created_at: timeStr ? new Date(timeStr).toISOString() : nowISO(),
    });
    // 如果有明显情绪变化，询问是否同步到情绪记录
    const emotion = document.getElementById('rEmotion').value;
    UI.closeModal();
    if (emotion) {
      setTimeout(() => {
        UI.modal('同步到情绪记录？', `
          <p class="text-soft mb-4">检测到你记录了情绪变化（${emotion}），是否同步到情绪曲线？</p>
          <div class="flex gap-3" style="justify-content:flex-end">
            <button class="btn" onclick="UI.closeModal()">不同步</button>
            <button class="btn btn--primary" onclick="SoulModule._syncEmotion('${emotion}')">同步</button>
          </div>
        `);
      }, 300);
    }
    UI.toast('记录已保存','success');
    this.render();
  },

  async _syncEmotion(emotionStr) {
    UI.closeModal();
    const parts = emotionStr.split(/\s+/);
    const type = parts[0] || '平和';
    const intensity = parseInt(parts[1]) || 5;
    await DB.save('emotions', {
      emotion_type: type,
      intensity,
      event: '来自灵魂链接记录',
      source_type: 'link_sync',
    });
    UI.toast('已同步到情绪记录','success');
  },

  async view(id) {
    const r = await DB.get('link_records', id);
    if (!r) return;
    UI.modal(r.title || r.record_type, `
      <div class="list-item"><div class="list-item__main">
        <div class="list-item__title">${this._typeIcon(r.record_type)} ${r.record_type}</div>
        <div class="list-item__sub">${r.created_at.slice(0,19).replace('T',' ')} ${r.is_important?'· ⭐重要':''}</div>
      </div></div>
      ${r.method ? `<p class="text-soft text-sm mt-2">互动方式: ${r.method}</p>` : ''}
      ${r.happened ? `<div class="card--blur mt-3" style="background:rgba(241,148,166,0.06);padding:12px;border-radius:10px"><div class="text-xs text-faint mb-1">实际发生</div><div>${r.happened}</div></div>` : ''}
      ${r.feeling ? `<div class="card--blur mt-2" style="background:rgba(187,164,217,0.06);padding:12px;border-radius:10px"><div class="text-xs text-faint mb-1">我的感受</div><div>${r.feeling}</div>${r.emotion?`<div class="text-sm mt-1">${r.emotion}</div>`:''}${r.need?`<div class="text-sm mt-1">需要: ${r.need}</div>`:''}</div>` : ''}
      ${r.understanding ? `<div class="card--blur mt-2" style="background:rgba(138,78,123,0.06);padding:12px;border-radius:10px"><div class="text-xs text-faint mb-1">我的理解（个人联想，非客观事实）</div><div>${r.understanding}</div></div>` : ''}
      ${r.insight ? `<p class="mt-3"><b>感悟:</b> ${r.insight}</p>` : ''}
      ${r.tags?.length ? `<div class="mt-2">${r.tags.map(t=>`<span class="tag-chip" style="font-size:11px;padding:2px 8px">${t}</span>`).join(' ')}</div>` : ''}
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn btn--accent btn--sm" onclick="SoulModule._del('${id}')">删除</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _del(id) {
    if (!await UI.confirm('删除这条记录？会影响相关统计。')) return;
    await DB.hardDelete('link_records', id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.render();
  },

  async switchProfile() {
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    UI.modal('选择对象档案', `
      ${profiles.map(p => `
        <div class="list-item" style="cursor:pointer" onclick="SoulModule._setProfile('${p.id}')">
          <span style="font-size:20px">🌙</span>
          <div class="list-item__main">
            <div class="list-item__title">${p.name}</div>
            <div class="list-item__sub">${p.note||''}</div>
          </div>
        </div>
      `).join('')}
      <button class="btn btn--ghost btn--block mt-2" onclick="SoulModule.addProfile()">+ 新建档案</button>
    `);
  },

  async _setProfile(id) {
    await DB.setSetting('current_link_profile', id);
    App.state.settings.current_link_profile = id;
    UI.closeModal();
    this.render();
  },

  async addProfile() {
    UI.closeModal();
    UI.modal('新建对象档案', `
      <div class="field">
        <label class="field__label">名称</label>
        <input class="input" id="pName" placeholder="如：另一个昵称">
      </div>
      <div class="field">
        <label class="field__label">备注</label>
        <input class="input" id="pNote">
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="SoulModule._saveProfile()">创建</button>
      </div>
    `);
  },

  async _saveProfile() {
    const name = document.getElementById('pName').value.trim();
    if (!name) { UI.toast('请输入名称','error'); return; }
    const p = await DB.save('link_profiles', { name, note: document.getElementById('pNote').value });
    await DB.setSetting('current_link_profile', p.id);
    App.state.settings.current_link_profile = p.id;
    UI.closeModal();
    UI.toast('已创建并切换','success');
    this.render();
  },

  // ============ 每日链接状态 ============
  async addDailyStatus() {
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    const currentProfileId = App.state.settings.current_link_profile || profiles[0]?.id;
    const existing = (await DB.list('link_daily_status')).find(s => s.profile_id === currentProfileId && s.date === todayKey());
    UI.modal('🔮 今日链接状态', `
      <div class="field">
        <label class="field__label">今天你觉得链接状态如何？（手动选择，系统不自动判断）</label>
        <div class="tag-select" id="statusSelect">
          <div class="tag-chip ${existing?.status==='活跃'?'active':''}" onclick="SoulModule._selStatus(this,'活跃')">🌙 活跃</div>
          <div class="tag-chip ${existing?.status==='平静'?'active':''}" onclick="SoulModule._selStatus(this,'平静')">☁️ 平静</div>
          <div class="tag-chip ${existing?.status==='偏弱'?'active':''}" onclick="SoulModule._selStatus(this,'偏弱')">🌫️ 偏弱</div>
        </div>
      </div>
      <div class="field">
        <label class="field__label">为什么认为是这个状态？</label>
        <textarea class="textarea" id="sReason" placeholder="记录观察依据：实际互动次数、是否有同步事件、身体状态等">${existing?.reason||''}</textarea>
      </div>
      <div class="card--blur" style="background:var(--color-bg-alt);padding:14px;border-radius:12px;margin:12px 0">
        <div class="font-bold text-sm mb-2">📋 今日现实状态（多选）</div>
        <div class="field">
          <label class="field__label">睡眠状态</label>
          <div class="tag-select" id="sleepTags">
            ${['睡眠充足','正常','熬夜','睡眠不足'].map(v=>`<div class="tag-chip ${existing?.sleep?.includes(v)?'active':''}" onclick="this.classList.toggle('active')">${v}</div>`).join('')}
          </div>
        </div>
        <div class="field">
          <label class="field__label">身体状态</label>
          <div class="tag-select" id="bodyTags">
            ${['精力充沛','普通','疲惫','生病','生理期','身体不适'].map(v=>`<div class="tag-chip ${existing?.body?.includes(v)?'active':''}" onclick="this.classList.toggle('active')">${v}</div>`).join('')}
          </div>
        </div>
        <div class="field">
          <label class="field__label">情绪状态</label>
          <div class="tag-select" id="emoTags">
            ${['开心','平静','焦虑','压力大','委屈','低落'].map(v=>`<div class="tag-chip ${existing?.emotion_state?.includes(v)?'active':''}" onclick="this.classList.toggle('active')">${v}</div>`).join('')}
          </div>
        </div>
        <div class="field">
          <label class="field__label">现实环境</label>
          <div class="tag-select" id="envTags">
            ${['工作很多','学习压力大','社交较多','独处时间多','天气影响','旅行或环境变化'].map(v=>`<div class="tag-chip ${existing?.environment?.includes(v)?'active':''}" onclick="this.classList.toggle('active')">${v}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="field">
        <label class="field__label">补充说明</label>
        <textarea class="textarea" id="sExtra">${existing?.extra||''}</textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="SoulModule._saveDailyStatus('${existing?.id||''}','${currentProfileId}')">保存</button>
      </div>
    `);
    this._selStatusVal = existing?.status || null;
  },

  _selStatus(el, s) {
    el.parentElement.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this._selStatusVal = s;
  },

  _collectTags(containerId) {
    return [...document.querySelectorAll(`#${containerId} .tag-chip.active`)].map(el => el.textContent);
  },

  async _saveDailyStatus(id, profileId) {
    if (!this._selStatusVal) { UI.toast('请选择链接状态','error'); return; }
    const data = {
      profile_id: profileId,
      date: todayKey(),
      status: this._selStatusVal,
      reason: document.getElementById('sReason').value,
      sleep: this._collectTags('sleepTags'),
      body: this._collectTags('bodyTags'),
      emotion_state: this._collectTags('emoTags'),
      environment: this._collectTags('envTags'),
      extra: document.getElementById('sExtra').value,
    };
    if (id) data.id = id;
    await DB.save('link_daily_status', data);

    // 联动：如果偏弱且情绪低落，询问是否同步情绪
    if (this._selStatusVal === '偏弱' && data.emotion_state.includes('低落')) {
      UI.closeModal();
      setTimeout(() => {
        UI.modal('同步到情绪记录？', `
          <p class="text-soft mb-4">今天链接状态偏弱，且情绪低落，是否同步到情绪曲线？</p>
          <div class="flex gap-3" style="justify-content:flex-end">
            <button class="btn" onclick="UI.closeModal()">不同步</button>
            <button class="btn btn--primary" onclick="SoulModule._syncLowEmotion()">同步</button>
          </div>
        `);
      }, 300);
    } else {
      UI.closeModal();
    }
    UI.toast('链接状态已记录','success');
    this.render();
  },

  async _syncLowEmotion() {
    UI.closeModal();
    await DB.save('emotions', {
      emotion_type: '低落',
      intensity: 5,
      event: '链接状态偏弱',
      source_type: 'link_status_sync',
    });
    UI.toast('已同步到情绪记录','success');
  },

  async showFilter() {
    const types = ['真实互动','同步性或显化记录','感想与成长','梦境与直觉','重要纪念'];
    UI.modal('筛选记录', `
      <div class="field">
        <label class="field__label">记录类型</label>
        <select class="select" id="fType"><option value="">全部</option>${types.map(t=>`<option>${t}</option>`).join('')}</select>
      </div>
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
        <input class="input" id="fKeyword">
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="SoulModule._applyFilter()">筛选</button>
      </div>
    `);
  },

  async _applyFilter() {
    const type = document.getElementById('fType').value;
    const start = document.getElementById('fStart').value;
    const end = document.getElementById('fEnd').value;
    const kw = document.getElementById('fKeyword').value.trim().toLowerCase();
    UI.closeModal();
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    const currentProfileId = App.state.settings.current_link_profile || profiles[0]?.id;
    let all = (await DB.list('link_records')).filter(r => !r.deleted_at && r.profile_id === currentProfileId);
    if (type) all = all.filter(r => r.record_type === type);
    if (start) all = all.filter(r => r.created_at >= start);
    if (end) all = all.filter(r => r.created_at <= end + 'T23:59:59');
    if (kw) all = all.filter(r => (r.title||'').toLowerCase().includes(kw) || (r.happened||'').toLowerCase().includes(kw) || (r.feeling||'').toLowerCase().includes(kw));
    UI.modal(`筛选结果（${all.length} 条）`, all.length === 0 ? '<p class="text-faint text-sm">无匹配记录</p>' : `
      <div class="flex flex-col gap-2">
        ${all.sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(r => `
          <div class="list-item" style="cursor:pointer" onclick="UI.closeModal();SoulModule.view('${r.id}')">
            <span style="font-size:20px">${this._typeIcon(r.record_type)}</span>
            <div class="list-item__main">
              <div class="list-item__title">${r.title||r.record_type}</div>
              <div class="list-item__sub">${r.created_at.slice(0,16).replace('T',' ')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `);
  },

  async monthlyReview() {
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    const currentProfileId = App.state.settings.current_link_profile || profiles[0]?.id;
    const records = (await DB.list('link_records')).filter(r => !r.deleted_at && r.profile_id === currentProfileId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRecs = records.filter(r => new Date(r.created_at) >= monthStart);
    const real = monthRecs.filter(r => r.record_type === '真实互动' && r.count_as_real !== false);
    const otherActive = monthRecs.filter(r => r.record_type === '真实互动' && r.method === '对方主动联系');
    const myActive = monthRecs.filter(r => r.record_type === '真实互动' && r.method === '我主动联系');
    const methodCount = {};
    real.forEach(r => { methodCount[r.method] = (methodCount[r.method]||0)+1; });
    UI.modal(`${now.getMonth()+1}月链接回顾`, `
      <div class="text-soft text-sm mb-3">基于 ${monthRecs.length} 条记录生成（可编辑）</div>
      <div class="card--blur" style="background:var(--color-bg-alt);padding:14px;border-radius:12px">
        <p class="text-sm"><b>本月真实互动情况：</b>${real.length} 次</p>
        <p class="text-sm mt-2"><b>主要互动方式：</b>${Object.entries(methodCount).map(([m,c])=>`${m}(${c})`).join('、')||'-'}</p>
        <p class="text-sm mt-2"><b>对方主动：</b>${otherActive.length} 次 · <b>我主动：</b>${myActive.length} 次</p>
      </div>
      <div class="ai-block mt-3">
        📝 以上为客观统计。你可以在下方补充你的感受和成长。
      </div>
      <div class="field mt-3">
        <label class="field__label">带来安全感或快乐的事情</label>
        <textarea class="textarea" id="mrJoy"></textarea>
      </div>
      <div class="field">
        <label class="field__label">引发不安、委屈或失落的情境</label>
        <textarea class="textarea" id="mrSad"></textarea>
      </div>
      <div class="field">
        <label class="field__label">反复出现的期待和主题</label>
        <textarea class="textarea" id="mrTheme"></textarea>
      </div>
      <div class="field">
        <label class="field__label">对自身需求和边界的新认识</label>
        <textarea class="textarea" id="mrBoundary"></textarea>
      </div>
      <div class="field">
        <label class="field__label">本月获得的成长</label>
        <textarea class="textarea" id="mrGrowth"></textarea>
      </div>
      <div class="field">
        <label class="field__label">下个月值得继续观察的问题</label>
        <textarea class="textarea" id="mrQuestion"></textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="SoulModule._saveReview()">保存回顾</button>
      </div>
    `);
  },

  async _saveReview() {
    const now = new Date();
    await DB.save('reviews', {
      type: 'link_monthly',
      date: todayKey(),
      month: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,
      content: {
        joy: document.getElementById('mrJoy').value,
        sad: document.getElementById('mrSad').value,
        theme: document.getElementById('mrTheme').value,
        boundary: document.getElementById('mrBoundary').value,
        growth: document.getElementById('mrGrowth').value,
        question: document.getElementById('mrQuestion').value,
      },
    });
    UI.closeModal();
    UI.toast('月度回顾已保存','success');
  },
};
