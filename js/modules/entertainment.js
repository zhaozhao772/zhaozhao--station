/**
 * 娱乐板块（一级模块）
 * - 可包含多个子板块（红果短剧 / 电影 / 综艺等，可自行添加、改名、删除）
 * - 每条记录：封面图片（自动压缩）/ 名字 / 集数 / 分类标签（多选+自定义）/ 五星评分 / 重复刷次数 / 自由记录
 * - 检索：顶部跨子板块一键检索（支持按子板块筛选）+ 子板块内独立搜索，均即时刷新并高亮关键词
 * - 数据存 IndexedDB（ent_boards / ent_records），刷新不丢失
 */
const EntModule = {

  state: {
    boards: [],            // 子板块列表
    currentBoardId: null,  // 当前所在子板块
    globalKw: '',          // 顶部一键检索关键词
    globalFilter: 'all',   // 一键检索结果的板块筛选（'all' | boardId）
    boardKw: '',           // 当前子板块内搜索关键词
    subtypeFilter: 'all',  // 当前子板块内的大类筛选（'all' | 大类名 | 'none'）
    styleFilter: 'all',    // 当前子板块内的风格筛选（'all' | 风格名）
  },

  // 预置常用分类（供选择，实际以用户点选/自定义为准）
  PRESET_TAGS: ['霸总', '穿越', '重生', '甜宠', '复仇', '逆袭', '古装', '现代', '玄幻', '悬疑', '萌宝', '战神', '先婚后爱', '马甲'],
  BOARD_ICONS: ['📺', '🍿', '🎬', '🎭', '🎤', '🎮', '🎵', '💃', '🎪', '⭐'],

  // 两级分类（红果短剧等可启用）：第一级大类 + 各类的风格标签池
  SUBTYPE_DEFS: {
    // 板块 id: { categories: [大类1, 大类2], styles: { 大类1: [风格…], 大类2: [风格…] } }
    hongguo: {
      categories: ['AI', '真人'],
      styles: {
        AI:   ['古风', '现代', '玄幻', '悬疑', '科幻', '校园', '都市'],
        真人: ['甜宠', '复仇', '穿越', '重生', '霸总', '逆袭', '萌宝', '古装', '马甲', '战神'],
      },
    },
  },

  // 检查板块是否启用了两级分类（按需启用）
  isTwoLevel(boardId) {
    return !!(this.SUBTYPE_DEFS[boardId] && this.SUBTYPE_DEFS[boardId].categories);
  },

  // ============ 入口 ============
  async render() {
    await this._loadBoards();
    if (!this.state.currentBoardId || !this.state.boards.find(b => b.id === this.state.currentBoardId)) {
      this.state.currentBoardId = this.state.boards[0] ? this.state.boards[0].id : null;
    }
    document.getElementById('pageContent').innerHTML = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">🍿 娱乐</div>
          <button class="btn btn--ghost btn--sm" onclick="EntModule._boardManager()">⚙️ 管理子板块</button>
        </div>

        <!-- 一键检索（跨所有子板块） -->
        <div class="ent-searchbar mb-3">
          <input id="entGlobalSearch" class="input ent-searchbar__input" placeholder="🔍 一键检索：跨所有子板块搜名字 / 分类 / 记录内容"
                 value="${this._esc(this.state.globalKw)}"
                 oninput="EntModule.onGlobalSearch(this.value)">
          ${this.state.globalKw ? `<button class="ent-searchbar__clear" onclick="EntModule.onGlobalSearch('');document.getElementById('entGlobalSearch').value=''">✕</button>` : ''}
        </div>

        <!-- 子板块切换条 -->
        <div class="ent-tabs mb-3" id="entTabs"></div>

        <!-- 内容区：搜索时显示检索结果，否则显示当前子板块 -->
        <div id="entContent"><div class="text-center" style="padding:40px"><div class="spinner"></div></div></div>
      </div>
    `;
    this._renderTabs();
    await this._renderContent();
  },

  // ============ 数据加载 ============
  async _loadBoards() {
    await this._seedBoards();
    const boards = (await DB.list('ent_boards')).filter(b => !b.deleted_at);
    boards.sort((a, b) => ((a.sort ?? 0) - (b.sort ?? 0)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    this.state.boards = boards;
  },

  // 首次进入：预置「红果短剧」子板块（仅当没有任何板块时）
  async _seedBoards() {
    if (await DB.getSetting('ent_boards_seeded_v1')) return;
    const boards = await DB.list('ent_boards');
    if (boards.length === 0) {
      await DB.put('ent_boards', {
        id: 'hongguo', name: '红果短剧', icon: '📺', sort: 0,
        created_at: nowISO(), updated_at: nowISO(),
      });
    }
    await DB.setSetting('ent_boards_seeded_v1', true);
  },

  async _boardCounts() {
    const recs = (await DB.list('ent_records')).filter(r => !r.deleted_at);
    const m = {};
    recs.forEach(r => { m[r.board_id] = (m[r.board_id] || 0) + 1; });
    return m;
  },

  async _collectTags() {
    const recs = await DB.list('ent_records');
    const seen = [];
    recs.forEach(r => (r.tags || []).forEach(t => { if (t && !seen.includes(t)) seen.push(t); }));
    return seen;
  },

  _mergeTags(...lists) {
    const out = [];
    lists.forEach(list => (list || []).forEach(t => { if (t && !out.includes(t)) out.push(t); }));
    return out;
  },

  // ============ 渲染：子板块切换条 ============
  async _renderTabs() {
    const el = document.getElementById('entTabs');
    if (!el) return;
    const counts = await this._boardCounts();
    el.innerHTML = this.state.boards.map(b => `
      <button class="ent-tab ${b.id === this.state.currentBoardId ? 'ent-tab--active' : ''}"
              onclick="EntModule._switchBoard('${b.id}')">
        <span class="ent-tab__icon">${this._esc(b.icon || '🍿')}</span>${this._esc(b.name)}
        <span class="ent-tab__count">${counts[b.id] || 0}</span>
      </button>
    `).join('') + `
      <button class="ent-tab ent-tab--plus" onclick="EntModule.addBoard()" title="新建子板块">＋</button>
    `;
  },

  // ============ 渲染：内容区路由 ============
  async _renderContent() {
    const el = document.getElementById('entContent');
    if (!el) return;
    if (this.state.globalKw.trim()) {
      el.innerHTML = await this._renderGlobalResults();
    } else {
      el.innerHTML = await this._renderBoardView();
    }
  },

  // 当前子板块视图（含板块内独立搜索框 + 两级分类筛选）
  async _renderBoardView() {
    const board = this.state.boards.find(b => b.id === this.state.currentBoardId);
    if (!board) return UI.empty('🍿', '还没有子板块，点击下方 ➕ 新建一个');
    const all = (await DB.list('ent_records'))
      .filter(r => !r.deleted_at && r.board_id === board.id)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    const kw = this.state.boardKw.trim();
    const matched = kw ? all.filter(r => this._match(r, kw)) : all;
    // 大类/风格筛选（在关键词搜索结果基础上再过滤）
    const twoLevel = this.isTwoLevel(board.id);
    const filtered = this._applySubtypeFilter(matched, board.id);
    const grouped = twoLevel && this.state.subtypeFilter === 'all' && !kw
      ? this._groupBySubtype(filtered, board.id)
      : null;
    const total = matched.length;
    const showTotal = twoLevel ? filtered.length : total;
    return `
      <div class="ent-board-head mb-2">
        <input id="entBoardSearch" class="input ent-searchbar__input"
               placeholder="🔍 在「${this._esc(board.name)}」内搜索名字 / 分类 / 记录…"
               value="${this._esc(this.state.boardKw)}"
               oninput="EntModule.onBoardSearch(this.value)">
        <button class="btn btn--primary btn--sm" style="white-space:nowrap" onclick="EntModule.openForm('${board.id}')">＋ 添加</button>
      </div>
      ${twoLevel ? this._renderSubtypeFilterBar(board.id) : ''}
      ${kw || this.state.subtypeFilter !== 'all' || this.state.styleFilter !== 'all'
        ? `<div class="ent-hint mb-2">搜到 ${showTotal} / ${total} 条</div>`
        : `<div class="ent-hint mb-2">${this._statLine(all)}</div>`}
      <div id="entBoardList">${grouped ? this._renderGroupedList(grouped, board.id) : this._renderCardList(filtered, kw, false)}</div>
    `;
  },

  // 两级分类的筛选条（AI / 真人 + 风格 chips）
  _renderSubtypeFilterBar(boardId) {
    const def = this.SUBTYPE_DEFS[boardId];
    if (!def) return '';
    const sub = this.state.subtypeFilter;
    const sty = this.state.styleFilter;
    const cats = ['all', ...def.categories];
    const styles = sub !== 'all' && def.styles[sub] ? def.styles[sub] : [];
    return `
      <div class="ent-filter-bar mb-2">
        ${cats.map(c => `
          <button class="ent-filter-chip ${sub === c ? 'ent-filter-chip--active' : ''}"
                  onclick="EntModule.setSubtypeFilter('${c}')">${c === 'all' ? '全部大类' : this._esc(c)}</button>
        `).join('')}
        ${def.categories.map(c => `
          <button class="ent-filter-chip ent-filter-chip--sub ${sub === 'none' ? '' : 'ent-filter-chip--active'}"
                  style="display:${sub === c || sub === 'all' ? '' : 'none'}"
                  onclick="EntModule.setSubtypeFilter('none')">未分类</button>
        `).join('')}
      </div>
      ${styles.length ? `
        <div class="ent-filter-bar mb-2">
          ${styles.map(s => `
            <button class="ent-filter-chip ${sty === s ? 'ent-filter-chip--active' : ''}"
                    onclick="EntModule.setStyleFilter('${this._escAttr(s)}')">${this._esc(s)}</button>
          `).join('')}
          ${sty !== 'all' ? `<button class="ent-filter-chip ent-filter-chip--sub" onclick="EntModule.setStyleFilter('all')">✕ 风格</button>` : ''}
        </div>
      ` : ''}
    `;
  },

  setSubtypeFilter(v) {
    this.state.subtypeFilter = v;
    this.state.styleFilter = 'all';   // 切换大类时清空风格
    this._renderContent();
  },

  setStyleFilter(v) {
    this.state.styleFilter = v;
    this._renderContent();
  },

  // 应用大类/风格筛选
  _applySubtypeFilter(records, boardId) {
    if (!this.isTwoLevel(boardId)) return records;
    const sub = this.state.subtypeFilter;
    const sty = this.state.styleFilter;
    return records.filter(r => {
      if (sub === 'all') { /* 不过滤大类 */ }
      else if (sub === 'none') { if (r.subtype) return false; }
      else if (r.subtype !== sub) { return false; }
      if (sty !== 'all') { if (!(r.styles || []).includes(sty)) return false; }
      return true;
    });
  },

  // 按大类分组（仅在未筛选 + 未搜索时启用）
  _groupBySubtype(records, boardId) {
    const def = this.SUBTYPE_DEFS[boardId];
    if (!def) return null;
    const groups = {};
    def.categories.forEach(c => { groups[c] = []; });
    groups['未分类'] = [];
    records.forEach(r => {
      if (r.subtype && groups[r.subtype]) groups[r.subtype].push(r);
      else groups['未分类'].push(r);
    });
    return groups;
  },

  // 渲染分组列表（按大类分块）
  _renderGroupedList(groups, boardId) {
    let html = '';
    const order = [...(this.SUBTYPE_DEFS[boardId].categories), '未分类'];
    order.forEach(cat => {
      const list = groups[cat] || [];
      const icon = cat === 'AI' ? '🤖' : cat === '真人' ? '👤' : '✨';
      html += `
        <div class="ent-subgroup">
          <div class="ent-subgroup__header">
            <span class="ent-subgroup__icon">${icon}</span>
            <span class="ent-subgroup__title">${this._esc(cat)}</span>
            <span class="ent-subgroup__count">${list.length}</span>
          </div>
          ${list.length === 0
            ? `<div class="text-faint text-xs" style="padding:6px 4px 10px">暂无</div>`
            : `<div class="ent-grid mb-3">${list.map(r => this._renderCard(r, this.state.boardKw, false, this._boardMap())).join('')}</div>`}
        </div>
      `;
    });
    return html;
  },

  _boardMap() {
    const m = {};
    this.state.boards.forEach(b => { m[b.id] = b; });
    return m;
  },

  // 一键检索结果视图（跨所有子板块 + 板块筛选 + 大类筛选）
  async _renderGlobalResults() {
    const kw = this.state.globalKw.trim();
    const all = (await DB.list('ent_records'))
      .filter(r => !r.deleted_at && this._match(r, kw))
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    const counts = {};
    all.forEach(r => { counts[r.board_id] = (counts[r.board_id] || 0) + 1; });
    const filter = this.state.globalFilter;
    const shown = (filter === 'all') ? all : all.filter(r => r.board_id === filter);
    const boardName = id => {
      const b = this.state.boards.find(x => x.id === id);
      return b ? `${b.icon || '🍿'} ${b.name}` : '未知板块';
    };
    // 当当前筛选为某个启用两级分类的板块，且尚未细化大类筛选时，加 AI/真人 二次筛选条
    const twoLevel = filter !== 'all' && this.isTwoLevel(filter);
    return `
      <div class="ent-filter-bar mb-2">
        <button class="ent-filter-chip ${filter === 'all' ? 'ent-filter-chip--active' : ''}"
                onclick="EntModule.setGlobalFilter('all')">全部 ${all.length}</button>
        ${this.state.boards.map(b => `
          <button class="ent-filter-chip ${filter === b.id ? 'ent-filter-chip--active' : ''}"
                  onclick="EntModule.setGlobalFilter('${b.id}')">${this._esc(b.icon || '🍿')} ${this._esc(b.name)} ${counts[b.id] || 0}</button>
        `).join('')}
      </div>
      ${twoLevel ? this._renderSubtypeFilterBar(filter) : ''}
      <div class="ent-hint mb-2">跨子板块搜到 ${all.length} 条${filter !== 'all' ? `，当前显示「${this._esc(boardName(filter).replace(/^[^\s]+\s/, ''))}」${shown.length} 条` : ''}</div>
      <div id="entBoardList">${this._renderCardList(shown, kw, true)}</div>
    `;
  },

  // 卡片网格（板块视图与全局搜索结果共用）
  _renderCardList(records, kw, showBoard) {
    if (!records.length) {
      return kw
        ? `<div class="card">${UI.empty('🔍', '没有找到相关记录，换个关键词试试')}</div>`
        : `<div class="card">${UI.empty('🍿', '还没有记录，点击右上角「＋ 添加」')}</div>`;
    }
    const boardMap = {};
    this.state.boards.forEach(b => { boardMap[b.id] = b; });
    return `
      <div class="ent-grid">
        ${records.map(r => this._renderCard(r, kw, showBoard, boardMap)).join('')}
      </div>
    `;
  },

  _renderCard(r, kw, showBoard, boardMap) {
    const board = boardMap[r.board_id];
    const subtypeBadge = r.subtype ? `<span class="ent-card__subtype ent-card__subtype--${r.subtype === 'AI' ? 'ai' : 'real'}">${r.subtype === 'AI' ? '🤖 AI' : '👤 真人'}</span>` : '';
    return `
      <div class="ent-card" onclick="EntModule.openDetail('${r.id}')">
        <div class="ent-card__cover">
          ${r.image
            ? `<img src="${r.image}" alt="" loading="lazy">`
            : `<div class="ent-card__placeholder"><span>🎬</span></div>`}
          ${r.rewatch ? `<span class="ent-card__rewatch">🔁 ${this._esc(r.rewatch)}</span>` : ''}
        </div>
        <div class="ent-card__body">
          <div class="ent-card__title">${this._hl(r.title, kw)}</div>
          <div class="ent-card__meta">
            ${r.episodes ? `<span class="ent-card__eps">📺 ${r.episodes}集</span>` : ''}
            <span class="ent-card__stars">${this._starsHtml(r.rating)}</span>
          </div>
          ${(r.styles && r.styles.length) ? `
            <div class="ent-card__tags">
              ${subtypeBadge}${r.styles.map(t => `<span class="ent-mini-chip">${this._hl(t, kw)}</span>`).join('')}
            </div>` : (subtypeBadge ? `<div class="ent-card__tags">${subtypeBadge}</div>` : '')}
          ${r.note ? `<div class="ent-card__note">${this._hl(this._brief(r.note, 50), kw)}</div>` : ''}
          ${showBoard && board ? `<div class="ent-card__board">${this._esc(board.icon || '🍿')} ${this._esc(board.name)}</div>` : ''}
        </div>
      </div>
    `;
  },

  // ============ 搜索 ============
  // 顶部一键检索：即时刷新内容区（搜索框在内容区之外，焦点不丢）
  onGlobalSearch(kw) {
    this.state.globalKw = kw || '';
    if (!this.state.globalKw.trim()) this.state.globalFilter = 'all';
    const clearBtn = document.querySelector('.ent-searchbar__clear');
    if (this.state.globalKw && !clearBtn) {
      const bar = document.getElementById('entGlobalSearch');
      if (bar && bar.parentElement) {
        const btn = document.createElement('button');
        btn.className = 'ent-searchbar__clear';
        btn.textContent = '✕';
        btn.onclick = () => { document.getElementById('entGlobalSearch').value = ''; EntModule.onGlobalSearch(''); };
        bar.parentElement.appendChild(btn);
      }
    } else if (!this.state.globalKw && clearBtn) {
      clearBtn.remove();
    }
    this._renderContent();
  },

  setGlobalFilter(boardId) {
    this.state.globalFilter = boardId || 'all';
    this._renderContent();
  },

  // 子板块内搜索：只更新列表容器（输入框不动，焦点不丢）
  onBoardSearch(kw) {
    this.state.boardKw = kw || '';
    this._refreshBoardList();
  },

  async _refreshBoardList() {
    const el = document.getElementById('entBoardList');
    if (!el) return;
    const board = this.state.boards.find(b => b.id === this.state.currentBoardId);
    if (!board) return;
    const recs = (await DB.list('ent_records'))
      .filter(r => !r.deleted_at && r.board_id === board.id)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    const kw = this.state.boardKw.trim();
    const shown = kw ? recs.filter(r => this._match(r, kw)) : recs;
    el.innerHTML = this._renderCardList(shown, kw, false);
    const hint = el.previousElementSibling;
    if (hint && hint.classList && hint.classList.contains('ent-hint')) {
      hint.textContent = kw ? `「${board.name}」内搜到 ${shown.length} 条` : this._statLine(recs);
    }
  },

  // 匹配：名字 / 分类标签 / 风格 / 一级大类 / 记录内容（大小写不敏感）
  _match(r, kw) {
    if (!kw) return true;
    kw = String(kw).trim().toLowerCase();
    if (!kw) return true;
    if ((r.title || '').toLowerCase().includes(kw)) return true;
    if ((r.tags || []).some(t => String(t).toLowerCase().includes(kw))) return true;
    if ((r.styles || []).some(s => String(s).toLowerCase().includes(kw))) return true;
    if ((r.subtype || '').toLowerCase().includes(kw)) return true;
    if ((r.note || '').toLowerCase().includes(kw)) return true;
    return false;
  },

  // ============ 详情弹窗 ============
  async openDetail(id) {
    const r = await DB.get('ent_records', id);
    if (!r) { UI.toast('记录不存在或已删除', 'error'); return; }
    const board = this.state.boards.find(b => b.id === r.board_id);
    UI.modal('🍿 详情', `
      ${r.image ? `
        <img class="ent-detail__cover" src="${r.image}" onclick="UI.imagePreview(this.src)">
      ` : ''}
      <div class="ent-detail__title">${this._esc(r.title)}</div>
      <div class="ent-detail__badges">
        ${board ? `<span class="ent-badge">${this._esc(board.icon || '🍿')} ${this._esc(board.name)}</span>` : ''}
        ${r.episodes ? `<span class="ent-badge">📺 ${r.episodes} 集</span>` : ''}
        ${r.rewatch ? `<span class="ent-badge ent-badge--rose">🔁 ${this._esc(r.rewatch)}</span>` : ''}
      </div>
      <div class="ent-detail__stars">${this._starsHtml(r.rating)}${r.rating ? `<span class="ent-detail__score">${r.rating}.0</span>` : '<span class="text-faint text-xs">未评分</span>'}</div>
      ${(r.styles && r.styles.length) ? `
        <div class="ent-detail__tags">
          ${r.subtype ? `<span class="ent-detail__subtype ent-detail__subtype--${r.subtype === 'AI' ? 'ai' : 'real'}">${r.subtype === 'AI' ? '🤖 AI' : '👤 真人'}</span>` : ''}
          ${r.styles.map(t => `<span class="ent-mini-chip">${this._esc(t)}</span>`).join('')}
        </div>` : (r.subtype ? `
        <div class="ent-detail__tags">
          <span class="ent-detail__subtype ent-detail__subtype--${r.subtype === 'AI' ? 'ai' : 'real'}">${r.subtype === 'AI' ? '🤖 AI' : '👤 真人'}</span>
        </div>` : '')}
      ${r.note ? `
        <div class="ent-detail__note">
          <div class="text-xs text-faint mb-1">📝 记录</div>
          <div class="ent-note-text">${this._esc(r.note)}</div>
        </div>` : ''}
      <div class="text-faint text-xs mt-2">
        ${r.created_at ? `创建于 ${this._fmtTime(r.created_at)}` : ''}
        ${r.updated_at && r.updated_at !== r.created_at ? ` · 更新于 ${this._fmtTime(r.updated_at)}` : ''}
      </div>
      <div class="flex gap-2 mt-4" style="justify-content:flex-end">
        <button class="btn btn--sm" onclick="EntModule._editFromDetail('${r.id}')">✏️ 编辑</button>
        <button class="btn btn--sm btn--accent" onclick="EntModule._deleteRecord('${r.id}', true)">🗑️ 删除</button>
        <button class="btn btn--sm btn--ghost" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _editFromDetail(id) {
    const r = await DB.get('ent_records', id);
    if (!r) return;
    UI.closeModal();
    await this._sleep(120);   // 避开 UI 系列弹窗轮询竞态
    this.openForm(r.board_id, id);
  },

  // ============ 添加 / 编辑表单 ============
  async openForm(boardId, id = null) {
    let record = null;
    if (id) {
      record = await DB.get('ent_records', id);
      if (!record) { UI.toast('记录不存在', 'error'); return; }
    }
    const board = this.state.boards.find(b => b.id === boardId);
    this._formBoardId = boardId;
    this._formRating = record && record.rating ? record.rating : 0;
    this._formTags = new Set(record && record.tags ? record.tags : []);
    this._formSubtype = record && record.subtype ? record.subtype : '';   // AI / 真人 / ''
    this._formStyles = new Set(record && record.styles ? record.styles : []);   // 风格标签
    this._tmpImage = record && record.image ? record.image : null;

    const historyTags = await this._collectTags();
    this._formTagPool = this._mergeTags(this.PRESET_TAGS, historyTags, [...this._formTags], [...this._formStyles]);

    const twoLevel = this.isTwoLevel(boardId);
    const subDef = twoLevel ? this.SUBTYPE_DEFS[boardId] : null;

    UI.modal(record ? '✏️ 编辑记录' : `＋ 添加到「${this._esc(board ? board.name : '')}」`, `
      <div class="field">
        <label class="field__label">封面图片（选填，自动压缩适配）</label>
        <div id="entCoverArea"></div>
      </div>
      <div class="field">
        <label class="field__label">名字 *</label>
        <input class="input" id="entTitle" placeholder="如：短剧 / 电影 / 综艺名" maxlength="60" value="${this._escAttr(record ? record.title || '' : '')}">
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">集数</label>
          <input class="input" id="entEpisodes" type="number" inputmode="numeric" min="0" placeholder="如：80" value="${record && record.episodes ? record.episodes : ''}">
        </div>
        <div class="field">
          <label class="field__label">重复刷（选填）</label>
          <input class="input" id="entRewatch" placeholder="如：2、3、N刷" maxlength="10" value="${this._escAttr(record ? record.rewatch || '' : '')}">
        </div>
      </div>
      ${twoLevel ? `
      <div class="field">
        <label class="field__label">分类大类 *</label>
        <div class="ent-subtype-row" id="entSubtypeRow">
          ${subDef.categories.map(c => `
            <button type="button" class="ent-subtype-pill ${this._formSubtype === c ? 'ent-subtype-pill--active' : ''}"
                    onclick="EntModule._pickSubtype('${c}')">${this._esc(c)}</button>
          `).join('')}
        </div>
        <div class="field__hint">先选大类（AI / 真人），再选下方风格</div>
      </div>
      <div class="field" id="entStylesField" style="${this._formSubtype ? '' : 'opacity:0.5;pointer-events:none'}">
        <label class="field__label">风格标签（可多选，可自定义）</label>
        <div class="tag-select" id="entStylesBox"></div>
        <div class="ent-tag-add mt-2">
          <input class="input ent-tag-add__input" id="entNewStyle" placeholder="自定义风格，输入后回车或点添加" maxlength="12"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();EntModule._addCustomStyle()}">
          <button type="button" class="btn btn--sm" onclick="EntModule._addCustomStyle()">添加</button>
        </div>
      </div>
      ` : ''}
      <div class="field">
        <label class="field__label">分类标签（可多选，可自定义）</label>
        <div class="tag-select" id="entTagBox"></div>
        <div class="ent-tag-add mt-2">
          <input class="input ent-tag-add__input" id="entNewTag" placeholder="自定义分类，输入后回车或点添加" maxlength="12"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();EntModule._addCustomTag()}">
          <button type="button" class="btn btn--sm" onclick="EntModule._addCustomTag()">添加</button>
        </div>
      </div>
      <div class="field">
        <label class="field__label">评分（点击星星）</label>
        <div class="ent-stars-input" id="entStarsInput"></div>
      </div>
      <div class="field">
        <label class="field__label">关于它的记录（选填，观后感 / 剧情备注等）</label>
        <textarea class="textarea" id="entNote" placeholder="自由记录…">${this._esc(record ? record.note || '' : '')}</textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="EntModule._saveForm('${id || ''}')">保存</button>
      </div>
    `);
    this._renderCoverArea();
    this._renderTagBox();
    if (this.isTwoLevel(this._formBoardId)) this._renderStylesBox();
    this._renderStarsInput();
  },

  // 表单内：封面选择 / 预览 / 移除
  _renderCoverArea() {
    const el = document.getElementById('entCoverArea');
    if (!el) return;
    el.innerHTML = `
      <div class="ent-form-cover" onclick="EntModule._pickImage()">
        ${this._tmpImage
          ? `<img src="${this._tmpImage}" alt="封面预览">`
          : `<div class="ent-form-cover__empty"><span class="ent-form-cover__icon">📷</span><span>点击选择图片</span></div>`}
      </div>
      <input type="file" id="entFileInput" accept="image/*" style="display:none" onchange="EntModule._onImageSelected(this)">
      <div class="flex gap-2 mt-2">
        <button type="button" class="btn btn--sm" onclick="EntModule._pickImage()">📷 选择图片</button>
        ${this._tmpImage ? `<button type="button" class="btn btn--sm btn--ghost" onclick="EntModule._removeImage()">🗑️ 移除图片</button>` : ''}
      </div>
    `;
  },

  _pickImage() {
    const input = document.getElementById('entFileInput');
    if (input) input.click();
  },

  async _onImageSelected(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    if (!f.type || !f.type.startsWith('image/')) {
      UI.toast('请选择图片文件', 'error');
      input.value = '';
      return;
    }
    try {
      this._tmpImage = await this._compressImage(f);
    } catch (e) {
      // 压缩失败时读原图兜底，保证可用
      try {
        this._tmpImage = await new Promise((resolve, reject) => {
          const rd = new FileReader();
          rd.onload = () => resolve(rd.result);
          rd.onerror = reject;
          rd.readAsDataURL(f);
        });
      } catch (e2) {
        UI.toast('图片读取失败', 'error');
        input.value = '';
        return;
      }
    }
    input.value = '';
    this._renderCoverArea();
    UI.toast('图片已压缩适配', 'success', 1500);
  },

  _removeImage() {
    this._tmpImage = null;
    this._renderCoverArea();
  },

  // canvas 压缩：最长边 480px，JPEG 质量 0.82（PNG 透明底转白）
  _compressImage(file, maxSide = 480, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (!w || !h) { reject(new Error('bad image')); return; }
            const scale = Math.min(1, maxSide / Math.max(w, h));
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },

  // 表单内：分类标签
  _renderTagBox() {
    const el = document.getElementById('entTagBox');
    if (!el) return;
    el.innerHTML = this._formTagPool.map((t, i) => `
      <div class="tag-chip ${this._formTags.has(t) ? 'active' : ''}"
           onclick="EntModule._toggleTagAt(${i})">${this._esc(t)}</div>
    `).join('');
  },

  _toggleTagAt(i) {
    const t = this._formTagPool[i];
    if (t == null) return;
    if (this._formTags.has(t)) this._formTags.delete(t);
    else this._formTags.add(t);
    this._renderTagBox();
  },

  _addCustomTag() {
    const inp = document.getElementById('entNewTag');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) { UI.toast('请输入分类名', 'error'); return; }
    if (!this._formTagPool.includes(name)) this._formTagPool.push(name);
    this._formTags.add(name);
    inp.value = '';
    this._renderTagBox();
  },

  // 两级分类：大类切换（AI / 真人）
  _pickSubtype(c) {
    this._formSubtype = this._formSubtype === c ? '' : c;   // 点同一切除（可选）
    // 切换大类时清空已选风格（风格属于不同语义类）
    if (this._formSubtype) this._formStyles = new Set();
    // 重绘大类胶囊
    document.querySelectorAll('#entSubtypeRow .ent-subtype-pill').forEach(p => {
      p.classList.toggle('ent-subtype-pill--active', p.textContent.trim() === this._formSubtype);
    });
    // 解锁/锁定风格区域
    const field = document.getElementById('entStylesField');
    if (field) {
      if (this._formSubtype) { field.style.opacity = ''; field.style.pointerEvents = ''; }
      else { field.style.opacity = '0.5'; field.style.pointerEvents = 'none'; }
    }
    this._renderStylesBox();
  },

  // 两级分类：风格 chips
  _renderStylesBox() {
    const el = document.getElementById('entStylesBox');
    if (!el) return;
    if (!this._formSubtype) { el.innerHTML = '<span class="text-faint text-xs">请先选择大类</span>'; return; }
    const def = this.SUBTYPE_DEFS[this._formBoardId];
    if (!def || !def.styles[this._formSubtype]) { el.innerHTML = ''; return; }
    const pool = def.styles[this._formSubtype];
    el.innerHTML = pool.map((t, i) => `
      <div class="tag-chip ${this._formStyles.has(t) ? 'active' : ''}"
           onclick="EntModule._toggleStyleAt('${this._escAttr(t)}', ${i})">${this._esc(t)}</div>
    `).join('');
  },

  _toggleStyleAt(name, _i) {
    if (this._formStyles.has(name)) this._formStyles.delete(name);
    else this._formStyles.add(name);
    this._renderStylesBox();
  },

  _addCustomStyle() {
    const inp = document.getElementById('entNewStyle');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) { UI.toast('请输入风格名', 'error'); return; }
    if (!this._formSubtype) { UI.toast('请先选择大类', 'error'); return; }
    this._formStyles.add(name);
    inp.value = '';
    this._renderStylesBox();
  },

  // 表单内：评分星星
  _renderStarsInput() {
    const el = document.getElementById('entStarsInput');
    if (!el) return;
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<button type="button" class="ent-star-btn ${i <= this._formRating ? 'ent-star-btn--on' : ''}"
                       onclick="EntModule._setRating(${i})" title="${i} 星">★</button>`;
    }
    if (this._formRating > 0) {
      html += `<button type="button" class="ent-star-clear" onclick="EntModule._setRating(0)">清除</button>`;
    }
    el.innerHTML = html;
  },

  _setRating(n) {
    this._formRating = Math.max(0, Math.min(5, n | 0));
    this._renderStarsInput();
  },

  async _saveForm(id) {
    const title = document.getElementById('entTitle').value.trim();
    if (!title) { UI.toast('请填写名字', 'error'); return; }
    // 两级分类板块必须选大类
    if (this.isTwoLevel(this._formBoardId) && !this._formSubtype) {
      UI.toast('请先选择分类大类（AI / 真人）', 'error'); return;
    }
    const epsRaw = (document.getElementById('entEpisodes').value || '').trim();
    const eps = epsRaw === '' ? null : (parseInt(epsRaw, 10) >= 0 ? parseInt(epsRaw, 10) : null);
    const record = {
      board_id: this._formBoardId,
      title,
      episodes: eps,
      tags: [...this._formTags],
      rating: this._formRating || 0,
      rewatch: (document.getElementById('entRewatch').value || '').trim(),
      note: (document.getElementById('entNote').value || '').trim(),
      image: this._tmpImage || null,
    };
    // 两级分类字段（仅启用板块写入；其他板块保持 undefined 字段不存，避免数据噪音）
    if (this.isTwoLevel(this._formBoardId)) {
      record.subtype = this._formSubtype;
      record.styles = [...this._formStyles];
    }
    if (id) record.id = id;
    await DB.save('ent_records', record);
    UI.closeModal();
    UI.toast(id ? '已更新' : '已添加', 'success');
    this.render();
  },

  async _deleteRecord(id, fromDetail = false) {
    const ok = await UI.confirm('删除这条记录？图片和内容将一并删除，不可恢复。', { okText: '删除' });
    await this._sleep(120);   // confirm 会关闭底层弹窗，等轮询结束再操作
    if (!ok) {
      if (fromDetail) this.openDetail(id);
      return;
    }
    await DB.hardDelete('ent_records', id);
    UI.toast('已删除', 'success');
    this.render();
  },

  // ============ 子板块管理 ============
  _switchBoard(id) {
    this.state.currentBoardId = id;
    this.state.boardKw = '';   // 切换板块清空板块内搜索词
    this.state.subtypeFilter = 'all';   // 切换清空筛选
    this.state.styleFilter = 'all';
    this._renderTabs();
    this._renderContent();
  },

  async _boardManager() {
    const counts = await this._boardCounts();
    UI.modal('⚙️ 管理子板块', `
      ${this.state.boards.map(b => `
        <div class="list-item">
          <span style="font-size:22px">${this._esc(b.icon || '🍿')}</span>
          <div class="list-item__main">
            <div class="list-item__title">${this._esc(b.name)}</div>
            <div class="list-item__sub">${counts[b.id] || 0} 条记录</div>
          </div>
          <button class="btn btn--sm btn--ghost" onclick="EntModule.renameBoard('${b.id}')">✏️</button>
          <button class="btn btn--sm btn--ghost" onclick="EntModule.deleteBoard('${b.id}')">🗑️</button>
        </div>
      `).join('')}
      <button class="btn btn--primary btn--block mt-3" onclick="EntModule.addBoard()">➕ 新建子板块</button>
    `);
  },

  addBoard() {
    this._newBoardIcon = '🍿';
    UI.modal('➕ 新建子板块', `
      <div class="field">
        <label class="field__label">板块名称 *</label>
        <input class="input" id="entBoardName" placeholder="如：电影、综艺、追剧…" maxlength="12">
      </div>
      <div class="field">
        <label class="field__label">图标</label>
        <div class="ent-icon-row" id="entIconRow"></div>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="EntModule._saveBoard()">创建</button>
      </div>
    `);
    this._renderIconRow();
  },

  _renderIconRow() {
    const el = document.getElementById('entIconRow');
    if (!el) return;
    el.innerHTML = this.BOARD_ICONS.map((ic, i) => `
      <button type="button" class="ent-icon-opt ${ic === this._newBoardIcon ? 'ent-icon-opt--active' : ''}"
              onclick="EntModule._pickIcon(${i})">${ic}</button>
    `).join('');
  },

  _pickIcon(i) {
    this._newBoardIcon = this.BOARD_ICONS[i] || '🍿';
    this._renderIconRow();
  },

  async _saveBoard() {
    const name = (document.getElementById('entBoardName').value || '').trim();
    if (!name) { UI.toast('请填写板块名称', 'error'); return; }
    if (this.state.boards.some(b => b.name === name)) { UI.toast('已有同名子板块', 'error'); return; }
    const maxSort = this.state.boards.reduce((m, b) => Math.max(m, b.sort || 0), 0);
    const board = await DB.save('ent_boards', {
      name,
      icon: this._newBoardIcon || '🍿',
      sort: maxSort + 1,
    });
    UI.closeModal();
    UI.toast('子板块已创建', 'success');
    this.state.currentBoardId = board.id;
    this.state.boardKw = '';
    this.render();
  },

  renameBoard(id) {
    const b = this.state.boards.find(x => x.id === id);
    if (!b) return;
    UI.modal('✏️ 重命名子板块', `
      <div class="field">
        <label class="field__label">板块名称</label>
        <input class="input" id="entBoardRename" maxlength="12" value="${this._escAttr(b.name)}">
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="EntModule._doRename('${id}')">保存</button>
      </div>
    `);
  },

  async _doRename(id) {
    const name = (document.getElementById('entBoardRename').value || '').trim();
    if (!name) { UI.toast('名称不能为空', 'error'); return; }
    if (this.state.boards.some(x => x.id !== id && x.name === name)) { UI.toast('已有同名子板块', 'error'); return; }
    const b = await DB.get('ent_boards', id);
    if (!b) return;
    b.name = name;
    await DB.put('ent_boards', b);
    UI.closeModal();
    UI.toast('已重命名', 'success');
    this.render();
  },

  async deleteBoard(id) {
    const b = this.state.boards.find(x => x.id === id);
    if (!b) return;
    if (this.state.boards.length <= 1) { UI.toast('至少保留一个子板块', 'error'); return; }
    const recs = (await DB.list('ent_records')).filter(r => r.board_id === id && !r.deleted_at);
    const ok = await UI.confirm(`删除子板块「${this._esc(b.name)}」及其中 ${recs.length} 条记录？不可恢复。`, { okText: '删除' });
    await this._sleep(120);
    if (!ok) { this._boardManager(); return; }
    for (const r of recs) await DB.hardDelete('ent_records', r.id);
    await DB.hardDelete('ent_boards', id);
    if (this.state.currentBoardId === id) {
      this.state.currentBoardId = null;
      this.state.boardKw = '';
    }
    UI.toast('子板块已删除', 'success');
    this.render();
  },

  // ============ 工具 ============
  _statLine(records) {
    const n = records.length;
    if (!n) return '还没有记录，点右上角「＋ 添加」开始吧';
    const rated = records.filter(r => r.rating > 0);
    const avg = rated.length ? (rated.reduce((s, r) => s + (r.rating || 0), 0) / rated.length).toFixed(1) : '-';
    const eps = records.reduce((s, r) => s + (r.episodes || 0), 0);
    return `📊 共 ${n} 条 · 平均 ★${avg}${eps ? ` · 累计 ${eps} 集` : ''}`;
  },

  _starsHtml(rating) {
    const r = Math.max(0, Math.min(5, rating || 0));
    let s = '';
    for (let i = 1; i <= 5; i++) {
      s += `<span class="ent-star ${i <= r ? 'ent-star--on' : ''}">★</span>`;
    }
    return s;
  },

  // HTML 转义
  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  // 属性值转义（value="" 场景）
  _escAttr(s) {
    return this._esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  // 转义 + 关键词高亮（<mark> 粉色高亮）
  _hl(text, kw) {
    const safe = this._esc(text);
    kw = (kw || '').trim();
    if (!kw) return safe;
    // 关键词同样转义，保证在转义后的文本域内匹配（如搜 & 能命中 &amp;）
    const target = this._esc(kw);
    if (!target) return safe;
    const re = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return safe.replace(new RegExp(`(${re})`, 'gi'), '<mark class="ent-hl">$1</mark>');
    } catch (e) {
      return safe;
    }
  },

  _fmtTime(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return String(iso).slice(0, 16);
    return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
  },

  // 摘要：取前 n 字符 + 省略号（纯文本层截断，保证后续可安全高亮）
  _brief(s, n = 50) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
