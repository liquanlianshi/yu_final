/* =========================================================
   案例包加载器 Pack Loader
   ---------------------------------------------------------
   把 assets/packs/*.pack.js 里内嵌的「案例包」注册成站内插件案例。
   一份案例包有两种分发形态，源码完全相同：

     ① 内嵌：tools/build_packs.py 把 packs/<类别-子类>/ 打成一个
        assets/packs/<id>.pack.js，本文件把它注册到 Cases；
     ② 上传：同一个目录压成 zip，走「＋ 添加案例」，
        由 case-upload.js + case-demo-host.js 在沙箱里渲染。

   这样「站内直接可见」与「上传即用」两条路共用同一份 demo，
   不会出现两套代码走样的问题。

   依赖：data.js（场景元数据）、registry.js（Cases）、
        case-demo-host.js（沙箱渲染）——都要先于本文件加载。
   ========================================================= */

(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toFiles(pack) {
    var out = [];
    var files = pack.files || {};
    Object.keys(files).forEach(function (name) {
      var data = files[name];
      out.push({
        name: name,
        size: String(data).length,
        mime: global.CaseDemoHost ? global.CaseDemoHost.mimeOf(name) : 'text/plain',
        enc: 'text',
        data: data
      });
    });
    return out;
  }

  /* case.json → 站内案例对象（与 case-upload.js 的 toCase 保持同构） */
  function toCase(pack) {
    var m = pack.manifest || {};
    var t = m.tabs || {};
    var files = toFiles(pack);
    var dcfg = t.demo || {};

    var pkg = {
      files: files,
      demo: {
        mode: dcfg.mode || 'auto',
        html: dcfg.html,
        js: dcfg.js,
        height: dcfg.height || 560,
        label: dcfg.label
      },
      meta: { title: m.title }
    };

    var tabs = {};

    if (t.background) {
      var b = t.background;
      tabs.background = {
        label: b.label || '专业背景',
        judge: Array.isArray(b.judge) && b.judge.length ? b.judge : null,
        lede: b.lede || '',
        sections: (b.sections || []).map(function (s, i) {
          return {
            no: s.no || (i + 1),
            en: s.en || '',
            title: s.title || '未命名段落',
            html: s.html || s.body || ''
          };
        })
      };
    }

    if (t.workflow) {
      var w = t.workflow;
      tabs.workflow = {
        label: w.label || '案例流程',
        title: w.title || '案例流程',
        lead: w.lead || [],
        stats: w.stats || null,
        steps: (w.steps || []).map(function (s) {
          return {
            name: s.name || '未命名步骤',
            role: s.role || '',
            do: s.do || '',
            effect: s.effect || '',
            trap: s.trap || ''
          };
        }),
        metrics: w.metrics || null,
        fails: w.fails || null
      };
    }

    var handle = null;
    if (t.demo && (dcfg.html || dcfg.js)) {
      tabs.demo = {
        label: dcfg.label || '可运行示范',
        intro: dcfg.intro || '',
        mode: 'page',
        mount: function (root, ctx) {
          if (!global.CaseDemoHost) {
            root.innerHTML = '<div class="callout warn"><span class="ci">缺失</span><span>示范宿主未加载：请确认 assets/core/case-demo-host.js 在 pack-loader.js 之前引入。</span></div>';
            return;
          }
          handle = global.CaseDemoHost.create(root, pkg, ctx);
        },
        unmount: function () {
          if (handle) { try { handle.destroy(); } catch (e) { } handle = null; }
        }
      };
    }

    return {
      id: m.id,
      sceneId: m.sceneId,
      title: m.title,
      methods: (m.methods && m.methods.length) ? m.methods.slice() : [],
      version: m.version || '1.0.0',
      updated: m.updated || '',
      status: m.status || 'ready',
      builtinPack: true,
      tabs: tabs
    };
  }

  function mount() {
    var packs = global.CASE_PACKS || {};
    var ids = Object.keys(packs);
    var n = 0;
    ids.forEach(function (id) {
      var pack = packs[id];
      if (!pack || !pack.manifest || !pack.manifest.id) return;
      if (pack.manifest.id !== id) return;          /* 清单 id 与文件名不一致：跳过，避免错绑 */
      if (global.Cases.get(id)) return;             /* 已有同名插件/上传案例：让位 */
      if (global.ATLAS && !global.ATLAS.index.byId[pack.manifest.sceneId]) {
        console.warn('[pack] 场景不存在，跳过：' + id + ' → ' + pack.manifest.sceneId);
        return;
      }
      global.Cases.register(toCase(pack));
      n++;
    });
    return n;
  }

  global.CasePacks = { mount: mount, count: function () { return Object.keys(global.CASE_PACKS || {}).length; } };
  mount();
})(window);
