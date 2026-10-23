(() => {
  "use strict";

  const nodesById = Object.fromEntries(APP_DATA.nodes.map(n => [n.id, n]));
  const peopleById = Object.fromEntries(APP_DATA.people.map(p => [p.id, p]));
  const state = {
    sceneIndex: 0, selectedNode: null, tab: "overview", year: 1937, storyMode: true,
    layers: { routes: true, markers: true, waypoints: true, legend: true },
    tmap: null, tmapReady: false, tmapLoading: false, tmapKey: "",
    markerLayer: null, waypointLayer: null, lineLayer: null, playbackLayer: null,
    autoTour: false, autoTourTimer: null, tmapSyncToken: 0, flyToken: 0, timelinePlaying: false
  };
  const sceneYears = { guangzhou: 1937.5, luoding: 1938.85, chengjiang: 1939.3, pingshi: 1940.9, evacuation: 1945.15, return: 1945.85 };
  const PLAYBACK_STEPS = [
    { node: "guangzhou", scene: 0 },
    { node: "luoding", scene: 1 },
    { node: "wuzhou", scene: 2 },
    { node: "liuzhou", scene: 2 },
    { node: "nanning", scene: 2 },
    { node: "zhennanguan", scene: 2 },
    { node: "hanoi", scene: 2 },
    { node: "kunming", scene: 2 },
    { node: "chengjiang", scene: 2 },
    { node: "kunming", scene: 3 },
    { node: "guiyang", scene: 3 },
    { node: "guilin", scene: 3 },
    { node: "pingshi", scene: 3 },
    { node: "lechang", scene: 4 },
    { node: "renhua", scene: 4 },
    { node: "lianzhou", scene: 4 },
    { node: "longchuan", scene: 4 },
    { node: "meixian", scene: 4 },
    { node: "xingning", scene: 4 },
    { node: "jiaoling", scene: 4 },
    { node: "wuhua", scene: 4 },
    { node: "guangzhou", scene: 5 }
  ];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const quoteHtml = (quote, source) => source
    ? `“${esc(quote)}”<small>${esc(source)}</small>`
    : `“${esc(quote)}”`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function getTencentKey() {
    let fromStorage = "";
    try { fromStorage = localStorage.getItem("tencentMapKey") || ""; } catch (e) {}
    return String(state.tmapKey || fromStorage || (window.APP_CONFIG && window.APP_CONFIG.tencentMapKey) || "").trim();
  }

  function setStatus(text, showKey = true, buttonText = "配置 Key") {
    $("#tencentStatusText").textContent = text;
    $("#mapLiveText").textContent = text.replace("腾讯地图 · ", "腾讯地图 · ");
    const btn = $("#tencentKeyBtn");
    btn.textContent = buttonText;
    btn.style.display = showKey ? "" : "none";
    $("#tencentStatus").classList.add("is-visible");
    $("#tencentStatus").setAttribute("aria-hidden", "false");
  }

  function showLoading(text = "正在加载腾讯地图官方底图…") {
    $("#mapLoading").classList.remove("is-hidden");
    $("#mapLoading").innerHTML = `<div class="map-spinner"></div><span>${esc(text)}</span>`;
    $("#mapError").classList.remove("is-visible");
  }

  function hideLoading() { $("#mapLoading").classList.add("is-hidden"); }

  function showMapError(text) {
    $("#mapErrorText").textContent = text;
    $("#mapError").classList.add("is-visible");
    $("#mapError").setAttribute("aria-hidden", "false");
    hideLoading();
  }

  function hideMapError() {
    $("#mapError").classList.remove("is-visible");
    $("#mapError").setAttribute("aria-hidden", "true");
  }

  function loadTencentSdk() {
    const key = getTencentKey();
    if (!key) {
      showMapError("尚未配置腾讯地图 Key。请点击右上角“配置 Key”或编辑 config.js。");
      openTencentKeyModal("尚未配置腾讯地图 Key。");
      return;
    }
    if (state.tmapLoading) return;
    if (window.TMap && window.TMap.Map) {
      try { initTencentMap(); } catch (err) { showMapError("腾讯地图初始化失败：" + err.message); setStatus("腾讯地图初始化失败", true, "重新配置"); }
      return;
    }
    state.tmapLoading = true;
    hideMapError();
    showLoading();
    setStatus("腾讯地图 · 正在加载", true, "配置 Key");
    const old = document.getElementById("tencent-map-sdk");
    if (old) old.remove();
    const script = document.createElement("script");
    const version = (window.APP_CONFIG && window.APP_CONFIG.tencentMapVersion) || "1.exp";
    script.id = "tencent-map-sdk";
    script.async = true;
    script.src = `https://map.qq.com/api/gljs?v=${encodeURIComponent(version)}&key=${encodeURIComponent(key)}`;
    script.onload = () => {
      state.tmapLoading = false;
      if (!window.TMap || !window.TMap.Map) {
        showMapError("腾讯地图脚本已加载，但未找到 TMap。请检查 Key 与域名白名单。");
        setStatus("腾讯地图脚本异常", true, "重新配置");
        return;
      }
      try { initTencentMap(); }
      catch (err) { showMapError("腾讯地图初始化失败：" + err.message); setStatus("腾讯地图初始化失败", true, "重新配置"); }
    };
    script.onerror = () => {
      state.tmapLoading = false;
      showMapError("腾讯地图脚本加载失败。请检查网络、Key 与域名白名单。");
      setStatus("腾讯地图加载失败", true, "重新配置");
    };
    document.head.appendChild(script);
  }

  function initTencentMap() {
    if (state.tmapReady && state.tmap) return;
    if (!window.TMap || !window.TMap.Map) throw new Error("TMap SDK 未就绪");
    const container = document.getElementById("tencentMap");
    if (!container) throw new Error("腾讯地图容器不存在");
    const options = {
      center: new window.TMap.LatLng(24.2, 112.8),
      zoom: Number((window.APP_CONFIG && window.APP_CONFIG.tencentMapZoom) || 6.8),
      pitch: 0, rotation: 0, viewMode: "2D",
      baseMap: { type: "vector" }, showControl: true
    };
    const styleId = window.APP_CONFIG && window.APP_CONFIG.tencentMapStyleId;
    if (styleId) options.mapStyleId = styleId;
    state.tmap = new window.TMap.Map(container, options);
    state.tmapReady = true;
    state.tmapLoading = false;
    hideLoading();
    hideMapError();
    setStatus("腾讯地图 · 官方底图已加载", true, "更换 Key");
    watchTencentAuthError();
    buildTencentLayers();
    syncOverlays(true, 0);
  }

  function watchTencentAuthError() {
    const el = $("#tencentMap");
    if (!el || el.dataset.authWatch === "1") return;
    el.dataset.authWatch = "1";
    let timer = null;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const text = el.innerText || "";
        if (text.includes("鉴权失败") || text.includes("请检查KEY") || text.includes("请检查 KEY")) {
          setStatus("腾讯地图鉴权失败 · 检查 Key 与域名白名单", true, "更换 Key");
        }
      }, 180);
    };
    new MutationObserver(check).observe(el, { childList: true, subtree: true, characterData: true });
    setTimeout(check, 1400);
  }

  function markerDataUrl(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38"><path d="M15 1.4C7.4 1.4 1.4 7.4 1.4 15c0 10.3 13.6 21.4 13.6 21.4S28.6 25.3 28.6 15C28.6 7.4 22.6 1.4 15 1.4z" fill="${color}" stroke="#fff8e8" stroke-width="2.2"/><circle cx="15" cy="15" r="5.1" fill="#fff8e8"/></svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }


  function buildTencentLayers() {
    const markerStyles = {};
    const kinds = [
      { id: "main", color: "#b64b35", w: 30, h: 38, ax: 15, ay: 38 },
      { id: "campus", color: "#4f6b50", w: 27, h: 34, ax: 13.5, ay: 34 },
      { id: "waypoint", color: "#8f887a", w: 21, h: 27, ax: 10.5, ay: 27 }
    ];
    kinds.forEach(k => {
      markerStyles[`${k.id}-active`] = new window.TMap.MarkerStyle({ width: k.w, height: k.h, anchor: { x: k.ax, y: k.ay }, src: markerDataUrl(k.color) });
      markerStyles[`${k.id}-dim`] = new window.TMap.MarkerStyle({ width: k.w, height: k.h, anchor: { x: k.ax, y: k.ay }, src: markerDataUrl(k.color), opacity: .28 });
    });
    const stageColors = { stage1: "#b64b35", stage2: "#a56b2a", stage3: "#7c4a63", stage4: "#4f6b50", alt: "#3c6b74" };
    const dimColors = { stage1: "rgba(182,75,53,.30)", stage2: "rgba(165,107,42,.30)", stage3: "rgba(124,74,99,.30)", stage4: "rgba(79,107,80,.30)", alt: "rgba(60,107,116,.24)" };
    const lineStyles = {};
    Object.keys(stageColors).forEach(stage => {
      lineStyles[`${stage}-active`] = new window.TMap.PolylineStyle({ color: stageColors[stage], width: 5, borderWidth: 1, borderColor: "#fff3dc" });
      lineStyles[`${stage}-dim`] = new window.TMap.PolylineStyle({ color: dimColors[stage], width: 2, borderWidth: 0 });
    });
    state.markerLayer = new window.TMap.MultiMarker({ map: state.tmap, styles: markerStyles, geometries: [] });
    state.waypointLayer = new window.TMap.MultiMarker({ map: state.tmap, styles: markerStyles, geometries: [] });
    state.lineLayer = new window.TMap.MultiPolyline({ map: state.tmap, styles: lineStyles, geometries: [] });
    state.playbackLayer = new window.TMap.MultiMarker({
      map: state.tmap,
      styles: { traveler: new window.TMap.MarkerStyle({ width: 24, height: 30, anchor: { x: 12, y: 30 }, src: markerDataUrl("#e4b45c") }) },
      geometries: []
    });
    const clickHandler = evt => {
      const id = evt && evt.geometry && evt.geometry.id;
      if (id && nodesById[id]) selectNode(id);
    };
    state.markerLayer.on("click", clickHandler);
    state.waypointLayer.on("click", clickHandler);
    setLayerVisibility();
  }

  function routeStage(route) {
    if (route.kind === "alt") return "alt";
    if (route.id.indexOf("route-west") === 0) return "stage1";
    if (route.id.indexOf("route-return") === 0) return "stage2";
    if (route.id.indexOf("route-east") === 0) return "stage3";
    if (route.id.indexOf("route-recover") === 0) return "stage4";
    return "stage1";
  }

  function syncOverlays(focus = false, cameraDuration = 0) {
    if (!state.tmapReady || !state.markerLayer) return;
    const scene = APP_DATA.scenes[state.sceneIndex];
    const y = state.year;
    const story = state.storyMode;
    // 叙事模式：只显示当前场景相关的节点与路线；自由探索：全部展示；两者均按年份强调（年份内高亮、年份外暗显）
    const sceneIds = new Set();
    const lineScope = new Set();
    if (story) {
      (scene.routes || []).forEach(rid => {
        const r = APP_DATA.routes.find(x => x.id === rid);
        if (r) { r.points.forEach(p => sceneIds.add(p)); lineScope.add(rid); }
      });
      if (scene.nodes && scene.nodes[0]) sceneIds.add(scene.nodes[0]);
    }
    const markerGeoms = [];
    const waypointGeoms = [];
    APP_DATA.nodes.forEach(n => {
      if (story && !sceneIds.has(n.id)) return;
      const inYear = y >= n.years[0] - .55 && y <= n.years[1] + .55;
      // 自由探索：全部地点完整呈现；叙事模式：按年份高亮/暗显
      const active = story ? inYear : true;
      const geo = { id: n.id, styleId: `${n.kind}-${active ? "active" : "dim"}`, position: new window.TMap.LatLng(n.coords[1], n.coords[0]) };
      if (n.kind === "waypoint") waypointGeoms.push(geo); else markerGeoms.push(geo);
    });
    const lineGeoms = APP_DATA.routes.map(route => {
      if (story && !lineScope.has(route.id)) return null;
      const inYear = y >= route.years[0] - .55 && y <= route.years[1] + .55;
      // 自由探索：全部路线完整呈现；叙事模式：播放期间保持粗线、其余按年份高亮/暗显
      const active = story ? (state.timelinePlaying ? true : inYear) : true;
      return {
        id: route.id,
        styleId: `${routeStage(route)}-${active ? "active" : "dim"}`,
        paths: route.points.map(id => {
          const n = nodesById[id];
          return new window.TMap.LatLng(n.coords[1], n.coords[0]);
        })
      };
    }).filter(Boolean);
    const token = ++state.tmapSyncToken;
    const apply = () => {
      if (!state.tmapReady || token !== state.tmapSyncToken) return;
      try {
        state.markerLayer.setGeometries(markerGeoms);
        state.waypointLayer.setGeometries(waypointGeoms);
        state.lineLayer.setGeometries(lineGeoms);
        setLayerVisibility();
      } catch (err) {
        setStatus("路线图层更新失败 · " + err.message, true, "重新配置");
      }
    };
    apply();
    if (focus) {
      const hasMainRoute = (scene.routes || []).some(rid => {
        const r = APP_DATA.routes.find(x => x.id === rid);
        return r && r.kind !== "alt" && r.points.length > 1;
      });
      if (story && hasMainRoute) flyScenePath(scene);
      else focusScene(scene, cameraDuration);
    }
  }

  function setLayerVisibility() {
    if (state.markerLayer) state.markerLayer.setVisible(state.layers.markers);
    if (state.waypointLayer) state.waypointLayer.setVisible(state.layers.waypoints);
    if (state.lineLayer) state.lineLayer.setVisible(state.layers.routes);
    $("#routeLegend").style.display = state.layers.legend ? "" : "none";
  }

  function focusScene(scene, duration = 0) {
    if (!state.tmap) return;
    try {
      let center = null;
      let zoom = null;
      if (scene.tmapView) {
        center = new window.TMap.LatLng(scene.tmapView.center[1], scene.tmapView.center[0]);
        zoom = scene.tmapView.zoom;
      } else if (scene.focus) {
        const b = scene.focus;
        center = new window.TMap.LatLng((b[1] + b[3]) / 2, (b[0] + b[2]) / 2);
        zoom = clamp(10 - Math.log2(Math.max(1.5, b[2] - b[0])), 5.2, 8.8);
      }
      if (!center) return;
      if (duration > 0 && state.tmap.easeTo) {
        state.tmap.easeTo({ center, zoom }, { duration });
      } else {
        state.tmap.setCenter(center);
        state.tmap.setZoom(zoom);
      }
    } catch (e) {}
  }

  function flyScenePath(scene) {
    if (!state.tmap) return;
    const token = ++state.flyToken;
    const mainRoute = (scene.routes || [])
      .map(rid => APP_DATA.routes.find(r => r.id === rid))
      .filter(r => r && r.kind !== "alt" && r.points.length > 1)
      .sort((a, b) => b.points.length - a.points.length)[0];
    let target = null;
    try {
      if (scene.tmapView) {
        target = { center: new window.TMap.LatLng(scene.tmapView.center[1], scene.tmapView.center[0]), zoom: scene.tmapView.zoom };
      } else if (scene.focus) {
        const b = scene.focus;
        target = { center: new window.TMap.LatLng((b[1] + b[3]) / 2, (b[0] + b[2]) / 2), zoom: clamp(10 - Math.log2(Math.max(1.5, b[2] - b[0])), 5.2, 8.8) };
      }
    } catch (e) {}
    const path = mainRoute ? mainRoute.points : [];
    if (!path.length || !target) { focusScene(scene, 900); return; }
    const D = 520, gap = 60;
    let i = 0;
    const step = () => {
      if (token !== state.flyToken) return;
      if (i < path.length) {
        const n = nodesById[path[i]];
        if (n) {
          try { state.tmap.easeTo({ center: new window.TMap.LatLng(n.coords[1], n.coords[0]), zoom: 6.4 }, { duration: D }); } catch (e) {}
        }
        i++;
        state.flyTimer = setTimeout(step, D + gap);
      } else if (target) {
        try { state.tmap.easeTo(target, { duration: D }); } catch (e) {}
      }
    };
    state.flyTimer = setTimeout(step, 40);
  }

  function focusNode(nodeId, duration = 750) {
    if (!state.tmap) return;
    const node = nodesById[nodeId];
    if (!node) return;
    try {
      const center = new window.TMap.LatLng(node.coords[1], node.coords[0]);
      const zoom = node.kind === "main" ? 9.4 : 10;
      if (duration > 0 && state.tmap.easeTo) {
        state.tmap.easeTo({ center, zoom }, { duration });
      } else {
        state.tmap.setCenter(center);
        state.tmap.setZoom(zoom);
      }
    } catch (e) {}
  }

  function showPlaybackStatus(text) {
    $("#playbackText").textContent = text;
    $("#playbackStatus").classList.add("is-visible");
    $("#playbackStatus").setAttribute("aria-hidden", "false");
  }

  function hidePlaybackStatus() {
    $("#playbackStatus").classList.remove("is-visible");
    $("#playbackStatus").setAttribute("aria-hidden", "true");
  }

  function startAutoTour() {
    if (state.autoTour) { stopAutoTour(); return; }
    let start = PLAYBACK_STEPS.findIndex(s => s.scene >= state.sceneIndex);
    if (start < 0) start = 0;
    const steps = PLAYBACK_STEPS.slice(start);
    if (!steps.length) return;
    state.autoTour = true;
    $("#playRouteBtn").textContent = "❚❚ 暂停迁徙";
    let index = 0;
    const run = () => {
      if (!state.autoTour) return;
      if (index >= steps.length) {
        stopAutoTour(true);
        toast("迁徙播放完毕");
        return;
      }
      const step = steps[index++];
      const node = nodesById[step.node];
      if (!node) { state.autoTourTimer = setTimeout(run, 120); return; }
      if (step.scene !== state.sceneIndex) {
        selectScene(step.scene, { auto: true, noCamera: true, focus: false });
      }
      $("#mapSceneLabel").textContent = `迁徙中 · ${node.name}`;
      showPlaybackStatus(`正在前往：${node.name} · ${node.tag}`);
      if (state.playbackLayer) {
        state.playbackLayer.setGeometries([{ id: "traveler", styleId: "traveler", position: new window.TMap.LatLng(node.coords[1], node.coords[0]) }]);
      }
      const zoom = node.kind === "waypoint" ? 7.1 : 7.9;
      try {
        state.tmap.easeTo({ center: new window.TMap.LatLng(node.coords[1], node.coords[0]), zoom }, { duration: 950 });
      } catch (e) {}
      state.autoTourTimer = setTimeout(run, 1180);
    };
    run();
  }

  function stopAutoTour(finished = false) {
    state.autoTour = false;
    clearTimeout(state.autoTourTimer);
    $("#playRouteBtn").textContent = "▶ 播放迁徙";
    if (state.playbackLayer) state.playbackLayer.setGeometries([]);
    hidePlaybackStatus();
    const scene = APP_DATA.scenes[state.sceneIndex];
    $("#mapSceneLabel").textContent = `${scene.no} · ${scene.title.split("：")[0]}`;
  }


  function selectScene(index, opts = {}) {
    if (!opts.auto) stopAutoTour();
    state.sceneIndex = clamp(index, 0, APP_DATA.scenes.length - 1);
    state.selectedNode = null;
    state.tab = "overview";
    const scene = APP_DATA.scenes[state.sceneIndex];
    $$(".scene-pill").forEach((p, i) => p.classList.toggle("is-active", i === state.sceneIndex));
    $("#chapterKicker").textContent = `${scene.no} · ${scene.years}`;
    $("#chapterTitle").textContent = scene.title;
    $("#chapterText").textContent = scene.text;
    $("#chapterQuote").innerHTML = quoteHtml(scene.quote, scene.quoteSource);
    $("#keywordRow").innerHTML = scene.keywords.map(k => `<span class="keyword">${esc(k)}</span>`).join("");
    $("#mapSceneLabel").textContent = `${scene.no} · ${scene.title.split("：")[0]}`;
    $("#chapterProgress").textContent = `${state.sceneIndex + 1} / ${APP_DATA.scenes.length}`;
    $("#prevBtn").disabled = state.sceneIndex === 0;
    $("#nextBtn").textContent = state.sceneIndex === APP_DATA.scenes.length - 1 ? "完成 →" : "下一站 →";
    updateTimeline(sceneYears[scene.id] || APP_DATA.meta.years[0], false);
    renderPanel();
    animatePanelContent();
    $("#panelScroll").scrollTo({ top: 0, behavior: "smooth" });
    if (state.tmapReady) {
      const shouldFocus = !opts.noCamera && (state.storyMode || opts.focus !== false);
      syncOverlays(shouldFocus, shouldFocus ? 1050 : 0);
    }
  }

  function animatePanelContent() {
    const panel = $("#panelScroll");
    panel.classList.remove("is-updating");
    void panel.offsetWidth;
    panel.classList.add("is-updating");
    clearTimeout(animatePanelContent._timer);
    animatePanelContent._timer = setTimeout(() => panel.classList.remove("is-updating"), 420);
  }

  function selectNode(nodeId) {
    stopAutoTour();
    const node = nodesById[nodeId];
    if (!node) return;
    state.selectedNode = nodeId;
    state.tab = "overview";
    $("#mapSceneLabel").textContent = `地点档案 · ${node.name}`;
    syncOverlays(false);
    focusNode(nodeId, 750);
    renderPanel();
    animatePanelContent();
    $("#panelScroll").scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderPanel() {
    const scene = APP_DATA.scenes[state.sceneIndex];
    const node = state.selectedNode ? nodesById[state.selectedNode] : null;
    const hasImages = node
      ? (node.images && node.images.length > 0)
      : (scene.hideSceneImages ? false : scene.nodes.some(id => (nodesById[id].images || []).length > 0));
    if (state.tab === "images" && !hasImages) state.tab = "overview";
    if (node) {
      $("#chapterKicker").textContent = `地点档案 · ${node.period}`;
      $("#chapterTitle").textContent = node.name;
      $("#chapterText").textContent = node.desc;
      $("#chapterQuote").innerHTML = `“${esc(node.tag)}”<small>${esc(node.modern)}</small>`;
      $("#keywordRow").innerHTML = [node.tag, node.period, node.modern].map(k => `<span class="keyword">${esc(k)}</span>`).join("");
    } else {
      $("#chapterKicker").textContent = `${scene.no} · ${scene.years}`;
      $("#chapterTitle").textContent = scene.title;
      $("#chapterText").textContent = scene.text;
      $("#chapterQuote").innerHTML = quoteHtml(scene.quote, scene.quoteSource);
      $("#keywordRow").innerHTML = scene.keywords.map(k => `<span class="keyword">${esc(k)}</span>`).join("");
    }
    $$(".tab").forEach(t => {
      t.classList.toggle("is-active", t.dataset.tab === state.tab);
      t.style.display = (t.dataset.tab === "images" && !hasImages) ? "none" : "";
    });
    $("#tabContent").innerHTML = node ? renderNodeTab(node, state.tab) : renderSceneTab(scene, state.tab);
    bindPanelEvents();
  }

  function renderNodeTab(node, tab) {
    if (tab === "overview") {
      return `
        <div class="detail-meta"><span class="meta-pill">${esc(node.period)}</span><span class="meta-pill">${esc(node.tag)}</span><span class="meta-pill">${esc(node.modern)}</span></div>
        <p class="detail-lead">${esc(node.short)}</p>
        ${renderTimeDetail(node)}
        <div class="event-list">${node.events.slice(0, 3).map(e => `<div class="event-item"><div class="event-date">${esc(e[0])}</div><div class="event-text">${esc(e[1])}</div></div>`).join("")}</div>`;
    }
    if (tab === "events") {
      return `${renderTimeDetail(node)}<div class="event-list">${node.events.length ? node.events.map(e => `<div class="event-item"><div class="event-date">${esc(e[0])}</div><div class="event-text">${esc(e[1])}</div></div>`).join("") : `<p class="empty-note">该节点暂无单独事件条目。</p>`}</div>`;
    }
    if (tab === "people") {
      return node.people.length ? `<div class="people-grid">${node.people.map(name => {
        const p = APP_DATA.people.find(x => x.name === name);
        return p ? `<button class="person-chip" data-person="${p.id}">${esc(name)}<small>${esc(p.role)}</small></button>` : `<span class="person-chip is-static">${esc(name)}</span>`;
      }).join("")}</div>` : `<p class="empty-note">该节点暂未绑定人物条目。</p>`;
    }
    if (tab === "images") {
      if (!node.images || !node.images.length) return `<p class="empty-note">该节点暂无可用图像。可在后续补充旧址照片或档案扫描件。</p>`;
      return `<div class="image-grid">${node.images.map(([src, cap]) => `<button class="image-card" data-image="${esc(src)}" data-caption="${esc(cap)}"><img src="${esc(src)}" alt="${esc(cap)}" loading="lazy"><span>${esc(cap)}</span></button>`).join("")}</div>`;
    }
    return "";
  }

  function renderTimeDetail(node) {
    if (!node.timeDetail) return "";
    return `<div class="time-detail"><h4>时间脉络</h4><p>${esc(node.timeDetail)}</p></div>`;
  }


  function renderSceneTab(scene, tab) {
    const sceneNodes = scene.nodes.map(id => nodesById[id]).filter(Boolean);
    if (tab === "overview") {
      return `
        <div class="detail-meta"><span class="meta-pill">${esc(scene.years)}</span><span class="meta-pill">${sceneNodes.length} 个关键地点</span></div>
        <div class="event-list">${sceneNodes.map(n => `<div class="event-item"><div class="event-date">${esc(n.period)}</div><div class="event-text"><button class="person-chip" data-node="${n.id}">${esc(n.name)}</button> ${esc(n.short)}</div></div>`).join("")}</div>`;
    }
    if (tab === "events") {
      const evs = [];
      sceneNodes.forEach(n => n.events.forEach(e => evs.push([...e, n.name])));
      return `<div class="event-list">${evs.slice(0, 10).map(e => `<div class="event-item"><div class="event-date">${esc(e[0])}</div><div class="event-text"><strong>${esc(e[2])}</strong> · ${esc(e[1])}</div></div>`).join("") || `<p class="empty-note">本章暂无事件条目。</p>`}</div>`;
    }
    if (tab === "people") {
      const names = [...new Set(sceneNodes.flatMap(n => n.people))];
      return names.length ? `<div class="people-grid">${names.map(name => {
        const p = APP_DATA.people.find(x => x.name === name);
        return p ? `<button class="person-chip" data-person="${p.id}">${esc(name)}<small>${esc(p.role)}</small></button>` : `<span class="person-chip is-static">${esc(name)}</span>`;
      }).join("")}</div>` : `<p class="empty-note">本章暂未绑定人物条目。</p>`;
    }
    if (tab === "images") {
      const imgs = [];
      sceneNodes.forEach(n => (n.images || []).forEach(i => imgs.push(i)));
      if (!imgs.length) return `<p class="empty-note">本章暂无图像。</p>`;
      return `<div class="image-grid">${imgs.map(([src, cap]) => `<button class="image-card" data-image="${esc(src)}" data-caption="${esc(cap)}"><img src="${esc(src)}" alt="${esc(cap)}" loading="lazy"><span>${esc(cap)}</span></button>`).join("")}</div>`;
    }
    return "";
  }

  function bindPanelEvents() {
    $$("[data-node]").forEach(b => b.addEventListener("click", () => selectNode(b.dataset.node)));
    $$("[data-person]").forEach(b => b.addEventListener("click", () => { if (b.dataset.person) openPerson(b.dataset.person); }));
    $$("[data-image]").forEach(b => b.addEventListener("click", () => openImage(b.dataset.image, b.dataset.caption)));
  }

  function openPerson(id) {
    const p = peopleById[id];
    if (!p) { toast("该人物条目还在整理中"); return; }
    $("#personDrawerTitle").textContent = p.name;
    $("#personDetail").innerHTML = `
      <div class="person-note"><strong>${esc(p.name)}</strong><em>${esc(p.role)}</em><p>${esc(p.note)}</p></div>
      <h4>关联地点</h4>
      <div class="people-grid">${p.places.map(pid => nodesById[pid] ? `<button class="person-chip" data-place="${pid}">${esc(nodesById[pid].name)}</button>` : "").join("")}</div>
      `;
    $$("#personDetail [data-place]").forEach(b => b.addEventListener("click", () => { selectNode(b.dataset.place); closeAllDrawers(); }));
    openDrawer("personDrawer");
  }

  function openDrawer(id) {
    closeAllDrawers();
    $("#drawerBackdrop").classList.add("is-open");
    const d = $("#" + id);
    d.classList.add("is-open");
    d.setAttribute("aria-hidden", "false");
  }
  function closeAllDrawers() {
    $("#drawerBackdrop").classList.remove("is-open");
    $$(".drawer").forEach(d => { d.classList.remove("is-open"); d.setAttribute("aria-hidden", "true"); });
  }
  function openImage(src, caption) {
    $("#imageModalImg").src = src;
    $("#imageModalCaption").textContent = caption || "";
    $("#imageModalKicker").textContent = "ARCHIVE IMAGE";
    $("#imageModal").classList.add("is-open");
    $("#imageModal").setAttribute("aria-hidden", "false");
  }
  function closeImage() {
    $("#imageModal").classList.remove("is-open");
    $("#imageModal").setAttribute("aria-hidden", "true");
  }

  function openTencentKeyModal(message = "") {
    $("#tencentKeyInput").value = getTencentKey();
    $("#tencentKeyMessage").textContent = message;
    $("#tencentKeyModal").classList.add("is-open");
    $("#tencentKeyModal").setAttribute("aria-hidden", "false");
    setTimeout(() => $("#tencentKeyInput").focus(), 60);
  }
  function closeTencentKeyModal() {
    $("#tencentKeyModal").classList.remove("is-open");
    $("#tencentKeyModal").setAttribute("aria-hidden", "true");
  }
  function saveTencentKey() {
    const key = $("#tencentKeyInput").value.trim();
    if (!key) { $("#tencentKeyMessage").textContent = "请先粘贴有效的腾讯地图 Key。"; return; }
    state.tmapKey = key;
    try { localStorage.setItem("tencentMapKey", key); } catch (e) {}
    closeTencentKeyModal();
    loadTencentSdk();
  }


  function updateTimeline(year, sync = true) {
    state.year = Number(year);
    $("#yearLabel").textContent = Math.floor(state.year);
    $("#yearRange").value = state.year;
    if (sync && state.tmapReady) syncOverlays(false);
  }

  function renderTimeline() {
    $("#timelineTicks").innerHTML = "";
    for (let y = 1937; y <= 1946; y++) {
      const tick = document.createElement("span");
      tick.className = "tick";
      tick.style.left = `${((y - 1937) / 9) * 100}%`;
      tick.textContent = y;
      $("#timelineTicks").appendChild(tick);
    }
    $("#timelineScenes").innerHTML = APP_DATA.scenes.map((s, i) => `<button class="scene-pill ${i === 0 ? "is-active" : ""}" data-scene="${i}">${esc(s.no)} · ${esc(s.title.split("：")[0])}</button>`).join("");
    $$("#timelineScenes [data-scene]").forEach(b => b.addEventListener("click", () => {
      state.storyMode = true;
      syncModeButtons();
      selectScene(Number(b.dataset.scene));
    }));
  }

  function playTimeline() {
    if (state.animating) return;
    state.animating = true;
    state.timelinePlaying = true;
    $("#playBtn").textContent = "❚❚";
    const start = 1937, end = 1946, duration = 12000, t0 = performance.now();
    let lastSync = 0, lastPt = -1;
    const tour = PLAYBACK_STEPS;
    function step() {
      const now = performance.now();
      const t = clamp((now - t0) / duration, 0, 1);
      updateTimeline(start + (end - start) * t, false);
      if (now - lastSync >= 200) {
        lastSync = now;
        const idx = clamp(Math.floor(t * tour.length), 0, tour.length - 1);
        const st = tour[idx];
        if (idx !== lastPt) {
          lastPt = idx;
          const node = nodesById[st.node];
          if (node && state.tmap) {
            try {
              state.tmap.easeTo({ center: new window.TMap.LatLng(node.coords[1], node.coords[0]), zoom: 6.6 }, { duration: 460 });
            } catch (e) {}
          }
        }
        if (st.scene !== state.sceneIndex) selectScene(st.scene, { auto: true, noCamera: true, focus: false });
        else syncOverlays(false);
      }
      if (t < 1) requestAnimationFrame(step);
      else {
        state.animating = false;
        state.timelinePlaying = false;
        $("#playBtn").textContent = "▶";
        updateTimeline(1946, false);
        syncOverlays(false);
        const scene = APP_DATA.scenes[state.sceneIndex];
        if (scene) focusScene(scene, 700);
        toast("时间轴播放完毕");
      }
    }
    requestAnimationFrame(step);
  }

  function syncModeButtons() {
    $("#storyModeBtn").classList.toggle("is-active", state.storyMode);
    $("#freeModeBtn").classList.toggle("is-active", !state.storyMode);
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }

  function setupUI() {
    $("#introCopy").textContent = APP_DATA.meta.intro;
    $("#enterBtn").addEventListener("click", () => {
      $("#intro").classList.add("is-hidden");
      setTimeout(() => {
        selectScene(0, { focus: true });
        if (state.tmap && state.tmap.resize) {
          try { state.tmap.resize(); } catch (e) {}
        }
      }, 320);
    });
    $("#imageBtn").addEventListener("click", () => openImage("assets/route-reference.jpg", "《抗战时期中山大学迁徙路线图》（史料原图）"));
    $("#drawerBackdrop").addEventListener("click", closeAllDrawers);
    $("#storyModeBtn").addEventListener("click", () => { state.storyMode = true; syncModeButtons(); syncOverlays(true, 850); });
    $("#freeModeBtn").addEventListener("click", () => { state.storyMode = false; syncModeButtons(); syncOverlays(false); toast("自由探索：全图展示所有地点与迁徙路线"); });
    $("#prevBtn").addEventListener("click", () => selectScene(state.sceneIndex - 1));
    $("#nextBtn").addEventListener("click", () => {
      if (state.sceneIndex < APP_DATA.scenes.length - 1) selectScene(state.sceneIndex + 1);
      else toast("已到达尾声：地图上的路线会结束，记忆仍在延续");
    });
    $$(".tab").forEach(t => t.addEventListener("click", () => { state.tab = t.dataset.tab; renderPanel(); }));
    $("#yearRange").addEventListener("input", e => updateTimeline(e.target.value, true));
    $("#playBtn").addEventListener("click", playTimeline);
    $("#playRouteBtn").addEventListener("click", startAutoTour);
    $("#currentSceneBtn").addEventListener("click", () => {
      stopAutoTour();
      state.selectedNode = null;
      renderPanel();
      syncOverlays(true, 900);
    });
    $("#layersBtn").addEventListener("click", e => { e.stopPropagation(); $("#layerPop").classList.toggle("is-open"); });
    $$("#layerPop input").forEach(input => input.addEventListener("change", () => {
      state.layers[input.dataset.layer] = input.checked;
      setLayerVisibility();
    }));
    $("#tencentKeyBtn").addEventListener("click", () => openTencentKeyModal("请粘贴腾讯地图 JavaScript API GL 的 Key。"));
    $("#tencentKeySave").addEventListener("click", saveTencentKey);
    $("#tencentKeyInput").addEventListener("keydown", e => { if (e.key === "Enter") saveTencentKey(); });
    $("#mapRetryBtn").addEventListener("click", () => loadTencentSdk());
    $("#tencentKeyModal").addEventListener("click", e => { if (e.target.id === "tencentKeyModal") closeTencentKeyModal(); });
    $("#imageModal").addEventListener("click", e => { if (e.target.id === "imageModal") closeImage(); });
    $$("[data-close]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.close === "imageModal") closeImage();
      else if (b.dataset.close === "tencentKeyModal") closeTencentKeyModal();
      else closeAllDrawers();
    }));
    document.addEventListener("click", e => {
      if (!e.target.closest("#layerPop") && !e.target.closest("#layersBtn")) $("#layerPop").classList.remove("is-open");
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeAllDrawers(); closeImage(); closeTencentKeyModal(); $("#layerPop").classList.remove("is-open"); }
      if ($("#imageModal").classList.contains("is-open") || $("#tencentKeyModal").classList.contains("is-open")) return;
      if (e.key === "ArrowRight" && !e.target.closest("input")) selectScene(state.sceneIndex + 1);
      if (e.key === "ArrowLeft" && !e.target.closest("input")) selectScene(state.sceneIndex - 1);
    });
    window.addEventListener("resize", () => {
      if (state.tmap && state.tmap.resize) {
        clearTimeout(window.__tmapResizeTimer);
        window.__tmapResizeTimer = setTimeout(() => { try { state.tmap.resize(); } catch (e) {} }, 160);
      }
    });
  }

  function init() {
    setupUI();
    renderTimeline();
    updateTimeline(1937, false);
    selectScene(0, { focus: false });
    loadTencentSdk();
    if (new URLSearchParams(location.search).get("skipIntro") === "1") {
      $("#intro").classList.add("is-hidden");
      setTimeout(() => selectScene(0, { focus: true }), 650);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

