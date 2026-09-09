/**
 * 早睡打卡模块（SleepModule）
 * - 每日打卡：睡眠目标 / 睡前状态 / 晨间反馈 / 早睡结果 / 晚睡原因 / 每日一句
 * - 连续挑战（3/7/14/30 天）、趋势图（Chart.js）、周/月复盘（个人复盘 + AI 复盘）
 * - AI 复盘通过 AIChatModule.askAI 委托调用，本模块全程不接触 API key
 * - 存储表：sleep_records / sleep_reviews / sleep_custom_tags（IndexedDB，不触碰其他表）
 */
const SleepModule = (function () {
  'use strict';

  /* ================= 工具 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function uid() { return 'sl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayStr() { return fmtDate(new Date()); }
  function parseDS(ds) { const p = String(ds).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(ds, n) { const d = parseDS(ds); d.setDate(d.getDate() + n); return fmtDate(d); }
  function diffDays(a, b) { return Math.round((parseDS(b) - parseDS(a)) / 86400000); }
  function weekdayOf(ds) { return '周' + '日一二三四五六'[parseDS(ds).getDay()]; }
  function toMin(t) { if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null; const p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
  function fmtMin(m) { if (m == null || isNaN(m)) return '—'; m = ((Math.round(m) % 1440) + 1440) % 1440; return pad2(Math.floor(m / 60)) + ':' + pad2(Math.round(m % 60)); }
  function fmtDur(min) { if (min == null || isNaN(min) || min <= 0) return '—'; const h = Math.floor(min / 60), m = Math.round(min % 60); return h + '小时' + (m ? m + '分' : ''); }
  function avg(arr) { const a = arr.filter(x => x != null && !isNaN(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
  function fmtPct(v) { return (v == null || isNaN(v)) ? '—' : Math.round(v * 100) + '%'; }

  function stoast(msg, type) {
    let t = document.getElementById('sleep-toast');
    if (!t) { t = document.createElement('div'); t.id = 'sleep-toast'; t.className = 'stoast' + (type === 'err' ? ' err' : ''); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(stoast._t); stoast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function smodal(title, html, onOk, okText) {
    let m = document.getElementById('sleep-modal');
    if (!m) { m = document.createElement('div'); m.id = 'sleep-modal'; m.className = 'smodal-wrap'; document.body.appendChild(m); }
    m.innerHTML = '<div class="smodal-mask" onclick="if(event.target===this)SleepModule._closeModal()"><div class="smodal">' +
      '<h3>' + esc(title) + '</h3>' + html +
      '<div class="srow" style="justify-content:flex-end;margin-top:14px">' +
      '<button class="sbtn ssm" data-ghost onclick="SleepModule._closeModal()">取消</button>' +
      '<button class="sbtn ssm sbtn-primary" id="sleep-ok">' + esc(okText || '确定') + '</button></div></div></div>';
    document.getElementById('sleep-ok').onclick = async () => { try { if (onOk) await onOk(); } finally { closeModal(); } };
  }
  function closeModal() { const m = document.getElementById('sleep-modal'); if (m) m.innerHTML = ''; }

  /* ================= 常量 ================= */
  const MORNING_STATES = ['很疲惫', '有点困', '正常', '精神不错', '精力充沛'];
  const BODY_STATES = ['头脑清醒', '精力充足', '情绪稳定', '身体轻松', '注意力提升', '状态一般', '仍然疲惫'];
  const NIGHT_BEHAVIORS = ['玩手机', '看视频', '工作太晚', '阅读', '拉伸', '冥想', '准备第二天计划'];
  const FAIL_REASONS = ['工作太晚', '手机时间过长', '社交活动', '情绪影响', '白天休息过多', '其他原因'];
  const CHALLENGES = [3, 7, 14, 30];
  const WEEKLY_DISCLAIM = 'AI复盘：根据已有记录数据自动分析生成，仅作为参考，请结合个人实际情况判断。';
  const MONTHLY_DISCLAIM = 'AI复盘：根据已有数据分析生成，仅作为参考，不代表医疗建议或绝对判断。';
  const AI_TAIL = 'AI根据已有数据分析生成，仅作为参考，不代表绝对结论。';

  /* ================= 存储（只读写 sleep_* 表） ================= */
  async function loadRecords() { return (await DB.list('sleep_records')) || []; }
  async function putRecord(rec) { await DB.put('sleep_records', rec); }
  async function getRecByDate(date) { return (await loadRecords()).find(r => r.date === date) || null; }
  async function loadCustom(kind) {
    const rows = (await DB.list('sleep_custom_tags')) || [];
    return rows.filter(r => r.kind === kind).map(r => r.name);
  }
  async function addCustom(kind, name) { await DB.put('sleep_custom_tags', { id: kind + ':' + name, kind, name }); }
  async function delCustom(kind, name) { await DB.delete('sleep_custom_tags', kind + ':' + name); }
  async function allOptions(kind) {
    const base = kind === 'body' ? BODY_STATES : kind === 'night' ? NIGHT_BEHAVIORS : FAIL_REASONS;
    return base.concat(await loadCustom(kind));
  }
  async function loadReviews(kind) {
    return ((await DB.list('sleep_reviews')) || []).filter(r => r.kind === kind);
  }
  async function getReview(kind, start) { return (await loadReviews(kind)).find(r => r.start === start) || null; }
  async function putReview(rv) { await DB.put('sleep_reviews', rv); }

  /* ================= 状态 ================= */
  let SUB = 'checkin';
  let _dom = null;
  let _charts = [];
  let CK = null;                    // 当前打卡（含草稿）
  let _manualSuccess = false;       // 用户是否手动设置过早睡结果
  let RV = { kind: 'weekly', start: '' };  // 当前复盘周期
  let _aiBusy = false;

  function newCheckin(date) {
    const wd = parseDS(date).getDay();
    return {
      id: uid(), date: date,
      dayType: (wd === 0 || wd === 6) ? 'rest' : 'work',   // 周末默认休息日，可改
      targetTime: '', bedtime: '', sleepTime: '',
      success: null, failReasons: [],
      wakeTime: '', sleepDuration: null, energyScore: null,
      morningStatus: '', bodyStates: [], morningNote: '', dailyLog: '',
      nightMood: null, nightStress: null, nightBehaviors: [],
      createdAt: new Date().toISOString()
    };
  }

  /* ================= render / sub ================= */
  async function render() {
    const pageContent = document.getElementById('pageContent');
    if (pageContent) pageContent.innerHTML = '';   // 清掉 router 留下的 spinner
    _dom = document.createElement('div');
    _dom.className = 'sleep';
    _dom.innerHTML =
      '<div class="sleep-topbar"><div class="sleep-title">😴 早睡打卡</div>' +
      '<div class="sleep-tabs">' +
      '<button class="sleep-tab" data-sub="checkin" onclick="SleepModule.sub(\'checkin\')">📅 打卡</button>' +
      '<button class="sleep-tab" data-sub="challenge" onclick="SleepModule.sub(\'challenge\')">🏆 挑战</button>' +
      '<button class="sleep-tab" data-sub="trends" onclick="SleepModule.sub(\'trends\')">📈 趋势</button>' +
      '<button class="sleep-tab" data-sub="reviews" onclick="SleepModule.sub(\'reviews\')">📋 复盘</button>' +
      '</div></div>' +
      '<div class="sleep-body" id="sleep-body"></div>';
    pageContent.appendChild(_dom);
    await sub(SUB);
  }
  async function sub(t) {
    SUB = t;
    destroyCharts();
    if (_dom) _dom.querySelectorAll('.sleep-tab').forEach(b => b.classList.toggle('active', b.dataset.sub === t));
    const body = document.getElementById('sleep-body');
    if (!body) return;
    if (t === 'checkin') await renderCheckin();
    else if (t === 'challenge') await renderChallenge();
    else if (t === 'trends') await renderTrends();
    else await renderReviews();
  }
  function destroyCharts() { _charts.forEach(c => { try { c.destroy(); } catch (e) { } }); _charts = []; }

  /* ================= 统计核心 ================= */
  function computeStats(recs) {
    const judged = recs.filter(r => r.success === true || r.success === false);
    const succ = judged.filter(r => r.success === true);
    const sleepMins = recs.filter(r => r.sleepTime).map(r => toMin(r.sleepTime)).filter(x => x != null);
    const wakeMins = recs.filter(r => r.wakeTime).map(r => toMin(r.wakeTime)).filter(x => x != null);
    const durs = recs.map(r => r.sleepDuration).filter(x => x != null && x > 0);
    const energy = recs.map(r => r.energyScore).filter(x => x != null);
    const st = streaks(recs);
    return {
      total: recs.length,
      judged: judged.length,
      succCount: succ.length,
      rate: judged.length ? succ.length / judged.length : null,
      avgSleep: avg(sleepMins), avgWake: avg(wakeMins),
      avgDur: avg(durs), avgEnergy: avg(energy),
      curStreak: st.cur, maxStreak: st.max
    };
  }
  /* 连续早睡：按日期排序，日期严格连续且 success=true 才累计 */
  function streaks(recs) {
    const map = {};
    recs.forEach(r => { if (r.success === true || r.success === false) map[r.date] = !!r.success; });
    const dates = Object.keys(map).sort();
    let cur = 0, max = 0, prev = null;
    for (const d of dates) {
      if (map[d]) cur = (prev && diffDays(prev, d) === 1) ? cur + 1 : 1;
      else cur = 0;
      if (cur > max) max = cur;
      prev = d;
    }
    /* 当前连续：仅当最后一条记录是今天/昨天（今天还没睡属正常）才有效 */
    if (prev && diffDays(prev, todayStr()) <= 1 && map[prev] === false) cur = 0;
    return { cur, max };
  }
  /* 睡眠时长 = 入睡 → 起床（跨午夜 +24h） */
  function calcDuration(sleepTime, wakeTime) {
    const s = toMin(sleepTime), w = toMin(wakeTime);
    if (s == null || w == null) return null;
    return w >= s ? w - s : w + 1440 - s;
  }
  function guessSuccess(rec) {
    const s = toMin(rec.sleepTime), t = toMin(rec.targetTime);
    if (s == null || t == null) return null;
    let v = s;
    if (t - s > 720) v = s + 1440;      /* 入睡在目标次日凌晨（目标23:00、入睡00:40）→ 按次日算，仍晚于目标 */
    else if (s - t > 720) v = s - 1440; /* 入睡在目标前晚（目标00:30、入睡23:50）→ 按前一晚算，早于目标 */
    return v <= t;
  }

  /* ================= 打卡页 ================= */
  async function renderCheckin() {
    const body = document.getElementById('sleep-body');
    if (!body) return;
    if (!CK || !CK.date) { CK = (await getRecByDate(todayStr())) || newCheckin(todayStr()); }
    const st = computeStats(await loadRecords());
    body.innerHTML = await checkinHtml(st);
    syncDurationLabel();
  }
  async function checkinHtml(st) {
    const bodyStates = await allOptions('body');
    const nightBehaviors = await allOptions('night');
    const failReasons = await allOptions('fail');
    const r = CK;
    let html = '';
    /* 连续徽章条 */
    html += '<div class="scard s-streak-bar">' +
      '<span class="s-streak-num">' + (st.curStreak || 0) + '</span><span class="s-streak-txt">天连续早睡</span>' +
      '<span class="s-streak-sep">·</span><span>最长 ' + (st.maxStreak || 0) + ' 天</span>' +
      (isTodaySaved() ? '<span class="s-pill saved">今日已记录 ✓</span>' : '<span class="s-pill pending">今日待记录</span>') +
      '</div>';
    /* 1 日期 */
    html += '<div class="scard">' +
      '<div class="sh-title">📅 打卡日期</div>' +
      '<div class="srow" style="flex-wrap:wrap;gap:10px;align-items:center">' +
      '<input type="date" class="sinput" style="max-width:180px" value="' + esc(r.date) + '" onchange="SleepModule.onCkDate(this.value)">' +
      '<span class="s-weekday">' + weekdayOf(r.date) + '</span>' +
      '<span class="sday-pill work' + (r.dayType === 'work' ? ' on' : '') + '" onclick="SleepModule.setDayType(\'work\')">工作日</span>' +
      '<span class="sday-pill rest' + (r.dayType === 'rest' ? ' on' : '') + '" onclick="SleepModule.setDayType(\'rest\')">休息日</span>' +
      '</div></div>';
    /* 2 睡眠目标 */
    html += '<div class="scard"><div class="sh-title">🎯 睡眠目标</div>' +
      '<div class="sgrid2">' +
      timeField('今日目标早睡时间', 'targetTime', r.targetTime, 'SleepModule.setT') +
      timeField('实际上床时间', 'bedtime', r.bedtime, 'SleepModule.setT') +
      timeField('实际入睡时间', 'sleepTime', r.sleepTime, 'SleepModule.setT') +
      '</div>' +
      '<div class="shint" id="sleep-dur-label"></div></div>';
    /* 3 早睡结果 */
    const su = r.success;
    html += '<div class="scard"><div class="sh-title">✨ 今日早睡结果</div>' +
      '<div class="ahint" style="margin-bottom:8px">第二天晨间自选；填完入睡时间后会按「入睡 ≤ 目标」自动预判，可手动修改。</div>' +
      '<div class="srow">' +
      '<button class="sbtn ' + (su === true ? 'sbtn-primary' : '') + '" onclick="SleepModule.setSuccess(true)">✅ 早睡成功</button>' +
      '<button class="sbtn ' + (su === false ? 'sbtn-danger' : '') + '" onclick="SleepModule.setSuccess(false)">❌ 未完成目标</button>' +
      '</div>';
    if (su === false) {
      html += '<div class="sfield" style="margin-top:10px"><label>晚睡原因（可多选）</label><div class="schips">' +
        failReasons.map(t => tagChip(t, r.failReasons.includes(t), 'SleepModule.toggleFailReason', 'fail', r.failReasons.includes(t) && !FAIL_REASONS.includes(t))).join('') +
        addBtn('SleepModule.addTag(\'fail\')') + '</div></div>';
    }
    html += '</div>';
    /* 4 睡前状态 */
    html += '<div class="scard"><div class="sh-title">🌙 睡前状态</div>' +
      rangeField('睡前情绪评分', 'nightMood', r.nightMood) +
      rangeField('睡前压力评分', 'nightStress', r.nightStress) +
      '<div class="sfield"><label>睡前行为（可多选）</label><div class="schips">' +
      nightBehaviors.map(t => tagChip(t, r.nightBehaviors.includes(t), 'SleepModule.toggleNightBehavior', 'night', r.nightBehaviors.includes(t) && !NIGHT_BEHAVIORS.includes(t))).join('') +
      addBtn('SleepModule.addTag(\'night\')') + '</div></div></div>';
    /* 5 晨间反馈 */
    html += '<div class="scard"><div class="sh-title">🌅 第二天晨间反馈</div>' +
      '<div class="sgrid2">' +
      timeField('起床时间', 'wakeTime', r.wakeTime, 'SleepModule.setT') +
      '<div class="sfield"><label>睡眠时长（自动计算）</label><div class="sdur" id="sleep-dur-main"></div></div>' +
      '</div>' +
      rangeField('起床后精力评分', 'energyScore', r.energyScore) +
      '<div class="sfield"><label>起床后的感受</label><div class="srow" style="flex-wrap:wrap">' +
      MORNING_STATES.map(m => '<button class="sbtn ssm ' + (r.morningStatus === m ? 'sbtn-primary' : '') + '" onclick="SleepModule.setMStatus(\'' + esc(m) + '\')">' + esc(m) + '</button>').join('') +
      '</div></div>' +
      '<div class="sfield"><label>身体和精神状态（可多选）</label><div class="schips">' +
      bodyStates.map(t => tagChip(t, r.bodyStates.includes(t), 'SleepModule.toggleBodyState', 'body', r.bodyStates.includes(t) && !BODY_STATES.includes(t))).join('') +
      addBtn('SleepModule.addTag(\'body\')') + '</div></div>' +
      '<div class="sfield"><label>今天早晨醒来的第一感觉是什么？</label>' +
      '<textarea class="stextarea" rows="3" placeholder="自由记录…" oninput="SleepModule.setNote(\'morningNote\',this.value)">' + esc(r.morningNote) + '</textarea></div>' +
      '<div class="sfield"><label>每日一句：今天睡眠让我感觉 ________</label>' +
      '<input class="sinput" value="' + esc(r.dailyLog) + '" placeholder="一句话记录今天的睡眠感受…" oninput="SleepModule.setNote(\'dailyLog\',this.value)"></div></div>';
    /* 保存 */
    html += '<div class="srow" style="margin:6px 0 30px">' +
      '<button class="sbtn sbtn-primary sblock" onclick="SleepModule.saveCheckin()">💾 保存今日打卡</button></div>';
    return html;
  }
  function timeField(label, field, val, handler) {
    return '<div class="sfield"><label>' + esc(label) + '</label>' +
      '<input type="time" class="sinput" value="' + esc(val || '') + '" onchange="' + handler + '(\'' + field + '\',this.value)"></div>';
  }
  function rangeField(label, field, val) {
    return '<div class="sfield"><label>' + esc(label) +
      '<span class="srange-val" id="rv-' + field + '">' + (val == null ? '未填' : val + ' 分') + '</span></label>' +
      '<input type="range" min="1" max="10" step="1" class="srange" value="' + (val || 5) +
      '" oninput="SleepModule.setScore(\'' + field + '\',this.value)"></div>';
  }
  function tagChip(name, on, handler, kind, deletable) {
    return '<span class="schip' + (on ? ' on' : '') + '" onclick="' + handler + '(\'' + esc(name) + '\')">' + esc(name) +
      (deletable ? '<i class="schip-x" onclick="event.stopPropagation();SleepModule.delTag(\'' + kind + '\',\'' + esc(name) + '\')">×</i>' : '') +
      '</span>';
  }
  function addBtn(handler) { return '<button class="schip-add" onclick="' + handler + '">＋ 新增</button>'; }
  function isTodaySaved() { return !!CK && CK.date === todayStr() && CK._saved; }

  /* ---------- 打卡交互 ---------- */
  async function onCkDate(v) {
    if (!v) return;
    CK = (await getRecByDate(v)) || newCheckin(v);
    _manualSuccess = CK.success != null && !!(CK._manual);
    await renderCheckin();
  }
  function setDayType(t) { CK.dayType = t; rerender(); }
  function setT(field, v) {
    CK[field] = v || '';
    CK.sleepDuration = calcDuration(CK.sleepTime, CK.wakeTime);
    /* 未手动设置结果时，按时间自动预判 */
    if (!_manualSuccess && field === 'sleepTime') {
      const g = guessSuccess(CK);
      if (g != null) CK.success = g;
    }
    rerender();
  }
  function setSuccess(v) { CK.success = v; _manualSuccess = true; CK._manual = true; if (v === true) CK.failReasons = []; rerender(); }
  function toggleFailReason(t) { arrToggle(CK.failReasons, t); rerender(); }
  function toggleNightBehavior(t) { arrToggle(CK.nightBehaviors, t); rerender(); }
  function toggleBodyState(t) { arrToggle(CK.bodyStates, t); rerender(); }
  function setScore(field, v) {
    CK[field] = +v;
    const el = document.getElementById('rv-' + field);
    if (el) el.textContent = v + ' 分';
  }
  function setMStatus(m) { CK.morningStatus = m; rerender(); }
  function setNote(field, v) { CK[field] = v; }
  function arrToggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function rerender() { renderCheckin(); }
  function syncDurationLabel() {
    CK.sleepDuration = calcDuration(CK.sleepTime, CK.wakeTime);
    const main = document.getElementById('sleep-dur-main');
    if (main) main.textContent = fmtDur(CK.sleepDuration);
    const lab = document.getElementById('sleep-dur-label');
    if (lab) lab.textContent = (CK.sleepTime && CK.wakeTime) ? ('入睡 ' + CK.sleepTime + ' → 起床 ' + CK.wakeTime + '，共 ' + fmtDur(CK.sleepDuration)) : '填完入睡时间和起床时间后自动计算。';
  }
  function addTag(kind) {
    smodal('新增自定义分类', '<input class="sinput" id="snew-tag" placeholder="输入名称（30字内）" maxlength="30">', async () => {
      const v = (document.getElementById('snew-tag').value || '').trim();
      if (!v) return;
      await addCustom(kind, v);
      stoast('已添加：' + v);
      rerender();
    }, '添加');
  }
  async function delTag(kind, name) {
    await delCustom(kind, name);
    if (kind === 'fail') arrToggle(CK.failReasons, name);
    if (kind === 'night') arrToggle(CK.nightBehaviors, name);
    if (kind === 'body') arrToggle(CK.bodyStates, name);
    stoast('已删除：' + name);
    rerender();
  }
  async function saveCheckin() {
    if (!CK.date) { stoast('请先选择日期', 'err'); return; }
    CK.sleepDuration = calcDuration(CK.sleepTime, CK.wakeTime);
    const existing = await getRecByDate(CK.date);
    if (existing) {
      CK.id = existing.id;
      CK.createdAt = existing.createdAt || CK.createdAt;
      CK._manual = _manualSuccess;
      CK._saved = true;
      await putRecord(CK);
      stoast('已更新 ' + CK.date + ' 的打卡');
    } else {
      CK._saved = true;
      await putRecord(CK);
      stoast('已保存打卡 ✓');
    }
    await renderCheckin();
  }

  /* ================= 挑战页 ================= */
  async function renderChallenge() {
    const body = document.getElementById('sleep-body');
    if (!body) return;
    const recs = await loadRecords();
    const st = computeStats(recs);
    const cur = st.curStreak || 0, max = st.maxStreak || 0;
    let html = '<div class="scard"><div class="sh-title">🏆 睡眠连续挑战</div>' +
      '<div class="schallenge-grid">';
    CHALLENGES.forEach(n => {
      const done = max >= n;
      const prog = Math.min(cur / n, 1);
      html += '<div class="schallenge-card' + (done ? ' done' : '') + '">' +
        '<div class="sch-icon">' + (done ? '🏅' : '🌙') + '</div>' +
        '<div class="sch-name">连续早睡 ' + n + ' 天</div>' +
        '<div class="sch-state">' + (done ? '已达成 ✓' : (cur > 0 ? '进行中 ' + cur + '/' + n + ' 天' : '未开始')) + '</div>' +
        '<div class="sprogress"><div class="sprogress-bar" style="width:' + Math.round(prog * 100) + '%"></div></div>' +
        '</div>';
    });
    html += '</div></div>';
    /* 总览 */
    html += '<div class="scard"><div class="sh-title">📊 总览</div><div class="sstat-grid">' +
      statCell('打卡总天数', st.total + ' 天') +
      statCell('有结果记录', st.judged + ' 天') +
      statCell('早睡成功', st.succCount + ' 天') +
      statCell('总完成率', fmtPct(st.rate)) +
      statCell('当前连续', (st.curStreak || 0) + ' 天') +
      statCell('最长连续', (st.maxStreak || 0) + ' 天') +
      statCell('平均睡眠时长', fmtDur(st.avgDur)) +
      statCell('平均入睡时间', fmtMin(st.avgSleep)) +
      statCell('平均起床时间', fmtMin(st.avgWake)) +
      statCell('平均精力评分', st.avgEnergy == null ? '—' : (Math.round(st.avgEnergy * 10) / 10) + ' 分') +
      '</div></div>';
    html += '<div class="shint" style="margin:0 4px 30px">规则：按打卡日期严格连续计算；某天未记录或未完成目标，连续天数即中断。</div>';
    body.innerHTML = html;
  }
  function statCell(label, val) { return '<div class="sstat-cell"><div class="sstat-val">' + esc(val) + '</div><div class="sstat-label">' + esc(label) + '</div></div>'; }

  /* ================= 趋势页 ================= */
  async function renderTrends() {
    const body = document.getElementById('sleep-body');
    if (!body) return;
    const recs = (await loadRecords()).slice().sort((a, b) => a.date < b.date ? -1 : 1);
    let html = '<div class="scard s-soft">📈 数据按打卡日期升序展示；折线为空说明对应字段还没有记录。</div>';
    const charts = [
      ['sleep-trend-in', '入睡时间趋势'],
      ['sleep-trend-wake', '起床时间趋势'],
      ['sleep-trend-dur', '睡眠时长趋势'],
      ['sleep-trend-energy', '精力评分趋势'],
      ['sleep-trend-rate', '早睡成功率趋势（7 日滑动）']
    ];
    charts.forEach(c => {
      html += '<div class="scard"><div class="sh-title">' + c[1] + '</div><div class="schart-wrap"><canvas id="' + c[0] + '"></canvas></div></div>';
    });
    html += '<div style="height:30px"></div>';
    body.innerHTML = html;
    drawTrendCharts(recs);
  }
  function drawTrendCharts(recs) {
    if (typeof Chart === 'undefined') return;
    destroyCharts();
    const labels = recs.map(r => r.date.slice(5).replace('-', '/'));
    const ROSE = '#e879a6', ROSE_SOFT = 'rgba(232,121,166,.15)';
    const baseOpt = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: false } }
    };
    function line(id, data, yFmt) {
      const el = document.getElementById(id);
      if (!el) return;
      const opt = JSON.parse(JSON.stringify(baseOpt));
      if (yFmt) opt.scales.y.ticks = { callback: yFmt };
      _charts.push(new Chart(el, {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: ROSE, backgroundColor: ROSE_SOFT, borderWidth: 2, pointRadius: 2, tension: .3, fill: true, spanGaps: true }] },
        options: opt
      }));
    }
    /* 入睡/起床：以基准时间偏移画图，避免跨 0 点跳水 */
    const IN_BASE = 22 * 60, WAKE_BASE = 5 * 60;
    const inData = recs.map(r => { const m = toMin(r.sleepTime); return m == null ? null : (m - IN_BASE + 1440) % 1440; });
    const wakeData = recs.map(r => { const m = toMin(r.wakeTime); return m == null ? null : (m - WAKE_BASE + 1440) % 1440; });
    line('sleep-trend-in', inData, v => fmtMin(v + IN_BASE));
    line('sleep-trend-wake', wakeData, v => fmtMin(v + WAKE_BASE));
    line('sleep-trend-dur', recs.map(r => r.sleepDuration), v => fmtDur(v));
    line('sleep-trend-energy', recs.map(r => r.energyScore));
    /* 成功率：7 日滑动窗口 */
    const rateData = recs.map((r, i) => {
      const win = recs.slice(Math.max(0, i - 6), i + 1).filter(x => x.success === true || x.success === false);
      return win.length ? win.filter(x => x.success === true).length / win.length : null;
    });
    line('sleep-trend-rate', rateData, v => Math.round(v * 100) + '%');
  }

  /* ================= 复盘页 ================= */
  function weekPeriods() {
    const today = todayStr();
    const dow = parseDS(today).getDay();                    // 0=周日
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const thisMon = addDays(today, mondayOffset);
    const list = [];
    for (let i = 0; i < 8; i++) {
      const s = addDays(thisMon, -7 * i);
      list.push({ kind: 'weekly', start: s, end: addDays(s, 6), label: (i === 0 ? '本周' : '前' + i + '周') + '（' + s.slice(5).replace('-', '/') + '~' + addDays(s, 6).slice(5).replace('-', '/') + '）' });
    }
    return list;
  }
  function monthPeriods() {
    const now = new Date();
    const list = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = fmtDate(d);
      const end = fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      list.push({ kind: 'monthly', start, end, label: d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月' });
    }
    return list;
  }
  async function renderReviews() {
    const body = document.getElementById('sleep-body');
    if (!body) return;
    const recs = await loadRecords();
    const weekly = weekPeriods(), monthly = monthPeriods();
    if (!RV.start) {
      const wk = weekPeriods(), mo = monthPeriods();
      const pool = RV.kind === 'monthly' ? mo : wk;
      const cur = pool[0];
      const has = recs.some(r => r.date >= cur.start && r.date <= cur.end);
      RV = { kind: RV.kind, start: has ? cur.start : (pool.find(w => recs.some(r => r.date >= w.start && r.date <= w.end)) || cur).start };
    }
    const periods = RV.kind === 'weekly' ? weekly : monthly;
    let html = '<div class="scard"><div class="sh-title">📋 周期复盘</div>' +
      '<div class="srow" style="margin-bottom:8px">' +
      '<button class="sbtn ssm ' + (RV.kind === 'weekly' ? 'sbtn-primary' : '') + '" onclick="SleepModule.setRVKind(\'weekly\')">周复盘</button>' +
      '<button class="sbtn ssm ' + (RV.kind === 'monthly' ? 'sbtn-primary' : '') + '" onclick="SleepModule.setRVKind(\'monthly\')">月复盘</button>' +
      '</div><div class="srow" style="flex-wrap:wrap;gap:6px">' +
      periods.map(p => '<span class="schip' + (RV.start === p.start ? ' on' : '') + '" onclick="SleepModule.setRVStart(\'' + p.start + '\')">' + esc(p.label) + '</span>').join('') +
      '</div></div>';
    const period = periods.find(p => p.start === RV.start) || periods[0];
    const range = recs.filter(r => r.date >= period.start && r.date <= period.end).sort((a, b) => a.date < b.date ? -1 : 1);
    if (!range.length) {
      html += '<div class="scard"><div class="sempty">这个周期还没有打卡记录。<br>先去「📅 打卡」记录几天数据吧。</div></div>';
      body.innerHTML = html; return;
    }
    const review = (await getReview(RV.kind, period.start)) || {
      id: (RV.kind === 'weekly' ? 'weekly:' : 'monthly:') + period.start,
      kind: RV.kind, start: period.start, end: period.end,
      personalNote: '', cats: {}, aiContent: '', aiModel: '', aiGeneratedAt: ''
    };
    RV.review = review;
    /* 数据统计 */
    const st = computeStats(range);
    const isW = RV.kind === 'weekly';
    html += '<div class="scard"><div class="sh-title">📊 数据统计</div><div class="sstat-grid">' +
      statCell(isW ? '本周目标早睡次数' : '本月打卡天数', st.total + ' 天') +
      statCell('早睡成功次数', st.succCount + ' 天') +
      statCell('完成率', fmtPct(st.rate)) +
      statCell('平均入睡时间', fmtMin(st.avgSleep)) +
      statCell('平均起床时间', fmtMin(st.avgWake)) +
      statCell('平均睡眠时长', fmtDur(st.avgDur)) +
      statCell(isW ? '连续早睡最长' : '最长连续早睡', (st.maxStreak || 0) + ' 天');
    if (!isW) {
      /* 月度：与上一周期对比变化 */
      const prevPeriod = monthPeriods().find(p => addDays(p.end, 1) === period.start);
      const prevRange = prevPeriod ? recs.filter(r => r.date >= prevPeriod.start && r.date <= prevPeriod.end) : [];
      const pst = prevRange.length ? computeStats(prevRange) : null;
      const durDelta = (st.avgDur != null && pst && pst.avgDur != null)
        ? ((st.avgDur - pst.avgDur) > 0 ? '+' : '') + fmtDur(Math.abs(st.avgDur - pst.avgDur)) : '—';
      const inDelta = (st.avgSleep != null && pst && pst.avgSleep != null)
        ? ((st.avgSleep - pst.avgSleep) > 0 ? '+' : '') + fmtDur(Math.abs(st.avgSleep - pst.avgSleep)) : '—';
      html += statCell('平均睡眠时长变化', durDelta) +
        statCell('平均入睡时间变化', inDelta) +
        statCell('睡眠趋势', st.rate == null ? '—' : (st.rate >= .7 ? '稳定向好 ↑' : st.rate >= .4 ? '波动中 ~' : '需要调整 ↓'));
    }
    html += '</div></div>';
    /* 我的个人复盘（核心，在上） */
    const cats = isW
      ? [['body', '身体变化'], ['emotion', '情绪变化'], ['work', '工作 / 学习效率变化'], ['life', '生活状态变化']]
      : [['body', '身体变化'], ['spirit', '精神状态变化'], ['emotion', '情绪变化'], ['discipline', '自律能力变化'], ['work', '工作效率变化'], ['life', '生活规律变化']];
    html += '<div class="scard s-personal"><div class="sh-title">✍️ 我的个人复盘 <span class="stag-core">核心记录</span></div>' +
      '<div class="shint" style="margin-bottom:10px">' + (isW ? '「这一周早睡有什么感受和变化？」' : '「一个月早睡后有什么感受和变化？」') + '你的主观记录是最重要的数据，会完整保留。</div>' +
      '<div class="sfield"><label>总体感受</label>' +
      '<textarea class="stextarea" id="sr-note" rows="3" placeholder="自由写下这一周期的整体感受…">' + esc(review.personalNote || '') + '</textarea></div>' +
      cats.map(c => '<div class="sfield"><label>' + c[1] + '</label>' +
        '<textarea class="stextarea" id="sr-cat-' + c[0] + '" rows="2">' + esc((review.cats && review.cats[c[0]]) || '') + '</textarea></div>').join('') +
      '<button class="sbtn sbtn-primary" onclick="SleepModule.savePersonal()">💾 保存个人复盘</button></div>';
    /* AI 复盘（在下，对话框形式） */
    const disclaim = isW ? WEEKLY_DISCLAIM : MONTHLY_DISCLAIM;
    html += '<div class="scard s-ai"><div class="sh-title">🤖 AI ' + (isW ? '周' : '月度') + '复盘</div>' +
      '<div class="sai-disclaim">' + esc(disclaim) + '</div>';
    if (review.aiContent) {
      html += '<div class="sai-thread">' +
        '<div class="sai-msg"><div class="sai-avatar">🌙</div><div class="sai-bubble">' + mdToHtml(review.aiContent) + '</div></div>' +
        '</div>' +
        '<div class="sai-meta">由 ' + esc(review.aiModel || 'AI') + ' 生成于 ' + esc((review.aiGeneratedAt || '').replace('T', ' ').slice(0, 16)) + '</div>' +
        '<div class="srow" style="margin-top:10px"><button class="sbtn ssm" ' + (_aiBusy ? 'disabled' : '') + ' onclick="SleepModule.runAI()">🔄 重新生成</button></div>';
    } else {
      html += '<div class="sai-thread"><div class="sai-msg"><div class="sai-avatar">🌙</div><div class="sai-bubble sai-empty">我还没有生成过这个周期的复盘。点击下方按钮，我会<b>根据你的打卡数据和个人复盘</b>生成分析（AI 复盘不能替代你的个人复盘，只作参考）。</div></div></div>' +
        '<div class="srow" style="margin-top:10px"><button class="sbtn sbtn-primary" ' + (_aiBusy ? 'disabled' : '') + ' onclick="SleepModule.runAI()">' + (_aiBusy ? '⏳ 生成中…' : '✨ 生成 AI ' + (isW ? '周' : '月度') + '复盘') + '</button></div>';
    }
    html += '</div><div style="height:30px"></div>';
    body.innerHTML = html;
  }
  function setRVKind(k) { RV.kind = k; RV.start = ''; destroyCharts(); renderReviews(); }
  function setRVStart(s) { RV.start = s; renderReviews(); }
  async function savePersonal() {
    const review = RV.review;
    if (!review) return;
    review.personalNote = (document.getElementById('sr-note') || {}).value || '';
    review.cats = review.cats || {};
    ['body', 'emotion', 'work', 'life', 'spirit', 'discipline'].forEach(k => {
      const el = document.getElementById('sr-cat-' + k);
      if (el) review.cats[k] = el.value;
    });
    review.updatedAt = new Date().toISOString();
    if (!review.createdAt) review.createdAt = review.updatedAt;
    await putReview(review);
    stoast('个人复盘已保存 ✓（核心数据）');
  }

  /* ================= AI 复盘（委托 AIChatModule，不接触 API key） ================= */
  function daySummaryLine(r) {
    const parts = [r.date.slice(5).replace('-', '/') + '(' + weekdayOf(r.date).replace('周', '') + ')'];
    if (r.dayType === 'rest') parts.push('休息日');
    if (r.targetTime) parts.push('目标' + r.targetTime);
    if (r.bedtime) parts.push('上床' + r.bedtime);
    if (r.sleepTime) parts.push('入睡' + r.sleepTime);
    if (r.success === true) parts.push('早睡✅');
    else if (r.success === false) parts.push('早睡❌' + (r.failReasons && r.failReasons.length ? '(' + r.failReasons.join('、') + ')' : ''));
    if (r.wakeTime) parts.push('起床' + r.wakeTime);
    if (r.sleepDuration) parts.push('时长' + fmtDur(r.sleepDuration));
    if (r.energyScore != null) parts.push('精力' + r.energyScore);
    if (r.morningStatus) parts.push('感受:' + r.morningStatus);
    if (r.bodyStates && r.bodyStates.length) parts.push('状态[' + r.bodyStates.join('、') + ']');
    if (r.nightMood != null) parts.push('睡前情绪' + r.nightMood);
    if (r.nightStress != null) parts.push('睡前压力' + r.nightStress);
    if (r.nightBehaviors && r.nightBehaviors.length) parts.push('睡前行为[' + r.nightBehaviors.join('、') + ']');
    if (r.dailyLog) parts.push('一句:' + r.dailyLog);
    return '- ' + parts.join('，');
  }
  function statsSummary(st) {
    const p = [];
    p.push('打卡 ' + st.total + ' 天，有结果 ' + st.judged + ' 天，成功 ' + st.succCount + ' 天，完成率 ' + fmtPct(st.rate));
    p.push('平均入睡 ' + fmtMin(st.avgSleep) + '，平均起床 ' + fmtMin(st.avgWake) + '，平均睡眠 ' + fmtDur(st.avgDur));
    p.push('当前连续早睡 ' + (st.curStreak || 0) + ' 天，最长连续 ' + (st.maxStreak || 0) + ' 天');
    if (st.avgEnergy != null) p.push('平均精力评分 ' + (Math.round(st.avgEnergy * 10) / 10));
    return p.join('；');
  }
  function personalSummary(review, isW) {
    if (!review || !review.personalNote) return '（用户本周期未填写个人复盘）';
    const cats = review.cats || {};
    const keys = isW ? ['body', 'emotion', 'work', 'life'] : ['body', 'spirit', 'emotion', 'discipline', 'work', 'life'];
    const names = { body: '身体', spirit: '精神', emotion: '情绪', work: '工作/效率', discipline: '自律', life: '生活' };
    let s = '总体感受：' + review.personalNote;
    keys.forEach(k => { if (cats[k]) s += '；' + names[k] + '变化：' + cats[k]; });
    return s;
  }
  async function runAI() {
    if (_aiBusy) return;
    if (typeof AIChatModule === 'undefined' || !AIChatModule.askAI) { stoast('未找到 AI 模块（跨维沟通）', 'err'); return; }
    const review = RV.review;
    if (!review) return;
    _aiBusy = true;
    try {
      const recs = (await loadRecords()).filter(r => r.date >= review.start && r.date <= review.end).sort((a, b) => a.date < b.date ? -1 : 1);
      const st = computeStats(recs);
      const isW = review.kind === 'weekly';
      const sys = '你是一位温和、专业的睡眠习惯分析助手。你只根据用户提供的数据做分析，不做医疗诊断，不下绝对结论，语气友好、具体、以鼓励为主。输出使用简体中文和 Markdown 格式（用 ## 二级标题分节）。';
      const structure = isW
        ? '## 一、睡眠趋势分析\n（入睡时间变化、起床规律变化、睡眠稳定性）\n## 二、行为分析\n（影响早睡成功的因素、晚睡主要原因）\n## 三、状态变化分析\n（精力变化趋势、情绪变化趋势、效率变化趋势）\n## 四、下周优化建议\n（下周睡眠优化建议、可以尝试的小调整）'
        : '## 一、睡眠习惯变化总结\n## 二、长期趋势分析\n## 三、成功因素分析\n## 四、影响因素分析\n## 五、下一阶段优化建议';
      const user = '请根据以下' + (isW ? '一周' : '一个月') + '早睡打卡数据生成' + (isW ? '周' : '月度') + '复盘分析。\n\n' +
        '【周期】' + review.start + ' ~ ' + review.end + '\n' +
        '【统计】' + statsSummary(st) + '\n' +
        '【逐日记录】\n' + recs.map(daySummaryLine).join('\n') + '\n\n' +
        '【用户的个人复盘（主观记录，优先尊重）】\n' + personalSummary(review, isW) + '\n\n' +
        '请严格按以下结构输出，全文不超过 700 字：\n' + structure + '\n\n' +
        '最后另起一行单独输出这句话：' + AI_TAIL;
      const res = await AIChatModule.askAI([{ role: 'system', content: sys }, { role: 'user', content: user }]);
      review.aiContent = (res.text || '').trim();
      review.aiModel = res.model || '';
      review.aiGeneratedAt = new Date().toISOString();
      review.updatedAt = review.aiGeneratedAt;
      if (!review.createdAt) review.createdAt = review.aiGeneratedAt;
      await putReview(review);
      stoast('AI 复盘已生成（仅供参考）');
    } catch (e) {
      stoast('AI 生成失败：' + (e && e.message ? e.message : '未知错误'), 'err');
    } finally {
      _aiBusy = false;
      renderReviews();
    }
  }

  /* ================= 简易 Markdown 渲染 ================= */
  function mdToHtml(s) {
    let t = esc(s);
    t = t.replace(/^## (.+)$/gm, '<div class="smd-h2">$1</div>');
    t = t.replace(/^### (.+)$/gm, '<div class="smd-h3">$1</div>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/^[-•] (.+)$/gm, '<div class="smd-li">• $1</div>');
    t = t.replace(/\n/g, '<br>');
    return t;
  }

  /* ================= 其他暴露 ================= */
  function _closeModal() { closeModal(); }
  function getState() { return { SUB, ckDate: CK && CK.date, rv: { kind: RV.kind, start: RV.start } }; }

  /* ================= 验收自测 ================= */
  async function runAcceptanceTests() {
    const T = [];
    const recs = [
      { date: '2026-09-01', sleepTime: '23:00', targetTime: '23:00', success: true, wakeTime: '07:00', sleepDuration: 480 },
      { date: '2026-09-02', sleepTime: '23:20', targetTime: '23:00', success: true, wakeTime: '07:10', sleepDuration: 470 },
      { date: '2026-09-03', sleepTime: '00:40', targetTime: '23:00', success: false, wakeTime: '08:00', sleepDuration: 440 },
      { date: '2026-09-04', sleepTime: '22:50', targetTime: '23:00', success: true, wakeTime: '06:50', sleepDuration: 480 }
    ];
    const st = computeStats(recs);
    T.push(['T1 时长计算 23:40→07:10 = 450 分', calcDuration('23:40', '07:10') === 450]);
    T.push(['T2 时长跨午夜 00:30→07:00 = 390 分', calcDuration('00:30', '07:00') === 390]);
    T.push(['T3 完成率 = 3/4 = 75%', st.rate === 0.75]);
    T.push(['T4 平均睡眠时长 = 467.5 分', Math.abs(st.avgDur - 467.5) < 0.01]);
    T.push(['T5 最长连续 = 2 天（09-01~09-02）', st.maxStreak === 2]);
    T.push(['T6 预判成功：入睡 22:50 ≤ 目标 23:00', guessSuccess({ sleepTime: '22:50', targetTime: '23:00' }) === true]);
    T.push(['T7 预判失败：入睡 00:40 > 目标 23:00', guessSuccess({ sleepTime: '00:40', targetTime: '23:00' }) === false]);
    const wk = weekPeriods();
    T.push(['T8 周期列表 8 个且本周起点是周一', wk.length === 8 && weekdayOf(wk[0].start) === '周一']);
    T.push(['T9 周周期跨度 7 天', diffDays(wk[0].start, wk[0].end) === 6]);
    const mo = monthPeriods();
    T.push(['T10 月周期列表 6 个', mo.length === 6]);
    T.push(['T11 免责声明文案正确', WEEKLY_DISCLAIM.includes('仅作为参考') && MONTHLY_DISCLAIM.includes('不代表医疗建议')]);
    T.push(['T12 md 渲染标题', mdToHtml('## 标题').includes('smd-h2')]);
    T.push(['T13 md 渲染转义（防注入）', mdToHtml('<scr' + 'ipt>').includes('&lt;scr' + 'ipt&gt;')]);
    T.push(['T14 streaks 断档中断（09-05 未记，09-06 成功）', streaks(recs.concat([{ date: '2026-09-06', success: true }])).max === 2]);
    return T;
  }

  /* ================= 对外暴露 ================= */
  return {
    render, sub, _VERSION: '2026-09-09-早睡打卡模块',
    onCkDate, setDayType, setT, setSuccess, setScore, setMStatus, setNote,
    toggleFailReason, toggleNightBehavior, toggleBodyState,
    addTag, delTag, saveCheckin,
    setRVKind, setRVStart, savePersonal, runAI,
    _closeModal, getState, runAcceptanceTests
  };
})();

/* 挂载到 window（供 onclick 调用） */
if (typeof window !== 'undefined') {
  window.SleepModule = SleepModule;
}

