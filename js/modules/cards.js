/**
 * 字卡传讯与自我探索系统
 * 象征性工具，不代表现实人物信息
 */
const CardsModule = {
  /* 等待工具：确认弹窗关闭后需等 UI 轮询结算，再重开详情页 */
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  async render() {
    if (!App.state.settings.enable_cards) {
      document.getElementById('pageContent').innerHTML = `<div class="page"><div class="card">${UI.empty('💌','字卡功能未开启，可在设置中开启')}</div></div>`;
      return;
    }
    const decks = (await DB.list('card_decks')).filter(d => !d.deleted_at);
    const draws = (await DB.list('card_draws')).filter(d => !d.deleted_at);
    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">💌 字卡传讯</div>
          <div class="flex gap-2">
            <button class="btn btn--sm" onclick="CardsModule.manageDecks()">卡组管理</button>
            <button class="btn btn--primary btn--sm" onclick="CardsModule.draw()">抽取字卡</button>
          </div>
        </div>

        <div class="ai-disclaimer mb-4">
          字卡传讯用于仪式感记录、创意书写、情绪投射和自我探索。<br>
          抽取结果 <b>不代表对方真实发送的信息</b>，不承诺事件发生。
        </div>

        <!-- 卡组列表 -->
        <div class="card mb-4">
          <div class="card-title">📚 我的卡组</div>
          ${decks.length === 0 ? `
            <p class="text-faint text-sm mb-3">还没有卡组，系统已为你预设一个</p>
            <button class="btn btn--sm" onclick="CardsModule._initDefault()">初始化预设卡组</button>
          ` : `
            <div class="flex flex-col gap-2">
              ${decks.map(d => {
                const items = (window._cardItems || []).filter(i => i.deck_id === d.id);
                return `
                  <div class="list-item cards-deck-item" style="cursor:pointer" onclick="CardsModule.viewDeck('${d.id}')">
                    <span style="font-size:20px">🎴</span>
                    <div class="list-item__main">
                      <div class="list-item__title">${d.name}</div>
                      <div class="list-item__sub">${d.description||''}</div>
                    </div>
                    <span class="badge">${items.length}</span>
                    <button class="btn btn--sm cards-deck-del" title="删除卡组"
                      onclick="event.stopPropagation();CardsModule.delDeck('${d.id}')">删除</button>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- 抽卡统计 -->
        ${draws.length > 0 ? `
          <div class="card mb-4">
            <div class="card-title">📊 字卡统计</div>
            ${this._stats(draws)}
          </div>
        ` : ''}

        <!-- 最近抽卡 -->
        <div class="card">
          <div class="card-title">🌟 最近抽卡</div>
          ${draws.length === 0 ? UI.empty('💌','还没有抽卡记录') : `
            <div class="flex flex-col gap-2">
              ${draws.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,10).map(d => `
                <div class="list-item" style="cursor:pointer" onclick="CardsModule.viewDraw('${d.id}')">
                  <span style="font-size:20px">💌</span>
                  <div class="list-item__main">
                    <div class="list-item__title">${d.cards?.map(c=>c.word).join(' · ')||'-'}</div>
                    <div class="list-item__sub">${d.created_at.slice(0,16).replace('T',' ')}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
    // 加载所有卡项
    window._cardItems = (await DB.list('card_items')).filter(i => !i.deleted_at);
    document.getElementById('pageContent').innerHTML = html;
  },

  _stats(draws) {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate()-7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const weekDraws = draws.filter(d => new Date(d.created_at) >= weekStart);
    const monthDraws = draws.filter(d => new Date(d.created_at) >= monthStart);
    const yearDraws = draws.filter(d => new Date(d.created_at) >= yearStart);
    // 高频字卡
    const cardCount = {};
    draws.forEach(d => {
      (d.cards||[]).forEach(c => { cardCount[c.word] = (cardCount[c.word]||0)+1; });
    });
    const top = Object.entries(cardCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return `
      <div class="grid grid-3 mb-3">
        <div class="health-item"><div class="health-item__label">本周</div><div class="health-item__value">${weekDraws.length}</div></div>
        <div class="health-item"><div class="health-item__label">本月</div><div class="health-item__value">${monthDraws.length}</div></div>
        <div class="health-item"><div class="health-item__label">本年</div><div class="health-item__value">${yearDraws.length}</div></div>
      </div>
      ${top.length > 0 ? `
        <div class="text-faint text-xs">高频字卡:</div>
        <ul class="text-sm">${top.map(([w,c]) => `<li>${w}: ${c} 次</li>`).join('')}</ul>
        <div class="ai-disclaimer">统计结果只描述记录规律，不把抽卡频率解释成外部信号</div>
      ` : ''}
    `;
  },

  async _initDefault() {
    const defaultDeck = await DB.save('card_decks', {
      name: '今日链接讯息',
      description: '用于每日自我探索的通用字卡',
      allow_repeat: false,
    });
    const words = ['温柔','勇气','等待','倾听','放下','拥抱','信任','流动','安静','绽放','回归','守护','呼吸','自由','光亮','耐心'];
    for (const w of words) {
      await DB.save('card_items', {
        deck_id: defaultDeck.id,
        word: w,
        interpretation: `这张卡可能让你联想到关于「${w}」的内在需要。这是一个可供探索的角度。`,
      });
    }
    UI.toast('预设卡组已创建','success');
    this.render();
  },

  async draw() {
    const decks = (await DB.list('card_decks')).filter(d => !d.deleted_at);
    if (decks.length === 0) { UI.toast('请先创建卡组','error'); return; }
    const profiles = (await DB.list('link_profiles')).filter(p => !p.deleted_at);
    UI.modal('抽取字卡 💌', `
      <div class="field">
        <label class="field__label">选择卡组</label>
        <select class="select" id="dDeck">${decks.map(d=>`<option value="${d.id}">${d.name}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="field__label">抽卡数量</label>
        <select class="select" id="dCount">
          <option value="1">单张</option>
          <option value="3">三张</option>
          <option value="5">五张</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">当前问题（可选）</label>
        <input class="input" id="dQuestion" placeholder="想探索的问题">
      </div>
      <div class="field">
        <label class="field__label">当前情绪（可选）</label>
        <input class="input" id="dEmotion">
      </div>
      <div class="field">
        <label class="field__label">选择对象档案（可选）</label>
        <select class="select" id="dProfile">
          <option value="">不关联</option>
          ${profiles.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="CardsModule._doDraw()">抽取 ✨</button>
      </div>
    `);
  },

  async _doDraw() {
    const deckId = document.getElementById('dDeck').value;
    const count = parseInt(document.getElementById('dCount').value);
    const question = document.getElementById('dQuestion').value;
    const emotion = document.getElementById('dEmotion').value;
    const profileId = document.getElementById('dProfile').value;
    const items = (await DB.list('card_items')).filter(i => !i.deleted_at && i.deck_id === deckId);
    if (items.length === 0) { UI.toast('该卡组没有字卡','error'); return; }
    // 随机抽取
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const drawn = shuffled.slice(0, Math.min(count, items.length));
    const record = await DB.save('card_draws', {
      deck_id: deckId,
      cards: drawn.map(c => ({ word: c.word, interpretation: c.interpretation })),
      question, emotion, profile_id: profileId || null,
    });
    UI.closeModal();
    this._showDrawResult(record, drawn);
  },

  _showDrawResult(record, drawn) {
    UI.modal('抽卡结果 ✨', `
      <div class="text-center" style="padding:20px 0">
        ${drawn.map((c,i) => `
          <div style="display:inline-block;margin:8px;padding:20px;background:linear-gradient(135deg,var(--color-rose-soft),var(--color-wisteria));border-radius:16px;min-width:120px;box-shadow:var(--shadow-md)">
            <div style="font-size:28px">💌</div>
            <div style="font-size:22px;color:var(--color-primary);font-weight:600;margin-top:8px">${c.word}</div>
            <div class="text-xs text-soft mt-2" style="max-width:160px">${c.interpretation||''}</div>
          </div>
        `).join('')}
      </div>
      <div class="ai-block">
        ${drawn.length > 1
          ? `这些字卡放在一起，可能形成一个主题供你探索。`
          : `这张卡可能让你联想到……`}
        你可以借此观察自己现在的期待与需要。这是一个可供探索的角度，不代表现实结论。
        <div class="ai-disclaimer">AI 生成的象征性/创意文本，仅供自我探索与娱乐，不代表任何现实人物的真实想法、承诺或信息</div>
      </div>
      <div class="field mt-3">
        <label class="field__label">我的第一感受</label>
        <textarea class="textarea" id="rFirstFeel"></textarea>
      </div>
      <div class="field">
        <label class="field__label">我联想到的事情</label>
        <textarea class="textarea" id="rAssociate"></textarea>
      </div>
      <div class="field">
        <label class="field__label">这张卡对我的个人意义</label>
        <textarea class="textarea" id="rMeaning"></textarea>
      </div>
      <div class="field">
        <label class="field__label">可以采取的现实行动</label>
        <textarea class="textarea" id="rAction"></textarea>
      </div>
      <div class="flex flex-wrap gap-3">
        <label class="text-sm"><input type="checkbox" id="rFav"> 收藏</label>
        <label class="text-sm"><input type="checkbox" id="rTimeline"> 加入灵魂链接时间线</label>
        <label class="text-sm"><input type="checkbox" id="rSyncEmo"> 同步到情绪记录</label>
      </div>
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">不保存</button>
        <button class="btn btn--primary" onclick="CardsModule._saveDrawResult('${record.id}')">保存记录</button>
      </div>
    `);
  },

  async _saveDrawResult(id) {
    const d = await DB.get('card_draws', id);
    if (d) {
      d.first_feeling = document.getElementById('rFirstFeel').value;
      d.association = document.getElementById('rAssociate').value;
      d.meaning = document.getElementById('rMeaning').value;
      d.action = document.getElementById('rAction').value;
      d.favorited = document.getElementById('rFav').checked;
      d.add_to_timeline = document.getElementById('rTimeline').checked;
      d.sync_emotion = document.getElementById('rSyncEmo').checked;
      await DB.save('card_draws', d);
      // 同步到灵魂链接时间线
      if (d.add_to_timeline && d.profile_id) {
        await DB.save('link_records', {
          profile_id: d.profile_id,
          title: `字卡抽取: ${d.cards.map(c=>c.word).join('·')}`,
          record_type: '感想与成长',
          happened: '字卡记录（标记）',
          feeling: d.first_feeling,
          understanding: d.meaning,
          tags: ['字卡记录'],
          count_as_real: false,  // 字卡不计入真实互动
          source_type: 'card_draw',
        });
      }
      if (d.sync_emotion && d.first_feeling) {
        await DB.save('emotions', {
          emotion_type: '平和',
          intensity: 5,
          event: `字卡抽取后的感受: ${d.first_feeling.slice(0,50)}`,
          source_type: 'card_sync',
        });
      }
    }
    UI.closeModal();
    UI.toast('抽卡记录已保存','success');
    this.render();
  },

  quickDraw() { this.draw(); },

  async viewDraw(id) {
    const d = await DB.get('card_draws', id);
    if (!d) return;
    UI.modal('抽卡记录', `
      <div class="text-center mb-3">
        ${d.cards.map(c => `<div style="display:inline-block;margin:4px;padding:12px 16px;background:var(--color-rose-soft);border-radius:12px;color:var(--color-primary);font-weight:600">${c.word}</div>`).join('')}
      </div>
      ${d.question ? `<p class="text-soft text-sm">问题: ${d.question}</p>` : ''}
      ${d.emotion ? `<p class="text-soft text-sm">当时情绪: ${d.emotion}</p>` : ''}
      ${d.first_feeling ? `<div class="mt-2"><b>第一感受:</b> ${d.first_feeling}</div>` : ''}
      ${d.association ? `<div class="mt-1"><b>联想:</b> ${d.association}</div>` : ''}
      ${d.meaning ? `<div class="mt-1"><b>个人意义:</b> ${d.meaning}</div>` : ''}
      ${d.action ? `<div class="mt-1"><b>现实行动:</b> ${d.action}</div>` : ''}
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn btn--accent btn--sm" onclick="CardsModule._delDraw('${id}')">删除</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _delDraw(id) {
    if (!await UI.confirm('删除这条抽卡记录？')) return;
    await DB.hardDelete('card_draws', id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.render();
  },

  async manageDecks() {
    const decks = (await DB.list('card_decks')).filter(d => !d.deleted_at);
    UI.modal('卡组管理', `
      ${decks.map(d => `
        <div class="list-item" onclick="CardsModule.viewDeck('${d.id}')">
          <span style="font-size:20px">🎴</span>
          <div class="list-item__main">
            <div class="list-item__title">${d.name}</div>
            <div class="list-item__sub">${d.description||''}</div>
          </div>
        </div>
      `).join('')}
      <button class="btn btn--ghost btn--block mt-2" onclick="CardsModule.addDeck()">+ 新建卡组</button>
    `);
  },

  async addDeck() {
    UI.closeModal();
    UI.modal('新建卡组', `
      <div class="field">
        <label class="field__label">卡组名称</label>
        <input class="input" id="deckName" placeholder="如：情绪觉察">
      </div>
      <div class="field">
        <label class="field__label">描述</label>
        <input class="input" id="deckDesc">
      </div>
      <div class="field">
        <label class="field__label">字卡（每行一个词）</label>
        <textarea class="textarea" id="deckWords" placeholder="温柔&#10;勇气&#10;等待"></textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="CardsModule._saveDeck()">创建</button>
      </div>
    `);
  },

  async _saveDeck() {
    const name = document.getElementById('deckName').value.trim();
    if (!name) { UI.toast('请输入名称','error'); return; }
    const deck = await DB.save('card_decks', {
      name,
      description: document.getElementById('deckDesc').value,
      allow_repeat: false,
    });
    const words = document.getElementById('deckWords').value.split('\n').map(s=>s.trim()).filter(Boolean);
    for (const w of words) {
      await DB.save('card_items', { deck_id: deck.id, word: w, interpretation: '' });
    }
    UI.closeModal();
    UI.toast('卡组已创建','success');
    this.render();
  },

  /* ============ 卡组详情：查看 / 多选编辑 / 删除 ============ */
  async viewDeck(id) {
    const deck = await DB.get('card_decks', id);
    if (!deck || deck.deleted_at) { UI.toast('卡组不存在','error'); return; }
    const items = (await DB.list('card_items')).filter(i => !i.deleted_at && i.deck_id === id);
    // 初始化多选状态（每次打开详情页重置）
    this._editMode = false;
    this._selected = new Set();
    this._deckId = id;
    this._renderDeckModal(deck, items);
  },

  _renderDeckModal(deck, items) {
    const edit = this._editMode;
    const sel = this._selected;
    // 已填写「自由补充」的字卡数量，用于顶部提示
    const filled = items.filter(i => (i.supplement || '').trim()).length;
    const body = `
      <p class="text-soft text-sm mb-3">${deck.description || ''}</p>
      <div class="flex justify-between items-center mb-3 cards-deck-toolbar">
        <span class="text-faint text-xs">${
          edit ? `已选 ${sel.size} / ${items.length} 张`
               : `共 ${items.length} 张字卡${filled > 0 ? ` · 已补充 ${filled} 张` : ''}`
        }</span>
        <div class="flex gap-2">
          ${edit ? '' : `<button class="btn btn--sm cards-deck-add" onclick="CardsModule.addCard()">+ 新增字卡</button>`}
          <button class="btn btn--sm ${edit ? 'btn--primary' : ''}" onclick="CardsModule.toggleEditAll()">编辑全部</button>
          <button class="btn btn--sm btn--accent" onclick="CardsModule.deckDeleteSelected()">删除</button>
        </div>
      </div>
      ${items.length === 0 ? `<p class="text-faint text-sm">这个卡组还没有字卡</p>` : `
        <div class="flex flex-wrap gap-2 mb-3 cards-deck-cards">
          ${items.map(i => `
            <span class="tag-chip ${edit && sel.has(i.id) ? 'active cards-chip--sel' : ''}"
                  data-card-id="${i.id}"
                  title="${edit ? '点击选中/取消' : '点击查看与补充'}"
                  onclick="CardsModule.onChipClick('${i.id}')">${i.word}${!edit && (i.supplement || '').trim() ? '<span class="cards-chip__dot" aria-hidden="true">·</span>' : ''}</span>
          `).join('')}
        </div>
      `}
      ${edit
        ? `<p class="text-faint text-xs mb-2">多选模式：点击字卡可选中/取消；再点「编辑全部」退出编辑</p>`
        : `<p class="text-faint text-xs mb-2">点击任意字卡可查看原文并写下「自由补充」与填写原因${filled > 0 ? '；带 · 的字卡表示已补充' : ''}</p>`}
      <div class="flex gap-3 mt-2" style="justify-content:flex-end">
        ${edit
          ? `<button class="btn btn--sm" onclick="CardsModule.toggleEditAll()">完成编辑</button>`
          : `<button class="btn btn--primary btn--sm" onclick="UI.closeModal();CardsModule.draw()">用此卡组抽卡</button>
             <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>`}
      </div>
    `;
    UI.modal(deck.name, body, { closeOnOutside: false });
    // 挂载后：点击弹窗其他区域可退出多选模式
    const overlay = document.getElementById('appModal');
    if (overlay) {
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          if (this._editMode) { this._editMode = false; this._selected.clear(); this.viewDeck(this._deckId); }
          else UI.closeModal();
        }
      };
    }
  },

  /* 多选模式开关 */
  async toggleEditAll() {
    this._editMode = !this._editMode;
    if (!this._editMode) this._selected.clear();
    await this._rerenderDeckModal();
  },

  /* 点击字卡：编辑模式下切换选中；非编辑模式打开字卡详情（自由补充） */
  async onChipClick(cardId) {
    if (!this._editMode) { await this.openCard(cardId); return; }
    if (this._selected.has(cardId)) this._selected.delete(cardId);
    else this._selected.add(cardId);
    await this._rerenderDeckModal();
  },

  async _rerenderDeckModal() {
    const deck = await DB.get('card_decks', this._deckId);
    if (!deck) return;
    const items = (await DB.list('card_items')).filter(i => !i.deleted_at && i.deck_id === this._deckId);
    this._renderDeckModal(deck, items);
  },

  /* ============ 新增字卡 ============ */
  async addCard() {
    if (this._editMode) {
      UI.toast('多选模式下无法新增，请先点「编辑全部」退出编辑','info');
      return;
    }
    UI.modal('新增字卡', `
      <div class="field">
        <label class="field__label">字卡内容</label>
        <input class="input" id="cardNewWord" placeholder="如：温柔、等待、被理解…" maxlength="40">
        <div class="field__hint">简短的一个词或一句话即可</div>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal();CardsModule._reopenDeckModal()">取消</button>
        <button class="btn btn--primary" onclick="CardsModule._saveNewCard()">保存</button>
      </div>
    `, { closeOnOutside: false });
    const input = document.getElementById('cardNewWord');
    if (input) {
      setTimeout(() => input.focus(), 50);
      // 回车即保存
      input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); this._saveNewCard(); } };
    }
  },

  async _saveNewCard() {
    const el = document.getElementById('cardNewWord');
    const word = el ? el.value.trim() : '';
    if (!word) { UI.toast('请输入字卡内容','error'); return; }
    if (word.length > 40) { UI.toast('字卡内容请控制在 40 字以内','error'); return; }

    const deck = await DB.get('card_decks', this._deckId);
    if (!deck) { UI.toast('卡组不存在','error'); return; }
    const exist = (await DB.list('card_items'))
      .filter(i => !i.deleted_at && i.deck_id === this._deckId && (i.word || '').trim() === word);

    // 同名字卡不阻塞，但给一次确认，避免误重复
    if (exist.length > 0) {
      const ok = await UI.confirm(`这个卡组里已经有「${word}」了，仍要再添加一张吗？`, { title: '字卡重复', okText: '仍要添加' });
      // 取消：把用户填的内容带回来，不丢输入
      if (!ok) { await this._sleep(120); await this._reopenAddModal(word); return; }
    }

    await DB.save('card_items', {
      deck_id: this._deckId,
      word,
      interpretation: '',
      supplement: '',
      supplement_reason: '',
    });
    UI.toast('字卡已添加','success');
    await this._sleep(120);
    this._renderDeckModal(await DB.get('card_decks', this._deckId),
      (await DB.list('card_items')).filter(i => !i.deleted_at && i.deck_id === this._deckId));
    this.render();
  },

  /* 取消新增后把输入框带回来，避免用户重打一遍 */
  async _reopenAddModal(preset = '') {
    await this.addCard();
    const el = document.getElementById('cardNewWord');
    if (el && preset) el.value = preset;
  },

  /* ============ 字卡详情：原文 / 自由补充 / 填写原因 ============ */
  async openCard(cardId) {
    const card = await DB.get('card_items', cardId);
    if (!card || card.deleted_at) { UI.toast('字卡不存在','error'); return; }
    this._cardId = cardId;
    await this._renderCardModal(card);
  },

  async _renderCardModal(card) {
    const supp = card.supplement || '';
    const reason = card.supplement_reason || '';
    const hasSupp = supp.trim().length > 0;
    UI.modal('字卡详情', `
      <div class="cards-card-detail">
        <div class="cards-card-detail__word">${card.word}</div>
        <div class="text-faint text-xs mb-3">${card.created_at ? `创建于 ${String(card.created_at).slice(0,10)}` : ''}</div>

        <div class="field">
          <label class="field__label">字卡内容</label>
          <input class="input" id="cardEditWord" value="${this._esc(card.word)}" maxlength="40">
          <div class="field__hint">可修改字卡原文，修改后不会影响已保存的抽卡记录</div>
        </div>

        <div class="field">
          <label class="field__label">自由补充 <span class="cards-card-detail__opt">可留空</span></label>
          <textarea class="textarea" id="cardSupplement" maxlength="1000"
            placeholder="看到这张字卡，你想补充些什么？（感受、联想、给自己的话…）">${this._esc(supp)}</textarea>
        </div>

        <div class="field">
          <label class="field__label">填写原因 <span class="cards-card-detail__opt">可留空</span></label>
          <textarea class="textarea" id="cardReason" maxlength="500" style="min-height:70px"
            placeholder="我为什么写下这段补充？（例如：因为今天发生了…／因为我想提醒自己…）">${this._esc(reason)}</textarea>
          <div class="field__hint">记录当时的原因，以后回看时更容易理解自己的心境</div>
        </div>

        ${hasSupp ? `<div class="cards-card-detail__saved">
          <span class="cards-card-detail__saved-tag">上次已补充</span>
          <span class="text-faint text-xs">${card.updated_at ? `更新于 ${String(card.updated_at).slice(0,16).replace('T',' ')}` : ''}</span>
        </div>` : ''}
      </div>
      <div class="flex gap-2 mt-3" style="justify-content:flex-end">
        <button class="btn btn--sm" onclick="UI.closeModal();CardsModule._reopenDeckModal()">返回卡组</button>
        <button class="btn btn--primary btn--sm" onclick="CardsModule.saveCardDetail()">保存</button>
      </div>
    `, { closeOnOutside: false });
  },

  async saveCardDetail() {
    const card = await DB.get('card_items', this._cardId);
    if (!card || card.deleted_at) { UI.toast('字卡不存在','error'); return; }
    const wordEl = document.getElementById('cardEditWord');
    const suppEl = document.getElementById('cardSupplement');
    const reasonEl = document.getElementById('cardReason');
    const word = wordEl ? wordEl.value.trim() : '';
    if (!word) { UI.toast('字卡内容不能为空','error'); return; }

    card.word = word;
    card.supplement = suppEl ? suppEl.value.trim() : '';
    card.supplement_reason = reasonEl ? reasonEl.value.trim() : '';
    await DB.save('card_items', card);
    UI.toast('已保存','success');
    await this._sleep(120);
    this._renderDeckModal(await DB.get('card_decks', this._deckId),
      (await DB.list('card_items')).filter(i => !i.deleted_at && i.deck_id === this._deckId));
    this.render();
  },

  /* 从子弹窗回到卡组详情 */
  async _reopenDeckModal() {
    await this._sleep(120);
    await this._rerenderDeckModal();
  },

  /* 轻量 HTML 转义，避免字卡内容里的特殊字符破坏模板 */
  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /* 删除选中字卡（编辑模式下点「删除」） */
  async deckDeleteSelected() {
    if (!this._editMode) {
      UI.toast('先点「编辑全部」进入多选，再选择要删除的字卡','info');
      return;
    }
    const n = this._selected.size;
    if (n === 0) { UI.toast('请先选择要删除的字卡','info'); return; }
    const okDel = await UI.confirm(`确定删除已选中的 ${n} 张字卡？<br>未选中的字卡不受影响，其他卡组和抽卡记录也不会丢失。`, { title: '删除字卡', okText: '确认删除' });
    if (!okDel) {
      // 取消：回到详情页（保留当前选中状态）
      await this._sleep(120);
      await this._rerenderDeckModal();
      return;
    }
    const ids = [...this._selected];
    for (const id of ids) await DB.hardDelete('card_items', id);
    this._selected.clear();
    this._editMode = false;
    UI.toast(`已删除 ${ids.length} 张字卡`,'success');
    await this._sleep(120);
    await this._rerenderDeckModal();
    this.render();
  },

  /* 删除整个卡组及其字卡 */
  async delDeck(id) {
    const deck = await DB.get('card_decks', id);
    if (!deck) return;
    const items = (await DB.list('card_items')).filter(i => !i.deleted_at && i.deck_id === id);
    const draws = (await DB.list('card_draws')).filter(d => !d.deleted_at && d.deck_id === id);
    const drawTip = draws.length > 0 ? `<br><span class="text-faint text-xs">该卡组已有 ${draws.length} 条抽卡记录，记录会保留，不受影响。</span>` : '';
    const okDel = await UI.confirm(`确定删除卡组「${deck.name}」？<br>将同时删除该卡组内的 ${items.length} 张字卡，此操作不可撤销。${drawTip}`, { title: '删除卡组', okText: '确认删除' });
    if (!okDel) return;
    for (const it of items) await DB.hardDelete('card_items', it.id);
    await DB.hardDelete('card_decks', id);
    UI.toast(`已删除卡组「${deck.name}」`,'success');
    await this._sleep(120);
    this.render();
  },
};
