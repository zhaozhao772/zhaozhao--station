/**
 * 链接星图模块
 * 愿望记录 → 现实观察 → 情绪体验 → 后续复盘
 */
const StarMapModule = {
  async render() {
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    const currentProfileId = App.state.settings.current_link_profile || profiles[0]?.id;
    const wishes = (await DB.list('link_wishes')).filter(w => !w.deleted_at && w.profile_id === currentProfileId);
    const treasures = (await DB.list('link_treasures')).filter(t => !t.deleted_at && t.profile_id === currentProfileId);

    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">🌟 链接星图</div>
          <button class="btn btn--primary btn--sm" onclick="StarMapModule.addWish()">+ 新增一颗星星</button>
        </div>

        <div class="ai-disclaimer mb-4">
          链接星图不是预测未来，也不是判断愿望一定会实现。<br>
          它帮助你保存曾经对链接产生过的愿望，并观察哪些最终在现实中出现。
        </div>

        <!-- 私人星空 -->
        <div class="starfield mb-4" id="starfield">
          ${wishes.length === 0
            ? '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#BBA4D9"><div style="font-size:40px">✨</div><p>点击右上角，许下你的第一颗星星</p></div>'
            : wishes.map(w => this._renderStar(w)).join('')}
        </div>

        <!-- 统计 -->
        <div class="grid grid-3 mb-4">
          <div class="card text-center">
            <div class="text-2xl" style="color:var(--color-wisteria);font-weight:600">${wishes.filter(w=>w.status==='等待中'||w.status==='等待观察').length}</div>
            <div class="text-faint text-xs">等待中</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl" style="color:var(--color-rose);font-weight:600">${wishes.filter(w=>w.status==='已实现'||w.status==='出现部分对应事件').length}</div>
            <div class="text-faint text-xs">已实现/部分</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl" style="color:var(--color-accent);font-weight:600">${treasures.length}</div>
            <div class="text-faint text-xs">宝物袋</div>
          </div>
        </div>

        <!-- 星星日记 -->
        <div class="card mb-4">
          <div class="card-title">📔 星星日记</div>
          <p class="text-faint text-sm mb-2">今天有没有什么事情让我想到某颗星星？（轻量，可选）</p>
          <button class="btn btn--sm btn--ghost" onclick="StarMapModule.addStarDiary()">写一句</button>
        </div>

        <!-- 宝物袋 -->
        <div class="card">
          <div class="card-title">🪄 宝物袋</div>
          ${treasures.length === 0 ? '<p class="text-faint text-sm">还没有已摘下的星星。实现的愿望会收藏在这里。</p>' : `
            <div class="flex flex-col gap-2">
              ${treasures.map(t => `
                <div class="list-item" style="cursor:pointer" onclick="StarMapModule.viewTreasure('${t.id}')">
                  <span style="font-size:20px">✨</span>
                  <div class="list-item__main">
                    <div class="list-item__title">${t.wish_title}</div>
                    <div class="list-item__sub">实现于 ${t.achieved_date||'-'}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
  },

  _renderStar(w) {
    // 随机位置但固定（基于 id hash）
    const seed = w.id.split('').reduce((s,c)=>s+c.charCodeAt(0),0);
    const x = (seed % 80) + 8;
    const y = ((seed * 7) % 75) + 10;
    const cls = w.status === '已实现' ? 'star-node--achieved' : (w.status === '出现部分对应事件' ? 'star-node--partial' : '');
    const size = w.importance >= 4 ? 28 : (w.importance >= 2 ? 22 : 18);
    return `
      <div class="star-node ${cls}" style="left:${x}%;top:${y}%" onclick="StarMapModule.viewWish('${w.id}')">
        <div class="star-node__glow" style="width:${size}px;height:${size}px"></div>
      </div>
    `;
  },

  async addWish() {
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    const currentProfileId = App.state.settings.current_link_profile || profiles[0]?.id;
    const categories = ['🌙 日常小显化','💌 互动愿望','🌱 关系成长愿望','✨ 内在成长愿望'];
    const statuses = ['⭐ 等待中','⭐ 等待观察','🌱 出现部分对应事件','✨ 已实现','🍃 暂未发生','🪐 不再期待'];
    UI.modal('新增一颗星星 ✨', `
      <div class="field">
        <label class="field__label">愿望标题</label>
        <input class="input" id="wTitle" placeholder="例如：希望收到一条特别的消息">
      </div>
      <div class="field">
        <label class="field__label">愿望详细描述</label>
        <textarea class="textarea" id="wDesc" placeholder="我为什么想体验 / 对我的意义 / 期待的感觉 / 脑海中的画面"></textarea>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">分类</label>
          <select class="select" id="wCat">${categories.map(c=>`<option>${c}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label class="field__label">重要程度（1-5）</label>
          <input class="input" type="number" min="1" max="5" value="3" id="wImportance">
        </div>
      </div>
      <div class="field">
        <label class="field__label">状态</label>
        <select class="select" id="wStatus">${statuses.map(s=>`<option ${s.includes('等待中')?'selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="StarMapModule._saveWish('${currentProfileId}')">许下星星</button>
      </div>
    `);
  },

  async _saveWish(profileId) {
    const title = document.getElementById('wTitle').value.trim();
    if (!title) { UI.toast('请填写愿望标题','error'); return; }
    await DB.save('link_wishes', {
      profile_id: profileId,
      title,
      description: document.getElementById('wDesc').value,
      category: document.getElementById('wCat').value,
      importance: parseInt(document.getElementById('wImportance').value) || 3,
      status: document.getElementById('wStatus').value,
    });
    UI.closeModal();
    UI.toast('星星已许下 ✨','success');
    this.render();
  },

  async viewWish(id) {
    const w = await DB.get('link_wishes', id);
    if (!w) return;
    const events = (await DB.list('link_wish_events')).filter(e => !e.deleted_at && e.wish_id === id);
    UI.modal(`✨ ${w.title}`, `
      <div class="text-soft text-sm mb-2">${w.category} · ${w.status}</div>
      ${w.description ? `<p class="mb-3">${w.description}</p>` : ''}
      <div class="text-faint text-xs">创建于 ${w.created_at.slice(0,10)} · 重要度 ${'⭐'.repeat(w.importance)}</div>

      <div class="card-header mt-4">
        <div class="card-title">📋 后续事件</div>
        <button class="btn btn--sm btn--ghost" onclick="StarMapModule._closeAndAddEvent('${id}')">+ 添加</button>
      </div>
      ${events.length === 0 ? '<p class="text-faint text-sm">暂无后续事件记录</p>' : events.map(e => `
        <div class="list-item" style="cursor:pointer" onclick="StarMapModule.viewEvent('${e.id}','${id}')">
          <div class="list-item__main">
            <div class="list-item__title">${e.what_happened?.slice(0,40)||'事件'}</div>
            <div class="list-item__sub">${e.date||'-'}</div>
          </div>
        </div>
      `).join('')}

      <div class="field mt-4">
        <label class="field__label">修改状态</label>
        <select class="select" id="wNewStatus" onchange="StarMapModule._updateStatus('${id}')">
          ${['⭐ 等待中','⭐ 等待观察','🌱 出现部分对应事件','✨ 已实现','🍃 暂未发生','🪐 不再期待'].map(s=>`<option ${s===w.status?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="flex gap-3 mt-2" style="justify-content:flex-end">
        ${w.status === '已实现' ? `<button class="btn btn--rose btn--sm" onclick="StarMapModule._pickStar('${id}')">⭐ 摘下这颗星</button>` : ''}
        <button class="btn btn--accent btn--sm" onclick="StarMapModule._delWish('${id}')">删除</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  _closeAndAddEvent(wishId) {
    UI.closeModal();
    setTimeout(() => this.addEvent(wishId), 200);
  },

  async addEvent(wishId) {
    UI.modal('添加后续事件', `
      <div class="field">
        <label class="field__label">日期</label>
        <input class="input" type="date" id="eDate" value="${todayKey()}">
      </div>
      <div class="card--blur" style="background:rgba(241,148,166,0.06);padding:12px;border-radius:10px;margin:8px 0">
        <div class="text-xs text-faint mb-1">实际发生了什么</div>
        <textarea class="textarea" id="eHappened"></textarea>
      </div>
      <div class="card--blur" style="background:rgba(187,164,217,0.06);padding:12px;border-radius:10px;margin:8px 0">
        <div class="text-xs text-faint mb-1">我的感受</div>
        <textarea class="textarea" id="eFeeling"></textarea>
      </div>
      <div class="card--blur" style="background:rgba(138,78,123,0.06);padding:12px;border-radius:10px;margin:8px 0">
        <div class="text-xs text-faint mb-1">我的理解（是否与愿望有关）</div>
        <textarea class="textarea" id="eRelated" placeholder="我个人的理解，不自动判定为愿望实现"></textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="StarMapModule._saveEvent('${wishId}')">保存</button>
      </div>
    `);
  },

  async _saveEvent(wishId) {
    await DB.save('link_wish_events', {
      wish_id: wishId,
      date: document.getElementById('eDate').value,
      what_happened: document.getElementById('eHappened').value,
      feeling: document.getElementById('eFeeling').value,
      related: document.getElementById('eRelated').value,
    });
    UI.closeModal();
    UI.toast('事件已记录','success');
    this.viewWish(wishId);
  },

  async viewEvent(id, wishId) {
    const e = await DB.get('link_wish_events', id);
    if (!e) return;
    UI.modal('后续事件详情', `
      <p class="text-soft text-sm mb-2">${e.date}</p>
      <div class="card--blur" style="background:rgba(241,148,166,0.06);padding:12px;border-radius:10px;margin-bottom:8px"><div class="text-xs text-faint">实际发生</div><div>${e.what_happened}</div></div>
      <div class="card--blur" style="background:rgba(187,164,217,0.06);padding:12px;border-radius:10px;margin-bottom:8px"><div class="text-xs text-faint">我的感受</div><div>${e.feeling}</div></div>
      <div class="card--blur" style="background:rgba(138,78,123,0.06);padding:12px;border-radius:10px"><div class="text-xs text-faint">我的理解</div><div>${e.related}</div></div>
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn btn--accent btn--sm" onclick="StarMapModule._delEvent('${id}','${wishId}')">删除</button>
        <button class="btn btn--sm" onclick="UI.closeModal();StarMapModule.viewWish('${wishId}')">返回</button>
      </div>
    `);
  },

  async _delEvent(id, wishId) {
    if (!await UI.confirm('删除这条事件记录？')) return;
    await DB.hardDelete('link_wish_events', id);
    UI.closeModal();
    this.viewWish(wishId);
  },

  async _updateStatus(id) {
    const w = await DB.get('link_wishes', id);
    if (w) {
      w.status = document.getElementById('wNewStatus').value;
      await DB.save('link_wishes', w);
      UI.toast('状态已更新','success');
    }
  },

  async _pickStar(id) {
    const w = await DB.get('link_wishes', id);
    if (!w) return;
    if (!await UI.confirm('摘下这颗星？它将从天空消失，进入宝物袋。')) return;
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    await DB.save('link_treasures', {
      profile_id: w.profile_id,
      wish_id: id,
      wish_title: w.title,
      wish_description: w.description,
      created_date: w.created_at.slice(0,10),
      achieved_date: todayKey(),
    });
    // 从星图移除（软删除）
    w.status = '已实现';
    w.picked = true;
    await DB.save('link_wishes', w);
    UI.closeModal();
    UI.toast('星星已摘下，收入宝物袋 ✨','success');
    this.render();
  },

  async viewTreasure(id) {
    const t = await DB.get('link_treasures', id);
    if (!t) return;
    const events = (await DB.list('link_wish_events')).filter(e => !e.deleted_at && e.wish_id === t.wish_id);
    UI.modal(`✨ ${t.wish_title}`, `
      <p class="text-soft text-sm">许愿于 ${t.created_date} · 实现于 ${t.achieved_date}</p>
      ${t.wish_description ? `<p class="mt-2">${t.wish_description}</p>` : ''}
      <div class="card-header mt-4"><div class="card-title">相关记录</div></div>
      ${events.length === 0 ? '<p class="text-faint text-sm">无后续事件</p>' : events.map(e => `
        <div class="list-item"><div class="list-item__main">
          <div class="list-item__title">${e.what_happened?.slice(0,40)}</div>
          <div class="list-item__sub">${e.date} · ${e.feeling?.slice(0,30)||''}</div>
        </div></div>
      `).join('')}
      <div class="field mt-3">
        <label class="field__label">我的感悟</label>
        <textarea class="textarea" id="tInsight" placeholder="现在回头看有什么变化">${t.insight||''}</textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn btn--primary btn--sm" onclick="StarMapModule._saveInsight('${id}')">保存感悟</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _saveInsight(id) {
    const t = await DB.get('link_treasures', id);
    if (t) { t.insight = document.getElementById('tInsight').value; await DB.save('link_treasures', t); }
    UI.closeModal();
    UI.toast('感悟已保存','success');
  },

  async addStarDiary() {
    UI.modal('📔 星星日记', `
      <div class="field">
        <label class="field__label">今天有没有什么事情让我想到某颗星星？</label>
        <textarea class="textarea" id="dContent" placeholder="轻量记录，可选"></textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="StarMapModule._saveDiary()">保存</button>
      </div>
    `);
  },

  async _saveDiary() {
    await DB.save('reviews', {
      type: 'star_diary',
      date: todayKey(),
      content: document.getElementById('dContent').value,
    });
    UI.closeModal();
    UI.toast('日记已保存','success');
  },

  async _delWish(id) {
    if (!await UI.confirm('删除这颗星星及其所有后续事件？')) return;
    await DB.hardDelete('link_wishes', id);
    const events = (await DB.list('link_wish_events')).filter(e => e.wish_id === id);
    for (const e of events) await DB.hardDelete('link_wish_events', e.id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.render();
  },
};
