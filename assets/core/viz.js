/* =========================================================
   地质剖面可视化 Viz
   ---------------------------------------------------------
   一套"深度剖面"语言：
     · 首页     交互式储层剖面（流体 / 断层 / 井 / 压力系数）
     · 作业链   13 个环节各一张缩略剖面（剖面胶片）
     · 环节页   本环节在剖面中的作用井段
     · 场景页   本场景的目标层段定位
     · 方法页   该方法跨环节的深度分布
   数据全部为教学用合成数据，层位与井名为示意。
   ========================================================= */

(function (global) {
  'use strict';

  /* =========================================================
     〇、基础工具
     ========================================================= */
  var UID = 0;
  function uid(p) { UID += 1; return (p || 'vz') + UID; }
  function f(n) { return Math.round(n * 100) / 100; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function tag(name, attrs, inner) {
    var s = '<' + name;
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      s += ' ' + k + '="' + String(v).replace(/"/g, '&quot;') + '"';
    }
    return s + (inner == null ? '/>' : '>' + inner + '</' + name + '>');
  }
  function smoothstep(u) { return u * u * (3 - 2 * u); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Catmull-Rom 闭合路径 */
  function crPath(points, closed, k) {
    var n = points.length;
    if (n < 2) return '';
    k = k == null ? 0.75 : k;
    function P(i) { return points[((i % n) + n) % n]; }
    var out = ['M' + f(points[0][0]) + ' ' + f(points[0][1])];
    var end = closed ? n : n - 1;
    for (var i = 0; i < end; i++) {
      var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6 * k, p1[1] + (p2[1] - p0[1]) / 6 * k];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6 * k, p2[1] - (p3[1] - p1[1]) / 6 * k];
      out.push('C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(p2[0]) + ' ' + f(p2[1]));
    }
    if (closed) out.push('Z');
    return out.join('');
  }
  function polyPath(points) {
    if (!points.length) return '';
    var out = ['M' + f(points[0][0]) + ' ' + f(points[0][1])];
    for (var i = 1; i < points.length; i++) out.push('L' + f(points[i][0]) + ' ' + f(points[i][1]));
    return out.join('');
  }

  /* 视口：t ∈ [0,1] → x，深度 → y */
  function View(L, R, T, B, zmin, zmax) {
    return {
      L: L, R: R, T: T, B: B, zmin: zmin, zmax: zmax,
      x: function (t) { return L + t * (R - L); },
      y: function (d) { return T + (d - zmin) / (zmax - zmin) * (B - T); },
      zAt: function (y) { return zmin + (y - T) / (B - T) * (zmax - zmin); }
    };
  }

  /* =========================================================
     一、地质模型（示意 · 渤海湾盆地型）
     ========================================================= */
  var ZMIN = 950, ZMAX = 6200;
  var FAULT_T = 0.80, FAULT_SHIFT = 0.014;

  var CTRL_T = [0, .16, .34, .52, .68, .79, .88, 1];

  /* 层位深度控制点（左深右浅，沙三段为烃源岩、沙四段含盐膏岩） */
  var HORIZONS = [
    [1180, 1170, 1160, 1150, 1140, 1130, 1120, 1110], /* 馆陶组顶 */
    [1720, 1680, 1630, 1560, 1480, 1420, 1370, 1340], /* 东营组底 */
    [2200, 2150, 2080, 1980, 1860, 1770, 1700, 1660], /* 沙一段底 */
    [2580, 2520, 2430, 2310, 2150, 2050, 1960, 1900], /* 沙二段底 */
    [3320, 3240, 3120, 2950, 2730, 2570, 2430, 2340], /* 沙三段底 */
    [4380, 4280, 4120, 3890, 3570, 3350, 3140, 3020], /* 沙四段底 */
    [5950, 5850, 5680, 5420, 5000, 4660, 4340, 4150]  /* 基底 */
  ];

  var STRATA = [
    { i: 0, key: 'tao', name: '馆陶组', sub: '砂泥岩互层' },
    { i: 1, key: 'dong', name: '东营组', sub: '厚层泥岩' },
    { i: 2, key: 's1', name: '沙一段', sub: '泥岩夹薄砂' },
    { i: 3, key: 's2', name: '沙二段', sub: '砂泥互层' },
    { i: 4, key: 's3', name: '沙三段', sub: '烃源岩' },
    { i: 5, key: 's4', name: '沙四段', sub: '盐膏岩' }
  ];

  function baseDepth(i, t) {
    var arr = HORIZONS[i];
    for (var s = 0; s < CTRL_T.length - 1; s++) {
      if (t <= CTRL_T[s + 1] || s === CTRL_T.length - 2) {
        var u = (t - CTRL_T[s]) / (CTRL_T[s + 1] - CTRL_T[s]);
        u = clamp(u, 0, 1);
        var v = arr[s] + (arr[s + 1] - arr[s]) * smoothstep(u);
        return v + Math.sin(t * 8.4 + i * 1.7) * (7 + i * 1.6);
      }
    }
    return arr[arr.length - 1];
  }

  /* 边界正断层：右侧断块抬升，抬升量随深度增大 */
  function uplift(t, d) {
    if (t <= FAULT_T) return d;
    var f = FAULT_SHIFT + 0.095 * (d / ZMAX);
    return d * (1 - f);
  }
  function hz(i, t) { return uplift(t, baseDepth(i, t)); }

  /* 含断层跳跃的采样点 */
  function tSamples(t0, t1, n) {
    var out = [], i;
    for (i = 0; i <= n; i++) out.push(t0 + (t1 - t0) * i / n);
    if (t0 < FAULT_T && t1 > FAULT_T) {
      out.push(FAULT_T - 0.0008);
      out.push(FAULT_T + 0.0008);
      out.sort(function (a, b) { return a - b; });
    }
    return out;
  }

  /* 地层带：层位 i 与 i+1 之间 */
  function bandPath(i, v, n) {
    var ts = tSamples(0, 1, n || 84), top = [], bot = [], k;
    for (k = 0; k < ts.length; k++) top.push([v.x(ts[k]), v.y(hz(i, ts[k]))]);
    for (k = ts.length - 1; k >= 0; k--) bot.push([v.x(ts[k]), v.y(hz(i + 1, ts[k]))]);
    return polyPath(top.concat(bot)) + 'Z';
  }

  /* 流体区（点列以 [t, 深度] 定义） */
  function zpath(points, v) {
    var pts = [];
    for (var i = 0; i < points.length; i++) {
      pts.push([v.x(points[i][0]), v.y(uplift(points[i][0], points[i][1]))]);
    }
    return crPath(pts, true, 0.8);
  }

  /* 沿某层位的上边缘取点 */
  function alongTop(i, t0, t1, n, dz) {
    var pts = [], k, t;
    for (k = 0; k <= n; k++) {
      t = t0 + (t1 - t0) * k / n;
      pts.push([t, baseDepth(i, t) + (dz || 0)]);
    }
    return pts;
  }

  /* ---- 流体区几何 ---- */
  var GAS = alongTop(0, .03, .585, 7, 26).concat([
    [.60, 1880], [.57, 2010], [.50, 2105], [.42, 2155], [.34, 2190],
    [.26, 2215], [.18, 2220], [.10, 2205], [.03, 2160]
  ]);
  var OIL = [
    [.03, 3360], [.10, 3330], [.18, 3285], [.27, 3250], [.35, 3228],
    [.44, 3205], [.50, 3240], [.55, 3310], [.585, 3490], [.60, 3650],
    [.58, 3910], [.54, 4100], [.49, 4250], [.43, 4360], [.35, 4420],
    [.26, 4460], [.17, 4475], [.08, 4450], [.03, 4410]
  ];
  var WATER_L = [
    [.615, 1520], [.66, 1490], [.71, 1462], [.75, 1450], [.797, 1445],
    [.797, 3930], [.76, 4075], [.70, 4205], [.655, 4085], [.60, 3480]
  ];
  var WATER_R = [
    [.803, 1435], [.84, 1390], [.89, 1350], [.94, 1318], [.985, 1300],
    [.985, 3570], [.95, 3695], [.90, 3855], [.86, 3985], [.83, 3935], [.803, 3890]
  ];
  var COND = [
    [.03, 4560], [.09, 4525], [.15, 4518], [.21, 4540], [.26, 4605],
    [.29, 4870], [.27, 5040], [.24, 5160], [.18, 5250], [.10, 5300], [.03, 5335]
  ];
  var DRY = [
    [.03, 5370], [.08, 5300], [.14, 5270], [.22, 5235], [.29, 5285],
    [.34, 5360], [.42, 5505], [.47, 5610], [.52, 5665], [.48, 5810],
    [.42, 5900], [.30, 5960], [.16, 5975], [.06, 5965]
  ];
  var CAP = [[.50, 3180], [.57, 3205], [.57, 3305], [.50, 3290]];

  var CONTACT = [[.615, 2560], [.60, 3200], [.59, 3760], [.615, 4155]];

  /* 交互信息 */
  var ZONE_INFO = {
    gas: {
      label: '浅层气区', meta: '馆陶组—沙二段 · 1200–2200 m · 含气饱和度 0.55–0.72',
      desc: '气层集中在构造高点与砂体上倾方向，气顶压力系数偏低，是浅层气与气顶开发的典型目标。',
      href: '#/stage/production', hrefLabel: '采油'
    },
    oil: {
      label: '主力油区', meta: '沙三段—沙四段 · 3200–4470 m · 含油饱和度 0.58–0.70',
      desc: '受构造与砂体双重控制，油层连片但非均质性强，注采井网与射孔层段要逐层对应。',
      href: '#/stage/welllog', hrefLabel: '测井'
    },
    water: {
      label: '边底水区', meta: '东营组—沙四段 · 1450–4300 m · 含水饱和度 > 0.75',
      desc: '断层与砂体输导形成边底水，开发中后期水淹方向决定了剩余油分布与堵水调剖方案。',
      href: '#/stage/production', hrefLabel: '采油'
    },
    cond: {
      label: '凝析气区', meta: '沙四段下部 · 4520–5330 m · 压力系数 1.35–1.5',
      desc: '高温高压、反凝析风险高，钻井液密度窗口窄，完井与生产制度都需要按相态设计。',
      href: '#/stage/completion', hrefLabel: '完井'
    },
    dry: {
      label: '干层 / 致密带', meta: '沙四段底部 · 5230–5970 m · 孔隙度 < 8%',
      desc: '物性致密、含油饱和度低，常规试油多为干层；需要压裂改造才可能获得工业产能。',
      href: '#/stage/perforation', hrefLabel: '射孔'
    },
    cap: {
      label: '气顶', meta: '沙三段顶部 · 3180–3305 m · 气油比高',
      desc: '油藏顶部的次生气顶，开发时要控制压差，避免气窜与原油脱气。',
      href: '#/stage/production', hrefLabel: '采油'
    }
  };

  var WELLS = [
    { name: 'Fsh2', t: .115, td: 5100, perfs: [[3360, 3500], [4150, 4280]], kind: '生产井', note: '穿过多套含油层系，上部射孔段对应沙三段 Ⅰ 油组。' },
    { name: 'Fsh1', t: .265, td: 4700, perfs: [[3180, 3300], [4380, 4460]], kind: '生产井', note: '位于断块高部位，沙四段射孔段含水上升较快。' },
    { name: 'Y22-22', t: .455, td: 5600, perfs: [[3330, 3470], [4020, 4180]], kind: '评价井', note: '深井，兼探沙四段凝析气，井底温度超过 150 ℃。' },
    { name: 'Y16', t: .72, td: 4900, perfs: [[2480, 2620], [3520, 3660]], kind: '注水井', note: '靠近边界断层，注水受效方向受断层遮挡影响明显。' }
  ];

  var FAULTS = [
    { id: 'F1', t: .80, d0: 980, d1: 6150, main: true, label: '边界正断层', meta: '断距 300–700 m · 倾向 SE', desc: '控制断块与流体分布的边界断层，上升盘沙三段埋深变浅，是油气汇聚的主要方向。' },
    { id: 'F2', t: .365, d0: 2240, d1: 4300, main: false, label: '次级正断层', meta: '断距 60–140 m · 倾向 SE', desc: '把主力油区切成两个断块，局部影响注采连通关系。' },
    { id: 'F3', t: .525, d0: 1050, d1: 2700, main: false, label: '次级正断层', meta: '断距 40–90 m', desc: '浅层小断层，影响浅层气与边水的连通。' },
    { id: 'F4', t: .645, d0: 1050, d1: 1900, main: false, label: '次级正断层', meta: '断距 30–60 m', desc: '东营组内部小断层，对开发井网影响有限。' }
  ];

  var PRESSURES = [
    { k: '1.2', base: 3360, info: '压力系数 1.2 · 常压—弱超压' },
    { k: '1.3', base: 3820, info: '压力系数 1.3 · 弱超压' },
    { k: '1.4', base: 4280, info: '压力系数 1.4 · 超压' },
    { k: '1.5', base: 4760, info: '压力系数 1.5 · 强超压' }
  ];

  var PRESSURE_INFO = {
    label: '压力系数等值线', meta: '沙三段—沙四段 · 1.2–1.5',
    desc: '压力系数自浅至深由 1.2 升到 1.5，沙四段超压明显，钻井液密度窗口与井身结构要据此设计。',
    href: '#/stage/drilling', hrefLabel: '钻井'
  };

  /* =========================================================
     二、13 个环节的剖面信息与图标
     ========================================================= */
  var STAGE_INFO = {
    geology: {
      d: [950, 1280], zone: '地表—浅层', key: '露头 / 遥感 / 化探',
      head: '在钻头到达之前，先把地下"看"一遍',
      note: '遥感影像、地球化学采样与露头测量，是地下信息的第一手来源。这一环节不进入井筒，但决定了后面所有工程的目标区。',
      glyph: 'geology'
    },
    seismic: {
      d: [1200, 5700], zone: '全深度成像', key: '炮点 / 检波器 / 偏移',
      head: '用地震波给地下做一次"CT"',
      note: '震源与检波器都布置在地表，成像面却覆盖整个沉积层。剖面里的每一道反射，对应一个地层界面。',
      glyph: 'seismic'
    },
    drilling: {
      d: [950, 4850], zone: '井口—完钻井深', key: '井眼轨迹 / 钻井液 / 机械钻速',
      head: '全井段都是钻井的工作面',
      note: '从井口到靶点，井筒穿过馆陶组到沙四段。井眼轨迹、钻井液性能与机械钻速，决定了能不能安全到达目的层。',
      glyph: 'drilling'
    },
    mudlogging: {
      d: [950, 4850], zone: '井底—返出地面', key: '岩屑 / 气测 / 钻时',
      head: '随钻返出的岩屑与气体，是井下的实时快照',
      note: '钻井液把井底信息带回地面：岩屑判岩性、气测找显示、钻时看可钻性。信息延迟一个循环周期，是这类任务天然的难点。',
      glyph: 'mudlogging'
    },
    welllog: {
      d: [1500, 5250], zone: '裸眼井段', key: 'GR / 电阻率 / 密度 / 声波',
      head: '把井筒周围的岩性变成一条条曲线',
      note: '测井仪器沿井筒上提，记录电阻率、密度、声波等响应。一条曲线对应一段地层，分层解释是储层参数计算的第一步。',
      glyph: 'welllog'
    },
    cementing: {
      d: [950, 4850], zone: '套管环空', key: '水泥浆密度 / 顶替效率 / 胶结',
      head: '在套管与井壁之间，注满一整圈水泥',
      note: '水泥浆从套管底部的浮箍返到设计高度，把套管与地层封隔开。顶替效率与胶结质量，直接决定后续层间是否串通。',
      glyph: 'cementing'
    },
    completion: {
      d: [1800, 5050], zone: '完井井段', key: '完井方式 / 管柱 / 滑套',
      head: '把一口井，变成可以长期生产的通道',
      note: '完井决定油流从地层到井筒的路径：套管射孔、筛管、分段压裂或是智能滑套。选择依据是储层类型与开发方式。',
      glyph: 'completion'
    },
    perforation: {
      d: [2800, 5050], zone: '目的层', key: '孔密 / 相位 / 穿深',
      head: '在套管上打开一扇通往储层的门',
      note: '射孔弹在目的层段穿透套管与水泥环，形成孔道。孔密、相位与穿深，决定了产能与出砂风险之间的平衡。',
      glyph: 'perforation'
    },
    production: {
      d: [2800, 5050], zone: '生产层段', key: '产液量 / 含水 / 井底流压',
      head: '把地下的油，稳定地举到地面',
      note: '生产层段的流入动态、井筒举升与地面集输连成一条链。含水上升、结蜡与泵况变化，是最常见的三类生产问题。',
      glyph: 'production'
    },
    workover: {
      d: [950, 5050], zone: '全井筒', key: '修井液 / 打捞 / 套管损伤',
      head: '当井"生病"时，回到井筒里动手术',
      note: '落物、套管变形、出水层段需要封堵——修井作业在同一个井筒里完成诊断与处置，停井时间就是成本。',
      glyph: 'workover'
    },
    eor: {
      d: [2600, 5050], zone: '注入层段', key: '注入介质 / 配注 / 波及体积',
      head: '往地层里注入一种介质，把剩下的油驱出来',
      note: '水驱、聚合物驱、蒸汽吞吐或化学驱，都是在注入井与生产井之间建立新的驱替关系。配方与配注参数决定波及效率。',
      glyph: 'eor'
    },
    transport: {
      d: [950, 1060], zone: '地面集输', key: '流量 / 压力 / 泄漏 / 计量',
      head: '油气离开井口之后，先进入管网',
      note: '集输管网把各井产物汇集到处理站。泄漏检测、计量校正与工况优化，都发生在这一层地面设施里。',
      glyph: 'transport'
    },
    refining: {
      d: [950, 1060], zone: '地面炼厂', key: '进料性质 / 操作参数 / 产品质量',
      head: '从原油到产品，最后一段是加工',
      note: '常减压、催化裂化与产品精制，把原油变成燃料与化工原料。原料性质波动与操作参数耦合，是优化与软测量的主战场。',
      glyph: 'refining'
    }
  };

  /* ---- 图标（40×40 坐标系，描边线条） ---- */
  var GLYPH = {
    geology: '<path d="M2 34h36"/><path d="M2 31l9-12 7 6 8-13 12 19"/><path d="M8 34h9M21 31h7M32 34h4"/>' +
      '<circle cx="31" cy="10" r="3.2"/><path d="M31 13.2v4"/>',
    seismic: '<path d="M3 24h18v6H3z"/><circle cx="8" cy="32" r="2.6"/><circle cx="17" cy="32" r="2.6"/>' +
      '<path d="M2 28v5"/><path d="M26 20a10 10 0 0 1 0 18M29 23a6.5 6.5 0 0 1 0 12M32 26a3.2 3.2 0 0 1 0 6"/>' +
      '<path d="M2 37h36"/>',
    drilling: '<path d="M7 35L17 5l10 30"/><path d="M10 27h14M12 21h10M14 14h6"/>' +
      '<path d="M17 5v32"/><path d="M13.5 37h7"/>',
    mudlogging: '<path d="M3 22h26l-4 11H7z"/><path d="M6 25l18 4M7 30l18 4"/>' +
      '<path d="M29 25h8v9"/><path d="M5 16c4-8 8 4 12-5 2-4 4-2 5 1"/>',
    welllog: '<rect x="17" y="9" width="7" height="22" rx="3.5"/><path d="M20.5 9V3"/>' +
      '<circle cx="20.5" cy="15" r=".9" class="fill"/><circle cx="20.5" cy="21" r=".9" class="fill"/>' +
      '<path d="M28 9q4 4 0 8t0 8 0 8"/>',
    cementing: '<path d="M8 6v30M32 6v30"/><path d="M15 6v30M25 6v30"/>' +
      '<circle cx="11.5" cy="12" r="1" class="fill"/><circle cx="28.5" cy="17" r="1" class="fill"/>' +
      '<circle cx="11.5" cy="24" r="1" class="fill"/><circle cx="28.5" cy="29" r="1" class="fill"/>' +
      '<rect x="17" y="30" width="6" height="6" rx="1"/>',
    completion: '<path d="M20 3v34"/><path d="M11 18h18l-3 4H14z"/><path d="M14 30h12M14 33h12M14 36h12"/>' +
      '<path d="M8 18h3M29 18h3"/>',
    perforation: '<rect x="17" y="6" width="6" height="12" rx="1"/><path d="M8 6v30M32 6v30"/>' +
      '<path d="M17 18l-6 5M23 18l6 5M20 18v6"/>' +
      '<circle cx="8.6" cy="24" r="1.4" class="fill"/><circle cx="31.4" cy="24" r="1.4" class="fill"/>',
    production: '<path d="M4 36h32"/><path d="M11 36l6-15"/><path d="M6 21l22 3"/>' +
      '<path d="M28 19q6 1 5 6"/><circle cx="17" cy="30" r="4"/><path d="M34 12h5M36 9l3 3-3 3"/>',
    workover: '<path d="M11 36L20 4l9 32"/><path d="M14 27h12M16 20h8"/><path d="M20 10v9"/>' +
      '<rect x="17" y="19" width="6" height="9" rx="1"/><path d="M15 33h10"/>',
    eor: '<path d="M8 36V5M32 36V5"/><path d="M8 20c7 5 17 5 24 0"/><path d="M20 9v6"/>' +
      '<circle cx="14" cy="24" r="1.1" class="fill"/><circle cx="20" cy="26" r="1.1" class="fill"/><circle cx="26" cy="24" r="1.1" class="fill"/>',
    transport: '<path d="M2 26h36"/><path d="M8 26v6M28 26v6"/><rect x="16" y="16" width="8" height="8" rx="1"/>' +
      '<path d="M36 26V14h-6"/><path d="M2 37h36"/>',
    refining: '<rect x="5" y="12" width="6" height="24"/><rect x="17" y="5" width="6" height="31"/><rect x="29" y="16" width="6" height="20"/>' +
      '<path d="M2 36h36M8 12V7M20 5V2M32 16v-4"/>'
  };

  function glyphSVG(stageId, x, y, size, opt) {
    opt = opt || {};
    var inner = GLYPH[stageId] || GLYPH.geology;
    var s = size / 40;
    var box = '';
    if (opt.box !== false) {
      box = tag('rect', {
        class: 'vz-glyph-box', x: f(x - 2), y: f(y - 2),
        width: f(size + 4), height: f(size + 4), rx: 5
      });
    }
    return box + '<g class="vz-glyph" transform="translate(' + f(x) + ' ' + f(y) + ') scale(' + f(s) + ')">' +
      inner + '</g>';
  }

  /* =========================================================
     三、交互式储层剖面
     ========================================================= */
  function section() {
    var W = 1200, H = 660;
    var L = 78, R = 938, T = 96, B = 600;
    var v = View(L, R, T, B, ZMIN, ZMAX);
    var id = uid('sec');
    var clipPlot = id + '-plot';
    var clipGas = id + '-gas', clipOil = id + '-oil', clipWL = id + '-wl', clipWR = id + '-wr';
    var clipCond = id + '-cond', clipDry = id + '-dry', clipTr = id + '-tr';
    var gradContact = id + '-contact';

    var svg = [];
    var defs = [];

    defs.push(tag('clipPath', { id: clipPlot }, tag('rect', {
      x: L, y: T, width: R - L, height: B - T
    })));
    defs.push(tag('clipPath', { id: clipGas }, tag('path', { d: zpath(GAS, v) })));
    defs.push(tag('clipPath', { id: clipOil }, tag('path', { d: zpath(OIL, v) })));
    defs.push(tag('clipPath', { id: clipWL }, tag('path', { d: zpath(WATER_L, v) })));
    defs.push(tag('clipPath', { id: clipWR }, tag('path', { d: zpath(WATER_R, v) })));
    defs.push(tag('clipPath', { id: clipCond }, tag('path', { d: zpath(COND, v) })));
    defs.push(tag('clipPath', { id: clipDry }, tag('path', { d: zpath(DRY, v) })));
    defs.push(tag('clipPath', { id: clipTr }, tag('path', { d: zpath(OIL, v) })));
    defs.push(tag('linearGradient', {
      id: gradContact, gradientUnits: 'userSpaceOnUse',
      x1: f(v.x(.54)), y1: f(v.y(2500)), x2: f(v.x(.72)), y2: f(v.y(4300))
    },
      tag('stop', { offset: '0', 'stop-color': 'var(--viz-oil)', 'stop-opacity': '.65' }) +
      tag('stop', { offset: '.45', 'stop-color': '#c07a52', 'stop-opacity': '.55' }) +
      tag('stop', { offset: '1', 'stop-color': 'var(--viz-water)', 'stop-opacity': '.62' })
    ));

    /* 岩性花纹 */
    defs.push(tag('pattern', {
      id: id + '-src', width: 15, height: 11, patternUnits: 'userSpaceOnUse'
    },
      '<path d="M1 3h7M8 8h5" stroke="#9aa894" stroke-width="1" opacity=".55"/>' +
      '<path d="M10 3h3" stroke="#9aa894" stroke-width="1" opacity=".35"/>'
    ));
    defs.push(tag('pattern', {
      id: id + '-salt', width: 14, height: 14, patternUnits: 'userSpaceOnUse'
    },
      '<path d="M2 12L12 2M6 14L14 6" stroke="#b9a6ad" stroke-width="1" opacity=".6"/>'
    ));
    defs.push(tag('pattern', {
      id: id + '-dot', width: 12, height: 12, patternUnits: 'userSpaceOnUse'
    },
      '<circle cx="3" cy="3" r="1" fill="#8d7a5e" opacity=".55"/>'
    ));

    /* ---------- 坐标与网格 ---------- */
    var axis = [];
    for (var d = 1000; d <= 6000; d += 500) {
      var y = v.y(d);
      axis.push(tag('line', { class: 'vz-grid', x1: L, y1: f(y), x2: R, y2: f(y) }));
      axis.push(tag('line', { class: 'vz-axis-tick', x1: L - 5, y1: f(y), x2: L, y2: f(y) }));
      axis.push(tag('text', {
        class: 'vz-axis-label', x: L - 9, y: f(y + 3.4), 'text-anchor': 'end'
      }, String(d)));
    }
    axis.push(tag('text', {
      class: 'vz-axis-title', x: 26, y: (T + B) / 2 + 34,
      transform: 'rotate(-90 26 ' + ((T + B) / 2 + 34) + ')', 'text-anchor': 'middle'
    }, '深度 / m'));

    /* ---------- 地层带 ---------- */
    var bands = [];
    STRATA.forEach(function (s) {
      bands.push(tag('path', {
        class: 'vz-band', 'data-l': s.key, d: bandPath(s.i, v)
      }));
    });
    /* 岩性花纹覆盖层 */
    bands.push(tag('path', {
      d: bandPath(4, v), fill: 'url(#' + id + '-src)', opacity: '.55'
    }));
    bands.push(tag('path', {
      d: bandPath(5, v), fill: 'url(#' + id + '-salt)', opacity: '.5'
    }));
    /* 基底：层位 6 以下 */
    var baseTop = [], baseBot = [], baseTs = tSamples(0, 1, 60), bk;
    for (bk = 0; bk < baseTs.length; bk++) baseTop.push([v.x(baseTs[bk]), v.y(hz(6, baseTs[bk]))]);
    baseBot.push([R, B + 20], [L, B + 20]);
    bands.push(tag('path', {
      class: 'vz-band', 'data-l': 'base', d: polyPath(baseTop.concat(baseBot)) + 'Z'
    }));
    /* 地层名 */
    STRATA.forEach(function (s) {
      var t = 0.022;
      var mid = (hz(s.i, t) + hz(s.i + 1, t)) / 2;
      var yy = v.y(mid);
      if (yy < T + 14 || yy > B - 6) return;
      bands.push(tag('text', {
        class: 'vz-strat-label', x: L + 7, y: f(yy - 2)
      }, s.name));
      if (yy < B - 16) {
        bands.push(tag('text', {
          class: 'vz-strat-sub', x: L + 7, y: f(yy + 10)
        }, s.sub));
      }
    });
    /* 层位线 */
    for (var hi = 0; hi <= 6; hi++) {
      var pts = [], ts = tSamples(0, 1, 90), k;
      for (k = 0; k < ts.length; k++) pts.push([v.x(ts[k]), v.y(hz(hi, ts[k]))]);
      bands.push(tag('path', {
        d: polyPath(pts), fill: 'none', stroke: 'rgba(120,110,88,.35)', 'stroke-width': hi === 0 || hi === 6 ? 1.2 : .8
      }));
    }

    /* ---------- 流体区 ---------- */
    var zones = [];
    function zone(key, points, extra) {
      var info = ZONE_INFO[key];
      var d = zpath(points, v);
      zones.push(tag('path', {
        class: 'vz-zone', 'data-f': key, d: d,
        'data-vz-info': '1',
        'data-label': info.label, 'data-meta': info.meta, 'data-desc': info.desc,
        'data-href': info.href, 'data-href-label': info.hrefLabel,
        'aria-label': info.label
      }));
      return d;
    }

    zone('water', WATER_R);
    zone('water', WATER_L);
    zone('gas', GAS);
    zone('oil', OIL);
    zone('cond', COND);
    zone('dry', DRY);
    zone('cap', CAP, 'cap');

    /* 小层线（砂体内部纹理） */
    function laminae(clip, d0, d1, step, cls) {
      var g = [];
      for (var dd = d0; dd <= d1; dd += step) {
        var pts = [], tt;
        for (tt = 0; tt <= 1.0001; tt += .025) {
          pts.push([v.x(tt), v.y(uplift(tt, dd + Math.sin(tt * 7 + dd) * 9))]);
        }
        g.push(tag('path', { d: polyPath(pts) }));
      }
      return tag('g', { class: 'vz-laminae ' + (cls || ''), 'clip-path': 'url(#' + clip + ')' }, g.join(''));
    }
    zones.push(laminae(clipGas, 1250, 2180, 150));
    zones.push(laminae(clipOil, 3260, 4430, 150, 'vz-laminae-oil'));
    zones.push(laminae(clipWL, 1500, 3900, 190));
    zones.push(laminae(clipWR, 1350, 3550, 190));
    zones.push(laminae(clipCond, 4570, 5260, 130));

    /* 砂体轮廓线 */
    var lens = [];
    var lensDefs = [
      [[.06, 3420], [.20, 3380], [.32, 3340], [.30, 3420], [.18, 3460], [.06, 3470]],
      [[.10, 3720], [.26, 3660], [.42, 3600], [.40, 3700], [.24, 3760], [.10, 3780]],
      [[.05, 4050], [.18, 4000], [.32, 3960], [.30, 4060], [.16, 4110], [.05, 4110]],
      [[.10, 1350], [.22, 1320], [.34, 1300], [.33, 1380], [.20, 1420], [.10, 1410]],
      [[.35, 1700], [.45, 1670], [.53, 1650], [.52, 1730], [.43, 1760], [.35, 1750]],
      [[.66, 2000], [.74, 1950], [.78, 1920], [.78, 2010], [.72, 2050], [.66, 2060]],
      [[.70, 2600], [.78, 2540], [.86, 2480], [.84, 2600], [.76, 2660], [.70, 2670]],
      [[.74, 3300], [.82, 3220], [.90, 3160], [.88, 3300], [.80, 3380], [.74, 3390]],
      [[.64, 1800], [.72, 1760], [.79, 1740], [.78, 1830], [.70, 1870], [.64, 1870]],
      [[.66, 2350], [.75, 2300], [.79, 2280], [.78, 2380], [.70, 2420], [.66, 2410]],
      [[.66, 3100], [.74, 3050], [.79, 3020], [.78, 3140], [.70, 3180], [.66, 3170]],
      [[.84, 1900], [.90, 1860], [.94, 1840], [.93, 1930], [.88, 1970], [.84, 1960]],
      [[.85, 2700], [.91, 2650], [.95, 2620], [.94, 2720], [.89, 2760], [.85, 2750]]
    ];
    lensDefs.forEach(function (lp) {
      lens.push(tag('path', { class: 'vz-lens-line', d: zpath(lp, v) }));
    });

    /* 油水过渡带：压在色块下方，只在油水接缝处露出一条渐变 */
    var contactPts = CONTACT.map(function (p) {
      return [v.x(p[0]), v.y(uplift(p[0], p[1]))];
    });
    var contact = tag('path', {
      class: 'vz-contact', d: crPath(contactPts, false, .5),
      stroke: 'url(#' + gradContact + ')', 'stroke-width': 34, 'stroke-opacity': .55
    });

    /* 层内泥质隔夹层：把大色块切成有层理的储层 */
    function interbed(clip, t0, t1, d0, d1, op) {
      var ts = tSamples(t0, t1, 24), top = [], bot = [], k;
      for (k = 0; k < ts.length; k++) {
        top.push([v.x(ts[k]), v.y(uplift(ts[k], d0 + Math.sin(ts[k] * 7.2) * 7))]);
      }
      for (k = ts.length - 1; k >= 0; k--) {
        bot.push([v.x(ts[k]), v.y(uplift(ts[k], d1 + Math.sin(ts[k] * 7.2) * 7))]);
      }
      return tag('g', { 'clip-path': 'url(#' + clip + ')' },
        tag('path', {
          d: polyPath(top.concat(bot)) + 'Z',
          fill: 'var(--paper)', 'fill-opacity': op || '.55',
          stroke: 'rgba(120,110,88,.28)', 'stroke-width': .7
        }));
    }
    var beds = [];
    beds.push(interbed(clipWL, .615, .797, 2095, 2125, .5));
    beds.push(interbed(clipWL, .615, .797, 2870, 2900, .45));
    beds.push(interbed(clipWL, .615, .797, 3380, 3408, .4));
    beds.push(interbed(clipWR, .803, .985, 1995, 2023, .46));
    beds.push(interbed(clipWR, .803, .985, 2810, 2838, .42));
    beds.push(interbed(clipWR, .803, .985, 3370, 3398, .38));
    beds.push(interbed(clipGas, .04, .585, 1635, 1652, .3));
    beds.push(interbed(clipOil, .04, .59, 3680, 3708, .38));
    beds.push(interbed(clipOil, .04, .59, 4060, 4088, .34));

    /* ---------- 压力系数 ---------- */
    var pressure = [];
    PRESSURES.forEach(function (p, i) {
      var pts = [], tt;
      for (tt = .03; tt <= .56; tt += .01) {
        pts.push([v.x(tt), v.y(uplift(tt, p.base + Math.sin(tt * 7.5 + i * 1.4) * 85))]);
      }
      pressure.push(tag('path', {
        class: 'vz-contour', d: polyPath(pts),
        'data-vz-info': '1', 'data-label': p.info,
        'data-meta': '沙三段—沙四段 · 压力系数等值线',
        'data-desc': '超压顶界与烃源岩成熟度、欠压实带对应；等值线密集处往往是钻井液密度窗口最窄的层段。',
        'data-href': '#/stage/drilling', 'data-href-label': '钻井'
      }));
      var lp = pts[4];
      pressure.push(tag('text', {
        class: 'vz-contour-label', x: f(lp[0] - 2), y: f(lp[1] - 4)
      }, p.k));
    });

    /* ---------- 断层 ---------- */
    var faults = [];
    FAULTS.forEach(function (fn) {
      var x0 = v.x(fn.t), x1 = v.x(fn.t) + (fn.main ? 4 : 1.5);
      var y0 = v.y(fn.d0), y1 = v.y(fn.d1);
      var dpath = 'M' + f(x0) + ' ' + f(y0) +
        'C' + f(x0 + 6) + ' ' + f(y0 + (y1 - y0) * .3) + ' ' +
        f(x1 - 5) + ' ' + f(y0 + (y1 - y0) * .7) + ' ' + f(x1) + ' ' + f(y1);
      var ticks = [];
      for (var q = 0.12; q < 1; q += .16) {
        var yy = y0 + (y1 - y0) * q, xx = x0 + (x1 - x0) * q;
        ticks.push('M' + f(xx) + ' ' + f(yy) + 'l6 4');
      }
      faults.push(tag('g', {
        class: 'vz-fault-g', 'data-vz-info': '1',
        'data-label': fn.id + ' · ' + fn.label, 'data-meta': fn.meta, 'data-desc': fn.desc,
        'data-href': '#/stage/drilling', 'data-href-label': '钻井'
      },
        tag('path', { class: 'vz-fault' + (fn.main ? '' : ' vz-fault-minor'), d: dpath }) +
        tag('path', { class: 'vz-fault-tick', d: ticks.join('') }) +
        tag('text', {
          class: 'vz-fault-label', x: f(x1 + 7), y: f(y0 + 22)
        }, fn.id)
      ));
    });

    /* ---------- 井（整组不裁剪，井名在地表以上） ---------- */
    var wells = [];
    WELLS.forEach(function (w) {
      var x = v.x(w.t), yTop = T, yBot = v.y(w.td);
      var perf = [];
      w.perfs.forEach(function (p) {
        var yy0 = v.y(p[0]), yy1 = v.y(p[1]);
        for (var yy = yy0; yy <= yy1; yy += 7) {
          perf.push('M' + f(x - 3) + ' ' + f(yy) + 'h6');
        }
      });
      wells.push(tag('g', {
        class: 'vz-well-g', 'data-vz-info': '1',
        'data-label': w.name + ' · ' + w.kind,
        'data-meta': '完钻井深 ' + w.td + ' m · 射孔 ' + w.perfs.length + ' 段',
        'data-desc': w.note,
        'data-href': '#/stage/drilling', 'data-href-label': '钻井'
      },
        tag('line', { class: 'vz-well', x1: f(x), y1: f(yTop), x2: f(x), y2: f(yBot) }) +
        tag('path', { class: 'vz-perf', d: perf.join('') }) +
        tag('path', {
          class: 'vz-well-head',
          d: 'M' + f(x - 4) + ' ' + f(yTop) + 'l4 -7 4 7z'
        }) +
        tag('text', {
          class: 'vz-well-label', x: f(x), y: f(yTop - 13), 'text-anchor': 'middle'
        }, w.name) +
        tag('line', { class: 'vz-well-hit', x1: f(x), y1: f(yTop), x2: f(x), y2: f(yBot) })
      ));
    });

    /* ---------- 右侧标注 ---------- */
    var callouts = [];
    function callout(y1, y2, title, sub, fromX, fromY) {
      var mid = (y1 + y2) / 2, x = 946;
      var lx = fromX == null ? 904 : fromX;
      var ly = fromY == null ? mid : fromY;
      callouts.push(tag('path', {
        class: 'vz-callout-line',
        d: 'M' + f(lx) + ' ' + f(ly) + 'L' + (x - 6) + ' ' + f(mid) +
          'M' + x + ' ' + f(y1) + 'V' + f(y2) +
          'M' + (x - 5) + ' ' + f(y1) + 'h5M' + (x - 5) + ' ' + f(y2) + 'h5'
      }));
      callouts.push(tag('text', {
        class: 'vz-callout-title', x: 956, y: f(mid - 2)
      }, title));
      callouts.push(tag('text', {
        class: 'vz-callout-sub', x: 956, y: f(mid + 12)
      }, sub));
    }
    callout(v.y(uplift(.99, 1250)), v.y(uplift(.99, 1880)), '低充满带', '稠油地层油藏');
    callout(v.y(uplift(.99, 2200)), v.y(uplift(.99, 3350)), '油水过渡带', '常规构造—岩性油气藏',
      v.x(.605), v.y(uplift(.605, 3120)));

    /* 高充满带：直接标在油区上方 */
    var highLabel = tag('g', null,
      tag('path', { class: 'vz-callout-line', d: 'M' + f(v.x(.335)) + ' ' + f(v.y(2970)) + 'V' + f(v.y(3220)) }) +
      tag('circle', { cx: f(v.x(.335)), cy: f(v.y(3220)), r: 2.2, fill: 'var(--viz-oil)' }) +
      tag('text', { class: 'vz-annot-t', x: f(v.x(.225)), y: f(v.y(2935)) }, '高充满带') +
      tag('text', { class: 'vz-annot', x: f(v.x(.225)), y: f(v.y(2935) + 15) }, '常规岩性油气藏')
    );

    /* 流体区标签 */
    var zoneLabels = tag('g', null,
      tag('text', { class: 'vz-annot', x: f(v.x(.30)), y: f(v.y(1745)) }, '气层') +
      tag('text', { class: 'vz-annot', x: f(v.x(.30)), y: f(v.y(3910)) }, '油层') +
      tag('text', { class: 'vz-annot', x: f(v.x(.875)), y: f(v.y(2600)) }, '水层')
    );

    /* 底部干层标注 */
    var dryLabel = tag('g', null,
      tag('path', { class: 'vz-callout-line', d: 'M556 ' + f(v.y(5670)) + 'H470' }) +
      tag('text', { class: 'vz-annot-t', x: 566, y: f(v.y(5670) - 6) }, '非油层即干层带') +
      tag('text', { class: 'vz-annot', x: 566, y: f(v.y(5670) + 9) }, '凝析岩性油气藏 · 沙四段')
    );

    /* 气顶标注 */
    var capLabel = tag('g', null,
      tag('path', { class: 'vz-callout-line', d: 'M' + f(v.x(.565)) + ' ' + f(v.y(3240)) + 'l16 -14' }) +
      tag('text', { class: 'vz-annot', x: f(v.x(.585)), y: f(v.y(3218)) }, '气顶')
    );

    /* 剖面端标 */
    var endMarks =
      tag('text', { class: 'vz-annot-t', x: R, y: T - 30, 'text-anchor': 'end' }, 'A′') +
      tag('text', { class: 'vz-axis-title', x: L, y: T - 30, style: 'letter-spacing:.1em' }, 'A  ·  PROFILE A—A′');

    /* ---------- 指针读数 ---------- */
    var guideY = v.y(3000);
    var guide = tag('g', { class: 'vz-guide-bubble' },
      tag('line', { class: 'vz-guide', x1: L, y1: f(guideY), x2: R, y2: f(guideY) }) +
      tag('rect', { x: R - 78, y: f(guideY - 17), width: 70, height: 15, rx: 3 }) +
      tag('text', { x: R - 43, y: f(guideY - 6.5), 'text-anchor': 'middle' }, '3000 m')
    );

    /* ---------- 组装（裁剪层只放需要裁掉的图形） ---------- */
    svg.push(tag('rect', { class: 'vz-plot-bg', x: L, y: T, width: R - L, height: B - T }));
    svg.push(tag('g', { 'clip-path': 'url(#' + clipPlot + ')' },
      tag('g', { class: 'vz-strata' }, bands.join('')) +
      tag('g', { class: 'vz-zones', 'data-layer': 'fluids' }, contact + zones.join('') + beds.join('') + lens.join('')) +
      tag('g', { 'data-layer': 'pressure' }, pressure.join('')) +
      tag('g', { 'data-layer': 'faults' }, faults.join('')) +
      guide
    ));
    svg.push(tag('g', { 'data-layer': 'wells' }, wells.join('')));
    svg.push(tag('g', { class: 'vz-callouts' },
      callouts.join('') + highLabel + zoneLabels + capLabel + dryLabel));
    svg.push(tag('rect', { class: 'vz-frame', x: L, y: T, width: R - L, height: B - T }));
    svg.push(tag('g', null, axis.join('')));
    svg.push(endMarks);

    var svgHTML = tag('svg', {
      class: 'vz-svg', viewBox: '0 0 ' + W + ' ' + H,
      role: 'img', 'aria-label': '储层地质剖面：地层、流体、井、断层与压力系数',
      'data-vz-svg': '1',
      'data-zmin': ZMIN, 'data-zmax': ZMAX,
      'data-l': L, 'data-r': R, 'data-t': T, 'data-b': B,
      'data-vbw': W, 'data-vbh': H
    }, tag('defs', null, defs.join('')) + svg.join(''));

    var legend = [
      chip('gas', '气层'), chip('oil', '油层'), chip('water', '水层'),
      chip('trans', '油水过渡'), chip('cond', '凝析气 / 气顶'), chip('dry', '干层'),
      '<span class="vz-chip"><i class="line"></i>断层</span>',
      '<span class="vz-chip"><i class="line well"></i>井位</span>',
      '<span class="vz-chip"><i class="line press"></i>压力系数</span>',
      '<span class="vz-chip"><i class="hatch"></i>烃源岩</span>',
      '<span class="vz-chip"><i class="hatch salt"></i>盐膏岩</span>'
    ].join('');

    return '' +
      '<div class="vz" data-vz="reservoir">' +
      '<div class="vz-head">' +
      '<div class="vz-head-l">' +
      '<span class="kicker">SECTION A—A′ · 储层剖面</span>' +
      '<h3>一个断块的流体分布、井网与压力结构</h3>' +
      '<p>沿主断层走向切一刀：左侧是深洼带，右侧是抬升断块。色块表示流体，虚线是压力系数等值线。把指针移到任意色块、井或断层上，下面会给出对应的深度与工程含义。</p>' +
      '<div class="vz-stats"><span><b>4</b> 口井</span><span><b>4</b> 条断层</span><span><b>6</b> 类流体</span>' +
      '<span><b>4</b> 条压力等值线</span><span><b>6</b> 套地层</span></div>' +
      '</div>' +
      '<div class="vz-head-r">' +
      toggle('fluids', '流体', true) +
      toggle('pressure', '压力系数', true) +
      toggle('faults', '断层', true) +
      toggle('wells', '井位', true) +
      '</div></div>' +
      '<div class="vz-canvas">' + svgHTML + '</div>' +
      '<div class="vz-foot">' +
      '<div class="vz-legend">' + legend + '</div>' +
      '<div class="vz-status">' +
      '<div class="vz-read"><span class="vz-read-k">读数</span>' +
      '<b class="vz-name">—</b><span class="vz-meta">悬停色块、井或断层查看说明</span>' +
      '<a class="vz-go" hidden>查看环节 →</a></div>' +
      '<div class="vz-depth">深度 <b class="vz-depth-v">—</b> m</div>' +
      '</div>' +
      '<div class="vz-note">示意剖面 · 层位、井名与流体分布为教学合成，不对应任何真实油田；纵向为深度轴，横向为任意剖面线。<span class="vz-only-mobile"> 窄屏可横向滑动剖面。</span></div>' +
      '</div></div>';
  }

  function chip(k, label) {
    return '<span class="vz-chip"><i data-f="' + k + '"></i>' + esc(label) + '</span>';
  }
  function toggle(layer, label, on) {
    return '<button class="vz-toggle' + (on ? ' on' : '') + '" data-vz-layer="' + layer + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<i></i>' + esc(label) + '</button>';
  }

  /* =========================================================
     四、缩略剖面（环节 / 场景 / 胶片）
     ========================================================= */
  function thumbSVG(stageId, w, h, opt) {
    opt = opt || {};
    var info = STAGE_INFO[stageId] || STAGE_INFO.welllog;
    var d0 = opt.d0 != null ? opt.d0 : info.d[0];
    var d1 = opt.d1 != null ? opt.d1 : info.d[1];
    var ticks = !!opt.ticks;
    var L = ticks ? 36 : 7;
    var R = w - 7;
    var T = opt.top || 34;
    var B = h - (opt.bottom || 8);
    var v = View(L, R, T, B, ZMIN, ZMAX);
    var id = uid('th');
    var g = [];

    /* 地层 */
    g.push(tag('rect', { class: 'vz-plot-bg', x: L, y: T, width: R - L, height: B - T }));
    STRATA.forEach(function (s) {
      g.push(tag('path', {
        class: 'vz-band', 'data-l': s.key, d: bandPath(s.i, v, 40)
      }));
    });
    /* 基底 */
    var bTop = [], bTs = tSamples(0, 1, 40), bi;
    for (bi = 0; bi < bTs.length; bi++) bTop.push([v.x(bTs[bi]), v.y(hz(6, bTs[bi]))]);
    g.push(tag('path', {
      class: 'vz-band', 'data-l': 'base',
      d: polyPath(bTop.concat([[R, B + 12], [L, B + 12]])) + 'Z'
    }));
    /* 流体淡彩 */
    if (opt.fluid !== false) {
      g.push(tag('g', { opacity: '.55' },
        tag('path', { class: 'vz-zone', 'data-f': 'gas', d: zpath(GAS, v) }) +
        tag('path', { class: 'vz-zone', 'data-f': 'oil', d: zpath(OIL, v) }) +
        tag('path', { class: 'vz-zone', 'data-f': 'water', d: zpath(WATER_L, v) }) +
        tag('path', { class: 'vz-zone', 'data-f': 'water', d: zpath(WATER_R, v) })
      ));
    }
    /* 井 */
    g.push(tag('line', {
      class: 'vz-well', x1: v.x(.56), y1: T, x2: v.x(.56), y2: B,
      'stroke-width': .8, opacity: .55
    }));
    /* 主断层 */
    g.push(tag('line', {
      class: 'vz-fault', x1: v.x(FAULT_T), y1: T, x2: v.x(FAULT_T) + 1, y2: B,
      'stroke-width': 1, opacity: .35
    }));

    /* 高亮井段 */
    var y0 = v.y(clamp(d0, ZMIN, ZMAX));
    var y1 = v.y(clamp(d1, ZMIN, ZMAX));
    var hh = Math.max(5, y1 - y0);
    if (hh < 5) { y0 = y0 - 2.5; hh = 5; }
    g.push(tag('rect', {
      class: 'vz-hl', x: L, y: f(y0), width: R - L, height: f(hh), rx: 1.5,
      'fill-opacity': opt.hlOpacity != null ? opt.hlOpacity : null
    }));
    g.push(tag('rect', {
      x: L, y: f(y0), width: 2.5, height: f(hh), fill: 'var(--jade)'
    }));
    /* 高亮边缘线 */
    g.push(tag('line', { class: 'vz-hl-edge', x1: L, y1: f(y0), x2: R, y2: f(y0) }));
    g.push(tag('line', { class: 'vz-hl-edge', x1: L, y1: f(y0 + hh), x2: R, y2: f(y0 + hh) }));
    /* 边界刻度 */
    g.push(tag('path', {
      class: 'vz-hl-edge', d: 'M' + L + ' ' + f(y0) + 'h-4M' + L + ' ' + f(y0 + hh) + 'h-4',
      fill: 'none'
    }));

    /* 目标点（场景用） */
    if (opt.dot) {
      g.push(tag('circle', {
        cx: v.x(.56), cy: f(y0 + hh / 2), r: 3.2,
        fill: 'var(--jade-d)', stroke: '#fff', 'stroke-width': 1.2
      }));
    }

    /* 深度刻度 */
    if (ticks) {
      for (var d = 1000; d <= 6000; d += 1000) {
        var yy = v.y(d);
        g.push(tag('line', { class: 'vz-grid', x1: L, y1: f(yy), x2: R, y2: f(yy) }));
        g.push(tag('line', { class: 'vz-axis-tick', x1: L - 4, y1: f(yy), x2: L, y2: f(yy) }));
        g.push(tag('text', {
          class: 'vz-axis-label', x: L - 7, y: f(yy + 3), 'text-anchor': 'end'
        }, String(d)));
      }
      g.push(tag('text', {
        class: 'vz-axis-title', x: 12, y: (T + B) / 2 + 20,
        transform: 'rotate(-90 12 ' + ((T + B) / 2 + 20) + ')', 'text-anchor': 'middle',
        style: 'font-size:8px;letter-spacing:.12em'
      }, 'm'));
    }

    /* 井段标注 */
    if (opt.bandLabel) {
      var labelY = clamp(y0 + hh / 2 + 3, T + 12, B - 6);
      g.push(tag('text', {
        class: 'vz-hl-label', x: R - 5, y: f(labelY), 'text-anchor': 'end'
      }, opt.bandLabel));
    }

    /* 地表 */
    g.push(tag('line', {
      x1: L, y1: T, x2: R, y2: T, stroke: 'var(--ink-2)', 'stroke-width': 1
    }));

    /* 图标徽标（右上） */
    var gs = opt.glyph || (w >= 300 ? 26 : 20);
    g.push(glyphSVG(stageId, R - gs - 4, 4, gs, { box: true }));

    /* 环节名（大图内，左上） */
    if (opt.title) {
      g.push(tag('text', {
        x: L + 3, y: 20,
        style: 'font-size:12px;font-weight:600;fill:var(--ink);letter-spacing:.01em'
      }, opt.title));
      if (opt.subtitle) {
        g.push(tag('text', {
          x: L + 3, y: 31,
          style: 'font-family:var(--mono);font-size:8px;fill:var(--ink-4);letter-spacing:.03em'
        }, opt.subtitle));
      }
    }

    return tag('svg', {
      class: 'vz-mini-svg', viewBox: '0 0 ' + w + ' ' + h,
      role: 'img', 'aria-label': (opt.title || info.zone) + ' 剖面示意'
    }, g.join(''));
  }

  /* 环节页：中等剖面 */
  function stageFigure(stageId) {
    var info = STAGE_INFO[stageId] || STAGE_INFO.welllog;
    var d0 = info.d[0], d1 = info.d[1];
    var label = (d0 <= 1000 ? '地表' : d0 + ' m') + ' — ' + d1 + ' m';
    var surface = d1 <= 1300;
    return thumbSVG(stageId, 460, 268, {
      ticks: true,
      top: 48,
      title: info.zone,
      subtitle: (surface ? '作用范围 ' : '作用井段 ') + label,
      glyph: 28,
      bottom: 10,
      hlOpacity: .14
    });
  }

  /* 场景页：窄剖面定位 */
  function sceneLocator(sc) {
    var info = STAGE_INFO[sc.stageId] || STAGE_INFO.welllog;
    var band = sceneBand(sc);
    return thumbSVG(sc.stageId, 360, 178, {
      d0: band[0], d1: band[1], ticks: false, fluid: true, dot: true,
      glyph: 20, bottom: 8, hlOpacity: .22
    });
  }

  /* 确定性场景深度：同一场景每次渲染一致 */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  function jitter0(sc) { return ((hashStr(sc.id + 'y') % 7) - 3) * 2.4; }
  function sceneBand(sc) {
    var info = STAGE_INFO[sc.stageId] || STAGE_INFO.welllog;
    var a = info.d[0], b = info.d[1];
    if (b - a < 500) return [a, b];
    var r = (hashStr(sc.id) % 1000) / 1000;
    var span = b - a;
    var half = Math.max(140, span * .10);
    var c = a + span * (.30 + .40 * r);
    c = clamp(c, a + half, b - half);
    return [Math.round(c - half), Math.round(c + half)];
  }

  /* 作业链胶片 */
  function filmThumb(stageId) {
    return thumbSVG(stageId, 124, 164, {
      ticks: false, glyph: 18, bottom: 6, fluid: true, hlOpacity: .22
    });
  }

  /* =========================================================
     五、方法页：跨环节深度分布
     ========================================================= */
  function methodFigure(key, stages, byMethod) {
    var W = 1200, H = 286;
    var L = 74, R = 1168, T = 34, B = 236;
    var v = View(L, R, T, B, ZMIN, ZMAX);
    var colW = (R - L) / stages.length;
    var g = [];
    var color = 'var(--c-' + key + ')';

    /* 深度网格 */
    for (var d = 1000; d <= 6000; d += 1000) {
      var y = v.y(d);
      g.push(tag('line', { class: 'vz-grid', x1: L, y1: f(y), x2: R, y2: f(y) }));
      g.push(tag('line', { class: 'vz-axis-tick', x1: L - 5, y1: f(y), x2: L, y2: f(y) }));
      g.push(tag('text', {
        class: 'vz-axis-label', x: L - 8, y: f(y + 3.4), 'text-anchor': 'end'
      }, String(d)));
    }
    g.push(tag('text', {
      class: 'vz-axis-title', x: 22, y: (T + B) / 2 + 30,
      transform: 'rotate(-90 22 ' + ((T + B) / 2 + 30) + ')', 'text-anchor': 'middle'
    }, '深度 / m'));

    /* 地表线 */
    g.push(tag('line', {
      x1: L, y1: f(v.y(1000)), x2: R, y2: f(v.y(1000)),
      stroke: 'var(--ink-3)', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: .55
    }));
    g.push(tag('text', {
      x: L + 3, y: f(v.y(1000) - 5),
      style: 'font-family:var(--mono);font-size:8px;fill:var(--ink-4);letter-spacing:.08em'
    }, '地表'));

    stages.forEach(function (st, i) {
      var cx = L + colW * (i + .5);
      var info = STAGE_INFO[st.id] || STAGE_INFO.welllog;
      var hit = (byMethod[i] || []);
      var span = info.d[1] - info.d[0];
      var surface = span < 400;

      /* 柱状轨道 */
      g.push(tag('line', {
        x1: f(cx), y1: f(v.y(1080)), x2: f(cx), y2: f(B),
        stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': '1 4'
      }));

      var top, bot;
      if (surface) {
        top = v.y(1070); bot = top + 14;
      } else {
        top = v.y(info.d[0]); bot = v.y(info.d[1]);
      }
      g.push(tag('rect', {
        x: f(cx - 13), y: f(top), width: 26, height: f(Math.max(6, bot - top)),
        rx: 4,
        fill: hit.length ? color : 'var(--paper-2)',
        'fill-opacity': hit.length ? '.12' : '.55',
        stroke: hit.length ? color : 'var(--line-2)',
        'stroke-opacity': hit.length ? '.38' : '1',
        'stroke-width': 1,
        'stroke-dasharray': hit.length ? '' : '2 3'
      }));
      if (hit.length) {
        g.push(tag('rect', {
          x: f(cx - 13), y: f(top), width: 2.5, height: f(Math.max(6, bot - top)),
          fill: color, 'fill-opacity': .75
        }));
      }

      /* 场景点 */
      hit.forEach(function (sc) {
        var band = sceneBand(sc);
        var yy = surface ? top + 7 + jitter0(sc) : v.y((band[0] + band[1]) / 2);
        var jitter = ((hashStr(sc.id) % 5) - 2) * 5;
        g.push(tag('circle', {
          cx: f(cx + jitter), cy: f(yy), r: 3.3,
          fill: color, 'fill-opacity': .8, stroke: 'var(--card)', 'stroke-width': 1
        }, tag('title', null, esc(sc.name + ' · ' + band[0] + '–' + band[1] + ' m'))));
      });

      /* 数量（地表环节的空间太小，不标数字） */
      if (hit.length && !surface) {
        g.push(tag('text', {
          x: f(cx), y: f(Math.max(T + 14, top - 6)), 'text-anchor': 'middle',
          style: 'font-family:var(--mono);font-size:8.5px;fill:' + color + ';font-weight:600'
        }, String(hit.length)));
      }

      /* 环节标签 */
      g.push(tag('text', {
        x: f(cx), y: B + 15, 'text-anchor': 'middle',
        style: 'font-family:var(--mono);font-size:8.5px;fill:var(--ink-4);letter-spacing:.04em'
      }, (i + 1 < 10 ? '0' : '') + (i + 1)));
      g.push(tag('text', {
        x: f(cx), y: B + 28, 'text-anchor': 'middle',
        style: 'font-size:10px;font-weight:600;fill:var(--ink-2)'
      }, st.name));
    });

    return tag('svg', {
      viewBox: '0 0 ' + W + ' ' + H, class: 'vz-method-svg',
      role: 'img', 'aria-label': '该方法在各环节的深度分布'
    }, g.join(''));
  }

  /* =========================================================
     六、交互绑定
     ========================================================= */
  function bind(root) {
    var hosts = root.querySelectorAll('[data-vz="reservoir"]');
    [].forEach.call(hosts, function (host) {
      if (host.getAttribute('data-vz-bound')) return;
      host.setAttribute('data-vz-bound', '1');

      var canvas = host.querySelector('.vz-canvas');
      var svg = host.querySelector('.vz-svg');
      var nameEl = host.querySelector('.vz-name');
      var metaEl = host.querySelector('.vz-meta');
      var goEl = host.querySelector('.vz-go');
      var depthEl = host.querySelector('.vz-depth-v');
      var guide = host.querySelector('.vz-guide');
      var bubble = host.querySelector('.vz-guide-bubble');
      var bubbleRect = bubble && bubble.querySelector('rect');
      var bubbleText = bubble && bubble.querySelector('text');
      if (!canvas || !svg) return;

      function applyInfo(el) {
        if (!el) {
          nameEl.textContent = '—';
          metaEl.textContent = '悬停色块、井或断层查看说明';
          if (goEl) goEl.hidden = true;
          return;
        }
        var label = el.getAttribute('data-label') || '—';
        var meta = el.getAttribute('data-meta') || '';
        var desc = el.getAttribute('data-desc') || '';
        var href = el.getAttribute('data-href');
        var hrefLabel = el.getAttribute('data-href-label') || '相关环节';
        nameEl.textContent = label;
        metaEl.textContent = meta + (desc ? ' · ' + desc : '');
        if (goEl && href) {
          goEl.hidden = false;
          goEl.href = href;
          goEl.textContent = hrefLabel + ' →';
        } else if (goEl) {
          goEl.hidden = true;
        }
      }

      var hot = null;
      function setHot(el) {
        if (hot === el) return;
        if (hot) hot.classList.remove('is-hot');
        hot = el;
        if (hot) hot.classList.add('is-hot');
        applyInfo(hot);
      }

      var targets = svg.querySelectorAll('[data-vz-info]');
      [].forEach.call(targets, function (el) {
        el.addEventListener('mouseenter', function () { setHot(el); });
        el.addEventListener('mouseleave', function () { setHot(null); });
        el.addEventListener('click', function () {
          setHot(el);
          /* 键盘/触屏：点击后滚动到读数栏，避免遮挡 */
        });
      });
      svg.addEventListener('mouseleave', function () { setHot(null); });

      function onMove(e) {
        var rect = svg.getBoundingClientRect();
        var vbw = +svg.getAttribute('data-vbw');
        var vbh = +svg.getAttribute('data-vbh');
        var L = +svg.getAttribute('data-l'), R = +svg.getAttribute('data-r');
        var T = +svg.getAttribute('data-t'), B = +svg.getAttribute('data-b');
        var zmin = +svg.getAttribute('data-zmin'), zmax = +svg.getAttribute('data-zmax');
        var vbX = (e.clientX - rect.left) / rect.width * vbw;
        var vbY = (e.clientY - rect.top) / rect.height * vbh;
        if (vbX < L - 2 || vbX > R + 2 || vbY < T || vbY > B) {
          canvas.classList.remove('is-live');
          return;
        }
        var depth = zmin + (vbY - T) / (B - T) * (zmax - zmin);
        depth = Math.round(depth / 10) * 10;
        if (depthEl) depthEl.textContent = depth;
        canvas.classList.add('is-live');
        if (guide) { guide.setAttribute('y1', f(vbY)); guide.setAttribute('y2', f(vbY)); }
        if (bubbleRect) bubbleRect.setAttribute('y', f(vbY - 17));
        if (bubbleText) {
          bubbleText.setAttribute('y', f(vbY - 6.5));
          bubbleText.textContent = depth + ' m';
        }
        if (bubbleRect) bubbleRect.setAttribute('y', f(vbY - 17));
      }
      svg.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerleave', function () {
        canvas.classList.remove('is-live');
      });

      /* 开关 */
      [].forEach.call(host.querySelectorAll('[data-vz-layer]'), function (btn) {
        btn.addEventListener('click', function () {
          var layer = btn.getAttribute('data-vz-layer');
          var on = !btn.classList.contains('on');
          btn.classList.toggle('on', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          var group = svg.querySelector('[data-layer="' + layer + '"]');
          if (group) group.style.display = on ? '' : 'none';
          /* 流体层关闭时，连同充满带 / 流体标注一起收起，便于看构造 */
          if (layer === 'fluids') {
            var notes = svg.querySelector('.vz-callouts');
            if (notes) notes.style.display = on ? '' : 'none';
          }
        });
      });
    });
  }

  /* =========================================================
     七、对外接口
     ========================================================= */
  global.Viz = {
    section: section,
    stageFigure: stageFigure,
    sceneLocator: sceneLocator,
    filmThumb: filmThumb,
    methodFigure: methodFigure,
    sceneBand: sceneBand,
    stageInfo: function (id) { return STAGE_INFO[id]; },
    bind: bind
  };

})(window);
