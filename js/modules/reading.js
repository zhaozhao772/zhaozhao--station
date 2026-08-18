/**
 * 阅读模块
 * 四类分类：在看/待看/已看完/多钟类可看
 */
const ReadingModule = {
  async render() {
    const books = (await DB.list('books')).filter(b => !b.deleted_at);
    const categories = ['在看','待看','已看完','多钟类可看'];

    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">📖 阅读模块</div>
          <button class="btn btn--primary btn--sm" onclick="ReadingModule.add()">+ 添加书籍</button>
        </div>

        ${books.length === 0 ? `
          <div class="card">
            ${UI.empty('📚','还没有书籍，点击右上角添加')}
          </div>
        ` : categories.map(cat => {
          const catBooks = books.filter(b => b.category === cat);
          if (catBooks.length === 0) return '';
          return `
            <div class="card mb-4">
              <div class="card-header">
                <div class="card-title">${this._catIcon(cat)} ${cat}</div>
                <span class="badge">${catBooks.length}</span>
              </div>
              <div class="flex flex-col gap-2">
                ${catBooks.map(b => `
                  <div class="list-item">
                    <span class="book-icon">📚</span>
                    <div class="list-item__main" style="cursor:pointer" onclick="ReadingModule.detail('${b.id}')">
                      <div class="list-item__title">${b.title}</div>
                      <div class="list-item__sub">${b.author||'未知作者'} · ${b.platform||'-'}</div>
                    </div>
                    <button class="btn btn--sm btn--ghost" onclick="ReadingModule.moveCategory('${b.id}')">↕</button>
                    <button class="btn btn--sm btn--ghost" onclick="ReadingModule.edit('${b.id}')">✏️</button>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}

        <!-- 阅读复盘分析 -->
        ${books.filter(b => b.category === '已看完').length >= 3 ? `
          <div class="card">
            <div class="card-title">📊 阅读复盘分析</div>
            <div id="readingAnalysis">加载中...</div>
          </div>
        ` : ''}
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
    if (books.filter(b => b.category === '已看完').length >= 3) {
      this._renderAnalysis(books);
    }
  },

  _catIcon(cat) {
    return '📚';
  },

  async add() {
    this._editForm(null);
  },

  async edit(id) {
    const b = await DB.get('books', id);
    this._editForm(b);
  },

  _editForm(book) {
    const categories = ['在看','待看','已看完','多钟类可看'];
    this._selectedCat = book?.category || '在看';
    UI.modal(book ? '编辑书籍' : '添加书籍', `
      <div class="field">
        <label class="field__label">书名 *</label>
        <input class="input" id="bTitle" value="${book?.title||''}">
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">作者</label>
          <input class="input" id="bAuthor" value="${book?.author||''}">
        </div>
        <div class="field">
          <label class="field__label">类型</label>
          <input class="input" id="bType" placeholder="如：心理学、小说" value="${book?.type||''}">
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">电子/实体</label>
          <select class="select" id="bFormat">
            <option ${book?.format==='电子'?'selected':''}>电子</option>
            <option ${book?.format==='实体'?'selected':''}>实体</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label">阅读平台</label>
          <input class="input" id="bPlatform" placeholder="如：微信读书" value="${book?.platform||''}">
        </div>
      </div>
      <div class="field">
        <label class="field__label">分类</label>
        <div class="tag-select" id="bCatSelect">
          ${categories.map(c => `<div class="tag-chip ${(book?.category||'在看')===c?'active':''}" onclick="ReadingModule._selCat(this)">${c}</div>`).join('')}
        </div>
      </div>
      <div class="field">
        <label class="field__label">阅读时间</label>
        <input class="input" type="date" id="bDate" value="${book?.read_date||todayKey()}">
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="ReadingModule._save('${book?.id||''}')">保存</button>
      </div>
    `);
  },

  _selCat(el) {
    el.parentElement.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    this._selectedCat = el.textContent.trim();
  },

  async _save(id) {
    const title = document.getElementById('bTitle').value.trim();
    if (!title) { UI.toast('请填写书名','error'); return; }
    const data = {
      title,
      author: document.getElementById('bAuthor').value,
      type: document.getElementById('bType').value,
      format: document.getElementById('bFormat').value,
      platform: document.getElementById('bPlatform').value,
      category: this._selectedCat || '在看',
      read_date: document.getElementById('bDate').value,
    };
    if (id) { data.id = id; }
    await DB.save('books', data);
    UI.closeModal();
    UI.toast('已保存','success');
    this.render();
  },

  async moveCategory(id) {
    const categories = ['在看','待看','已看完','多钟类可看'];
    UI.modal('移动到分类', categories.map(c => `
      <div class="list-item" onclick="ReadingModule._doMove('${id}','${c}')">
        <span style="font-size:20px">${this._catIcon(c)}</span>
        <div class="list-item__main"><div class="list-item__title">${c}</div></div>
      </div>
    `).join(''));
  },

  async _doMove(id, cat) {
    const b = await DB.get('books', id);
    if (b) { b.category = cat; await DB.save('books', b); }
    UI.closeModal();
    UI.toast('已移动','success');
    this.render();
  },

  async detail(id) {
    const b = await DB.get('books', id);
    if (!b) return;
    const notes = (await DB.list('book_notes')).filter(n => !n.deleted_at && n.book_id === id);
    UI.modal(`📖 ${b.title}`, `
      <div class="text-soft text-sm mb-3">${b.author||'未知'} · ${b.type||''} · ${b.format} · ${b.platform||''}</div>
      <div class="card-header">
        <div class="card-title">📝 笔记与摘录</div>
        <button class="btn btn--sm btn--ghost" onclick="ReadingModule.addNote('${id}')">+ 添加</button>
      </div>
      ${notes.length === 0 ? '<p class="text-faint text-sm">还没有笔记</p>' : notes.map(n => `
        <div class="list-item" style="cursor:pointer" onclick="ReadingModule.viewNote('${n.id}')">
          <div class="list-item__main">
            <div class="list-item__title">${n.quote?.slice(0,40)||'笔记'}...</div>
            <div class="list-item__sub">${n.note_type||'摘录'}</div>
          </div>
        </div>
      `).join('')}
      <div class="flex gap-3 mt-4">
        <button class="btn btn--accent btn--sm" onclick="ReadingModule._deleteBook('${id}')">删除书籍</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _deleteBook(id) {
    if (!await UI.confirm('删除这本书及其所有笔记？此操作不可撤销。')) return;
    await DB.hardDelete('books', id);
    const notes = (await DB.list('book_notes')).filter(n => n.book_id === id);
    for (const n of notes) await DB.hardDelete('book_notes', n.id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.render();
  },

  async addNote(bookId) {
    UI.closeModal();
    const b = await DB.get('books', bookId);
    UI.modal(`添加笔记 - ${b.title}`, `
      <div class="field">
        <label class="field__label">笔记类型</label>
        <select class="select" id="nType">
          <option value="触动语句">触动语句</option>
          <option value="喜欢的片段">最喜欢的片段/故事</option>
          <option value="思考方向">引发思考的方向</option>
          <option value="核心收获">核心收获</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">原文摘录</label>
        <textarea class="textarea" id="nQuote" placeholder="摘录原文内容"></textarea>
      </div>
      <div class="field">
        <label class="field__label">我的感受（自选）</label>
        <textarea class="textarea" id="nFeeling" placeholder="可选"></textarea>
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="ReadingModule._saveNote('${bookId}')">保存</button>
      </div>
    `);
  },

  async _saveNote(bookId) {
    await DB.save('book_notes', {
      book_id: bookId,
      note_type: document.getElementById('nType').value,
      quote: document.getElementById('nQuote').value,
      feeling: document.getElementById('nFeeling').value,
    });
    UI.closeModal();
    UI.toast('笔记已保存','success');
    this.detail(bookId);
  },

  async viewNote(id) {
    const n = await DB.get('book_notes', id);
    if (!n) return;
    UI.modal('笔记详情', `
      <div class="text-soft text-sm mb-2">${n.note_type}</div>
      <div class="card--blur" style="background:var(--color-bg-alt);padding:12px;border-radius:10px;margin-bottom:12px">
        <div class="text-xs text-faint mb-1">原文摘录</div>
        <div>${n.quote||''}</div>
      </div>
      ${n.feeling ? `
        <div class="card--blur" style="background:rgba(241,148,166,0.06);padding:12px;border-radius:10px">
          <div class="text-xs text-faint mb-1">我的感受</div>
          <div>${n.feeling}</div>
        </div>
      ` : ''}
      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn btn--accent btn--sm" onclick="ReadingModule._delNote('${id}','${n.book_id}')">删除</button>
        <button class="btn btn--sm" onclick="UI.closeModal()">关闭</button>
      </div>
    `);
  },

  async _delNote(id, bookId) {
    if (!await UI.confirm('删除这条笔记？')) return;
    await DB.hardDelete('book_notes', id);
    UI.closeModal();
    UI.toast('已删除','success');
    this.detail(bookId);
  },

  async _renderAnalysis(books) {
    const el = document.getElementById('readingAnalysis');
    if (!el) return;
    const finished = books.filter(b => b.category === '已看完');
    const notes = (await DB.list('book_notes')).filter(n => !n.deleted_at && finished.some(b => b.id === n.book_id));
    // 高频类型
    const typeCount = {};
    finished.forEach(b => { if (b.type) typeCount[b.type] = (typeCount[b.type]||0)+1; });
    // 高频笔记关键词
    const noteTypes = {};
    notes.forEach(n => { noteTypes[n.note_type] = (noteTypes[n.note_type]||0)+1; });
    el.innerHTML = `
      <div class="grid grid-2">
        <div>
          <div class="text-soft text-sm mb-2">📚 已读 ${finished.length} 本</div>
          <div class="text-faint text-xs">类型分布：</div>
          <ul class="text-sm mt-1">
            ${Object.entries(typeCount).sort((a,b)=>b[1]-a[1]).map(([t,c]) => `<li>${t}: ${c} 本</li>`).join('') || '<li class="text-faint">暂无</li>'}
          </ul>
        </div>
        <div>
          <div class="text-soft text-sm mb-2">📝 笔记 ${notes.length} 条</div>
          <div class="text-faint text-xs">笔记类型分布：</div>
          <ul class="text-sm mt-1">
            ${Object.entries(noteTypes).sort((a,b)=>b[1]-a[1]).map(([t,c]) => `<li>${t}: ${c} 条</li>`).join('') || '<li class="text-faint">暂无</li>'}
          </ul>
        </div>
      </div>
      <div class="ai-block mt-3">
        💡 以上分析基于你的真实记录自动统计。随着记录增多，可以观察哪种类型的书更容易引发深度思考。
      </div>
    `;
  },
};
