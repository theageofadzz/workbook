(() => {
  "use strict";
  const output = document.querySelector("#study");
  const canvas = document.createElement("canvas");
  canvas.width = 1120;
  canvas.height = 840;
  const ctx = canvas.getContext("2d", { alpha: false });
  const data = window.weatherData;
  const names = Object.keys(data.layers);
  const labels = ["纸面", "衣服", "雨伞", "人物", "色块", "天气", "预报"];
  const colors = ["#dceef0", "#93cfe5", "#b7d784", "#23549c", "#e9f35a", "#3b8ac7", "#a8cadc"];
  const ink = "#26312f";
  const muted = "#63726e";
  const blue = "#2469ad";
  const lineColor = "#d1dbd7";
  const images = {};
  const W = 1120;
  const H = 840;
  const D = 16;
  const titles = [
    "先把画面对齐",
    "七层画面，共用一个时钟",
    "把署名与文字放回画面",
    "48 帧，导出一个循环",
    "从作品列表，打开纯净预览",
    "同尺寸检查，再看手机端",
  ];
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const progress = (t, start, end) => smooth((t - start) / (end - start));
  const mix = (a, b, t) => a + (b - a) * t;
  function font(size = 26, weight = 400, mono = false) {
    ctx.font = `${weight} ${size}px ${mono ? "monospace" : "sans-serif"}`;
    ctx.textBaseline = "top";
  }
  function text(value, x, y, size = 26, color = ink, weight = 400, mono = false) {
    ctx.fillStyle = color;
    font(size, weight, mono);
    ctx.fillText(String(value), x, y);
  }
  function rect(x, y, w, h, fill, radius = 0) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }
  function stroke(x, y, w, h, color = lineColor, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(x, y, w, h);
  }
  function line(x1, y1, x2, y2, color = lineColor, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function alpha(amount, callback) {
    ctx.save();
    ctx.globalAlpha = clamp(amount);
    callback();
    ctx.restore();
  }
  function selection(x, y, w, h, color = blue) {
    stroke(x, y, w, h, color, 2);
    for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      rect(px - 4, py - 4, 8, 8, "#fff");
      stroke(px - 4, py - 4, 8, 8, color, 1.5);
    }
  }
  function ruleLabel(label, x = 610, y = 128) {
    text(label, x, y, 25, muted);
    line(x, y + 42, 1072, y + 42);
  }
  function field(label, value, y, active = false) {
    text(label, 610, y + 13, 25, muted);
    rect(794, y, 278, 56, active ? "#e2edf4" : "#fafbf9", 4);
    stroke(794, y, 278, 56, active ? blue : lineColor);
    text(value, 812, y + 14, 25, ink, 400, true);
  }
  function code(lines, x, y, active = -1, width = 462) {
    rect(x, y, width, lines.length * 42 + 34, "#e9eeeb", 4);
    lines.forEach((value, i) => {
      if (i === active) rect(x + 10, y + 12 + i * 42, width - 20, 39, "#d2e5ed", 2);
      text(value, x + 20, y + 18 + i * 42, 23, i === active ? "#145b8e" : "#465c54", 400, true);
    });
  }
  function base(scene, subtitle) {
    rect(0, 0, W, H, "#f3f5f4");
    rect(0, 0, W, 76, "#fafbf9");
    line(0, 76, W, 76);
    text("weather", 36, 24, 26, ink, 600);
    text(titles[scene], 190, 24, 27, ink, 600);
    text("实现解析", 968, 28, 21, muted);
    line(0, 736, W, 736);
    rect(36, 765, 7, 34, "#b5d055", 2);
    text(subtitle, 61, 764, 31, ink, 500);
  }
  function drawLayer(name, index, x, y, size = 518, offset = [0, 0], opacity = 1) {
    const layer = data.layers[name];
    const atlas = layer.atlases.find(page => index >= page.start && index < page.start + page.count);
    const local = index - atlas.start;
    const [cw, ch] = layer.cell;
    const [px, py, width, height] = layer.poses[index];
    alpha(opacity, () => ctx.drawImage(
      images[atlas.src],
      local % atlas.columns * cw,
      Math.floor(local / atlas.columns) * ch,
      width, height,
      x + (px + offset[0]) * size / 518,
      y + (py + offset[1]) * size / 518,
      width * size / 518,
      height * size / 518,
    ));
  }
  function art(index = 18, x = 44, y = 126, size = 518, options = {}) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 6);
    ctx.clip();
    for (const name of names) {
      if (options.skip?.includes(name)) continue;
      drawLayer(name, index, x, y, size, options.offsets?.[name] || [0, 0], options.opacity?.[name] ?? 1);
    }
    ctx.restore();
  }
  function image(name, x, y, width, height) {
    ctx.drawImage(images[name], x, y, width, height);
  }
  function cursor(x, y, t, clicks = []) {
    for (const click of clicks) {
      const age = t - click;
      if (age >= 0 && age < 0.7) {
        alpha((1 - age / 0.7) * 0.7, () => {
          ctx.strokeStyle = blue;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, y, 8 + age * 46, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
    }
    const pressing = clicks.some(click => t >= click && t < click + 0.18);
    ctx.save();
    ctx.translate(x - 6, y - 6);
    ctx.scale(pressing ? 1.16 : 1.3, pressing ? 1.16 : 1.3);
    ctx.drawImage(images.cursor, 0, 0, 30, 30, 0, 0, 30, 30);
    ctx.restore();
    const labelX = Math.min(x + 24, W - 104);
    rect(labelX, y + 38, 84, 31, "#26312f", 5);
    text("cicada", labelX + 11, y + 44, 20, "#fff");
  }
  function pointerAt(t, points) {
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1];
      const next = points[i];
      if (t <= next[0]) {
        const p = progress(t, previous[0], next[0]);
        return [mix(previous[1], next[1], p), mix(previous[2], next[2], p)];
      }
    }
    return points.at(-1).slice(1);
  }
  function pointer(t, points, clicks = []) {
    const [x, y] = pointerAt(t, points);
    cursor(x, y, t, clicks);
  }
  function label(value, x, y, width = 150, color = blue) {
    rect(x, y, width, 37, "#f3f7f8", 3);
    stroke(x, y, width, 37, "#bad3df");
    text(value, x + 10, y + 8, 21, color, 400, true);
  }
  function check(labelText, x, y, active) {
    const color = active ? "#3e7045" : "#9aa9a2";
    stroke(x, y, 24, 24, color, 2);
    if (active) {
      line(x + 5, y + 12, x + 10, y + 18, color, 2.5);
      line(x + 10, y + 18, x + 20, y + 6, color, 2.5);
    }
    text(labelText, x + 40, y - 1, 26, active ? ink : muted);
  }
  function filmstrip(y, index, selected = false) {
    for (let i = 0; i < 6; i++) {
      const x = 44 + i * 92;
      art(i * 8, x, y, 80);
      if (selected || i === Math.min(5, Math.floor(index / 8))) stroke(x - 2, y - 2, 84, 84, blue, 2);
      text(`${(i * 0.64).toFixed(2)}`, x + 10, y + 88, 19, muted, 400, true);
    }
  }

  function alignment(t) {
    const drag = progress(t, 4.8, 6.5);
    const dx = 36 * (1 - drag);
    const dy = -20 * (1 - drag);
    const subtitle = t < 3.5 ? "先固定 518 × 518，所有位置都用同一套坐标。"
      : t < 9.5 ? "选中雨伞，把它移动到记录的位置。"
        : "再逐一核对色块、文字和右侧面板的间距。";
    base(0, subtitle);
    line(44, 108, 562, 108, "#a2b5ac");
    line(28, 126, 28, 644, "#a2b5ac");
    for (let p = 0; p <= 500; p += 100) {
      line(44 + p, 102, 44 + p, 114, "#8eaaa0");
      line(22, 126 + p, 34, 126 + p, "#8eaaa0");
    }
    text("0", 44, 82, 17, muted, 400, true);
    text("518", 520, 82, 17, muted, 400, true);
    art(18, 44, 126, 518, { offsets: { umbrella: [dx, dy] } });
    ruleLabel("画布 / Canvas");
    field("宽度", "518 px", 192, t < 2);
    field("高度", "518 px", 264, t >= 2 && t < 3.5);
    ruleLabel(t < 9.5 ? "选中图层 / umbrella" : "选中图层 / palette", 610, 366);
    if (t < 9.5) {
      field("X", `${Math.round(50 + dx)} px`, 425, t >= 4);
      field("Y", `${Math.round(162 + dy)} px`, 497, t >= 4);
      field("尺寸", "320 × 306", 569);
      if (t > 3.5) {
        selection(94 + dx, 288 + dy, 320, 306);
        label(`x ${Math.round(50 + dx)}  y ${Math.round(162 + dy)}`, 104 + dx, 246 + dy, 202);
      }
      if (t > 6.5) {
        alpha(0.55, () => {
          line(94, 126, 94, 650, blue);
          line(44, 288, 562, 288, blue);
        });
      }
    } else {
      field("X / Y", "356 / 34", 425);
      field("尺寸", "123 × 192", 497, true);
      text("保留原图的线条与颗粒", 610, 593, 25, muted);
      selection(400, 160, 123, 192);
      label("x 356  y 34", 346, 364, 188);
    }
    pointer(t, [
      [0, 1038, 680], [0.8, 918, 218], [1.8, 918, 218], [2.5, 918, 292],
      [3.5, 918, 292], [4.1, 276, 380], [4.8, 276, 380], [6.5, 240, 400],
      [8.8, 240, 400], [10, 454, 254], [12.6, 454, 254], [13.5, 927, 524], [16, 927, 524],
    ], [0.9, 2.6, 4.2, 10.1]);
  }

  function layers(t) {
    const atlasMode = t >= 9;
    const frame = t < 4 ? 18 : Math.min(47, Math.floor((t - 4) * 12.5) % 48);
    base(1, t < 4 ? "七层分别保存，鼠标点选时只改变对应图层。"
      : t < 9 ? "七层读取同一个帧号，动作就不会互相错位。"
        : "从图集裁出当前一格，再画回记录的位置。");
    if (!atlasMode) {
      art(frame, 44, 126, 518, { skip: t >= 1.8 && t < 3.1 ? ["umbrella"] : [] });
      ruleLabel("图层 / Layers");
      names.forEach((name, i) => {
        const y = 190 + i * 61;
        if (i === 2) rect(600, y - 8, 482, 55, "#e3edf0", 4);
        const enabled = !(i === 2 && t >= 1.8 && t < 3.1);
        stroke(613, y + 6, 22, 22, enabled ? blue : lineColor, 1.5);
        if (enabled) rect(618, y + 11, 12, 12, blue, 2);
        rect(653, y + 4, 25, 25, colors[i], 3);
        text(labels[i], 696, y + 2, 25);
        text(name, 816, y + 4, 23, muted, 400, true);
      });
      line(44, 687, 1072, 687, "#adc0b4", 2);
      for (let i = 0; i < 48; i++) line(44 + i * 21.87, 679, 44 + i * 21.87, i % 8 === 0 ? 704 : 695, lineColor);
      const head = 44 + frame / 47 * 1028;
      line(head, 672, head, 710, blue, 3);
      rect(head - 5, 667, 10, 12, "#d1df54", 2);
      label(`frame ${String(frame).padStart(2, "0")} / 47`, 385, 637, 233);
      pointer(t, [
        [0, 1034, 680], [1.1, 624, 318], [1.8, 624, 318], [3.1, 624, 318],
        [3.6, 624, 318], [4, 44, 687], [7.76, 1072, 687], [9, 1072, 687],
      ], [1.8, 3.1]);
    } else {
      ruleLabel("umbrella 图集 · 48 格", 44, 116);
      const ax = 44, ay = 193, aw = 518, ah = 372;
      rect(ax, ay, aw, ah, "#e1eae7", 4);
      const atlas = data.layers.umbrella.atlases[0];
      image(atlas.src, ax, ay, aw, ah);
      const cellW = aw / 8, cellH = ah / 6;
      selection(ax + frame % 8 * cellW, ay + Math.floor(frame / 8) * cellH, cellW, cellH);
      ruleLabel(`当前帧 / ${String(frame).padStart(2, "0")}`, 610, 116);
      art(frame, 660, 193, 330);
      selection(660 + data.layers.umbrella.poses[frame][0] * 330 / 518,
        193 + data.layers.umbrella.poses[frame][1] * 330 / 518,
        data.layers.umbrella.poses[frame][2] * 330 / 518,
        data.layers.umbrella.poses[frame][3] * 330 / 518);
      code(["frame = floor(time / 80)", "cell = atlas[frame]", "drawImage(cell, x, y)"], 610, 554, 2);
      text("每格 320 × 306 px", 44, 598, 25, muted);
      text("所有图层重复同一取帧步骤", 44, 645, 25, muted);
      pointer(t, [[9, 1040, 687], [9.8, 268, 360], [11.6, 414, 451], [12.5, 823, 394], [14.5, 844, 663], [16, 844, 663]], [12.5]);
    }
  }

  function typography(t) {
    const final = progress(t, 3.2, 4);
    base(2, t < 5.5 ? "署名替换成 cicada，继续保留画面里的手绘字形。"
      : t < 11 ? "删除重复的繁体项，留下四种写法。"
        : "对齐基线与间距，再写回画面素材。");
    image("reference", 44, 126, 518, 518);
    alpha(final, () => image("final", 44, 126, 518, 518));
    ruleLabel("文字 / Typography");
    field("署名", t < 2.7 ? "SHIROTA." : t < 3.2 ? "cica" : "cicada", 192, t < 5.5);
    field("呈现方式", "图像素材", 264);
    selection(258, 612, 101, 27);
    if (t >= 5.5) selection(99, 565, 236, 26);
    ruleLabel("语言 / 雨", 610, 366);
    const words = ["雨", "雨（繁体）", "rain", "あめ", "비"];
    const deleting = progress(t, 7.1, 7.7);
    words.forEach((word, i) => {
      const removed = i === 1;
      const y = 423 + i * 48 - (i > 1 ? deleting * 48 : 0);
      alpha(removed ? 1 - deleting : 1, () => {
        if (removed && t >= 6.4) rect(603, y - 7, 470, 43, "#e5e9e3", 3);
        text(word, 626, y, 26, ink);
        if (removed && t >= 6.4) text("×", 1020, y - 2, 30, "#8e5148");
      });
    });
    if (t > 10.5) {
      rect(44, 469, 518, 175, "#e6efec", 3);
      ctx.drawImage(images.final, 42, 424, 437, 94, 44, 488, 518, 112);
      line(73, 538, 345, 538, blue, 1.5);
      for (const x of [92, 150, 220, 294]) line(x, 528, x, 547, blue);
      label("baseline", 384, 610, 136);
      text("雨    rain    あめ    비", 626, 641, 25, blue);
    }
    pointer(t, [
      [0, 1022, 675], [0.8, 309, 623], [1.8, 309, 623], [2.5, 931, 221],
      [4.5, 931, 221], [6.4, 1030, 473], [7.1, 1030, 473],
      [9.5, 1030, 473], [10.8, 290, 537], [13, 127, 537], [14.5, 298, 623], [16, 298, 623],
    ], [0.9, 2.6, 7.1]);
  }

  function gif(t) {
    const frame = Math.floor(Math.max(0, t - 7.6) * 12.5) % 48;
    base(3, t < 5 ? "把 48 帧按顺序排列，每帧保留 80 毫秒。"
      : t < 9 ? "写入无限循环参数，得到 weather.gif。"
        : "网页只放图片，GIF 自己循环播放。");
    art(frame);
    ruleLabel("导出 / GIF");
    field("帧数", "48 frames", 192, t < 2.6);
    field("帧间隔", "80 ms", 264, t >= 2.6 && t < 4.8);
    field("循环", "0 / 无限", 336, t >= 4.8 && t < 6.7);
    field("总时长", "3.84 s", 408);
    if (t < 8.6) {
      const selected = t >= 1.8;
      filmstrip(600, frame, selected);
      rect(610, 513, 462, 70, t >= 6.8 ? "#d2e4cc" : "#e3eced", 4);
      text(t >= 7.7 ? "weather.gif  已生成" : "导出 weather.gif", 652, 535, 28, "#365c4a", 500);
      if (t >= 7.7) text("48 × 80 ms = 3840 ms", 610, 623, 25, muted, 400, true);
    } else {
      code(["<img", '  src="weather.gif"', '  alt="weather"', ">"], 610, 510, 1);
      label(`frame ${String(frame).padStart(2, "0")}`, 430, 659, 132);
    }
    pointer(t, [
      [0, 1042, 682], [1, 80, 642], [1.8, 80, 642], [2.5, 536, 642],
      [3.5, 920, 293], [4.6, 920, 293], [5.3, 927, 364],
      [6.3, 927, 364], [6.8, 834, 546], [8.5, 834, 546],
      [10, 801, 574], [12.5, 463, 402], [16, 463, 402],
    ], [3.6, 5.4, 6.9]);
  }

  function preview(t) {
    const open = progress(t, 3, 3.55) * (1 - progress(t, 10.8, 11.25));
    const frame = Math.floor(t * 12.5) % 48;
    base(4, t < 3 ? "作品列表保留名称和日期，点击进入预览。"
      : t < 10.8 ? "弹层只放 GIF，关闭按钮在画面外围。"
        : "先播放退出动画，再关闭弹层并还原焦点。");
    rect(44, 126, 518, 544, "#fafbf9", 4);
    text("作品", 76, 154, 30, ink, 600);
    art(18, 100, 214, 258);
    text("weather", 100, 505, 29, ink, 500);
    text("2026-11-07", 100, 550, 24, muted, 400, true);
    text("查看", 415, 549, 25, blue);
    ruleLabel("打开 / Close");
    code(["dialog.showModal()", "", "退出动画播放完", "dialog.close()", "", "入口.focus()"], 610, 191, t < 10.8 ? 0 : 3);
    check("只显示 GIF", 618, 522, t >= 3);
    check("关闭按钮位于外围", 618, 580, t >= 4.5);
    check("关闭后回到入口", 618, 638, t >= 11.25);
    if (open > 0) {
      alpha(open, () => {
        rect(44, 126, 518, 544, "#dbe2de", 4);
        ctx.save();
        const scale = mix(0.85, 1, open);
        ctx.translate(303, 392 + (1 - open) * 22);
        ctx.scale(scale, scale);
        art(frame, -211, -211, 422);
        ctx.restore();
        rect(510, 138, 36, 36, "#f6f8f5", 18);
        line(521, 149, 535, 163, ink, 2);
        line(535, 149, 521, 163, ink, 2);
      });
    }
    if (t > 5.3 && t < 9.5) {
      line(514, 173, 462, 188, blue, 1.5);
      label("外围关闭", 349, 138, 140);
    }
    if (t > 11.25) selection(402, 539, 69, 45);
    pointer(t, [
      [0, 1065, 674], [1.4, 234, 354], [2.6, 234, 354], [3, 234, 354],
      [4.5, 234, 354], [5.3, 529, 157], [8.4, 529, 157],
      [9.6, 529, 157], [10.8, 529, 157], [12, 436, 559], [16, 436, 559],
    ], [3, 10.8]);
  }

  function verify(t) {
    const p = progress(t, 1.8, 5);
    const frame = Math.floor((t - 6) * 12.5 + 480) % 48;
    base(5, t < 6 ? "参考与复刻用相同尺寸，逐处检查轮廓和间距。"
      : t < 10.5 ? "再顺着关键帧，检查展开节奏和首尾衔接。"
        : "最后检查手机布局、素材加载与打开关闭。");
    if (t < 6) {
      image("reference", 44, 126, 518, 518);
      ctx.save();
      ctx.beginPath();
      ctx.rect(44 + p * 518, 126, 518 * (1 - p), 518);
      ctx.clip();
      image("final", 44, 126, 518, 518);
      ctx.restore();
      line(44 + p * 518, 126, 44 + p * 518, 644, "#f2f58b", 3);
      rect(44 + p * 518 - 13, 365, 26, 40, "#f2f58b", 4);
      ruleLabel("同尺寸对照");
      field("参考", "518 × 518", 192);
      field("复刻", "518 × 518", 264);
      check("雨伞轮廓", 618, 405, t >= 2);
      check("右侧面板位置", 618, 466, t >= 3.2);
      check("底部文字间距", 618, 527, t >= 4.8);
      text("视觉对齐，不标注零误差", 610, 625, 25, muted);
      pointer(t, [[0, 1035, 687], [1.8, 44, 385], [5, 562, 385], [6, 562, 385]], [1.8]);
    } else if (t < 10.5) {
      art(frame);
      ruleLabel("逐帧检查");
      field("帧号", `${String(frame).padStart(2, "0")} / 47`, 192, true);
      field("时间", `${(frame * 0.08).toFixed(2)} s`, 264);
      code(["雨伞展开", "温度 / 云朵同步", "首尾衔接"], 610, 392, Math.floor((t - 6) / 1.5));
      filmstrip(603, frame);
      pointer(t, [[6, 44, 643], [9.8, 536, 643], [10.5, 536, 643]]);
    } else {
      rect(172, 110, 268, 588, "#354b44", 28);
      rect(181, 120, 250, 568, "#fafbf9", 22);
      rect(257, 128, 100, 17, "#354b44", 9);
      text("weather", 202, 169, 23, ink, 600);
      art(frame, 194, 218, 224);
      text("先把画面对齐", 201, 471, 24, ink, 600);
      line(201, 520, 410, 520);
      line(201, 536, 389, 536);
      line(201, 552, 398, 552);
      art(18, 201, 578, 74);
      ruleLabel("手机端 / 390 px");
      check("没有横向溢出", 618, 221, t >= 10.8);
      check("画面完整", 618, 290, t >= 11.7);
      check("鼠标与文字清晰", 618, 359, t >= 12.6);
      check("打开与关闭正常", 618, 428, t >= 13.5);
      check("素材与链接可用", 618, 497, t >= 14.4);
      text("完成后再发布到 GitHub", 610, 625, 27, "#3e7045", 500);
      pointer(t, [[10.5, 536, 643], [11.3, 337, 356], [12.6, 337, 356], [13.4, 631, 440], [15, 631, 509], [16, 631, 509]]);
    }
  }

  const scenes = [alignment, layers, typography, gif, preview, verify];
  function draw(time, waitForImage = false) {
    ctx.clearRect(0, 0, W, H);
    const index = Math.min(5, Math.floor(time / D));
    const t = time - index * D;
    scenes[index](t);
    output.dataset.scene = String(index);
    output.dataset.time = t.toFixed(3);
    const bitmap = canvas.toDataURL("image/png");
    if (output.src !== bitmap) output.src = bitmap;
    if (waitForImage) {
      return output.decode().catch(error => {
        if (output.src === bitmap) throw error;
      });
    }
  }
  async function prepare() {
    const urls = Object.values(data.layers).flatMap(layer => layer.atlases.map(atlas => atlas.src));
    const sources = [...urls.map(url => [url, url]), ["cursor", "assets/cursor.svg"], ["reference", "assets/reference.webp"], ["final", "assets/final.webp"]];
    await Promise.all(sources.map(async ([name, url]) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      images[name] = img;
    }));
    await document.fonts.ready;
    let currentTime = 0;
    // Render through the property setter so seeking with callbacks suppressed still paints.
    const state = Object.defineProperty({}, "time", {
      get: () => currentTime,
      set: value => { currentTime = value; draw(value); },
    });
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(state, { time: 0 }, {
      time: 96, duration: 96, ease: "none",
    }, 0);
    await draw(0, true);
    window.addEventListener("hf-seek", event => event.detail.waitUntil(draw(event.detail.time, true)));
    window.__weatherStudy = { draw, scenes, data };
    window.__timelines["weather-tutorial"] = tl;
  }
  prepare();
})();
