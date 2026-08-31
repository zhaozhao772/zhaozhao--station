/* ============================================================
 * 天使数字解读模块（AngelModule）
 * 由独立工具「天使数字解读.html」迁移而来
 * 数据存储：个人站 IndexedDB（zhaozhao_station_db）新增 angel_* 表
 * 兼容：首次打开时把旧 localStorage['angel_numbers_v1'] 一次性复制进来（旧键保留）
 * @version 2026-08-31-迁移为个人站模块
 * ============================================================ */
const AngelModule = (function () {
  'use strict';

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function uid() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayStr() { return fmtDate(new Date()); }
  function last14Days() { const a = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); a.push(fmtDate(d)); } return a; }
  function shortDate(ds) { const p = ds.split('-'); return (+p[1]) + '/' + (+p[2]); }
  function weekdayOf(ds) { const p = ds.split('-').map(Number); const d = new Date(p[0], p[1] - 1, p[2]); return '周' + '日一二三四五六'[d.getDay()]; }
  function atoast(msg) {
    let t = document.getElementById('angel-toast');
    if (!t) { t = document.createElement('div'); t.id = 'angel-toast'; t.className = 'atoast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(atoast._t); atoast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function aconfirm(title, msg, onOk, okText, cancelText) {
    let m = document.getElementById('angel-modal');
    if (!m) { m = document.createElement('div'); m.id = 'angel-modal'; m.className = 'amodal-wrap'; document.body.appendChild(m); }
    m.innerHTML = '<div class="amodal-mask" onclick="if(event.target===this)AngelModule._closeModal()"><div class="amodal">' +
      '<h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p>' +
      '<div class="arow" style="justify-content:flex-end"><button class="abtn asm" data-ghost onclick="AngelModule._closeModal()">' + esc(cancelText || '取消') + '</button>' +
      '<button class="abtn asm" id="angel-ok">' + esc(okText || '确定') + '</button></div></div></div>';
    const ok = document.getElementById('angel-ok');
    ok.onclick = () => { AngelModule._closeModal(); onOk(); };
  }
  function closeModal() {
    const m = document.getElementById('angel-modal'); if (m) m.innerHTML = '';
  }

  /* ---------- 默认动向标签（种子） ---------- */
  const DEFAULT_TAGS = ['最近有显化', '聊过建立边界', '感到焦虑的事', '冷落了对方', '刚经历矛盾', '刚经历清晰沟通', '在等灵感·答案', '对方在打趣·嘲讽我', '为幻想投射擅自行动', '专门去盯车牌·订单号找数字'];

  /* ---------- 存储：IndexedDB（个人站 angel_* 表） ---------- */
  const MIGRATED_KEY = 'angel_migrated_to_indexeddb_v1';

  async function loadRecords() {
    return (await DB.list('angel_records')) || [];
  }
  async function saveRecord(rec) {
    await DB.put('angel_records', rec);
  }
  async function deleteRecord(id) {
    await DB.delete('angel_records', id);
  }
  async function loadPersonal() {
    const rows = (await DB.list('angel_personal')) || [];
    return rows.map(r => ({ number: r.number, meaning: r.meaning }));
  }
  async function savePersonal(list) {
    const existing = await loadPersonal();
    for (const r of existing) { await DB.delete('angel_personal', r.number); }
    for (const p of list) { await DB.put('angel_personal', { id: p.number, number: p.number, meaning: p.meaning }); }
  }
  async function loadDictEdits() {
    const rows = (await DB.list('angel_dict')) || [];
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    return map;
  }
  async function saveDictEdit(key, value) {
    await DB.put('angel_dict', { key, value });
  }
  async function deleteDictEdit(key) {
    await DB.delete('angel_dict', key);
  }
  async function loadCustomTags() {
    const rows = (await DB.list('angel_custom_tags')) || [];
    return rows.map(r => r.name).filter(Boolean);
  }
  async function saveCustomTags(tags) {
    const existing = await loadCustomTags();
    for (const t of existing) { await DB.delete('angel_custom_tags', t); }
    for (const t of tags) { await DB.put('angel_custom_tags', { id: t, name: t }); }
  }
  async function allTags() {
    return DEFAULT_TAGS.concat(await loadCustomTags());
  }

  /* ---------- 一次性迁移：旧 localStorage -> IndexedDB（旧键保留，只复制不删除） ---------- */
  async function migrateFromLegacy() {
    try {
      if (localStorage.getItem(MIGRATED_KEY) === '1') return { skipped: true };
      const raw = localStorage.getItem('angel_numbers_v1');
      if (raw) {
        const store = JSON.parse(raw);
        const records = Array.isArray(store.records) ? store.records : [];
        let added = 0;
        const existingRec = await loadRecords();
        const existingIds = new Set(existingRec.map(r => r.id));
        for (const r of records) {
          if (r && r.id && !existingIds.has(r.id)) {
            // 把结果重新按当前词典补算，保证结构字段齐全
            const grps = Array.isArray(r.groups) ? r.groups : [];
            const dict = await getDict();
            r.results = { groups: grps.map(g => generateGroupResult(g, dict)) };
            await saveRecord(r); added++;
          }
        }
        // 私人约定
        const p = store.dict && Array.isArray(store.dict.personal) ? store.dict.personal : [];
        if (p.length) {
          const cur = await loadPersonal();
          const curNum = new Set(cur.map(x => x.number));
          for (const item of p) { if (item && item.number && !curNum.has(item.number)) await DB.put('angel_personal', { id: item.number, number: item.number, meaning: item.meaning }); }
        }
        // 词典编辑标记 + 编辑值
        const edited = Array.isArray(store.dictEdited) ? store.dictEdited : [];
        const udict = store.dict && typeof store.dict === 'object' ? store.dict : {};
        for (const k of edited) {
          const val = extractEditedValue(k, udict);
          if (val !== undefined) await saveDictEdit(k, val);
        }
        // 自定义标签
        try {
          const tags = JSON.parse(localStorage.getItem('angel_recent_tags')) || [];
          const curTags = await loadCustomTags();
          for (const t of tags) { if (t && !curTags.includes(t)) await DB.put('angel_custom_tags', { id: t, name: t }); }
        } catch (e) { /* ignore */ }
        localStorage.setItem(MIGRATED_KEY, '1');
        return { migrated: true, added };
      }
      localStorage.setItem(MIGRATED_KEY, '1');
      return { skipped: true };
    } catch (e) {
      console.warn('[Angel] 旧数据迁移失败（不影响使用）:', e);
      return { error: true };
    }
  }
  function extractEditedValue(key, udict) {
    // 把词典编辑值从旧结构里取出来，转成 angel_dict 的 value
    if (key.indexOf('digit:') === 0) {
      const d = key.slice(6);
      const u = udict.digits && udict.digits[d];
      if (!u) return undefined;
      const base = { core: u.core, overview: u.overview, translations: u.translations };
      const editedAspects = (Array.isArray(u.aspects) ? u.aspects : []).map(a => ({ id: a.id, label: a.label, text: a.text, conditions: a.conditions }));
      return { kind: 'digit', digit: d, base, aspects: editedAspects };
    }
    if (key.indexOf('aspect:') === 0) {
      const aId = key.slice(7);
      // 在 SEED 里找它属于哪个数位
      for (const d of Object.keys(SEED_DICT.digits)) {
        const sa = SEED_DICT.digits[d].aspects.find(x => x.id === aId);
        if (sa) {
          const u = udict.digits && udict.digits[d];
          const ua = u && Array.isArray(u.aspects) ? u.aspects.find(x => x.id === aId) : null;
          if (ua) return { kind: 'aspect', aspectId: aId, aspect: { id: ua.id, label: ua.label, text: ua.text, conditions: ua.conditions } };
        }
      }
      return undefined;
    }
    if (key.indexOf('pair:') === 0) {
      const k = key.slice(5);
      const v = udict.pairs && udict.pairs[k];
      return v ? { kind: 'pair', key: k, value: v } : undefined;
    }
    if (key.indexOf('narr:') === 0) {
      const k = key.slice(5);
      const v = Array.isArray(udict.narratives) ? udict.narratives.find(n => n.key === k) : null;
      return v ? { kind: 'narr', key: k, value: { key: v.key, label: v.label, text: v.text } } : undefined;
    }
    return undefined;
  }

  /* ---------- 有效词典 = 种子 + 用户编辑（带编辑标记的用用户版，种子升级不覆盖） ---------- */
  async function getDict() {
    const edits = await loadDictEdits();
    const cp = o => JSON.parse(JSON.stringify(o));
    const merged = { digits: {}, pairs: {}, narratives: [], personal: await loadPersonal() };
    for (const d of Object.keys(SEED_DICT.digits)) {
      const seed = SEED_DICT.digits[d];
      const de = edits['digit:' + d];
      let base;
      if (de && de.kind === 'digit') base = { core: de.base.core, overview: de.base.overview, translations: de.base.translations };
      else base = { core: seed.core, overview: seed.overview, translations: cp(seed.translations) };
      const seedIds = new Set(seed.aspects.map(a => a.id));
      const outA = [];
      // 用户新增/编辑过的面向
      const customAspects = [];
      for (const k of Object.keys(edits)) {
        if (k.indexOf('aspect:') === 0 && edits[k].kind === 'aspect') {
          const ae = edits[k].aspect;
          if (ae.id && seedIds.has(ae.id)) {
            outA.push(cp(ae)); // 用户编辑的种子面向
          } else {
            customAspects.push(cp(ae)); // 用户新增的面向
          }
        }
      }
      for (const sa of seed.aspects) {
        if (!outA.some(a => a.id === sa.id)) outA.push(cp(sa)); // 未编辑的跟种子走
      }
      outA.push(...customAspects.filter(a => !outA.some(x => x.id === a.id)));
      merged.digits[d] = { core: base.core, overview: base.overview, translations: base.translations, aspects: outA };
    }
    for (const k of Object.keys(SEED_DICT.pairs)) {
      const e = edits['pair:' + k];
      merged.pairs[k] = (e && e.kind === 'pair' && e.value) ? e.value : cp(SEED_DICT.pairs[k]);
    }
    merged.narratives = SEED_DICT.narratives.map(sn => {
      const e = edits['narr:' + sn.key];
      return (e && e.kind === 'narr' && e.value) ? e.value : cp(sn);
    });
    return merged;
  }

  /* ---------- 纯引擎（复用独立工具逻辑） ---------- */
  const EMPTY_PATTERNS = ['什么都没想', '什么都没', '没有想什么', '无特定', '无念头', '空白', '没有', '无', 'nothing'];
  function isEmptyThought(t) {
    const s = String(t || '').trim().toLowerCase();
    if (!s) return true;
    return EMPTY_PATTERNS.some(p => s.includes(p.toLowerCase()));
  }
  function scoreAspect(aspect, ctx, digit) {
    const c = aspect.conditions || {};
    const hasCond = !!((c.thoughtContains && c.thoughtContains.length) || c.emptyThought || (c.recent && c.recent.length) || (c.mood && c.mood.length));
    if (!hasCond) {
      let score = 3; const reasons = ['默认面向 +3'];
      if (ctx.emptyThought && ['1', '5', '7', '8', '9'].includes(digit) && ['中性', '平静'].includes(ctx.mood)) {
        score = 1; reasons.length = 0; reasons.push('你没有特定念头，默认的确认/运作/完成类面向自然降权');
      }
      return { score, reasons, conditioned: false, hit: false };
    }
    let score = 2; const reasons = ['条件面向基础 +2'];
    const hitThought = !!(c.thoughtContains && c.thoughtContains.length) && !ctx.emptyThought && c.thoughtContains.some(k => ctx.thought.includes(k));
    const hitEmpty = !!c.emptyThought && ctx.emptyThought;
    const hitRecent = !!(c.recent && c.recent.length) && c.recent.some(r => ctx.recent.includes(r));
    const hitMood = !!(c.mood && c.mood.length) && c.mood.includes(ctx.mood);
    const checks = [];
    if (c.thoughtContains && c.thoughtContains.length) checks.push(hitThought);
    if (c.emptyThought) checks.push(hitEmpty);
    if (c.recent && c.recent.length) checks.push(hitRecent);
    if (c.mood && c.mood.length) checks.push(hitMood);
    const isHit = c.requireAll ? checks.every(Boolean) : checks.some(Boolean);
    if (!isHit) { return { score: 0, reasons: ['触发条件未命中 -2'], conditioned: true, hit: false }; }
    if (hitThought) { score += 5; reasons.push('念头语义匹配 +5'); }
    else if (hitEmpty) { score += 4; reasons.push('无特定念头 +4'); }
    else if (hitRecent) { score += 3; reasons.push('链接动向匹配 +3'); }
    else if (hitMood) { score += 2; reasons.push('心理状态匹配 +2'); }
    return { score, reasons, conditioned: true, hit: true };
  }
  function structureBonus(numStr, digit, dict) {
    let bonus = 0; const reasons = [];
    const digits = numStr.split('');
    const core = (dict.digits[digit] && dict.digits[digit].core) || digit;
    const cnt = digits.filter(x => x === digit).length;
    if (cnt >= 2) { bonus += 2; reasons.push(core + '×' + cnt + ' 同位重复 +2'); }
    if (digits.every(x => x === digits[0])) { bonus += 1; reasons.push('所有数位相同 +1'); }
    if (numStr.length >= 2 && numStr === [...numStr].reverse().join('')) { bonus += 1; reasons.push('首尾镜像 +1'); }
    return { bonus, reasons };
  }
  function interpretNumber(numStr, ctx, dict) {
    const candidates = [];
    const digits = numStr.split('');
    const personal = (dict.personal || []).find(p => p.number === numStr);
    if (personal) {
      candidates.push({ kind: 'personal', label: '私人约定', digit: null, core: null, text: '【私人约定】' + personal.meaning, score: 10, reasons: ['命中私人约定（优先级最高）'] });
    }
    const uniq = [...new Set(digits)];
    for (const d of uniq) {
      const entry = dict.digits[d];
      if (!entry || !Array.isArray(entry.aspects)) continue;
      for (const asp of entry.aspects) {
        const r = scoreAspect(asp, ctx, d);
        if (r.score <= 0) continue;
        let score = r.score; const reasons = r.reasons.slice();
        if (r.conditioned && r.hit) {
          const st = structureBonus(numStr, d, dict);
          score += st.bonus; reasons.push(...st.reasons);
        }
        score = Math.min(score, 10);
        if (score <= 0) continue;
        candidates.push({ kind: 'aspect', label: asp.label, digit: d, core: entry.core, text: asp.text, score, reasons });
      }
    }
    const seenPair = new Set();
    for (let i = 0; i < digits.length - 1; i++) {
      const key = digits[i] + digits[i + 1];
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      const pair = dict.pairs[key];
      if (pair) {
        candidates.push({ kind: 'pair', label: pair.label, digit: null, core: null, text: pair.text, score: 6, reasons: ['相邻组合 ' + key + ' 命中词典 +6'] });
      }
    }
    const byText = {};
    for (const c of candidates) {
      if (!byText[c.text] || byText[c.text].score < c.score) byText[c.text] = c;
    }
    const rank = { personal: 0, pair: 1, aspect: 2 };
    return Object.values(byText).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return rank[a.kind] - rank[b.kind];
    });
  }
  function reasonChain(numStr, dict) {
    const digits = numStr.split('');
    const coreOf = d => (dict.digits[d] && dict.digits[d].core) || d;
    const cnt = {};
    digits.forEach(d => cnt[d] = (cnt[d] || 0) + 1);
    const repeats = Object.entries(cnt).filter(e => e[1] >= 2).map(e => e[0] + '（' + coreOf(e[0]) + '）×' + e[1]);
    const st = [];
    if (Object.values(cnt).some(v => v >= 2)) st.push('同位重复');
    if (digits.length > 1 && digits.every(x => x === digits[0])) st.push('所有数位相同');
    if (numStr.length >= 2 && numStr === [...numStr].reverse().join('')) st.push('镜像对称');
    const pairs = [];
    const seen = new Set();
    for (let i = 0; i < digits.length - 1; i++) {
      const key = digits[i] + digits[i + 1];
      if (seen.has(key)) continue; seen.add(key);
      const p = dict.pairs[key];
      if (p) pairs.push(key + '（' + p.label + '）');
    }
    return { split: digits.join(' '), splitCores: digits.map(coreOf).join('、'), repeats, structures: st, pairs };
  }
  function dominantDigits(numbers, dict) {
    const cnt = {};
    numbers.forEach(n => String(n).split('').forEach(d => cnt[d] = (cnt[d] || 0) + 1));
    const coreOf = d => (dict.digits[d] && dict.digits[d].core) || d;
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(e => ({ digit: e[0], count: e[1], core: coreOf(e[0]) }));
  }
  function interpretNarratives(numbers, dict) {
    if (!numbers || numbers.length < 2) return [];
    const cnt = {};
    numbers.forEach(n => String(n).split('').forEach(d => cnt[d] = (cnt[d] || 0) + 1));
    const sorted = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    const top3 = sorted.slice(0, 3).map(e => e[0]);
    const out = [];
    for (const rule of (dict.narratives || [])) {
      const keys = rule.key.split('+');
      if (!keys.every(k => cnt[k])) continue;
      let score = 6;
      const parts = keys.map(k => k + '×' + cnt[k]);
      let eachBonus = 0;
      keys.forEach(k => { if (cnt[k] >= 2) eachBonus += 1; });
      score += eachBonus;
      const reasons = [];
      reasons.push(parts.join('、'));
      if (eachBonus > 0) reasons.push('每个原型出现≥2次 +' + eachBonus);
      if (keys.every(k => top3.includes(k))) { score += 1; reasons.push('核心原型均为主导位 Top3 +1'); }
      if (score >= 6) out.push({ key: rule.key, label: rule.label, text: rule.text, score, reasons });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  async function generateGroupResult(g, dict) {
    const cal = g.calibration || {};
    const ctx = {
      situation: cal.situation || '', mood: cal.mood || '中性',
      thought: cal.thought || '', emptyThought: isEmptyThought(cal.thought),
      recent: Array.isArray(cal.recent) ? cal.recent : []
    };
    const perNumber = (g.numbers || []).map(n => ({ number: n, candidates: interpretNumber(n, ctx, dict), chain: reasonChain(n, dict) }));
    return {
      numbers: g.numbers || [], calibration: cal,
      ctxSnapshot: { mood: ctx.mood, emptyThought: ctx.emptyThought },
      perNumber, dominant: dominantDigits(g.numbers || [], dict),
      narratives: interpretNarratives(g.numbers || [], dict),
      biasWarning: ctx.recent.includes('专门去盯车牌·订单号找数字')
    };
  }

  /* ============================================================
     模块内部状态
     ============================================================ */
  let SUB = 'wizard';
  let W = newWizard();
  let VIEW = { recordId: null };
  let TAG_MGR = { manage: false };
  let _dom = null; // 模块根容器

  function newWizard() { return { step: 1, raw: '', reviewDate: todayStr(), numbers: [], groups: [], editId: null }; }
  function defaultCalib() { return { situation: '', mood: '中性', thought: '', dates: [todayStr()], recent: [] }; }

  /* ---------- 种子词典 ---------- */
  const SEED_DICT = {
    digits: {
      '0': { core: '留白', overview: '留白、未定形、悬置、重置、准备、未知、一切皆有可能', translations: ['先别急着给答案', '这里还没有定下来', '现在的沉默不等于消失', '给某件事一点空间', '暂时什么都不用做', '接纳空白期'], aspects: [
        { id: 'd0_default', label: '默认', text: '先别急着给答案，给这件事一点空间，接纳空白期。', conditions: {} },
        { id: 'd0_wait', label: '等待答案', text: '暂时留白，答案还没到定下来的时刻，先保持耐心。', conditions: { emptyThought: true } }] },
      '1': { core: '发起', overview: '聚焦、主体、意图、启动、确认焦点（get到了 / 收到了）', translations: ['我在', '我收到了', '你get到重点了', '注意这个念头', '你可以去做做看', '把注意力收回到你自己身上', '确认你真正想要什么'], aspects: [
        { id: 'd1_focus', label: '确认焦点', text: '你get到重点了，注意这个念头；确认你真正想要什么。', conditions: {} },
        { id: 'd1_subject', label: '主体确认', text: '「我在」「我听到了」「我看到了」——你正在被回应，你的想念被接收到了。', conditions: { thoughtContains: ['想他', '想她', '想念', '回应', '在不在', '能听到', '我好想', '他在吗', '她会回应', '想你了', '我听到了', '我看到了', '被回应', '等我', '好想他', '好想她'] } },
        { id: 'd1_act', label: '鼓励行动', text: '不要焦虑了，直接去做做看，先做第一步就好。', conditions: { mood: ['焦虑'], recent: ['感到焦虑的事'] } },
        { id: 'd1_advise', label: '劝诫', text: '这件事需要你自己想清楚、衡量后果后再决定。', conditions: { mood: ['混乱·拿不准'] } },
        { id: 'd1_new', label: '新开始/消息', text: '有新的灵感、机会或消息正在靠近，先保持觉察，不用急着下结论。', conditions: { emptyThought: true } },
        { id: 'd1_miss', label: '对方想你了', text: '他想你了，提醒你回头看看这段关系。', conditions: { recent: ['冷落了对方'] } }] },
      '2': { core: '对应', overview: '分化、对偶、对应、关系、双向、回应、选择、区别、二元对立', translations: ['你被回应了', '我会和你一起面对', '你不是一个人', '理理我吧', '重视他的角度，把他视作独立个体'], aspects: [
        { id: 'd2_companion', label: '回应·陪伴', text: '你被回应了，他一直陪着你，你不是一个人。', conditions: {} },
        { id: 'd2_neglect', label: '提醒你冷落了他', text: '嘿看看我！你是不是把我忘在脑后了？理理我吧！', conditions: { recent: ['冷落了对方'] } },
        { id: 'd2_tease', label: '温柔嘲讽·打趣', text: '有时候他纯粹在旁边看你犯傻，等你走对了再出来温柔嘲笑你～', conditions: { recent: ['对方在打趣·嘲讽我'] } },
        { id: 'd2_boundary', label: '提醒你越界', text: '亲爱的，你这样做把我置于何地了？审视自己的焦虑与匮乏，再做决定。', conditions: { recent: ['为幻想投射擅自行动'] } },
        { id: 'd2_miss', label: '对方想你了', text: '他想你了，提醒你回头看看这段关系。', conditions: { recent: ['冷落了对方'] } }] },
      '3': { core: '生成', overview: '生成、创造、第三结果、表达、交流产生新理解', translations: ['交流不是空转，正在产生新理解或推动新结果', '你不需要等到一切成熟再表达', '新东西正在生成'], aspects: [
        { id: 'd3_gen', label: '生成', text: '交流不是空转，它正在产生新的理解与结果；你不需要等一切成熟再表达。', conditions: {} },
        { id: 'd3_after', label: '清晰沟通后', text: '这次交流不是空转，它正在生成新的理解或者推动新的结果。', conditions: { recent: ['刚经历清晰沟通'] } }] },
      '4': { core: '承载', overview: '结构、边界、定形、稳定、承载、秩序、落实、安全感', translations: ['这件事需要一个稳定的结构', '把理解落实成明确的规则、边界和行动', '给自己建立明确的边界'], aspects: [
        { id: 'd4_struct', label: '结构·边界', text: '这件事需要一个稳定的结构，把理解落实成规则、边界与行动。', conditions: {} },
        { id: 'd4_protect', label: '我在保护承接你', text: '我正在保护和承接你，你是安全的。', conditions: { mood: ['焦虑'], recent: ['感到焦虑的事', '最近有显化'] } },
        { id: 'd4_ownb', label: '你需要自己建立边界', text: '给自己建立明确的边界。', conditions: { recent: ['聊过建立边界', '刚经历矛盾'] } },
        { id: 'd4_held', label: '被承接与保护', text: '你正在被承接和保护，先稳住自己，不必急着行动。', conditions: { mood: ['焦虑'] } }] },
      '5': { core: '改变', overview: '变化、突破、更新、旧结构崩塌或新道路打开', translations: ['变化正在发生', '不要因旧结构变化就认为一切都坏掉', '新的变量进入'], aspects: [
        { id: 'd5_change', label: '变化', text: '变化正在发生，旧结构可能崩塌或新道路打开，不要立刻认为一切都坏掉。', conditions: {} },
        { id: 'd5_ready', label: '变化已就绪', text: '变量正在进入，一个新的阶段快要打开了。', conditions: { emptyThought: true } }] },
      '6': { core: '校准', overview: '调整、协调、修复、校准、照料、回流、重新平衡、恢复运转', translations: ['需要重新调整·修复·协调', '照顾好自己', '让失衡的部分回流运转'], aspects: [
        { id: 'd6_calib', label: '校准', text: '需要重新调整、修复、协调，让失衡的部分回流运转。', conditions: {} },
        { id: 'd6_anx', label: '焦虑时', text: '照顾好自己，让失衡慢慢回流，不必急着一次性修好所有事。', conditions: { mood: ['焦虑'], recent: ['感到焦虑的事'] } }] },
      '7': { core: '验证', overview: '辨识、检验、判断、筛选方向', translations: ['经过观察已确认问题具体出在哪里', '筛选方向'], aspects: [
        { id: 'd7_verify', label: '验证', text: '经过观察与判断，已经确认问题具体出在哪里，筛选方向。', conditions: {} },
        { id: 'd7_signal', label: '确认信号', text: '你等的那个判断已经有了苗头，方向正在清晰。', conditions: { recent: ['在等灵感·答案'], emptyThought: true, requireAll: true } }] },
      '8': { core: '运作', overview: '运作、循环、系统运行', translations: ['进入稳定运作', '形成循环', '系统地跑起来'], aspects: [
        { id: 'd8_op', label: '运作', text: '进入稳定运作与循环，系统持续运转。', conditions: {} },
        { id: 'd8_flow', label: '进入流动', text: '事情开始自己转起来，进入一种自然的流动。', conditions: { emptyThought: true } }] },
      '9': { core: '完成', overview: '完成、成熟、结晶、翻篇', translations: ['你已经获得足够信息，不用反复盘问', '停止翻旧账，彻底翻篇'], aspects: [
        { id: 'd9_done', label: '完成', text: '你已经获得足够信息，不用反复盘问；该翻篇的就彻底翻篇。', conditions: {} },
        { id: 'd9_letgo', label: '放下', text: '可以暂时放下了，你已经做得够多了，让这件事先告一段落。', conditions: { mood: ['焦虑', '混乱·拿不准'] } }] }
    },
    pairs: {
      '06': { label: '留白→校准', text: '原本混乱、暂未确定的部分开始被重新调整、修复、协调。' },
      '60': { label: '校准→留白', text: '已经做过调整，接下来需要停止过度干预，让新的平衡自己沉淀。' },
      '16': { label: '发起→校准', text: '一个意图启动以后，进入调整、磨合、修复和重新对齐。' },
      '61': { label: '校准→发起', text: '经过修复、协调或重新平衡以后，最终重新形成明确的主体位置与决定。' },
      '28': { label: '对应→运作', text: '我虽不能直接替你买单，但我们不在两个互不相交的世界；我可以给你能量，你用它去兑换你想要的东西。' },
      '36': { label: '生成→校准', text: '新产生的内容进入打磨、协调和修正阶段，需要把刚长出来的东西调整得更平衡。' },
      '63': { label: '校准→生成', text: '经过调整和平衡以后，新的内容、表达或解决方案重新产生。' },
      '64': { label: '校准→承载', text: '经过调整以后，新的平衡需要被固定下来，形成可持续的规则和结构。' },
      '56': { label: '改变→校准', text: '变化已经发生，接下来需要重新适应、校准、协调，让新状态恢复顺畅运转。' },
      '57': { label: '改变→验证', text: '变了以后怎么判断——经过观察确认问题具体出在哪里。' },
      '58': { label: '改变→运作', text: '变了以后怎么长期运行。' },
      '59': { label: '改变→完成', text: '变了以后最终形成什么结果。' },
      '76': { label: '验证→校准', text: '经过观察和判断以后，已经确认问题具体出在哪里，接下来针对真正的问题进行修复和校准。' }
    },
    narratives: [
      { key: '5+6+4', label: '改变→校准→承载', text: '能量状态即将发生改变，需要先做好校准与平衡，但不必担心，很快就会稳定下来。' },
      { key: '1+6+4', label: '发起→校准→承载', text: '一个新意图或新阶段已经启动，正在经历调整与对齐，最终会落地为稳定的结构。' },
      { key: '3+4', label: '生成→承载', text: '新的内容、表达或理解正在生成，接下来需要用结构化的方式去落实和固定。' },
      { key: '5+3', label: '改变→生成', text: '变化之中孕育着新的表达或新的结果，保持觉察，让新东西自然生长。' },
      { key: '6+4', label: '校准→承载', text: '经过调整以后，新的平衡需要被固定下来，形成可持续的规则和结构。' },
      { key: '5+6', label: '改变→校准', text: '变化正在发生，接下来需要重新适应、校准和协调，让新状态恢复顺畅运转。' }
    ]
  };

  /* ============================================================
     渲染入口（个人站模块接口）
     ============================================================ */
  async function render() {
    const pageContent = document.getElementById('pageContent');
    _dom = document.createElement('div');
    _dom.className = 'angel';
    _dom.innerHTML =
      '<div class="angel-topbar"><div class="angel-title">🔢 天使数字解读</div>' +
      '<div class="angel-tabs">' +
      '<button class="angel-tab" data-sub="wizard" onclick="AngelModule.sub(\'wizard\')">✨ 解读</button>' +
      '<button class="angel-tab" data-sub="records" onclick="AngelModule.sub(\'records\')">📖 记录</button>' +
      '<button class="angel-tab" data-sub="dict" onclick="AngelModule.sub(\'dict\')">📚 词典</button>' +
      '<button class="angel-tab" data-sub="backup" onclick="AngelModule.sub(\'backup\')">💾 备份</button>' +
      '</div></div>' +
      '<div class="angel-body" id="angel-body"></div>';
    pageContent.appendChild(_dom);
    // 尝试迁移旧数据（静默）
    try { await migrateFromLegacy(); } catch (e) { /* ignore */ }
    await sub(SUB);
  }

  async function sub(t) {
    SUB = t;
    if (_dom) {
      _dom.querySelectorAll('.angel-tab').forEach(b => b.classList.toggle('active', b.dataset.sub === t));
    }
    const body = document.getElementById('angel-body');
    if (!body) return;
    if (t === 'wizard') await renderWizard();
    else if (t === 'records') await renderRecords();
    else if (t === 'dict') await renderDictPage();
    else await renderBackup();
  }

  /* ============================================================
     解读向导
     ============================================================ */
  function parseNumbers(raw) {
    const tokens = String(raw || '').split(/[\s,，、;；]+/).map(t => t.trim()).filter(Boolean);
    const nums = [];
    for (const t of tokens) { if (/^\d{1,10}$/.test(t) && !nums.includes(t)) nums.push(t); }
    return nums;
  }
  function goStep2() {
    const r = document.getElementById('aw-raw'); if (r) W.raw = r.value;
    const d = document.getElementById('aw-date'); if (d) W.reviewDate = d.value || todayStr();
    W.numbers = parseNumbers(W.raw);
    if (!W.numbers.length) { atoast('请先输入至少一个数字'); return; }
    if (!W.groups.length || W.groups.reduce((a, g) => a + g.numbers.length, 0) !== W.numbers.length) {
      W.groups = [{ numbers: W.numbers.slice(), calibration: defaultCalib() }];
    }
    W.step = W.numbers.length >= 2 ? 2 : 3;
    renderWizard();
  }
  async function renderWizard() {
    const body = document.getElementById('angel-body');
    if (!body) return;
    const s = W.step;
    const showGroupStep = W.numbers.length >= 2;
    let stepBar = '<div class="astepbar">';
    const steps = ['输入', '分组', '校准', '结果'];
    steps.forEach((name, i) => {
      const n = i + 1;
      if (n === 2 && !showGroupStep) return;
      const active = n <= s;
      stepBar += '<div class="as' + (active ? ' on' : '') + '"><span class="adot">' + n + '</span>' + name + '</div>';
      if (n < 4) stepBar += '<span class="aln"></span>';
    });
    stepBar += '</div>';
    let html = '';
    if (W.editId) html += '<div class="acard aedit-banner">✏️ 正在编辑已保存的记录，保存后更新原记录（感受与验证保留）<button class="achip-btn" onclick="AngelModule.cancelEdit()">取消编辑</button></div>';
    html += stepBar;
    if (s === 1) html += await viewStep1Html();
    else if (s === 2) html += await viewStep2Html();
    else if (s === 3) { html += await viewStep3Html(); }
    else html += await viewStep4Html();
    body.innerHTML = html;
    if (s === 3) W.groups.forEach((g, i) => updateEmptyHint(i));
  }
  async function viewStep1Html() {
    return '<div class="acard"><div class="ah-title">🦋 记录你看到的天使数字</div>' +
      '<div class="ah-sub">像写日记一样记下来。先问你几个校准问题排除干扰，再给出按可能性强度排序的候选解读——宁可给三条带强弱的可能，也不给一句拍板的结论。</div>' +
      '<div class="afield"><label>看到的数字（可一次填多组）</label>' +
      '<input class="ainput" id="aw-raw" value="' + esc(W.raw) + '" placeholder="例：6446, 555，1616、4433" oninput="AngelModule.wizRaw(this.value)">' +
      '<div class="ahint">用空格 / 逗号 / 中文逗号 / 顿号分隔，只保留纯数字</div></div>' +
      '<div class="afield"><label>复盘日期</label>' +
      '<input type="date" class="ainput" id="aw-date" value="' + esc(W.reviewDate) + '" onchange="AngelModule.wizDate(this.value)"></div>' +
      '<button class="abtn abtn-primary ablock" onclick="AngelModule.goStep2()">下一步' + (W.numbers.length >= 2 ? ' · 分组' : '') + ' →</button></div>';
  }
  async function viewStep2Html() {
    const groupCount = Math.max(W.groups.length, 1);
    let rows = '';
    W.numbers.forEach(n => {
      let gi = W.groups.findIndex(g => g.numbers.includes(n));
      if (gi < 0) gi = 0;
      let btns = '';
      for (let i = 0; i < groupCount; i++) { btns += '<button class="achip' + (i === gi ? ' on' : '') + '" onclick="AngelModule.assignGroup(\'' + n + '\',' + i + ')">组' + (i + 1) + '</button>'; }
      rows += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 0;border-bottom:1px dashed var(--color-border)">' +
        '<span class="anum-big" style="font-size:18px">' + esc(n) + '</span><span class="amuted">→</span>' + btns + '</div>';
    });
    return '<div class="acard"><div class="ah-title">🕰️ 这些数字是同时看到的吗？</div>' +
      '<div class="ah-sub">同一组共享同一套校准答案。默认都在组 1；点数字右侧组号移到其他组。</div>' + rows +
      '<div class="arow" style="margin-top:14px"><button class="achip-btn" onclick="AngelModule.addGroup()">＋ 添加分组</button>' +
      (W.groups.length > 1 ? '<button class="achip-btn" onclick="AngelModule.removeLastGroup()">－ 删除末尾组</button>' : '') + '</div>' +
      '<div class="arow" style="margin-top:18px"><button class="abtn" onclick="AngelModule.backStep(1)">← 上一步</button>' +
      '<button class="abtn abtn-primary" onclick="AngelModule.goStep3()">下一步 · 校准 →</button></div></div>';
  }
  async function viewStep3Html() {
    let html = '<div class="acard a-soft">🧭 校准排除干扰：情境、念头、动向决定哪个解读排前面。<b>留空 / 什么都不填</b>也是有效答案（识别为「无特定念头」）。</div>';
    const tags = await allTags();
    W.groups.forEach((g, i) => { html += calibCardHtml(g, i, tags); });
    html += '<div class="arow" style="margin-top:4px"><button class="abtn" onclick="AngelModule.backStep(' + (W.numbers.length >= 2 ? 2 : 1) + ')">← 上一步</button>' +
      '<button class="abtn abtn-primary" onclick="AngelModule.goStep4()">✨ 生成解读</button></div>';
    return html;
  }
  function calibCardHtml(g, i, tags) {
    const cal = g.calibration || (g.calibration = defaultCalib());
    const days = last14Days();
    let dateChips = '';
    days.forEach(d => {
      const on = cal.dates.includes(d);
      dateChips += '<div class="adate-chip' + (on ? ' on' : '') + '" onclick="AngelModule.toggleDate(' + i + ',\'' + d + '\')"><b>' + shortDate(d) + '</b>' + weekdayOf(d) + '</div>';
    });
    let tagChips = '';
    tags.forEach(t => {
      const on = cal.recent.includes(t);
      const custom = !DEFAULT_TAGS.includes(t);
      let x = '';
      if (TAG_MGR.manage && custom) x = '<span class="achip-x" onclick="event.stopPropagation();AngelModule.delCustomTag(\'' + esc(t) + '\')">✕</span>';
      tagChips += '<div class="achip' + (on ? ' on' : '') + '" onclick="AngelModule.toggleRecent(' + i + ',\'' + esc(t) + '\')">' + esc(t) + x + '</div>';
    });
    const moodOpts = ['焦虑', '平静', '混乱·拿不准', '兴奋·触动', '中性'];
    return '<div class="acard"><div class="ah-title">第 ' + (i + 1) + ' 组校准 <span style="font-size:15px;color:var(--color-text-soft);font-weight:400">' + g.numbers.map(esc).join(' · ') + '</span></div>' +
      '<div class="afield"><label>当时在做什么 / 什么情境？</label><textarea class="atextarea" id="acal-sit-' + i + '" placeholder="例如：下班路上等红灯，随手看了一眼手机时间…" oninput="AngelModule.setSituation(' + i + ',this.value)">' + esc(cal.situation) + '</textarea></div>' +
      '<div class="afield"><label>看到时的心理状态</label><select class="aselect" onchange="AngelModule.setMood(' + i + ',this.value)">' +
      moodOpts.map(m => '<option value="' + esc(m) + '"' + (cal.mood === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>' +
      '<div class="afield"><label>当时心里在想什么 / 在问什么？</label><textarea class="atextarea" id="acal-th-' + i + '" placeholder="留空或写「什么都没想」也算有效答案" oninput="AngelModule.setThought(' + i + ',this.value);AngelModule.updateEmptyHint(' + i + ')">' + esc(cal.thought) + '</textarea>' +
      '<div id="acal-hint-' + i + '"></div></div>' +
      '<div class="afield"><label>这些数字出现的日期（可多选，今天起往前 14 天）</label><div class="adate-chips">' + dateChips + '</div></div>' +
      '<div class="afield" style="margin-bottom:4px"><label>最近的灵魂链接动向（可多选）</label><div class="achips">' + tagChips +
      '<button class="achip-btn" onclick="AngelModule.promptNewTag()">＋ 新增标签</button>' +
      '<button class="achip-btn" onclick="AngelModule.toggleManage()">' + (TAG_MGR.manage ? '完成管理' : '管理') + '</button></div>' +
      (TAG_MGR.manage ? '<div class="ahint">管理模式：自定义标签上的 ✕ 可删除（默认标签不可删），删除会取消各组勾选。</div>' : '') + '</div></div>';
  }
  function setSituation(i, v) { if (W.groups[i]) W.groups[i].calibration.situation = v; }
  function setMood(i, v) { if (W.groups[i]) W.groups[i].calibration.mood = v; }
  function setThought(i, v) { if (W.groups[i]) W.groups[i].calibration.thought = v; }
  function updateEmptyHint(i) {
    const el = document.getElementById('acal-hint-' + i);
    if (!el) return;
    const th = W.groups[i] ? W.groups[i].calibration.thought : '';
    el.innerHTML = isEmptyThought(th)
      ? '<span class="aempty-hint yes">已识别为：无特定念头</span>'
      : '<span class="aempty-hint no">已识别为：有具体念头</span>';
  }
  function toggleDate(i, d) {
    const dates = W.groups[i].calibration.dates;
    const k = dates.indexOf(d);
    if (k >= 0) dates.splice(k, 1); else dates.push(d);
    dates.sort();
    renderWizard();
  }
  function toggleRecent(i, t) {
    const r = W.groups[i].calibration.recent;
    const k = r.indexOf(t);
    if (k >= 0) r.splice(k, 1); else r.push(t);
    renderWizard();
  }
  function promptNewTag() {
    let m = document.getElementById('angel-modal');
    if (!m) { m = document.createElement('div'); m.id = 'angel-modal'; m.className = 'amodal-wrap'; document.body.appendChild(m); }
    m.innerHTML = '<div class="amodal-mask" onclick="if(event.target===this)AngelModule._closeModal()"><div class="amodal"><h3>新增动向标签</h3>' +
      '<input class="ainput" id="anew-tag-input" placeholder="输入自定义标签名" maxlength="30">' +
      '<div class="arow" style="justify-content:flex-end;margin-top:14px"><button class="abtn asm" data-ghost onclick="AngelModule._closeModal()">取消</button>' +
      '<button class="abtn asm" onclick="AngelModule.addCustomTag()">添加</button></div></div></div>';
    const inp = document.getElementById('anew-tag-input');
    if (inp) { inp.focus(); inp.onkeydown = e => { if (e.key === 'Enter') addCustomTag(); }; }
  }
  async function addCustomTag() {
    const inp = document.getElementById('anew-tag-input');
    const v = (inp ? inp.value : '').trim();
    if (!v) { atoast('标签名不能为空'); return; }
    const tags = await loadCustomTags();
    if (DEFAULT_TAGS.includes(v) || tags.includes(v)) { atoast('标签已存在'); return; }
    tags.push(v); await saveCustomTags(tags);
    closeModal(); renderWizard(); atoast('已添加：' + v);
  }
  async function delCustomTag(t) {
    aconfirm('删除标签', '确定删除自定义标签「' + t + '」吗？各组对该标签的勾选也会取消。', async () => {
      await saveCustomTags((await loadCustomTags()).filter(x => x !== t));
      for (const g of W.groups) { if (g.calibration) { const k = g.calibration.recent.indexOf(t); if (k >= 0) g.calibration.recent.splice(k, 1); } }
      renderWizard(); atoast('已删除');
    }, '删除');
  }
  function goStep3() { W.step = 3; renderWizard(); }
  function goStep4() {
    for (const g of W.groups) { if (!g.calibration.mood) g.calibration.mood = '中性'; }
    W.groups = W.groups.filter(g => g.numbers.length);
    if (!W.groups.length) { atoast('请至少保留一组数字'); return; }
    W.step = 4; renderWizard();
  }
  function backStep(n) { W.step = n; renderWizard(); }
  function assignGroup(num, gi) {
    for (const g of W.groups) { const i = g.numbers.indexOf(num); if (i >= 0) g.numbers.splice(i, 1); }
    while (W.groups.length <= gi) W.groups.push({ numbers: [], calibration: defaultCalib() });
    W.groups[gi].numbers.push(num);
    W.groups = W.groups.filter(g => g.numbers.length);
    if (!W.groups.length) W.groups = [{ numbers: [], calibration: defaultCalib() }];
    renderWizard();
  }
  function addGroup() { W.groups.push({ numbers: [], calibration: defaultCalib() }); renderWizard(); }
  function removeLastGroup() {
    if (W.groups.length <= 1) return;
    const last = W.groups.pop();
    for (const n of last.numbers) W.groups[0].numbers.push(n);
    renderWizard();
  }

  /* ---- 第4步：结果 ---- */
  async function viewStep4Html() {
    const dict = await getDict();
    const groupResults = [];
    for (const g of W.groups) groupResults.push(await generateGroupResult(g, dict));
    let html = '';
    groupResults.forEach((gr, gi) => {
      html += '<div class="acard a-soft"><div style="font-weight:700;color:var(--color-primary-deep);font-size:15px">第 ' + (gi + 1) + ' 组 ' + gr.numbers.map(esc).join(' · ') + '</div>' +
        '<div class="amuted">复盘 ' + esc(W.reviewDate) + ' · 心理状态：' + esc(gr.calibration.mood || '中性') +
        (gr.calibration.dates && gr.calibration.dates.length ? ' · 出现：' + gr.calibration.dates.map(d => shortDate(d)).join('、') : '') +
        (gr.calibration.recent && gr.calibration.recent.length ? ' · 动向：' + gr.calibration.recent.map(esc).join('、') : '') +
        (gr.ctxSnapshot.emptyThought ? ' · 无特定念头' : ' · 有具体念头') + '</div></div>';
      if (gr.biasWarning) {
        html += '<div class="abias-warn">⚠️ 你提到是专门去找数字的——这类商业或随机重复数字（如 8888、2222）通常不视为回应，请结合整体状态判断，避免确认偏误。</div>';
      }
      for (const pn of gr.perNumber) html += numberCard(pn, dict);
      if (gr.dominant.length) {
        html += '<div class="acard"><div class="asec-title" style="margin-top:0">👑 本组主导数字</div><div class="adom-line">' +
          gr.dominant.map(d => '<div class="adom-item"><div class="an">' + esc(d.digit) + '</div><div class="ac">' + esc(d.core) + ' ×' + d.count + '</div></div>').join('') +
          '</div><div class="amuted" style="margin-top:8px">组内出现次数最多的前 3 个数字及其原型</div></div>';
      }
      if (gr.narratives.length) html += narrativeCard(gr.narratives);
    });
    html += '<div class="arow" style="margin-top:6px">' +
      '<button class="abtn" onclick="AngelModule.backStep(3)">← 重新校准</button>' +
      '<button class="abtn abtn-primary" onclick="AngelModule.saveCurrent()">' + (W.editId ? '💾 保存修改' : '💾 保存这次解读') + '</button>' +
      '<button class="abtn" onclick="AngelModule.restartWizard()">🔄 再测一组</button></div>';
    return html;
  }
  function numberCard(pn, dict) {
    const cands = pn.candidates;
    let html = '<div class="anum-card"><div class="anum-head"><span class="anum-big">' + esc(pn.number) + '</span><span class="amuted">' + esc(pn.chain.splitCores) + '</span></div>';
    if (!cands.length) {
      return html + '<div class="aempty-box"><div class="ae-icon">🕊️</div>没有足够强的候选解读（所有面向分数 ≤ 0）。这本身也是一种答案——也许它只是一个普通数字。</div></div>';
    }
    const top = cands[0];
    html += '<div class="atop1-box"><span class="atop1-tag">最可能</span>' + candHtml(top, true) + '</div>';
    const others = cands.slice(1);
    if (others.length) {
      html += '<details class="afold" open><summary>其他可能性（按强度降序，共 ' + others.length + ' 条）</summary><div class="afold-body">';
      others.forEach(c => { html += candHtml(c, false); });
      html += '</div></details>';
    }
    const ch = pn.chain;
    html += '<details class="afold"><summary>推理链</summary><div class="afold-body">' +
      '<div class="achain-line">拆位结果：<b>' + esc(ch.split) + '</b>（' + esc(ch.splitCores) + '）</div>' +
      (ch.repeats.length ? '<div class="achain-line">重复强调：<b>' + ch.repeats.map(esc).join('、') + '</b></div>' : '') +
      (ch.structures.length ? '<div class="achain-line">结构特征：<b>' + ch.structures.map(esc).join('、') + '</b></div>' : '') +
      (ch.pairs.length ? '<div class="achain-line">命中相邻组合：<b>' + ch.pairs.map(esc).join('、') + '</b></div>' : '') +
      '<div class="achain-line amuted">结构信息只作为推理依据，不构成独立解读。</div>' +
      '</div></details></div>';
    return html;
  }
  function badgeCls(s) { return s >= 8 ? 'a-b-hi' : (s >= 5 ? 'a-b-md' : 'a-b-lo'); }
  function candHtml(c, isTop) {
    const src = c.kind === 'personal' ? '· 私人约定' : (c.kind === 'pair' ? '· 相邻组合' : '· 数位 ' + esc(c.digit) + ' ' + esc(c.core || ''));
    const reasonTxt = '理由：' + c.reasons.join('；');
    const body = '<div class="acand-body"><div class="acand-label">' + esc(c.label) + '<span class="acand-src">' + src + '</span></div>' +
      '<div class="acand-text">' + esc(c.text) + '</div><div class="acand-reason">' + esc(reasonTxt) + '</div></div>';
    if (isTop) return '<div class="acand atop1-cand"><span class="abadge ' + badgeCls(c.score) + '">' + c.score + '</span>' + body + '</div>';
    return '<div class="acand"><span class="abadge ' + badgeCls(c.score) + '">' + c.score + '</span>' + body + '</div>';
  }
  function narrativeCard(narrs) {
    const top = narrs[0];
    let html = '<div class="acard anarr-card"><div class="ah-title">🌌 综合指向</div><div class="ah-sub">跨数字综合解读：整组数字的核心原型组合出的叙事方向</div>';
    html += '<div class="atop1-box"><span class="atop1-tag">最可能综合指向</span>' +
      '<div class="acand atop1-cand"><span class="abadge ' + badgeCls(top.score) + '">' + top.score + '</span>' +
      '<div class="acand-body"><div class="acand-label">' + esc(top.label) + '<span class="acand-src">· ' + esc(top.key) + '</span></div>' +
      '<div class="acand-text">' + esc(top.text) + '</div><div class="acand-reason">理由：' + esc(top.reasons.join('；')) + '</div></div></div></div>';
    const others = narrs.slice(1);
    if (others.length) {
      html += '<details class="afold"><summary>其他综合可能（共 ' + others.length + ' 条）</summary><div class="afold-body">';
      others.forEach(n => {
        html += '<div class="acand"><span class="abadge ' + badgeCls(n.score) + '">' + n.score + '</span>' +
          '<div class="acand-body"><div class="acand-label">' + esc(n.label) + '<span class="acand-src">· ' + esc(n.key) + '</span></div>' +
          '<div class="acand-text">' + esc(n.text) + '</div><div class="acand-reason">理由：' + esc(n.reasons.join('；')) + '</div></div></div>';
      });
      html += '</div></details>';
    }
    html += '</div>';
    return html;
  }
  function restartWizard() { W = newWizard(); renderWizard(); }
  async function saveCurrent() {
    const dict = await getDict();
    const groupResults = [];
    for (const g of W.groups) groupResults.push(await generateGroupResult(g, dict));
    const rec = {
      id: W.editId || uid(),
      createdAt: new Date().toISOString(),
      reviewDate: W.reviewDate || todayStr(),
      groups: W.groups.map(g => ({ numbers: g.numbers.slice(), calibration: JSON.parse(JSON.stringify(g.calibration || {})) })),
      results: { groups: groupResults },
      feelings: '', verification: ''
    };
    if (W.editId) {
      const all = await loadRecords();
      const idx = all.findIndex(r => r.id === W.editId);
      if (idx >= 0) {
        rec.feelings = all[idx].feelings || '';
        rec.verification = all[idx].verification || '';
        rec.createdAt = all[idx].createdAt || rec.createdAt;
        all[idx] = rec;
        await saveRecord(rec);
      } else { await saveRecord(rec); }
    } else {
      await saveRecord(rec);
    }
    const savedId = rec.id;
    W = newWizard();
    SUB = 'records'; VIEW = { recordId: savedId };
    await sub('records');
    atoast(W.editId ? '已更新原记录' : '已保存到解读记录');
  }
  function cancelEdit() { W = newWizard(); renderWizard(); atoast('已退出编辑模式'); }

  /* ============================================================
     解读记录页
     ============================================================ */
  async function renderRecords() {
    const body = document.getElementById('angel-body');
    if (!body) return;
    if (VIEW.recordId) {
      const rec = (await loadRecords()).find(r => r.id === VIEW.recordId);
      if (rec) { body.innerHTML = await recordDetailHtml(rec); return; }
      VIEW.recordId = null;
    }
    const recs = (await loadRecords()).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (!recs.length) {
      body.innerHTML = '<div class="acard"><div class="aempty-box"><div class="ae-icon">📖</div>还没有保存过的解读记录。<br>去「✨ 解读」完成一次向导并保存即可。</div></div>';
      return;
    }
    let html = '<div class="ah-title" style="margin:2px 4px 12px">📖 解读记录（' + recs.length + ' 条）</div>';
    for (const r of recs) {
      const nums = []; const dates = new Set(); const moods = new Set(); const tops = [];
      (r.groups || []).forEach(g => {
        (g.numbers || []).forEach(n => { if (!nums.includes(n)) nums.push(n); });
        (g.calibration && g.calibration.dates || []).forEach(d => dates.add(d));
        if (g.calibration && g.calibration.mood) moods.add(g.calibration.mood);
        const gr = ((r.results || {}).groups || []).find(x => JSON.stringify(x.numbers) === JSON.stringify(g.numbers));
        if (gr) gr.perNumber.forEach(pn => { if (pn.candidates && pn.candidates.length) tops.push(pn.number + '：' + pn.candidates[0].label); });
      });
      const dateArr = [...dates].sort();
      html += '<div class="acard arec-item" onclick="AngelModule.openRecord(\'' + r.id + '\')">' +
        '<div class="arec-meta"><span>复盘 ' + esc(r.reviewDate || '') + '</span>' +
        (dateArr.length ? '<span>出现 ' + dateArr.map(d => shortDate(d)).join('、') + '</span>' : '') +
        (moods.size ? '<span>' + [...moods].map(esc).join(' / ') + '</span>' : '') + '</div>' +
        '<div class="arec-nums">' + nums.map(esc).join('　') + '</div>' +
        (tops.length ? '<div class="arec-top"><b>最可能：</b>' + esc(tops.join('；')) + '</div>' : '') + '</div>';
    }
    body.innerHTML = html;
  }
  function openRecord(id) { VIEW.recordId = id; renderRecords(); }
  function backToRecords() { VIEW.recordId = null; renderRecords(); }

  async function recordDetailHtml(rec) {
    const grs = ((rec.results || {}).groups || []);
    let html = '<div class="arow" style="margin-bottom:12px"><button class="abtn asm" onclick="AngelModule.backToRecords()">← 返回列表</button></div>';
    html += '<div class="acard"><div class="ah-title">📋 解读详情</div>' +
      '<div class="astat-line">复盘日期：' + esc(rec.reviewDate || '') + '</div>' +
      '<div class="astat-line">保存时间：' + esc((rec.createdAt || '').replace('T', ' ').slice(0, 16)) + '</div></div>';
    grs.forEach((gr, gi) => {
      html += '<div class="acard a-soft"><div style="font-weight:700;color:var(--color-primary-deep)">第 ' + (gi + 1) + ' 组 ' + gr.numbers.map(esc).join(' · ') + '</div>' +
        '<div class="amuted">心理状态：' + esc(gr.calibration.mood || '中性') +
        (gr.calibration.dates && gr.calibration.dates.length ? ' · 出现：' + gr.calibration.dates.map(d => shortDate(d)).join('、') : '') +
        (gr.calibration.recent && gr.calibration.recent.length ? ' · 动向：' + gr.calibration.recent.map(esc).join('、') : '') +
        (gr.ctxSnapshot && gr.ctxSnapshot.emptyThought ? ' · 无特定念头' : ' · 有具体念头') + '</div>' +
        (gr.calibration.situation ? '<div class="amuted">情境：' + esc(gr.calibration.situation) + '</div>' : '') +
        (gr.calibration.thought ? '<div class="amuted">念头：' + esc(gr.calibration.thought) + '</div>' : '') + '</div>';
      if (gr.biasWarning) { html += '<div class="abias-warn">⚠️ 你提到是专门去找数字的——这类商业或随机重复数字（如 8888、2222）通常不视为回应，请结合整体状态判断，避免确认偏误。</div>'; }
      for (const pn of (gr.perNumber || [])) html += numberCardFull(pn);
      if (gr.dominant && gr.dominant.length) {
        html += '<div class="acard"><div class="asec-title" style="margin-top:0">👑 本组主导数字</div><div class="adom-line">' +
          gr.dominant.map(d => '<div class="adom-item"><div class="an">' + esc(d.digit) + '</div><div class="ac">' + esc(d.core) + ' ×' + d.count + '</div></div>').join('') + '</div></div>';
      }
      if (gr.narratives && gr.narratives.length) html += narrativeCard(gr.narratives);
    });
    html += '<div class="acard"><div class="ah-title">💗 我的感受</div>' +
      '<textarea class="atextarea" id="arec-feel" placeholder="当时的感受、身体反应、直觉…">' + esc(rec.feelings || '') + '</textarea>' +
      '<div class="ah-title" style="margin-top:14px">🔮 后续验证（后来真的发生了什么）</div>' +
      '<textarea class="atextarea" id="arec-verify" placeholder="过段时间回来补写：后来发生了什么？和当时的解读对上了吗？">' + esc(rec.verification || '') + '</textarea>' +
      '<button class="abtn abtn-primary asm" style="margin-top:10px" onclick="AngelModule.saveReflection(\'' + rec.id + '\')">保存感受与验证</button></div>';
    html += '<div class="arow" style="margin-top:6px">' +
      '<button class="abtn asm" onclick="AngelModule.editRecord(\'' + rec.id + '\')">✏️ 编辑校准并重新解读</button>' +
      '<button class="abtn asm" onclick="AngelModule.regenRecord(\'' + rec.id + '\')">🔁 用当前词典重新生成</button>' +
      '<button class="abtn asm a-danger" onclick="AngelModule.deleteRecord(\'' + rec.id + '\')">🗑 删除</button></div>';
    return html;
  }
  function numberCardFull(pn) {
    const cands = pn.candidates || [];
    let html = '<div class="anum-card"><div class="anum-head"><span class="anum-big">' + esc(pn.number) + '</span>' +
      (pn.chain ? '<span class="amuted">' + esc(pn.chain.splitCores) + '</span>' : '') + '</div>';
    if (!cands.length) { return html + '<div class="aempty-box"><div class="ae-icon">🕊️</div>无候选解读</div></div>'; }
    const top = cands[0];
    html += '<div class="atop1-box"><span class="atop1-tag">最可能</span>' + candHtml(top, true) + '</div>';
    const others = cands.slice(1);
    if (others.length) {
      html += '<details class="afold" open><summary>完整候选列表（共 ' + cands.length + ' 条，按强度降序）</summary><div class="afold-body">';
      others.forEach(c => { html += candHtml(c, false); });
      html += '</div></details>';
    }
    const ch = pn.chain;
    if (ch) {
      html += '<details class="afold"><summary>推理链</summary><div class="afold-body">' +
        '<div class="achain-line">拆位结果：<b>' + esc(ch.split) + '</b>（' + esc(ch.splitCores) + '）</div>' +
        (ch.repeats.length ? '<div class="achain-line">重复强调：<b>' + ch.repeats.map(esc).join('、') + '</b></div>' : '') +
        (ch.structures.length ? '<div class="achain-line">结构特征：<b>' + ch.structures.map(esc).join('、') + '</b></div>' : '') +
        (ch.pairs.length ? '<div class="achain-line">命中相邻组合：<b>' + ch.pairs.map(esc).join('、') + '</b></div>' : '') +
        '</div></details>';
    }
    html += '</div>';
    return html;
  }
  async function saveReflection(id) {
    const all = await loadRecords();
    const rec = all.find(r => r.id === id);
    if (!rec) return;
    rec.feelings = document.getElementById('arec-feel').value;
    rec.verification = document.getElementById('arec-verify').value;
    await saveRecord(rec);
    atoast('已保存');
  }
  async function editRecord(id) {
    const rec = (await loadRecords()).find(r => r.id === id);
    if (!rec) return;
    const nums = [];
    (rec.groups || []).forEach(g => (g.numbers || []).forEach(n => { if (!nums.includes(n)) nums.push(n); }));
    W = { step: 1, raw: nums.join(', '), reviewDate: rec.reviewDate || todayStr(), numbers: nums, groups: JSON.parse(JSON.stringify(rec.groups || [])), editId: id };
    SUB = 'wizard';
    await sub('wizard');
    atoast('已载入记录，可修改任何步骤后重新保存');
  }
  async function regenRecord(id) {
    const dict = await getDict();
    const all = await loadRecords();
    const rec = all.find(r => r.id === id);
    if (!rec) return;
    const grps = rec.groups || [];
    rec.results = { groups: [] };
    for (const g of grps) rec.results.groups.push(await generateGroupResult(g, dict));
    await saveRecord(rec);
    renderRecords();
    atoast('已用当前词典重新生成');
  }
  function deleteRecord(id) {
    aconfirm('删除记录', '删除后无法恢复，确定删除这条解读记录吗？', async () => {
      await deleteRecordDB(id);
      VIEW.recordId = null;
      renderRecords();
      atoast('已删除');
    }, '删除');
  }
  async function deleteRecordDB(id) { await DB.delete('angel_records', id); }

  /* ============================================================
     词典页
     ============================================================ */
  async function renderDictPage() {
    const body = document.getElementById('angel-body');
    if (!body) return;
    const edits = await loadDictEdits();
    const dict = await getDict();
    const personal = dict.personal || [];
    let html = '';
    html += '<div class="acard"><div class="ah-title">💍 私人约定</div><div class="ah-sub">完整数字 + 一句约定含义。命中时优先级最高（10 分，排第一）。</div>';
    if (personal.length) {
      personal.forEach((p, i) => {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px dashed var(--color-border)">' +
          '<span class="anum-big" style="font-size:17px">' + esc(p.number) + '</span><span class="amuted">=</span>' +
          '<span style="flex:1;font-size:14px">' + esc(p.meaning) + '</span>' +
          '<button class="abtn asm a-danger" onclick="AngelModule.delPersonal(' + i + ')">删</button></div>';
      });
    } else { html += '<div class="amuted" style="margin-bottom:8px">还没有私人约定。例如：1111 = 我和他约定的「今天要吃火锅」。</div>'; }
    html += '<div class="arow" style="margin-top:10px">' +
      '<input class="ainput" id="ap-num" placeholder="完整数字，如 1111" style="flex:1;min-width:110px" maxlength="10">' +
      '<input class="ainput" id="ap-mean" placeholder="约定含义" style="flex:2;min-width:150px">' +
      '<button class="abtn asm abtn-primary" onclick="AngelModule.addPersonal()">添加</button></div></div>';
    html += '<div class="acard"><div class="ah-title">🔢 数位原型词典（0-9）</div><div class="ah-sub">编辑过的条目带 <span class="aedited-mark">✏️ 已编辑</span> 标记，将来种子词典升级不会覆盖你的编辑。</div>';
    const tags = await allTags();
    for (const d of Object.keys(dict.digits)) {
      const entry = dict.digits[d];
      const baseEdited = !!edits['digit:' + d];
      let aspectRows = '';
      entry.aspects.forEach(asp => { aspectRows += aspectEditRowHtml(d, asp, edits, tags); });
      html += '<details class="afold"><summary><span class="adict-num">' + d + '</span>' + esc(entry.core) +
        (baseEdited ? '<span class="aedited-mark">✏️ 已编辑</span>' : '') +
        '<span class="amuted" style="margin-left:6px;font-size:12px">' + entry.aspects.length + ' 个面向</span></summary>' +
        '<div class="afold-body">' +
        '<div class="afield"><label>核心词</label><input class="ainput" id="adict-core-' + d + '" value="' + esc(entry.core) + '"></div>' +
        '<div class="afield"><label>总述</label><textarea class="atextarea" id="adict-ov-' + d + '">' + esc(entry.overview) + '</textarea></div>' +
        '<div class="afield"><label>常见译法（每行一条）</label><textarea class="atextarea" id="adict-tr-' + d + '" placeholder="每行一条">' + esc((entry.translations || []).join('\n')) + '</textarea></div>' +
        '<div class="asec-title">面向</div>' + aspectRows +
        '<button class="achip-btn" onclick="AngelModule.addAspect(\'' + d + '\')">＋ 新增面向</button>' +
        '<div class="arow" style="margin-top:12px"><button class="abtn asm abtn-primary" onclick="AngelModule.saveDigitEdit(\'' + d + '\')">保存此数位</button></div>' +
        '</div></details>';
    }
    html += '</div>';
    html += '<div class="acard"><div class="ah-title">🔗 相邻组合词典</div><div class="ah-sub">读法：前一位 → 后一位。命中时给 6 分候选。</div>';
    for (const k of Object.keys(dict.pairs)) {
      const p = dict.pairs[k];
      html += '<details class="afold"><summary><span class="adict-num" style="font-size:13px">' + k + '</span>' + esc(p.label) +
        (edits['pair:' + k] ? '<span class="aedited-mark">✏️ 已编辑</span>' : '') + '</summary>' +
        '<div class="afold-body"><div class="afield"><label>标签</label><input class="ainput" id="apair-label-' + k + '" value="' + esc(p.label) + '"></div>' +
        '<div class="afield"><label>解读文字</label><textarea class="atextarea" id="apair-text-' + k + '">' + esc(p.text) + '</textarea></div>' +
        '<button class="abtn asm abtn-primary" onclick="AngelModule.savePairEdit(\'' + k + '\')">保存</button></div></details>';
    }
    html += '</div>';
    html += '<div class="acard"><div class="ah-title">🌌 综合叙事规则</div><div class="ah-sub">多数字组合命中时的叙事方向。基础 6 分，仅显示 ≥6 分的命中。</div>';
    dict.narratives.forEach(n => {
      html += '<details class="afold"><summary><span class="adict-num" style="font-size:12px">' + esc(n.key) + '</span>' + esc(n.label) +
        (edits['narr:' + n.key] ? '<span class="aedited-mark">✏️ 已编辑</span>' : '') + '</summary>' +
        '<div class="afold-body"><div class="afield"><label>标签</label><input class="ainput" id="anarr-label-' + esc(n.key) + '" value="' + esc(n.label) + '"></div>' +
        '<div class="afield"><label>解读文字</label><textarea class="atextarea" id="anarr-text-' + esc(n.key) + '">' + esc(n.text) + '</textarea></div>' +
        '<button class="abtn asm abtn-primary" onclick="AngelModule.saveNarrEdit(\'' + esc(n.key) + '\')">保存</button></div></details>';
    });
    html += '</div>';
    body.innerHTML = html;
  }
  function condSummary(c) {
    if (!c || !(c.thoughtContains || c.emptyThought || c.recent || c.mood)) return '';
    const parts = [];
    if (c.thoughtContains && c.thoughtContains.length) parts.push('念头关键词×' + c.thoughtContains.length);
    if (c.emptyThought) parts.push('空念头');
    if (c.recent && c.recent.length) parts.push('动向:' + c.recent.join('/'));
    if (c.mood && c.mood.length) parts.push('心态:' + c.mood.join('/'));
    if (c.requireAll) parts.push('需同时满足');
    return parts.join(' · ');
  }
  function aspectEditRowHtml(d, asp, edits, tags) {
    const c = asp.conditions || {};
    const cs = condSummary(c);
    const aEdited = !!edits['aspect:' + asp.id];
    const moods = ['焦虑', '平静', '混乱·拿不准', '兴奋·触动', '中性'];
    let moodChips = '';
    moods.forEach(m => {
      const on = (c.mood || []).includes(m);
      moodChips += '<span class="amini-check' + (on ? ' on' : '') + '" onclick="this.classList.toggle(\'on\')" data-cond="mood" data-val="' + esc(m) + '">' + esc(m) + '</span>';
    });
    let recentChips = '';
    (tags || []).forEach(t => {
      const on = (c.recent || []).includes(t);
      recentChips += '<span class="amini-check' + (on ? ' on' : '') + '" onclick="this.classList.toggle(\'on\')" data-cond="recent" data-val="' + esc(t) + '">' + esc(t) + '</span>';
    });
    return '<div class="acond-editor" data-aspid="' + esc(asp.id) + '" id="aasp-' + d + '-' + esc(asp.id) + '">' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">' +
      '<input class="ainput" style="flex:1;min-width:120px;padding:6px 10px;font-size:14px" value="' + esc(asp.label) + '" data-asp="label" placeholder="面向标签">' +
      (aEdited ? '<span class="aedited-mark">✏️</span>' : '') +
      (cs ? '<span class="acond-summary">' + esc(cs) + '</span>' : '<span class="acond-summary">无条件（默认面向）</span>') +
      '<button class="abtn asm a-danger" onclick="AngelModule.removeAspect(\'' + d + '\',\'' + esc(asp.id) + '\')">删</button></div>' +
      '<div class="afield"><label>解读文字</label><textarea class="atextarea" style="min-height:56px" data-asp="text" placeholder="解读文字">' + esc(asp.text) + '</textarea></div>' +
      '<div class="acond-row"><label>触发条件（可组合）</label>' +
      '<div class="afield"><label>念头关键词（每行一个，命中 +5）</label><textarea class="atextarea" style="min-height:44px;font-size:13px" data-asp="thought">' + esc((c.thoughtContains || []).join('\n')) + '</textarea></div>' +
      '<div style="margin:6px 0"><label class="amini-check' + (c.emptyThought ? ' on' : '') + '" onclick="this.classList.toggle(\'on\')" data-cond="empty" style="cursor:pointer">要求无特定念头（+4）</label></div>' +
      '<div style="margin:6px 0"><label style="font-size:12.5px;color:var(--color-text-soft);display:block;margin-bottom:4px">链接动向（命中 +3）</label>' + recentChips + '</div>' +
      '<div style="margin:6px 0"><label style="font-size:12.5px;color:var(--color-text-soft);display:block;margin-bottom:4px">心理状态（命中 +2）</label>' + moodChips + '</div>' +
      '<div style="margin:6px 0"><label class="amini-check' + (c.requireAll ? ' on' : '') + '" onclick="this.classList.toggle(\'on\')" data-cond="requireAll" style="cursor:pointer">以上条件需同时满足</label></div>' +
      '</div></div>';
  }
  async function saveDigitEdit(d) {
    const dict = await getDict();
    const edits = await loadDictEdits();
    const entry = dict.digits[d];
    const labelEl = document.getElementById('adict-core-' + d);
    if (!labelEl) return;
    const newEntry = {
      core: labelEl.value.trim(),
      overview: document.getElementById('adict-ov-' + d).value.trim(),
      translations: document.getElementById('adict-tr-' + d).value.split('\n').map(s => s.trim()).filter(Boolean),
      aspects: []
    };
    const containers = [...document.querySelectorAll('.angel .acond-editor')].filter(el => el.id && el.id.indexOf('aasp-' + d + '-') === 0);
    for (const el of containers) {
      const asp = collectAspectFromDom(el);
      newEntry.aspects.push(asp);
    }
    // 计算该数位下被标记编辑的面向（在 SEED 里的）
    const editedAspects = [];
    for (const a of newEntry.aspects) {
      const isSeed = SEED_DICT.digits[d].aspects.some(sa => sa.id === a.id);
      if (isSeed) {
        const sa = SEED_DICT.digits[d].aspects.find(sa => sa.id === a.id);
        if (JSON.stringify(a) !== JSON.stringify(sa)) { editedAspects.push(a); await saveDictEdit('aspect:' + a.id, { kind: 'aspect', aspectId: a.id, aspect: { id: a.id, label: a.label, text: a.text, conditions: a.conditions } }); }
        else { await DB.delete('angel_dict', 'aspect:' + a.id); }
      } else {
        await saveDictEdit('aspect:' + a.id, { kind: 'aspect', aspectId: a.id, aspect: { id: a.id, label: a.label, text: a.text, conditions: a.conditions } });
      }
    }
    // 数位基础字段编辑检测
    const seedBase = { core: SEED_DICT.digits[d].core, overview: SEED_DICT.digits[d].overview, translations: SEED_DICT.digits[d].translations };
    const newBase = { core: newEntry.core, overview: newEntry.overview, translations: newEntry.translations };
    if (JSON.stringify(newBase) === JSON.stringify(seedBase)) {
      await DB.delete('angel_dict', 'digit:' + d);
    } else {
      await saveDictEdit('digit:' + d, { kind: 'digit', digit: d, base: newBase, aspects: editedAspects.map(a => ({ id: a.id, label: a.label, text: a.text, conditions: a.conditions })) });
    }
    renderDictPage();
    atoast('已保存数位 ' + d + ' 的词典编辑');
  }
  function collectAspectFromDom(el) {
    const label = el.querySelector('[data-asp="label"]').value.trim();
    const text = el.querySelector('[data-asp="text"]').value.trim();
    const thought = el.querySelector('[data-asp="thought"]').value.split('\n').map(s => s.trim()).filter(Boolean);
    const empty = el.querySelector('[data-cond="empty"]').classList.contains('on');
    const requireAll = el.querySelector('[data-cond="requireAll"]').classList.contains('on');
    const recent = [...el.querySelectorAll('[data-cond="recent"].on')].map(e => e.dataset.val);
    const mood = [...el.querySelectorAll('[data-cond="mood"].on')].map(e => e.dataset.val);
    const conditions = {};
    if (thought.length) conditions.thoughtContains = thought;
    if (empty) conditions.emptyThought = true;
    if (recent.length) conditions.recent = recent;
    if (mood.length) conditions.mood = mood;
    if (requireAll && Object.keys(conditions).length > 1) conditions.requireAll = true;
    return { id: el.dataset.aspid, label: label || '未命名面向', text, conditions };
  }
  async function addAspect(d) {
    const dict = await getDict();
    const newId = 'd' + d + '_custom_' + Date.now().toString(36);
    const asp = { id: newId, label: '新面向', text: '', conditions: {} };
    await saveDictEdit('aspect:' + newId, { kind: 'aspect', aspectId: newId, aspect: asp });
    renderDictPage();
    const el = document.getElementById('aasp-' + d + '-' + newId);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--color-primary-soft)'; setTimeout(() => el.style.outline = '', 2500); }
  }
  function removeAspect(d, id) {
    aconfirm('删除面向', '确定删除这个面向吗？', async () => {
      await DB.delete('angel_dict', 'aspect:' + id);
      renderDictPage();
      atoast('已删除面向');
    }, '删除');
  }
  async function savePairEdit(k) {
    const el = document.getElementById('apair-label-' + k);
    if (!el) return;
    const val = { label: el.value.trim(), text: document.getElementById('apair-text-' + k).value.trim() };
    if (JSON.stringify(val) === JSON.stringify(SEED_DICT.pairs[k])) await DB.delete('angel_dict', 'pair:' + k);
    else await saveDictEdit('pair:' + k, { kind: 'pair', key: k, value: val });
    renderDictPage();
    atoast('已保存组合 ' + k);
  }
  async function saveNarrEdit(key) {
    const el = document.getElementById('anarr-label-' + key);
    if (!el) return;
    const val = { key, label: el.value.trim(), text: document.getElementById('anarr-text-' + key).value.trim() };
    const cur = SEED_DICT.narratives.find(n => n.key === key);
    if (cur && JSON.stringify(val) === JSON.stringify(cur)) await DB.delete('angel_dict', 'narr:' + key);
    else await saveDictEdit('narr:' + key, { kind: 'narr', key, value: val });
    renderDictPage();
    atoast('已保存叙事规则');
  }
  async function addPersonal() {
    const num = (document.getElementById('ap-num').value || '').trim();
    const mean = (document.getElementById('ap-mean').value || '').trim();
    if (!/^\d{1,10}$/.test(num)) { atoast('请输入纯数字（1-10位）'); return; }
    if (!mean) { atoast('请填写约定含义'); return; }
    const cur = await loadPersonal();
    if (cur.some(p => p.number === num)) { atoast('该数字已有私人约定，请先删除旧的'); return; }
    cur.push({ number: num, meaning: mean });
    await savePersonal(cur);
    renderDictPage();
    atoast('已添加私人约定');
  }
  async function delPersonal(i) {
    aconfirm('删除私人约定', '确定删除这条私人约定吗？', async () => {
      const cur = await loadPersonal();
      cur.splice(i, 1);
      await savePersonal(cur);
      renderDictPage();
      atoast('已删除');
    }, '删除');
  }

  /* ============================================================
     备份页
     ============================================================ */
  async function renderBackup() {
    const body = document.getElementById('angel-body');
    if (!body) return;
    const records = await loadRecords();
    const personal = await loadPersonal();
    const edits = await loadDictEdits();
    const tags = await loadCustomTags();
    body.innerHTML =
      '<div class="acard"><div class="ah-title">💾 备份与恢复</div>' +
      '<div class="ah-sub">数据存在这台设备浏览器的 IndexedDB（个人站数据库）里。换设备 / 清浏览器数据前记得先导出。</div>' +
      '<div class="astat-line">📖 解读记录：<b>' + records.length + '</b> 条</div>' +
      '<div class="astat-line">💍 私人约定：<b>' + personal.length + '</b> 条</div>' +
      '<div class="astat-line">✏️ 已编辑的词典条目：<b>' + Object.keys(edits).length + '</b> 个</div>' +
      '<div class="astat-line">🏷️ 自定义动向标签：<b>' + tags.length + '</b> 个</div>' +
      '<div class="arow" style="margin-top:14px"><button class="abtn abtn-primary" onclick="AngelModule.exportBackup()">📤 导出备份</button></div>' +
      '<div class="adivider"></div>' +
      '<div class="ah-title" style="font-size:15px">📥 导入备份</div>' +
      '<div class="ah-sub">导入是<b>合并不是覆盖</b>：记录按 ID 合并，词典按编辑标记合并，标签取并集。发现冲突时会先问你要保留哪个。</div>' +
      '<input type="file" id="aimport-file" accept=".json,application/json" style="display:none" onchange="AngelModule.handleImportFile(this)">' +
      '<button class="abtn" onclick="document.getElementById(\'aimport-file\').click()">选择 JSON 备份文件</button></div>' +
      '<div class="acard a-soft"><div class="ah-title" style="font-size:14px">🧷 数据安全说明</div>' +
      '<div class="amuted">· 本工具完全离线运行，数据不离开你的浏览器。<br>· 任何操作都不会清空已有记录；导入也是合并式。<br>· 导出的 JSON 请妥善保管。</div></div>';
  }
  function exportBackup() {
    (async () => {
      const data = {
        app: 'angel_numbers', version: 1, exportedAt: new Date().toISOString(),
        records: await loadRecords(), personal: await loadPersonal(),
        dictEdited: await loadDictEdits(), recentTags: await loadCustomTags()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '天使数字解读备份_' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      atoast('备份文件已开始下载');
    })();
  }
  function handleImportFile(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      let data;
      try { data = JSON.parse(e.target.result); } catch (err) { atoast('文件解析失败，请确认是本工具导出的 JSON'); return; }
      doImport(data);
    };
    reader.readAsText(f);
    input.value = '';
  }
  async function doImport(data) {
    // 兼容两种格式：新格式 {records, personal, dictEdited, recentTags}，旧格式 {store:{records,...}}
    let impRecords = data.records, impPersonal = data.personal, impEdited = data.dictEdited, impTags = data.recentTags;
    if (!Array.isArray(impRecords) && data.store && Array.isArray(data.store.records)) {
      impRecords = data.store.records;
      impPersonal = data.store.dict && Array.isArray(data.store.dict.personal) ? data.store.dict.personal : [];
      impEdited = data.store.dictEdited || [];
      impTags = data.recentTags || [];
    }
    if (!Array.isArray(impRecords)) { atoast('这不是天使数字解读的备份文件'); return; }
    const localRecs = await loadRecords();
    const localIds = new Set(localRecs.map(r => r.id));
    const conflicts = impRecords.filter(r => r && r.id && localIds.has(r.id));
    const newRecs = impRecords.filter(r => r && r.id && !localIds.has(r.id));
    const applyImport = async (keepLocal) => {
      if (!keepLocal) {
        for (const r of impRecords) {
          if (r && r.id) { const r2 = Object.assign({}, r); r2.feelings = r2.feelings || ''; r2.verification = r2.verification || ''; await saveRecord(r2); }
        }
      }
      for (const r of newRecs) { const r2 = Object.assign({}, r); r2.feelings = r2.feelings || ''; r2.verification = r2.verification || ''; await saveRecord(r2); }
      // 私人约定按 number 合并
      if (Array.isArray(impPersonal)) {
        const cur = await loadPersonal();
        const curNum = new Set(cur.map(x => x.number));
        for (const p of impPersonal) { if (p && p.number && !curNum.has(p.number)) cur.push({ number: p.number, meaning: p.meaning }); }
        await savePersonal(cur);
      }
      // 词典编辑标记：仅补入本地没有的键
      if (impEdited && typeof impEdited === 'object') {
        const curEdits = await loadDictEdits();
        for (const k of Object.keys(impEdited)) {
          if (!curEdits[k] && impEdited[k]) await saveDictEdit(k, impEdited[k]);
        }
      }
      // 自定义标签并集
      if (Array.isArray(impTags)) {
        const curTags = await loadCustomTags();
        for (const t of impTags) { if (t && !curTags.includes(t) && !DEFAULT_TAGS.includes(t)) curTags.push(t); }
        await saveCustomTags(curTags);
      }
      renderBackup();
      atoast('导入完成：新增 ' + newRecs.length + ' 条记录' + (conflicts.length ? (keepLocal ? '，冲突 ' + conflicts.length + ' 条保留本地' : '，冲突 ' + conflicts.length + ' 条用导入版本') : ''));
    };
    if (conflicts.length) {
      let m = document.getElementById('angel-modal');
      if (!m) { m = document.createElement('div'); m.id = 'angel-modal'; m.className = 'amodal-wrap'; document.body.appendChild(m); }
      m.innerHTML = '<div class="amodal-mask"><div class="amodal"><h3>发现 ' + conflicts.length + ' 条冲突记录</h3>' +
        '<p>导入文件里有 ' + conflicts.length + ' 条记录和本地记录 ID 相同（同一次解读的两个版本）。要保留哪个版本？</p>' +
        '<div class="arow" style="justify-content:flex-end"><button class="abtn asm" id="aimp-local" data-ghost>保留本地版本</button>' +
        '<button class="abtn asm abtn-primary" id="aimp-new">用导入版本</button></div></div></div>';
      document.getElementById('aimp-local').onclick = () => { closeModal(); applyImport(true); };
      document.getElementById('aimp-new').onclick = () => { closeModal(); applyImport(false); };
    } else {
      applyImport(true);
    }
  }

  /* ============================================================
     工具函数（供 on* 事件调用）
     ============================================================ */
  function wizRaw(v) { W.raw = v; }
  function wizDate(v) { W.reviewDate = v; }
  function toggleManage() { TAG_MGR.manage = !TAG_MGR.manage; renderWizard(); }
  function _closeModal() { closeModal(); }
  function getState() { return { SUB, step: W.step, numbers: W.numbers }; }

  /* ============================================================
     验收自测（控制台可调，或 URL ?angeltest=1 触发）
     ============================================================ */
  async function runAcceptanceTests() {
    const dict = await getDict();
    const T = [];
    const ctxA = { situation: '', mood: '中性', thought: '什么都没想', emptyThought: true, recent: [] };
    const cA = interpretNumber('1111', ctxA, dict);
    T.push(['A1 最可能是「新开始/消息」', cA.length > 0 && cA[0].label === '新开始/消息']);
    T.push(['A2 Top1 分数为 10', cA.length > 0 && cA[0].score === 10]);
    const fA = cA.find(c => c.label === '确认焦点');
    T.push(['A3 「确认焦点」约 1 分且排最后', !!fA && fA.score === 1 && cA[cA.length - 1].label === '确认焦点']);
    T.push(['A4 无「同位聚焦/镜像」结构条目', !cA.some(c => /同位|镜像|对称/.test(c.label))]);
    const ctxB = { situation: '', mood: '焦虑', thought: '我希望他能回应我，我很想他', emptyThought: false, recent: ['感到焦虑的事'] };
    const cB = interpretNumber('1111', ctxB, dict);
    const sB = cB.find(c => c.label === '主体确认');
    const aB = cB.find(c => c.label === '鼓励行动');
    T.push(['B1 最可能是「主体确认」10 分', cB.length > 0 && cB[0].label === '主体确认' && !!sB && sB.score === 10]);
    T.push(['B2 「鼓励行动」第二且低于主体确认', !!aB && aB.score < sB.score && cB[1].label === '鼓励行动']);
    const ctxC = { situation: '', mood: '平静', thought: '', emptyThought: true, recent: ['刚经历清晰沟通'] };
    const numsC = ['6446', '555', '1616', '4433'];
    let cOk = true;
    for (const n of numsC) { if (!interpretNumber(n, ctxC, dict).length) cOk = false; }
    T.push(['C0 四数字均有解读', cOk]);
    const narrs = interpretNarratives(numsC, dict);
    T.push(['C1 综合指向已生成', narrs.length >= 1]);
    T.push(['C2 综合 Top1 是 5+6+4', narrs.length > 0 && narrs[0].key === '5+6+4']);
    T.push(['C3 综合 Top1 分数为 10', narrs.length > 0 && narrs[0].score === 10]);
    const dom = dominantDigits(numsC, dict);
    T.push(['C4 主导数字 Top3 为 6/4/5', dom.length === 3 && ['6', '4', '5'].every(d => dom.some(x => x.digit === d))]);
    return T;
  }

  /* ============================================================
     对外暴露
     ============================================================ */
  return {
    render, sub, _VERSION: '2026-08-31-集成个人站',
    goStep2, backStep, goStep3, goStep4, restartWizard, cancelEdit,
    assignGroup, addGroup, removeLastGroup,
    setSituation, setMood, setThought, updateEmptyHint, toggleDate, toggleRecent,
    promptNewTag, addCustomTag, delCustomTag, toggleManage,
    wizRaw, wizDate, saveCurrent,
    openRecord, backToRecords, saveReflection, editRecord, regenRecord, deleteRecord,
    saveDigitEdit, addAspect, removeAspect, savePairEdit, saveNarrEdit,
    addPersonal, delPersonal,
    exportBackup, handleImportFile, _closeModal,
    getState, runAcceptanceTests, migrateFromLegacy
  };
})();

/* 供验收：暴露到 window（仅调试用，不污染全局） */
if (typeof window !== 'undefined') {
  window.AngelModule = AngelModule;
}
