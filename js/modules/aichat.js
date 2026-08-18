/**
 * 跨维沟通 AI 角色对话模块
 * 包含：五类资料库、多供应商 API 适配、聊天、分支、长记忆、受控摘要
 */
const AIChatModule = {
  async render() {
    if (!App.state.settings.enable_ai) {
      document.getElementById('pageContent').innerHTML = `<div class="page"><div class="card">${UI.empty('💬','AI 功能未开启，可在设置中开启')}<button class="btn btn--sm mt-2" onclick="SettingsModule._setSetting('enable_ai',true);App.navigate('ai-chat')">开启 AI</button></div></div>`;
      return;
    }
    const conversations = (await DB.list('ai_conversations')).filter(c => !c.deleted_at);
    const connections = (await DB.list('ai_connections')).filter(c => !c.deleted_at);
    const resources = (await DB.list('ai_resources')).filter(r => !r.deleted_at);
    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">💬 跨维沟通</div>
          <div class="flex gap-2">
            <button class="btn btn--sm" onclick="AIChatModule.showLibrary()">资料库</button>
            <button class="btn btn--sm" onclick="AIChatModule.showConnections()">API 连接</button>
            <button class="btn btn--primary btn--sm" onclick="AIChatModule.newChat()">+ 新对话</button>
          </div>
        </div>

        <div class="ai-disclaimer mb-4">
          AI 角色消息标注为 AI 生成，不伪装成现实人物，也不把 AI 对话自动算作现实互动。<br>
          所有角色口吻文字均为象征性/创意内容，仅供自我探索与娱乐。
        </div>

        ${connections.length === 0 ? `
          <div class="card mb-4" style="border:1px solid var(--color-warning)">
            <div class="card-title">⚠️ 还没有配置 API 连接</div>
            <p class="text-soft text-sm mb-3">需要配置至少一个 AI API 连接才能开始对话。支持 OpenAI、DeepSeek、Anthropic、Gemini、xAI 等。</p>
            <button class="btn btn--primary btn--sm" onclick="AIChatModule.showConnections()">去配置</button>
          </div>
        ` : ''}

        <div class="card">
          <div class="card-title">📜 对话列表</div>
          ${conversations.length === 0 ? `
            ${UI.empty('💬','还没有对话')}
            <p class="text-faint text-sm mt-2">使用步骤：资料库创建资料 → 新建对话 → 选择资料和连接 → 开始聊天</p>
          ` : `
            <div class="flex flex-col gap-2">
              ${conversations.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(c => `
                <div class="list-item" style="cursor:pointer;position:relative" onclick="AIChatModule.openChat('${c.id}')">
                  <span style="font-size:20px">💬</span>
                  <div class="list-item__main">
                    <div class="list-item__title">${c.title||'未命名对话'}</div>
                    <div class="list-item__sub">${c.updated_at?.slice(0,16).replace('T',' ')||''}</div>
                  </div>
                  <button
                    class="btn btn--sm"
                    style="color:#fff;background:var(--color-accent);border-color:var(--color-accent);flex-shrink:0;padding:6px 10px;min-height:36px;font-weight:600"
                    title="删除对话"
                    onclick="event.stopPropagation();AIChatModule._confirmDelConv('${c.id}','${(c.title||'未命名对话').replace(/'/g, "&#39;")}')">🗑️ 删除</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- 受控摘要设置 -->
        <div class="card mt-4">
          <div class="card-title">🔐 工作台受控摘要</div>
          <p class="text-faint text-sm mb-3">AI 不直接读取整个数据库。选择允许发送的板块摘要：</p>
          <div class="flex flex-wrap gap-2" id="summaryPerms">
            ${['任务','项目','学习','阅读','锻炼','情绪','复盘','灵魂链接'].map(cat => `
              <label class="tag-chip ${App.state.settings[`summary_${cat}`]?'active':''}" onclick="AIChatModule._toggleSummary('${cat}')">${cat}</label>
            `).join('')}
          </div>
          <div class="ai-disclaimer mt-2">默认排除金额、联系方式、地址、附件、隐私全文、密码。发送前可预览和删减。</div>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
  },

  async _toggleSummary(cat) {
    const key = `summary_${cat}`;
    const cur = App.state.settings[key];
    await DB.setSetting(key, !cur);
    App.state.settings[key] = !cur;
    this.render();
  },

  // ============ 资料库 ============
  async showLibrary() {
    const resources = (await DB.list('ai_resources')).filter(r => !r.deleted_at);
    const kinds = [
      { kind: 'character', name: '对方角色卡', icon: '🎭' },
      { kind: 'persona', name: '我的角色卡', icon: '🙋' },
      { kind: 'preset', name: '预设', icon: '⚙️' },
      { kind: 'lorebook', name: '世界书', icon: '📚' },
      { kind: 'longMemory', name: '手工长记忆', icon: '🧠' },
    ];
    UI.modal('📚 资料库（五个独立区域）', `
      <p class="text-soft text-sm mb-3">不要自动识别后放错区域。每个区域可文字新建或上传 JSON。</p>
      ${kinds.map(k => {
        const items = resources.filter(r => r.kind === k.kind);
        return `
          <div class="card--blur" style="background:var(--color-bg-alt);padding:14px;border-radius:12px;margin-bottom:10px">
            <div class="flex items-center justify-between mb-2">
              <div class="font-bold">${k.icon} ${k.name} <span class="badge">${items.length}</span></div>
              <div class="flex gap-1">
                <button class="btn btn--sm btn--ghost" onclick="AIChatModule._addResource('${k.kind}','${k.name}')">文字新建</button>
                <button class="btn btn--sm btn--ghost" onclick="AIChatModule._importResource('${k.kind}')">导入JSON</button>
              </div>
            </div>
            ${items.length === 0 ? '<p class="text-faint text-xs">暂无</p>' : items.map(r => `
              <div class="list-item" style="padding:8px">
                <div class="list-item__main">
                  <div class="list-item__title text-sm">${r.name}</div>
                  ${r.kind === 'longMemory' && r.data.active === '停用' ? '<span class="tag-chip" style="font-size:10px;padding:1px 6px;color:var(--color-danger)">停用</span>' : ''}
                  ${r.kind === 'lorebook' ? `<span class="text-faint text-xs">${(r.data.entries||[]).length} 条目</span>` : ''}
                </div>
                <button class="btn btn--sm btn--ghost" onclick="AIChatModule._editResource('${r.id}')">编辑</button>
                <button class="btn btn--sm btn--ghost" onclick="AIChatModule._exportResource('${r.id}')">导出</button>
                <button class="btn btn--sm btn--ghost" onclick="AIChatModule._delResource('${r.id}')">×</button>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    `);
  },

  async _addResource(kind, kindName, editId) {
    const fields = this._getResourceFields(kind);
    const editing = editId ? await DB.get('ai_resources', editId) : null;
    const existingData = editing?.data || {};
    const existingName = editing?.name || '';

    // 世界书特殊处理：元信息表单 + 条目列表
    if (kind === 'lorebook') {
      this._showLorebookEditor(editId, existingData, existingName);
      return;
    }

    // 按分组渲染
    const groups = {};
    fields.forEach(f => {
      const g = f.group || '默认';
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    });

    const fieldsHtml = Object.entries(groups).map(([groupName, groupFields]) => `
      <div class="field-group">
        <div class="field-group__title">${groupName}</div>
        ${groupFields.map(f => {
          const val = existingData[f.key] || '';
          const valAttr = val ? `data-existing="${this._escapeAttr(val)}"` : '';
          if (f.type === 'select') {
            return `<div class="field">
              <label class="field__label">${f.label}${f.required?' <span style="color:var(--color-accent)">*</span>':''}</label>
              <select class="select" id="rf_${f.key}" ${valAttr}>
                <option value="">请选择</option>
                ${(f.options||[]).map(o => `<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('')}
              </select>
              ${f.hint?`<div class="field__hint">${f.hint}</div>`:''}
            </div>`;
          }
          if (f.type === 'textarea') {
            return `<div class="field">
              <label class="field__label">${f.label}${f.required?' <span style="color:var(--color-accent)">*</span>':''}</label>
              <textarea class="textarea" id="rf_${f.key}" placeholder="${f.hint||''}" ${valAttr}>${this._escapeHtml(val)}</textarea>
            </div>`;
          }
          return `<div class="field">
            <label class="field__label">${f.label}${f.required?' <span style="color:var(--color-accent)">*</span>':''}</label>
            <input class="input" id="rf_${f.key}" placeholder="${f.hint||''}" value="${this._escapeAttr(val)}">
          </div>`;
        }).join('')}
      </div>
    `).join('');

    UI.modal(`${kindName} - ${editing?'编辑':'文字新建'}`, `
      <p class="text-soft text-sm mb-3">逐项填写，缺项留空，不编造。确认后转为统一 JSON。</p>
      ${fieldsHtml}
      <div class="field"><label class="field__label">资源名称</label><input class="input" id="rf_name" value="${this._escapeAttr(existingName)}" placeholder="给这个资料起个名字"></div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="AIChatModule._saveResource('${kind}', ${editId?`'${editId}'`:'null'})">保存</button>
      </div>
    `);
  },

  async _editResource(id) {
    const r = await DB.get('ai_resources', id);
    if (!r) return;
    const kindNames = { character:'对方角色卡', persona:'我的角色卡', preset:'预设', lorebook:'世界书', longMemory:'手工长记忆' };
    this._addResource(r.kind, kindNames[r.kind] || r.kind, id);
  },

  _escapeAttr(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  // ============ 世界书条目管理 ============
  _showLorebookEditor(editId, existingData, existingName) {
    const entries = existingData.entries || [];
    const desc = existingData.description || '';
    const defaultPos = existingData.default_insert_position || 'system';

    window._tempLorebookEntries = JSON.parse(JSON.stringify(entries));

    UI.modal(`世界书 - ${editId?'编辑':'文字新建'}`, `
      <div class="field">
        <label class="field__label">资源名称</label>
        <input class="input" id="rf_name" value="${this._escapeAttr(existingName)}" placeholder="给这本世界书起个名字">
      </div>
      <div class="field">
        <label class="field__label">世界书描述</label>
        <textarea class="textarea" id="rf_description" placeholder="这本世界书的整体说明">${this._escapeHtml(desc)}</textarea>
      </div>
      <div class="field">
        <label class="field__label">默认插入位置</label>
        <select class="select" id="rf_default_insert_position">
          <option value="system" ${defaultPos==='system'?'selected':''}>system（系统提示中）</option>
          <option value="before_last" ${defaultPos==='before_last'?'selected':''}>before_last（最后一条消息前）</option>
          <option value="after_last" ${defaultPos==='after_last'?'selected':''}>after_last（最后一条消息后）</option>
        </select>
      </div>

      <div class="field-group mt-4">
        <div class="field-group__title flex justify-between items-center">
          <span>条目列表 (${entries.length})</span>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._addLorebookEntry()">+ 添加条目</button>
        </div>
        <div id="lorebookEntriesList" class="lorebook-entries">
          ${entries.length === 0 ? '<p class="text-faint text-xs">还没有条目，点击「添加条目」创建</p>' : ''}
        </div>
      </div>

      <div class="flex gap-3 mt-4" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="AIChatModule._saveLorebook(${editId?`'${editId}'`:'null'})">保存</button>
      </div>
    `);

    // 渲染已有条目
    this._renderLorebookEntries();
  },

  _renderLorebookEntries() {
    const container = document.getElementById('lorebookEntriesList');
    if (!container) return;
    const entries = window._tempLorebookEntries || [];
    if (entries.length === 0) {
      container.innerHTML = '<p class="text-faint text-xs">还没有条目，点击「添加条目」创建</p>';
      return;
    }
    container.innerHTML = entries.map((e, i) => `
      <div class="card--blur" style="padding:10px;margin-bottom:8px">
        <div class="flex justify-between items-center mb-1">
          <div class="font-bold text-sm">${e.entry_title || '未命名条目'}</div>
          <div class="flex gap-1">
            <button class="btn btn--sm btn--ghost" onclick="AIChatModule._editLorebookEntry(${i})">编辑</button>
            <button class="btn btn--sm btn--ghost" onclick="AIChatModule._delLorebookEntry(${i})">×</button>
          </div>
        </div>
        <div class="text-faint text-xs">
          <span class="tag-chip" style="font-size:10px;padding:1px 6px">${e.trigger_type || '关键词触发'}</span>
          ${e.enabled === '停用' ? '<span class="tag-chip" style="font-size:10px;padding:1px 6px;color:var(--color-danger)">停用</span>' : ''}
          ${e.keywords ? `· 关键词: ${e.keywords}` : ''}
          ${e.priority ? `· 优先级: ${e.priority}` : ''}
        </div>
      </div>
    `).join('');
  },

  _addLorebookEntry() {
    window._tempLorebookEntries = window._tempLorebookEntries || [];
    window._tempLorebookEntries.push({
      entry_title: '', entry_content: '', trigger_type: '关键词触发（keyword）',
      keywords: '', priority: '10', insert_position: 'system', enabled: '启用',
      applicable_characters: '', world_rules: '', locations: '', organizations: '',
      character_relations: '', historical_events: '',
    });
    this._editLorebookEntry(window._tempLorebookEntries.length - 1);
  },

  _editLorebookEntry(idx) {
    const entry = window._tempLorebookEntries[idx];
    if (!entry) return;
    const fields = this._lorebookEntrySchema;
    UI.modal(`编辑条目 ${idx+1}`, `
      ${fields.map(f => {
        const val = entry[f.key] || '';
        if (f.type === 'select') {
          return `<div class="field"><label class="field__label">${f.label}</label>
            <select class="select" id="lbe_${f.key}">
              <option value="">请选择</option>
              ${(f.options||[]).map(o => `<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('')}
            </select>${f.hint?`<div class="field__hint">${f.hint}</div>`:''}</div>`;
        }
        if (f.type === 'textarea') {
          return `<div class="field"><label class="field__label">${f.label}</label>
            <textarea class="textarea" id="lbe_${f.key}" placeholder="${f.hint||''}">${this._escapeHtml(val)}</textarea></div>`;
        }
        return `<div class="field"><label class="field__label">${f.label}</label>
          <input class="input" id="lbe_${f.key}" value="${this._escapeAttr(val)}" placeholder="${f.hint||''}"></div>`;
      }).join('')}
      <div class="flex gap-3 mt-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="AIChatModule._saveLorebookEntry(${idx})">保存条目</button>
      </div>
    `);
  },

  _saveLorebookEntry(idx) {
    const fields = this._lorebookEntrySchema;
    const entry = {};
    fields.forEach(f => {
      const el = document.getElementById(`lbe_${f.key}`);
      if (el && el.value.trim()) entry[f.key] = el.value.trim();
    });
    window._tempLorebookEntries[idx] = entry;
    UI.closeModal();
    this._renderLorebookEntries();
  },

  _delLorebookEntry(idx) {
    window._tempLorebookEntries.splice(idx, 1);
    this._renderLorebookEntries();
  },

  async _saveLorebook(editId) {
    const name = document.getElementById('rf_name').value.trim() || `世界书-${todayKey()}`;
    const data = {
      description: document.getElementById('rf_description').value.trim(),
      default_insert_position: document.getElementById('rf_default_insert_position').value,
      entries: window._tempLorebookEntries || [],
    };
    const resource = {
      $schema: 'workbuddy-ai-resource-v1',
      kind: 'lorebook',
      name,
      version: 1,
      data,
      source: { type: 'manual-text', originalText: JSON.stringify(data, null, 2), createdAt: nowISO() },
    };
    if (editId) resource.id = editId;
    await DB.save('ai_resources', resource);
    UI.closeModal();
    UI.toast('世界书已保存','success');
    this.showLibrary();
  },

  // ============ 资料库字段定义（完整采集表 A-E）============
  _schemas: {
    // A. 对方角色卡（31 字段，8 组）
    character: [
      { key: 'name', label: '姓名', type: 'input', hint: '角色的全名', required: true, group: '基础信息' },
      { key: 'nickname', label: '昵称', type: 'input', hint: '日常使用的小名/爱称', group: '基础信息' },
      { key: 'forms_of_address', label: '称呼', type: 'input', hint: '不同人怎么叫他/她（如：朋友叫小X，正式场合叫X先生）', group: '基础信息' },
      { key: 'age', label: '年龄/是否成年', type: 'input', hint: '如「25岁，已成年」。不确定可写「不详，设定为成年」', group: '基础信息' },
      { key: 'gender_pronoun', label: '性别与代词', type: 'input', hint: '如「女性，她/她的」或「非二元，ta/ta的」', group: '基础信息' },
      { key: 'identity', label: '身份', type: 'input', hint: '职业/社会角色，如「插画师」「大学生」', group: '基础信息' },
      { key: 'appearance', label: '外貌', type: 'textarea', hint: '身高、发型、瞳色、穿搭风格、标志性特征等', group: '外貌与背景' },
      { key: 'background', label: '背景', type: 'textarea', hint: '成长经历、家庭、教育、关键人生事件', group: '外貌与背景' },
      { key: 'worldview_position', label: '世界观位置', type: 'textarea', hint: '在所属世界观中的位置/阵营/地位', group: '外貌与背景' },
      { key: 'core_personality', label: '核心人格', type: 'textarea', hint: '最本质的性格底色', group: '人格' },
      { key: 'outer_personality', label: '外显人格', type: 'textarea', hint: '对外展示的一面', group: '人格' },
      { key: 'inner_personality', label: '内在人格', type: 'textarea', hint: '内心真实的一面', group: '人格' },
      { key: 'values', label: '价值观', type: 'textarea', hint: '信仰什么、看重什么、反对什么', group: '人格' },
      { key: 'abilities_limits', label: '能力与限制', type: 'textarea', hint: '擅长什么、不擅长什么、世界观内的能力上限', group: '能力与行为' },
      { key: 'habits', label: '行为习惯', type: 'textarea', hint: '口头禅、小动作、日常作息习惯', group: '能力与行为' },
      { key: 'language_style', label: '语言风格', type: 'textarea', hint: '用词偏好、句式特征、语气节奏', group: '能力与行为' },
      { key: 'common_address', label: '常用称呼', type: 'input', hint: '通常怎么称呼对话对象（如「宝贝」「你这家伙」）', group: '能力与行为' },
      { key: 'relationship_to_user', label: '和用户的关系', type: 'textarea', hint: '恋人/朋友/对手/师徒等，关系深度和阶段', group: '关系与情感' },
      { key: 'meeting_history', label: '相识历史', type: 'textarea', hint: '怎么认识的、关系发展的关键节点', group: '关系与情感' },
      { key: 'attachment_style', label: '依恋/表达方式', type: 'textarea', hint: '安全型/焦虑型/回避型？怎么表达爱意和不满', group: '关系与情感' },
      { key: 'likes', label: '喜欢', type: 'textarea', hint: '喜欢的事物、话题、行为模式', group: '喜好与边界' },
      { key: 'dislikes', label: '厌恶', type: 'textarea', hint: '讨厌的事物、雷点', group: '喜好与边界' },
      { key: 'sensitive_points', label: '敏感点', type: 'textarea', hint: '情感敏感点、容易触动的话题或身体部位', group: '喜好与边界' },
      { key: 'boundaries', label: '边界', type: 'textarea', hint: '绝对不能做的事、不愿涉及的话题', group: '喜好与边界' },
      { key: 'forbidden_expressions', label: '禁止出现的表达习惯', type: 'textarea', hint: '不能让这个角色说的话/做的事（防OOC）', group: '喜好与边界' },
      { key: 'reaction_gentle', label: '温柔场景中的反应', type: 'textarea', hint: '被温柔对待时怎么回应', group: '场景反应' },
      { key: 'reaction_conflict', label: '冲突场景中的反应', type: 'textarea', hint: '面对矛盾/争吵时的行为模式', group: '场景反应' },
      { key: 'reaction_playful', label: '玩笑场景中的反应', type: 'textarea', hint: '被逗弄/开玩笑时的反应', group: '场景反应' },
      { key: 'reaction_intimate', label: '亲密场景中的反应', type: 'textarea', hint: '亲密互动时的表现（按需填写）', group: '场景反应' },
      { key: 'reaction_serious', label: '严肃场景中的反应', type: 'textarea', hint: '讨论严肃话题时的态度', group: '场景反应' },
      { key: 'opening', label: '开场白', type: 'textarea', hint: '角色第一次说话时的台词', group: '示例' },
      { key: 'example_dialogue', label: '示例对话', type: 'textarea', hint: '2-4轮示例对话，格式：\n用户：...\n角色：...', group: '示例' },
      { key: 'notes', label: '其他补充', type: 'textarea', hint: '任何不属于以上分类但重要的信息', group: '补充' },
    ],
    // B. 我的角色卡（16 字段，4 组）
    persona: [
      { key: 'name', label: '姓名/昵称', type: 'input', hint: '你在对话中使用的身份名', required: true, group: '基础信息' },
      { key: 'preferred_address', label: '希望对方如何称呼我', type: 'input', hint: '如「叫我昭昭」「宝贝」', group: '基础信息' },
      { key: 'age', label: '年龄/是否成年', type: 'input', hint: '如「24岁，已成年」', group: '基础信息' },
      { key: 'gender_pronoun', label: '性别与代词', type: 'input', hint: '如「女性，她/她的」', group: '基础信息' },
      { key: 'identity', label: '身份', type: 'input', hint: '你的社会角色/职业', group: '基础信息' },
      { key: 'appearance', label: '外貌（可选）', type: 'textarea', hint: '可选，如果不希望设定外貌可留空', group: '外貌与性格' },
      { key: 'personality', label: '性格', type: 'textarea', hint: '你的核心性格特征', group: '外貌与性格' },
      { key: 'background', label: '背景', type: 'textarea', hint: '在对话世界中的背景设定', group: '外貌与性格' },
      { key: 'preferences', label: '偏好与禁忌', type: 'textarea', hint: '喜欢什么话题/互动方式，不喜欢什么', group: '偏好与习惯' },
      { key: 'communication_style', label: '沟通习惯', type: 'textarea', hint: '你通常怎么表达，是直接还是委婉', group: '偏好与习惯' },
      { key: 'emotional_needs', label: '情绪需求', type: 'textarea', hint: '希望从对话中获得什么情感支持', group: '偏好与习惯' },
      { key: 'boundaries', label: '边界', type: 'textarea', hint: '对话中不想涉及的内容', group: '偏好与习惯' },
      { key: 'relationship_to_character', label: '与对方的关系', type: 'textarea', hint: '你设定和对方角色卡的关系', group: '关系' },
      { key: 'shared_experiences', label: '共同经历', type: 'textarea', hint: '和对方角色共同经历过的重要事件', group: '关系' },
      { key: 'real_info_to_keep', label: '希望保留的现实信息', type: 'textarea', hint: '允许AI引用的真实信息，如「我有只猫叫橘子」', group: '现实信息控制' },
      { key: 'forbidden_real_info', label: '绝不能被AI引用的信息', type: 'textarea', hint: '隐私保护：绝对不能出现在对话中的真实信息', group: '现实信息控制' },
    ],
    // C. 预设（18 字段，5 组）
    preset: [
      { key: 'goal', label: '对话目标', type: 'textarea', hint: '陪伴/创意写作/情感探索/角色扮演', required: true, group: '目标与视角' },
      { key: 'narrative_perspective', label: '叙述视角', type: 'select', options: ['第二人称（你）','第三人称','第一人称（我）','混合'], group: '目标与视角' },
      { key: 'language', label: '语言', type: 'input', hint: '如「中文」或「中英混合」', group: '目标与视角' },
      { key: 'response_length', label: '回复长度', type: 'select', options: ['短（1-3句）','中等（4-8句）','长（一段）','由AI根据场景判断'], group: '长度与排版' },
      { key: 'action_dialogue_ratio', label: '动作与对白比例', type: 'input', hint: '如「7:3对白为主」或「平衡」', group: '长度与排版' },
      { key: 'formatting_rules', label: '排版规则', type: 'textarea', hint: '对白用引号、动作用括号、心理活动用斜体等', group: '长度与排版' },
      { key: 'coherence_rules', label: '连贯性规则', type: 'textarea', hint: '如何保持前后文一致、人物不崩', group: '长度与排版' },
      { key: 'character_agency', label: '角色主体性强度', type: 'select', options: ['低（主要回应用户）','中（偶尔主动推进）','高（主动推动剧情）'], group: '角色行为控制' },
      { key: 'gentle_vs_strong', label: '温柔/强势判断原则', type: 'textarea', hint: '什么情况下角色温柔，什么情况下强势', group: '角色行为控制' },
      { key: 'conflict_handling', label: '冲突处理', type: 'textarea', hint: '发生冲突时角色的行为准则', group: '角色行为控制' },
      { key: 'allow_plot_advance', label: '是否允许主动推进剧情', type: 'select', options: ['允许','不允许','需用户暗示后推进'], group: '角色行为控制' },
      { key: 'forbidden_phrases', label: '禁止口癖', type: 'textarea', hint: '不允许AI使用的口癖和句式，每行一个', group: '禁止与边界' },
      { key: 'disliked_sentences', label: '不喜欢的句式', type: 'textarea', hint: '不希望出现的句式模式', group: '禁止与边界' },
      { key: 'fact_fiction_boundary', label: '事实与虚构边界', type: 'textarea', hint: '明确哪些是创作虚构、哪些是真实信息', group: '禁止与边界' },
      { key: 'memory_usage', label: '记忆使用方式', type: 'textarea', hint: '如何使用长记忆和世界书信息', group: '记忆与结尾' },
      { key: 'ending_habits', label: '结尾习惯', type: 'textarea', hint: '回复结尾的偏好（留悬念/自然结束/提问引导）', group: '记忆与结尾' },
      { key: 'system_prompt', label: '系统提示', type: 'textarea', hint: '直接发送给AI的system消息，支持宏替换', group: '系统提示词' },
      { key: 'post_history_prompt', label: '历史后提示', type: 'textarea', hint: '放在聊天历史之后的指令，支持宏替换', group: '系统提示词' },
      { key: 'prompt_order', label: '提示词排列顺序', type: 'textarea', hint: '自定义顺序如「preset,character,persona,lorebook,memory,history」。留空用默认。', group: '系统提示词' },
    ],
    // D. 世界书（元信息 + 多 entry）
    lorebook: [
      { key: 'description', label: '世界书描述', type: 'textarea', hint: '这本世界书的整体说明', group: '元信息' },
      { key: 'default_insert_position', label: '默认插入位置', type: 'select', options: ['system','before_last','after_last'], hint: '新条目的默认插入位置', group: '元信息' },
    ],
    // E. 手工长记忆（12 字段）
    longMemory: [
      { key: 'title', label: '记忆标题', type: 'input', hint: '简短概括这条记忆', required: true, group: '基础' },
      { key: 'involved_parties', label: '涉及对象', type: 'input', hint: '涉及的人物/角色，逗号分隔', group: '基础' },
      { key: 'time_range', label: '时间范围', type: 'input', hint: '如「2026年1月」或「上周」', group: '基础' },
      { key: 'facts', label: '事实', type: 'textarea', hint: '客观发生的事', group: '基础' },
      { key: 'user_feelings', label: '用户感受', type: 'textarea', hint: '用户对此的感受', group: '基础' },
      { key: 'relationship_changes', label: '关系变化', type: 'textarea', hint: '这件事导致的关系变化', group: '基础' },
      { key: 'stable_prefs', label: '稳定偏好/禁忌', type: 'textarea', hint: '从中提炼的长期偏好或禁忌', group: '基础' },
      { key: 'unfulfilled_promises', label: '未完成约定', type: 'textarea', hint: '尚待完成的承诺/约定', group: '基础' },
      { key: 'keywords', label: '关键词', type: 'input', hint: '逗号分隔，用于匹配触发', group: '基础' },
      { key: 'credibility', label: '可信度', type: 'select', options: ['高（确证事实）','中（基本可信）','低（待核实）'], group: '基础' },
      { key: 'source', label: '来源', type: 'input', hint: '如「对话自动提取」「用户手工录入」', group: '基础' },
      { key: 'active', label: '启用状态', type: 'select', options: ['启用','停用'], group: '基础' },
    ],
  },

  // 世界书条目模板（动态管理，不在 _addResource 表单中直接用）
  _lorebookEntrySchema: [
    { key: 'entry_title', label: '标题', type: 'input', hint: '条目名称', required: true },
    { key: 'entry_content', label: '正文', type: 'textarea', hint: '条目的详细内容' },
    { key: 'trigger_type', label: '触发方式', type: 'select', options: ['常驻（always_active）','关键词触发（keyword）'] },
    { key: 'keywords', label: '关键词及同义词', type: 'input', hint: '逗号分隔，如「学校,校园,教室,上课」' },
    { key: 'priority', label: '优先级', type: 'input', hint: '数字越大越优先，默认10' },
    { key: 'insert_position', label: '插入位置', type: 'select', options: ['system','before_last','after_last'] },
    { key: 'enabled', label: '启用状态', type: 'select', options: ['启用','停用'] },
    { key: 'applicable_characters', label: '适用角色', type: 'input', hint: '逗号分隔的角色名，留空表示所有角色适用' },
    { key: 'world_rules', label: '世界规则', type: 'textarea', hint: '该条目涉及的规则' },
    { key: 'locations', label: '地点', type: 'textarea', hint: '涉及的地点' },
    { key: 'organizations', label: '组织', type: 'textarea', hint: '涉及的组织/团体' },
    { key: 'character_relations', label: '人物关系', type: 'textarea', hint: '涉及的人物关系' },
    { key: 'historical_events', label: '历史事件', type: 'textarea', hint: '涉及的历史事件' },
  ],

  _getResourceFields(kind) {
    return this._schemas[kind] || [{ key: 'name_field', label: '姓名/昵称', type: 'input' }];
  },

  async _saveResource(kind, editId) {
    const name = document.getElementById('rf_name').value.trim() || `${kind}-${Date.now()}`;
    const fields = this._getResourceFields(kind);
    const data = {};
    fields.forEach(f => {
      const el = document.getElementById(`rf_${f.key}`);
      if (el && el.value.trim()) data[f.key] = el.value.trim();
    });
    const resource = {
      $schema: 'workbuddy-ai-resource-v1',
      kind,
      name,
      version: 1,
      data,
      source: {
        type: 'manual-text',
        originalText: JSON.stringify(data, null, 2),
        createdAt: nowISO(),
      },
    };
    if (editId) resource.id = editId;
    await DB.save('ai_resources', resource);
    UI.closeModal();
    UI.toast('资料已保存','success');
    this.showLibrary();
  },

  async _importResource(kind) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        // 兼容多种格式
        const resource = {
          $schema: 'workbuddy-ai-8resource-v1',
          kind,
          name: parsed.name || parsed.data?.name || file.name,
          version: 1,
          data: parsed.data || parsed,
          source: {
            type: 'imported-json',
            originalText: text,
            createdAt: nowISO(),
          },
        };
        await DB.save('ai_resources', resource);
        UI.toast('已导入','success');
        this.showLibrary();
      } catch(err) {
        UI.toast('导入失败：'+err.message,'error');
      }
    };
    input.click();
  },

  async _exportResource(id) {
    const r = await DB.get('ai_resources', id);
    if (!r) return;
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('已导出','success');
  },

  async _delResource(id) {
    if (!await UI.confirm('删除这个资料？')) return;
    await DB.hardDelete('ai_resources', id);
    this.showLibrary();
  },

  // ============ API 连接 ============
  async showConnections() {
    const connections = (await DB.list('ai_connections')).filter(c => !c.deleted_at);
    UI.modal('🔌 API 连接配置', `
      <div class="ai-disclaimer mb-3">
        ⚠️ ChatGPT Plus、Claude Pro 等网页会员 ≠ API Key/额度。<br>
        需使用开发者平台密钥。密钥使用 Web Crypto 加密本地保存，不随备份导出。<br>
        某些供应商浏览器直连会 CORS，需配置安全 Relay。
      </div>
      ${connections.map(c => `
        <div class="list-item">
          <div class="list-item__main">
            <div class="list-item__title">${c.name} <span class="tag-chip" style="font-size:10px;padding:1px 6px">${c.provider}</span></div>
            <div class="list-item__sub">${c.base_url||''} · ${c.model||''}</div>
          </div>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._testConn('${c.id}')">测试</button>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._editConn('${c.id}')">编辑</button>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._delConn('${c.id}')">×</button>
        </div>
      `).join('')}
      <button class="btn btn--ghost btn--block mt-2" onclick="AIChatModule._addConn()">+ 新建连接</button>
    `);
  },

  _providers: [
    { id: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'anthropic', name: 'Anthropic', base_url: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
    { id: 'gemini', name: 'Gemini', base_url: 'https://generativelanguage.googleapis.com', model: 'gemini-1.5-flash' },
    { id: 'xai', name: 'xAI Grok', base_url: 'https://api.x.ai/v1', model: 'grok-beta' },
    { id: 'custom', name: '自定义（OpenAI兼容）', base_url: '', model: '' },
  ],

  async _addConn(connId) {
    const conn = connId ? await DB.get('ai_connections', connId) : null;
    UI.modal(conn ? '编辑连接' : '新建 API 连接', `
      <div class="field"><label class="field__label">连接名称</label><input class="input" id="cName" value="${conn?.name||''}"></div>
      <div class="field"><label class="field__label">供应商</label><select class="select" id="cProvider" onchange="AIChatModule._onProviderChange()">
        ${this._providers.map(p => `<option value="${p.id}" ${conn?.provider===p.id?'selected':''}>${p.name}</option>`).join('')}
      </select></div>
      <div class="field"><label class="field__label">Base URL</label><input class="input" id="cBase" value="${conn?.base_url||''}"></div>
      <div class="field"><label class="field__label">API Key（加密保存）</label><input class="input" type="password" id="cKey" placeholder="${conn?'已保存（留空不改）':'sk-...'}"></div>
      <div class="field"><label class="field__label">模型</label><input class="input" id="cModel" value="${conn?.model||''}"></div>
      <div class="grid grid-2">
        <div class="field"><label class="field__label">Temperature</label><input class="input" type="number" step="0.1" id="cTemp" value="${conn?.temperature??0.8}"></div>
        <div class="field"><label class="field__label">Max Tokens</label><input class="input" type="number" id="cMaxTokens" value="${conn?.max_tokens||2048}"></div>
      </div>
      <div class="ai-disclaimer">密钥优先保存在后端。纯前端模式使用 Web Crypto 加密，存在被本地工具读取的风险。</div>
      <div class="flex gap-3 mt-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="AIChatModule._saveConn('${connId||''}')">保存</button>
      </div>
    `);
    if (!conn) this._onProviderChange();
  },

  _onProviderChange() {
    const pid = document.getElementById('cProvider').value;
    const p = this._providers.find(x => x.id === pid);
    if (p) {
      if (!document.getElementById('cBase').value) document.getElementById('cBase').value = p.base_url;
      if (!document.getElementById('cModel').value) document.getElementById('cModel').value = p.model;
    }
  },

  async _saveConn(connId) {
    const name = document.getElementById('cName').value.trim();
    if (!name) { UI.toast('请输入名称','error'); return; }
    const key = document.getElementById('cKey').value;
    const data = {
      name,
      provider: document.getElementById('cProvider').value,
      base_url: document.getElementById('cBase').value,
      model: document.getElementById('cModel').value,
      temperature: parseFloat(document.getElementById('cTemp').value),
      max_tokens: parseInt(document.getElementById('cMaxTokens').value),
    };
    // 加密 key（如有输入）
    if (key) {
      data.api_key_encrypted = await this._encryptKey(key);
    }
    if (connId) data.id = connId;
    await DB.save('ai_connections', data);
    UI.closeModal();
    UI.toast('连接已保存','success');
    this.showConnections();
  },

  async _encryptKey(key) {
    // 简单的 Web Crypto 加密（AES-GCM）
    try {
      const enc = new TextEncoder();
      const data = enc.encode(key);
      // 使用固定派生密钥（仅为 obfuscation，非真正安全）
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode('zhaozhao-station-key'), 'PBKDF2', false, ['deriveKey']);
      const cryptoKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode('salt-zhaozhao'), iterations: 10000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
      return btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
    } catch(e) {
      return btoa(key);  // fallback
    }
  },

  async _decryptKey(encStr) {
    try {
      const raw = atob(encStr);
      const bytes = new Uint8Array([...raw].map(c=>c.charCodeAt(0)));
      const iv = bytes.slice(0, 12);
      const data = bytes.slice(12);
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode('zhaozhao-station-key'), 'PBKDF2', false, ['deriveKey']);
      const cryptoKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode('salt-zhaozhao'), iterations: 10000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
      return new TextDecoder().decode(decrypted);
    } catch(e) {
      return atob(encStr);
    }
  },

  async _editConn(id) { this._addConn(id); },

  async _delConn(id) {
    if (!await UI.confirm('删除这个连接？')) return;
    await DB.hardDelete('ai_connections', id);
    this.showConnections();
  },

  async _testConn(id) {
    const c = await DB.get('ai_connections', id);
    if (!c) return;
    UI.toast('测试中…','info');
    try {
      const key = c.api_key_encrypted ? await this._decryptKey(c.api_key_encrypted) : '';
      const result = await this._callAPI(c, [{ role: 'user', content: '你好，请回复"连接成功"' }], key);
      UI.toast('连接成功 ✓','success');
      console.log('测试响应:', result);
    } catch(err) {
      UI.toast('连接失败：'+err.message,'error',4000);
    }
  },

  // ============ 多供应商 API 调用（含流式）============
  async _callAPI(conn, messages, apiKey, opts = {}) {
    if (opts.stream) {
      return this._callAPIStream(conn, messages, apiKey, opts);
    }
    const provider = conn.provider;
    const base = conn.base_url;
    const model = conn.model;

    if (provider === 'anthropic') {
      const sysMsg = messages.find(m => m.role === 'system');
      const userMsgs = messages.filter(m => m.role !== 'system');
      const resp = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model, max_tokens: conn.max_tokens||2048, temperature: conn.temperature||0.8,
          system: sysMsg?.content || '',
          messages: userMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!resp.ok) throw new Error(this._explainError(resp.status, await resp.text()));
      const data = await resp.json();
      return data.content?.[0]?.text || '';
    }

    if (provider === 'gemini') {
      const contents = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const sysMsg = messages.find(m => m.role === 'system');
      const url = `${base}/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          contents,
          systemInstruction: sysMsg ? { parts: [{ text: sysMsg.content }] } : undefined,
          generationConfig: { temperature: conn.temperature||0.8, maxOutputTokens: conn.max_tokens||2048 },
        }),
      });
      if (!resp.ok) throw new Error(this._explainError(resp.status, await resp.text()));
      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // OpenAI-compatible
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model, messages, temperature: conn.temperature||0.8, max_tokens: conn.max_tokens||2048,
        stream: false,
      }),
    });
    if (!resp.ok) throw new Error(this._explainError(resp.status, await resp.text()));
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  },

  // ============ 流式 API ============
  async _callAPIStream(conn, messages, apiKey, opts = {}) {
    const { onChunk, onDone, onError } = opts;
    this._abortController = new AbortController();
    const signal = this._abortController.signal;
    try {
      if (conn.provider === 'anthropic') {
        return await this._streamAnthropic(conn, messages, apiKey, signal, opts);
      }
      if (conn.provider === 'gemini') {
        return await this._streamGemini(conn, messages, apiKey, signal, opts);
      }
      return await this._streamOpenAI(conn, messages, apiKey, signal, opts);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (onDone) onDone(opts._accumulated || '');
        return opts._accumulated || '';
      }
      if (onError) onError(err);
      throw err;
    } finally {
      this._abortController = null;
    }
  },

  async _streamOpenAI(conn, messages, apiKey, signal, opts) {
    const { onChunk, onDone } = opts;
    const resp = await fetch(`${conn.base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: conn.model, messages, temperature: conn.temperature||0.8, max_tokens: conn.max_tokens||2048, stream: true }),
      signal,
    });
    if (!resp.ok) throw new Error(this._explainError(resp.status, await resp.text()));
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '', fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            opts._accumulated = fullText;
            if (onChunk) onChunk(delta, fullText);
          }
        } catch (e) { /* ignore */ }
      }
    }
    if (onDone) onDone(fullText);
    return fullText;
  },

  async _streamAnthropic(conn, messages, apiKey, signal, opts) {
    const { onChunk, onDone } = opts;
    const sysMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');
    const resp = await fetch(`${conn.base_url}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: conn.model, max_tokens: conn.max_tokens||2048, temperature: conn.temperature||0.8,
        system: sysMsg?.content || '',
        messages: userMsgs.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      }),
      signal,
    });
    if (!resp.ok) throw new Error(this._explainError(resp.status, await resp.text()));
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '', fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
            opts._accumulated = fullText;
            if (onChunk) onChunk(parsed.delta.text, fullText);
          }
        } catch (e) { /* ignore */ }
      }
    }
    if (onDone) onDone(fullText);
    return fullText;
  },

  async _streamGemini(conn, messages, apiKey, signal, opts) {
    const { onChunk, onDone } = opts;
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const sysMsg = messages.find(m => m.role === 'system');
    const url = `${conn.base_url}/v1beta/models/${conn.model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        contents,
        systemInstruction: sysMsg ? { parts: [{ text: sysMsg.content }] } : undefined,
        generationConfig: { temperature: conn.temperature||0.8, maxOutputTokens: conn.max_tokens||2048 },
      }),
      signal,
    });
    if (!resp.ok) throw new Error(this._explainError(resp.status, await resp.text()));
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '', fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            fullText += text;
            opts._accumulated = fullText;
            if (onChunk) onChunk(text, fullText);
          }
        } catch (e) { /* ignore */ }
      }
    }
    if (onDone) onDone(fullText);
    return fullText;
  },

  _stopGeneration() {
    if (this._abortController) {
      this._abortController.abort();
      UI.toast('已停止生成', 'info', 1500);
    }
  },

  _explainError(status, err) {
    const map = {
      401: 'API Key 无效或未授权（401）',
      403: '访问被禁止（403），可能需要配置 Relay',
      404: '接口地址或模型不存在（404）',
      405: '请求方法不允许（405）',
      429: '请求过多或额度不足（429）',
    };
    let msg = map[status] || `HTTP ${status}`;
    if (err.includes('CORS') || err.includes('Failed to fetch')) {
      msg += '。可能是浏览器 CORS 限制，需配置安全后端 Relay。';
    }
    return msg;
  },

  // 删除对话（二次确认 + 软删除，连同其下所有消息）
  async _confirmDelConv(convId, title) {
    // 第一次确认
    const ok1 = await UI.confirm(
      `确定要删除对话「${title}」吗？<br><br>将同时删除该对话下的所有消息。此操作不可撤销。`,
      { title: '删除对话', okText: '继续删除' }
    );
    if (!ok1) return;

    // 第二次确认（防止误操作）
    const ok2 = await UI.confirm(
      `再次确认：真的要永久删除「${title}」吗？<br><br>建议先到「设置 → 数据备份」导出 JSON 备份。`,
      { title: '最后确认', okText: '确认删除' }
    );
    if (!ok2) return;

    // 执行删除：软删除对话 + 硬删除其下消息
    const conv = await DB.get('ai_conversations', convId);
    if (conv) {
      conv.deleted_at = nowISO();
      await DB.save('ai_conversations', conv);
    }
    const msgs = (await DB.list('ai_messages')).filter(m => !m.deleted_at && m.conversation_id === convId);
    for (const m of msgs) {
      await DB.hardDelete('ai_messages', m.id);
    }
    // 删除书签中对应该对话的引用
    const bks = (await DB.list('bookmarks')).filter(b => b.conversation_id === convId);
    for (const b of bks) await DB.hardDelete('bookmarks', b.id);

    await DB.log('ai_conversation_deleted', { id: convId, title, message_count: msgs.length });
    UI.toast(`已删除「${title}」（${msgs.length} 条消息）`, 'success');
    this.render();
  },

  // ============ 聊天 ============
  async newChat() {
    const connections = (await DB.list('ai_connections')).filter(c => !c.deleted_at);
    const resources = (await DB.list('ai_resources')).filter(r => !r.deleted_at);
    if (connections.length === 0) {
      UI.toast('请先配置 API 连接','error');
      this.showConnections();
      return;
    }
    UI.modal('新建对话', `
      <div class="field"><label class="field__label">对话标题</label><input class="input" id="chatTitle" placeholder="给对话起个名字"></div>
      <div class="field"><label class="field__label">API 连接</label><select class="select" id="chatConn">${connections.map(c=>`<option value="${c.id}">${c.name} (${c.provider})</option>`).join('')}</select></div>
      <div class="field"><label class="field__label">对方角色卡</label><select class="select" id="chatChar"><option value="">不使用</option>${resources.filter(r=>r.kind==='character').map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
      <div class="field"><label class="field__label">我的角色卡</label><select class="select" id="chatPersona"><option value="">不使用</option>${resources.filter(r=>r.kind==='persona').map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
      <div class="field"><label class="field__label">预设</label><select class="select" id="chatPreset"><option value="">不使用</option>${resources.filter(r=>r.kind==='preset').map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
      <div class="field"><label class="field__label">世界书（可多选）</label><select class="select" id="chatLore" multiple style="min-height:80px">${resources.filter(r=>r.kind==='lorebook').map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
      <div class="field"><label class="field__label">手工长记忆（可多选）</label><select class="select" id="chatMem" multiple style="min-height:80px">${resources.filter(r=>r.kind==='longMemory').map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="AIChatModule._createChat()">创建</button>
      </div>
    `);
  },

  async _createChat() {
    const title = document.getElementById('chatTitle').value.trim() || '新对话';
    const connId = document.getElementById('chatConn').value;
    const charId = document.getElementById('chatChar').value;
    const personaId = document.getElementById('chatPersona').value;
    const presetId = document.getElementById('chatPreset').value;
    const loreIds = [...document.getElementById('chatLore').selectedOptions].map(o=>o.value);
    const memIds = [...document.getElementById('chatMem').selectedOptions].map(o=>o.value);
    const conv = await DB.save('ai_conversations', {
      title, connection_id: connId,
      character_id: charId, persona_id: personaId, preset_id: presetId,
      lorebook_ids: loreIds, memory_ids: memIds,
    });
    UI.closeModal();
    this.openChat(conv.id);
  },

  async openChat(convId) {
    const conv = await DB.get('ai_conversations', convId);
    if (!conv) return;
    this._currentConvId = convId;
    const messages = (await DB.list('ai_messages')).filter(m => !m.deleted_at && m.conversation_id === convId && !m.branch_archived);
    const conn = await DB.get('ai_connections', conv.connection_id);
    const html = `
      <div class="page">
        <div class="flex justify-between items-center mb-4">
          <div class="page__title" style="margin:0">💬 ${conv.title}</div>
          <button class="btn btn--sm" onclick="App.navigate('ai-chat')">返回</button>
        </div>

        <!-- 工具栏 -->
        <div class="chat-toolbar flex gap-2 mb-3 flex-wrap">
          <div class="card--blur" style="padding:6px 12px;border-radius:999px">
            <span class="text-faint text-xs">连接: ${conn?.name||'-'} · 模型: ${conn?.model||'-'}</span>
          </div>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._showSearch('${convId}')">🔍 搜索</button>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._showBranchTree('${convId}')">🌿 分支</button>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._showBookmarks('${convId}')">🔖 收藏</button>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._toggleMultiSelect()">☑️ 多选</button>
          <button class="btn btn--sm btn--ghost" onclick="AIChatModule._previewContext('${convId}')">👁️ 预览</button>
        </div>

        <div class="card" style="min-height:400px;display:flex;flex-direction:column">
          <div id="chatMessages" style="flex:1;overflow-y:auto;max-height:50vh;margin-bottom:12px">
            ${messages.length === 0 ? '<div class="text-center text-faint" style="padding:40px">开始对话吧 💬</div>' : messages.sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||'')).map(m => this._renderMsg(m)).join('')}
          </div>
          <div class="chat-input-bar">
            <div class="chat-input-wrap">
              <textarea class="input chat-input" id="chatInput" placeholder="输入消息…（回车换行，Shift+回车发送）" rows="2" style="resize:none;min-height:60px;max-height:160px;font-family:inherit;font-size:15px;line-height:1.5"></textarea>
              <button class="btn btn--primary chat-send-btn" onclick="AIChatModule._sendMsg('${convId}')">发送</button>
            </div>
          </div>
        </div>

        <!-- 多选操作栏 -->
        <div id="multiSelectBar" class="multi-select-bar hidden">
          <div class="flex gap-2 justify-center">
            <span class="text-sm" id="selectCount">已选 0 条</span>
            <button class="btn btn--sm btn--rose" onclick="AIChatModule._bookmarkFragment('${convId}')">收藏片段</button>
            <button class="btn btn--sm btn--ghost" onclick="AIChatModule._exportFragment('${convId}')">导出片段</button>
            <button class="btn btn--sm" onclick="AIChatModule._toggleMultiSelect()">取消</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('pageContent').innerHTML = html;
    const cm = document.getElementById('chatMessages');
    if (cm) cm.scrollTop = cm.scrollHeight;
    // 多选模式恢复
    if (this._state.multiSelectMode) {
      const bar = document.getElementById('multiSelectBar');
      if (bar) bar.classList.remove('hidden');
      const countEl = document.getElementById('selectCount');
      if (countEl) countEl.textContent = `已选 ${this._state.selectedMsgIds.size} 条`;
    }

    // 输入框键盘事件：回车换行，Shift+回车发送，Ctrl/Cmd+回车发送
    const input = document.getElementById('chatInput');
    if (input && !input._boundEnter) {
      input._boundEnter = true;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          // 纯回车 = 换行（默认行为）
          return;
        }
        if (e.key === 'Enter' && e.shiftKey && !e.isComposing) {
          // Shift+回车 = 发送
          e.preventDefault();
          this._sendMsg(convId);
        }
      });
    }
  },

  _renderMsg(m) {
    const isUser = m.role === 'user';
    const isError = m.status === 'error';
    return `
      <div data-msg-id="${m.id}" style="display:flex;justify-content:${isUser?'flex-end':'flex-start'};margin-bottom:8px">
        <div class="chat-msg chat-msg--${isUser?'user':'ai'} ${isError?'chat-msg--error':''}">
          ${this._escapeHtml(m.content)}
          ${!isUser && !isError ? '<div class="ai-badge" style="font-size:9px;margin-top:4px">AI 生成</div>' : ''}
          <div class="chat-msg__time">${m.created_at?.slice(11,16) || ''}</div>
          ${isError ? '<div class="text-xs" style="color:var(--color-danger)">发送失败</div>' : ''}
          <div class="chat-msg__actions">
            <span class="chat-msg__action" onclick="AIChatModule._copyMsg('${m.id}')">复制</span>
            ${isUser ? `<span class="chat-msg__action" onclick="AIChatModule._editMsg('${m.id}')">编辑</span>` : `<span class="chat-msg__action" onclick="AIChatModule._regen('${m.id}')">重说</span>`}
            <span class="chat-msg__action" onclick="AIChatModule._bookmark('${m.id}')">书签</span>
          </div>
        </div>
      </div>
    `;
  },

  _renderStreamingMsg(fullText) {
    return `
      <div class="chat-msg chat-msg--ai">
        ${this._escapeHtml(fullText)}<span class="streaming-cursor">▋</span>
        <div class="chat-msg__actions">
          <span class="chat-msg__action" onclick="AIChatModule._stopGeneration()">停止</span>
        </div>
      </div>
    `;
  },

  _escapeHtml(s) {
    return s?.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') || '';
  },

  async _sendMsg(convId) {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const conv = await DB.get('ai_conversations', convId);
    const conn = await DB.get('ai_connections', conv.connection_id);
    if (!conn) { UI.toast('连接不存在','error'); return; }

    // 保存用户消息
    const userMsg = await DB.save('ai_messages', {
      conversation_id: convId, role: 'user', content: text, status: 'sent',
    });

    const cm = document.getElementById('chatMessages');
    cm.innerHTML += this._renderMsg(userMsg);

    // 创建 AI 消息占位（流式更新）
    const placeholderId = 'ai-streaming-' + Date.now();
    cm.innerHTML += `
      <div id="${placeholderId}" style="display:flex;justify-content:flex-start;margin-bottom:8px">
        <div class="chat-msg chat-msg--ai">
          <span class="spinner" style="width:16px;height:16px;display:inline-block"></span>
          <div class="chat-msg__actions">
            <span class="chat-msg__action" onclick="AIChatModule._stopGeneration()">停止</span>
          </div>
        </div>
      </div>
    `;
    cm.scrollTop = cm.scrollHeight;

    // 构建上下文
    const apiKey = conn.api_key_encrypted ? await this._decryptKey(conn.api_key_encrypted) : '';
    const { messages } = await this._orchestrate(conv, text);

    try {
      const reply = await this._callAPI(conn, messages, apiKey, {
        stream: true,
        onChunk: (delta, fullText) => {
          const el = document.getElementById(placeholderId);
          if (el) el.innerHTML = this._renderStreamingMsg(fullText);
          cm.scrollTop = cm.scrollHeight;
        },
        onDone: async (fullText) => {
          const el = document.getElementById(placeholderId);
          if (el) el.remove();
          const aiMsg = await DB.save('ai_messages', {
            conversation_id: convId, role: 'assistant', content: fullText, status: 'complete',
          });
          cm.innerHTML += this._renderMsg(aiMsg);
          cm.scrollTop = cm.scrollHeight;
        },
      });
    } catch (err) {
      const el = document.getElementById(placeholderId);
      if (el) el.remove();
      UI.toast('发送失败：'+err.message,'error',5000);
      const errMsg = await DB.save('ai_messages', {
        conversation_id: convId, role: 'assistant', content: `[发送失败] ${err.message}`, status: 'error',
      });
      cm.innerHTML += this._renderMsg(errMsg);
    }
  },

  // ============ 提示词编排器 ============
  async _buildContext(conv, currentText) {
    const { messages } = await this._orchestrate(conv, currentText || '');
    return messages;
  },

  _getSafetyPrompt() {
    return '【基础安全与事实边界】\n' +
      '1. 所有角色口吻文字为象征性/创意文本，仅供自我探索与娱乐，不代表现实人物的真实想法。\n' +
      '2. 不得使用"对方一定在想你""命中注定"等确定性表达。\n' +
      '3. 不冒充现实人物，不伪造现实事件。\n' +
      '4. 涉及未成年角色的内容必须符合安全准则。\n' +
      '5. 用户标注为"绝不能被AI引用"的信息不得出现在任何形式中。';
  },

  async _orchestrate(conv, currentText, opts = {}) {
    const debug = { steps: [], matchedLorebook: [], macros: {}, warnings: [] };
    const parts = []; // { label, content, position, order }

    // Step 1: 基础安全与事实边界
    parts.push({ label: '基础安全与事实边界', content: this._getSafetyPrompt(), position: 'system', order: 0 });

    // 宏值
    const macros = await this._getMacroValues(conv);
    debug.macros = macros;

    // Step 2: 预设系统提示
    if (conv.preset_id) {
      const preset = await DB.get('ai_resources', conv.preset_id);
      if (preset) {
        const sp = preset.data.system_prompt || '';
        if (sp) {
          parts.push({ label: '预设系统提示', content: this._applyMacros(sp, macros), position: 'system', order: 1 });
        }
        const presetInstr = this._formatPresetFields(preset.data, macros);
        if (presetInstr) {
          parts.push({ label: '预设指令', content: presetInstr, position: 'system', order: 1.5 });
        }
      }
    }

    // Step 3: 对方角色卡
    if (conv.character_id) {
      const char = await DB.get('ai_resources', conv.character_id);
      if (char) {
        parts.push({ label: '对方角色卡', content: this._formatResource(char), position: 'system', order: 2 });
      }
    }

    // Step 4: 我的角色卡
    if (conv.persona_id) {
      const persona = await DB.get('ai_resources', conv.persona_id);
      if (persona) {
        parts.push({ label: '我的角色卡', content: this._formatResource(persona), position: 'system', order: 3 });
      }
    }

    // Step 5 & 6: 世界书（常驻 + 关键词触发）
    const lorebooks = await this._getLorebooks(conv.lorebook_ids || []);
    const alwaysOnEntries = [];
    for (const lb of lorebooks) {
      for (const e of (lb.data.entries || [])) {
        if (e.trigger_type === '常驻（always_active）' && e.enabled !== '停用') {
          alwaysOnEntries.push(e);
        }
      }
    }
    if (alwaysOnEntries.length > 0) {
      parts.push({
        label: '常驻世界书',
        content: alwaysOnEntries.map(e => `【${e.entry_title}】\n${e.entry_content || ''}`).join('\n\n'),
        position: 'system', order: 4,
      });
    }

    // 关键词匹配
    const recentText = await this._getRecentText(conv, 5);
    const matchContext = (currentText || '') + ' ' + recentText;
    const keywordEntries = this._matchLorebook(lorebooks, matchContext, alwaysOnEntries);
    debug.matchedLorebook = keywordEntries.map(e => e.entry_title);

    if (keywordEntries.length > 0) {
      const sysEntries = keywordEntries.filter(e => (e.insert_position || 'system') === 'system');
      const beforeEntries = keywordEntries.filter(e => e.insert_position === 'before_last');
      const afterEntries = keywordEntries.filter(e => e.insert_position === 'after_last');
      if (sysEntries.length) parts.push({ label: '关键词世界书', content: sysEntries.map(e => `【${e.entry_title}】\n${e.entry_content||''}`).join('\n\n'), position: 'system', order: 5 });
      if (beforeEntries.length) parts.push({ label: '关键词世界书(消息前)', content: beforeEntries.map(e => `【${e.entry_title}】\n${e.entry_content||''}`).join('\n\n'), position: 'before_last', order: 5.5 });
      if (afterEntries.length) parts.push({ label: '关键词世界书(消息后)', content: afterEntries.map(e => `【${e.entry_title}】\n${e.entry_content||''}`).join('\n\n'), position: 'after_last', order: 5.8 });
    }

    // Step 7: 手工长记忆
    const memories = await this._getActiveMemories(conv.memory_ids || []);
    if (memories.length > 0) {
      parts.push({ label: '手工长记忆', content: memories.map(m => this._formatMemory(m)).join('\n\n'), position: 'system', order: 6 });
    }

    // Step 8: 自动长记忆
    const autoMems = (await DB.list('ai_memories')).filter(m => !m.deleted_at && m.conversation_id === conv.id && !m.stale);
    if (autoMems.length > 0) {
      parts.push({ label: '自动长记忆', content: autoMems.map(m => `【${m.title||'记忆'}】${m.content||''}`).join('\n\n'), position: 'system', order: 7 });
    }

    // Step 9: 工作台摘要
    const summary = await this._buildSummary();
    if (summary) {
      parts.push({ label: '工作台摘要', content: summary, position: 'system', order: 8 });
    }

    // Step 10: AI 安全标注
    parts.push({ label: 'AI标注', content: '【重要】所有角色口吻文字为象征性/创意文本，仅供自我探索与娱乐，不代表现实人物的真实想法。不得使用"对方一定在想你""命中注定"等确定性表达。', position: 'system', order: 9 });

    // 自定义排序
    const customOrder = await this._getCustomPromptOrder(conv);
    if (customOrder) {
      parts.sort((a, b) => {
        const ia = customOrder.indexOf(a.label);
        const ib = customOrder.indexOf(b.label);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    } else {
      parts.sort((a, b) => a.order - b.order);
    }

    // 组装 messages
    const messages = [];
    const sysParts = parts.filter(p => p.position === 'system');
    if (sysParts.length > 0) {
      messages.push({ role: 'system', content: sysParts.map(p => `=== ${p.label} ===\n${p.content}`).join('\n\n') });
    }

    // 历史消息
    const history = await this._getHistory(conv, 20);
    history.forEach(m => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    // before_last 插入
    const beforeParts = parts.filter(p => p.position === 'before_last');
    if (beforeParts.length > 0 && messages.length > 0) {
      messages.splice(messages.length - 1, 0, { role: 'system', content: beforeParts.map(p => p.content).join('\n\n') });
    }

    // after_last 插入
    const afterParts = parts.filter(p => p.position === 'after_last');
    if (afterParts.length > 0) {
      messages.push({ role: 'system', content: afterParts.map(p => p.content).join('\n\n') });
    }

    // Step 11: 预设历史后指令
    if (conv.preset_id) {
      const preset = await DB.get('ai_resources', conv.preset_id);
      if (preset?.data?.post_history_prompt) {
        messages.push({ role: 'system', content: this._applyMacros(preset.data.post_history_prompt, macros) });
      }
    }

    debug.steps = parts.map(p => ({ step: p.label, tokens_est: Math.ceil((p.content||'').length / 4), position: p.position }));
    this._lastDebug = debug;
    return { messages, debug };
  },

  async _getMacroValues(conv) {
    const macros = {
      datetime: nowISO().slice(0, 16).replace('T', ' '),
      date: todayKey(),
      time: new Date().toTimeString().slice(0, 5),
      conversation_title: conv.title || '未命名对话',
      user_nickname: App.state.settings.user_nickname || '用户',
    };
    if (conv.character_id) {
      const char = await DB.get('ai_resources', conv.character_id);
      if (char) macros.character_name = char.data.name || char.data.nickname || '';
    }
    if (conv.persona_id) {
      const persona = await DB.get('ai_resources', conv.persona_id);
      if (persona) macros.user_name = persona.data.preferred_address || persona.data.name || '';
    }
    return macros;
  },

  _applyMacros(text, macros) {
    if (!text) return '';
    let result = text;
    for (const [key, value] of Object.entries(macros)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(regex, value || `[未定义:${key}]`);
    }
    // 清理未匹配的宏
    result = result.replace(/\{\{[^}]+\}\}/g, (m) => `[未知宏:${m}]`);
    return result;
  },

  _formatResource(resource) {
    const data = resource.data || {};
    const lines = [];
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'string' && value.trim()) {
        const label = this._getFieldLabel(resource.kind, key);
        lines.push(`${label}: ${value}`);
      }
    }
    return lines.join('\n');
  },

  _getFieldLabel(kind, key) {
    const schema = this._schemas[kind] || [];
    const field = schema.find(f => f.key === key);
    return field ? field.label : key;
  },

  _formatPresetFields(data, macros) {
    const skip = ['system_prompt', 'post_history_prompt', 'prompt_order'];
    const lines = [];
    for (const [key, value] of Object.entries(data)) {
      if (skip.includes(key) || !value || !String(value).trim()) continue;
      const label = this._getFieldLabel('preset', key);
      lines.push(`${label}: ${value}`);
    }
    return lines.join('\n');
  },

  _formatMemory(mem) {
    const d = mem.data || mem;
    const parts = [];
    if (d.title) parts.push(`标题: ${d.title}`);
    if (d.involved_parties) parts.push(`涉及: ${d.involved_parties}`);
    if (d.time_range) parts.push(`时间: ${d.time_range}`);
    if (d.facts) parts.push(`事实: ${d.facts}`);
    if (d.user_feelings) parts.push(`感受: ${d.user_feelings}`);
    if (d.relationship_changes) parts.push(`关系变化: ${d.relationship_changes}`);
    if (d.stable_prefs) parts.push(`稳定偏好: ${d.stable_prefs}`);
    if (d.unfulfilled_promises) parts.push(`未完成约定: ${d.unfulfilled_promises}`);
    return parts.join('\n');
  },

  async _getLorebooks(ids) {
    const result = [];
    for (const id of ids) {
      const lb = await DB.get('ai_resources', id);
      if (lb && !lb.deleted_at) result.push(lb);
    }
    return result;
  },

  _matchLorebook(lorebooks, context, excludeEntries = []) {
    const excludeTitles = new Set(excludeEntries.map(e => e.entry_title));
    const ctxLower = (context || '').toLowerCase();
    const matched = [];
    for (const lb of lorebooks) {
      for (const entry of (lb.data.entries || [])) {
        if (entry.trigger_type !== '关键词触发（keyword）') continue;
        if (entry.enabled === '停用') continue;
        if (excludeTitles.has(entry.entry_title)) continue;
        const keywords = (entry.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        const hit = keywords.some(kw => kw && ctxLower.includes(kw));
        if (hit) matched.push(entry);
      }
    }
    matched.sort((a, b) => (parseInt(b.priority) || 10) - (parseInt(a.priority) || 10));
    return matched;
  },

  async _getActiveMemories(ids) {
    const result = [];
    for (const id of ids) {
      const m = await DB.get('ai_resources', id);
      if (m && !m.deleted_at && m.data?.active !== '停用') result.push(m);
    }
    return result;
  },

  async _getHistory(conv, limit) {
    const all = (await DB.list('ai_messages'))
      .filter(m => !m.deleted_at && m.conversation_id === conv.id && !m.branch_archived)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return all.slice(-limit);
  },

  async _getRecentText(conv, count) {
    const history = await this._getHistory(conv, count);
    return history.map(m => m.content || '').join(' ');
  },

  async _getCustomPromptOrder(conv) {
    if (!conv.preset_id) return null;
    const preset = await DB.get('ai_resources', conv.preset_id);
    if (!preset?.data?.prompt_order) return null;
    const orderStr = preset.data.prompt_order.trim();
    if (!orderStr) return null;
    return orderStr.split(',').map(s => s.trim()).filter(Boolean);
  },

  async _previewContext(convId) {
    const conv = await DB.get('ai_conversations', convId);
    if (!conv) return;
    const { messages, debug } = await this._orchestrate(conv, '', { preview: true });
    UI.modal('本轮上下文预览', `
      <div class="context-preview">
        <div class="card--blur mb-3" style="padding:12px">
          <div class="font-bold mb-2">本轮启用条目</div>
          <details>
            <summary class="text-soft text-sm cursor-pointer">点击展开调试信息 (${debug.steps.length} 个部分)</summary>
            <div class="mt-2">
              ${debug.steps.map(s => `
                <div class="text-xs" style="padding:4px 0;border-bottom:1px solid var(--color-divider)">
                  <span class="badge" style="font-size:9px">${s.position}</span>
                  ${s.step} <span class="text-faint">~${s.tokens_est} tokens</span>
                </div>
              `).join('')}
              ${debug.matchedLorebook.length > 0 ? `
                <div class="mt-2 text-xs"><strong>命中世界书条目：</strong>${debug.matchedLorebook.join('、')}</div>
              ` : '<div class="mt-2 text-xs text-faint">无关键词命中</div>'}
            </div>
          </details>
        </div>
        <div class="text-soft text-sm mb-2">消息数组预览（密钥已隐藏）：</div>
        ${messages.map((m, i) => `
          <div class="list-item" style="padding:8px;flex-direction:column;align-items:flex-start">
            <div class="text-xs text-faint">[${i}] ${m.role}</div>
            <div class="text-sm" style="white-space:pre-wrap;max-height:120px;overflow-y:auto;width:100%">${this._escapeHtml((m.content||'').slice(0, 500))}${(m.content||'').length > 500 ? '...' : ''}</div>
          </div>
        `).join('')}
      </div>
    `);
  },

  async _buildSummary() {
    const s = App.state.settings;
    const parts = [];
    if (s.summary_任务) {
      const tasks = (await DB.list('tasks')).filter(t=>!t.deleted_at && t.date===todayKey());
      if (tasks.length) parts.push(`今日任务: ${tasks.length}个，完成${tasks.filter(t=>t.completed).length}个`);
    }
    if (s.summary_情绪) {
      const emos = (await DB.list('emotions')).filter(e=>!e.deleted_at && e.created_at?.startsWith(todayKey()));
      if (emos.length) parts.push(`今日情绪: ${emos.map(e=>e.emotion_type).join('、')}`);
    }
    if (s.summary_锻炼) {
      const ws = (await DB.list('workouts')).filter(w=>!w.deleted_at && w.date===todayKey());
      if (ws.length) parts.push(`今日锻炼: ${ws.length}次`);
    }
    return parts.join('；');
  },

  async _copyMsg(id) {
    const m = await DB.get('ai_messages', id);
    if (m) {
      navigator.clipboard?.writeText(m.content);
      UI.toast('已复制','success',1500);
    }
  },

  async _editMsg(id) {
    // 回溯编辑：停止生成 → 封存后续 → 创建分支记录 → 原文放回输入框
    this._stopGeneration();
    const m = await DB.get('ai_messages', id);
    if (!m) return;
    if (!await UI.confirm('编辑此消息会封存后续回复分支（可恢复）。继续？')) return;

    const all = (await DB.list('ai_messages')).filter(x => !x.deleted_at && x.conversation_id === m.conversation_id && !x.branch_archived).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const idx = all.findIndex(x => x.id === id);
    const archivedIds = [];
    for (let i = idx+1; i < all.length; i++) {
      all[i].branch_archived = true;
      all[i].archived_reason = 'edit-branch';
      all[i].archived_at = nowISO();
      await DB.save('ai_messages', all[i]);
      archivedIds.push(all[i].id);
    }
    if (archivedIds.length > 0) {
      await this._createBranchRecord(m.conversation_id, id, 'edit-branch', archivedIds);
      await this._markStaleMemories(m.conversation_id, archivedIds);
    }
    document.getElementById('chatInput').value = m.content;
    await DB.hardDelete('ai_messages', id);
    UI.toast('已放入输入框，后续已封存','info');
    this.openChat(m.conversation_id);
  },

  async _regen(id) {
    // 让他重说：停止生成 → 封存当前回复及后续 → 流式重新生成
    this._stopGeneration();
    const m = await DB.get('ai_messages', id);
    if (!m || m.role !== 'assistant') return;

    m.branch_archived = true;
    m.archived_reason = 'regen-branch';
    m.archived_at = nowISO();
    await DB.save('ai_messages', m);

    const all = (await DB.list('ai_messages')).filter(x => !x.deleted_at && x.conversation_id === m.conversation_id && !x.branch_archived).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const archivedIds = [m.id];
    for (const msg of all) {
      if (msg.created_at > m.created_at) {
        msg.branch_archived = true;
        msg.archived_reason = 'regen-branch';
        await DB.save('ai_messages', msg);
        archivedIds.push(msg.id);
      }
    }
    await this._createBranchRecord(m.conversation_id, m.id, 'regen-branch', archivedIds);
    await this._markStaleMemories(m.conversation_id, archivedIds);

    this.openChat(m.conversation_id);

    const conv = await DB.get('ai_conversations', m.conversation_id);
    const conn = await DB.get('ai_connections', conv.connection_id);
    const apiKey = conn.api_key_encrypted ? await this._decryptKey(conn.api_key_encrypted) : '';
    const { messages } = await this._orchestrate(conv, '');

    const cm = document.getElementById('chatMessages');
    const placeholderId = 'ai-regen-' + Date.now();
    if (cm) {
      cm.innerHTML += `<div id="${placeholderId}" style="display:flex;justify-content:flex-start;margin-bottom:8px"><div class="chat-msg chat-msg--ai"><span class="spinner" style="width:16px;height:16px;display:inline-block"></span><div class="chat-msg__actions"><span class="chat-msg__action" onclick="AIChatModule._stopGeneration()">停止</span></div></div></div>`;
      cm.scrollTop = cm.scrollHeight;
    }

    try {
      await this._callAPI(conn, messages, apiKey, {
        stream: true,
        onChunk: (delta, fullText) => {
          const el = document.getElementById(placeholderId);
          if (el) el.innerHTML = this._renderStreamingMsg(fullText);
          if (cm) cm.scrollTop = cm.scrollHeight;
        },
        onDone: async (fullText) => {
          const el = document.getElementById(placeholderId);
          if (el) el.remove();
          const aiMsg = await DB.save('ai_messages', { conversation_id: m.conversation_id, role: 'assistant', content: fullText, status: 'complete' });
          this.openChat(m.conversation_id);
        },
      });
    } catch (err) {
      UI.toast('重新生成失败：'+err.message,'error');
    }
  },

  // ============ 分支系统 ============
  async _createBranchRecord(convId, branchPointMsgId, reason, archivedMsgIds) {
    await DB.save('ai_branches', {
      conversation_id: convId,
      branch_point_message_id: branchPointMsgId,
      reason,
      archived_message_ids: archivedMsgIds,
      restored: false,
    });
  },

  async _markStaleMemories(convId, archivedMsgIds) {
    const memories = (await DB.list('ai_memories')).filter(m => !m.deleted_at && m.conversation_id === convId && !m.stale);
    for (const mem of memories) {
      if (mem.source_message_ids && mem.source_message_ids.some(id => archivedMsgIds.includes(id))) {
        mem.stale = true;
        mem.stale_reason = 'branch_archived';
        mem.stale_at = nowISO();
        await DB.save('ai_memories', mem);
      }
    }
  },

  async _showBranchTree(convId) {
    const branches = (await DB.list('ai_branches')).filter(b => !b.deleted_at && b.conversation_id === convId).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
    if (branches.length === 0) { UI.toast('没有分支历史','info'); return; }
    UI.modal('分支历史', `
      <div class="branch-tree">
        <p class="text-soft text-sm mb-3">被封存的分支可以恢复。恢复后当前活跃分支将被封存。</p>
        ${branches.map((b, i) => `
          <div class="card--blur" style="padding:12px;margin-bottom:8px">
            <div class="flex justify-between items-center">
              <div>
                <div class="font-bold text-sm">
                  分支 ${branches.length - i}
                  <span class="tag-chip" style="font-size:10px;padding:1px 6px">${b.reason === 'edit-branch' ? '回溯编辑' : b.reason === 'regen-branch' ? '重说' : '恢复'}</span>
                </div>
                <div class="text-faint text-xs">${b.created_at?.slice(0,16).replace('T',' ')||''}</div>
                <div class="text-faint text-xs">封存 ${b.archived_message_ids?.length||0} 条消息</div>
              </div>
              <button class="btn btn--sm btn--ghost" onclick="AIChatModule._restoreBranch('${b.id}')">恢复</button>
            </div>
          </div>
        `).join('')}
      </div>
    `);
  },

  async _restoreBranch(branchId) {
    const branch = await DB.get('ai_branches', branchId);
    if (!branch) return;
    if (!await UI.confirm('恢复此分支？当前活跃分支将被封存。')) return;
    const convId = branch.conversation_id;

    // 封存当前活跃
    const currentActive = (await DB.list('ai_messages')).filter(m => !m.deleted_at && m.conversation_id === convId && !m.branch_archived);
    const currentArchivedIds = [];
    for (const m of currentActive) {
      m.branch_archived = true;
      m.archived_reason = 'restore-other-branch';
      await DB.save('ai_messages', m);
      currentArchivedIds.push(m.id);
    }
    if (currentArchivedIds.length > 0) {
      await this._createBranchRecord(convId, currentActive[0]?.id || '', 'restore-other-branch', currentArchivedIds);
    }

    // 恢复目标分支
    for (const msgId of (branch.archived_message_ids || [])) {
      const msg = await DB.get('ai_messages', msgId);
      if (msg) {
        msg.branch_archived = false;
        msg.archived_reason = null;
        await DB.save('ai_messages', msg);
      }
    }
    branch.restored = true;
    branch.restored_at = nowISO();
    await DB.save('ai_branches', branch);

    UI.closeModal();
    UI.toast('分支已恢复','success');
    this.openChat(convId);
  },

  async _bookmark(id) {
    const m = await DB.get('ai_messages', id);
    if (!m) return;
    await DB.save('bookmarks', {
      source_type: 'ai_message', source_id: id,
      conversation_id: m.conversation_id,
      content: m.content, role: m.role,
    });
    UI.toast('已加入书签','success');
  },

  // ============ 搜索 ============
  _showSearch(convId) {
    UI.modal('搜索消息', `
      <div class="field"><label class="field__label">关键词</label><input class="input" id="searchKeyword" placeholder="搜索消息内容..."></div>
      <div class="grid grid-2">
        <div class="field"><label class="field__label">开始日期</label><input class="input" type="date" id="searchDateFrom"></div>
        <div class="field"><label class="field__label">结束日期</label><input class="input" type="date" id="searchDateTo"></div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="field__label">发言方</label><select class="select" id="searchRole"><option value="">全部</option><option value="user">我说的</option><option value="assistant">AI说的</option></select></div>
        <div class="field"><label class="field__label">是否收藏</label><select class="select" id="searchBookmarked"><option value="">全部</option><option value="yes">仅收藏</option></select></div>
      </div>
      <button class="btn btn--primary btn--block" onclick="AIChatModule._doSearch('${convId}')">搜索</button>
      <div id="searchResults" class="mt-3"></div>
    `);
  },

  async _doSearch(convId) {
    const keyword = document.getElementById('searchKeyword').value.trim().toLowerCase();
    const dateFrom = document.getElementById('searchDateFrom').value;
    const dateTo = document.getElementById('searchDateTo').value;
    const role = document.getElementById('searchRole').value;
    const bookmarkedOnly = document.getElementById('searchBookmarked').value === 'yes';

    let messages = (await DB.list('ai_messages')).filter(m => !m.deleted_at && m.conversation_id === convId);
    if (keyword) messages = messages.filter(m => (m.content||'').toLowerCase().includes(keyword));
    if (dateFrom) messages = messages.filter(m => (m.created_at||'') >= dateFrom);
    if (dateTo) messages = messages.filter(m => (m.created_at||'') <= dateTo + 'T23:59:59');
    if (role) messages = messages.filter(m => m.role === role);
    if (bookmarkedOnly) {
      const bookmarks = (await DB.list('bookmarks')).filter(b => !b.deleted_at && b.conversation_id === convId);
      const bookmarkedIds = new Set(bookmarks.map(b => b.source_id));
      messages = messages.filter(m => bookmarkedIds.has(m.id));
    }
    messages.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));

    const resultsEl = document.getElementById('searchResults');
    if (messages.length === 0) { resultsEl.innerHTML = '<p class="text-faint text-center">没有匹配结果</p>'; return; }
    resultsEl.innerHTML = `
      <div class="text-soft text-xs mb-2">找到 ${messages.length} 条结果</div>
      ${messages.map(m => `
        <div class="list-item" style="cursor:pointer;flex-direction:column;align-items:flex-start" onclick="AIChatModule._jumpToMsg('${convId}','${m.id}')">
          <div class="flex gap-2 w-full">
            <span class="tag-chip" style="font-size:10px;padding:1px 6px">${m.role === 'user' ? '我' : 'AI'}</span>
            <span class="text-faint text-xs">${m.created_at?.slice(0,16).replace('T',' ')||''}</span>
          </div>
          <div class="text-sm mt-1" style="white-space:pre-wrap">${this._highlightKeyword(m.content, keyword)}</div>
        </div>
      `).join('')}
    `;
  },

  _highlightKeyword(text, keyword) {
    if (!keyword) return this._escapeHtml(text);
    const escaped = this._escapeHtml(text);
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark style="background:var(--color-rose-soft);color:var(--color-primary);padding:0 2px;border-radius:2px">$1</mark>');
  },

  async _jumpToMsg(convId, msgId) {
    UI.closeModal();
    await this.openChat(convId);
    setTimeout(() => {
      const el = document.querySelector(`[data-msg-id="${msgId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'background 0.5s';
        el.style.background = 'var(--color-rose-soft)';
        setTimeout(() => { el.style.background = ''; }, 2000);
      }
    }, 300);
  },

  // ============ 多选收藏 ============
  _state: { multiSelectMode: false, selectedMsgIds: new Set() },

  _toggleMultiSelect() {
    this._state.multiSelectMode = !this._state.multiSelectMode;
    this._state.selectedMsgIds = new Set();
    const bar = document.getElementById('multiSelectBar');
    if (bar) bar.classList.toggle('hidden', !this._state.multiSelectMode);
    // 重新渲染消息列表
    const cm = document.getElementById('chatMessages');
    if (cm && this._currentConvId) {
      this.openChat(this._currentConvId);
    }
    UI.toast(this._state.multiSelectMode ? '多选模式已开启' : '多选模式已关闭', 'info', 1500);
  },

  _toggleSelectMsg(msgId) {
    if (this._state.selectedMsgIds.has(msgId)) {
      this._state.selectedMsgIds.delete(msgId);
    } else {
      this._state.selectedMsgIds.add(msgId);
    }
    const countEl = document.getElementById('selectCount');
    if (countEl) countEl.textContent = `已选 ${this._state.selectedMsgIds.size} 条`;
  },

  async _bookmarkFragment(convId) {
    const ids = [...this._state.selectedMsgIds];
    if (ids.length === 0) { UI.toast('请先选择消息','error'); return; }
    const msgs = [];
    for (const id of ids) { const m = await DB.get('ai_messages', id); if (m) msgs.push(m); }
    msgs.sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||''));
    UI.modal('收藏片段', `
      <div class="field"><label class="field__label">片段标题</label><input class="input" id="fragTitle" placeholder="给这个片段起个名字"></div>
      <div class="field"><label class="field__label">备注</label><textarea class="textarea" id="fragNote" placeholder="为什么收藏这段对话..."></textarea></div>
      <div class="card--blur mb-3" style="padding:10px">
        <div class="text-soft text-xs mb-1">预览（${msgs.length} 条消息）：</div>
        ${msgs.map(m => `<div class="text-xs" style="margin:4px 0"><strong>${m.role === 'user' ? '我' : 'AI'}:</strong> ${this._escapeHtml((m.content||'').slice(0, 80))}${(m.content||'').length > 80 ? '...' : ''}</div>`).join('')}
      </div>
      <div class="flex gap-3" style="justify-content:flex-end">
        <button class="btn" onclick="UI.closeModal()">取消</button>
        <button class="btn btn--primary" onclick="AIChatModule._saveFragment('${convId}')">收藏</button>
      </div>
    `);
  },

  async _saveFragment(convId) {
    const title = document.getElementById('fragTitle').value.trim() || `片段-${todayKey()}`;
    const note = document.getElementById('fragNote').value.trim();
    const ids = [...this._state.selectedMsgIds];
    const msgs = [];
    for (const id of ids) { const m = await DB.get('ai_messages', id); if (m) msgs.push(m); }
    msgs.sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||''));
    await DB.save('bookmarks', {
      source_type: 'ai_fragment', conversation_id: convId, title, note,
      message_ids: ids,
      messages: msgs.map(m => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at })),
    });
    UI.closeModal();
    UI.toast('片段已收藏','success');
    this._toggleMultiSelect();
  },

  async _exportFragment(convId) {
    const ids = [...this._state.selectedMsgIds];
    if (ids.length === 0) { UI.toast('请先选择消息','error'); return; }
    UI.modal('导出片段', `
      <div class="flex flex-col gap-2">
        <button class="btn btn--ghost btn--block" onclick="AIChatModule._doExportFragment('${convId}','txt')">导出为 TXT</button>
        <button class="btn btn--ghost btn--block" onclick="AIChatModule._doExportFragment('${convId}','json')">导出为 JSON</button>
        <button class="btn btn--ghost btn--block" onclick="AIChatModule._doExportFragment('${convId}','md')">导出为 Markdown</button>
      </div>
    `);
  },

  async _doExportFragment(convId, format) {
    const ids = [...this._state.selectedMsgIds];
    const msgs = [];
    for (const id of ids) { const m = await DB.get('ai_messages', id); if (m) msgs.push(m); }
    msgs.sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||''));
    const conv = await DB.get('ai_conversations', convId);
    let content = '', mime = '', ext = '';
    if (format === 'txt') {
      content = `对话片段 - ${conv?.title||''}\n导出时间: ${nowISO()}\n${'='.repeat(40)}\n\n`;
      content += msgs.map(m => `[${m.created_at?.slice(0,19).replace('T',' ')||''}] ${m.role === 'user' ? '我' : 'AI'}:\n${m.content}\n`).join('\n');
      mime = 'text/plain;charset=utf-8'; ext = 'txt';
    } else if (format === 'json') {
      content = JSON.stringify({ conversation: conv?.title, exported_at: nowISO(), messages: msgs.map(m => ({ role: m.role, content: m.content, created_at: m.created_at })) }, null, 2);
      mime = 'application/json;charset=utf-8'; ext = 'json';
    } else if (format === 'md') {
      content = `## 对话片段 - ${conv?.title||''}\n\n> 导出时间: ${nowISO()}\n\n`;
      content += msgs.map(m => `**${m.role === 'user' ? '我' : 'AI'}** (${m.created_at?.slice(0,19).replace('T',' ')||''}):\n\n${m.content}\n`).join('\n---\n\n');
      mime = 'text/markdown;charset=utf-8'; ext = 'md';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `对话片段-${todayKey()}.${ext}`; a.click();
    URL.revokeObjectURL(url);
    UI.closeModal();
    UI.toast('已导出','success');
  },

  // ============ 书签列表 ============
  async _showBookmarks(convId) {
    let bookmarks = (await DB.list('bookmarks')).filter(b => !b.deleted_at);
    if (convId) bookmarks = bookmarks.filter(b => b.conversation_id === convId);
    bookmarks.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
    UI.modal('收藏列表', `
      <div class="flex gap-2 mb-3">
        <button class="btn btn--sm ${!convId?'btn--primary':'btn--ghost'}" onclick="AIChatModule._showBookmarks()">全部</button>
        <button class="btn btn--sm ${convId?'btn--primary':'btn--ghost'}" onclick="AIChatModule._showBookmarks('${convId||''}')">本对话</button>
      </div>
      ${bookmarks.length === 0 ? UI.empty('🔖','还没有收藏') : bookmarks.map(b => `
        <div class="list-item" style="flex-direction:column;align-items:flex-start;cursor:pointer" onclick="AIChatModule._jumpToBookmark('${b.id}')">
          <div class="flex gap-2 w-full justify-between">
            <div class="font-bold text-sm">${b.source_type === 'ai_fragment' ? '📦 ' : '🔖 '}${b.title || (b.content||'').slice(0,30) || '未命名'}</div>
            <button class="btn btn--sm btn--ghost" onclick="event.stopPropagation();AIChatModule._delBookmark('${b.id}')">×</button>
          </div>
          ${b.source_type === 'ai_fragment'
            ? `<div class="text-faint text-xs">${b.messages?.length||0} 条消息 · ${b.created_at?.slice(0,10)||''}</div>${b.note?`<div class="text-soft text-xs mt-1">${this._escapeHtml(b.note)}</div>`:''}`
            : `<div class="text-sm mt-1" style="white-space:pre-wrap">${this._escapeHtml((b.content||'').slice(0,100))}${(b.content||'').length>100?'...':''}</div><div class="text-faint text-xs mt-1">${b.role === 'user' ? '我' : 'AI'} · ${b.created_at?.slice(0,16).replace('T',' ')||''}</div>`
          }
        </div>
      `).join('')}
    `);
  },

  async _jumpToBookmark(bookmarkId) {
    const b = await DB.get('bookmarks', bookmarkId);
    if (!b) return;
    UI.closeModal();
    if (b.source_type === 'ai_fragment') {
      if (b.conversation_id) {
        await this.openChat(b.conversation_id);
        const firstId = b.message_ids?.[0];
        if (firstId) setTimeout(() => this._jumpToMsg(b.conversation_id, firstId), 300);
      }
    } else {
      if (b.conversation_id && b.source_id) {
        await this.openChat(b.conversation_id);
        setTimeout(() => this._jumpToMsg(b.conversation_id, b.source_id), 300);
      }
    }
  },

  async _delBookmark(id) {
    if (!await UI.confirm('删除这个收藏？')) return;
    await DB.hardDelete('bookmarks', id);
    this._showBookmarks();
  },
};
