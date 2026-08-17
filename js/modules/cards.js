/**
 * 字卡传讯与自我探索系统
 * 象征性工具，不代表现实人物信息
 */
const CardsModule = {
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
                  <div class="list-item" style="cursor:pointer" onclick="CardsModule.viewDeck('${d.id}')">
                    <span style="font-size:20px">🎴</span>
                    <div class="list-item__main">
                      <div class="list-item__title">${d.name}</div>
                      <div class="list-item__sub">${d.description||''}</div>
                    </div>
                    <span class="badge">${items.length}</span>
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

  async viewDeck(id) {
    const deck = await DB.get('card_decks', id);
    const items = (await DB.list('card_items')).filter(i => !i.deleted_at && i.deck_id === id);
    UI.modal(`${deck.name}`, `
      <p class="text-soft text-sm mb-3">${deck.description||''}</p>
      <div class="flex flex-wrap gap-2 mb-3">
        ${items.map(i => `<span class="tag-chip" style="padding:8px 14px">${i.word}</span>`).join('')}
      </div>
      <button class="btn btn--primary btn--sm" onclick="UI.closeModal();CardsModule.draw()">用此卡组抽卡</button>
    `);
  },
};
